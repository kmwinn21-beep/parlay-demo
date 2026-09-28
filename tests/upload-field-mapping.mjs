/**
 * Link columns as mapped upload fields: CRM Link, CRM Contact Link, LinkedIn URL.
 *
 *   node --experimental-strip-types --import ./tests/register-ts.mjs \
 *        tests/upload-field-mapping.mjs
 *
 * The two sit at different levels, which is most of what there is to get
 * wrong. CRM Link is COMPANY-level — one link per company record, repeated on
 * every attendee row of that company in the file — and lands on `companies`.
 * LinkedIn URL and CRM Contact Link are ATTENDEE-level, one per person, and
 * land on `attendees`.
 *
 * CRM Link and CRM Contact Link are the pair most easily confused, and not only
 * by a reader: `crm` is one of CRM Link's aliases and it is matched as a
 * SUBSTRING, so "CRM Contact Link" hits it. The contact column is claimed first
 * and withheld from the company lookup — otherwise a rep's contact record was
 * filed as the account's, and clicking through from a company took you to one
 * person.
 *
 * Three things have to hold for either to survive an upload, and each is a
 * separate section below.
 *
 *   1. The header is recognised — by both parse paths. There are two: the
 *      explicit-mapping path (suggestMapping → the mapping modal → the user's
 *      choice) and the auto-detect path (parseFile, used when no mapping is
 *      supplied). They carry independent alias lists, so a fix to one is not a
 *      fix to the other.
 *
 *   2. The value reaches ParsedAttendee.crm_link, again on both paths.
 *
 *   3. The column round-trips through the database with the exact SQL the
 *      upload routes run. The statements are not retyped here — they are
 *      pulled out of the route sources, so the test fails if a route stops
 *      writing the column.
 *
 * The header collision in section 1 is the reason this file exists rather than
 * a couple of lines bolted onto an existing test. Website's alias `url` is
 * matched as a SUBSTRING, so "CRM URL", "Salesforce URL" and "LinkedIn URL"
 * all hit it. Both of the specific fields are claimed before Website is looked
 * up; without that a person's LinkedIn profile was filed as their company's
 * website — a wrong value, not a missing one, which is the harder kind to
 * notice on a list of a few thousand rows.
 *
 * Exits non-zero on the first failing expectation, so it can gate a build.
 */
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir = mkdtempSync(join(tmpdir(), 'parlay-crm-'));
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

/**
 * Run a block that touches the database, counting a throw as a failure.
 *
 * Every column under test here reaches a tenant through the migrations list, so
 * dropping one entry makes each statement below raise "no such column" — and a
 * suite that dies on the first one exits non-zero with no summary, which reads
 * like a broken test rather than a broken column. The sections are independent,
 * so one failing has nothing to say about the next.
 */
const guarded = async (label, fn) => {
  try { await fn(); }
  catch (err) { fail++; console.log(`  FAIL ${label} threw\n       ${err.message}`); }
};

const { suggestMapping, parseFileWithMapping, parseFile } = await import('@/lib/parsers');
const { SYSTEM_FIELD_LABELS, FIELD_ORDER } = await import('@/lib/columnMapping');

/** A one-row CSV with the given headers, as the upload routes would receive it. */
const csv = (headers, values) =>
  Buffer.from(`${headers.join(',')}\n${values.join(',')}\n`, 'utf-8');

// ── 1. The header is recognised ──────────────────────────────────────────────

console.log('\n— the mapping modal offers CRM Link —');
{
  // The modal renders FIELD_ORDER and labels from SYSTEM_FIELD_LABELS, so
  // presence in both is what puts the field in front of the user.
  eq('CRM Link is an offered field', FIELD_ORDER.includes('crm_link'), true);
  eq('  and has a label to render', SYSTEM_FIELD_LABELS.crm_link?.label, 'CRM Link');
  eq('LinkedIn URL is an offered field', FIELD_ORDER.includes('linkedin_url'), true);
  eq('  and has a label to render', SYSTEM_FIELD_LABELS.linkedin_url?.label, 'LinkedIn URL');
  eq('CRM Contact Link is an offered field', FIELD_ORDER.includes('crm_contact_link'), true);
  eq('  and has a label to render', SYSTEM_FIELD_LABELS.crm_contact_link?.label, 'CRM Contact Link');
}

console.log('\n— suggestMapping recognises the header —');
for (const h of ['CRM Link', 'crm_link', 'CRM URL', 'Salesforce URL', 'sfdc_link',
                 'HubSpot Link', 'Account URL', 'Record Link']) {
  eq(`"${h}" maps to crm_link`, suggestMapping(['Name', 'Company', h]).crm_link, h);
}
{
  eq('a file with no such header maps it to null',
    suggestMapping(['Name', 'Company', 'Email']).crm_link, null);
}

console.log('\n— suggestMapping recognises the LinkedIn header —');
for (const h of ['LinkedIn URL', 'linkedin_url', 'LinkedIn', 'Linked In',
                 'LinkedIn Profile', 'LinkedIn Profile URL', 'li_url']) {
  eq(`"${h}" maps to linkedin_url`, suggestMapping(['Name', 'Company', h]).linkedin_url, h);
}
{
  eq('a file with no such header maps it to null',
    suggestMapping(['Name', 'Company', 'Email']).linkedin_url, null);
}

console.log('\n— suggestMapping recognises the contact-record header —');
for (const h of ['CRM Contact Link', 'crm_contact_link', 'CRM Contact URL',
                 'Salesforce Contact', 'sfdc_contact', 'HubSpot Contact',
                 'Contact Link', 'Contact URL', 'Contact Record', 'Lead URL']) {
  eq(`"${h}" maps to crm_contact_link`,
    suggestMapping(['Name', 'Company', h]).crm_contact_link, h);
}
{
  eq('a file with no such header maps it to null',
    suggestMapping(['Name', 'Company', 'Email']).crm_contact_link, null);
}

console.log('\n— and does not confuse the contact record with the account —');
{
  // The collision this pair exists to survive: CRM Link's alias list carries
  // the bare `crm`, matched as a substring, so "CRM Contact Link" hits it. The
  // contact column is claimed first and removed from CRM Link's candidates.
  const contactOnly = suggestMapping(['Company', 'CRM Contact Link']);
  eq('a contact link alone is not filed as the account link',
    [contactOnly.crm_link, contactOnly.crm_contact_link], [null, 'CRM Contact Link']);

  const both = suggestMapping(['Company', 'CRM Link', 'CRM Contact Link']);
  eq('with both present, each gets its own',
    [both.crm_link, both.crm_contact_link], ['CRM Link', 'CRM Contact Link']);

  const accountOnly = suggestMapping(['Company', 'CRM Link']);
  eq('and an account link alone is still the account link',
    [accountOnly.crm_link, accountOnly.crm_contact_link], ['CRM Link', null]);

  // Nor with the website, by the same `url` substring that catches the others.
  // With no website column at all, so a real Website header cannot satisfy the
  // lookup by exact match and hide a missing claim.
  const noWeb = suggestMapping(['Company', 'Contact URL']);
  eq('a contact URL alone is not filed as the website',
    [noWeb.website, noWeb.crm_contact_link], [null, 'Contact URL']);

  const withWeb = suggestMapping(['Company', 'Website', 'Contact URL']);
  eq('and beside a real website, each gets its own',
    [withWeb.website, withWeb.crm_contact_link], ['Website', 'Contact URL']);

  // A person's name column must survive beside it — "Contact Name" and
  // "Contact Link" differ by one word.
  const named = suggestMapping(['Contact Name', 'Company', 'Contact Link']);
  eq('a contact NAME column is still the name',
    [named.full_name, named.crm_contact_link], ['Contact Name', 'Contact Link']);
}

console.log('\n— and does not confuse it with Website —');
{
  // The one that bit hardest: a person's profile filed as their company's site.
  const li = suggestMapping(['Company', 'LinkedIn URL']);
  eq('a LinkedIn URL alone is not filed as the website',
    [li.website, li.linkedin_url], [null, 'LinkedIn URL']);

  const all = suggestMapping(['Company', 'Website', 'LinkedIn URL', 'CRM URL']);
  eq('all three link columns land on their own field',
    [all.website, all.linkedin_url, all.crm_link],
    ['Website', 'LinkedIn URL', 'CRM URL']);
}

{
  // The collision: Website's alias list includes the bare `url`, which
  // partial-matches "crm_url" and "salesforce_url". CRM Link is claimed first
  // and removed from Website's candidates, so each header lands on one field.
  const both = suggestMapping(['Company', 'Website', 'CRM URL']);
  eq('with both columns present, each gets its own', [both.website, both.crm_link],
    ['Website', 'CRM URL']);

  const crmOnly = suggestMapping(['Company', 'Salesforce URL']);
  eq('a CRM URL alone is not filed as the website',
    [crmOnly.website, crmOnly.crm_link], [null, 'Salesforce URL']);

  const webOnly = suggestMapping(['Company', 'Company Website']);
  eq('and a website alone is still the website',
    [webOnly.website, webOnly.crm_link], ['Company Website', null]);
}

// ── 2. The value reaches ParsedAttendee ──────────────────────────────────────

const LINK = 'https://crm.example.com/Account/001xx';

console.log('\n— the mapped parse path carries the value —');
{
  const headers = ['First Name', 'Last Name', 'Company', 'CRM Link'];
  const buf = csv(headers, ['Dana', 'Reyes', 'Belmont Care', LINK]);
  const [a] = await parseFileWithMapping(buf, 'list.csv', suggestMapping(headers));
  eq('crm_link is parsed', a.crm_link, LINK);
  eq('  alongside the rest of the row', [a.first_name, a.company], ['Dana', 'Belmont Care']);
}
{
  // An unmapped CRM column must not leak in by header name — the user's
  // mapping is the authority on that path.
  const headers = ['First Name', 'Last Name', 'Company', 'CRM Link'];
  const mapping = { ...suggestMapping(headers), crm_link: null };
  const [a] = await parseFileWithMapping(csv(headers, ['Dana', 'Reyes', 'Belmont Care', LINK]), 'l.csv', mapping);
  eq('an explicitly unmapped column is dropped', a.crm_link, undefined);
}
{
  const headers = ['First Name', 'Last Name', 'Company', 'CRM Link'];
  const [a] = await parseFileWithMapping(csv(headers, ['Dana', 'Reyes', 'Belmont Care', '  ']), 'l.csv', suggestMapping(headers));
  // Trimmed to empty rather than dropped — the parser's house behaviour for
  // every field, and the routes guard with `?.trim()`, so it never reaches a
  // column. Asserted as falsy so a blank can never be written over a real link.
  eq('a blank cell yields nothing to write', a.crm_link || null, null);
}

console.log('\n— the auto-detect parse path carries it too —');
{
  const buf = csv(['First Name', 'Last Name', 'Company', 'Salesforce URL'],
                  ['Dana', 'Reyes', 'Belmont Care', LINK]);
  const [a] = await parseFile(buf, 'list.csv');
  eq('crm_link is detected without a mapping', a.crm_link, LINK);
  eq('  and did not land on website instead', a.website, undefined);
}
{
  const buf = csv(['Full Name', 'Company', 'Website', 'CRM Link'],
                  ['Dana Reyes', 'Belmont Care', 'belmont.com', LINK]);
  const [a] = await parseFile(buf, 'list.csv');
  eq('both columns survive side by side', [a.website, a.crm_link], ['belmont.com', LINK]);
}

const PROFILE = 'https://www.linkedin.com/in/dana-reyes';

console.log('\n— LinkedIn survives both parse paths —');
{
  const headers = ['First Name', 'Last Name', 'Company', 'Website', 'LinkedIn URL'];
  const row = ['Dana', 'Reyes', 'Belmont Care', 'belmont.com', PROFILE];
  const [mapped] = await parseFileWithMapping(csv(headers, row), 'l.csv', suggestMapping(headers));
  eq('mapped path: linkedin_url is parsed', mapped.linkedin_url, PROFILE);
  eq('  and the website is still the website', mapped.website, 'belmont.com');

  const [auto] = await parseFile(csv(headers, row), 'l.csv');
  eq('auto-detect path: linkedin_url is parsed', auto.linkedin_url, PROFILE);
  eq('  and the website is still the website', auto.website, 'belmont.com');
}
{
  // Without a website column at all, the profile must not slide into website.
  const [auto] = await parseFile(
    csv(['Full Name', 'Company', 'LinkedIn URL'], ['Dana Reyes', 'Belmont Care', PROFILE]), 'l.csv');
  eq('with no website column, the profile stays put',
    [auto.website, auto.linkedin_url], [undefined, PROFILE]);
}
{
  const headers = ['First Name', 'Last Name', 'LinkedIn URL'];
  const mapping = { ...suggestMapping(headers), linkedin_url: null };
  const [a] = await parseFileWithMapping(csv(headers, ['Dana', 'Reyes', PROFILE]), 'l.csv', mapping);
  eq('an explicitly unmapped column is dropped', a.linkedin_url, undefined);
}

const CONTACT = 'https://crm.example.com/lightning/r/Contact/003zz/view';

console.log('\n— the contact record survives both parse paths —');
{
  const headers = ['First Name', 'Last Name', 'Company', 'Website', 'CRM Link', 'CRM Contact Link'];
  const row = ['Dana', 'Reyes', 'Belmont Care', 'belmont.com', LINK, CONTACT];

  const [mapped] = await parseFileWithMapping(csv(headers, row), 'l.csv', suggestMapping(headers));
  eq('mapped path: crm_contact_link is parsed', mapped.crm_contact_link, CONTACT);
  eq('  and the account link is still the account link', mapped.crm_link, LINK);

  const [auto] = await parseFile(csv(headers, row), 'l.csv');
  eq('auto-detect path: crm_contact_link is parsed', auto.crm_contact_link, CONTACT);
  eq('  and the account link is still the account link', auto.crm_link, LINK);
  eq('  and the website is still the website', auto.website, 'belmont.com');
}
{
  // With only the contact column present, the auto-detect path must not file it
  // as the company's — the two alias lists are independent of suggestMapping's.
  const [auto] = await parseFile(
    csv(['Full Name', 'Company', 'CRM Contact Link'], ['Dana Reyes', 'Belmont Care', CONTACT]), 'l.csv');
  eq('with no account column, the contact link stays put',
    [auto.crm_link, auto.crm_contact_link], [undefined, CONTACT]);
}
{
  // And with no website column either, so nothing exact-matches Website's
  // `url` alias ahead of the substring that would otherwise catch this one.
  const [auto] = await parseFile(
    csv(['Full Name', 'Company', 'Contact URL'], ['Dana Reyes', 'Belmont Care', CONTACT]), 'l.csv');
  eq('auto-detect path: a contact URL is not filed as the website',
    [auto.website, auto.crm_contact_link], [undefined, CONTACT]);
}
{
  const headers = ['First Name', 'Last Name', 'CRM Contact Link'];
  const mapping = { ...suggestMapping(headers), crm_contact_link: null };
  const [a] = await parseFileWithMapping(csv(headers, ['Dana', 'Reyes', CONTACT]), 'l.csv', mapping);
  eq('an explicitly unmapped column is dropped', a.crm_contact_link, undefined);
}
{
  const headers = ['First Name', 'Last Name', 'CRM Contact Link'];
  const [a] = await parseFileWithMapping(csv(headers, ['Dana', 'Reyes', '  ']), 'l.csv', suggestMapping(headers));
  eq('a blank cell yields nothing to write', a.crm_contact_link || null, null);
}

// ── 3. The routes actually write the column ──────────────────────────────────

const { createClient } = await import('@libsql/client');
const { seedFreshDb } = await import('@/lib/db');

/**
 * Pull a SQL literal out of a route's source. Retyping the statement here
 * would let the route drop the column while the test stayed green.
 */
const sqlFrom = (file, needle) => {
  const src = readFileSync(file, 'utf-8');
  const line = src.split('\n').find(l => l.includes(needle));
  if (!line) throw new Error(`no line containing ${needle} in ${file}`);
  const m = line.match(/'([^']*)'/);
  if (!m) throw new Error(`no SQL literal on that line in ${file}`);
  return m[1];
};

const UPLOAD = 'app/api/conferences/[id]/attendees/upload/route.ts';
const CREATE = 'app/api/conferences/route.ts';

/**
 * Column names of a route's INSERT, in the order its placeholders expect.
 * Quoted identifiers ("function") are unwrapped.
 */
const insertCols = (sql) =>
  sql.match(/\(([^)]*)\)/)[1].split(',').map(s => s.trim().replace(/"/g, ''));

/**
 * Build the args for one of those INSERTs: the field under test gets `value`,
 * and every other column gets null — except NOT NULL ones, which get a filler.
 * A column default does not rescue those: the statement names them, so it
 * passes an explicit NULL and the constraint still fires. Read from the table
 * rather than listed here, so a new NOT NULL column does not turn into a
 * mystery crash in this test.
 */
async function argsFor(client, table, cols, field, value) {
  const info = await client.execute(`PRAGMA table_info(${table})`);
  const required = new Set(info.rows
    .filter(r => Number(r.notnull) === 1 && Number(r.pk) !== 1)
    .map(r => String(r.name)));
  return cols.map(c => (c === field ? value : required.has(c) ? 'x' : null));
}

console.log('\n— the upload routes insert the column —');
await guarded('the company-link INSERTs', async () => {
  const client = createClient({ url: `file:${join(dir, 'tenant.db')}` });
  await seedFreshDb(client);

  for (const [name, file] of [['attendee upload', UPLOAD], ['conference create', CREATE]]) {
    const sql = sqlFrom(file, 'INSERT INTO companies');
    const cols = insertCols(sql);
    eq(`${name}: crm_link is in the INSERT`, cols.includes('crm_link'), true);

    // Run the route's own statement, with the link in crm_link's position and
    // nothing meaningful anywhere else, then read the row back.
    const res = await client.execute({ sql, args: await argsFor(client, 'companies', cols, 'crm_link', LINK) });
    const id = Number(res.rows[0].id);
    const back = await client.execute({ sql: 'SELECT crm_link FROM companies WHERE id = ?', args: [id] });
    eq(`  and the value is stored`, back.rows[0].crm_link, LINK);
  }
});

console.log('\n— the upload routes insert the LinkedIn column —');
await guarded('the LinkedIn INSERTs', async () => {
  const client = createClient({ url: `file:${join(dir, 'attendees.db')}` });
  await seedFreshDb(client);

  for (const [name, file] of [['attendee upload', UPLOAD], ['conference create', CREATE]]) {
    const sql = sqlFrom(file, 'INSERT INTO attendees');
    const cols = insertCols(sql);
    eq(`${name}: linkedin_url is in the INSERT`, cols.includes('linkedin_url'), true);

    const res = await client.execute({ sql, args: await argsFor(client, 'attendees', cols, 'linkedin_url', PROFILE) });
    const back = await client.execute({
      sql: 'SELECT linkedin_url FROM attendees WHERE id = ?', args: [Number(res.rows[0].id)] });
    eq('  and the value is stored', back.rows[0].linkedin_url, PROFILE);
  }
});

console.log('\n— the column exists on a fresh tenant —');
await guarded('the migration adds crm_contact_link', async () => {
  const client = createClient({ url: `file:${join(dir, 'schema.db')}` });
  await seedFreshDb(client);
  const info = await client.execute('PRAGMA table_info(attendees)');
  eq('a seeded attendees table has the column',
    info.rows.some(r => String(r.name) === 'crm_contact_link'), true);
});

console.log('\n— the upload routes insert the contact-record column —');
await guarded('the contact-record INSERTs', async () => {
  const client = createClient({ url: `file:${join(dir, 'contacts.db')}` });
  await seedFreshDb(client);

  for (const [name, file] of [['attendee upload', UPLOAD], ['conference create', CREATE]]) {
    const sql = sqlFrom(file, 'INSERT INTO attendees');
    const cols = insertCols(sql);
    eq(`${name}: crm_contact_link is in the INSERT`, cols.includes('crm_contact_link'), true);

    const res = await client.execute({ sql, args: await argsFor(client, 'attendees', cols, 'crm_contact_link', CONTACT) });
    const back = await client.execute({
      sql: 'SELECT crm_contact_link FROM attendees WHERE id = ?', args: [Number(res.rows[0].id)] });
    eq('  and the value is stored', back.rows[0].crm_contact_link, CONTACT);
  }
});

console.log('\n— an existing contact record is not overwritten by a blank —');
await guarded('the fill-if-blank update', async () => {
  const client = createClient({ url: `file:${join(dir, 'contact-fill.db')}` });
  await seedFreshDb(client);
  await client.execute({
    sql: 'INSERT INTO attendees (first_name, last_name, crm_contact_link) VALUES (?, ?, ?)',
    args: ['Dana', 'Reyes', CONTACT],
  });

  // Same rule as LinkedIn, for the same reason: the conflicts route never asks
  // about this column, so an upload may only fill a blank one. A rep who pasted
  // the right contact by hand does not lose it to the next attendee list.
  const FILL_IF_BLANK =
    "crm_contact_link = CASE WHEN \\(crm_contact_link IS NULL OR crm_contact_link = ''\\) THEN \\? ELSE crm_contact_link END";
  eq('attendee upload fills crm_contact_link only when blank',
    new RegExp(FILL_IF_BLANK).test(readFileSync(UPLOAD, 'utf-8')), true);
  eq('conference create fills crm_contact_link only when blank',
    new RegExp(FILL_IF_BLANK).test(readFileSync(CREATE, 'utf-8')), true);

  // Read out of the source rather than by calling the handlers: both routes
  // parse a multipart body, resolve companies and write a tenant database, so
  // there is no cheap way to drive them here. What is checked is the link
  // between the parsed row and the statement — the statement itself is run for
  // real below. Both shapes, because each route carries two payloads: `null`
  // for an attendee it is updating and `undefined` for one it is inserting, and
  // a value dropped from either is a value that never lands.
  // COUNTED against LinkedIn, not merely looked for: each route assembles these
  // payloads in more than one branch — a matched company and an unmatched one —
  // so a field present at one site and missing at another passes a `.test()`
  // while quietly losing the value on half the rows. LinkedIn is the right
  // yardstick because it has the identical lifecycle, and it moves with the
  // route if a branch is ever added.
  const count = (src, re) => (src.match(re) || []).length;
  for (const [name, file] of [['attendee upload', UPLOAD], ['conference create', CREATE]]) {
    const src = readFileSync(file, 'utf-8');
    eq(`${name}: queued on an update wherever LinkedIn is`,
      count(src, /crm_contact_link: p\.crm_contact_link\?\.trim\(\) \|\| null/g),
      count(src, /linkedin_url: p\.linkedin_url\?\.trim\(\) \|\| null/g));
    eq(`${name}: and on a new attendee`,
      count(src, /crm_contact_link: p\.crm_contact_link\?\.trim\(\) \|\| undefined/g),
      count(src, /linkedin_url: p\.linkedin_url\?\.trim\(\) \|\| undefined/g));
    eq(`${name}: and counted as a reason to update at all`,
      count(src, /hasUpdate = [^\n]*p\.crm_contact_link\?\.trim\(\)/g),
      count(src, /const hasUpdate = /g));
  }
  // The upload route builds its SET list clause by clause, so the clause is
  // only added when there is something to write.
  eq('attendee upload adds the clause when the file supplied a link',
    /if \(u\.crm_contact_link\) \{\s*\n\s*setClauses\.push\("crm_contact_link = CASE/.test(readFileSync(UPLOAD, 'utf-8')), true);

  const update = `UPDATE attendees SET ${FILL_IF_BLANK.replace(/\\/g, '')} WHERE first_name = ?`;
  const other = 'https://crm.example.com/lightning/r/Contact/004aa/view';
  await client.execute({ sql: update, args: [other, 'Dana'] });
  const back = await client.execute({
    sql: 'SELECT crm_contact_link FROM attendees WHERE first_name = ?', args: ['Dana'] });
  eq('  a stored contact link survives a second upload', back.rows[0].crm_contact_link, CONTACT);

  await client.execute({
    sql: 'INSERT INTO attendees (first_name, last_name) VALUES (?, ?)', args: ['Sam', 'Okafor'] });
  await client.execute({ sql: update, args: [other, 'Sam'] });
  const filled = await client.execute({
    sql: 'SELECT crm_contact_link FROM attendees WHERE first_name = ?', args: ['Sam'] });
  eq('  and a blank one gets filled', filled.rows[0].crm_contact_link, other);
});

console.log('\n— the two link columns are not transposed —');
{
  /*
   * Both columns hold a URL, so SQLite accepts them in either order and the
   * upload succeeds either way: a rep's LinkedIn profile filed as their CRM
   * contact and the contact filed as the profile. Nothing downstream notices,
   * because both fields are only ever opened in a new tab.
   *
   * Checked by lining each statement's placeholder order up against its own
   * args array, read out of the route source — the only place the pairing is
   * expressed.
   */
  const lines = (file) => readFileSync(file, 'utf-8').split('\n');

  /** The args array that follows a statement, as source expressions. */
  const argsAfter = (file, needle) => {
    const ls = lines(file);
    const i = ls.findIndex(l => l.includes(needle));
    if (i < 0) throw new Error(`no line containing ${needle} in ${file}`);
    const start = ls.slice(i).findIndex(l => l.includes('args:'));
    const chunk = ls.slice(i + start).join('\n');
    const inner = chunk.slice(chunk.indexOf('[') + 1, chunk.indexOf(']'));
    return inner.split(',').map(s => s.trim()).filter(Boolean);
  };

  for (const [name, file] of [['attendee upload', UPLOAD], ['conference create', CREATE]]) {
    const cols = insertCols(sqlFrom(file, 'INSERT INTO attendees'));
    const args = argsAfter(file, 'INSERT INTO attendees');
    eq(`${name}: the INSERT has one arg per column`, args.length, cols.length);
    for (const field of ['crm_contact_link', 'linkedin_url']) {
      eq(`${name}: ${field}'s arg is in ${field}'s position`,
        args[cols.indexOf(field)]?.includes(field), true);
    }
  }

  // The conference-create path also batch-updates matched attendees, with a
  // fixed clause order and a fixed args order written out separately.
  {
    const ls = lines(CREATE);
    const i = ls.findIndex(l => l.includes('UPDATE attendees SET'));
    const region = ls.slice(i, i + 20).join('\n');
    // Only the unconditional head of the SET list: what follows is interpolated
    // per row, and its args are the spread entries filtered out below.
    const clauseCols = [...region.slice(0, region.indexOf('${'))
      .matchAll(/("?\w+"?)\s*=\s*(?:COALESCE\(\?|CASE WHEN)/g)].map(m => m[1].replace(/"/g, ''));
    const args = argsAfter(CREATE, 'UPDATE attendees SET').filter(a => !a.startsWith('...') && a !== 'u.id');
    eq('conference create: the batch update has one arg per fixed clause', args.length, clauseCols.length);
    for (const field of ['crm_contact_link', 'linkedin_url']) {
      eq(`conference create: ${field}'s arg is in ${field}'s position`,
        args[clauseCols.indexOf(field)]?.includes(field), true);
    }
  }
}

console.log('\n— the attendee detail form saves what it collects —');
await guarded('the detail form save', async () => {
  // The form posts the whole edit payload to PUT /api/attendees/[id]. That
  // route destructures a FIXED field list and runs a FIXED statement, so a
  // field added to the form alone is accepted, ignored and silently lost — the
  // input looks like it works until the page is reloaded.
  const put = readFileSync('app/api/attendees/[id]/route.ts', 'utf-8');
  eq('the PUT route reads the field off the body',
    /const \{[^}]*\bcrm_contact_link\b[^}]*\} = body;/.test(put), true);
  eq('  and writes it', /UPDATE attendees SET[^']*\bcrm_contact_link = \?/.test(put), true);
  eq('the PATCH route sets it when supplied',
    /'crm_contact_link' in body/.test(put), true);

  // The form itself: the input, and the state it is bound to.
  const form = readFileSync('app/attendees/[id]/page.tsx', 'utf-8');
  eq('the form renders a CRM Contact Link input',
    /<label className="label">CRM Contact Link<\/label>/.test(form), true);
  eq('  bound to editData.crm_contact_link',
    /value=\{editData\.crm_contact_link \|\| ''\}/.test(form), true);
  eq('  and hydrated from the loaded attendee',
    /crm_contact_link: atData\.crm_contact_link \|\| ''/.test(form), true);

  const client = createClient({ url: `file:${join(dir, 'put.db')}` });
  await seedFreshDb(client);
  const made = await client.execute({
    sql: 'INSERT INTO attendees (first_name, last_name) VALUES (?, ?) RETURNING id',
    args: ['Dana', 'Reyes'],
  });
  const id = Number(made.rows[0].id);

  // The route's own statement, run against a real table: unlike the upload
  // paths this one REPLACES the stored value, because it is a person editing
  // the field, not a file being merged.
  //
  // Not read with sqlFrom: this statement contains datetime(\'now\'), and that
  // helper stops at the first quote it meets. Taken to the end of the literal
  // and unescaped instead.
  const sql = (() => {
    const line = put.split('\n').find(l => l.includes('UPDATE attendees SET first_name'));
    const m = line.match(/'(.*)'/);
    return m[1].replace(/\\'/g, "'");
  })();
  // Only the SET list — `WHERE id = ?` takes the trailing argument.
  const setList = sql.slice(0, sql.indexOf(' WHERE '));
  const cols = [...setList.matchAll(/("?\w+"?)\s*=\s*\?/g)].map(m => m[1].replace(/"/g, ''));
  eq('the statement sets crm_contact_link', cols.includes('crm_contact_link'), true);
  const args = await argsFor(client, 'attendees', cols, 'crm_contact_link', CONTACT);
  await client.execute({ sql, args: [...args, id] });
  const saved = await client.execute({ sql: 'SELECT crm_contact_link FROM attendees WHERE id = ?', args: [id] });
  eq('  and the form save lands in the column', saved.rows[0].crm_contact_link, CONTACT);

  // And clearing it clears it — a rep who pasted the wrong link can remove it.
  await client.execute({ sql, args: [...args.map(a => (a === CONTACT ? null : a)), id] });
  const cleared = await client.execute({ sql: 'SELECT crm_contact_link FROM attendees WHERE id = ?', args: [id] });
  eq('  and an emptied field clears it', cleared.rows[0].crm_contact_link, null);
});

console.log('\n— an existing profile is not overwritten by a blank —');
await guarded('the LinkedIn fill-if-blank update', async () => {
  const client = createClient({ url: `file:${join(dir, 'li-coalesce.db')}` });
  await seedFreshDb(client);
  await client.execute({
    sql: 'INSERT INTO attendees (first_name, last_name, linkedin_url) VALUES (?, ?, ?)',
    args: ['Dana', 'Reyes', PROFILE],
  });

  // LinkedIn is not offered for conflict resolution — unlike title and email,
  // which the conflicts route can ask about — so both routes fill it only when
  // the stored value is blank. A re-upload can add a missing profile but can
  // never replace one a rep put there by hand.
  //
  // COALESCE is the wrong tool for that and was the first thing tried here:
  // it returns the SUPPLIED value whenever one is given, so it overwrites. The
  // routes use the same fill-if-blank CASE the products column uses, and this
  // section runs it to prove the semantics rather than trusting the name.
  const FILL_IF_BLANK =
    "linkedin_url = CASE WHEN \\(linkedin_url IS NULL OR linkedin_url = ''\\) THEN \\? ELSE linkedin_url END";
  eq('attendee upload fills linkedin_url only when blank',
    new RegExp(FILL_IF_BLANK).test(readFileSync(UPLOAD, 'utf-8')), true);
  eq('conference create fills linkedin_url only when blank',
    new RegExp(FILL_IF_BLANK).test(readFileSync(CREATE, 'utf-8')), true);

  const update = `UPDATE attendees SET ${FILL_IF_BLANK.replace(/\\/g, '')} WHERE first_name = ?`;
  const other = 'https://www.linkedin.com/in/someone-else';
  await client.execute({ sql: update, args: [other, 'Dana'] });
  const back = await client.execute({
    sql: 'SELECT linkedin_url FROM attendees WHERE first_name = ?', args: ['Dana'] });
  eq('  a stored profile survives a second upload', back.rows[0].linkedin_url, PROFILE);

  await client.execute({
    sql: 'INSERT INTO attendees (first_name, last_name) VALUES (?, ?)', args: ['Sam', 'Okafor'] });
  await client.execute({ sql: update, args: [other, 'Sam'] });
  const filled = await client.execute({
    sql: 'SELECT linkedin_url FROM attendees WHERE first_name = ?', args: ['Sam'] });
  eq('  and a blank one gets filled', filled.rows[0].linkedin_url, other);
});

console.log('\n— an existing link is not overwritten by a blank —');
await guarded('the company-link COALESCE update', async () => {
  const client = createClient({ url: `file:${join(dir, 'coalesce.db')}` });
  await seedFreshDb(client);
  await client.execute({
    sql: 'INSERT INTO companies (name, crm_link) VALUES (?, ?)',
    args: ['Belmont Care', LINK],
  });

  // Both routes fill the column only when the existing one is empty: the
  // conference-create path with COALESCE in SQL, the attendee-upload path with
  // a `!existing.crm_link` guard before it queues the update. Same rule, so
  // the same assertion — a file with no CRM column leaves the stored link be.
  const src = readFileSync(CREATE, 'utf-8');
  eq('conference create uses COALESCE for crm_link',
    /crm_link\s*=\s*COALESCE\(\?,\s*crm_link\)/.test(src), true);

  await client.execute({
    sql: 'UPDATE companies SET crm_link = COALESCE(?, crm_link) WHERE name = ?',
    args: [null, 'Belmont Care'],
  });
  const back = await client.execute({ sql: 'SELECT crm_link FROM companies WHERE name = ?', args: ['Belmont Care'] });
  eq('  so a blank leaves the stored link alone', back.rows[0].crm_link, LINK);

  await client.execute({
    sql: 'UPDATE companies SET crm_link = COALESCE(?, crm_link) WHERE name = ?',
    args: ['https://crm.example.com/Account/002yy', 'Belmont Care'],
  });
  const after = await client.execute({ sql: 'SELECT crm_link FROM companies WHERE name = ?', args: ['Belmont Care'] });
  eq('  and a supplied link does replace it', after.rows[0].crm_link, 'https://crm.example.com/Account/002yy');
});

console.log('\n— a CRM link conflict is offered for resolution —');
{
  // The upload route routes crm_link through addCoField, which defers to a
  // resolution when one exists. Without a matching checkCo in the conflicts
  // route the question would never be asked, and the link would change under
  // the user silently.
  const src = readFileSync('app/api/conferences/[id]/attendees/upload/conflicts/route.ts', 'utf-8');
  eq('the conflicts route selects the existing link',
    /SELECT[^']*\bcrm_link\b[^']*FROM companies/.test(src), true);
  eq('  and compares it against the file', /checkCo\('crm_link',/.test(src), true);
  eq('the upload route defers to the resolution',
    /addCoField\('crm_link',/.test(readFileSync(UPLOAD, 'utf-8')), true);
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
