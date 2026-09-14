/**
 * HQ State is the company's, and a wrong one hands the account to a rep.
 *
 *   node --experimental-strip-types --import ./tests/register-ts.mjs \
 *        tests/hq-state-mapping.mjs
 *
 * hq_state is not just another column. It is the last tier of rep assignment:
 * when the file names no rep, and the master account list matches neither the
 * domain nor the name, the company goes to whoever owns the territory covering
 * that state. So a wrong value does not sit quietly — it puts an account on
 * somebody's name.
 *
 * Alias matching is substring-based, and on this field that was wrong three
 * ways at once. Measured on a real 2,647-row conference list:
 *
 *   • `st` matched "First Name" — f-i-r-ST-name — so a file with no state
 *     column at all mapped HQ State to the attendee's first name.
 *   • `state` matched "Real Estate" — e-STATE — which in this industry is not
 *     a hypothetical column.
 *   • "Work State/Prov." matched, so an ATTENDEE's work address became the
 *     COMPANY's headquarters. Every one of the 1,173 companies got an
 *     hq_state that way, and 618 of them were handed a rep by territory — with
 *     an EMPTY master account list and no rep column anywhere in the file.
 *
 * That last number is the one that matters, and the end of this file
 * reproduces it: the same shape of list, the same empty master list, and a
 * count of how many companies come out with a rep on them.
 *
 * Exits non-zero on the first failing expectation, so it can gate a build.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir = mkdtempSync(join(tmpdir(), 'parlay-hq-'));
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

const { suggestMapping, parseFile } = await import('@/lib/parsers');
const state = (headers) => suggestMapping(headers).state;

// ── What counts as the company's HQ state ────────────────────────────────────

console.log('\n— a company-scoped header is taken —');
{
  eq('HQ State', state(['Company', 'HQ State']), 'HQ State');
  eq('Headquarters State', state(['Company', 'Headquarters State']), 'Headquarters State');
  eq('Company State', state(['Company', 'Company State']), 'Company State');
  eq('a bare State is taken at face value', state(['Company', 'State']), 'State');
  eq('State/Province still qualifies', state(['Company', 'State/Province']), 'State/Province');
  eq('and the bare abbreviation, as a whole word', state(['Company', 'St']), 'St');
}

console.log('\n— a person\'s or an address\'s state is refused —');
{
  // The one that caused this. It is somebody's desk, not the headquarters.
  eq('Work State/Prov. is not the company HQ',
    state(['First Name', 'Last Name', 'Company', 'Work State/Prov.']), null);
  eq('nor is a work state', state(['Company', 'Work State']), null);
  eq('nor a billing address', state(['Company', 'Billing State']), null);
  eq('nor a mailing address', state(['Company', 'Mailing State']), null);
  eq('nor an attendee address', state(['Company', 'Attendee State']), null);
  eq('nor a home address', state(['Company', 'Home State']), null);
}
{
  // Refused is not lost — the field is still in the mapping modal, so anyone
  // who really means that column can point at it by hand. What is gone is the
  // silent guess.
  const { FIELD_ORDER } = await import('@/lib/columnMapping');
  eq('the field is still offered for manual mapping', FIELD_ORDER.includes('state'), true);
}

console.log('\n— a company-scoped header wins over a person-scoped one —');
{
  eq('HQ State beats Work State', state(['Company', 'Work State', 'HQ State']), 'HQ State');
  eq('  whichever order they appear in',
    state(['Company', 'HQ State', 'Work State']), 'HQ State');

  // Naming the company outranks the address type. "Corporate Mailing State" is
  // an address word, but it is the COMPANY's address, so it is taken — where a
  // bare "Mailing State" is refused. Without the company-scope pass these fall
  // through the person-scope filter and map to nothing.
  eq('a company-scoped address is still the company\'s',
    state(['Company', 'Corporate Mailing State']), 'Corporate Mailing State');
  eq('  as is the headquarters\' own mailing address',
    state(['Company', 'HQ Mailing State']), 'HQ Mailing State');
}

console.log('\n— a substring is not a match —');
{
  eq('a file with no state column maps nothing',
    state(['First Name', 'Last Name', 'Company', 'Title']), null);
  eq('  "First Name" is not the state, despite containing "st"',
    state(['First Name']), null);
  eq('"Real Estate" is not the state, despite containing "state"',
    state(['Company', 'Real Estate']), null);
  eq('nor is a column about estates', state(['Company', 'Estate Planning']), null);
}

console.log('\n— the auto-detect parse path agrees —');
{
  // Two parse paths, independent alias lists; a fix to one is not a fix to the
  // other. The value must not reach ParsedAttendee.state either.
  const csv = 'First Name,Last Name,Company,Work State/Prov.\nDana,Reyes,Belmont Care,AL\n';
  const [a] = await parseFile(Buffer.from(csv, 'utf-8'), 'list.csv');
  eq('a work state is not parsed as the company state', a.state, undefined);

  const hq = 'First Name,Last Name,Company,HQ State\nDana,Reyes,Belmont Care,TN\n';
  const [b] = await parseFile(Buffer.from(hq, 'utf-8'), 'list.csv');
  eq('  while a real HQ column still is', b.state, 'TN');
}

// ── The consequence, reproduced ──────────────────────────────────────────────

const { createClient } = await import('@libsql/client');
const { NextRequest } = await import('next/server');
const { db, dbReady, seedFreshDb } = await import('@/lib/db');
const { signToken } = await import('@/lib/auth');
await dbReady;
await seedFreshDb(db);

let seq = 0;
async function tenantFor() {
  const acct = `acct-hq-${seq++}`;
  const url = `file:${join(dir, `${acct}.db`)}`;
  const tenant = createClient({ url });
  await seedFreshDb(tenant);
  await db.execute({
    sql: `INSERT INTO accounts (id, company_name, admin_email, turso_db_url, turso_auth_token)
          VALUES (?, 'HQ Co', 'a@hq.test', ?, '')`,
    args: [acct, url],
  });
  // One territory, one rep. The master account list is left EMPTY on purpose:
  // nothing here is in it, so nothing should be assigned from it.
  await tenant.execute({
    sql: `INSERT INTO sales_territories (name, state_codes, assigned_user_ids) VALUES (?, ?, ?)`,
    args: ['Southeast', JSON.stringify(['TN', 'GA', 'FL', 'AL']), JSON.stringify([4242])],
  });
  const user = { id: 960 + seq, email: 'rep@hq.test', role: 'administrator', emailVerified: true, accountId: acct };
  return { tenant, cookie: `auth_token=${await signToken(user)}` };
}

async function upload(csv) {
  const { tenant, cookie } = await tenantFor();
  const confId = Number((await tenant.execute({
    sql: `INSERT INTO conferences (name, start_date, end_date, location)
          VALUES ('NFC', '2026-09-08', '2026-09-11', 'Nashville, TN') RETURNING id`,
  })).rows[0].id);
  const fd = new FormData();
  fd.set('file', new File([csv], 'list.csv', { type: 'text/csv' }));
  const POST = (await import('@/app/api/conferences/[id]/attendees/upload/route')).POST;
  const res = await POST(
    new NextRequest('https://parlay.test/u', { method: 'POST', headers: { cookie }, body: fd }),
    { params: { id: String(confId) } });
  const n = async (sql) => Number((await tenant.execute(sql)).rows[0].n);
  return {
    status: res.status,
    companies: await n('SELECT COUNT(*) n FROM companies'),
    withRep: await n("SELECT COUNT(*) n FROM companies WHERE assigned_user IS NOT NULL AND assigned_user <> ''"),
    withState: await n("SELECT COUNT(*) n FROM companies WHERE hq_state IS NOT NULL AND hq_state <> ''"),
  };
}

console.log('\n— a work address does not hand the account to a rep —');
{
  // The real list's shape: attendee work locations, no rep column, and an
  // empty master account list.
  const r = await upload([
    'First Name,Last Name,Company Name,Work State/Prov.',
    'Dana,Reyes,Belmont Care,AL',
    'Sam,Okafor,Berkadia,AL',
    'Lee,Park,Twenty20,TN',
  ].join('\n'));

  eq('the upload succeeds', r.status, 200);
  eq('  three companies are created', r.companies, 3);
  eq('  none of them takes an HQ state from a work address', r.withState, 0);
  eq('  so none of them is assigned a rep by territory', r.withRep, 0);
}

console.log('\n— a real HQ column still assigns by territory —');
{
  // The fallback itself is deliberate and stays. What changed is what feeds it.
  const r = await upload([
    'First Name,Last Name,Company Name,HQ State',
    'Dana,Reyes,Belmont Care,AL',
    'Lee,Park,Twenty20,TN',
    'Nia,Hall,Far Co,WY',
  ].join('\n'));

  eq('the HQ state is stored', r.withState, 3);
  eq('  and the two inside the territory get its rep', r.withRep, 2);
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
