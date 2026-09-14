/**
 * Bulk edit can empty a field, not only change it.
 *
 *   node --experimental-strip-types --import ./tests/register-ts.mjs \
 *        tests/bulk-clear.mjs
 *
 * A bulk-edit panel is a form where nearly every field is meant to be ignored.
 * That was expressed with truthiness — `if (fields.status)` — which collapses
 * the two things an empty value can mean: "I did not touch this" and "empty
 * it". The first won, so a value could be set but never removed.
 *
 * The routes were never the problem. Both test `'field' in fields` and coerce
 * a falsy value to NULL, so they have always been able to clear; the panels
 * simply never sent the key. So this file checks both halves:
 *
 *   • the routes, driven for real, clear when sent null and leave alone when
 *     the key is absent — the contract the panels are written against;
 *   • the panels send that shape, including the multi-selects, which carry no
 *     sentinel and mean "none" by being empty.
 *
 * Exits non-zero on the first failing expectation, so it can gate a build.
 */
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir = mkdtempSync(join(tmpdir(), 'parlay-bulk-'));
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

// ── The three states, as the panels compute them ─────────────────────────────

console.log('\n— a select value maps to one of three intentions —');
{
  const { bulkFieldValue, BULK_CLEAR } = await import('@/lib/bulkEdit');
  eq('"— no change —" leaves the field alone', bulkFieldValue(''), undefined);
  eq('  as does an untouched select', bulkFieldValue(undefined), undefined);
  eq('  and a null one', bulkFieldValue(null), undefined);
  eq('the clear option asks for null', bulkFieldValue(BULK_CLEAR), null);
  eq('a real option is passed through', bulkFieldValue('Engaged'), 'Engaged');
  // The sentinel must not be something a rep could name a status.
  eq('the sentinel is not a plausible config value', /^__.*__$/.test(BULK_CLEAR), true);
}

// ── The routes, driven for real ──────────────────────────────────────────────

const { createClient } = await import('@libsql/client');
const { NextRequest } = await import('next/server');
const { db, dbReady, seedFreshDb } = await import('@/lib/db');
const { signToken } = await import('@/lib/auth');
await dbReady;
await seedFreshDb(db);

const ACCOUNT = 'acct-bulk';
const USER = { id: 701, email: 'rep@bulk.test', role: 'administrator', emailVerified: true, accountId: ACCOUNT };
const TENANT_URL = `file:${join(dir, 'tenant.db')}`;
const tenant = createClient({ url: TENANT_URL });
await seedFreshDb(tenant);
await db.execute({
  sql: `INSERT INTO accounts (id, company_name, admin_email, turso_db_url, turso_auth_token)
        VALUES (?, 'Bulk Co', 'admin@bulk.test', ?, '')`,
  args: [ACCOUNT, TENANT_URL],
});

const attendeesPATCH = (await import('@/app/api/attendees/bulk/route')).PATCH;
const companiesPATCH = (await import('@/app/api/companies/bulk/route')).PATCH;

const patch = async (handler, ids, fields) => {
  const req = new NextRequest('https://parlay.test/api/bulk', {
    method: 'PATCH',
    headers: { cookie: `auth_token=${await signToken(USER)}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids, fields }),
  });
  const res = await handler(req);
  return { status: res.status, body: await res.json() };
};

const one = async (table, id, col) => (await tenant.execute({
  sql: `SELECT "${col}" AS v FROM ${table} WHERE id = ?`, args: [id],
})).rows[0].v;

console.log('\n— an attendee field is emptied by a null, not by an absent key —');
{
  const co = Number((await tenant.execute({
    sql: 'INSERT INTO companies (name) VALUES (?) RETURNING id', args: ['Belmont Care'] })).rows[0].id);
  const id = Number((await tenant.execute({
    sql: `INSERT INTO attendees (first_name, last_name, status, seniority, company_id, "function")
          VALUES ('Dana', 'Reyes', 'Engaged', 'VP/SVP', ?, 'Operations') RETURNING id`,
    args: [co] })).rows[0].id);

  eq('seeded with values', [await one('attendees', id, 'status'), await one('attendees', id, 'seniority')],
    ['Engaged', 'VP/SVP']);

  // What "— no change —" produces: the key never reaches the payload.
  await patch(attendeesPATCH, [id], { status: 'Committed' });
  eq('an untouched field keeps its value', await one('attendees', id, 'seniority'), 'VP/SVP');
  eq('  while the touched one changes', await one('attendees', id, 'status'), 'Committed');

  // What the clear option produces.
  await patch(attendeesPATCH, [id], { seniority: null });
  eq('a null empties seniority', await one('attendees', id, 'seniority'), null);
  eq('  and leaves status alone', await one('attendees', id, 'status'), 'Committed');

  await patch(attendeesPATCH, [id], { status: null });
  eq('a null empties status', await one('attendees', id, 'status'), '');

  await patch(attendeesPATCH, [id], { company_id: null });
  eq('a null unassigns the company', await one('attendees', id, 'company_id'), null);

  await patch(attendeesPATCH, [id], { function: null });
  eq('a null empties function', await one('attendees', id, 'function'), null);
}

console.log('\n— and the same for a company —');
{
  const id = Number((await tenant.execute({
    sql: `INSERT INTO companies (name, status, company_type, assigned_user, services)
          VALUES ('Twenty20', 'Engaged', 'Operator', '5,7', 'AL,MC') RETURNING id`,
  })).rows[0].id);

  await patch(companiesPATCH, [id], { company_type: null });
  eq('a null empties company type', await one('companies', id, 'company_type'), null);
  eq('  and leaves status alone', await one('companies', id, 'status'), 'Engaged');

  await patch(companiesPATCH, [id], { status: null });
  eq('a null empties status', await one('companies', id, 'status'), '');

  await patch(companiesPATCH, [id], { services: null });
  eq('a null empties services', await one('companies', id, 'services'), null);

  await patch(companiesPATCH, [id], { assigned_user: null });
  eq('a null empties the rep assignment', await one('companies', id, 'assigned_user'), null);
}

console.log('\n— clearing applies to every selected row, not just the first —');
{
  const ids = [];
  for (const n of ['A', 'B', 'C']) {
    ids.push(Number((await tenant.execute({
      sql: `INSERT INTO attendees (first_name, last_name, seniority) VALUES (?, 'Multi', 'Director') RETURNING id`,
      args: [n] })).rows[0].id));
  }
  await patch(attendeesPATCH, ids, { seniority: null });
  const left = await Promise.all(ids.map(i => one('attendees', i, 'seniority')));
  eq('all three are cleared', left, [null, null, null]);
}

// ── The panels send that shape ───────────────────────────────────────────────

console.log('\n— every bulk panel offers the clear —');
{
  // Three panels, written independently, all of which gated on truthiness.
  const panels = [
    ['the attendees table', 'components/AttendeeTable.tsx', 3],
    ['the companies table', 'components/CompanyTable.tsx', 2],
    ['the conference attendee list', 'app/conferences/[id]/page.tsx', 4],
  ];
  for (const [name, file, expected] of panels) {
    const src = readFileSync(file, 'utf8');
    const offered = (src.match(/<option value=\{BULK_CLEAR\}>/g) ?? []).length;
    eq(`${name} offers it on ${expected} field${expected === 1 ? '' : 's'}`, offered, expected);
    eq('  and reads the selects through the shared helper',
      /bulkFieldValue\(/.test(src), true);
  }
}

console.log('\n— no panel still gates a bulk field on truthiness —');
{
  // The bug in one line: `if (fields.x) fields.x = ...` cannot express a clear.
  // Consent is exempt — its empty state is an explicit option of its own
  // ("Consent Not Recorded"), and the route substitutes exactly that for a
  // falsy value, so a separate clear would be a second name for it.
  for (const [name, file, handler] of [
    ['the attendees table', 'components/AttendeeTable.tsx', 'handleMassEdit'],
    ['the companies table', 'components/CompanyTable.tsx', 'handleMassEdit'],
    ['the conference attendee list', 'app/conferences/[id]/page.tsx', 'handleAttendeeEdit'],
  ]) {
    const src = readFileSync(file, 'utf8');
    const body = src.slice(src.indexOf(`const ${handler} = async`));
    const gated = (body.slice(0, 1800)
      .match(/if \((?:massEditFields|attendeeEditFields)\.(\w+)\)/g) ?? [])
      .filter(m => !m.includes('consent'));
    eq(`${name} has no truthiness gate left`, gated, []);
  }
}

console.log('\n— the multi-selects mean "none" by being empty —');
{
  // They need no sentinel: absent is untouched, an empty selection is a clear.
  // Services was skipped whenever the selection was empty, so it could be set
  // but never emptied; SF Owner has always cleared this way.
  const src = readFileSync('components/CompanyTable.tsx', 'utf8');
  eq('services is sent whenever it was touched',
    /massEditFields\.services !== undefined/.test(src), true);
  eq('  and an empty selection becomes null',
    /fields\.services = massEditFields\.services\.join\(','\) \|\| null/.test(src), true);
  eq('the rep assignment keeps the same shape',
    /massEditFields\.assigned_user !== undefined/.test(src), true);
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
