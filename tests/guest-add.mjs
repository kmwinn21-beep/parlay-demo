/**
 * Adding somebody to a social event's guest list.
 *
 *   node --experimental-strip-types --import ./tests/register-ts.mjs \
 *        tests/guest-add.mjs
 *
 * Saving a guest list failed with "Failed to update the guest list." and
 * nothing else to go on, because the client threw a bare Error and dropped the
 * status.
 *
 * The route is RUN — real handler, real SQLite — against BOTH shapes the
 * social_event_rsvps table exists in, because the shape is the bug. The insert
 * used ON CONFLICT (social_event_id, attendee_id), which names a constraint;
 * naming one the table does not have is an error, not a no-op. The composite
 * key is in the CREATE TABLE, but that statement is IF NOT EXISTS, so a
 * database whose table predates it keeps whatever shape it was made with.
 *
 * Reproduced before the fix, on the keyless shape: POST 500, prospect_attendees
 * updated anyway, no RSVP row — a half-write behind a failure message.
 *
 * Exits non-zero on the first failing expectation, so it can gate a build.
 */
import { readFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';

let pass = 0;
let fail = 0;
const eq = (label, got, want) => {
  const g = JSON.stringify(got);
  const w = JSON.stringify(want);
  if (g === w) { pass++; console.log(`  ok   ${label}`); }
  else { fail++; console.log(`  FAIL ${label}\n       got  ${g}\n       want ${w}`); }
};

const strip = (f) => readFileSync(f, 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const require_ = createRequire(process.cwd() + '/package.json');
const { createClient } = require_('@libsql/client');

/** A database whose rsvp table has the composite key, or does not. */
const build = async (withKey) => {
  const dir = mkdtempSync(join(tmpdir(), 'guest-'));
  const url = `file:${join(dir, 'g.db')}`;
  const db = createClient({ url });
  await db.execute(`CREATE TABLE social_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT, conference_id INTEGER, event_name TEXT,
    event_type TEXT, prospect_attendees TEXT)`);
  await db.execute(withKey
    ? `CREATE TABLE social_event_rsvps (
        social_event_id INTEGER NOT NULL, attendee_id INTEGER NOT NULL,
        rsvp_status TEXT NOT NULL DEFAULT 'maybe', updated_at TEXT,
        PRIMARY KEY (social_event_id, attendee_id))`
    : `CREATE TABLE social_event_rsvps (
        social_event_id INTEGER NOT NULL, attendee_id INTEGER NOT NULL,
        rsvp_status TEXT NOT NULL DEFAULT 'maybe', updated_at TEXT)`);
  await db.execute(`CREATE TABLE attendees (
    id INTEGER PRIMARY KEY AUTOINCREMENT, first_name TEXT, last_name TEXT)`);
  await db.execute(`CREATE TABLE config_options (
    id INTEGER PRIMARY KEY AUTOINCREMENT, category TEXT, value TEXT)`);
  await db.execute(`INSERT INTO social_events (id, conference_id, event_name, event_type)
    VALUES (1, 1, 'Opening Dinner', 'Dinner')`);
  await db.execute(`INSERT INTO attendees (id, first_name, last_name) VALUES (7, 'Anna', 'White')`);
  return { url, db };
};

const call = (url, method, attendeeId) => {
  try {
    const out = execFileSync(process.execPath, [
      '--experimental-strip-types', '--import', './tests/register-route-stubs.mjs',
      'tests/stubs/guest-probe.mjs',
    ], {
      env: {
        ...process.env,
        // The route's module graph reaches lib/db, which needs these at import.
        TURSO_DATABASE_URL: url, JWT_SECRET: 'x'.repeat(40),
        STUB_DB_URL: url, STUB_METHOD: method,
        STUB_EVENT_ID: '1', STUB_ATTENDEE_ID: String(attendeeId),
      },
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
    });
    const line = out.split('\n').find(l => l.startsWith('RESULT '));
    return line ? JSON.parse(line.slice('RESULT '.length)) : { noResult: true };
  } catch (e) {
    return { crashed: String(e.stderr ?? e).slice(-300) };
  }
};

for (const withKey of [true, false]) {
  const shape = withKey ? 'with the composite key' : 'without it';
  console.log(`\n— a guest is added, ${shape} —`);
  const { url, db } = await build(withKey);

  eq('the add succeeds', call(url, 'POST', 7).status, 200);

  const listed = async () =>
    String((await db.execute('SELECT prospect_attendees FROM social_events WHERE id = 1')).rows[0].prospect_attendees ?? '');
  const rsvps = async () =>
    Number((await db.execute('SELECT COUNT(*) c FROM social_event_rsvps')).rows[0].c);

  eq('  they are on the list', await listed(), '7');
  /* Both halves, or neither. They were two separate writes, and the second
     could fail alone — leaving somebody listed as invited with no RSVP row,
     so the drawer counted them under INVITED while the RSVP columns did not. */
  eq('  and they have an RSVP row', await rsvps(), 1);

  // Adding the same person twice is something the save does whenever the list
  // is re-saved unchanged.
  eq('adding them again still succeeds', call(url, 'POST', 7).status, 200);
  eq('  without listing them twice', await listed(), '7');
  eq('  or giving them two RSVP rows', await rsvps(), 1);

  console.log(`— and removed again, ${shape} —`);
  eq('the remove succeeds', call(url, 'DELETE', 7).status, 200);
  eq('  they are off the list', await listed(), '');
  eq('  and their RSVP row is gone', await rsvps(), 0);
}

console.log('\n— the route does not ask about constraints —');
{
  const route = strip('app/api/social-events/[id]/guest/route.ts');
  /*
   * WHERE NOT EXISTS asks about rows. ON CONFLICT asks about a constraint, and
   * an account whose table was created without one gets an error rather than a
   * no-op — which is the 500 above.
   */
  eq('the insert is guarded by a row test', /WHERE NOT EXISTS \(/.test(route), true);
  eq('  and names no constraint', /ON CONFLICT/.test(route), false);
  // One batch, so the list and the RSVP row cannot disagree.
  eq('  and both writes go together', /db\.batch\(statements, 'write'\)/.test(route), true);
}

console.log('\n— and a failure says what happened —');
{
  const file = strip('components/SocialEventsTable.tsx');
  /* This handler only. Five other handlers in the file still throw bare
     Errors and are a separate job; a file-wide assertion would have claimed
     they were fixed here. Sliced FORWARD from the handler's own name and
     asserted non-empty, so it cannot pass by reading nothing. */
  const start = file.indexOf('const handleSaveGuestList =');
  const table = file.slice(start, file.indexOf('}, [events, onRefresh]);', start));
  eq('there is a save handler to read', start !== -1 && table.length > 400, true);
  /*
   * "Failed to update the guest list." and nothing else is what this started
   * from: a 401 from an expired session and a 500 from the database read
   * identically, so there was nothing to act on.
   */
  eq('the status is no longer thrown away', /throw new Error\(\);/.test(table), false);
  eq('  an expired session says so', /your session has expired/.test(table), true);
  eq('  the server’s own message is used when it sent one',
    /detail\?\.error \? String\(detail\.error\)/.test(table), true);
  eq('  and otherwise the status is named', /the server returned \$\{res\.status\}/.test(table), true);
  eq('  with the whole of it in the console',
    /console\.error\(`\$\{method\} \/api\/social-events/.test(table), true);
  // A half-write leaves the list on screen behind the database, so it reloads
  // on failure as well as on success rather than looking untouched.
  eq('the list reloads even when the save failed',
    /catch \(err\) \{[\s\S]{0,300}onRefresh\(\);/.test(table), true);
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
