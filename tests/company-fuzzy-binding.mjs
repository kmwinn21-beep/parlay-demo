/**
 * A fuzzy company match is a question, not an answer.
 *
 *   node --experimental-strip-types --import ./tests/register-ts.mjs \
 *        tests/company-fuzzy-binding.mjs
 *
 * matchCompany runs six stages. Five are equalities of some kind — a decision
 * someone already made, the raw name, the normalised name, the deep-normalised
 * name, the email/website domain — and any of them may bind on its own. The
 * sixth is a fuzzy guess, and it may not.
 *
 * The attendee-list upload route says exactly that in its own comment and
 * routes a guess to the conflict step. The route that creates a conference
 * FROM a list bound whatever came back, stage and all. So:
 *
 *   "Aspire Senior Living"  →  FUZZY "Jaybird Senior Living"  score 0.347
 *
 * — under the 0.35 threshold purely on the shared "Senior Living" tail, and
 * four Aspire people were filed under Jaybird, a company sharing none of their
 * names. Uploading the same four rows into an EXISTING conference kept them
 * apart, which is how the two routes were found to disagree.
 *
 * The margin is the point: "Belmont Senior Living" and "Cardinal Senior
 * Living" have practically the same overlap with Jaybird and score just over
 * the line. Nudging the threshold would move an arbitrary set of pairs; what
 * was actually wrong is that a guess was allowed to bind at all.
 *
 * Exits non-zero on the first failing expectation, so it can gate a build.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir = mkdtempSync(join(tmpdir(), 'parlay-fuzzy-'));
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

// ── The pairing that caused this ─────────────────────────────────────────────

console.log('\n— the matcher still proposes it, and still calls it a guess —');
{
  const { matchCompany, buildCompanyMatcher } = await import('@/lib/matching');
  const existing = [{ id: 11, name: 'Jaybird Senior Living' }];
  const hit = matchCompany('Aspire Senior Living', existing, buildCompanyMatcher(existing));

  // Not asserting it stops matching — the proposal is legitimate, and a person
  // answering it is the designed path. What must never change is the LABEL,
  // because that is what the routes key their behaviour off.
  eq('Aspire still reaches Jaybird', hit?.match.name, 'Jaybird Senior Living');
  eq('  and is reported as a guess, not an equality', hit?.stage, 'fuzzy');
}
{
  const { matchCompany, buildCompanyMatcher } = await import('@/lib/matching');
  const existing = [{ id: 11, name: 'Jaybird Senior Living' }];
  const m = buildCompanyMatcher(existing);
  // An equality still binds — this is what the stage check must not break.
  eq('an exact name is exact', matchCompany('Jaybird Senior Living', existing, m)?.stage, 'exact');
  eq('a legal suffix is still an equality',
    matchCompany('Jaybird Senior Living, LLC', existing, m)?.stage, 'normalized');
}

// ── Both routes ──────────────────────────────────────────────────────────────

const { createClient } = await import('@libsql/client');
const { NextRequest } = await import('next/server');
const { db, dbReady, seedFreshDb } = await import('@/lib/db');
const { signToken } = await import('@/lib/auth');
await dbReady;
await seedFreshDb(db);

// The four rows from the list this was reported on.
const CSV = [
  'First Name,Last Name,Company Name,Title,Registration Type',
  'Victor,Shevlyagin,Aspire Senior Living,Vice President,Operator',
  'David,Stadtmueller,Aspire Senior Living,CFO,Operator',
  'Mike,Brody,Aspire Senior Living,VP Corp Dev,Operator',
  'Dan,Brown,Aspire Senior Living,CEO,Operator',
].join('\n');

let seq = 0;
/** An account already holding Jaybird, with one attendee of its own. */
async function accountWithJaybird() {
  const acct = `acct-fuzzy-${seq++}`;
  const url = `file:${join(dir, `${acct}.db`)}`;
  const tenant = createClient({ url });
  await seedFreshDb(tenant);
  await db.execute({
    sql: `INSERT INTO accounts (id, company_name, admin_email, turso_db_url, turso_auth_token)
          VALUES (?, 'Fuzzy Co', 'a@fuzzy.test', ?, '')`,
    args: [acct, url],
  });
  const jaybirdId = Number((await tenant.execute({
    sql: `INSERT INTO companies (name) VALUES ('Jaybird Senior Living') RETURNING id`,
  })).rows[0].id);
  await tenant.execute({
    sql: `INSERT INTO attendees (first_name, last_name, company_id) VALUES ('Karen', 'Whitlock', ?)`,
    args: [jaybirdId],
  });
  const user = { id: 1000 + seq, email: 'rep@fuzzy.test', role: 'administrator', emailVerified: true, accountId: acct };
  return { tenant, cookie: `auth_token=${await signToken(user)}`, jaybirdId };
}

/** Which company each of the uploaded people ended up under. */
const filing = async (tenant) => (await tenant.execute(
  `SELECT c.name AS co, a.first_name || ' ' || a.last_name AS person
     FROM attendees a LEFT JOIN companies c ON a.company_id = c.id
    ORDER BY person`
)).rows.map(r => `${r.person} → ${r.co}`);

async function createConferenceWithList(tenant, cookie) {
  const fd = new FormData();
  fd.set('name', 'New Conf');
  fd.set('start_date', '2026-11-01');
  fd.set('end_date', '2026-11-03');
  fd.set('location', 'Nashville, TN');
  fd.set('is_historical', '1');
  fd.set('file', new File([CSV], 'list.csv', { type: 'text/csv' }));
  const POST = (await import('@/app/api/conferences/route')).POST;
  return POST(new NextRequest('https://parlay.test/c', { method: 'POST', headers: { cookie }, body: fd }));
}

console.log('\n— creating a conference from the list —');
{
  const { tenant, cookie } = await accountWithJaybird();
  const res = await createConferenceWithList(tenant, cookie);
  eq('the conference is created', res.status, 201);
  eq('  the Aspire people are filed under Aspire', await filing(tenant), [
    'Dan Brown → Aspire Senior Living',
    'David Stadtmueller → Aspire Senior Living',
    'Karen Whitlock → Jaybird Senior Living',
    'Mike Brody → Aspire Senior Living',
    'Victor Shevlyagin → Aspire Senior Living',
  ]);
  eq('  and Jaybird keeps only its own', Number((await tenant.execute(
    `SELECT COUNT(*) n FROM attendees a JOIN companies c ON a.company_id = c.id
      WHERE c.name = 'Jaybird Senior Living'`)).rows[0].n), 1);
}

console.log('\n— uploading the same list into an existing conference —');
{
  // This route always had the guard. Asserted so the two cannot drift apart
  // again — it is the disagreement between them that surfaced the bug.
  const { tenant, cookie } = await accountWithJaybird();
  const confId = Number((await tenant.execute({
    sql: `INSERT INTO conferences (name, start_date, end_date, location)
          VALUES ('Existing', '2026-10-01', '2026-10-03', 'Chicago, IL') RETURNING id`,
  })).rows[0].id);
  const fd = new FormData();
  fd.set('file', new File([CSV], 'list.csv', { type: 'text/csv' }));
  const POST = (await import('@/app/api/conferences/[id]/attendees/upload/route')).POST;
  await POST(new NextRequest('https://parlay.test/u', { method: 'POST', headers: { cookie }, body: fd }),
    { params: { id: String(confId) } });

  eq('the two routes now agree', await filing(tenant), [
    'Dan Brown → Aspire Senior Living',
    'David Stadtmueller → Aspire Senior Living',
    'Karen Whitlock → Jaybird Senior Living',
    'Mike Brody → Aspire Senior Living',
    'Victor Shevlyagin → Aspire Senior Living',
  ]);
}

console.log('\n— a pairing somebody confirmed still binds —');
{
  // Refusing the guess must not refuse the answer. A confirmed decision is
  // stage 'confirmed', which outranks every rule below it.
  const { tenant, cookie, jaybirdId } = await accountWithJaybird();
  const { recordCompanyNameDecision } = await import('@/lib/companyNameDecisions');
  await recordCompanyNameDecision(tenant, 'Aspire Senior Living', jaybirdId, 'confirmed', 1);

  await createConferenceWithList(tenant, cookie);
  eq('everyone lands on Jaybird, as decided', await filing(tenant), [
    'Dan Brown → Jaybird Senior Living',
    'David Stadtmueller → Jaybird Senior Living',
    'Karen Whitlock → Jaybird Senior Living',
    'Mike Brody → Jaybird Senior Living',
    'Victor Shevlyagin → Jaybird Senior Living',
  ]);
  eq('  and no second company was created', Number((await tenant.execute(
    'SELECT COUNT(*) n FROM companies')).rows[0].n), 1);
}

console.log('\n— the domain stage gets its turn —');
{
  // The route passed neither email nor website, so stage 4 could never fire
  // and more names fell through to the guess than had to. A file whose email
  // domain matches an existing company's website must bind on that.
  const { tenant, cookie } = await accountWithJaybird();
  await tenant.execute({
    sql: `INSERT INTO companies (name, website) VALUES ('Twenty20 Group', 'https://twenty20.com')`,
  });
  const fd = new FormData();
  fd.set('name', 'Domain Conf');
  fd.set('start_date', '2026-11-01');
  fd.set('end_date', '2026-11-03');
  fd.set('location', 'Nashville, TN');
  fd.set('is_historical', '1');
  fd.set('file', new File([[
    'First Name,Last Name,Company Name,Email',
    'Nia,Hall,T20 Holdings LLC,nia@twenty20.com',
  ].join('\n')], 'list.csv', { type: 'text/csv' }));
  const POST = (await import('@/app/api/conferences/route')).POST;
  await POST(new NextRequest('https://parlay.test/c', { method: 'POST', headers: { cookie }, body: fd }));

  eq('a differently-named company binds on its email domain',
    (await tenant.execute(
      `SELECT c.name AS co FROM attendees a JOIN companies c ON a.company_id = c.id
        WHERE a.first_name = 'Nia'`)).rows.map(r => String(r.co)), ['Twenty20 Group']);
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
