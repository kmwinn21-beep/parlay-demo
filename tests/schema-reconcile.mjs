/**
 * Columns that the version counter says were applied, and were not.
 *
 *   node --experimental-strip-types --import ./tests/register-ts.mjs \
 *        tests/schema-reconcile.mjs
 *
 * The migration runner walks `migrations.slice(appliedCount)` and swallows
 * every statement's error, because an ALTER adding a column that is already
 * there is expected to fail. The price is that it cannot tell that from a
 * real failure: a transient error looks like success, the checkpoint moves
 * past it, and the column is gone for the life of that database with nothing
 * left to retry it.
 *
 * `attendees.crm_contact_link` went missing on a live tenant exactly this way
 * — every attendee edit failed with "no such column" while `_schema_version`
 * said the schema was current.
 *
 * So this is RUN against a real SQLite database put into that state: version
 * stamped as fully migrated, column absent. Reading the source cannot tell
 * you whether the repair converges.
 *
 * Exits non-zero on the first failing expectation, so it can gate a build.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';

let pass = 0;
let fail = 0;
const eq = (label, got, want) => {
  const g = JSON.stringify(got);
  const w = JSON.stringify(want);
  if (g === w) { pass++; console.log(`  ok   ${label}`); }
  else { fail++; console.log(`  FAIL ${label}\n       got  ${g}\n       want ${w}`); }
};

const envDir = mkdtempSync(join(tmpdir(), 'reconcile-env-'));
process.env.TURSO_DATABASE_URL = `file:${join(envDir, 'master.db')}`;
process.env.TURSO_AUTH_TOKEN = '';

const { declaredAddedColumns, reconcileColumns, reconcileOnce } =
  await import('@/lib/schemaReconcile');
const { migrations } = await import('@/lib/db-migrations');

const require_ = createRequire(process.cwd() + '/package.json');
const { createClient } = require_('@libsql/client');
const dir = mkdtempSync(join(tmpdir(), 'reconcile-'));
const db = createClient({ url: `file:${join(dir, 'fx.db')}` });
const cols = async (t) =>
  (await db.execute(`PRAGMA table_info(${t})`)).rows.map(r => String(r.name));

console.log('\n— what the migrations declare —');
{
  const declared = declaredAddedColumns(migrations);
  /*
   * Every ALTER in the list is parsed — none silently skipped.
   *
   * Compared as a SET rather than a count: `conference_forms.public_token` is
   * declared twice in the real list, and a count would read that duplicate as
   * a parse miss. A miss is the failure that matters here, because an
   * unparsed ALTER is a column this can never repair.
   */
  const raw = migrations.filter(m => /ALTER\s+TABLE[\s\S]*ADD\s+COLUMN/i.test(m));
  const rawKeys = new Set(raw.map(m => {
    const x = /^\s*ALTER\s+TABLE\s+([A-Za-z_][A-Za-z0-9_]*)\s+ADD\s+COLUMN\s+(?:"([^"]+)"|([A-Za-z_][A-Za-z0-9_]*))/i.exec(m);
    return x ? `${x[1]}.${x[2] ?? x[3]}` : `UNPARSED: ${m.slice(0, 60)}`;
  }));
  eq('no ALTER ... ADD COLUMN goes unparsed',
    Array.from(rawKeys).filter(k => k.startsWith('UNPARSED')), []);
  eq('  and every one of them is declared',
    Array.from(rawKeys).filter(k => !declared.some(c => `${c.table}.${c.column}` === k)), []);
  // The duplicate collapses, which is why the count is one short of the raw.
  eq('  with the duplicate collapsed', declared.length, rawKeys.size);
  eq('    one short of the raw count', raw.length - declared.length, 1);

  const attendees = declared.filter(c => c.table === 'attendees').map(c => c.column);
  eq('the column that went missing is among them',
    attendees.includes('crm_contact_link'), true);
  // `function` is a reserved word, and is declared BARE — SQLite takes it in
  // that position. Pinned because reading the routes, which quote it in their
  // UPDATE statements, suggests otherwise.
  eq('  the reserved word is declared bare and still parses',
    attendees.includes('function'), true);
  eq('    with no migration quoting a column today',
    migrations.some(m => /ADD COLUMN\s+["`[]/.test(m)), false);
  /*
   * A quoted declaration still parses, though none exists yet.
   *
   * Synthetic rather than pretending the real list covers it: an unquoted-only
   * parse reads `"col"` as no match at all and skips the migration, so the
   * column would never be repaired. Cheap to support, silent if dropped.
   */
  eq('    and one written that way would still be read',
    declaredAddedColumns(['ALTER TABLE t ADD COLUMN "select" TEXT']),
    [{ table: 't', column: 'select', sql: 'ALTER TABLE t ADD COLUMN "select" TEXT' }]);
  // Optional: an unquoted-only parse returns nothing here, and indexing [0]
  // would throw before the remaining assertions ran.
  eq('      with the quotes stripped from the name',
    declaredAddedColumns(['ALTER TABLE t ADD COLUMN "x" TEXT'])[0]?.column, 'x');

  // A column added by a CREATE TABLE is not reconcilable this way and is not
  // claimed to be: the table either exists with it or does not exist.
  eq('a CREATE TABLE column is not claimed',
    declared.some(c => c.column === 'id'), false);

  // The same column added twice in the list is one column.
  eq('a column declared twice is listed once',
    declaredAddedColumns([
      'ALTER TABLE t ADD COLUMN c TEXT', 'ALTER TABLE t ADD COLUMN c TEXT',
    ]).length, 1);
}

console.log('\n— the live failure, reproduced and repaired —');
{
  /*
   * The tenant's state: an attendees table missing crm_contact_link, with the
   * version counter claiming every migration has been applied.
   */
  await db.execute(`CREATE TABLE attendees (
    id INTEGER PRIMARY KEY AUTOINCREMENT, first_name TEXT, last_name TEXT,
    title TEXT, email TEXT, phone TEXT, linkedin_url TEXT
  )`);
  await db.execute(`CREATE TABLE _schema_version (version INTEGER NOT NULL DEFAULT 0)`);
  await db.execute({ sql: `INSERT INTO _schema_version (version) VALUES (?)`, args: [migrations.length] });

  eq('the column starts missing', (await cols('attendees')).includes('crm_contact_link'), false);
  // The write the UI makes, failing the way the tenant's did.
  const before = await db.execute({
    sql: `UPDATE attendees SET crm_contact_link = ? WHERE id = 1`, args: ['x'],
  }).then(() => 'ok').catch(e => String(e.message || e));
  eq('  and the attendee update fails on it', /no such column/.test(before), true);

  const result = await reconcileColumns(db, migrations);
  eq('the repair adds it', result.added.includes('attendees.crm_contact_link'), true);
  eq('  with nothing left failing', result.failed, []);
  eq('  and the column is there', (await cols('attendees')).includes('crm_contact_link'), true);

  // The write now succeeds, which is the thing the tenant actually needed.
  const after = await db.execute({
    sql: `UPDATE attendees SET crm_contact_link = ? WHERE id = 1`, args: ['x'],
  }).then(() => 'ok').catch(e => String(e.message || e));
  eq('  so the attendee update works', after, 'ok');

  // Every other declared attendees column lands too, not just the one looked for.
  const have = new Set(await cols('attendees'));
  const wanted = declaredAddedColumns(migrations).filter(c => c.table === 'attendees');
  eq('  along with every other declared column on that table',
    wanted.filter(c => !have.has(c.column)).map(c => c.column), []);
}

console.log('\n— tables this database does not have —');
{
  /*
   * A tenant on an older schema still has CREATE TABLE migrations pending.
   * Adding a column to a table that is about to be created is the wrong
   * order, so a missing table is skipped rather than an error.
   */
  const r = await reconcileColumns(db, ['ALTER TABLE nonexistent_table ADD COLUMN c TEXT']);
  eq('a missing table is skipped, not failed', r, { added: [], failed: [] });
  eq('  and is not created on the way past',
    (await db.execute(`SELECT name FROM sqlite_master WHERE name = 'nonexistent_table'`)).rows.length, 0);
}

console.log('\n— it runs once, but only when it converged —');
{
  const d2 = mkdtempSync(join(tmpdir(), 'reconcile2-'));
  const db2 = createClient({ url: `file:${join(d2, 'fx.db')}` });
  await db2.execute(`CREATE TABLE attendees (id INTEGER PRIMARY KEY, first_name TEXT)`);

  const first = await reconcileOnce(db2, migrations);
  eq('the first pass does the work', (first?.added.length ?? 0) > 0, true);
  // Stamped, so a converged database is not re-read on every cold start.
  const second = await reconcileOnce(db2, migrations);
  eq('  and the second is a no-op', second, null);

  /*
   * A pass that could NOT converge must not be stamped, or this reproduces
   * the very defect it exists to correct: a database recorded as done that
   * is not.
   */
  const d3 = mkdtempSync(join(tmpdir(), 'reconcile3-'));
  const db3 = createClient({ url: `file:${join(d3, 'fx.db')}` });
  await db3.execute(`CREATE TABLE attendees (id INTEGER PRIMARY KEY, first_name TEXT)`);
  // A declaration that cannot be applied — the ALTER is malformed.
  const broken = ['ALTER TABLE attendees ADD COLUMN bad_col NOT A TYPE'];
  const r3 = await reconcileOnce(db3, broken);
  eq('a failed pass reports the failure', r3?.failed, ['attendees.bad_col']);
  const stamp = await db3.execute(`SELECT version FROM _schema_reconciled`)
    .then(r => r.rows.length).catch(() => 0);
  eq('  and leaves no stamp behind', stamp, 0);
  eq('  so it is tried again', (await reconcileOnce(db3, broken))?.failed, ['attendees.bad_col']);

  rmSync(d2, { recursive: true, force: true });
  rmSync(d3, { recursive: true, force: true });
}

console.log('\n— and the runner calls it —');
{
  const src = (await import('node:fs')).readFileSync('lib/db.ts', 'utf8');
  // Both paths: a tenant's database and master's.
  eq('the tenant migration reconciles afterwards',
    /await reconcileOnce\(client, migrations\);/.test(src), true);
  eq('  and the master one does too',
    /await reconcileOnce\(db, migrations\);/.test(src), true);
  // After the loop, not instead of it: the ALTERs are still how a column is
  // normally added, and CREATE TABLE migrations must run first.
  eq('  after the migrations, not in place of them',
    src.indexOf('const pending = migrations.slice(currentVersion)') < src.indexOf('await reconcileOnce(client, migrations)'), true);
}

rmSync(dir, { recursive: true, force: true });
rmSync(envDir, { recursive: true, force: true });

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
