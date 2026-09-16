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

const { findDuplicateGroups, dismissalKeyFor, domainsFor, groupMatchesQuery, isChildCompany, MAX_COMPANIES_PER_DOMAIN, MAX_COMPANIES_PER_STEM } = await import('@/lib/duplicateCompanies');
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

console.log('\n— one name being the start of another —');
{
  // The miss that prompted this signal, found on a real account: the exact key
  // will never connect these, because nothing it strips turns one into the
  // other. An earlier version of this file asserted the opposite for
  // "Sonida" / "Sonida Senior Living" — a judgement that the account's own data
  // showed was too conservative.
  const groups = findDuplicateGroups([co(1, '12 Oaks'), co(2, '12 Oaks Senior Living')]);
  eq('12 Oaks and 12 Oaks Senior Living are grouped', groups.length, 1);
  eq('  labelled as the weaker signal it is', groups[0]?.matchedOn ?? null, ['similar-name']);
  eq('  naming the words they share', groups[0]?.sharedStems ?? null, ['12 oaks']);

  eq('a one-word stem counts too', findDuplicateGroups([
    co(1, 'Gardant'), co(2, 'Gardant Management Solutions')]).length, 1);
  eq('  and so does the case that was wrongly excluded before', findDuplicateGroups([
    co(1, 'Sonida'), co(2, 'Sonida Senior Living')]).length, 1);
}

console.log('\n— but a stem has to be worth something —');
{
  // MIN_FUZZY_NAME_LENGTH is the floor, for the reason it exists: three
  // characters are a prefix of everything.
  eq('a three-letter stem connects nothing', findDuplicateGroups([
    co(1, 'ABC'), co(2, 'ABC Senior Living')]).length, 0);
  // Word boundary, not character prefix.
  eq('a stem must end on a word', findDuplicateGroups([
    co(1, 'Career'), co(2, 'Careington Health')]).length, 0);
  // And the stem must be somebody's whole name — this never invents one.
  eq('two long names sharing a start are not grouped by it', findDuplicateGroups([
    co(1, 'Belmont Senior Living'), co(2, 'Belmont Senior Care')]).length, 0);

  const many = Array.from({ length: MAX_COMPANIES_PER_STEM + 1 }, (_, i) =>
    co(i + 2, `Senior Living ${i}`));
  eq('a stem on too many records is a common word, not a company',
    findDuplicateGroups([co(1, 'Senior Living'), ...many]).length, 0);
}

console.log('\n— the scanner still finds everything the upload would collapse —');
{
  // Held one way round only. The scanner now groups MORE than the upload
  // collapses — that is the point of the similar-name and domain signals — but
  // it must never group LESS, or a cleanup done here is undone by the next
  // import.
  const spellings = [
    'Direct Supply', 'Direct supply', 'Direct Supply, Inc.',
    'Allegro Living', 'Allegro Living, LLC',
    'Brookdale Senior Living',
    'Hanson Bridgett', 'Hanson Bridgett LLP',
  ];
  const { aliasOf } = collapseNewCompanyNames(spellings);
  const scanned = findDuplicateGroups(spellings.map((n, i) => co(i + 1, n)));
  const groupOf = new Map();
  for (const g of scanned) for (const m of g.members) groupOf.set(m.name, g.key);

  // Every alias the upload would fold into a canonical name must be in the same
  // scanner group as that name.
  const split = Array.from(aliasOf.entries())
    .filter(([alias, canonical]) => groupOf.get(alias) === undefined
      || groupOf.get(alias) !== groupOf.get(canonical))
    .map(([alias, canonical]) => `${alias} / ${canonical}`);
  eq('the upload folds some of these together', aliasOf.size > 0, true);
  eq('  and the scanner groups every one of those pairs', split, []);
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

// ── Families are not duplicates ──────────────────────────────────────────────

console.log('\n— a parent and its own child are flagged, not hidden —');
{
  // The case that prompted this: "12 Oaks" and "12 Oaks Senior Living" match on
  // a shared stem, and may be one company twice — or a hierarchy somebody built.
  const groups = findDuplicateGroups([
    co(1, '12 Oaks'),
    co(2, '12 Oaks Senior Living', { parent_company_id: 1 }),
  ]);
  eq('they are still offered', groups.length, 1);
  eq('  and the relationship is stated',
    (groups[0]?.familyLinks ?? []).map(l => `${l.childName}<${l.parentName}`),
    ['12 Oaks Senior Living<12 Oaks']);
}
{
  // Ordinary duplicates carry nothing, so the warning means something when it
  // does appear.
  const groups = findDuplicateGroups([co(1, 'Direct Supply'), co(2, 'Direct Supply, Inc.')]);
  eq('an ordinary group carries no family warning', groups[0]?.familyLinks ?? null, []);
}
{
  // A member whose parent is NOT in this group is a child of something else.
  // Worth labelling on the row, but it is not this group's hierarchy to break.
  const groups = findDuplicateGroups([
    co(1, 'Belmont Care', { parent_company_id: 99 }),
    co(2, 'Belmont Care, LLC'),
  ]);
  eq('a parent outside the group is not a link within it', groups[0]?.familyLinks ?? null, []);
}

console.log('\n— what counts as a child —');
{
  eq('a parent link makes one', isChildCompany({ id: 1, name: 'x', parent_company_id: 7 }), true);
  eq('  whatever the designation says', isChildCompany(
    { id: 1, name: 'x', parent_company_id: 7, entity_structure: 'Parent' }, 'Child'), true);
  eq('no link and no designation is not one',
    isChildCompany({ id: 1, name: 'x', parent_company_id: null }), false);

  // An imported Entity Structure value speaks only where there is no link.
  eq('a designation alone counts', isChildCompany(
    { id: 1, name: 'x', entity_structure: 'Child' }, 'Child'), true);
  eq('  matched against what THIS account calls a child', isChildCompany(
    { id: 1, name: 'x', entity_structure: 'Subsidiary' }, 'Subsidiary'), true);
  eq('  and ignored when the account has no such wording', isChildCompany(
    { id: 1, name: 'x', entity_structure: 'Child' }, null), false);
  eq('  case and padding do not matter', isChildCompany(
    { id: 1, name: 'x', entity_structure: '  child ' }, 'Child'), true);
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

  // A real parent and child, offered together. The route has to carry the link
  // and the account's own wording for it — neither is visible to the unit tests.
  await tenant.execute({ sql: `INSERT INTO companies (name) VALUES ('12 Oaks')` });
  await tenant.execute({
    sql: `INSERT INTO companies (name, parent_company_id)
          VALUES ('12 Oaks Senior Living', (SELECT id FROM companies WHERE name = '12 Oaks'))`,
  });

  const withFamily = await get();
  const familyGroup = withFamily.body.groups.find(g => (g.familyLinks ?? []).length > 0);
  eq('the route reports the family link', familyGroup != null, true);
  eq('  naming the child and the parent',
    (familyGroup?.familyLinks ?? []).map(l => `${l.childName} < ${l.parentName}`),
    ['12 Oaks Senior Living < 12 Oaks']);
  eq('  and the child carries its parent\'s name for the row',
    (familyGroup?.members ?? []).find(m => m.name === '12 Oaks Senior Living')?.parent_company_name,
    '12 Oaks');
  eq('  with the parent counting its children',
    (familyGroup?.members ?? []).find(m => m.name === '12 Oaks')?.child_count, 1);
  eq('the account\'s words for a family are sent too',
    [withFamily.body.childDesignation, withFamily.body.parentDesignation], ['Child', 'Parent']);

  // An account that renames them gets its own words, without touching this
  // code. Position decides which is which — the rule resolveEntityDesignation
  // owns — so the rows are renamed in place rather than re-inserted.
  await tenant.execute({
    sql: `UPDATE config_options SET value = 'Portfolio'
           WHERE category = 'entity_structure' AND value = 'Parent'`,
  });
  await tenant.execute({
    sql: `UPDATE config_options SET value = 'Community'
           WHERE category = 'entity_structure' AND value = 'Child'`,
  });
  const renamed = await get();
  eq('renaming them in admin renames the pills',
    [renamed.body.childDesignation, renamed.body.parentDesignation], ['Community', 'Portfolio']);

  const bad = await route.POST(new NextRequest('https://parlay.test/d', {
    method: 'POST',
    headers: { cookie, 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  }));
  eq('a dismissal with no key is refused', bad.status, 400);
}

console.log('\n— a group is a proposal you can take apart —');
{
  // A three-record group can be two companies and a mistake. Merging used to be
  // all-or-nothing, so acting on the two that ARE the same meant taking the
  // third with them. The modal now decides from what is still ticked.
  const { readFileSync } = await import('node:fs');
  const modal = readFileSync('components/MergeModal.tsx', 'utf8');

  eq('everything offered starts selected',
    /setIncludedIds\(new Set\(items\.map\(\(i\) => i\.id\)\)\)/.test(modal), true);
  eq('  and the record being kept is not asked about',
    /masterId !== item\.id && \(/.test(modal), true);

  // The preview, the button's enabled state and the request must agree on WHAT
  // is being merged. They used to compute it separately from the same source,
  // which was checked by counting the copies; there is one definition now, and
  // agreement is structural rather than asserted.
  const filters = modal.match(/id !== masterId && includedIds\.has\(id\)/g) ?? [];
  eq('the selection is worked out once', filters.length, 1);
  eq('  and the count comes from it', /const duplicateCount = duplicateIds\.length/.test(modal), true);
  eq('  as does the request', /duplicate_ids: duplicateIds/.test(modal), true);
  eq('  and the preview', /duplicate_ids: duplicateIds, preview: true/.test(modal), true);
  eq('unticking everything disables it rather than merging nothing',
    /const canMerge = masterId !== null && duplicateCount > 0/.test(modal), true);
  eq('  and the request refuses an empty selection',
    /if \(duplicateIds\.length === 0\) return;/.test(modal), true);
  eq('the button says how many are going',
    /Merge \$\{duplicateCount\} record/.test(modal), true);
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

console.log('\n— the results are split by what found them —');
{
  const { bucketFor } = await import('@/lib/duplicateCompanies');
  const g = (matchedOn) => ({ matchedOn });

  eq('an exact-name group is a name match', bucketFor(g(['name'])), 'name');
  eq('  and so is a stem match', bucketFor(g(['similar-name'])), 'name');
  eq('  even though the two are different claims',
    bucketFor(g(['name'])) === bucketFor(g(['similar-name'])), true);
  eq('a domain-only group is its own kind', bucketFor(g(['domain'])), 'domain');
  eq('and a group with both is neither of those',
    [bucketFor(g(['name', 'domain'])), bucketFor(g(['similar-name', 'domain']))], ['both', 'both']);

  // Every group lands somewhere: a section that quietly dropped a kind of
  // match would make the panel smaller than the scan.
  const buckets = new Set([
    ['name'], ['similar-name'], ['domain'],
    ['name', 'domain'], ['similar-name', 'domain'], ['name', 'similar-name'],
    ['name', 'similar-name', 'domain'],
  ].map(m => bucketFor(g(m))));
  eq('every combination of signals has a home', Array.from(buckets).sort(),
    ['both', 'domain', 'name']);
}

console.log('\n— and every section starts closed —');
{
  const { readFileSync } = await import('node:fs');
  const panel = readFileSync('components/DuplicateCompaniesPanel.tsx', 'utf8');
  eq('nothing is open until it is opened',
    /useState<Set<Bucket>>\(new Set\(\)\)/.test(panel), true);
  eq('  and the open state is per section, not one at a time',
    /const \[open, setOpen\] = useState<Set<Bucket>>/.test(panel), true);
  eq('a section renders its groups only when open',
    /\{isOpen && \([\s\S]{0,200}inBucket\.map\(renderGroup\)/.test(panel), true);
  eq('the domain tag reads "similar domain"', /similar domain</.test(panel), true);
  eq('  and no longer claims sameness', /same domain</.test(panel), false);
}

console.log('\n— searching the groups —');
{
  const group = {
    members: [{ id: 1, name: '12 Oaks' }, { id: 2, name: '12 Oaks Senior Living' }],
    sharedDomains: ['twelveoaks.com'],
    sharedStems: ['12 oaks'],
  };

  eq('an empty query matches everything', groupMatchesQuery(group, ''), true);
  eq('  as does whitespace', groupMatchesQuery(group, '   '), true);
  eq('a company name matches', groupMatchesQuery(group, 'Senior Living'), true);
  eq('  regardless of case', groupMatchesQuery(group, 'SENIOR living'), true);
  eq('  and it need not be the first member', groupMatchesQuery(group, '12 Oaks Senior'), true);
  eq('a domain matches', groupMatchesQuery(group, 'twelveoaks.com'), true);
  eq('  and part of one does', groupMatchesQuery(group, 'twelveoak'), true);
  eq('the shared words match', groupMatchesQuery(group, '12 oaks'), true);
  eq('something in none of them does not', groupMatchesQuery(group, 'brookdale'), false);

  // Searching is not matching. Running the query through normalizeCompanyName
  // would drop a suffix somebody typed deliberately to narrow the list.
  const withSuffix = {
    members: [{ id: 1, name: 'Allegro Living, LLC' }, { id: 2, name: 'Allegro Living' }],
    sharedDomains: [], sharedStems: [],
  };
  eq('a typed legal suffix still narrows rather than being stripped',
    [groupMatchesQuery(withSuffix, 'LLC'), groupMatchesQuery(withSuffix, 'Allegro')], [true, true]);
}

console.log('\n— the search box and what it does to the sections —');
{
  const { readFileSync } = await import('node:fs');
  const panel = readFileSync('components/DuplicateCompaniesPanel.tsx', 'utf8');

  eq('the panel has a search box', /placeholder="Search company or domain…"/.test(panel), true);
  eq('  labelled for anyone not using a mouse',
    /aria-label="Search duplicate groups by company or domain"/.test(panel), true);
  // Order, not proximity: a character window between the two is a number that
  // breaks the next time anything is added between them.
  //
  // Scoped to the row itself. Searching the whole file finds the "no duplicates
  // found" branch's own Scan again button first, which sits ABOVE this one and
  // made the assertion pass or fail for the wrong reason.
  const row = panel.slice(panel.indexOf('flex w-full flex-wrap items-center gap-2 sm:w-auto'));
  eq('  the search and Scan again share a row', row.length > 0, true);
  const inputAt = row.indexOf('Search company or domain…');
  const scanAt = row.indexOf("'Scan again'");
  eq('  with the search first', inputAt > 0 && scanAt > inputAt, true);
  eq('  with a way to clear it', /onClick=\{\(\) => setQuery\(''\)\}/.test(panel), true);

  eq('the query filters the groups before they are bucketed',
    /if \(!groupMatchesQuery\(group, query\)\) continue;/.test(panel), true);

  // A closed section with matches inside reads as a search that found nothing.
  eq('a live query opens the sections', /const isOpen = searching \|\| open\.has\(bucket\)/.test(panel), true);
  eq('  without overwriting what the reader had open',
    /setOpen/.test(panel) && !/setOpen\([\s\S]{0,80}searching/.test(panel), true);
  eq('and a query that finds nothing says so',
    /No duplicate groups mention/.test(panel), true);
}

console.log('\n— the row is readable on a phone —');
{
  // Measured in Chromium at 390px against this markup: the action buttons no
  // longer share a line with the evidence tags, and the row is 265px instead of
  // 388px. At 1280px it stays a side-by-side row, 129px against 116px before.
  const { readFileSync } = await import('node:fs');
  const panel = readFileSync('components/DuplicateCompaniesPanel.tsx', 'utf8');

  eq('the row stacks on a phone and sits side by side from sm',
    /flex flex-col gap-3 py-3 sm:flex-row/.test(panel), true);
  // Every pill in the row, not a count of them — a number here fails the day a
  // pill is added, which says nothing about whether any of them wrap.
  // Both quoting styles: a pill whose classes are computed is still a pill, and
  // matching only the double-quoted ones would quietly stop checking it.
  const pills = panel.match(/className=[{"`]*[^"`]*rounded bg-[^"`]*px-1\.5 py-0\.5[^"`]*/g) ?? [];
  eq('there are pills to check', pills.length >= 4, true);
  eq('and none of them breaks mid-phrase',
    pills.filter(p => !p.includes('whitespace-nowrap')), []);
  eq('the evidence takes its own line only on a phone',
    /w-full min-w-0 truncate text-gray-500 sm:w-auto/.test(panel), true);
  eq('a company\'s counts drop under its name on a phone, beside it from sm',
    /block text-xs text-gray-400 sm:ml-2 sm:inline/.test(panel), true);
  eq('and the primary action fills the width it is given on a phone',
    /btn-primary flex-1 whitespace-nowrap[^"]*sm:flex-none/.test(panel), true);

  // Measured in Chromium against the stylesheet `npm run build` compiled from
  // this panel. "Bldg of Latitude Healthcare Management, Inc." beside the name
  // ran off the right edge of a 390px screen with no way to read the rest. On
  // its own line it stays inside the container; in a 300px container the line
  // holds 342px of content and scrolls to 42px, with a 0px scrollbar gutter.
  const badgeLine = panel.match(/className="(mt-0\.5 block[^"]*)"/)?.[1] ?? '';
  eq('the badges get their own line on a phone', /\bblock\b/.test(badgeLine), true);
  eq('  and go back beside the name from sm', /\bsm:inline\b/.test(badgeLine), true);
  eq('  staying on one line rather than wrapping', /\bwhitespace-nowrap\b/.test(badgeLine), true);
  eq('  what overflows it can be scrolled to', /\boverflow-x-auto\b/.test(badgeLine), true);
  eq('  without a scrollbar under every company',
    /\bscrollbar-hide\b/.test(badgeLine), true);
  eq('  and nothing clipping it once it is inline again',
    /\bsm:overflow-visible\b/.test(badgeLine), true);
  // scrollbar-hide has to hide it in both engines, or the phone shows a trough.
  const css = readFileSync('app/globals.css', 'utf8');
  eq('scrollbar-hide hides it in webkit and in gecko',
    [/\.scrollbar-hide::-webkit-scrollbar/.test(css), /\.scrollbar-hide\s*\{[^}]*scrollbar-width:\s*none/.test(css)],
    [true, true]);
  // An empty line under every name would be 2px of nothing per company.
  eq('the line is not rendered when there are no badges',
    /\{\(m\.id === group\.suggestedMasterId[\s\S]{0,160}\(m\.child_count \?\? 0\) > 0\) && \(\s*<span className="mt-0\.5 block/.test(panel), true);
  // The first badge on the line starts at the left margin; only beside the
  // name does it need clearing from it.
  eq('the badge line is not indented on a phone',
    /suggested to keep/.test(panel)
      && /whitespace-nowrap text-\[11px\] font-medium text-brand-secondary sm:ml-2/.test(panel), true);
}

console.log('\n— the merge sheet on a phone —');
{
  const { readFileSync } = await import('node:fs');
  const modal = readFileSync('components/MergeModal.tsx', 'utf8');
  const css = readFileSync('app/globals.css', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

  eq('it rises from the bottom edge on a phone',
    /fixed inset-0 z-50 flex items-end justify-center[^"]*sm:items-center/.test(modal), true);
  eq('  with the same animation the other sheets use',
    /modal-sheet-mobile/.test(modal), true);
  eq('  rounded at the top like a drawer, a dialog again from sm',
    /rounded-t-2xl[^"]*sm:rounded-xl/.test(modal), true);

  // It is allowed MORE height than the other drawers: they stop at the
  // header's bottom edge, this stops where its icons begin.
  const sheetCap = css.match(/\.modal-sheet-mobile\.sheet-to-header-top\s*\{([^}]*)\}/)?.[1] ?? '';
  eq('the sheet has its own cap', sheetCap !== '', true);
  eq('  measured from the top of the icon row, not the header\'s bottom',
    /env\(safe-area-inset-top\)\s*\+\s*0\.75rem/.test(sheetCap), true);
  eq('  and not from --mobile-header-h, which is where the drawers stop',
    /--mobile-header-h/.test(sheetCap), false);

  // The header's own padding uses the same two terms. If one moves and the
  // other does not, the sheet's top edge drifts off the icon row.
  const header = css.match(/\.header-mobile-dark\s*\{([^}]*)\}/)?.[1] ?? '';
  eq('the header still starts its icons at the same offset',
    /0\.75rem/.test(header) && /env\(safe-area-inset-top\)/.test(header), true);

  eq('  with a dvh reading as well as vh', /100dvh/.test(sheetCap), true);
}

console.log('\n— the preview is asked for, not volunteered —');
{
  const { readFileSync } = await import('node:fs');
  const modal = readFileSync('components/MergeModal.tsx', 'utf8');

  // It is a real merge run and rolled back. Firing it on every tick put a round
  // trip between the reader and their own checkbox.
  eq('nothing fetches a preview from an effect',
    /useEffect\([\s\S]{0,400}preview: true/.test(modal), false);
  eq('  it has a button', /onClick=\{checkWhatWouldMove\}/.test(modal), true);
  eq('  and that is the only thing that asks for one',
    (modal.match(/preview: true/g) ?? []).length, 1);

  // A preview belongs to the selection it described.
  eq('the answer is tied to the selection it describes',
    /setPreviewOf\(data \? forSelection : null\)/.test(modal), true);
  eq('  and only shown while that selection stands',
    /const previewIsCurrent = preview !== null && previewOf === selectionKey/.test(modal), true);
  eq('  so changing the ticks puts the button back',
    /\{!previewIsCurrent && \(/.test(modal), true);
  eq('the selection key does not depend on tick order',
    /duplicateIds\.slice\(\)\.sort\(\(a, b\) => a - b\)\.join\(','\)/.test(modal), true);

  // Whatever the preview says, the irreversibility is stated either way.
  eq('the warning stands with or without a preview',
    (modal.match(/cannot be undone/g) ?? []).length >= 2, true);
}

console.log('\n— the warning follows into the sheet —');
{
  const { readFileSync } = await import('node:fs');
  const panel = readFileSync('components/DuplicateCompaniesPanel.tsx', 'utf8');
  const modal = readFileSync('components/MergeModal.tsx', 'utf8');

  // Seeing "child of X" in the list but not while choosing is exactly where the
  // mistake gets made, so both travel with the group into the sheet.
  // The pill says it in the account's own words — "Community", not "child
  // company" — so a renamed pair reads correctly everywhere it appears.
  eq('the child pill is the account\'s word for it', /\{childLabel\}\n?\s*<\/span>/.test(panel), true);
  eq('  and the parent pill likewise', /\{parentLabel\}\n?\s*<\/span>/.test(panel), true);
  // Against the code, not the prose that explains it — the docstring above the
  // pills says the words "child company" precisely to say it no longer renders
  // them, and a comment is not something a user can read.
  const panelCode = panel.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  eq('  with nothing hardcoding the canonical words into a pill',
    /child company|parent of \{m\.child_count\}|child of \$\{m\.parent_company_name\}/.test(panelCode), false);
  eq('whose it is sits beside the pill, not inside it',
    /of \{m\.parent_company_name\}/.test(panel), true);
  eq('  and the labels fall back only when nothing is configured',
    /const childLabel = childDesignation \|\| 'Child'/.test(panel), true);
  eq('the group-level warning is shown above the names',
    /Already a family\./.test(panel), true);

  eq('each record can carry a note into the sheet', /note\?: string;/.test(modal), true);
  eq('  and the panel sets it from the family', /note: isChildCompany\(m, childDesignation\)/.test(panel), true);
  eq('the sheet takes a warning', /warning\?: string;/.test(modal), true);
  eq('  and shows it above the list', /These are already a family\./.test(modal), true);
  eq('  passed only when there is one', /warning=\{merging\.familyLinks\.length > 0/.test(panel), true);

  // It warns; it does not block. Sometimes the family IS the mistake.
  eq('nothing is disabled by it', /disabled=\{[^}]*warning/.test(modal), false);
}

console.log('\n— the merge checkbox is a control, not a decoration —');
{
  const { readFileSync } = await import('node:fs');
  const modal = readFileSync('components/MergeModal.tsx', 'utf8');

  // It sat inside the SAME <label> as the radio that picks the record to keep.
  // A label forwards a click to its labelled control — the first labelable
  // element in it — so the checkbox was inside a label answering for the radio,
  // and the preventDefault added to stop that took the checkbox's own toggle
  // with it. Measured in Chromium: tapping "merge" fired nothing at all. The
  // box never changed, which is what read as lag.
  eq('the row is no longer one label around both controls',
    /<label\s+key=\{item\.id\}/.test(modal), false);
  eq('  the picker has its own label', /<label className="flex min-w-0 flex-1 cursor-pointer items-start gap-3">/.test(modal), true);
  eq('  and so does the checkbox', /<label className="flex flex-shrink-0 cursor-pointer items-center gap-1\.5/.test(modal), true);
  eq('  with nothing cancelling its click', /onClick=\{\(e\) => e\.preventDefault\(\)\}/.test(modal), false);
}

console.log('\n— a parent re-render does not undo the ticks —');
{
  const { readFileSync } = await import('node:fs');
  const modal = readFileSync('components/MergeModal.tsx', 'utf8');

  // The panel builds a fresh `items` array on every one of its renders. Keying
  // the reset on that identity meant any re-render above this component put
  // every tick back on, silently.
  eq('the reset is keyed on which records are offered',
    /const itemIdsKey = items\.map\(\(i\) => i\.id\)\.join\(','\)/.test(modal), true);
  eq('  not on the array carrying them',
    /\}, \[isOpen, defaultMasterId, itemIdsKey\]\)/.test(modal), true);
  eq('  so `items` is not a dependency of the reset',
    /\}, \[isOpen, defaultMasterId, items\]\)/.test(modal), false);
}

console.log('\n— the merge button shows it is working —');
{
  const { readFileSync } = await import('node:fs');
  const modal = readFileSync('components/MergeModal.tsx', 'utf8');

  // A merge of a large group reassigns sixteen tables' worth of rows and then
  // deletes. On a phone a still button reads as one that did not work.
  eq('there is a spinner', /animate-spin/.test(modal), true);
  eq('  shown only while merging', /\{isLoading && \([\s\S]{0,200}animate-spin/.test(modal), true);
  eq('  beside the word, not instead of it', /isLoading\s*\?\s*'Merging…'/.test(modal), true);
  eq('  and hidden from anything reading the button aloud',
    /animate-spin[\s\S]{0,120}aria-hidden="true"/.test(modal), true);
}

console.log('\n— the scan is started from the filter row —');
{
  const { readFileSync } = await import('node:fs');
  const page = readFileSync('app/companies/page.tsx', 'utf8');
  const table = readFileSync('components/CompanyTable.tsx', 'utf8');

  eq('the table takes something to render before Filters',
    /beforeFiltersButton\?: React\.ReactNode/.test(table), true);
  eq('  and renders it immediately before that button',
    /\{beforeFiltersButton\}\s*<button[\s\S]{0,120}setFiltersOpen/.test(table), true);
  eq('the page puts the scan there', /beforeFiltersButton=\{\(/.test(page), true);
  eq('  wired to the same scan the panel reruns',
    /onClick=\{duplicateScan\.scan\}/.test(page), true);
  eq('  with the state owned above both', /const duplicateScan = useDuplicateScan\(\)/.test(page), true);
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
