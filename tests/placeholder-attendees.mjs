/**
 * Company stand-ins: the attendee a conference gets when only the company is known.
 *
 *   node --experimental-strip-types --import ./tests/register-ts.mjs \
 *        tests/placeholder-attendees.mjs
 *
 * A conference's company list is derived from its attendees — no attendee, no
 * company — so a company known to be attending without a named person is
 * represented by a stand-in attendee carrying `is_placeholder = 1`. Companies
 * Only uploads create them in bulk; the Add Attendee form creates them one at
 * a time.
 *
 * The interesting part is the end of their life. sweepConflictedPlaceholders
 * clears a stand-in once a real attendee from that company turns up, and the
 * whole question is SCOPE: which conference, and which links.
 *
 * That matters more than it looks, because a stand-in is SHARED. Dedupe
 * matches on name, and confirmAttendeeMatch confirms on company name, so
 * adding the same company at a second conference reuses the same attendee row
 * rather than making another. One row, many conference links — which is why
 * the sweep has to delete the link it invalidated and not the row.
 *
 * Exits non-zero on the first failing expectation, so it can gate a build.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir = mkdtempSync(join(tmpdir(), 'parlay-ph-'));
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

const { createClient } = await import('@libsql/client');
const { seedFreshDb } = await import('@/lib/db');
const { sweepConflictedPlaceholders } = await import('@/lib/placeholderAttendees');

let dbSeq = 0;
async function freshDb() {
  const client = createClient({ url: `file:${join(dir, `t${dbSeq++}.db`)}` });
  await seedFreshDb(client);
  return client;
}

const addConference = async (db, name) => Number((await db.execute({
  sql: `INSERT INTO conferences (name, start_date, end_date, location)
        VALUES (?, '2026-10-01', '2026-10-03', 'Chicago, IL') RETURNING id`,
  args: [name],
})).rows[0].id);

const addCompany = async (db, name) => Number((await db.execute({
  sql: 'INSERT INTO companies (name) VALUES (?) RETURNING id', args: [name],
})).rows[0].id);

/** A stand-in uses the parser's convention: "-" and the company name. */
const addPlaceholder = async (db, companyId, companyName) => Number((await db.execute({
  sql: `INSERT INTO attendees (first_name, last_name, company_id, is_placeholder)
        VALUES ('-', ?, ?, 1) RETURNING id`,
  args: [companyName, companyId],
})).rows[0].id);

const addReal = async (db, companyId, first, last) => Number((await db.execute({
  sql: `INSERT INTO attendees (first_name, last_name, company_id, is_placeholder)
        VALUES (?, ?, ?, 0) RETURNING id`,
  args: [first, last, companyId],
})).rows[0].id);

const link = (db, conferenceId, attendeeId) => db.execute({
  sql: 'INSERT OR IGNORE INTO conference_attendees (conference_id, attendee_id) VALUES (?, ?)',
  args: [conferenceId, attendeeId],
});

/** Which conferences this attendee is still on. */
const conferencesOf = async (db, attendeeId) => (await db.execute({
  sql: 'SELECT conference_id FROM conference_attendees WHERE attendee_id = ? ORDER BY conference_id',
  args: [attendeeId],
})).rows.map(r => Number(r.conference_id));

const exists = async (db, attendeeId) => (await db.execute({
  sql: 'SELECT 1 FROM attendees WHERE id = ?', args: [attendeeId],
})).rows.length === 1;

// ── The ordinary case ────────────────────────────────────────────────────────

console.log('\n— a stand-in gives way to the real attendee —');
{
  const db = await freshDb();
  const conf = await addConference(db, 'Fall Summit');
  const co = await addCompany(db, 'Belmont Care');
  const ph = await addPlaceholder(db, co, 'Belmont Care');
  await link(db, conf, ph);

  eq('before: the company is present only through the stand-in', await conferencesOf(db, ph), [conf]);
  eq('  and nothing is swept while it is the only presence',
    await sweepConflictedPlaceholders(db, conf), 0);

  const real = await addReal(db, co, 'Dana', 'Reyes');
  await link(db, conf, real);
  eq('after a real attendee arrives, the stand-in is swept',
    await sweepConflictedPlaceholders(db, conf), 1);
  eq('  the stand-in row is gone', await exists(db, ph), false);
  eq('  and the real attendee is untouched', await conferencesOf(db, real), [conf]);
}

console.log('\n— a stand-in carrying work is left for a person —');
{
  const db = await freshDb();
  const conf = await addConference(db, 'Fall Summit');
  const co = await addCompany(db, 'Belmont Care');
  const ph = await addPlaceholder(db, co, 'Belmont Care');
  await link(db, conf, ph);
  const real = await addReal(db, co, 'Dana', 'Reyes');
  await link(db, conf, real);

  await db.execute({
    sql: `INSERT INTO entity_notes (entity_type, entity_id, content) VALUES ('attendee', ?, 'met at booth')`,
    args: [ph],
  });

  eq('a stand-in with a note is not swept', await sweepConflictedPlaceholders(db, conf), 0);
  eq('  it survives for the placeholder banner to offer', await exists(db, ph), true);
}

// ── The scope questions ──────────────────────────────────────────────────────

console.log('\n— a real attendee at ANOTHER conference does not sweep this one —');
{
  const db = await freshDb();
  const [confA, confB] = [await addConference(db, 'A'), await addConference(db, 'B')];
  const co = await addCompany(db, 'Belmont Care');
  const ph = await addPlaceholder(db, co, 'Belmont Care');
  await link(db, confA, ph);
  const real = await addReal(db, co, 'Dana', 'Reyes');
  await link(db, confB, real);

  eq('the stand-in at A survives a real attendee at B',
    await sweepConflictedPlaceholders(db, confA), 0);
  eq('  so A still lists the company', await conferencesOf(db, ph), [confA]);
}

console.log('\n— sweeping one conference does not strip the company from another —');
{
  // The shared-row case. One stand-in row stands for Belmont at BOTH
  // conferences; a real attendee turns up at A only. A's link is stale, B's is
  // the company's only presence there and must survive.
  const db = await freshDb();
  const [confA, confB] = [await addConference(db, 'A'), await addConference(db, 'B')];
  const co = await addCompany(db, 'Belmont Care');
  const ph = await addPlaceholder(db, co, 'Belmont Care');
  await link(db, confA, ph);
  await link(db, confB, ph);
  const real = await addReal(db, co, 'Dana', 'Reyes');
  await link(db, confA, real);

  eq('one stand-in row serves both conferences', await conferencesOf(db, ph), [confA, confB]);

  await sweepConflictedPlaceholders(db, confA);

  eq('conference A drops the stale stand-in', (await conferencesOf(db, ph)).includes(confA), false);
  eq('conference B KEEPS it — it is still the only presence there',
    (await conferencesOf(db, ph)).includes(confB), true);
  eq('  so the row itself survives', await exists(db, ph), true);
}

console.log('\n— the last link taken away takes the row with it —');
{
  const db = await freshDb();
  const conf = await addConference(db, 'Only');
  const co = await addCompany(db, 'Belmont Care');
  const ph = await addPlaceholder(db, co, 'Belmont Care');
  await link(db, conf, ph);
  const real = await addReal(db, co, 'Dana', 'Reyes');
  await link(db, conf, real);

  await sweepConflictedPlaceholders(db, conf);
  eq('a stand-in with no conferences left is deleted', await exists(db, ph), false);
  eq('  leaving no orphan link', await conferencesOf(db, ph), []);
}

// ── The route that creates one on demand ─────────────────────────────────────

console.log('\n— adding a company with no known attendee —');
{
  const { NextRequest } = await import('next/server');
  const { db, dbReady, seedFreshDb: seedMaster } = await import('@/lib/db');
  const { signToken } = await import('@/lib/auth');
  await dbReady;
  await seedMaster(db);

  const ACCOUNT = 'acct-standin';
  const USER = { id: 601, email: 'rep@standin.test', role: 'administrator', emailVerified: true, accountId: ACCOUNT };

  // The route resolves its client through the accounts table, so the tenant is
  // provisioned the way a real one is rather than handed over directly.
  const TENANT_URL = `file:${join(dir, 'route-tenant.db')}`;
  const tenant = createClient({ url: TENANT_URL });
  await seedFreshDb(tenant);
  await db.execute({
    sql: `INSERT INTO accounts (id, company_name, admin_email, turso_db_url, turso_auth_token)
          VALUES (?, 'Stand-in Co', 'admin@standin.test', ?, '')`,
    args: [ACCOUNT, TENANT_URL],
  });

  const conf = await addConference(tenant, 'Fall Summit');
  const other = await addConference(tenant, 'Spring Expo');

  const addPOST = (await import('@/app/api/conferences/[id]/attendees/add/route')).POST;
  const post = async (conferenceId, payload) => {
    const req = new NextRequest('https://parlay.test/api/conferences/x/attendees/add', {
      method: 'POST',
      headers: { cookie: `auth_token=${await signToken(USER)}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const res = await addPOST(req, { params: { id: String(conferenceId) } });
    return { status: res.status, body: await res.json() };
  };

  const companiesOn = async (conferenceId) => (await tenant.execute({
    sql: `SELECT DISTINCT c.name FROM companies c
            JOIN attendees a ON a.company_id = c.id
            JOIN conference_attendees ca ON ca.attendee_id = a.id AND ca.conference_id = ?
           ORDER BY c.name`,
    args: [conferenceId],
  })).rows.map(r => String(r.name));

  {
    const { status, body } = await post(conf, { company_only: true, company: 'Belmont Care' });
    eq('a brand-new company is accepted', status, 201);
    eq('  the stand-in is flagged as one', Number(body.is_placeholder), 1);
    eq('  and carries the company', body.company_name, 'Belmont Care');
    eq('the conference now lists the company', await companiesOn(conf), ['Belmont Care']);
  }
  {
    // The whole point: it shows up without anybody being named.
    const named = await tenant.execute({
      sql: `SELECT COUNT(*) n FROM attendees a
              JOIN conference_attendees ca ON ca.attendee_id = a.id AND ca.conference_id = ?
             WHERE COALESCE(a.is_placeholder, 0) = 0`,
      args: [conf],
    });
    eq('  with no named attendee on the conference', Number(named.rows[0].n), 0);
  }
  {
    const { status } = await post(conf, { company_only: true, company: '   ' });
    eq('a blank company is refused', status, 400);
  }
  {
    // Same company at a second conference reuses the one stand-in row, which
    // is what makes the sweep's link-scoping above matter.
    const before = await tenant.execute({ sql: 'SELECT COUNT(*) n FROM attendees WHERE is_placeholder = 1' });
    const { status } = await post(other, { company_only: true, company: 'belmont care' });
    const after = await tenant.execute({ sql: 'SELECT COUNT(*) n FROM attendees WHERE is_placeholder = 1' });
    eq('the same company at another conference is accepted', status, 201);
    eq('  matched case-insensitively, so no duplicate company',
      (await tenant.execute({ sql: 'SELECT COUNT(*) n FROM companies' })).rows[0].n, 1);
    eq('  and reuses the one stand-in row rather than making another',
      [Number(before.rows[0].n), Number(after.rows[0].n)], [1, 1]);
    eq('  both conferences list it', [await companiesOn(conf), await companiesOn(other)],
      [['Belmont Care'], ['Belmont Care']]);
  }
  {
    // Adding it twice to the same conference is a no-op, not a second row.
    const { status } = await post(conf, { company_only: true, company: 'Belmont Care' });
    eq('adding the same company twice is harmless', status, 201);
    eq('  and does not double the conference links',
      (await tenant.execute({
        sql: 'SELECT COUNT(*) n FROM conference_attendees WHERE conference_id = ?', args: [conf],
      })).rows[0].n, 1);
  }
  {
    // Once a real person is on the conference, a stand-in would be stale the
    // moment it was written — the sweep would take it straight back out.
    const co = Number((await tenant.execute({
      sql: 'SELECT id FROM companies WHERE name = ?', args: ['Belmont Care'] })).rows[0].id);
    const real = await addReal(tenant, co, 'Dana', 'Reyes');
    await link(tenant, conf, real);

    const { status, body } = await post(conf, { company_only: true, company: 'Belmont Care' });
    eq('a company already represented by a person is refused', status, 409);
    eq('  with a reason naming the company', /Belmont Care/.test(body.error ?? ''), true);
  }
}

// ── How a stand-in reads on screen ───────────────────────────────────────────

console.log('\n— a stand-in does not render as its stored name —');
{
  const { attendeeDisplayName, isPlaceholderAttendee, UNKNOWN_ATTENDEE_LABEL } =
    await import('@/lib/attendeeDisplay');

  // Stored "-" / company name, which would read as a typo in the name column.
  const standIn = { first_name: '-', last_name: 'Belmont Care', is_placeholder: 1 };
  eq('the flag is read from SQLite\'s 1', isPlaceholderAttendee(standIn), true);
  eq('  and from a boolean', isPlaceholderAttendee({ is_placeholder: true }), true);
  eq('  0 is not a placeholder', isPlaceholderAttendee({ is_placeholder: 0 }), false);
  eq('  nor is an absent flag', isPlaceholderAttendee({}), false);

  eq('a stand-in reads as unknown, not "- Belmont Care"',
    attendeeDisplayName(standIn), UNKNOWN_ATTENDEE_LABEL);
  eq('a real attendee reads as their name',
    attendeeDisplayName({ first_name: 'Dana', last_name: 'Reyes', is_placeholder: 0 }), 'Dana Reyes');
  eq('  with no hanging space when half is missing',
    attendeeDisplayName({ first_name: 'Dana', last_name: '' }), 'Dana');
}

console.log('\n— the attendees list carries the flag —');
{
  // The display treatment is inert if the API never sends the column. The
  // conference route selects a.*, but /api/attendees names its columns.
  const { readFileSync } = await import('node:fs');
  const src = readFileSync('app/api/attendees/route.ts', 'utf-8');
  eq('/api/attendees selects is_placeholder', /a\.is_placeholder/.test(src), true);
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
