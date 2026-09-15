/**
 * A merge moves the duplicate's history; it does not delete it.
 *
 *   node --experimental-strip-types --import ./tests/register-ts.mjs \
 *        tests/merge-references.mjs
 *
 * Merging two companies reassigned two columns — attendees and child companies
 * — then deleted the duplicate. Eleven other columns point at `companies`,
 * nine ON DELETE CASCADE, so the delete took the duplicate's closed deals,
 * outreach notes, activity, assignments, priority marks, user statuses,
 * conference intel and internal relationships with it, and orphaned its notes.
 * Merging two attendees moved only the conference links, so meetings,
 * follow-ups, targets, touchpoints, RSVPs and product signals went the same
 * way — and a merge could fail outright, because contact_conference_history
 * and form_submissions reference attendees ON DELETE NO ACTION.
 *
 * ── How this is checked ──────────────────────────────────────────────────────
 *
 * Not by listing the tables again. A list here would be the same list that was
 * wrong in the route, and would rot the same way. Instead the test asks the
 * schema what points at a company, puts a row in EVERY one of those places,
 * merges, and asserts nothing is left behind. A table added next year joins
 * the test the day it joins the schema, and if the merge stops carrying it the
 * assertion fails without anyone editing this file.
 *
 * The named scenarios below it are for readability — they say out loud what
 * the generic pass proves in bulk.
 *
 * Exits non-zero on the first failing expectation, so it can gate a build.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir = mkdtempSync(join(tmpdir(), 'parlay-merge-'));
process.env.TURSO_DATABASE_URL = `file:${join(dir, 'master.db')}`;
process.env.TURSO_AUTH_TOKEN = '';
process.env.JWT_SECRET = 'test-secret-at-least-thirty-two-characters-long';
delete process.env.CLERK_SECRET_KEY;

let pass = 0;
let fail = 0;
const eq = (label, got, want) => {
  const g = JSON.stringify(got);
  const w = JSON.stringify(want);
  if (g === w) { pass++; console.log(`  ok   ${label}`); }
  else { fail++; console.log(`  FAIL ${label}\n       got  ${g}\n       want ${w}`); }
};
process.on('exit', () => { try { rmSync(dir, { recursive: true, force: true }); } catch {} });

const { createClient } = await import('@libsql/client');
const { seedFreshDb } = await import('@/lib/db');
const { findReferences, reassignReferences } = await import('@/lib/mergeReferences');

let seq = 0;
async function freshDb() {
  const client = createClient({ url: `file:${join(dir, `t${seq++}.db`)}` });
  await seedFreshDb(client);
  return client;
}

/**
 * Put a row in `table` with `column` set to `value`, filling whatever else the
 * table insists on.
 *
 * Fixtures only. Foreign keys are off while these run so a row can be planted
 * in a table deep in the graph without standing up everything it points at;
 * they go back on for the merge, which is where their behaviour is the thing
 * under test.
 */
async function plant(db, table, column, value) {
  const cols = (await db.execute(`PRAGMA table_info(${table})`)).rows;
  const sql = String((await db.execute({
    sql: `SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?`, args: [table],
  })).rows[0]?.sql ?? '');

  // Only a lone INTEGER primary key autoincrements. A composite key's columns
  // are ordinary NOT NULL columns and have to be supplied — skipping them is
  // what made this fixture fail on outreach_excluded_attendees.
  const pkCols = cols.filter(c => Number(c.pk) > 0);
  const autoPk = pkCols.length === 1 && /INT/i.test(String(pkCols[0].type))
    ? String(pkCols[0].name) : null;

  const names = [];
  const args = [];
  for (const c of cols) {
    const name = String(c.name);
    const isInt = /INT/i.test(String(c.type));
    if (name === column) { names.push(name); args.push(value); continue; }
    if (name === autoPk) continue;
    if (Number(c.notnull) !== 1 || c.dflt_value != null) continue;
    // A CHECK(col IN (...)) rejects filler, so use a value it allows.
    const allowed = sql.match(
      new RegExp(`\\b${name}\\b[^,]*?CHECK\\s*\\(\\s*\\b${name}\\b\\s+IN\\s*\\(\\s*'([^']+)'`, 'i'));
    names.push(name);
    // Not 1: the records under test get the first ids, and a filler of 1 was
    // landing on the survivor — which made the self-reference cleanup below
    // delete rows the merge had correctly moved, and looked like a bug in it.
    args.push(allowed ? allowed[1] : (isInt ? 987654 : 'x'));
  }
  if (!names.includes(column)) { names.push(column); args.push(value); }

  await db.execute({
    sql: `INSERT INTO "${table}" (${names.map(n => `"${n}"`).join(', ')}) `
       + `VALUES (${names.map(() => '?').join(', ')})`,
    args,
  });
}

const countAt = async (db, table, column, id) => Number((await db.execute({
  sql: `SELECT COUNT(*) AS n FROM "${table}" WHERE "${column}" = ?`, args: [id],
})).rows[0].n);

// ── Discovery ────────────────────────────────────────────────────────────────

console.log('\n— the references are found, by all three conventions —');
{
  const db = await freshDb();
  const co = (await findReferences(db, 'company')).map(r => `${r.table}.${r.column}`);
  const at = (await findReferences(db, 'attendee')).map(r => `${r.table}.${r.column}`);

  eq('a declared foreign key is found', co.includes('closed_deals.company_id'), true);
  eq('  including one not named for its own table',
    co.includes('companies.parent_company_id'), true);
  eq('a column named for the table with no FK behind it',
    co.includes('vendor_relationships.company_id'), true);
  eq('  and one carrying only the suffix, with no FK either',
    co.includes('vendor_relationships.related_company_id'), true);
  eq('attendees are found the same way',
    at.includes('meetings.attendee_id') && at.includes('attendee_touchpoints.attendee_id'), true);

  // Every column in today's schema happens to carry the naming convention, so
  // the foreign-key rule is currently insurance rather than load-bearing — a
  // fact worth knowing, and worth keeping true. This builds the case it exists
  // for: a reference to companies under a name no convention would catch.
  await db.execute(`CREATE TABLE odd_ref (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    owner_ref INTEGER REFERENCES companies(id) ON DELETE CASCADE
  )`);
  const withOdd = (await findReferences(db, 'company')).map(r => `${r.table}.${r.column}`);
  eq('a foreign key under an unconventional name is still found',
    withOdd.includes('odd_ref.owner_ref'), true);
  eq('  and it is carried by a merge like any other', await (async () => {
    const mk = async (n) => Number((await db.execute({
      sql: 'INSERT INTO companies (name) VALUES (?) RETURNING id', args: [n] })).rows[0].id);
    const master = await mk('Odd Master');
    const dup = await mk('Odd Duplicate');
    await db.execute({ sql: 'INSERT INTO odd_ref (owner_ref) VALUES (?)', args: [dup] });
    await reassignReferences(db, 'company', dup, master);
    await db.execute({ sql: 'DELETE FROM companies WHERE id = ?', args: [dup] });
    return Number((await db.execute({
      sql: 'SELECT COUNT(*) AS n FROM odd_ref WHERE owner_ref = ?', args: [master] })).rows[0].n);
  })(), 1);

  eq('the record\'s own primary key is not a reference to itself',
    co.includes('companies.id') || at.includes('attendees.id'), false);
  eq('  and a company reference is not mistaken for an attendee one',
    at.some(r => r.endsWith('.company_id')), false);
}

// ── The exhaustive pass ──────────────────────────────────────────────────────

for (const entity of ['company', 'attendee']) {
  const table = entity === 'company' ? 'companies' : 'attendees';
  console.log(`\n— every place a ${entity} is referenced survives the merge —`);

  const db = await freshDb();
  const make = async (name) => Number((await db.execute(
    entity === 'company'
      ? { sql: 'INSERT INTO companies (name) VALUES (?) RETURNING id', args: [name] }
      : { sql: `INSERT INTO attendees (first_name, last_name) VALUES (?, 'X') RETURNING id`, args: [name] },
  )).rows[0].id);

  const master = await make('Master');
  const dup = await make('Duplicate');

  const refs = (await findReferences(db, entity)).filter(r => !(r.table === table && r.column === 'id'));

  await db.execute('PRAGMA foreign_keys = OFF');
  let planted = 0;
  const skipped = [];
  for (const { table: t, column } of refs) {
    try { await plant(db, t, column, dup); planted++; }
    catch (e) { skipped.push(`${t}.${column}: ${e.code ?? e.message}`); }
  }
  // Entity-scoped rows, which no schema rule sees.
  for (const t of ['entity_notes', 'notifications', 'pinned_notes', 'record_suggestions']) {
    try {
      await plant(db, t, 'entity_id', dup);
      await db.execute({
        sql: `UPDATE "${t}" SET entity_type = ? WHERE entity_id = ? AND entity_type <> ?`,
        args: [entity, dup, entity],
      });
      planted++;
    } catch (e) { skipped.push(`${t}.entity_id: ${e.code ?? e.message}`); }
  }
  await db.execute('PRAGMA foreign_keys = ON');

  eq(`a row was planted in all ${refs.length + 4} places`, skipped, []);
  eq('  which is more than the two the old merge moved', planted > 2, true);

  await reassignReferences(db, entity, dup, master);
  await db.execute({ sql: `DELETE FROM "${table}" WHERE id = ?`, args: [dup] });

  const orphaned = [];
  const arrived = [];
  for (const { table: t, column } of refs) {
    if (await countAt(db, t, column, dup) > 0) orphaned.push(`${t}.${column}`);
    if (await countAt(db, t, column, master) > 0) arrived.push(`${t}.${column}`);
  }
  eq('nothing still points at the deleted record', orphaned, []);
  eq('  and every one of them arrived at the survivor', arrived.length, refs.length);

  for (const t of ['entity_notes', 'notifications', 'pinned_notes', 'record_suggestions']) {
    const left = Number((await db.execute({
      sql: `SELECT COUNT(*) AS n FROM "${t}" WHERE entity_type = ? AND entity_id = ?`,
      args: [entity, dup],
    })).rows[0].n);
    const moved = Number((await db.execute({
      sql: `SELECT COUNT(*) AS n FROM "${t}" WHERE entity_type = ? AND entity_id = ?`,
      args: [entity, master],
    })).rows[0].n);
    eq(`  ${t} moved rather than orphaned`, [left, moved], [0, 1]);
  }
}

// ── The named cases ──────────────────────────────────────────────────────────

console.log('\n— a company keeps its deals and notes —');
{
  const db = await freshDb();
  const mk = async (n) => Number((await db.execute({
    sql: 'INSERT INTO companies (name) VALUES (?) RETURNING id', args: [n] })).rows[0].id);
  const master = await mk('Belmont Care');
  const dup = await mk('Belmont Care, LLC');

  await db.execute({
    sql: `INSERT INTO closed_deals (company_id, deal_name, amount, close_date)
          VALUES (?, 'Q3 expansion', 50000, '2026-09-30')`,
    args: [dup],
  });
  await db.execute({
    sql: `INSERT INTO entity_notes (entity_type, entity_id, content) VALUES ('company', ?, 'met at booth')`,
    args: [dup],
  });

  await reassignReferences(db, 'company', dup, master);
  await db.execute({ sql: 'DELETE FROM companies WHERE id = ?', args: [dup] });

  eq('the closed deal is on the survivor', Number((await db.execute({
    sql: 'SELECT company_id AS n FROM closed_deals', args: [] })).rows[0].n), master);
  eq('  and was not deleted by the cascade', Number((await db.execute(
    'SELECT COUNT(*) AS n FROM closed_deals')).rows[0].n), 1);
  eq('the note came with it', Number((await db.execute({
    sql: `SELECT entity_id AS n FROM entity_notes WHERE entity_type = 'company'`, args: [] })).rows[0].n), master);
}

console.log('\n— an attendee keeps their meetings, and the merge does not fail —');
{
  const db = await freshDb();
  const mk = async (f) => Number((await db.execute({
    sql: `INSERT INTO attendees (first_name, last_name) VALUES (?, 'Reyes') RETURNING id`, args: [f] })).rows[0].id);
  const master = await mk('Dana');
  const dup = await mk('Dana');
  const conf = Number((await db.execute({
    sql: `INSERT INTO conferences (name, start_date, end_date, location)
          VALUES ('NFC', '2026-09-08', '2026-09-11', 'X') RETURNING id` })).rows[0].id);

  await db.execute({
    sql: `INSERT INTO meetings (attendee_id, conference_id, meeting_date, meeting_time)
          VALUES (?, ?, '2026-09-09', '10:00')`, args: [dup, conf] });
  await db.execute({
    sql: `INSERT INTO follow_ups (attendee_id, conference_id)
          VALUES (?, ?)`, args: [dup, conf] });
  await db.execute({
    sql: `INSERT INTO attendee_touchpoints (attendee_id, conference_id, option_id)
          VALUES (?, ?, 1)`, args: [dup, conf] });
  // The row that used to make the delete throw: ON DELETE NO ACTION. Planted
  // with keys off only because it also references a conference series, which
  // this scenario has no reason to stand up; the merge below runs with keys on,
  // which is the whole point of it being here.
  await db.execute('PRAGMA foreign_keys = OFF');
  await db.execute({
    sql: `INSERT INTO contact_conference_history
            (account_id, attendee_id, series_id,
             first_interaction_conference_id, last_interaction_conference_id)
          VALUES ('acct', ?, 'series-1', ?, ?)`, args: [dup, conf, conf] });
  await db.execute('PRAGMA foreign_keys = ON');

  let threw = null;
  try {
    await reassignReferences(db, 'attendee', dup, master);
    await db.execute({ sql: 'DELETE FROM attendees WHERE id = ?', args: [dup] });
  } catch (e) { threw = e.code ?? e.message; }

  eq('the merge completes', threw, null);
  eq('  the meeting moved', await countAt(db, 'meetings', 'attendee_id', master), 1);
  eq('  the follow-up moved', await countAt(db, 'follow_ups', 'attendee_id', master), 1);
  eq('  the touchpoint moved', await countAt(db, 'attendee_touchpoints', 'attendee_id', master), 1);
  eq('  and the history row that used to block the delete moved',
    await countAt(db, 'contact_conference_history', 'attendee_id', master), 1);
}

console.log('\n— what both records already had collapses, not duplicates —');
{
  const db = await freshDb();
  const mk = async (f) => Number((await db.execute({
    sql: `INSERT INTO attendees (first_name, last_name) VALUES (?, 'Reyes') RETURNING id`, args: [f] })).rows[0].id);
  const master = await mk('Dana');
  const dup = await mk('Dana');
  const conf = Number((await db.execute({
    sql: `INSERT INTO conferences (name, start_date, end_date, location)
          VALUES ('NFC', '2026-09-08', '2026-09-11', 'X') RETURNING id` })).rows[0].id);

  for (const id of [master, dup]) {
    await db.execute({
      sql: `INSERT INTO conference_attendees (conference_id, attendee_id, source) VALUES (?, ?, 'initial_upload')`,
      args: [conf, id],
    });
  }

  const report = await reassignReferences(db, 'attendee', dup, master);
  await db.execute({ sql: 'DELETE FROM attendees WHERE id = ?', args: [dup] });

  eq('one link to that conference, not two',
    await countAt(db, 'conference_attendees', 'attendee_id', master), 1);
  eq('  and the redundant one is reported as collapsed, not silently lost',
    report.collapsed['conference_attendees.attendee_id'], 1);
}

console.log('\n— a company does not end up related to itself —');
{
  // Both halves of a vendor relationship pointing at the same company is not a
  // relationship. It happens when the merge joins the two ends of one.
  const db = await freshDb();
  const mk = async (n) => Number((await db.execute({
    sql: 'INSERT INTO companies (name) VALUES (?) RETURNING id', args: [n] })).rows[0].id);
  const master = await mk('Belmont Care');
  const dup = await mk('Belmont Care LLC');
  await db.execute({
    sql: 'INSERT INTO vendor_relationships (company_id, related_company_id) VALUES (?, ?)',
    args: [master, dup],
  });

  await reassignReferences(db, 'company', dup, master);
  await db.execute({ sql: 'DELETE FROM companies WHERE id = ?', args: [dup] });

  eq('the self-relationship is dropped', Number((await db.execute(
    'SELECT COUNT(*) AS n FROM vendor_relationships')).rows[0].n), 0);
}
{
  // ...but a relationship to a THIRD company is real and must survive.
  const db = await freshDb();
  const mk = async (n) => Number((await db.execute({
    sql: 'INSERT INTO companies (name) VALUES (?) RETURNING id', args: [n] })).rows[0].id);
  const master = await mk('Belmont Care');
  const dup = await mk('Belmont Care LLC');
  const other = await mk('Twenty20');
  await db.execute({
    sql: 'INSERT INTO vendor_relationships (company_id, related_company_id) VALUES (?, ?)',
    args: [dup, other],
  });

  await reassignReferences(db, 'company', dup, master);
  await db.execute({ sql: 'DELETE FROM companies WHERE id = ?', args: [dup] });

  const row = (await db.execute('SELECT company_id, related_company_id FROM vendor_relationships')).rows[0];
  eq('a relationship to a third company survives, repointed',
    [Number(row?.company_id), Number(row?.related_company_id)], [master, other]);
}

console.log('\n— a company does not become its own parent —');
{
  const db = await freshDb();
  const mk = async (n) => Number((await db.execute({
    sql: 'INSERT INTO companies (name) VALUES (?) RETURNING id', args: [n] })).rows[0].id);
  const master = await mk('Parent Co');
  const dup = await mk('Parent Co LLC');
  // The survivor is a child of the record being merged into it.
  await db.execute({ sql: 'UPDATE companies SET parent_company_id = ? WHERE id = ?', args: [dup, master] });

  await reassignReferences(db, 'company', dup, master);
  await db.execute({ sql: 'DELETE FROM companies WHERE id = ?', args: [dup] });

  eq('the survivor has no parent rather than itself', (await db.execute({
    sql: 'SELECT parent_company_id FROM companies WHERE id = ?', args: [master],
  })).rows[0].parent_company_id, null);
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
