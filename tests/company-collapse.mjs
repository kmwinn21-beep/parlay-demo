/**
 * Two spellings of the same NEW company become one record.
 *
 *   node --experimental-strip-types --import ./tests/register-ts.mjs \
 *        tests/company-collapse.mjs
 *
 * matchCompany compares an uploaded name against companies that already
 * exist. It has nothing to say about two names in the same file that are both
 * new — neither matches anything, so both get created. A real conference list
 * carrying "Direct Supply", "Direct supply", "Direct Supply Inc." and "Direct
 * Supply, Inc." produced four company records for one company, and somebody
 * had to merge them by hand afterwards.
 *
 * Two things are checked here, and the second matters as much as the first:
 *
 *   • the collapse happens, in BOTH upload routes. It was written in the
 *     attendee-list upload and never reached the one that creates a
 *     conference from a list, so the same file gave different answers
 *     depending on which way it went in.
 *
 *   • the collapse does NOT go further than it can defend. The key is
 *     normalizeCompanyName, not deepNormalizeCompanyName; the section at the
 *     bottom pins the specific real-world names the deep key merges wrongly,
 *     because a wrong merge has no undo.
 *
 * Exits non-zero on the first failing expectation, so it can gate a build.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir = mkdtempSync(join(tmpdir(), 'parlay-collapse-'));
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

const { collapseNewCompanyNames } = await import('@/lib/matching');

/** The names that survive, sorted, so assertions don't depend on input order. */
const kept = (names) => collapseNewCompanyNames(names).canonical.slice().sort();

// ── The collapse itself ──────────────────────────────────────────────────────

console.log('\n— spellings of one company collapse to one record —');
{
  // Straight from the list that prompted this.
  const r = collapseNewCompanyNames([
    'Direct Supply', 'Direct supply', 'Direct Supply Inc.', 'Direct Supply, Inc.',
  ]);
  eq('four spellings become one company', r.canonical, ['Direct Supply, Inc.']);
  eq('  named by the longest spelling, which carries the most',
    r.canonical[0], 'Direct Supply, Inc.');
  eq('  and the other three point at it', Array.from(r.aliasOf.keys()).sort(),
    ['Direct Supply', 'Direct Supply Inc.', 'Direct supply']);
}
{
  eq('a legal suffix alone does not make a second company',
    kept(['Allegro Living', 'Allegro Living, LLC']), ['Allegro Living, LLC']);
  eq('nor does letter case',
    kept(['Ziegler', 'ziegler', 'ZIegler']), ['Ziegler']);
  eq('nor an ampersand spelled out',
    kept(['Forum Architecture & Interior Design', 'Forum Architecture and Interior Design']),
    ['Forum Architecture and Interior Design']);
  eq('nor a stray comma before Inc',
    kept(['Omega Healthcare Investors', 'Omega Healthcare Investors, Inc']),
    ['Omega Healthcare Investors, Inc']);
  eq('nor a doubled space',
    kept(['Harbor Retirement Associates', 'Harbor Retirement  Associates']).length, 1);
  eq('LLP, PC, Ltd and Corp count too',
    [kept(['Hanson Bridgett', 'Hanson Bridgett LLP']).length,
     kept(['Polsinelli', 'Polsinelli PC']).length,
     kept(['Goldberg Kohn Ltd', 'Goldberg Kohn Ltd.']).length,
     kept(['American Eagle Lifecare Corp', 'American Eagle Lifecare Corporation']).length],
    [1, 1, 1, 1]);
}
{
  eq('genuinely different companies stay apart',
    kept(['Brookdale Senior Living', 'Atria Senior Living']).length, 2);
  eq('an abbreviation is not assumed to be the same company',
    kept(['Sonida', 'Sonida Senior Living']).length, 2);
  eq('a single name is left exactly as it was',
    collapseNewCompanyNames(['Ventas, Inc.']).canonical, ['Ventas, Inc.']);
  eq('and nothing in, nothing out', collapseNewCompanyNames([]).canonical, []);
}
{
  // A name that normalises away entirely must not swallow another one.
  const r = collapseNewCompanyNames(['LLC', 'Inc.']);
  eq('names that are nothing but a suffix stay distinct', r.canonical.length, 2);
}

// ── The line it deliberately does not cross ──────────────────────────────────

console.log('\n— it does not merge what it cannot defend —');
{
  // deepNormalizeCompanyName also strips group/holdings/management/services/
  // partners/advisors/consulting/us/international. On the real list that
  // reduced all four of these to "healthcare". They are not one company, and
  // there is no unmerge — so the collapse key stops short of the deep one.
  eq('three different healthcare firms stay three',
    kept(['Healthcare Services Group', 'US Healthcare', 'Healthcare Management Partners']).length, 3);
  eq('  even with a legal suffix on one of them',
    kept(['Healthcare Management Partners', 'Healthcare Management Partners, LLC']).length, 1);
  eq('"Senior Consulting" is not "Senior Management Advisors"',
    kept(['Senior Management Advisors', 'Senior Consulting, LLC']).length, 2);
  eq('a descriptor is not treated as noise',
    kept(['Colliers', 'Colliers International']).length, 2);
}

// ── Both upload routes, driven for real ──────────────────────────────────────

const { createClient } = await import('@libsql/client');
const { NextRequest } = await import('next/server');
const { db, dbReady, seedFreshDb } = await import('@/lib/db');
const { signToken } = await import('@/lib/auth');
await dbReady;
await seedFreshDb(db);

// Four spellings of two companies, none of them already on file.
const CSV = [
  'First Name,Last Name,Company',
  'Dana,Reyes,Direct Supply Inc.',
  'Sam,Okafor,Direct Supply',
  'Lee,Park,direct supply',
  'Nia,Hall,"Allegro Living, LLC"',   // quoted — the name has a comma in it
  'Tom,Vance,Allegro Living',
].join('\n');

let seq = 0;
async function tenantFor() {
  const acct = `acct-collapse-${seq++}`;
  const url = `file:${join(dir, `${acct}.db`)}`;
  const tenant = createClient({ url });
  await seedFreshDb(tenant);
  await db.execute({
    sql: `INSERT INTO accounts (id, company_name, admin_email, turso_db_url, turso_auth_token)
          VALUES (?, 'Collapse Co', 'a@collapse.test', ?, '')`,
    args: [acct, url],
  });
  const user = { id: 900 + seq, email: 'rep@collapse.test', role: 'administrator', emailVerified: true, accountId: acct };
  return { tenant, cookie: `auth_token=${await signToken(user)}` };
}

const companyNames = async (tenant) => (await tenant.execute(
  'SELECT name FROM companies ORDER BY name')).rows.map(r => String(r.name));

console.log('\n— uploading a list to an existing conference —');
{
  const { tenant, cookie } = await tenantFor();
  const confId = Number((await tenant.execute({
    sql: `INSERT INTO conferences (name, start_date, end_date, location)
          VALUES ('Existing', '2026-10-01', '2026-10-03', 'Chicago, IL') RETURNING id`,
  })).rows[0].id);

  const fd = new FormData();
  fd.set('file', new File([CSV], 'list.csv', { type: 'text/csv' }));
  const POST = (await import('@/app/api/conferences/[id]/attendees/upload/route')).POST;
  const res = await POST(
    new NextRequest('https://parlay.test/u', { method: 'POST', headers: { cookie }, body: fd }),
    { params: { id: String(confId) } });

  eq('the upload succeeds', res.status, 200);
  eq('  five rows, two companies', await companyNames(tenant),
    ['Allegro Living, LLC', 'Direct Supply Inc.']);
  eq('  and all five attendees are linked', Number((await tenant.execute(
    'SELECT COUNT(*) n FROM conference_attendees')).rows[0].n), 5);
  eq('  with nobody left without a company', Number((await tenant.execute(
    'SELECT COUNT(*) n FROM attendees WHERE company_id IS NULL')).rows[0].n), 0);
}

console.log('\n— creating a conference from the same list —');
{
  // This route had no collapse at all, so the same file produced five
  // companies here and two above.
  const { tenant, cookie } = await tenantFor();
  const fd = new FormData();
  fd.set('name', 'Brand New');
  fd.set('start_date', '2026-11-01');
  fd.set('end_date', '2026-11-03');
  fd.set('location', 'Nashville, TN');
  fd.set('is_historical', '1');
  fd.set('file', new File([CSV], 'list.csv', { type: 'text/csv' }));
  const POST = (await import('@/app/api/conferences/route')).POST;
  const res = await POST(new NextRequest('https://parlay.test/c', { method: 'POST', headers: { cookie }, body: fd }));

  eq('the conference is created', res.status, 201);
  eq('  and gives the SAME two companies as the other route', await companyNames(tenant),
    ['Allegro Living, LLC', 'Direct Supply Inc.']);
  eq('  with every attendee pointed at one of them', Number((await tenant.execute(
    'SELECT COUNT(*) n FROM attendees WHERE company_id IS NULL')).rows[0].n), 0);
  eq('  and both companies actually used', Number((await tenant.execute(
    'SELECT COUNT(DISTINCT company_id) n FROM attendees')).rows[0].n), 2);
}

console.log('\n— an existing company still wins over a new record —');
{
  // The collapse only ever runs on names that matched nothing. A name that
  // matches a company already on file must still bind to it.
  const { tenant, cookie } = await tenantFor();
  await tenant.execute({ sql: 'INSERT INTO companies (name) VALUES (?)', args: ['Direct Supply'] });
  const confId = Number((await tenant.execute({
    sql: `INSERT INTO conferences (name, start_date, end_date, location)
          VALUES ('Existing', '2026-10-01', '2026-10-03', 'Chicago, IL') RETURNING id`,
  })).rows[0].id);

  const fd = new FormData();
  fd.set('file', new File([CSV], 'list.csv', { type: 'text/csv' }));
  const POST = (await import('@/app/api/conferences/[id]/attendees/upload/route')).POST;
  await POST(new NextRequest('https://parlay.test/u', { method: 'POST', headers: { cookie }, body: fd }),
    { params: { id: String(confId) } });

  eq('no second Direct Supply is created', await companyNames(tenant),
    ['Allegro Living, LLC', 'Direct Supply']);
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
