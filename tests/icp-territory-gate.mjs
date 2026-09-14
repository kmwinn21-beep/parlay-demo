/**
 * The territory tier only reaches companies the account actually sells to.
 *
 *   node --experimental-strip-types --import ./tests/register-ts.mjs \
 *        tests/icp-territory-gate.mjs
 *
 * Rep assignment on upload has three fallback tiers: match the master account
 * list by domain, then by name, then — if the company's HQ state is known —
 * hand it to whoever owns the territory covering that state.
 *
 * The first two are explicit: the account put that company on its master list,
 * so it means something. The third is a guess from a state code, and on a
 * conference list it reaches everybody. A real 2,647-row list carries lenders,
 * law firms, transactional-services firms and product vendors alongside the
 * operators; every one of them came out with a rep on it, filling the
 * assigned-rep column with accounts nobody is working.
 *
 * So the territory tier now asks whether the company's type is one the account
 * named in Admin > ICP Parameters. On that same list, with the territory
 * covering every state: 1,094 of 1,109 companies assigned before, 402 after
 * with ICP set to Operator — and all 402 are Operators.
 *
 * The gate is deliberately one-sided. With no ICP types configured it stands
 * down entirely, so an account that never set ICP up keeps what it had. With
 * them configured, a company whose type is blank or unrecognised does NOT
 * qualify — an unknown type is exactly what this is meant to keep out.
 *
 * Exits non-zero on the first failing expectation, so it can gate a build.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir = mkdtempSync(join(tmpdir(), 'parlay-icpgate-'));
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

const { icpCompanyTypes, territoryFallbackAllowed } = await import('@/lib/icpRules');

// ── Reading the configured types ─────────────────────────────────────────────

console.log('\n— the ICP company types come from the company_type rule —');
{
  const config = {
    rules: [
      { id: 1, category: 'services', sort_order: 0, conditions: [{ option_value: 'AL', operator: 'OR' }] },
      { id: 2, category: 'company_type', sort_order: 1, conditions: [
        { option_value: 'Operator', operator: 'OR' },
        { option_value: 'Capital Partner', operator: 'OR' },
      ] },
    ],
    unitTypeReq: { operator: null, value1: null, value2: null },
  };
  eq('the company_type rule is the one read', icpCompanyTypes(config), ['Operator', 'Capital Partner']);
  eq('  other categories are ignored',
    icpCompanyTypes({ rules: [config.rules[0]], unitTypeReq: config.unitTypeReq }), []);
  eq('  and no rules at all means no opinion',
    icpCompanyTypes({ rules: [], unitTypeReq: config.unitTypeReq }), []);
}

console.log('\n— what the gate lets through —');
{
  const ICP = ['Operator', 'Capital Partner'];
  eq('a configured type qualifies', territoryFallbackAllowed('Operator', ICP), true);
  eq('  regardless of case', territoryFallbackAllowed('operator', ICP), true);
  eq('  and one of several comma-separated types is enough',
    territoryFallbackAllowed('Vendor,Operator', ICP), true);
  eq('a type that is not on the list does not',
    territoryFallbackAllowed('Vendor', ICP), false);
  eq('  nor does a blank type', territoryFallbackAllowed('', ICP), false);
  eq('  nor an unknown one', territoryFallbackAllowed(null, ICP), false);

  // The stand-down. An account that never configured ICP keeps what it had.
  eq('with nothing configured, everything qualifies',
    [territoryFallbackAllowed('Vendor', []), territoryFallbackAllowed(null, [])], [true, true]);
}

// ── The routes ───────────────────────────────────────────────────────────────

const { createClient } = await import('@libsql/client');
const { NextRequest } = await import('next/server');
const { db, dbReady, seedFreshDb } = await import('@/lib/db');
const { signToken } = await import('@/lib/auth');
await dbReady;
await seedFreshDb(db);

// Four companies, four types, all in the territory. Only some are ICP.
const CSV = [
  'First Name,Last Name,Company Name,Registration Type,HQ State',
  'Dana,Reyes,Belmont Care,Operator,TN',
  'Sam,Okafor,Sterling Bank,Vendor,TN',
  'Lee,Park,Northwind Capital,Capital Partner,GA',
  'Nia,Hall,Unlabelled Co,,FL',
].join('\n');

let seq = 0;
async function accountWith(icpTypes, { masterRows = [] } = {}) {
  const acct = `acct-icp-${seq++}`;
  const url = `file:${join(dir, `${acct}.db`)}`;
  const tenant = createClient({ url });
  await seedFreshDb(tenant);
  await db.execute({
    sql: `INSERT INTO accounts (id, company_name, admin_email, turso_db_url, turso_auth_token)
          VALUES (?, 'ICP Co', 'a@icp.test', ?, '')`,
    args: [acct, url],
  });
  // One rep owning every state the file uses, so the territory tier is live.
  await tenant.execute({
    sql: `INSERT INTO sales_territories (name, state_codes, assigned_user_ids) VALUES (?, ?, ?)`,
    args: ['All', JSON.stringify(['TN', 'GA', 'FL']), JSON.stringify([4242])],
  });
  if (icpTypes.length > 0) {
    const rid = Number((await tenant.execute({
      sql: `INSERT INTO icp_rules (category, sort_order) VALUES ('company_type', 0) RETURNING id`,
    })).rows[0].id);
    for (const t of icpTypes) {
      await tenant.execute({
        sql: `INSERT INTO icp_rule_conditions (rule_id, option_value, operator) VALUES (?, ?, 'OR')`,
        args: [rid, t],
      });
    }
  }
  if (masterRows.length > 0) {
    // Rows hang off an ACTIVE upload — that is what the routes select on.
    const uploadId = Number((await tenant.execute({
      sql: `INSERT INTO master_account_list_uploads
              (uploaded_by_user_id, file_name, file_size, storage_key, row_count, status, upload_mode)
            VALUES (NULL, 'master.csv', 1, 'k', ?, 'active', 'replace') RETURNING id`,
      args: [masterRows.length],
    })).rows[0].id);
    for (const r of masterRows) {
      await tenant.execute({
        sql: `INSERT INTO master_account_list (upload_id, company_name, company_name_normalized, assigned_rep_id)
              VALUES (?, ?, ?, ?)`,
        args: [uploadId, r.name, r.normalized, r.repId],
      });
    }
  }
  const user = { id: 980 + seq, email: 'rep@icp.test', role: 'administrator', emailVerified: true, accountId: acct };
  return { tenant, cookie: `auth_token=${await signToken(user)}` };
}

/** Upload CSV and report which companies came out with a rep. */
async function assignedAfterUpload(icpTypes, opts) {
  const { tenant, cookie } = await accountWith(icpTypes, opts);
  const confId = Number((await tenant.execute({
    sql: `INSERT INTO conferences (name, start_date, end_date, location)
          VALUES ('NFC', '2026-09-08', '2026-09-11', 'Nashville, TN') RETURNING id`,
  })).rows[0].id);
  const fd = new FormData();
  fd.set('file', new File([CSV], 'list.csv', { type: 'text/csv' }));
  const POST = (await import('@/app/api/conferences/[id]/attendees/upload/route')).POST;
  await POST(new NextRequest('https://parlay.test/u', { method: 'POST', headers: { cookie }, body: fd }),
    { params: { id: String(confId) } });
  return (await tenant.execute(
    `SELECT name FROM companies WHERE assigned_user IS NOT NULL AND assigned_user <> '' ORDER BY name`
  )).rows.map(r => String(r.name));
}

console.log('\n— with no ICP types configured, nothing changes —');
{
  eq('every company in the territory still gets a rep',
    await assignedAfterUpload([]),
    ['Belmont Care', 'Northwind Capital', 'Sterling Bank', 'Unlabelled Co']);
}

console.log('\n— with ICP types configured, only those types —');
{
  eq('Operator only', await assignedAfterUpload(['Operator']), ['Belmont Care']);
  eq('  the vendor, the capital partner and the untyped one are left alone',
    (await assignedAfterUpload(['Operator'])).length, 1);
}
{
  // A second type genuinely widens it — otherwise the list is being ignored.
  eq('Operator and Capital Partner', await assignedAfterUpload(['Operator', 'Capital Partner']),
    ['Belmont Care', 'Northwind Capital']);
}
{
  eq('a type nothing in the file has assigns nobody',
    await assignedAfterUpload(['Competitor']), []);
}

console.log('\n— the master account list is not gated —');
{
  // Being on the master list is an explicit statement that the account cares
  // about that company, whatever its type. Only the territory guess is gated.
  const { deepNormalizeCompanyName } = await import('@/lib/matching');
  const assigned = await assignedAfterUpload(['Operator'], {
    masterRows: [{
      name: 'Sterling Bank',
      normalized: deepNormalizeCompanyName('Sterling Bank'),
      repId: 7777,
    }],
  });
  eq('a non-ICP company on the master list still gets its rep',
    assigned.includes('Sterling Bank'), true);
  eq('  alongside the ICP one from the territory',
    assigned.includes('Belmont Care'), true);
}

console.log('\n— the conference-create route agrees —');
{
  // Same gate, second route — it has its own copy of the fallback pass.
  const { tenant, cookie } = await accountWith(['Operator']);
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
  eq('  and only the Operator is assigned', (await tenant.execute(
    `SELECT name FROM companies WHERE assigned_user IS NOT NULL AND assigned_user <> '' ORDER BY name`
  )).rows.map(r => String(r.name)), ['Belmont Care']);
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
