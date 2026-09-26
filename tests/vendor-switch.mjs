/**
 * Catching a vendor switch at the moment somebody records it.
 *
 *   node --experimental-strip-types --import ./tests/register-ts.mjs \
 *        tests/vendor-switch.mjs
 *
 * The rules are small and every one of them decides whether a rep is
 * interrupted. Prompting when nothing happened trains people to click through
 * the prompt, including the times it mattered; not prompting when something did
 * loses the only moment anybody knew. Both failures are invisible afterwards,
 * so they are all checked here.
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

const {
  findIncumbents, isDeparture, isArrival, endsOf, drawsConnector,
  switchNote, departureEntry, arrivalEntry, SWITCH_ANSWERS,
} = await import('@/lib/vendorSwitch');
const { buildStatusIndex, makeIsCompetitor } = await import('@/lib/competitiveResolution');

const strip = (f) => readFileSync(f, 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '');

const SEEDED = [
  { value: 'Current Vendor', inverseValue: 'Customer', actionKey: 'current' },
  { value: 'Evaluating', inverseValue: 'Prospect', actionKey: 'evaluating' },
  { value: 'Former Vendor', inverseValue: 'Former Customer', actionKey: 'former' },
  { value: 'Preferred Partner', inverseValue: 'Preferred Partner', actionKey: 'current' },
  { value: 'Active Pilot', inverseValue: 'Piloting', actionKey: 'evaluating' },
  { value: 'Other', inverseValue: 'Other', actionKey: null },
];
const IX = buildStatusIndex(SEEDED);

// 100/101 = accounts, 200/201/202 = competitors, 300 = not a competitor.
const co = (id, name, types) => [id, { id, name, types }];
const COMPANIES = new Map([
  co(100, 'Mission Health', ['Operator']),
  co(101, 'Lakeside Senior', ['Operator']),
  co(200, 'Teton Systems', ['Competitor']),
  co(201, 'Vireo Software', ['Vendor', 'Competitor']),
  co(202, 'Halden Care', ['Competitor']),
  co(300, 'Northwind Capital', ['Capital']),
]);
const isCompetitor = makeIsCompetitor(COMPANIES, ['Competitor']);
const row = (id, companyId, relatedCompanyId, statuses) =>
  ({ id, companyId, relatedCompanyId, statuses });
const incumbents = (opts) => findIncumbents({
  index: IX, isCompetitor, ...opts,
}).map(i => [i.relationshipId, i.competitorId]);

console.log('\n— an arrival finds who is already there —');
{
  eq('a competitor already current is an incumbent',
    incumbents({
      accountId: 100, incomingCompanyId: 201,
      rows: [row(1, 100, 200, ['Current Vendor'])],
    }), [[1, 200]]);

  // The incumbent's row can be stored from either side. Matching only rows
  // where company_id is the account would miss every one logged on the
  // competitor's page, which is half of them.
  eq('  including one logged from the competitor’s side',
    incumbents({
      accountId: 100, incomingCompanyId: 201,
      rows: [row(2, 200, 100, ['Customer'])],
    }), [[2, 200]]);

  // Matched on the class. An incumbent recorded as Preferred Partner is
  // exactly the one being displaced, and the literal words would never find it.
  eq('  and one recorded as Preferred Partner',
    incumbents({
      accountId: 100, incomingCompanyId: 201,
      rows: [row(3, 100, 200, ['Preferred Partner'])],
    }), [[3, 200]]);

  eq('nothing current means nothing to ask about',
    incumbents({
      accountId: 100, incomingCompanyId: 201,
      rows: [row(4, 100, 200, ['Evaluating']), row(5, 100, 202, ['Former Vendor'])],
    }), []);
  eq('  a status nobody classified is not an incumbent',
    incumbents({
      accountId: 100, incomingCompanyId: 201,
      rows: [row(6, 100, 200, ['Other'])],
    }), []);
  eq('  nor a current relationship with a non-competitor',
    incumbents({
      accountId: 100, incomingCompanyId: 201,
      rows: [row(7, 100, 300, ['Current Vendor'])],
    }), []);
  eq('  nor another account’s',
    incumbents({
      accountId: 100, incomingCompanyId: 201,
      rows: [row(8, 101, 200, ['Current Vendor'])],
    }), []);

  // A company cannot displace itself, however the row that says it is current
  // was stored.
  eq('the incoming company is never its own incumbent',
    incumbents({
      accountId: 100, incomingCompanyId: 200,
      rows: [row(9, 100, 200, ['Current Vendor'])],
    }), []);
  // The rows are read as they were stored, so the one being saved still shows
  // its OLD company and status. The edit form can change both at once, and
  // without the exclusion that stale row becomes an incumbent of itself.
  eq('  and the row being saved does not find itself',
    incumbents({
      accountId: 100, incomingCompanyId: 201, excludeRelationshipId: 10,
      rows: [row(10, 100, 202, ['Current Vendor'])],
    }), []);
  eq('  which it would without the exclusion',
    incumbents({
      accountId: 100, incomingCompanyId: 201,
      rows: [row(10, 100, 202, ['Current Vendor'])],
    }), [[10, 202]]);

  // Several is a real answer. Picking one of three for the rep would be wrong
  // twice.
  eq('several incumbents all come back',
    incumbents({
      accountId: 100, incomingCompanyId: 201,
      rows: [row(11, 100, 200, ['Current Vendor']), row(12, 100, 202, ['Preferred Partner'])],
    }), [[11, 200], [12, 202]]);
  // A pair logged from both ends is two rows and one relationship. Asking
  // twice about one company reads as the prompt being broken.
  eq('  but one entry per competitor, however many rows say so',
    incumbents({
      accountId: 100, incomingCompanyId: 201,
      rows: [row(13, 100, 200, ['Current Vendor']), row(14, 200, 100, ['Customer'])],
    }), [[13, 200]]);
}

console.log('\n— which end is the vendor —');
{
  eq('the status names the related end',
    endsOf(row(1, 100, 200, ['Current Vendor']), IX, isCompetitor),
    { competitorId: 200, accountId: 100 });
  eq('  or the logging end, when it is the counterpart',
    endsOf(row(2, 200, 100, ['Customer']), IX, isCompetitor),
    { competitorId: 200, accountId: 100 });
  eq('a symmetric status falls through to the types',
    endsOf(row(3, 100, 200, ['Preferred Partner']), IX, isCompetitor),
    { competitorId: 200, accountId: 100 });
  eq('  and reversed, the competitor is still the competitor',
    endsOf(row(4, 200, 100, ['Preferred Partner']), IX, isCompetitor),
    { competitorId: 200, accountId: 100 });
  // Never flipped to fit: reading it backwards would invent a purchase running
  // the other way.
  eq('a status naming a non-competitor end is not this workflow’s',
    endsOf(row(5, 100, 200, ['Customer']), IX, isCompetitor), null);
  eq('  and neither end a competitor is nobody’s',
    endsOf(row(6, 100, 300, ['Current Vendor']), IX, isCompetitor), null);
}

console.log('\n— what counts as an arrival and a departure —');
{
  eq('becoming current is an arrival',
    isArrival(['Evaluating'], ['Current Vendor'], IX), true);
  eq('  from nothing too', isArrival([], ['Current Vendor'], IX), true);
  eq('  and from former', isArrival(['Former Vendor'], ['Current Vendor'], IX), true);
  // Already current: nothing arrived, so nobody is being displaced.
  eq('staying current is not an arrival',
    isArrival(['Current Vendor'], ['Preferred Partner'], IX), false);
  eq('  nor is becoming evaluating',
    isArrival(['Current Vendor'], ['Evaluating'], IX), false);

  eq('current to former is a departure',
    isDeparture(['Current Vendor'], ['Former Vendor'], IX), true);
  eq('  in the counterpart wording too',
    isDeparture(['Customer'], ['Former Customer'], IX), true);
  eq('  and from Preferred Partner, which is the same class',
    isDeparture(['Preferred Partner'], ['Former Vendor'], IX), true);
  // A dead evaluation displaced nobody. Asking who replaced them would collect
  // an answer to a question that was not asked.
  eq('evaluating to former is NOT a departure',
    isDeparture(['Evaluating'], ['Former Vendor'], IX), false);
  eq('  nor is an unclassified status going former',
    isDeparture(['Other'], ['Former Vendor'], IX), false);
  eq('  nor current to evaluating',
    isDeparture(['Current Vendor'], ['Evaluating'], IX), false);
  eq('  nor no change at all',
    isDeparture(['Current Vendor'], ['Current Vendor'], IX), false);
}

console.log('\n— the answers —');
{
  eq('four of them', SWITCH_ANSWERS, ['replacing', 'keeping', 'unknown', 'none']);
  // Only one means a vendor was displaced by another.
  eq('only replacing draws a connector', drawsConnector('replacing'), true);
  eq('  keeping does not', drawsConnector('keeping'), false);
  eq('  nor unknown', drawsConnector('unknown'), false);
  eq('  nor none', drawsConnector('none'), false);
  eq('  nor anything unrecognised', drawsConnector('replaced'), false);
  // Keeping and unknown are stored rather than discarded: a question answered
  // should not be asked again as though it never had, and "both, in parallel"
  // is its own competitive picture.
  const raw = readFileSync('lib/vendorSwitch.ts', 'utf8');
  eq('the module says why the other three are kept',
    /in parallel/.test(raw) && /asked again/.test(raw), true);
}

console.log('\n— what the workflow writes —');
{
  const on = new Date(2026, 2, 14);
  eq('the note names both ends and the date',
    switchNote('Red Moon', 'Nova Moon', on),
    'Switched from Red Moon to Nova Moon on 03/14/2026');
  eq('  zero-padded, so it sorts and reads the same every time',
    switchNote('A', 'B', new Date(2026, 0, 5)), 'Switched from A to B on 01/05/2026');

  // Every auto-change leaves a thread entry. Without one somebody opens a card
  // they did not touch and finds a status that moved with no author.
  eq('the departure entry says who replaced them',
    departureEntry('Nova Moon'), 'Marked former — replaced by Nova Moon on this account.');
  eq('  and says so plainly when nobody did',
    departureEntry(null), 'Marked former — no replacement recorded.');
  eq('the arrival entry names who was replaced',
    arrivalEntry('Red Moon'), 'Marked current — replacing Red Moon on this account.');

  // The note is not where the switch is recorded. A sentence in a free-text
  // field stops being a link the moment somebody edits it.
  const lib = strip('lib/vendorSwitch.ts');
  eq('the module says the note is not the record',
    /NOT where the switch is recorded/.test(readFileSync('lib/vendorSwitch.ts', 'utf8')), true);
}

console.log('\n— one set of rules, shared with the grid —');
{
  const lib = strip('lib/vendorSwitch.ts');
  const res = strip('lib/competitiveResolution.ts');
  // What counts as current, which end is the vendor and who is a competitor are
  // the same questions the grid asks. Two answers would be two answers.
  eq('the class comes from the shared resolver',
    /classOfStatuses/.test(lib) && /export function classOfStatuses/.test(res), true);
  eq('  so does the vendor end',
    /vendorEndOfStatuses/.test(lib) && /export function vendorEndOfStatuses/.test(res), true);
  eq('  and the competitor test',
    /export function makeIsCompetitor/.test(res), true);
  eq('the resolver uses them itself, rather than keeping a second copy',
    /const end = vendorEndOfStatuses\(row\.statuses, index\);/.test(res)
      && /const statusClass = classOfStatuses\(row\.statuses, index\);/.test(res), true);
  eq('  and its competitor test is the shared one',
    /const isCompetitor = makeIsCompetitor\(companies, competitorTypes\);/.test(res), true);
  // Rules only: no queries, no React, so every case above is testable without
  // a database or a browser.
  eq('the module runs no queries',
    /db\.execute|getDb|fetch\(/.test(lib), false);
  eq('  and renders nothing', /from 'react'|<\/|=> \(</.test(lib), false);
}

console.log('\n— the record the answer lands in —');
{
  const mig = strip('lib/db-migrations.ts');
  eq('there is a table for it',
    /CREATE TABLE IF NOT EXISTS vendor_switches/.test(mig), true);
  eq('  holding the account, both companies and the answer',
    ['account_company_id', 'incumbent_company_id', 'incoming_company_id', 'answer']
      .every(c => new RegExp(`${c} `).test(mig)), true);
  eq('  and both relationships, so a connector needs no lookup',
    /incumbent_relationship_id INTEGER/.test(mig)
      && /incoming_relationship_id INTEGER/.test(mig), true);
  eq('  attributed, like every other thing a person recorded',
    /recorded_by_user_id INTEGER/.test(mig), true);
  eq('  and dated', /created_at TEXT DEFAULT \(datetime\('now'\)\)/.test(mig), true);
  // A relationship can be deleted and what happened still happened, so the
  // company columns carry the answer on their own.
  eq('the incoming company is nullable, because nobody is an answer',
    /incoming_company_id INTEGER,/.test(mig), true);
  eq('  and the account and incumbent are not',
    /account_company_id INTEGER NOT NULL/.test(mig)
      && /incumbent_company_id INTEGER NOT NULL/.test(mig), true);
  eq('indexed by account, and by the pair for "did we already ask?"',
    /idx_vendor_switches_account/.test(mig) && /idx_vendor_switches_pair/.test(mig), true);
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
