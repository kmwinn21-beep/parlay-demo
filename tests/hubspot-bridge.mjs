/**
 * The HubSpot bridge: the pairing key, and the file it arrives in.
 *
 *   node --experimental-strip-types --import ./tests/register-ts.mjs \
 *        tests/hubspot-bridge.mjs
 *
 * Records are paired on HubSpot's record id rather than on email. The id
 * arrives two ways — a bare number in the file Kristian sends, and a pasted
 * record URL when a rep adds somebody off a HubSpot tab — and one rule has to
 * read both.
 *
 * The mapping is RUN against the real sample's headers rather than asserted
 * from the source, because the column names are matched partly by substring:
 * `hubspot_contact` is already a CRM-link alias and `company` is a
 * company-name alias, so `hubspot_contact_id` and `hubspot_company_id` file
 * themselves in the wrong field unless claimed first. Reading the alias list
 * would not have caught that; running the headers does.
 *
 * Exits non-zero on the first failing expectation, so it can gate a build.
 */
import { readFileSync } from 'node:fs';

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

const { parseHubSpotId, hubspotRecordUrl, HUBSPOT_OBJECT } =
  await import('@/lib/hubspotIds');
const { suggestMapping } = await import('@/lib/parsers');

console.log('\n— the id, out of whatever carries it —');
{
  // The file in sends a bare id.
  eq('a bare id is itself', parseHubSpotId('868180624625'), '868180624625');
  eq('  trimmed', parseHubSpotId('  868180624625 '), '868180624625');

  /*
   * A pasted record URL. The host carries the region and the first number is
   * the portal, and both differ per account — so the match is on
   * `/record/<type>/<id>`, which is the stable part.
   */
  const contact = 'https://app-eu1.hubspot.com/contacts/27243282/record/0-1/868180624625';
  const company = 'https://app-eu1.hubspot.com/contacts/27243282/record/0-2/419720813816';
  eq('a contact link gives the contact id', parseHubSpotId(contact), '868180624625');
  eq('  and a company link the company id', parseHubSpotId(company), '419720813816');
  // Not the portal, which is also a number and sits earlier in the path.
  eq('  never the portal id', parseHubSpotId(contact) === '27243282', false);
  // A US portal is on a different host and must read the same.
  eq('  whatever region the portal is in',
    parseHubSpotId('https://app.hubspot.com/contacts/999/record/0-1/12345'), '12345');
  eq('  with a trailing slash or query',
    [parseHubSpotId(contact + '/'), parseHubSpotId(contact + '?x=1')],
    ['868180624625', '868180624625']);

  /*
   * Nothing readable gives null, never a guess.
   *
   * A URL ending in digits is not a HubSpot id. Accepting one would store a
   * LinkedIn or Salesforce fragment as the key a whole export pairs on.
   */
  eq('a non-hubspot url is not an id',
    parseHubSpotId('https://www.linkedin.com/in/andrew-briefer-b11198a'), null);
  eq('  even when it ends in numbers',
    parseHubSpotId('https://example.com/people/12345'), null);
  eq('  and neither is a name', parseHubSpotId('Andrew Briefer'), null);
  eq('  nor nothing at all', [parseHubSpotId(''), parseHubSpotId(null), parseHubSpotId(undefined)],
    [null, null, null]);

  /*
   * Ids stay strings.
   *
   * HubSpot's are 12 digits, which fits a double today. They are opaque
   * identifiers rather than quantities, and parsing one through a float is
   * how a longer id would one day round to a different record.
   */
  eq('an id is a string', typeof parseHubSpotId('868180624625'), 'string');
  eq('  and keeps every digit', parseHubSpotId('9007199254740993'), '9007199254740993');
}

console.log('\n— the link, back out of the id —');
{
  const portal = { portalId: '27243282', appHost: 'app-eu1' };
  eq('a contact link is built from the id',
    hubspotRecordUrl(portal, 'contact', '868180624625'),
    'https://app-eu1.hubspot.com/contacts/27243282/record/0-1/868180624625');
  eq('  and a company link uses the company object',
    hubspotRecordUrl(portal, 'company', '419720813816'),
    'https://app-eu1.hubspot.com/contacts/27243282/record/0-2/419720813816');
  // 0-1 and 0-2 are HubSpot's own object ids, the same in every portal.
  eq('  from HubSpot’s own object codes',
    [HUBSPOT_OBJECT.contact, HUBSPOT_OBJECT.company], ['0-1', '0-2']);
  // Round trip: a link built from an id reads back as that id.
  eq('  and reads back as the same id',
    parseHubSpotId(hubspotRecordUrl(portal, 'contact', '868180624625')), '868180624625');

  /*
   * No portal, no link — not a guessed one.
   *
   * A link to the wrong portal looks right and lands on somebody else's CRM.
   * Where this is null the caller shows the id as text, which is still the
   * pairing key.
   */
  // Caught, not left to throw: dropping the guard reaches through a null
  // portal, and a TypeError kills the run before the assertions after it.
  const url = (...a) => { try { return hubspotRecordUrl(...a); } catch { return 'THREW'; } };
  eq('an unconfigured portal gives no link', url(null, 'contact', '868180624625'), null);
  eq('  nor when it is missing entirely', url(undefined, 'contact', '868180624625'), null);
  eq('  nor half a one',
    [url({ portalId: '27243282', appHost: '' }, 'contact', '1'),
     url({ portalId: '', appHost: 'app-eu1' }, 'contact', '1')], [null, null]);
  eq('  and no id gives none either', hubspotRecordUrl(portal, 'contact', null), null);
}

console.log('\n— the file in, mapped —');
{
  // The sample's headers, verbatim (nic_file_in_sample.csv, spec v0.1 §3).
  const headers = [
    'hubspot_contact_id', 'hubspot_company_id', 'first_name', 'last_name',
    'job_title', 'company_name', 'email', 'phone', 'linkedin_url', 'rep_email',
    'account_status', 'open_deal_stage', 'event_code',
  ];
  const m = suggestMapping(headers);

  /*
   * The two that used to go wrong, and why this is run rather than read.
   *
   * findColumn falls back to a SUBSTRING match, and `hubspot_contact` is a
   * CRM-contact-link alias — so `hubspot_contact_id` filed itself as a link,
   * putting a bare id in a field the UI renders as a URL. `company` is a
   * company-name alias and matches inside `hubspot_company_id` the same way.
   */
  eq('the contact id is an id, not a CRM link', m.hubspot_contact_id, 'hubspot_contact_id');
  eq('  and does not land in the link field', m.crm_contact_link, null);
  eq('the company id is claimed too', m.hubspot_company_id, 'hubspot_company_id');
  eq('  without stealing the company name', m.company, 'company_name');

  // The other three that were dropped on the floor before this.
  eq('the phone is carried', m.phone, 'phone');
  eq('  and the event code', m.event_code, 'event_code');

  // The plain ones, so a change to the ordering above cannot quietly break them.
  eq('the ordinary columns still map',
    [m.first_name, m.last_name, m.title, m.email, m.linkedin_url],
    ['first_name', 'last_name', 'job_title', 'email', 'linkedin_url']);

  /*
   * Two are still unmapped, on purpose.
   *
   * account_status and open_deal_stage are HubSpot's own vocabulary
   * ("Prospectable", "Capital Partners: Revenue") and Parlay has no field
   * that means either. Mapping account_status onto Parlay's own status would
   * be worse than dropping it: reps would edit a familiar field during the
   * conference and the edit would go nowhere, because nothing syncs back.
   */
  const claimed = new Set(Object.values(m).filter(v => typeof v === 'string'));
  eq('HubSpot’s own vocabulary is left out',
    headers.filter(h => !claimed.has(h)), ['account_status', 'open_deal_stage']);
}

console.log('\n— a link pasted by hand reads the same as a file id —');
{
  // What a rep actually does: copies the URL out of a HubSpot tab.
  const headers = ['first_name', 'last_name', 'company_name', 'hubspot_contact_id'];
  const m = suggestMapping(headers);
  eq('the column is found either way', m.hubspot_contact_id, 'hubspot_contact_id');
  // The parse is what makes the two shapes the same thing; that is covered
  // above. This is that the parser is applied at all on the way in.
  const parsers = strip('lib/parsers.ts');
  eq('  and the parser stores the id, not the cell',
    /const id = parseHubSpotId\(row\[mapping\.hubspot_contact_id\]\);/.test(parsers), true);
  eq('    for the company too',
    /const id = parseHubSpotId\(row\[mapping\.hubspot_company_id\]\);/.test(parsers), true);
  // Unreadable leaves the field unset rather than storing junk that would be
  // exported later as a pairing key.
  eq('    and leaves it unset when it cannot',
    /if \(id\) attendee\.hubspot_contact_id = id;/.test(parsers), true);
}

console.log('\n— the key is written once —');
{
  const upload = strip('app/api/conferences/[id]/attendees/upload/route.ts');
  const attendee = strip('app/api/attendees/[id]/route.ts');

  /*
   * A re-upload must not re-point a record.
   *
   * Changing the id silently moves a person's whole conference history to a
   * different HubSpot record, so a file can fill a blank one and nothing
   * more.
   */
  eq('a file fills a blank contact id and stops there',
    /hubspot_contact_id = CASE WHEN \(hubspot_contact_id IS NULL OR hubspot_contact_id = ''\) THEN \? ELSE hubspot_contact_id END/.test(upload), true);
  eq('  and the same for the company',
    /hubspot_company_id = CASE WHEN \(hubspot_company_id IS NULL OR hubspot_company_id = ''\) THEN \? ELSE hubspot_company_id END/.test(upload), true);
  /*
   * NOT through addCoField, which is how the other company columns are
   * written. Its COALESCE(?, field) takes the new value whenever one is
   * supplied — right for a website, wrong for a pairing key.
   */
  eq('  not through the helper that overwrites',
    /addCoField\('hubspot_company_id'/.test(upload), false);

  // And on the record itself: settable while blank, admin-only after.
  eq('the attendee route guards the id',
    /authResult\.role !== 'administrator'/.test(attendee), true);
  eq('  comparing against what is stored',
    /SELECT hubspot_contact_id FROM attendees WHERE id = \?/.test(attendee), true);
  eq('  and refuses rather than silently ignoring',
    /status: 403/.test(attendee), true);
  /*
   * Server-side, not a disabled input. This route takes the value straight
   * off the body, so a read-only field in the form is a suggestion.
   */
  eq('  rejecting anything that is not an id',
    /That does not look like a HubSpot contact id or record link\./.test(attendee), true);
}

console.log('\n— the migration is appended —');
{
  const mig = readFileSync('lib/db-migrations.ts', 'utf8');
  /*
   * The runner applies `migrations.slice(appliedCount)`. Inserting rather than
   * appending shifts every later index, so a database already at the old count
   * skips the inserted rows and re-runs the ones that took their place. The
   * new columns would simply never exist.
   */
  const tail = mig.slice(mig.lastIndexOf('ALTER TABLE attendees ADD COLUMN hubspot_contact_id'));
  eq('the bridge columns are at the end of the list',
    /^[\s\S]*ALTER TABLE conferences ADD COLUMN event_code TEXT`,\s*\n\];\s*$/.test(tail), true);
  for (const col of [
    'ALTER TABLE attendees ADD COLUMN hubspot_contact_id TEXT',
    'ALTER TABLE companies ADD COLUMN hubspot_company_id TEXT',
    'ALTER TABLE conferences ADD COLUMN event_code TEXT',
  ]) {
    eq(`  ${col.split('COLUMN ')[1].split(' ')[0]} is there`, mig.includes(col), true);
  }
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
