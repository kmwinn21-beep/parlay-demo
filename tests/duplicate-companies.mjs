/**
 * Finding the duplicates already sitting in an account.
 *
 *   node --experimental-strip-types --import ./tests/register-ts.mjs \
 *        tests/duplicate-companies.mjs
 *
 * The upload learned to collapse "Direct Supply", "Direct supply", "Direct
 * Supply Inc." and "Direct Supply, Inc." into one record. This finds the ones
 * that got in before it did, and offers them — it never merges anything.
 *
 * ── The key is shared on purpose ─────────────────────────────────────────────
 *
 * The scanner groups by normalizeCompanyName, which is the same key
 * collapseNewCompanyNames uses when an upload creates companies. If the two
 * disagreed, a merge done here would be undone by the next import, and neither
 * would be worth trusting. There is an assertion below that holds them
 * together: whatever the upload would collapse, the scanner must group.
 *
 * ── The domain signal ────────────────────────────────────────────────────────
 *
 * Names cannot connect "T20 Holdings LLC" to "Twenty20 Group". A shared work
 * domain can, and is close to proof — which is why most of the assertions about
 * it below are about what it must REFUSE to connect. Two companies each with a
 * gmail attendee are not related; a linkedin.com in a website field is
 * somebody's profile.
 *
 * One number in it could not be measured: MAX_COMPANIES_PER_DOMAIN. The real
 * conference list this was built against has no email or website column at all,
 * so the cap is a judgement about where a shared domain stops being evidence,
 * not a figure read off data. The test pins the behaviour, not the value.
 *
 * ── And it stops where that one stops ────────────────────────────────────────
 *
 * Not deepNormalizeCompanyName. On a real 2,647-row list that reduced
 * "Healthcare Services Group", "US Healthcare" and "Healthcare Management
 * Partners" all to "healthcare" — three companies, one group. A missed
 * duplicate costs a minute; a wrong merge has no undo.
 *
 * Exits non-zero on the first failing expectation, so it can gate a build.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir = mkdtempSync(join(tmpdir(), 'parlay-dupes-'));
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

const { findDuplicateGroups, dismissalKeyFor, domainsFor, MAX_COMPANIES_PER_DOMAIN } = await import('@/lib/duplicateCompanies');
const { collapseNewCompanyNames } = await import('@/lib/matching');

const co = (id, name, extra = {}) => ({ id, name, attendee_count: 0, conference_count: 0, ...extra });
// Tolerant of an absent group: when a grouping assertion fails, the ones
// after it should still report rather than the run dying on a TypeError.
const names = (g) => (g?.members ?? []).map(m => m.name);

// ── Grouping ─────────────────────────────────────────────────────────────────

console.log('\n— spellings of one company are grouped —');
{
  const groups = findDuplicateGroups([
    co(1, 'Direct Supply'), co(2, 'Direct supply'),
    co(3, 'Direct Supply Inc.'), co(4, 'Direct Supply, Inc.'),
  ]);
  eq('one group', groups.length, 1);
  eq('  with all four in it', names(groups[0]).length, 4);
  eq('  keyed on the shared normalized name', groups[0].key, 'direct supply');
  eq('  and reported as a name match', groups[0]?.matchedOn ?? null, ['name']);
}
{
  const only = (list) => findDuplicateGroups(list).length;
  eq('a legal suffix alone', only([co(1, 'Allegro Living'), co(2, 'Allegro Living, LLC')]), 1);
  eq('case alone', only([co(1, 'Ziegler'), co(2, 'ziegler'), co(3, 'ZIegler')]), 1);
  eq('an ampersand spelled out',
    only([co(1, 'Forum Architecture & Interior Design'), co(2, 'Forum Architecture and Interior Design')]), 1);
  eq('a stray comma before Inc',
    only([co(1, 'Omega Healthcare Investors'), co(2, 'Omega Healthcare Investors, Inc')]), 1);
}

console.log('\n— and different companies are not —');
{
  eq('two unrelated names', findDuplicateGroups([co(1, 'Brookdale'), co(2, 'Atria')]).length, 0);
  eq('a lone company is not a duplicate of itself',
    findDuplicateGroups([co(1, 'Belmont Care')]).length, 0);
  eq('an abbreviation is not assumed to be the same company',
    findDuplicateGroups([co(1, 'Sonida'), co(2, 'Sonida Senior Living')]).length, 0);

  // The line this key deliberately does not cross.
  eq('three different healthcare firms stay three', findDuplicateGroups([
    co(1, 'Healthcare Services Group'),
    co(2, 'US Healthcare'),
    co(3, 'Healthcare Management Partners'),
  ]).length, 0);
  eq('  and "Senior Consulting" is not "Senior Management Advisors"', findDuplicateGroups([
    co(1, 'Senior Management Advisors'), co(2, 'Senior Consulting, LLC'),
  ]).length, 0);
}

console.log('\n— the scanner and the upload agree —');
{
  // The assertion that keeps them honest. Whatever an upload would collapse
  // into one company, the scanner must group — otherwise cleaning up here is
  // undone by the next import.
  const spellings = [
    'Direct Supply', 'Direct supply', 'Direct Supply, Inc.',
    'Allegro Living', 'Allegro Living, LLC',
    'Brookdale Senior Living',
    'Hanson Bridgett', 'Hanson Bridgett LLP',
  ];
  const collapsed = collapseNewCompanyNames(spellings);
  const uploadGroups = collapsed.canonical.length;

  const scanned = findDuplicateGroups(spellings.map((n, i) => co(i + 1, n)));
  const scannedRecordsAfterMerging = spellings.length - scanned.reduce((n, g) => n + g.members.length - 1, 0);

  eq('the upload would create this many companies', uploadGroups, 4);
  eq('  and merging every group the scanner found leaves the same number',
    scannedRecordsAfterMerging, uploadGroups);
}

// ── The domain signal ────────────────────────────────────────────────────────

console.log('\n— a shared domain connects what names cannot —');
{
  const groups = findDuplicateGroups([
    co(1, 'T20 Holdings LLC', { website: 'https://www.twenty20.com/about' }),
    co(2, 'Twenty20 Group', { attendee_emails: ['nia@twenty20.com'] }),
    co(3, 'Belmont Care', { website: 'belmont.com' }),
  ]);
  eq('the two are grouped', groups.length, 1);
  eq('  despite sharing nothing in their names',
    names(groups[0]), ['T20 Holdings LLC', 'Twenty20 Group']);
  eq('  and the group says why', groups[0]?.matchedOn ?? null, ['domain']);
  eq('  naming the domain that did it', groups[0]?.sharedDomains ?? null, ['twenty20.com']);
}
{
  eq('a website matches an attendee\'s work email', findDuplicateGroups([
    co(1, 'Belmont Care', { website: 'https://belmont.com' }),
    co(2, 'Belmont Senior Living', { attendee_emails: ['dana@belmont.com'] }),
  ]).length, 1);
  eq('  and www and a path make no difference', domainsFor(
    { id: 1, name: 'x', website: 'https://www.belmont.com/careers?ref=1' }), ['belmont.com']);
}

console.log('\n— but a domain that identifies nobody connects nobody —');
{
  const free = findDuplicateGroups([
    co(1, 'Belmont Care', { attendee_emails: ['dana@gmail.com'] }),
    co(2, 'Twenty20 Group', { attendee_emails: ['sam@gmail.com'] }),
  ]);
  eq('two gmail attendees are not one company', free.length, 0);

  const social = findDuplicateGroups([
    co(1, 'Belmont Care', { website: 'https://www.linkedin.com/company/belmont' }),
    co(2, 'Twenty20 Group', { website: 'linkedin.com/company/twenty20' }),
  ]);
  eq('nor are two LinkedIn links', social.length, 0);

  const freeSite = findDuplicateGroups([
    co(1, 'Belmont Care', { website: 'gmail.com' }),
    co(2, 'Twenty20 Group', { website: 'https://gmail.com' }),
  ]);
  eq('nor a free provider typed into a website field', freeSite.length, 0);
  eq('  which nothing else was checking', domainsFor(
    { id: 1, name: 'x', website: 'https://gmail.com' }), []);
}
{
  // The cap. A domain on a handful of records is a duplicate; a domain on
  // dozens is a shared host or a pasted column.
  const many = Array.from({ length: MAX_COMPANIES_PER_DOMAIN + 1 }, (_, i) =>
    co(i + 1, `Company ${i}`, { website: 'sharedhost.com' }));
  eq('a domain on too many records is not evidence', findDuplicateGroups(many).length, 0);

  const few = Array.from({ length: MAX_COMPANIES_PER_DOMAIN }, (_, i) =>
    co(i + 1, `Company ${i}`, { website: 'sharedhost.com' }));
  eq('  while one just inside the cap still is', findDuplicateGroups(few).length, 1);
}

console.log('\n— the two signals make one group, not two —');
{
  const groups = findDuplicateGroups([
    co(1, 'Belmont Care', { website: 'belmont.com' }),
    co(2, 'Belmont Care, LLC', { attendee_emails: ['dana@belmont.com'] }),
  ]);
  eq('a pair matching on both is asked about once', groups.length, 1);
  eq('  and both reasons are given', groups[0]?.matchedOn ?? null, ['name', 'domain']);
}
{
  // A chain: A~B by name, B~C by domain. One company, three records.
  const groups = findDuplicateGroups([
    co(1, 'Belmont Care'),
    co(2, 'Belmont Care, LLC', { website: 'belmont.com' }),
    co(3, 'BC Senior Holdings', { attendee_emails: ['sam@belmont.com'] }),
  ]);
  eq('a chain across signals is one group', groups.length, 1);
  eq('  with all three in it', groups[0]?.members.length ?? 0, 3);
}

// ── Which record to keep ─────────────────────────────────────────────────────

console.log('\n— the suggestion goes to the record being worked —');
{
  const g = findDuplicateGroups([
    co(1, 'Gardant', { attendee_count: 1 }),
    co(2, 'Gardant, LLC', { attendee_count: 9 }),
  ])[0];
  eq('most attendees wins', g.suggestedMasterId, 2);
}
{
  const g = findDuplicateGroups([
    co(1, 'Gardant', { attendee_count: 3 }),
    co(2, 'Gardant Inc', { attendee_count: 3 }),
  ])[0];
  eq('on a tie, the longer name — it carries more', g.suggestedMasterId, 2);
}
{
  const a = findDuplicateGroups([co(7, 'Marsh'), co(3, 'MARSH')])[0];
  const b = findDuplicateGroups([co(3, 'MARSH'), co(7, 'Marsh')])[0];
  eq('and the answer does not depend on row order',
    [a.suggestedMasterId, b.suggestedMasterId], [3, 3]);
}

// ── Dismissal ────────────────────────────────────────────────────────────────

console.log('\n— saying "not duplicates" sticks, but only for that set —');
{
  const list = [co(1, 'Smith Company'), co(2, 'Smith Corp')];
  const group = findDuplicateGroups(list)[0];
  eq('two firms that normalize alike are offered', group != null, true);

  const dismissed = new Set([group.dismissalKey]);
  eq('  and once dismissed, stop being offered',
    findDuplicateGroups(list, dismissed).length, 0);

  // A third spelling is a different question, and gets asked.
  const wider = [...list, co(3, 'Smith Co.')];
  eq('  but a third member brings the question back',
    findDuplicateGroups(wider, dismissed).length, 1);
  eq('    because the key carries the membership',
    dismissalKeyFor('smith', [1, 2]) === dismissalKeyFor('smith', [1, 2, 3]), false);
  eq('    and does not depend on the order ids arrive in',
    dismissalKeyFor('smith', [2, 1]), dismissalKeyFor('smith', [1, 2]));
}

// ── The route ────────────────────────────────────────────────────────────────

const { createClient } = await import('@libsql/client');
const { NextRequest } = await import('next/server');
const { db, dbReady, seedFreshDb } = await import('@/lib/db');
const { signToken } = await import('@/lib/auth');
await dbReady;
await seedFreshDb(db);

console.log('\n— end to end, against a real database —');
{
  const ACCOUNT = 'acct-dupes';
  const url = `file:${join(dir, 'tenant.db')}`;
  const tenant = createClient({ url });
  await seedFreshDb(tenant);
  await db.execute({
    sql: `INSERT INTO accounts (id, company_name, admin_email, turso_db_url, turso_auth_token)
          VALUES (?, 'Dupe Co', 'a@dupe.test', ?, '')`,
    args: [ACCOUNT, url],
  });
  const user = { id: 1200, email: 'rep@dupe.test', role: 'administrator', emailVerified: true, accountId: ACCOUNT };
  const cookie = `auth_token=${await signToken(user)}`;

  for (const n of ['Direct Supply', 'Direct Supply, Inc.', 'Brookdale Senior Living', 'Atria']) {
    await tenant.execute({ sql: 'INSERT INTO companies (name) VALUES (?)', args: [n] });
  }
  // Give one of the pair an attendee, so the suggestion has something to go on.
  await tenant.execute({
    sql: `INSERT INTO attendees (first_name, last_name, company_id)
          VALUES ('Dana', 'Reyes', (SELECT id FROM companies WHERE name = 'Direct Supply, Inc.'))`,
  });

  const route = await import('@/app/api/companies/duplicates/route');
  const get = async () => {
    const res = await route.GET(new NextRequest('https://parlay.test/d', { headers: { cookie } }));
    return { status: res.status, body: await res.json() };
  };

  const first = await get();
  eq('the scan succeeds', first.status, 200);
  eq('  finding the one real pair', first.body.groups.length, 1);
  eq('  and counting what could go', first.body.redundantRecords, 1);
  eq('  it suggests keeping the one with an attendee',
    first.body.groups[0].members.find(m => m.id === first.body.groups[0].suggestedMasterId).name,
    'Direct Supply, Inc.');
  eq('  the scan changed nothing', Number((await tenant.execute(
    'SELECT COUNT(*) AS n FROM companies')).rows[0].n), 4);

  // Deliberately no `users` row for this session in the tenant: a dismissal
  // must not depend on one. The attribution degrades to NULL; the answer sticks.
  const dismissRes = await route.POST(new NextRequest('https://parlay.test/d', {
    method: 'POST',
    headers: { cookie, 'Content-Type': 'application/json' },
    body: JSON.stringify({ dismissal_key: first.body.groups[0].dismissalKey }),
  }));
  eq('a dismissal is accepted', dismissRes.status, 200);
  eq('  even with no user row to attribute it to', Number((await tenant.execute(
    'SELECT COUNT(*) AS n FROM company_duplicate_dismissals WHERE dismissed_by_user_id IS NULL')).rows[0].n), 1);

  const second = await get();
  eq('  and the group is gone on the next scan', second.body.groups.length, 0);
  eq('  with the companies all still there', Number((await tenant.execute(
    'SELECT COUNT(*) AS n FROM companies')).rows[0].n), 4);

  // The domain signal end to end. The route has to pull attendee emails and
  // hand them to the scanner — wiring that the unit tests above cannot see.
  await tenant.execute({ sql: 'INSERT INTO companies (name, website) VALUES (?, ?)',
    args: ['T20 Holdings LLC', 'https://www.twenty20.com/about'] });
  await tenant.execute({ sql: 'INSERT INTO companies (name) VALUES (?)', args: ['Twenty20 Group'] });
  await tenant.execute({
    sql: `INSERT INTO attendees (first_name, last_name, email, company_id)
          VALUES ('Nia', 'Hall', 'nia@twenty20.com',
                  (SELECT id FROM companies WHERE name = 'Twenty20 Group'))`,
  });
  // And a pair that must NOT be connected: both have a free-provider attendee.
  for (const n of ['Unrelated One', 'Unrelated Two']) {
    await tenant.execute({ sql: 'INSERT INTO companies (name) VALUES (?)', args: [n] });
    await tenant.execute({
      sql: `INSERT INTO attendees (first_name, last_name, email, company_id)
            VALUES ('A', 'B', ?, (SELECT id FROM companies WHERE name = ?))`,
      args: [`someone@gmail.com`, n],
    });
  }

  const withDomains = await get();
  const domainGroup = withDomains.body.groups.find(g => g.matchedOn.includes('domain'));
  eq('the route finds a domain match', domainGroup != null, true);
  eq('  across two differently-named records',
    (domainGroup?.members ?? []).map(m => m.name).sort(), ['T20 Holdings LLC', 'Twenty20 Group']);
  eq('  naming the shared domain', domainGroup?.sharedDomains ?? null, ['twenty20.com']);
  eq('  and the gmail pair is not grouped',
    withDomains.body.groups.some(g => g.members.some(m => m.name.startsWith('Unrelated'))), false);

  const bad = await route.POST(new NextRequest('https://parlay.test/d', {
    method: 'POST',
    headers: { cookie, 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  }));
  eq('a dismissal with no key is refused', bad.status, 400);
}

console.log('\n— the panel proposes, it does not merge —');
{
  const { readFileSync } = await import('node:fs');
  const panel = readFileSync('components/DuplicateCompaniesPanel.tsx', 'utf8');
  // The scan endpoint must never be the merge endpoint, and the merge must be
  // something a person pressed — not something the scan does on their behalf.
  eq('the merge runs from the modal\'s callback only',
    /const handleMerge = async \(masterId: number, duplicateIds: number\[\]\)/.test(panel), true);
  eq('  which is only reachable through the modal',
    /onMerge=\{handleMerge\}/.test(panel), true);
  eq('  and the modal only opens from a button',
    /onClick=\{\(\) => setMerging\(group\)\}/.test(panel), true);
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
