import type { Client } from '@libsql/client';

/**
 * Anything that can run a statement — a client or an open transaction.
 *
 * The preview runs the real merge inside a transaction it rolls back, so the
 * same functions have to accept both. See previewMerge.
 */
type Executor = Pick<Client, 'execute'>;

/**
 * Moving everything that points at a record, before the record is deleted.
 *
 * ── What went wrong without this ─────────────────────────────────────────────
 *
 * Merging two companies reassigned `attendees.company_id` and
 * `companies.parent_company_id`, then deleted the duplicate. Eleven other
 * columns point at `companies`, nine of them ON DELETE CASCADE — so the merge
 * DELETED the duplicate's closed deals, outreach notes, outreach activity,
 * outreach assignments, priority marks, user statuses, conference intel and
 * internal relationships, and orphaned its entity notes. Merging two attendees
 * was worse: it moved only the conference links, so meetings, follow-ups,
 * targets, touchpoints, RSVPs and product signals went the same way.
 *
 * Both merges also had a way to fail outright. `contact_conference_history`
 * and `form_submissions` reference attendees ON DELETE NO ACTION, so deleting
 * an attendee that had either simply raised a constraint error.
 *
 * ── Why this is discovered rather than listed ────────────────────────────────
 *
 * A hand-written list of tables is a list that is correct on the day it is
 * written. This reads the schema at run time, so a table added next year is
 * carried by the merge that runs after it — without anyone remembering that
 * merging is a thing that has to be updated.
 *
 * Three rules find the references, because three different conventions are in
 * use:
 *
 *   • a column NAMED for the table — `vendor_relationships.company_id`,
 *     `attendee_touchpoints.attendee_id` — which have no foreign key behind
 *     them at all;
 *   • the `_company_id` / `_attendee_id` suffix — `parent_company_id`,
 *     `related_company_id`, the second of which has no foreign key either;
 *   • a declared foreign key, whatever the column is called.
 *
 * The third rule is currently INSURANCE rather than load-bearing: every column
 * pointing at either table today also carries the naming convention, so
 * removing the foreign-key rule changes nothing. It is kept because a column
 * like `owner_id INTEGER REFERENCES companies(id)` is an obvious thing for
 * someone to add, and the test builds exactly that case rather than asserting
 * a rule that never fires.
 *
 * Entity-scoped tables are a fourth convention and handled separately: four
 * tables address a record as `entity_type` + `entity_id` rather than by a
 * typed column, and no schema rule can see that they point at companies.
 */

/** Tables that address a record by `entity_type` + `entity_id`. */
const ENTITY_SCOPED_TABLES = ['entity_notes', 'notifications', 'pinned_notes', 'record_suggestions'];

export type MergeEntity = 'company' | 'attendee';

const ENTITY_TABLE: Record<MergeEntity, string> = {
  company: 'companies',
  attendee: 'attendees',
};

/** What was moved, so a caller can log or assert on it. */
export interface ReassignReport {
  /** `table.column` → rows repointed at the surviving record. */
  moved: Record<string, number>;
  /**
   * `table.column` → rows dropped because the survivor already had the same
   * row. A unique constraint is what says "same row" — see the OR IGNORE note
   * below — and one of the two has to go.
   */
  collapsed: Record<string, number>;
}

interface Ref { table: string; column: string }

/**
 * Every (table, column) that points at `entity`, found from the live schema.
 *
 * Exported for the test, which asserts the discovery still sees each of the
 * conventions above rather than trusting a count.
 */
export async function findReferences(db: Executor, entity: MergeEntity): Promise<Ref[]> {
  const target = ENTITY_TABLE[entity];
  const suffix = `${entity}_id`;

  const tables = (await db.execute(
    `SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name`,
  )).rows.map(r => String(r.name));

  const found = new Map<string, Ref>();
  const add = (table: string, column: string) => found.set(`${table}.${column}`, { table, column });

  for (const table of tables) {
    // Rule 1 — a declared foreign key at this table.
    const fks = await db.execute(`PRAGMA foreign_key_list(${table})`).catch(() => ({ rows: [] }));
    for (const fk of fks.rows) {
      if (String(fk.table) === target && fk.from) add(table, String(fk.from));
    }

    // Rules 2 and 3 — named for the table, or carrying its suffix, whether or
    // not a foreign key was ever declared.
    const cols = await db.execute(`PRAGMA table_info(${table})`).catch(() => ({ rows: [] }));
    for (const col of cols.rows) {
      const name = String(col.name);
      if (name === suffix || name.endsWith(`_${suffix}`)) add(table, name);
    }
  }

  return Array.from(found.values()).sort((a, b) =>
    `${a.table}.${a.column}`.localeCompare(`${b.table}.${b.column}`));
}

/**
 * Repoint everything that references `fromId` at `toId`.
 *
 * Call this BEFORE deleting the duplicate: once every child has moved, the
 * delete has nothing left to cascade over and nothing left to be restricted by.
 *
 * Rows that cannot move are dropped rather than left behind. `UPDATE OR IGNORE`
 * skips a row whose new value would break a unique constraint — which happens
 * exactly when the survivor already has the equivalent row, so the duplicate's
 * copy is redundant. Left in place it would either be cascaded away by the
 * delete or orphaned, so it is removed deliberately and counted.
 */
export async function reassignReferences(
  db: Executor,
  entity: MergeEntity,
  fromId: number,
  toId: number,
): Promise<ReassignReport> {
  const report: ReassignReport = { moved: {}, collapsed: {} };
  if (fromId === toId) return report;

  const target = ENTITY_TABLE[entity];

  for (const { table, column } of await findReferences(db, entity)) {
    // The record's own row is not a reference to itself; it is the thing being
    // merged, and the caller deletes it.
    if (table === target && column === 'id') continue;

    const before = await db.execute({
      sql: `SELECT COUNT(*) AS n FROM "${table}" WHERE "${column}" = ?`, args: [fromId],
    });
    const total = Number(before.rows[0]?.n ?? 0);
    if (total === 0) continue;

    await db.execute({
      sql: `UPDATE OR IGNORE "${table}" SET "${column}" = ? WHERE "${column}" = ?`,
      args: [toId, fromId],
    });

    const after = await db.execute({
      sql: `SELECT COUNT(*) AS n FROM "${table}" WHERE "${column}" = ?`, args: [fromId],
    });
    const stuck = Number(after.rows[0]?.n ?? 0);
    if (stuck > 0) {
      await db.execute({
        sql: `DELETE FROM "${table}" WHERE "${column}" = ?`, args: [fromId],
      });
      report.collapsed[`${table}.${column}`] = stuck;
    }
    if (total - stuck > 0) report.moved[`${table}.${column}`] = total - stuck;
  }

  // Entity-scoped rows, which no schema rule can find.
  for (const table of ENTITY_SCOPED_TABLES) {
    const exists = await db.execute({
      sql: `SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?`, args: [table],
    });
    if (exists.rows.length === 0) continue;

    const before = await db.execute({
      sql: `SELECT COUNT(*) AS n FROM "${table}" WHERE entity_type = ? AND entity_id = ?`,
      args: [entity, fromId],
    });
    const total = Number(before.rows[0]?.n ?? 0);
    if (total === 0) continue;

    await db.execute({
      sql: `UPDATE OR IGNORE "${table}" SET entity_id = ? WHERE entity_type = ? AND entity_id = ?`,
      args: [toId, entity, fromId],
    });
    const after = await db.execute({
      sql: `SELECT COUNT(*) AS n FROM "${table}" WHERE entity_type = ? AND entity_id = ?`,
      args: [entity, fromId],
    });
    const stuck = Number(after.rows[0]?.n ?? 0);
    if (stuck > 0) {
      await db.execute({
        sql: `DELETE FROM "${table}" WHERE entity_type = ? AND entity_id = ?`,
        args: [entity, fromId],
      });
      report.collapsed[`${table}.entity_id`] = stuck;
    }
    if (total - stuck > 0) report.moved[`${table}.entity_id`] = total - stuck;
  }

  // A reference the duplicate held TO the survivor now points at the survivor
  // from the survivor. A company that was its own parent disappears from the
  // family views; a vendor relationship with itself is not a relationship.
  if (entity === 'company') {
    await db.execute({
      sql: 'UPDATE companies SET parent_company_id = NULL WHERE id = parent_company_id', args: [],
    });
    await db.execute({
      sql: 'DELETE FROM vendor_relationships WHERE company_id = related_company_id', args: [],
    }).catch(() => {});
  }

  return report;
}

/* ─── What a merge would do, before it does it ──────────────────────────────── */

/**
 * Table names in the words the people merging use.
 *
 * Only the ones a person would recognise. Anything unlisted falls back to its
 * table name with the underscores knocked out, which is honest — better a row
 * reading "attendee product signals" than a silent omission that makes the
 * preview look smaller than the merge.
 */
const TABLE_LABELS: Record<string, string> = {
  attendees: 'Attendees',
  companies: 'Child companies',
  closed_deals: 'Closed deals',
  conference_attendees: 'Conference links',
  conference_attendee_details: 'Conference details',
  conference_company_intel: 'Conference intel',
  conference_targets: 'Targets',
  contact_conference_history: 'Contact history',
  entity_notes: 'Notes',
  follow_ups: 'Follow-ups',
  form_submissions: 'Form submissions',
  internal_relationships: 'Internal relationships',
  meetings: 'Meetings',
  notifications: 'Notifications',
  outreach_activity: 'Outreach activity',
  outreach_assignments: 'Outreach assignments',
  outreach_notes: 'Outreach notes',
  pinned_notes: 'Pinned notes',
  attendee_touchpoints: 'Touchpoints',
  social_event_rsvps: 'Social RSVPs',
  vendor_relationships: 'Vendor relationships',
  company_priority_marks: 'Priority marks',
  company_user_statuses: 'Status marks',
};

const labelFor = (table: string) =>
  TABLE_LABELS[table] ?? table.replace(/_/g, ' ').replace(/^./, c => c.toUpperCase());

export interface MergePreview {
  /** Records that would move to the survivor, largest group first. */
  moving: Array<{ label: string; rows: number }>;
  /** Records the survivor already has an equivalent of, which would combine. */
  combining: Array<{ label: string; rows: number }>;
  /** Total rows that would move — the headline number. */
  totalMoving: number;
  /** Set when the dry run could not complete; the merge would fail the same way. */
  blocked?: string;
}

/**
 * What a merge would move, worked out by doing it and rolling back.
 *
 * ── Why a dry run rather than a count ────────────────────────────────────────
 *
 * A preview computed separately from the merge is a second implementation of
 * the merge, and the two drift. This one opens a write transaction, runs the
 * REAL reassignment and the REAL delete, reads what happened, and rolls the
 * whole thing back — so the numbers cannot disagree with what the button does,
 * and a merge that would fail on a constraint fails here first, where it can be
 * reported instead of half-applied.
 *
 * Verified in Chromium-free isolation before this was built on: a rolled-back
 * transaction restores the row count exactly, and foreign-key cascades fire
 * inside it the way they would for real.
 */
export async function previewMerge(
  db: Client,
  entity: MergeEntity,
  fromIds: number[],
  toId: number,
): Promise<MergePreview> {
  const target = ENTITY_TABLE[entity];
  const moved = new Map<string, number>();
  const collapsed = new Map<string, number>();
  let blocked: string | undefined;

  const tx = await db.transaction('write');
  try {
    for (const fromId of fromIds) {
      if (fromId === toId) continue;
      const report = await reassignReferences(tx, entity, fromId, toId);
      for (const [key, n] of Object.entries(report.moved)) {
        const table = key.split('.')[0];
        moved.set(table, (moved.get(table) ?? 0) + n);
      }
      for (const [key, n] of Object.entries(report.collapsed)) {
        const table = key.split('.')[0];
        collapsed.set(table, (collapsed.get(table) ?? 0) + n);
      }
      // The delete is part of the dry run on purpose: it is what would cascade,
      // and what would raise a constraint error.
      await tx.execute({ sql: `DELETE FROM "${target}" WHERE id = ?`, args: [fromId] });
    }
  } catch (err) {
    blocked = err instanceof Error ? err.message : String(err);
  } finally {
    // Nothing here is kept. Rollback can only fail if the transaction is
    // already closed, which is not a reason to fail the preview.
    await tx.rollback().catch(() => {});
  }

  const rank = (m: Map<string, number>) => Array.from(m.entries())
    .map(([table, rows]) => ({ label: labelFor(table), rows }))
    .sort((a, b) => b.rows - a.rows || a.label.localeCompare(b.label));

  return {
    moving: rank(moved),
    combining: rank(collapsed),
    totalMoving: Array.from(moved.values()).reduce((a, b) => a + b, 0),
    ...(blocked ? { blocked } : {}),
  };
}
