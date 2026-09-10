/**
 * Link columns as mapped upload fields: CRM Link and LinkedIn URL.
 *
 *   node --experimental-strip-types --import ./tests/register-ts.mjs \
 *        tests/upload-field-mapping.mjs
 *
 * The two sit at different levels, which is most of what there is to get
 * wrong. CRM Link is COMPANY-level — one link per company record, repeated on
 * every attendee row of that company in the file — and lands on `companies`.
 * LinkedIn URL is ATTENDEE-level, one per person, and lands on `attendees`.
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
{
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
}

console.log('\n— the upload routes insert the LinkedIn column —');
{
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
}

console.log('\n— an existing profile is not overwritten by a blank —');
{
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
}

console.log('\n— an existing link is not overwritten by a blank —');
{
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
}

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
