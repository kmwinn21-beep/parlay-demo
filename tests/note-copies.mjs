/**
 * One note, several rows — recognising the set, and deleting it on purpose.
 *
 *   node --experimental-strip-types --import ./tests/register-ts.mjs \
 *        tests/note-copies.mjs
 *
 * A note attached to a conference, a company and an attendee at once is three
 * POSTs to /api/notes and three `entity_notes` rows with nothing linking them.
 * Deleting one left the others standing, so the note reappeared the moment you
 * opened a different record.
 *
 * The set therefore has to be inferred, and the cost of inferring it wrongly is
 * asymmetric: a false negative offers a delete that misses a copy, a false
 * positive DESTROYS SOMEBODY ELSE'S NOTE. Most of what is asserted below is the
 * second kind — the cases where rows look like copies and must not be treated
 * as one.
 *
 * Exits non-zero on the first failing expectation, so it can gate a build.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir = mkdtempSync(join(tmpdir(), 'parlay-note-copies-'));
process.env.TURSO_DATABASE_URL = `file:${join(dir, 'master.db')}`;
process.env.TURSO_AUTH_TOKEN = '';
process.env.JWT_SECRET = 'test-secret-at-least-thirty-two-characters-long';
delete process.env.CLERK_SECRET_KEY;
delete process.env.NEXT_PUBLIC_DEMO_MODE;

let pass = 0;
let fail = 0;
const eq = (label, got, want) => {
  const g = JSON.stringify(got);
  const w = JSON.stringify(want);
  if (g === w) { pass++; console.log(`  ok   ${label}`); }
  else { fail++; console.log(`  FAIL ${label}\n       got  ${g}\n       want ${w}`); }
};
process.on('exit', () => { try { rmSync(dir, { recursive: true, force: true }); } catch {} });

const { NextRequest } = await import('next/server');
const { db, dbReady, seedFreshDb } = await import('@/lib/db');
await dbReady;
await seedFreshDb(db);

const { signToken } = await import('@/lib/auth');
const { findNoteCopies, COPY_WINDOW_SECONDS } = await import('@/lib/notes/copies');
const deleteNote = (await import('@/app/api/notes/[id]/route')).DELETE;
const copiesGET = (await import('@/app/api/notes/[id]/copies/route')).GET;

// No accountId: getDb(undefined) is the master client, which is the one seeded
// above. The routes are exercised against a real database, not a stub.
const USER = { id: 1, email: 'kevin@t.test', role: 'administrator', emailVerified: true };

async function req(url, method = 'GET') {
  return new NextRequest(url, { method, headers: { cookie: `auth_token=${await signToken(USER)}` } });
}
const del = async (id, scope) =>
  deleteNote(await req(`https://p.test/api/notes/${id}${scope ? `?scope=${scope}` : ''}`, 'DELETE'),
    { params: { id: String(id) } });
const copiesOf = async (id) =>
  copiesGET(await req(`https://p.test/api/notes/${id}/copies`), { params: { id: String(id) } });

// ── Fixtures ─────────────────────────────────────────────────────────────────

const BASE = Date.parse('2026-06-01T09:00:00Z');
const at = (secondsAfter) =>
  new Date(BASE + secondsAfter * 1000).toISOString().slice(0, 19).replace('T', ' ');

await db.execute(`INSERT INTO conferences (id, name, location, start_date, end_date)
  VALUES (1, 'ALIS FWD', 'Las Vegas', '2026-06-14', '2026-06-17')`);
await db.execute(`INSERT INTO companies (id, name) VALUES (1, 'Arrow Senior Living'), (2, 'Inspiren')`);
await db.execute(`INSERT INTO attendees (id, first_name, last_name, company_id)
  VALUES (1, 'Robyn', 'Yerger', 1), (2, 'Philip', 'Gisi', 1)`);
await db.execute(`INSERT INTO users (id, email, password_hash, role, email_verified)
  VALUES (1, 'kevin@t.test', 'x', 'administrator', 1), (2, 'sam@t.test', 'x', 'user', 1)`);

/** One note written three times, exactly as NewNoteModal does it. */
async function writeCopySet(ids, content, opts = {}) {
  const author = opts.author ?? 1;
  const t = opts.t ?? 0;
  const [confId, coId, attId] = ids;
  await db.execute({
    sql: `INSERT INTO entity_notes (id, entity_type, entity_id, content, conference_id, author_user_id, rep, created_at)
          VALUES (?, 'conference', 1, ?, 1, ?, 'Kevin Winn', ?)`,
    args: [confId, content, author, at(t)],
  });
  await db.execute({
    sql: `INSERT INTO entity_notes (id, entity_type, entity_id, content, conference_id, author_user_id, rep, created_at)
          VALUES (?, 'company', 1, ?, 1, ?, 'Kevin Winn', ?)`,
    args: [coId, content, author, at(t + 1)],
  });
  await db.execute({
    sql: `INSERT INTO entity_notes (id, entity_type, entity_id, content, conference_id, author_user_id, rep, created_at)
          VALUES (?, 'attendee', 1, ?, 1, ?, 'Kevin Winn', ?)`,
    args: [attId, content, author, at(t + 2)],
  });
}

const noteIds = async () => {
  const r = await db.execute('SELECT id FROM entity_notes ORDER BY id');
  return r.rows.map(x => Number(x.id));
};

// ── Recognising the set ──────────────────────────────────────────────────────

console.log('\n— the three rows of one note find each other —');
{
  await writeCopySet([10, 11, 12], 'Scheduling a demo with Melissa.');
  const fromAttendee = await findNoteCopies(db, 12);
  eq('the attendee copy sees the other two', fromAttendee.copies.map(c => c.id), [11, 10]);
  eq('  named by the record, not the id',
    fromAttendee.copies.map(c => c.label), ['Arrow Senior Living', 'ALIS FWD']);
  eq('  and typed, so the dialog can say what each is',
    fromAttendee.copies.map(c => c.entityType), ['company', 'conference']);

  const fromConference = await findNoteCopies(db, 10);
  eq('the conference copy sees them too', fromConference.copies.map(c => c.id).sort(), [11, 12]);
  eq('  most specific first', fromConference.copies[0].label, 'Robyn Yerger');
}
{
  await db.execute(`INSERT INTO entity_notes (id, entity_type, entity_id, content, conference_id, author_user_id, rep, created_at)
    VALUES (20, 'attendee', 1, 'A note that lives in one place.', 1, 1, 'Kevin Winn', '${at(100)}')`);
  const found = await findNoteCopies(db, 20);
  eq('a note written once has no copies', found.copies, []);
  eq('  and is still found', found.found, true);
}
{
  const missing = await findNoteCopies(db, 99999);
  eq('a note that does not exist says so', [missing.found, missing.copies], [false, []]);
}

console.log('\n— what must NOT be mistaken for a copy —');
{
  // The dangerous case. Same words, same author, seconds apart — but both are
  // attendee notes, about two different people.
  await db.execute(`INSERT INTO entity_notes (id, entity_type, entity_id, content, conference_id, author_user_id, rep, created_at)
    VALUES (30, 'attendee', 1, 'Great chat.', 1, 1, 'Kevin Winn', '${at(200)}')`);
  await db.execute(`INSERT INTO entity_notes (id, entity_type, entity_id, content, conference_id, author_user_id, rep, created_at)
    VALUES (31, 'attendee', 2, 'Great chat.', 1, 1, 'Kevin Winn', '${at(202)}')`);
  eq('the same text on two attendees is two notes', (await findNoteCopies(db, 30)).copies, []);
  eq('  in both directions', (await findNoteCopies(db, 31)).copies, []);
}
{
  // Two people wrote the same sentence at the same moment on different records.
  await db.execute(`INSERT INTO entity_notes (id, entity_type, entity_id, content, conference_id, author_user_id, rep, created_at)
    VALUES (40, 'attendee', 1, 'Booth was busy.', 1, 1, 'Kevin Winn', '${at(300)}')`);
  await db.execute(`INSERT INTO entity_notes (id, entity_type, entity_id, content, conference_id, author_user_id, rep, created_at)
    VALUES (41, 'company', 1, 'Booth was busy.', 1, 2, 'Sam Reed', '${at(301)}')`);
  eq('a different author is a different note', (await findNoteCopies(db, 40)).copies, []);
}
{
  // The same two rows with the SAME rep text, so only author_user_id separates
  // them. Without this the rep comparison alone carried the previous case and
  // the author check could be deleted with every test still green.
  await db.execute(`INSERT INTO entity_notes (id, entity_type, entity_id, content, conference_id, author_user_id, rep, created_at)
    VALUES (42, 'attendee', 1, 'Shared rep label.', 1, 1, 'Kevin Winn', '${at(320)}')`);
  await db.execute(`INSERT INTO entity_notes (id, entity_type, entity_id, content, conference_id, author_user_id, rep, created_at)
    VALUES (43, 'company', 1, 'Shared rep label.', 1, 2, 'Kevin Winn', '${at(321)}')`);
  eq('  even when both rows carry the same rep name', (await findNoteCopies(db, 42)).copies, []);
}
{
  // Far enough apart to be a second, deliberate note.
  const beyond = COPY_WINDOW_SECONDS + 5;
  await db.execute(`INSERT INTO entity_notes (id, entity_type, entity_id, content, conference_id, author_user_id, rep, created_at)
    VALUES (50, 'attendee', 1, 'Following up next week.', 1, 1, 'Kevin Winn', '${at(400)}')`);
  await db.execute(`INSERT INTO entity_notes (id, entity_type, entity_id, content, conference_id, author_user_id, rep, created_at)
    VALUES (51, 'company', 1, 'Following up next week.', 1, 1, 'Kevin Winn', '${at(400 + beyond)}')`);
  eq(`${beyond}s apart is not a copy`, (await findNoteCopies(db, 50)).copies, []);
}
{
  // Different text, everything else identical.
  await db.execute(`INSERT INTO entity_notes (id, entity_type, entity_id, content, conference_id, author_user_id, rep, created_at)
    VALUES (60, 'attendee', 1, 'Wants a pilot.', 1, 1, 'Kevin Winn', '${at(500)}')`);
  await db.execute(`INSERT INTO entity_notes (id, entity_type, entity_id, content, conference_id, author_user_id, rep, created_at)
    VALUES (61, 'company', 1, 'Wants two pilots.', 1, 1, 'Kevin Winn', '${at(500)}')`);
  eq('different text is a different note', (await findNoteCopies(db, 60)).copies, []);
}
{
  // Ambiguity: an attendee note with TWO company rows that both look like its
  // copy. One of them is somebody's separate note and there is nothing that
  // says which, so neither is offered.
  await db.execute(`INSERT INTO entity_notes (id, entity_type, entity_id, content, conference_id, author_user_id, rep, created_at)
    VALUES (70, 'attendee', 1, 'Ambiguous.', 1, 1, 'Kevin Winn', '${at(600)}')`);
  await db.execute(`INSERT INTO entity_notes (id, entity_type, entity_id, content, conference_id, author_user_id, rep, created_at)
    VALUES (71, 'company', 1, 'Ambiguous.', 1, 1, 'Kevin Winn', '${at(601)}')`);
  await db.execute(`INSERT INTO entity_notes (id, entity_type, entity_id, content, conference_id, author_user_id, rep, created_at)
    VALUES (72, 'company', 2, 'Ambiguous.', 1, 1, 'Kevin Winn', '${at(602)}')`);
  eq('two candidates of one type resolve to none', (await findNoteCopies(db, 70)).copies, []);
}
{
  // And the half of that which must survive: an unambiguous type in the same
  // set is still offered.
  await db.execute(`INSERT INTO entity_notes (id, entity_type, entity_id, content, conference_id, author_user_id, rep, created_at)
    VALUES (73, 'conference', 1, 'Ambiguous.', 1, 1, 'Kevin Winn', '${at(603)}')`);
  eq('the unambiguous conference copy is still offered',
    (await findNoteCopies(db, 70)).copies.map(c => c.entityType), ['conference']);
}

// ── Deleting ─────────────────────────────────────────────────────────────────

console.log('\n— the endpoint the dialog asks first —');
{
  const res = await copiesOf(12);
  eq('reports the copies over HTTP', res.status, 200);
  eq('  as the dialog needs them', (await res.json()).copies.map(c => c.label),
    ['Arrow Senior Living', 'ALIS FWD']);
}
{
  const res = await copiesOf(20);
  eq('a note with no copies reports an empty list', (await res.json()).copies, []);
}
{
  const res = await copiesOf(999999);
  eq('a missing note is a 404, not an empty list', res.status, 404);
}
{
  const res = await copiesOf('not-a-number');
  eq('a non-numeric id is refused', res.status, 400);
}

console.log('\n— delete only this record —');
{
  await writeCopySet([80, 81, 82], 'Delete just one of these.', { t: 700 });
  const res = await del(82);
  eq('the default deletes one row', (await res.json()).deleted, 1);
  const left = await noteIds();
  eq('  leaving the other two standing', [left.includes(80), left.includes(81), left.includes(82)],
    [true, true, false]);
}

console.log('\n— delete from all records —');
{
  // pinned_notes declares ON DELETE CASCADE, and the LOCAL libsql client honours
  // it — which is why removing the route's explicit pin delete left every
  // assertion below green until this pragma was added. Production does not run
  // on this client: SQLite defaults foreign_keys OFF and nothing in the request
  // path turns it on, so the cascade is not there when it matters. Off here, to
  // test the code rather than the fixture.
  await db.execute('PRAGMA foreign_keys = OFF');
}
{
  await writeCopySet([90, 91, 92], 'Delete every copy of this.', { t: 800 });
  await db.execute(`INSERT INTO pinned_notes (id, note_id, entity_type, entity_id, pinned_by)
    VALUES (900, 92, 'attendee', 1, 'kevin@t.test')`);
  await db.execute(`INSERT INTO pinned_notes (id, note_id, entity_type, entity_id, pinned_by)
    VALUES (901, 91, 'company', 1, 'kevin@t.test')`);

  const res = await del(92, 'all');
  eq('all three go together', (await res.json()).deleted, 3);
  const left = await noteIds();
  eq('  and none of them is left', [left.includes(90), left.includes(91), left.includes(92)],
    [false, false, false]);
  const pins = await db.execute('SELECT id FROM pinned_notes WHERE note_id IN (90, 91, 92)');
  eq('  nor is a pin pointing at a note that no longer exists', pins.rows.length, 0);
}
{
  // scope=all on a note with no copies is just a delete.
  await db.execute(`INSERT INTO entity_notes (id, entity_type, entity_id, content, conference_id, author_user_id, rep, created_at)
    VALUES (95, 'attendee', 1, 'Alone.', 1, 1, 'Kevin Winn', '${at(900)}')`);
  const res = await del(95, 'all');
  eq('asking for all when there is one deletes one', (await res.json()).deleted, 1);
}
{
  // The safety property, end to end: two same-text attendee notes, delete all.
  await db.execute(`INSERT INTO entity_notes (id, entity_type, entity_id, content, conference_id, author_user_id, rep, created_at)
    VALUES (96, 'attendee', 1, 'Same words.', 1, 1, 'Kevin Winn', '${at(1000)}')`);
  await db.execute(`INSERT INTO entity_notes (id, entity_type, entity_id, content, conference_id, author_user_id, rep, created_at)
    VALUES (97, 'attendee', 2, 'Same words.', 1, 1, 'Kevin Winn', '${at(1001)}')`);
  await del(96, 'all');
  const left = await noteIds();
  eq('deleting all copies does not touch a lookalike on another person',
    [left.includes(96), left.includes(97)], [false, true]);
}
{
  const res = await del('not-a-number');
  eq('a non-numeric id is refused', res.status, 400);
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
