/**
 * CRM Link as a mapped upload field.
 *
 *   node --experimental-strip-types --import ./tests/register-ts.mjs \
 *        tests/crm-link-upload.mjs
 *
 * CRM Link is a COMPANY-level column: one link per company record, carried on
 * every attendee row of that company in the file. Three things have to hold for
 * it to survive an upload, and each is a separate section below.
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
 * a couple of lines bolted onto an existing test: "CRM URL" and "Salesforce
 * URL" both partial-match the Website alias `url`, so before CRM_LINK_ALIASES
 * was resolved first the CRM column was silently filed as the website.
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

console.log('\n— and does not confuse it with Website —');
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

console.log('\n— the upload routes insert the column —');
{
  const client = createClient({ url: `file:${join(dir, 'tenant.db')}` });
  await seedFreshDb(client);

  for (const [name, file] of [['attendee upload', UPLOAD], ['conference create', CREATE]]) {
    const sql = sqlFrom(file, 'INSERT INTO companies');
    const cols = sql.match(/\(([^)]*)\)/)[1].split(',').map(s => s.trim());
    eq(`${name}: crm_link is in the INSERT`, cols.includes('crm_link'), true);

    // Run the route's own statement, with the link in crm_link's position and
    // a marker in every other column, then read the row back.
    const args = cols.map((c, i) => (c === 'crm_link' ? LINK : c === 'name' ? `Co ${name}` : null));
    const res = await client.execute({ sql, args });
    const id = Number(res.rows[0].id);
    const back = await client.execute({ sql: 'SELECT crm_link FROM companies WHERE id = ?', args: [id] });
    eq(`  and the value is stored`, back.rows[0].crm_link, LINK);
  }
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
