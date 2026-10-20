/**
 * How long a meeting runs, stored and read back.
 *
 *   node --experimental-strip-types --import ./tests/register-ts.mjs \
 *        tests/meeting-duration.mjs
 *
 * The calendar lays a day out from this, so it has to be a real column with a
 * real value in it — not a field the form collects and the API drops. The
 * routes are RUN against a real SQLite database, because the three things
 * worth knowing are all about what the column holds afterwards:
 *
 *   - a new meeting keeps the length it was booked at, and anything that is
 *     not one of the four becomes thirty minutes rather than reaching the row;
 *   - a meeting edited through the table's inline row, which sends the fields
 *     it shows and nothing else, keeps the length it had — the easy way to
 *     write this would reset every edited meeting to thirty;
 *   - and the list hands back null for the meetings booked before the column
 *     existed, rather than inventing a length for them.
 *
 * Exits non-zero on the first failing expectation, so it can gate a build.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createClient } from '@libsql/client';

let pass = 0;
let fail = 0;
const eq = (label, got, want) => {
  const g = JSON.stringify(got);
  const w = JSON.stringify(want);
  if (g === w) { pass++; console.log(`  ok   ${label}`); }
  else { fail++; console.log(`  FAIL ${label}\n       got  ${g}\n       want ${w}`); }
};

const dir = mkdtempSync(join(tmpdir(), 'meeting-duration-'));
const url = `file:${join(dir, 'db.sqlite')}`;
const db = createClient({ url });

await db.execute(`CREATE TABLE meetings (
  id INTEGER PRIMARY KEY AUTOINCREMENT, attendee_id INTEGER, conference_id INTEGER,
  meeting_date TEXT, meeting_time TEXT, location TEXT, scheduled_by TEXT, support_rep_ids TEXT,
  additional_attendees TEXT, additional_attendee_ids TEXT, outcome TEXT, meeting_type TEXT,
  duration_minutes INTEGER, created_at TEXT DEFAULT (datetime('now')))`);
await db.execute(`CREATE TABLE attendees (id INTEGER PRIMARY KEY, first_name TEXT, last_name TEXT, title TEXT,
  photo_url TEXT, email TEXT, phone TEXT, company_id INTEGER)`);
// company_type rides along with the row: the calendar colours its cards by it,
// so the list read is selecting it.
await db.execute(`CREATE TABLE companies (id INTEGER PRIMARY KEY, name TEXT, wse INTEGER, status TEXT, company_type TEXT)`);
// The stage guard the POST runs through reads these, so the fixture has to
// carry them or every booking answers 500.
await db.execute(`CREATE TABLE conferences (id INTEGER PRIMARY KEY, name TEXT, internal_attendees TEXT,
  start_date TEXT, end_date TEXT, post_conference_days INTEGER, stage TEXT, stage_override TEXT, is_historical INTEGER DEFAULT 0)`);
await db.execute(`CREATE TABLE config_options (id INTEGER PRIMARY KEY, category TEXT, value TEXT, action_key TEXT, sort_order INTEGER)`);
await db.execute(`CREATE TABLE conference_attendee_details (attendee_id INTEGER, conference_id INTEGER, action TEXT)`);
await db.execute(`CREATE TABLE meeting_notes (id INTEGER PRIMARY KEY, meeting_id INTEGER, notes TEXT)`);
await db.execute(`CREATE TABLE entity_notes (id INTEGER PRIMARY KEY, entity_type TEXT, entity_id INTEGER, conference_name TEXT)`);
await db.execute(`CREATE TABLE users (id INTEGER PRIMARY KEY, config_id INTEGER, display_name TEXT, email TEXT)`);
await db.execute({
  sql: `INSERT INTO conferences (id, name, start_date, end_date, post_conference_days, is_historical)
        VALUES (?, ?, ?, ?, ?, 0)`,
  args: [15, 'NIC Fall - 2026', '2026-10-20', '2026-10-23', 10],
});
await db.execute({ sql: 'INSERT INTO companies (id, name) VALUES (?, ?)', args: [4570, 'Milestone Retirement'] });
await db.execute({ sql: 'INSERT INTO attendees (id, first_name, last_name, company_id) VALUES (?, ?, ?, ?)', args: [900, 'Cayden', 'Ridgeway', 4570] });
await db.execute({
  sql: "INSERT INTO config_options (id, category, value, action_key) VALUES (1, 'action', 'Scheduled', 'meeting_scheduled')",
  args: [],
});

/**
 * Run a list of route calls in ONE child process.
 *
 * Loading the routes costs seconds, so a process per call made this file
 * slower than the rest of the suite together. The steps run in order and the
 * results come back in order; a step may name a meeting made by an earlier
 * one with `{ fromStep: n }`.
 */
function runPlan(plan) {
  const out = execFileSync(process.execPath, [
    '--experimental-strip-types',
    '--import', './tests/register-route-stubs.mjs',
    'tests/stubs/meeting-duration-probe.mjs',
  ], {
    encoding: 'utf8',
    env: { ...process.env, TURSO_DATABASE_URL: url, STUB_DB_URL: url, STUB_PLAN: JSON.stringify(plan) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const line = out.split('\n').find(l => l.startsWith('RESULT '));
  if (!line) throw new Error('no RESULT from the probe:\n' + out.slice(-1200));
  return JSON.parse(line.slice('RESULT '.length));
}

const booking = (over = {}) => ({
  attendee_id: 900, conference_id: 15,
  meeting_date: '2026-10-21', meeting_time: '09:00',
  ...over,
});

// A meeting from before the column existed, for the last section.
await db.execute({
  sql: `INSERT INTO meetings (id, attendee_id, conference_id, meeting_date, meeting_time, duration_minutes)
        VALUES (9001, 900, 15, '2026-10-20', '14:00', NULL)`,
  args: [],
});

/* One process, every call. The plan reads top to bottom as the story does. */
const edit = { meeting_date: '2026-10-22', meeting_time: '10:00', location: 'Booth 412', meeting_type: 'Coffee' };
const r = runPlan([
  { op: 'post', body: booking({ duration_minutes: 15 }) },   // 0
  { op: 'post', body: booking({ duration_minutes: 30 }) },   // 1
  { op: 'post', body: booking({ duration_minutes: 45 }) },   // 2
  { op: 'post', body: booking({ duration_minutes: 60 }) },   // 3
  { op: 'post', body: booking({ duration_minutes: 23 }) },   // 4
  { op: 'post', body: booking({ duration_minutes: 'soon' }) }, // 5
  { op: 'post', body: booking() },                            // 6
  { op: 'post', body: booking({ duration_minutes: 60 }) },   // 7 — the one that gets edited
  { op: 'put', fromStep: 7, body: edit },                     // 8
  { op: 'put', fromStep: 7, body: { ...edit, duration_minutes: 15 } },  // 9
  { op: 'put', fromStep: 7, body: { ...edit, duration_minutes: 999 } }, // 10
  { op: 'get', conference: 15 },                              // 11
  { op: 'getOne', id: 9001 },                                 // 12
]);

console.log('\n— booked at a length, stored at it —');
{
  eq('every booking is created', r.slice(0, 8).map(x => x.status), Array(8).fill(200));
  eq('15 minutes is stored as 15', r[0].stored, 15);
  eq('  30 as 30', r[1].stored, 30);
  eq('  45 as 45', r[2].stored, 45);
  eq('  and 60 as 60', r[3].stored, 60);

  /*
   * And nothing else reaches the row. The calendar lays a day out from this,
   * so a 23-minute meeting would be a card nothing lines up with — and the
   * four are all the form can produce, so anything else came from somewhere
   * that did not ask.
   */
  eq('an unoffered length becomes the default', r[4].stored, 30);
  eq('  and so does a word', r[5].stored, 30);
  eq('  and so does sending none at all', r[6].stored, 30);
}

console.log('\n— and kept when the meeting is edited —');
{
  eq('a meeting booked at an hour', r[7].stored, 60);

  /*
   * The table's inline edit row sends the fields it shows — date, time,
   * location, rep, type — and knows nothing about the duration. Writing the
   * column on every PUT would set every meeting edited there back to thirty.
   */
  eq('  survives an edit that does not mention it', r[8].stored, 60);
  // And an edit that does mention it changes it, through the same guard.
  eq('  changes when the edit says so', r[9].stored, 15);
  eq('  and is still one of the four', r[10].stored, 30);
}

console.log('\n— and handed back as it is —');
{
  // The row inserted below is a meeting from before the column existed: null,
  // not a length somebody invented for it. The calendar reads null as thirty;
  // the API does not.
  const old = r[11].returned.find(m => m.id === 9001);
  eq('an old meeting comes back with no length', old.duration_minutes, null);
  eq('  while the new ones carry theirs',
    r[11].returned.filter(m => m.id !== 9001).every(m => [15, 30, 45, 60].includes(m.duration_minutes)), true);
  // The single-meeting read carries it too, which is what any editor of a
  // booked meeting would have to load.
  eq('  and reading one meeting says the same', r[12].duration_minutes, null);
}

rmSync(dir, { recursive: true, force: true });
console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
