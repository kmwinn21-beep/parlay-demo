/**
 * Whose relationship the IR badge is about.
 *
 *   node --experimental-strip-types --import ./tests/register-ts.mjs \
 *        tests/internal-relationships.mjs
 *
 * The competitive grid marks a company IR when somebody at the account knows
 * somebody there — an account-wide read. The column that badge opens was
 * filled from the conference's own pre-conference payload, which resolves a
 * relationship's contacts against THAT show's attendee list. A relationship
 * tagged on people who did not come therefore arrived with no contacts on it,
 * and the column said "no internal relationships with anyone at this
 * conference" about a company whose own record showed two.
 *
 * Both halves are checked: the loader is RUN against a real SQLite database
 * seeded to that exact shape — the contacts deliberately not at the
 * conference — and the wiring is read, because a correct loader nothing calls
 * fixes nothing.
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

const { loadInternalRelationships, shapeInternalRows } =
  await import('@/lib/internalRelationshipRows');

const require_ = createRequire(process.cwd() + '/package.json');
const { createClient } = require_('@libsql/client');

const dir = mkdtempSync(join(tmpdir(), 'ir-'));
const db = createClient({ url: `file:${join(dir, 'fx.db')}` });
const x = (sql) => db.execute(sql);

/*
 * The reported case, as stored.
 *
 * Anthem Memory Care is on the map and carries two internal relationships.
 * Neither of the people they are tagged on — Lewis McCoy, Isaac Scott — is at
 * conference 17. Dana Reyes, at another company, IS, so a test that simply
 * read every attendee would still pass; she is here to make that fail.
 */
await x(`CREATE TABLE companies (id INTEGER PRIMARY KEY, name TEXT)`);
await x(`CREATE TABLE attendees (id INTEGER PRIMARY KEY, first_name TEXT, last_name TEXT, title TEXT, seniority TEXT, company_id INTEGER)`);
await x(`CREATE TABLE config_options (id INTEGER PRIMARY KEY, category TEXT, value TEXT)`);
await x(`CREATE TABLE internal_relationships (id INTEGER PRIMARY KEY, company_id INTEGER, rep_ids TEXT, contact_ids TEXT, relationship_status TEXT, description TEXT)`);
await x(`CREATE TABLE conference_attendees (conference_id INTEGER, attendee_id INTEGER)`);
await x(`INSERT INTO companies VALUES (7,'Anthem Memory Care LLC'),(8,'Civitas Senior Living'),(9,'MorningStar Senior Living')`);
await x(`INSERT INTO attendees VALUES
  (41,'Lewis','McCoy','President',NULL,7),
  (42,'Isaac','Scott','CEO',NULL,7),
  (43,'Dana','Reyes','VP of Ops',21,8)`);
await x(`INSERT INTO conference_attendees VALUES (17,43)`);
await x(`INSERT INTO config_options VALUES
  (1,'user','Kevin Winn'),(2,'user','Dan Poe'),
  (11,'rep_relationship_type','Former Client'),(12,'rep_relationship_type','Trusted'),
  (21,'seniority','Director')`);
await x(`INSERT INTO internal_relationships VALUES
  (100,7,'1','41,42','11,12','Former client at Eldermark. Trusted relationship'),
  (101,8,'2','43','11','Met at NCAL'),
  (102,7,'1','41,999','12','One tagged contact no longer exists')`);

console.log('\n— the relationship is found whether or not its people came —');
{
  const rows = await loadInternalRelationships(db, [7, 8, 9]);
  const anthem = rows.filter(r => r.company_id === 7);
  eq('both of the company’s relationships come back', anthem.length, 2);
  // The whole bug: these two are not at conference 17.
  eq('  with the people they were tagged on',
    (anthem[0]?.attendees ?? []).map(a => `${a.first_name} ${a.last_name}`), ['Lewis McCoy', 'Isaac Scott']);
  eq('  named for the card’s header too', anthem[0]?.contact_names, ['Lewis McCoy', 'Isaac Scott']);
  // Proof the fixture is the reported shape rather than one that would pass
  // either way: nobody from this company was at the show.
  const atConf = await db.execute(`SELECT attendee_id FROM conference_attendees WHERE conference_id = 17`);
  eq('  none of whom attended the conference',
    atConf.rows.map(r => Number(r.attendee_id)).some(id => id === 41 || id === 42), false);
  // And the attendee who DID come is not swept in with them: reading every
  // attendee, or every attendee at the show, would put Dana here.
  eq('  and nobody else is swept in',
    rows.flatMap(r => r.contact_names).includes('Dana Reyes') &&
    anthem.flatMap(r => r.contact_names).includes('Dana Reyes'), false);

  // Stored ids read as the words a person wrote, not as numbers.
  eq('the reps are named', anthem[0]?.rep_names, ['Kevin Winn']);
  eq('  the statuses are spelled out', anthem[0]?.relationship_status, 'Former Client, Trusted');
  eq('  the company is named', anthem[0]?.company_name, 'Anthem Memory Care LLC');
  eq('  and the note is carried verbatim',
    anthem[0]?.description, 'Former client at Eldermark. Trusted relationship');

  /*
   * contact_ids is a comma-separated column with no foreign key behind it, so
   * it outlives the attendees it names. An id left in would draw a card with a
   * blank name over a dead link.
   */
  eq('a contact that no longer exists is dropped', anthem[1]?.contact_names, ['Lewis McCoy']);
  eq('  and the relationship itself survives it', anthem[1]?.description, 'One tagged contact no longer exists');

  // A company with no relationships is absent, not present and empty.
  eq('a company with none is not in the answer', rows.some(r => r.company_id === 9), false);
  eq('  and asking about nobody answers nothing', await loadInternalRelationships(db, []), []);
}

console.log('\n— seniority: stored where there is one, read off the title where there is not —');
{
  const rows = await loadInternalRelationships(db, [7, 8]);
  // Optional all the way down: a regression that empties `attendees` should
  // read as a failed expectation here, not as a crash that hides the ones
  // after it.
  const dana = rows.find(r => r.company_id === 8)?.attendees[0];
  eq('a stored id resolves to its label', dana?.seniority, 'Director');
  const lewis = rows.find(r => r.company_id === 7)?.attendees[0];
  eq('  and an unset one is inferred from the title', lewis?.seniority, 'C-Suite');
}

console.log('\n— the shaping, without a database under it —');
{
  const shaped = shapeInternalRows(
    [{ id: 1, company_id: 5, rep_ids: '1', contact_ids: '', relationship_status: '11', description: 'Knows the CFO' }],
    {
      companyNames: new Map([[5, 'Ebenezer']]),
      userNames: new Map([[1, 'Kevin Winn']]),
      statusLabels: new Map([[11, 'Former Client']]),
      seniorityLabels: new Map(),
      contacts: new Map(),
    },
  );
  // A relationship recorded against a company with nobody tagged on it is a
  // real row: the rep wrote down what they know before naming who.
  eq('a relationship with no contacts is still a relationship', shaped.length, 1);
  eq('  carrying no people', shaped[0]?.attendees, []);
  eq('  and still saying what it says', shaped[0]?.description, 'Knows the CFO');
  // An id with no option behind it keeps the id rather than vanishing, so a
  // half-configured account shows something rather than a blank pill.
  const unknown = shapeInternalRows(
    [{ id: 2, company_id: 5, rep_ids: '77', contact_ids: '', relationship_status: '88', description: '' }],
    { companyNames: new Map(), userNames: new Map(), statusLabels: new Map(), seniorityLabels: new Map(), contacts: new Map() },
  );
  eq('an unresolvable rep id is shown rather than dropped', unknown[0]?.rep_names, ['77']);
  eq('  and so is a status', unknown[0]?.relationship_status, '88');
}

rmSync(dir, { recursive: true, force: true });

console.log('\n— and the map actually uses it —');
{
  const route = strip('app/api/conferences/[id]/relationship-map/route.ts');
  const modal = strip('components/RelationshipMapModal.tsx');

  eq('the route loads them', /loadInternalRelationships\(db, ids\)/.test(route), true);
  eq('  and sends them', /^\s*internalRows,$/m.test(route), true);
  /*
   * On every path it can take.
   *
   * The route returns early when there is nothing to map, and an early return
   * missing the field leaves the browser reading `undefined` — which in the
   * column looks exactly like the bug this fixes.
   */
  const empties = (route.match(/companiesWithInternal: \[\],/g) ?? []).length;
  const emptiesWithRows = (route.match(/companiesWithInternal: \[\], internalRows: \[\],/g) ?? []).length;
  eq('  including the early returns', empties > 0 && emptiesWithRows === empties, true);

  // The modal reads the map's payload, NOT the conference's pre-conference
  // one. That import was the bug.
  eq('the column reads the map’s own rows',
    /competitiveData\.internalRows\s*\n?\s*\.filter\(r => r\.company_id === companyId\)/.test(modal), true);
  // The conference-scoped fetch is gone, not merely unused — it was a second
  // request for the whole pre-conference payload to fill one column.
  // (The file still imports the CARD and the ROW TYPE from those modules;
  // what had to go is the request, so that is what is checked.)
  eq('  and no longer fetches the conference’s payload for it',
    /\/pre-conference`/.test(modal), false);
  eq('    nor reads a relationships field off one',
    /d\.relationships|setInternal\(/.test(modal), false);
  // The empty state no longer blames the conference, because the conference is
  // no longer what narrowed it.
  eq('  and says plainly when a company really has none',
    /No internal relationships recorded for this company\./.test(modal), true);
  eq('    rather than the old conference-scoped excuse',
    /with anyone at this conference/.test(modal), false);
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
