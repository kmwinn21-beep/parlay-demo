/**
 * A note written on an attendee has to reach their company and the conference.
 *
 *   node --experimental-strip-types --import ./tests/register-ts.mjs \
 *        tests/note-cascade.mjs
 *
 * One note is stored three times — once against the attendee, once against the
 * company, once against the conference — which is what lets it be read from
 * any of them. Nine different client files do that fan-out for themselves, and
 * one of them could not: the notes popover on a row is handed an attendee id
 * and a conference NAME, and has no company at all. Its notes landed on the
 * attendee and nowhere else, which is exactly how it was reported — a note
 * visible in the attendee's drawer and missing from the company's Notes
 * section and from the conference's.
 *
 * The server does the fan-out when asked now, because it has what that card
 * does not: the attendee's company, and the conference it was already
 * resolving by name for conference_id.
 *
 * The route is RUN against a real SQLite database rather than read, since what
 * is being checked is which rows exist afterwards.
 *
 * Exits non-zero on the first failing expectation, so it can gate a build.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
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

const dir = mkdtempSync(join(tmpdir(), 'note-cascade-'));
const url = `file:${join(dir, 'db.sqlite')}`;

const db = createClient({ url });
await db.execute('CREATE TABLE conferences (id INTEGER PRIMARY KEY, name TEXT)');
await db.execute('CREATE TABLE companies (id INTEGER PRIMARY KEY, name TEXT)');
await db.execute('CREATE TABLE attendees (id INTEGER PRIMARY KEY, first_name TEXT, last_name TEXT, company_id INTEGER)');
await db.execute(`CREATE TABLE entity_notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT, entity_type TEXT, entity_id INTEGER, content TEXT,
  conference_name TEXT, conference_id INTEGER, rep TEXT, attendee_name TEXT, company_name TEXT,
  tagged_users TEXT, lets_talk INTEGER DEFAULT 0, author_user_id INTEGER, note_type TEXT,
  meeting_id INTEGER, insight_counts TEXT, status TEXT, touchpoint_type TEXT,
  created_at TEXT DEFAULT (datetime('now')))`);
await db.execute('CREATE TABLE note_comments (id INTEGER PRIMARY KEY, note_id INTEGER)');
await db.execute('CREATE TABLE config_options (id INTEGER PRIMARY KEY, category TEXT, value TEXT)');
await db.execute('CREATE TABLE users (id INTEGER PRIMARY KEY, email TEXT, display_name TEXT)');
await db.execute({ sql: 'INSERT INTO conferences (id, name) VALUES (?, ?)', args: [15, 'NCAL DAY'] });
await db.execute({ sql: 'INSERT INTO companies (id, name) VALUES (?, ?)', args: [4570, 'Dial Senior Living'] });
await db.execute({
  sql: 'INSERT INTO attendees (id, first_name, last_name, company_id) VALUES (?, ?, ?, ?)',
  args: [900, 'Jacqueline', 'Kadavy', 4570],
});
// Somebody with no company on file, which must not stop the note landing.
await db.execute({
  sql: 'INSERT INTO attendees (id, first_name, last_name, company_id) VALUES (?, ?, ?, ?)',
  args: [901, 'Nobody', 'Atall', null],
});

/** Run the real POST /api/notes in a child process and report the rows it left. */
function post(body) {
  const out = execFileSync(process.execPath, [
    '--experimental-strip-types',
    '--import', './tests/register-route-stubs.mjs',
    'tests/stubs/notes-cascade-probe.mjs',
  ], {
    encoding: 'utf8',
    env: { ...process.env, TURSO_DATABASE_URL: url, STUB_DB_URL: url, STUB_BODY: JSON.stringify(body) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const line = out.split('\n').find(l => l.startsWith('RESULT '));
  return JSON.parse(line.slice('RESULT '.length));
}

console.log('\n— without asking, nothing changes —');
{
  /*
   * The other eight callers post their own copies, so the server must not add
   * any — or every note they write would be stored twice.
   */
  const r = post({ entity_type: 'attendee', entity_id: 900, content: 'plain', conference_name: 'NCAL DAY' });
  eq('the note is written', r.status, 201);
  eq('  and only against the attendee', r.rows.map(x => x.type), ['attendee']);
}

console.log('\n— asked for, it reaches all three —');
{
  const r = post({ entity_type: 'attendee', entity_id: 900, content: 'cascaded', conference_name: 'NCAL DAY', cascade: true });
  eq('three rows', r.rows.map(x => x.type), ['attendee', 'company', 'conference']);
  eq('  the company is the attendee’s own', r.rows.find(x => x.type === 'company').id, 4570);
  eq('  the conference is the one the name resolves to', r.rows.find(x => x.type === 'conference').id, 15);

  /*
   * And the labels, which the card could not supply either. Without them the
   * conference's note list draws a note with no attendee and no company pill
   * on it — there, but unattributable.
   */
  eq('every copy names the attendee', r.rows.map(x => x.att), ['Jacqueline Kadavy', 'Jacqueline Kadavy', 'Jacqueline Kadavy']);
  eq('  and the company', r.rows.map(x => x.co), ['Dial Senior Living', 'Dial Senior Living', 'Dial Senior Living']);
  eq('  and all three carry the conference id', r.rows.map(x => x.conf), [15, 15, 15]);
}

console.log('\n— and it does not invent what it cannot find —');
{
  // "General Note" is what the card sends when no conference is chosen.
  const r = post({ entity_type: 'attendee', entity_id: 900, content: 'no conference', conference_name: 'General Note', cascade: true });
  eq('a name matching no conference makes no conference copy', r.rows.map(x => x.type), ['attendee', 'company']);
  eq('  and no conference id is stored', r.rows.every(x => x.conf === null), true);

  const noCo = post({ entity_type: 'attendee', entity_id: 901, content: 'no company', conference_name: 'NCAL DAY', cascade: true });
  eq('an attendee with no company still reaches the conference', noCo.rows.map(x => x.type), ['attendee', 'conference']);
  eq('  with no company name invented', noCo.rows.every(x => x.co === null), true);

  // The cascade is about an attendee's note. A company note is already where
  // it belongs, and the caller that writes one says so itself.
  const onCompany = post({ entity_type: 'company', entity_id: 4570, content: 'on a company', conference_name: 'NCAL DAY', cascade: true });
  eq('asking for it on a company note does nothing', onCompany.rows.map(x => x.type), ['company']);
}

console.log('\n— and the card that could not fan out now asks —');
{
  const strip = (f) => readFileSync(f, 'utf8')
    .replace(/(^|[\s{(,;])\/\*[\s\S]*?\*\//g, '$1').replace(/^\s*\/\/.*$/gm, '');
  const card = strip('components/NotesPopoverCard.tsx');
  eq('the notes popover asks for the cascade', /cascade: true,/.test(card), true);
  // It has an attendee id and a conference NAME, and no company at all —
  // which is why it cannot do this itself.
  eq('  because it is given no company', /companyId|company_id/.test(card), false);
}

rmSync(dir, { recursive: true, force: true });
console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
