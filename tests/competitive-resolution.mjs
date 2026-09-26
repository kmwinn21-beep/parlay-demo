/**
 * Which end of a stored relationship is the competitor.
 *
 *   node --experimental-strip-types --import ./tests/register-ts.mjs \
 *        tests/competitive-resolution.mjs
 *
 * The rule is small and the consequences of getting it backwards are not: a
 * flipped end puts a competitor in the account column and reads as our own
 * customer evaluating us. None of that is visible in a screenshot of the grid,
 * so it is all here.
 *
 * Exits non-zero on the first failing expectation, so it can gate a build.
 */
import { readFileSync } from 'node:fs';

let pass = 0;
let fail = 0;
const eq = (label, got, want) => {
  const g = JSON.stringify(got);
  const w = JSON.stringify(want);
  if (g === w) { pass++; console.log(`  ok   ${label}`); }
  else { fail++; console.log(`  FAIL ${label}\n       got  ${g}\n       want ${w}`); }
};

const { resolveCompetitive, buildStatusIndex } = await import('@/lib/competitiveResolution');
const { deriveSignals } = await import('@/lib/competitiveSignals');

const strip = (f) => readFileSync(f, 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '');

// The seeded statuses, exactly as the migration leaves them.
const SEEDED = [
  { value: 'Current Vendor', inverseValue: 'Customer', actionKey: 'current' },
  { value: 'Evaluating', inverseValue: 'Prospect', actionKey: 'evaluating' },
  { value: 'Former Vendor', inverseValue: 'Former Customer', actionKey: 'former' },
  { value: 'Preferred Partner', inverseValue: 'Preferred Partner', actionKey: 'current' },
  { value: 'Active Pilot', inverseValue: 'Piloting', actionKey: 'evaluating' },
  { value: 'Other', inverseValue: 'Other', actionKey: null },
];

// 100 = an operator we sell to, 200/201 = competitors, 300 = a partner.
const co = (id, name, types) => [id, { id, name, types }];
const COMPANIES = new Map([
  co(100, 'Mission Health', ['Operator', 'Customer']),
  co(101, 'Lakeside Senior', ['Operator']),
  co(200, 'Teton Systems', ['Competitor']),
  co(201, 'Vireo Software', ['Vendor', 'Competitor']),
  co(300, 'Northwind Capital', ['Capital']),
]);
const run = (rows, over = {}) => resolveCompetitive({
  rows,
  statusConfig: over.statusConfig ?? SEEDED,
  companies: over.companies ?? COMPANIES,
  competitorTypes: over.competitorTypes ?? ['Competitor'],
});
const row = (id, companyId, relatedCompanyId, statuses, statusChangedAt = null) =>
  ({ id, companyId, relatedCompanyId, statuses, statusChangedAt });

console.log('\n— the status points at the vendor end —');
{
  // Logged on the operator's page: "Teton is our Current Vendor".
  const a = run([row(1, 100, 200, ['Current Vendor'])]);
  eq('an outbound vendor-naming status makes the related end the competitor',
    a.relationships, [{ id: 1, companyId: 100, competitorId: 200, statusClass: 'current', statusChangedAt: null }]);

  // The SAME fact logged from the competitor's page: "Mission is our Customer".
  // company_id and related_company_id are swapped and so is the wording, and
  // the answer must not move.
  const b = run([row(2, 200, 100, ['Customer'])]);
  eq('a counterpart status makes the LOGGING end the competitor',
    b.relationships, [{ id: 2, companyId: 100, competitorId: 200, statusClass: 'current', statusChangedAt: null }]);
  eq('  so both directions resolve to the same pair',
    [a.relationships[0]?.companyId, a.relationships[0]?.competitorId],
    [b.relationships[0]?.companyId, b.relationships[0]?.competitorId]);

  // Keying on related_company_id is the bug this exists to prevent.
  eq('  and NOT to the stored related_company_id',
    b.relationships[0]?.competitorId === 100, false);

  eq('Prospect resolves the same way, as evaluating',
    run([row(3, 200, 101, ['Prospect'])]).relationships,
    [{ id: 3, companyId: 101, competitorId: 200, statusClass: 'evaluating', statusChangedAt: null }]);
  eq('Former Customer too, as former',
    run([row(4, 200, 101, ['Former Customer'])]).relationships,
    [{ id: 4, companyId: 101, competitorId: 200, statusClass: 'former', statusChangedAt: null }]);
  eq('and the vendor-naming halves keep their own classes',
    run([
      row(5, 100, 200, ['Evaluating']),
      row(6, 101, 200, ['Former Vendor']),
    ]).relationships.map(r => [r.companyId, r.competitorId, r.statusClass]),
    [[100, 200, 'evaluating'], [101, 200, 'former']]);
}

console.log('\n— the end the status names is never flipped to fit —');
{
  // "Northwind is our Current Vendor", logged on the operator's page. The
  // status names Northwind, which is not a competitor. The operator IS a
  // competitor to nobody either — but even if the other end were one, reading
  // this backwards would invent a purchase in the opposite direction.
  eq('a status naming a non-competitor end drops the row',
    run([row(7, 100, 300, ['Current Vendor'])]),
    { relationships: [], competitors: [], notCompetitive: 1, duplicates: 0 });

  // The dangerous case: the status names the operator as the vendor, and the
  // OTHER end happens to be a competitor. Flipping would read "Teton is
  // evaluating Mission", which is not what anybody wrote.
  const flipBait = run([row(8, 100, 200, ['Customer'])]);
  eq('  even when the opposite end is a competitor',
    flipBait, { relationships: [], competitors: [], notCompetitive: 1, duplicates: 0 });
  eq('  nothing is silently reversed',
    flipBait.relationships.length, 0);
}

console.log('\n— a symmetric status has no direction, so the types decide —');
{
  eq('Preferred Partner on the operator page puts the competitor at the far end',
    run([row(9, 100, 200, ['Preferred Partner'])]).relationships,
    [{ id: 9, companyId: 100, competitorId: 200, statusClass: 'current', statusChangedAt: null }]);
  eq('  and reversed, the competitor is still the competitor',
    run([row(10, 200, 100, ['Preferred Partner'])]).relationships,
    [{ id: 10, companyId: 100, competitorId: 200, statusClass: 'current', statusChangedAt: null }]);
  // Active Pilot is NOT symmetric — the value names the thing being piloted —
  // so it points at an end like any other directional status.
  eq('Active Pilot names the related end as the competitor',
    run([row(11, 101, 200, ['Active Pilot'])]).relationships.map(r => [r.companyId, r.competitorId, r.statusClass]),
    [[101, 200, 'evaluating']]);
  eq('  and Piloting names the logging end',
    run([row(12, 101, 200, ['Piloting'])]).relationships.map(r => [r.companyId, r.competitorId]),
    []);
  eq('  which drops when the logging end is not a competitor',
    run([row(13, 101, 200, ['Piloting'])]).notCompetitive, 1);
  eq('  and resolves when it is',
    run([row(14, 200, 101, ['Piloting'])]).relationships.map(r => [r.companyId, r.competitorId, r.statusClass]),
    [[101, 200, 'evaluating']]);
  eq('a symmetric status between two non-competitors is not this view at all',
    run([row(12, 100, 300, ['Preferred Partner'])]),
    { relationships: [], competitors: [], notCompetitive: 1, duplicates: 0 });
}

console.log('\n— both ends typed Competitor —');
{
  // Legitimate intel: one competitor buying from another. Rendered, not dropped.
  const directional = run([row(13, 201, 200, ['Current Vendor'])]);
  eq('a directional status decides which is which',
    directional.relationships, [{ id: 13, companyId: 201, competitorId: 200, statusClass: 'current', statusChangedAt: null }]);
  eq('  and the row is kept, not dropped as ambiguous',
    directional.notCompetitive, 0);
  eq('  reversed wording swaps them',
    run([row(14, 201, 200, ['Customer'])]).relationships.map(r => [r.companyId, r.competitorId]),
    [[200, 201]]);
  // Symmetric between two competitors: the words point nowhere, so the row is
  // read as written and the side that recorded it is the account.
  eq('a symmetric status between two competitors reads as written',
    run([row(15, 201, 200, ['Preferred Partner'])]).relationships.map(r => [r.companyId, r.competitorId]),
    [[201, 200]]);
}

console.log('\n— the competitor test is the action_key, not the word —');
{
  // An account that renamed the type. 'Competitor' no longer appears anywhere.
  const renamed = new Map([
    co(100, 'Mission Health', ['Operator']),
    co(200, 'Teton Systems', ['Rival Platform']),
  ]);
  eq('a renamed competitor type still resolves',
    run([row(16, 100, 200, ['Current Vendor'])], {
      companies: renamed, competitorTypes: ['Rival Platform'],
    }).relationships.map(r => [r.companyId, r.competitorId]), [[100, 200]]);
  eq('  and matching the old word instead finds nothing',
    run([row(17, 100, 200, ['Current Vendor'])], {
      companies: renamed, competitorTypes: ['Competitor'],
    }).notCompetitive, 1);
  // Case is not the account's problem.
  eq('the match ignores case',
    run([row(18, 100, 200, ['Current Vendor'])], {
      companies: new Map([co(100, 'M', ['Operator']), co(200, 'T', ['competitor'])]),
      competitorTypes: ['COMPETITOR'],
    }).relationships.length, 1);
  eq('no competitor type configured means an empty view, not everything',
    run([row(19, 100, 200, ['Current Vendor'])], { competitorTypes: [] }),
    { relationships: [], competitors: [], notCompetitive: 1, duplicates: 0 });
}

console.log('\n— a company can carry several types —');
{
  // Vireo is Vendor AND Competitor. One of its types matching is enough.
  eq('a multi-typed company counts on any matching type',
    run([row(20, 100, 201, ['Current Vendor'])]).relationships.map(r => [r.companyId, r.competitorId]),
    [[100, 201]]);
  eq('  and a company with no types counts as no competitor',
    run([row(21, 100, 999, ['Current Vendor'])]).notCompetitive, 1);
  eq('  a type list that merely CONTAINS the word does not match',
    run([row(22, 100, 200, ['Current Vendor'])], {
      companies: new Map([co(100, 'M', ['Operator']), co(200, 'T', ['Former Competitor'])]),
      competitorTypes: ['Competitor'],
    }).notCompetitive, 1);
}

console.log('\n— one pair logged from both sides is one entry —');
{
  const both = run([
    row(30, 100, 200, ['Current Vendor'], '2026-08-01 10:00:00'),
    row(31, 200, 100, ['Customer'], null),
  ]);
  eq('two rows for the same pair collapse to one',
    both.relationships.length, 1);
  eq('  counted so the drop is not silent', both.duplicates, 1);
  eq('  and the row with a known change date wins',
    both.relationships[0]?.id, 30);

  // Order must not decide it.
  const reversed = run([
    row(31, 200, 100, ['Customer'], null),
    row(30, 100, 200, ['Current Vendor'], '2026-08-01 10:00:00'),
  ]);
  eq('  whichever order they arrive in', reversed.relationships[0]?.id, 30);

  // Both dated: the later one.
  eq('two dated rows keep the later date',
    run([
      row(40, 100, 200, ['Current Vendor'], '2026-01-01 00:00:00'),
      row(41, 200, 100, ['Customer'], '2026-06-01 00:00:00'),
    ]).relationships.map(r => [r.id, r.statusChangedAt]),
    [[41, '2026-06-01 00:00:00']]);
  // Neither dated: the higher id, so the result is stable rather than arbitrary.
  eq('two undated rows keep the higher id',
    run([
      row(50, 100, 200, ['Current Vendor']),
      row(51, 200, 100, ['Customer']),
    ]).relationships.map(r => r.id), [51]);

  // Different pairs must NOT collapse. The grid's whole point is one account
  // appearing under two competitors.
  eq('the same account under two competitors stays two entries',
    run([
      row(60, 100, 200, ['Current Vendor']),
      row(61, 100, 201, ['Evaluating']),
    ]).relationships.map(r => [r.companyId, r.competitorId]), [[100, 200], [100, 201]]);
  eq('  and two accounts under one competitor likewise',
    run([
      row(62, 100, 200, ['Current Vendor']),
      row(63, 101, 200, ['Current Vendor']),
    ]).relationships.length, 2);
}

console.log('\n— unclassified statuses keep their pair and their count —');
{
  // 'Other' has no action_key. It is symmetric, so the types place it, and it
  // arrives with a null class rather than a guess.
  const other = run([row(70, 100, 200, ['Other'])]);
  eq('an unclassified status still resolves to a pair',
    other.relationships, [{ id: 70, companyId: 100, competitorId: 200, statusClass: null, statusChangedAt: null }]);
  // deriveSignals owns the count, and this is the number the rail shows.
  const derived = deriveSignals({ relationships: other.relationships });
  eq('  deriveSignals counts it and gives it no cell',
    [derived.cells.length, derived.unclassifiedCount], [0, 1]);
  eq('a status nobody configured at all is unclassified, not dropped',
    run([row(71, 100, 200, ['Handshake Deal'])]).relationships.map(r => r.statusClass), [null]);
  // The words are never read. A custom status that happens to say "Vendor" is
  // exactly what a guess would swallow, and a rename is what makes the guess
  // wrong later.
  eq('  and one that READS like a seeded status is still unclassified',
    run([row(74, 100, 200, ['Legacy Vendor'])]).relationships.map(r => r.statusClass), [null]);
  eq('  including one that reads like the counterpart half',
    run([row(75, 200, 100, ['Named Customer'])]).relationships.map(r => r.statusClass), [null]);
  eq('  it does not count as notCompetitive',
    run([row(72, 100, 200, ['Handshake Deal'])]).notCompetitive, 0);
  // An unclassified pair still needs a competitor at one end.
  eq('  but an unclassified status between two non-competitors is still out',
    run([row(73, 100, 300, ['Handshake Deal'])]).notCompetitive, 1);
}

console.log('\n— several statuses on one row —');
{
  // Stored order is the order somebody picked them in. First that says
  // something wins, rather than an invented precedence.
  eq('the first status carrying a class sets the class',
    run([row(80, 100, 200, ['Other', 'Evaluating'])]).relationships.map(r => r.statusClass),
    ['evaluating']);
  eq('the first status carrying a direction sets the direction',
    run([row(81, 200, 100, ['Preferred Partner', 'Customer'])]).relationships.map(r => [r.companyId, r.competitorId]),
    [[100, 200]]);
}

console.log('\n— the competitor columns —');
{
  const res = run([
    row(90, 100, 200, ['Current Vendor']),
    row(91, 101, 200, ['Evaluating']),
    row(92, 100, 201, ['Former Vendor']),
    // Unclassified: no cell, so it must not inflate a column's number either.
    row(93, 101, 201, ['Other']),
  ]);
  eq('a column per competitor, widest first',
    res.competitors, [
      { id: 200, name: 'Teton Systems', accountCount: 2 },
      { id: 201, name: 'Vireo Software', accountCount: 1 },
    ]);
  eq('  so the count never promises more cards than the grid draws',
    res.competitors.reduce((n, c) => n + c.accountCount, 0),
    deriveSignals({ relationships: res.relationships }).cells.length);
  // An account with two relationships to ONE competitor counts once.
  eq('an account counts once per column',
    run([
      row(94, 100, 200, ['Current Vendor']),
      row(95, 100, 200, ['Evaluating']),
    ]).competitors.map(c => c.accountCount), [1]);
  // Equal widths sort by name, not insertion order, so two reads of the same
  // data lay the grid out the same way.
  eq('ties break on the name',
    run([
      row(96, 100, 201, ['Current Vendor']),
      row(97, 100, 200, ['Current Vendor']),
    ]).competitors.map(c => c.name), ['Teton Systems', 'Vireo Software']);
  eq('a competitor with no relationships gets no column',
    run([row(98, 100, 200, ['Current Vendor'])]).competitors.map(c => c.id), [200]);
}

console.log('\n— the status index —');
{
  const ix = buildStatusIndex(SEEDED);
  eq('both halves of a pairing carry the same class',
    [ix.classOf.get('current vendor'), ix.classOf.get('customer')], ['current', 'current']);
  eq('the configured value names the related end',
    ix.vendorEndOf.get('current vendor'), 'related');
  eq('  its counterpart names the logging end',
    ix.vendorEndOf.get('customer'), 'logging');
  eq('a symmetric status is in neither',
    ix.vendorEndOf.has('preferred partner'), false);
  eq('  but still carries its class', ix.classOf.get('preferred partner'), 'current');
  eq('an unconfigured status is in neither map',
    [ix.classOf.has('handshake deal'), ix.vendorEndOf.has('handshake deal')], [false, false]);

  // An account that configures BOTH halves as statuses in their own right. The
  // configured value wins, the same way buildCounterpartMap resolves it.
  const both = buildStatusIndex([
    { value: 'Customer', inverseValue: 'Current Vendor', actionKey: 'current' },
    { value: 'Current Vendor', inverseValue: 'Customer', actionKey: 'current' },
  ]);
  eq('a value configured in its own right points its own way',
    [both.vendorEndOf.get('customer'), both.vendorEndOf.get('current vendor')],
    ['related', 'related']);
  // A class on the config row, never sniffed from the words.
  eq('a class is only ever the action_key',
    buildStatusIndex([{ value: 'Current Vendor', inverseValue: 'Customer', actionKey: null }])
      .classOf.get('current vendor'), null);
  eq('  and an unknown action_key is not a class',
    buildStatusIndex([{ value: 'X', inverseValue: 'Y', actionKey: 'preferred' }])
      .classOf.get('x'), null);
}

console.log('\n— one place, and the Map view left alone —');
{
  const route = strip('app/api/conferences/[id]/relationship-map/route.ts');
  const modal = strip('components/RelationshipMapModal.tsx');
  const resolution = strip('lib/competitiveResolution.ts');

  // The resolution rule lives in the module. Not in the endpoint as well, and
  // not a second time in the browser.
  eq('the endpoint calls the resolver rather than reimplementing it',
    /resolveCompetitive\(\{/.test(route), true);
  eq('  and does not decide the competitor test itself',
    /action_key = 'competitor'/.test(route) && /\.types\b/.test(route), false);
  eq('  the modal does not resolve anything',
    /resolveCompetitive|vendorEndOf|inverse_value/.test(modal), false);
  eq('  it reads the resolved list straight into deriveSignals',
    /relationships: competitiveData\.relationships/.test(modal), true);
  eq('the resolver is the only place the ends are chosen',
    (resolution.match(/competitorId = row\./g) || []).length >= 2, true);

  // Additive. The Map view reads nodes and edges, which this must not touch.
  eq('the payload gains a key rather than changing one',
    /\.\.\.graph,\s*competitive,/.test(route), true);
  eq('  the map still reads nodes and edges',
    /setNodes\(d\.nodes \?\? \[\]\)/.test(modal) && /setEdges\(d\.edges \?\? \[\]\)/.test(modal), true);
  eq('  and the spokes are still built from rels, not from the competitive read',
    /const spokes: Spoke\[\] = useMemo\(\(\) => \{[\s\S]{0,600}?return rels/.test(modal), true);
  eq('  edges keep being built from vendorRelsQuery',
    /for \(const r of relRows\.rows\)/.test(route), true);
  eq('  and the competitive read is its own query, on the stored rows',
    /FROM vendor_relationships\s*\n\s*WHERE company_id IN/.test(route), true);
  // Both ends, or a column appears for a company the scope excluded.
  eq('the competitive read honours the same scope rule as the edges',
    /scope !== 'all' && !\(atConference\.has\(a\) && atConference\.has\(z\)\)/.test(route), true);
  // The chunked OR can return one row twice.
  eq('  and de-duplicates rows the chunked OR returns twice',
    /seen\.has\(r\.id\)/.test(route), true);
  // A tenant without the column loses one signal, not the view.
  eq('a missing status_changed_at column falls back rather than 500s',
    /NULL AS status_changed_at/.test(route), true);
  eq('  and a missing config table falls back to empty',
    (route.match(/catch\(\(\) => \(\{ rows: \[\] as Record<string, unknown>\[\] \}\)\)/g) || []).length >= 3, true);

  // The internal-relationship signal reads internal_relationships directly.
  // Taken from the conference-scoped pre-conference load instead, it would be
  // quietly LOW at "All Relationships" — nothing errors, nothing logs, the
  // number is just wrong at the setting that claims to show everything.
  eq('the internal signal has its own read, not the conference-scoped one',
    /SELECT DISTINCT company_id FROM internal_relationships/.test(route), true);
  eq('  unfiltered by conference, so both scopes are right',
    /FROM internal_relationships\s*\n\s*WHERE company_id IS NOT NULL/.test(route), true);
  eq('  and not taken from the pre-conference load',
    /pre-conference/.test(route), false);
  eq('  narrowed to the companies on this map before it is sent',
    /companiesWithInternal: internalRes\.rows[\s\S]{0,140}inSet\.has\(id\)/.test(route), true);
  eq('  the modal passes the payload list, not the pre-conference one',
    /companiesWithInternal: competitiveData\.companiesWithInternal/.test(modal), true);
  eq('  and does not derive it from the internal cards',
    /companiesWithInternal: internal/.test(modal), false);
}

console.log('\n— why the status pill stays —');
{
  // The ROW TITLE carries the class; the PILL carries the status. Two seeded
  // statuses share the 'current' class and mean different things, so under one
  // "Use Competitor" heading the pill is the only place the difference lives.
  // Written as a test so that reading the row labels never makes dropping the
  // pill look free.
  // Read from the migration, not from the copy at the top of this file: the
  // argument is about what the SEEDS do, and a hand-written fixture agreeing
  // with itself proves nothing about them.
  const seeds = strip('lib/db-migrations.ts');
  const classOfSeed = (value) => {
    const m = seeds.match(
      new RegExp(`SET action_key = '(\\w+)'[\\s\\S]{0,160}?value IN \\(([^)]*'${value}'[^)]*)\\)`),
    );
    return m ? m[1] : null;
  };
  eq('the migration puts Current Vendor and Preferred Partner in one class',
    [classOfSeed('Current Vendor'), classOfSeed('Preferred Partner')], ['current', 'current']);
  eq('  and Evaluating with Active Pilot',
    [classOfSeed('Evaluating'), classOfSeed('Active Pilot')], ['evaluating', 'evaluating']);

  const ix = buildStatusIndex(SEEDED);
  eq('Current Vendor and Preferred Partner are the same class',
    [ix.classOf.get('current vendor'), ix.classOf.get('preferred partner')],
    ['current', 'current']);
  eq('  so they land in the same row',
    ix.classOf.get('current vendor') === ix.classOf.get('preferred partner'), true);
  eq('  and they are different statuses',
    'Current Vendor' === 'Preferred Partner', false);
  // Same for the evaluating row.
  eq('Evaluating and Active Pilot likewise',
    [ix.classOf.get('evaluating'), ix.classOf.get('active pilot')],
    ['evaluating', 'evaluating']);
  // Two accounts under one competitor, one of each, must resolve into one row
  // carrying two different stored statuses.
  const both = run([
    row(200, 100, 200, ['Current Vendor']),
    row(201, 101, 200, ['Preferred Partner']),
  ]);
  const cells = deriveSignals({ relationships: both.relationships }).cells;
  eq('  two cards in one row, one class, two statuses',
    [cells.length, new Set(cells.map(c => c.row)).size], [2, 1]);
  eq('  which the row title cannot tell apart, and the pill can',
    new Set(['Current Vendor', 'Preferred Partner']).size, 2);
}

console.log('\n— the fixture the view is looked at against —');
{
  const seed = strip('scripts/seed-competitive-fixture.mjs');
  // Read unstripped: the reason lives in the header comment, which is the point.
  const seedRaw = readFileSync('scripts/seed-competitive-fixture.mjs', 'utf8');
  // An empty grid looks the same whether the resolution rule is right or wrong,
  // which is the whole reason a fixture is committed rather than improvised.
  eq('the seed script says why it exists',
    /empty grid looks EXACTLY the same whether the resolution rule is right or[\s*]+wrong/.test(seedRaw), true);
  // Fixed ids and INSERT OR REPLACE, so running it twice is running it once.
  eq('  it is idempotent',
    /INSERT OR REPLACE INTO companies/.test(seed)
      && /INSERT OR REPLACE INTO vendor_relationships/.test(seed), true);
  eq('  and owns a declared id range rather than clearing the table',
    /FIRST_COMPANY_ID = 20/.test(seed) && /DELETE FROM/.test(seed) === false, true);
  // A fixture on unclassified statuses would exercise nothing, silently.
  eq('  it refuses to seed against unseeded action_keys',
    /action_key/.test(seed) && /process\.exit\(1\)/.test(seed), true);
  // Every branch of the resolver, including the ones that must produce nothing.
  eq('  it covers a row stored counterpart-side',
    /'Customer', 30\]/.test(seed), true);
  eq('  the same pair logged from both sides',
    /'Current Vendor', null\]/.test(seed), true);
  eq('  a symmetric status, and one with no class',
    /'Preferred Partner'/.test(seed) && /'Other'/.test(seed), true);
  eq('  a relationship to a non-competitor',
    /1008, 7, 23/.test(seed), true);
  eq('  and the row that must not be flipped in',
    /1009, 7, 20, 'Customer'/.test(seed), true);
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
