import type { Client } from '@libsql/client';

/**
 * Making a tenant's columns match what the migrations say, whatever the
 * version counter believes.
 *
 * The migration runner walks `migrations.slice(appliedCount)` and swallows
 * every statement's error, because an `ALTER TABLE ... ADD COLUMN` on a
 * database that already has the column is expected to fail and is not worth
 * reporting. The cost of that is it cannot tell "already applied" from
 * "failed": a transient error on one statement looks exactly like success,
 * the version advances past it on the next checkpoint, and the column is
 * missing for the life of that database. Nothing retries, because the counter
 * says the work is done.
 *
 * That is not hypothetical — `attendees.crm_contact_link` went missing on a
 * live tenant this way, and every attendee edit failed with "no such column"
 * while the version said the schema was current.
 *
 * So the columns are reconciled against what the migrations DECLARE rather
 * than against a count of how many ran. Derived from the migration list
 * itself, so it covers every column ever added by an ALTER and cannot drift
 * from it the way a hand-kept list would — see ensureConfigOptionsColumns,
 * which is this idea for one table.
 */

export interface AddedColumn { table: string; column: string; sql: string }

/**
 * Every column the migrations add with an ALTER, parsed out of them.
 *
 * Only `ALTER TABLE ... ADD COLUMN`. A column introduced by a CREATE TABLE is
 * not reconcilable this way — the table either exists with it or does not
 * exist at all — and the runner's CREATE TABLE IF NOT EXISTS statements
 * already converge.
 */
export function declaredAddedColumns(migrations: readonly string[]): AddedColumn[] {
  /*
   * The column name is optionally quoted.
   *
   * No migration in the list quotes one today — `attendees.function` is a
   * reserved word and is still declared bare, because SQLite accepts it in
   * that position. The branch is here so that one written the other way is
   * repaired rather than silently skipped, which is the failure this whole
   * file exists to prevent. It is covered by a synthetic case in the test;
   * nothing in the real list exercises it.
   */
  const re = /^\s*ALTER\s+TABLE\s+([A-Za-z_][A-Za-z0-9_]*)\s+ADD\s+COLUMN\s+(?:"([^"]+)"|([A-Za-z_][A-Za-z0-9_]*))/i;
  const seen = new Set<string>();
  const out: AddedColumn[] = [];
  for (const sql of migrations) {
    const m = re.exec(sql);
    if (!m) continue;
    const table = m[1];
    const column = m[2] ?? m[3];
    const key = `${table}.${column}`;
    // The same column added twice in the list is one column.
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ table, column, sql });
  }
  return out;
}

/** Group by table, so each table is read once rather than once per column. */
function byTable(columns: AddedColumn[]): Map<string, AddedColumn[]> {
  const map = new Map<string, AddedColumn[]>();
  for (const c of columns) map.set(c.table, [...(map.get(c.table) ?? []), c]);
  return map;
}

export interface ReconcileResult {
  /** Columns that were missing and have been added. */
  added: string[];
  /** Columns still missing after the attempt — the database is not converged. */
  failed: string[];
}

/**
 * Add any declared column the database does not have.
 *
 * Tables that do not exist here are skipped rather than created: a tenant on
 * an older schema has its CREATE TABLE migrations still pending, and adding a
 * column to a table that is about to be created would be the wrong order.
 *
 * Returns what it did. The caller stamps the database as reconciled only when
 * `failed` is empty, so a transient error means this runs again next time
 * rather than being recorded as done — which is the defect this exists to
 * correct, and it would be a poor joke to reproduce it here.
 */
export async function reconcileColumns(
  client: Client,
  migrations: readonly string[],
): Promise<ReconcileResult> {
  const added: string[] = [];
  const failed: string[] = [];

  for (const [table, columns] of Array.from(byTable(declaredAddedColumns(migrations)))) {
    const info = await client.execute({ sql: `PRAGMA table_info(${table})`, args: [] })
      .catch(() => null);
    // No rows means no such table here. Not an error, and not ours to fix.
    if (!info || info.rows.length === 0) continue;
    const have = new Set(info.rows.map(r => String(r.name)));

    const missing = columns.filter(c => !have.has(c.column));
    if (missing.length === 0) continue;

    for (const c of missing) {
      const ok = await client.execute({ sql: c.sql, args: [] })
        .then(() => true)
        .catch(() => false);
      (ok ? added : failed).push(`${c.table}.${c.column}`);
    }
  }
  return { added, failed };
}

/** The marker row, so a converged database is not re-read on every cold start. */
const STAMP_TABLE = '_schema_reconciled';

/**
 * Reconcile once per database per change to the migration list.
 *
 * The full pass is one read per table — a few dozen round trips — which is
 * not something to do on every request. The stamp records the migration count
 * the database was last reconciled against, so it runs again whenever a
 * deployment adds migrations and not otherwise.
 *
 * Stamped only on a clean pass. A database that could not be brought up to
 * date is left unstamped and tried again.
 */
export async function reconcileOnce(
  client: Client,
  migrations: readonly string[],
): Promise<ReconcileResult | null> {
  await client.execute({
    sql: `CREATE TABLE IF NOT EXISTS ${STAMP_TABLE} (version INTEGER NOT NULL DEFAULT 0)`,
    args: [],
  }).catch(() => {});

  const row = await client.execute({ sql: `SELECT version FROM ${STAMP_TABLE} LIMIT 1`, args: [] })
    .catch(() => ({ rows: [] as Record<string, unknown>[] }));
  const stamped = row.rows.length > 0 ? Number(row.rows[0].version) : -1;
  if (stamped === migrations.length) return null;

  const result = await reconcileColumns(client, migrations);

  if (result.failed.length === 0) {
    if (row.rows.length > 0) {
      await client.execute({ sql: `UPDATE ${STAMP_TABLE} SET version = ?`, args: [migrations.length] }).catch(() => {});
    } else {
      await client.execute({ sql: `INSERT INTO ${STAMP_TABLE} (version) VALUES (?)`, args: [migrations.length] }).catch(() => {});
    }
  }

  // Worth a line in the log: a column that had to be repaired here is one the
  // version counter already claimed was applied.
  if (result.added.length > 0) {
    console.log(`[schema-reconcile] added ${result.added.length} missing column(s): ${result.added.join(', ')}`);
  }
  if (result.failed.length > 0) {
    console.error(`[schema-reconcile] could not add: ${result.failed.join(', ')} — will retry`);
  }
  return result;
}
