/**
 * The rep pill on a note: whose name it wears.
 *
 *   node --experimental-strip-types --import ./tests/register-ts.mjs \
 *        tests/note-author.mjs
 *
 * `entity_notes.rep` is read as a DISPLAY value — the pill derives its
 * initials straight from the string. Assigning a floor note to a conference
 * stored `user.email` verbatim, so the pill showed the one letter an address
 * like `kevin@…` can honestly yield while every other pill for the same
 * person said KW.
 *
 * Three things have to line up and all three are RUN here rather than read:
 * the lookup that turns an author into a name, the backfill that gives the
 * notes already written the same name, and the helper the pill derives its
 * letters with.
 *
 * Exits non-zero on the first failing expectation, so it can gate a build.
 */
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
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

const strip = (f) => readFileSync(f, 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

// noteAuthor reaches lib/notifications, which pulls in lib/db — and that
// builds a client at module load. Pointed at a file so importing it does not
// throw, exactly as the other database-backed suites here do.
const envDir = mkdtempSync(join(tmpdir(), 'note-author-env-'));
process.env.TURSO_DATABASE_URL = `file:${join(envDir, 'master.db')}`;
process.env.TURSO_AUTH_TOKEN = '';

const { noteAuthorName } = await import('@/lib/noteAuthor');
const { getPersonInitials } = await import('@/lib/useUserOptions');
const { migrations } = await import('@/lib/db-migrations');

const require_ = createRequire(process.cwd() + '/package.json');
const { createClient } = require_('@libsql/client');

const dir = mkdtempSync(join(tmpdir(), 'note-author-'));
const db = createClient({ url: `file:${join(dir, 'fx.db')}` });
const x = (sql) => db.execute(sql);

await x(`CREATE TABLE users (id INTEGER PRIMARY KEY, email TEXT, config_id INTEGER)`);
await x(`CREATE TABLE config_options (id INTEGER PRIMARY KEY, category TEXT, value TEXT)`);
await x(`CREATE TABLE entity_notes (id INTEGER PRIMARY KEY, entity_type TEXT, entity_id INTEGER, content TEXT, rep TEXT, author_user_id INTEGER)`);
await x(`INSERT INTO config_options VALUES (7,'user','Kevin Winn'),(8,'user','Dan Poe')`);
await x(`INSERT INTO users VALUES
  (1,'kevin@teton.com',7),
  (2,'dan.poe@teton.com',8),
  (3,'nobody@teton.com',NULL)`);

console.log('\n— an author resolves to the name everything else spells —');
{
  eq('the rep profile’s name, not the address',
    await noteAuthorName(db, 'kevin@teton.com'), 'Kevin Winn');
  eq('  which is what the pill wants', getPersonInitials(await noteAuthorName(db, 'kevin@teton.com')), 'KW');
  /*
   * The bug, stated as an expectation.
   *
   * A local part with no separator has no surname in it, and getPersonInitials
   * will not invent one — correctly. So an address in this column is a pill
   * with one letter, which is why the NAME is looked up before it.
   */
  eq('  where the raw address would have given one letter',
    getPersonInitials('kevin@teton.com'), 'K');

  // The address is still the fallback: it names somebody.
  eq('a user with no rep profile falls back to the address',
    await noteAuthorName(db, 'nobody@teton.com'), 'nobody@teton.com');
  eq('  and so does an address belonging to nobody',
    await noteAuthorName(db, 'ghost@teton.com'), 'ghost@teton.com');
  // A separator in the local part is a surname the helper can read.
  eq('a separated address does give two letters', getPersonInitials('dan.poe@teton.com'), 'DP');
}

console.log('\n— the notes already written are given the same name —');
{
  await x(`INSERT INTO entity_notes (id, entity_type, entity_id, content, rep) VALUES
    (1,'conference',4,'Matt Krosti - Otterbein SL','kevin@teton.com'),
    (2,'conference',4,'Scott Buchanan - Ohio Masonic','kevin@teton.com'),
    (3,'attendee',9,'From the same floor note','dan.poe@teton.com'),
    (4,'conference',4,'Typed in by hand','Kevin Winn'),
    (5,'conference',4,'A rep with no account here','Someone Else'),
    (6,'conference',4,'An address nobody owns','ghost@teton.com'),
    (7,'conference',4,'An account with no rep profile','nobody@teton.com')`);

  // The migration itself, run from the list the app runs. Picked out by a
  // fragment of its own text rather than by index, which moves.
  const backfill = migrations.filter(m => /UPDATE entity_notes[\s\S]*SET rep =/.test(m));
  eq('the backfill is in the migrations', backfill.length, 1);
  await db.execute(backfill[0]);

  const reps = async () => (await db.execute('SELECT id, rep FROM entity_notes ORDER BY id'))
    .rows.map(r => String(r.rep));
  eq('the assigned floor notes now name their author',
    (await reps()).slice(0, 3), ['Kevin Winn', 'Kevin Winn', 'Dan Poe']);
  // Only rows holding an address are touched. `rep` is not always the author —
  // some flows put the person a follow-up was assigned to in it — so a row
  // already holding a name is left exactly as written.
  eq('  a name already there is left alone', (await reps())[3], 'Kevin Winn');
  eq('  including one that matches no account', (await reps())[4], 'Someone Else');
  // Nothing to resolve to is left as it was rather than blanked: an address
  // names somebody, and NULL names nobody.
  eq('  an address nobody owns is kept', (await reps())[5], 'ghost@teton.com');
  eq('  as is one whose account has no rep profile', (await reps())[6], 'nobody@teton.com');

  // Migrations run on every boot, so this has to be safe to run twice.
  await db.execute(backfill[0]);
  eq('running it again changes nothing',
    await reps(), ['Kevin Winn', 'Kevin Winn', 'Dan Poe', 'Kevin Winn', 'Someone Else', 'ghost@teton.com', 'nobody@teton.com']);

  // And the pill, on what is actually stored now.
  eq('the pill reads KW off the backfilled note',
    getPersonInitials((await reps())[0]), 'KW');
}

rmSync(dir, { recursive: true, force: true });
rmSync(envDir, { recursive: true, force: true });

console.log('\n— and no route writes an address where a name belongs —');
{
  const quick = strip('app/api/quick-notes/[id]/route.ts');
  const notes = strip('app/api/notes/route.ts');

  eq('assigning a floor note resolves the author',
    /const rep = await noteAuthorName\(db, user\.email\);/.test(quick), true);
  eq('  rather than storing the address', /const rep = user\.email/.test(quick), false);
  /*
   * And records WHO wrote it.
   *
   * `rep` is what a reader sees and can be edited; author_user_id is the
   * record of the author. /api/notes has always set it and this route never
   * did, so a floor note assigned to a conference had no author at all.
   */
  eq('  and records the author alongside the name',
    /INSERT INTO entity_notes \([^)]*author_user_id\)/.test(quick), true);
  eq('    with the id actually passed', /\n\s*user\.id,\n/.test(quick), true);

  eq('the notes route resolves it the same way',
    /const resolvedRep = rep \|\| await noteAuthorName\(db, user\.email\);/.test(notes), true);
  // One implementation. Three copies of this lookup is how the routes came to
  // disagree about the same person in the first place.
  eq('  from the one helper', (notes.match(/noteAuthorName\(/g) ?? []).length >= 2, true);
  /*
   * With no copy of the AUTHOR lookup left inline in either route.
   *
   * Sliced to the note-writing half of each file. /api/notes reads a name one
   * other time, for the person who @-mentioned somebody, and that one keeps
   * its own fallback — it answers a different question and a change there is
   * a change to notification text, not to this pill. It is worth a look: its
   * fallback takes the first TWO letters of a local part, which is the "KE"
   * the pinned pill used to show.
   */
  eq('  with no copy left in the assign route',
    /SELECT value FROM config_options WHERE id = \?/.test(quick), false);
  eq('    which no longer needs the id lookup either',
    /getConfigIdByEmail/.test(quick), false);
  const writeHalf = notes.slice(0, notes.indexOf('notifyMentionedUsers'));
  eq('  nor in the half of /api/notes that writes one',
    writeHalf.length > 0 && /SELECT value FROM config_options WHERE id = \?/.test(writeHalf), false);
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
