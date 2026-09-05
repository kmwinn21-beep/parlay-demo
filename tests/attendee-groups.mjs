/**
 * Rules for gathering a conference's attendees into companies and families.
 *
 *   node --experimental-strip-types --import ./tests/register-ts.mjs \
 *        tests/attendee-groups.mjs
 *
 * The resolver is needed because this module's subject imports a sibling `.ts`
 * module; see tests/ts-resolver.mjs.
 *
 * Exits non-zero on the first failing expectation, so it can gate a build.
 */
import {
  buildAttendeeGroups,
  rollUpSeniority,
  compareSeniority,
  attendeesUnder,
  entriesToAttendees,
  countEntries,
  EMPTY_COLLAPSE_STATE,
  isFamilyExpanded,
  isCompanyExpanded,
  toggleFamily,
  toggleCompany,
} from '../lib/attendeeGroups.ts';

// The account's configured seniority list, in rank order.
const ORDER = ['C-Suite', 'VP/SVP', 'BOD', 'ED', 'Director', 'Manager', 'Associate', 'Admin', 'Other'];

const C = (id, name, o = {}) => ({ id, name, attendee_count: 0, conference_count: 1, ...o });
const A = (id, company_id, seniority, o = {}) => ({ id, company_id, seniority, ...o });

// The page passes effectiveSeniority(a.seniority, a.title); the stub stands in
// for the same contract — a derived value, never a raw column.
const seniorityOf = a => a.seniority || 'Other';

const build = (attendees, companies, o = {}) =>
  buildAttendeeGroups(attendees, companies, { seniorityOf, seniorityOrder: ORDER, ...o });

let pass = 0;
let fail = 0;
const eq = (label, got, want) => {
  const g = JSON.stringify(got);
  const w = JSON.stringify(want);
  if (g === w) { pass++; console.log(`  ok   ${label}`); }
  else { fail++; console.log(`  FAIL ${label}\n       got  ${g}\n       want ${w}`); }
};

// ---------------------------------------------------------------------------
console.log('\n— seniority ranking —');
{
  eq('config order wins over the alphabet', compareSeniority('C-Suite', 'Admin', ORDER) < 0, true);
  eq('unknown labels sort after every known one', compareSeniority('Fellow', 'Other', ORDER) > 0, true);
  eq('  and alphabetically among themselves', compareSeniority('Aardvark', 'Fellow', ORDER) < 0, true);
  eq('an empty order leaves the alphabet', compareSeniority('Manager', 'C-Suite', []) > 0, true);
}

console.log('\n— seniority roll-up —');
{
  const r = rollUpSeniority(
    [A(1, 1, 'Manager'), A(2, 1, 'Manager'), A(3, 1, 'C-Suite')],
    seniorityOf, ORDER,
  );
  eq('counts every person', r.total, 3);
  eq('buckets read most senior first, not most numerous',
    r.buckets.map(b => `${b.count} ${b.label}`), ['1 C-Suite', '2 Manager']);
  eq('  nothing overflows when every bucket is named', r.overflow, 0);
}
{
  // The case the view exists for: one decision maker among thirty who are not.
  const people = [A(0, 1, 'C-Suite'), ...Array.from({ length: 30 }, (_, i) => A(i + 1, 1, 'Manager'))];
  const r = rollUpSeniority(people, seniorityOf, ORDER);
  eq('1 C-Suite + 30 Manager names the C-Suite first',
    r.named.map(b => `${b.count} ${b.label}`), ['1 C-Suite', '30 Manager']);
  eq('  and does not rank by headcount', r.named[0].label, 'C-Suite');
}
{
  const people = [
    A(1, 1, 'C-Suite'), A(2, 1, 'C-Suite'),
    A(3, 1, 'VP/SVP'), A(4, 1, 'VP/SVP'), A(5, 1, 'VP/SVP'), A(6, 1, 'VP/SVP'), A(7, 1, 'VP/SVP'),
    ...Array.from({ length: 29 }, (_, i) => A(100 + i, 1, i % 2 ? 'Director' : 'Manager')),
  ];
  const r = rollUpSeniority(people, seniorityOf, ORDER);
  eq('two named buckets, then the remainder',
    [...r.named.map(b => `${b.count} ${b.label}`), `+${r.overflow}`], ['2 C-Suite', '5 VP/SVP', '+29']);
  eq('  total is everyone', r.total, 36);
  eq('  every bucket is still there underneath', r.buckets.length, 4);
}
{
  const r = rollUpSeniority([A(1, 1, 'Director')], seniorityOf, ORDER);
  eq('a single bucket overflows by nothing', [r.named.length, r.overflow], [1, 0]);
}
{
  const r = rollUpSeniority([], seniorityOf, ORDER);
  eq('nobody rolls up to nothing', [r.total, r.buckets.length, r.overflow], [0, 0, 0]);
}
{
  const r = rollUpSeniority([A(1, 1, 'Manager'), { id: 2, company_id: 1, seniority: '' }], a => a.seniority, ORDER);
  eq('a person with no seniority is not counted', r.total, 1);
}

// ---------------------------------------------------------------------------
console.log('\n— three tiers —');
{
  const companies = [
    C(2, 'MorningStar'),
    C(1, 'Charter', { parent_company_id: 2, parent_company_name: 'MorningStar' }),
  ];
  const r = build([
    A(10, 2, 'C-Suite'), A(11, 1, 'Manager'), A(12, 1, 'Director'),
  ], companies);
  eq('a parent and its child make one family', [r.familyCount, r.entries.length], [1, 1]);
  eq('  with both companies under it', r.entries[0].companies.map(c => c.companyName), ['MorningStar', 'Charter']);
  eq('  parent company first, and marked as the parent',
    r.entries[0].companies.map(c => c.isFamilyParent), [true, false]);
  eq('  attendees hang off the companies, not the family',
    r.entries[0].companies.map(c => c.attendees.map(a => a.id)), [[10], [11, 12]]);
  eq('  the family counts everyone beneath it', r.entries[0].attendeeCount, 3);
  eq('  and rolls their seniority up across companies',
    r.entries[0].seniority.named.map(b => `${b.count} ${b.label}`), ['1 C-Suite', '1 Director']);
  eq('  the company roll-up is only its own people',
    r.entries[0].companies[0].seniority.named.map(b => `${b.count} ${b.label}`), ['1 C-Suite']);
}
{
  // The parent sent nobody. Its children still name the family it heads.
  const companies = [
    C(1, 'Charter', { parent_company_id: 9, parent_company_name: 'Absent Holdings' }),
    C(3, 'Twenty20', { parent_company_id: 9, parent_company_name: 'Absent Holdings' }),
  ];
  const r = build([A(10, 1, 'Manager'), A(11, 3, 'VP/SVP')], companies);
  eq('siblings group under a parent that is not here', r.familyCount, 1);
  eq('  named by what the children carry', r.entries[0].parentName, 'Absent Holdings');
  eq('  with no parent row of its own', r.entries[0].parent, null);
  eq('  and no company claiming to be the parent',
    r.entries[0].companies.map(c => c.isFamilyParent), [false, false]);
}

console.log('\n— two tiers —');
{
  const r = build([A(10, 1, 'Manager'), A(11, 1, 'C-Suite')], [C(1, 'Standalone')]);
  eq('a company with no parent is a top-level company, not a family',
    [r.familyCount, r.entries[0].kind], [0, 'company']);
  eq('  its people hang directly off it', r.entries[0].attendees.map(a => a.id), [10, 11]);
  eq('  and it is never marked a family parent', r.entries[0].isFamilyParent, false);
}
{
  // One company under an absent parent is not a family — it is a company.
  const r = build([A(10, 1, 'Manager')], [C(1, 'Only Child', { parent_company_id: 9, parent_company_name: 'Absent' })]);
  eq('one company alone under an absent parent stays flat',
    [r.familyCount, r.entries.length, r.entries[0].kind], [0, 1, 'company']);
}
{
  const companies = [
    C(2, 'MorningStar'),
    C(1, 'Charter', { parent_company_id: 2, parent_company_name: 'MorningStar' }),
    C(5, 'Standalone'),
  ];
  const r = build([A(10, 2, 'C-Suite'), A(11, 1, 'Manager'), A(12, 5, 'Director')], companies);
  eq('families lead, loose companies trail', r.entries.map(e => e.kind), ['family', 'company']);
  eq('  counted apart', [r.familyCount, r.companyCount, r.attendeeCount], [1, 3, 3]);
}

console.log('\n— companies with nobody here —');
{
  const companies = [C(1, 'Charter'), C(7, 'Nobody Came')];
  const r = build([A(10, 1, 'Manager')], companies);
  eq('a company with no attendees is not on screen', r.entries.map(e => e.companyName), ['Charter']);
}

console.log('\n— people with no company —');
{
  const r = build([A(10, 1, 'Manager'), A(11, null, 'Director'), A(12, undefined, 'C-Suite')], [C(1, 'Charter')]);
  eq('they are held apart from the tree', r.noCompany.map(a => a.id), [11, 12]);
  eq('  and out of the attendee count', r.attendeeCount, 1);
  eq('  with no entry invented for them', r.entries.length, 1);
}
{
  // The companies fetch has not arrived, or dropped one. The row still knows
  // its company's name, so the screen must not call the person companyless.
  const r = build([
    A(10, 1, 'Manager'),
    A(11, 42, 'Director', { company_name: 'Unlisted Health' }),
  ], [C(1, 'Charter')]);
  eq('an unknown company id still gets a company', r.entries.map(e => e.companyName), ['Charter', 'Unlisted Health']);
  eq('  rather than the no-company section', r.noCompany.length, 0);
  eq('  and carries no company record', r.entries[1].company, null);
}
{
  const r = build([A(10, 42, 'Director')], []);
  eq('an unknown company with no name falls back', r.entries[0].companyName, 'Unknown company');
}

// ---------------------------------------------------------------------------
console.log('\n— ordering —');
{
  const companies = [C(1, 'Zeta'), C(2, 'Alpha'), C(3, 'Mid')];
  const r = build([A(10, 1, 'Manager'), A(11, 2, 'Manager'), A(12, 3, 'Manager')], companies);
  eq('companies read by name', r.entries.map(e => e.companyName), ['Alpha', 'Mid', 'Zeta']);
  const d = build([A(10, 1, 'Manager'), A(11, 2, 'Manager'), A(12, 3, 'Manager')], companies, { companySortDir: 'desc' });
  eq('  and reverse when the table does', d.entries.map(e => e.companyName), ['Zeta', 'Mid', 'Alpha']);
}
{
  const r = build([A(30, 1, 'Manager'), A(10, 1, 'C-Suite'), A(20, 1, 'Director')], [C(1, 'Charter')]);
  eq('attendee order is the caller\'s, untouched', r.entries[0].attendees.map(a => a.id), [30, 10, 20]);
}

// ---------------------------------------------------------------------------
console.log('\n— reading the tree —');
{
  const companies = [
    C(2, 'MorningStar'),
    C(1, 'Charter', { parent_company_id: 2, parent_company_name: 'MorningStar' }),
    C(5, 'Standalone'),
  ];
  const r = build([A(10, 2, 'C-Suite'), A(11, 1, 'Manager'), A(12, 5, 'Director')], companies);
  eq('every attendee under a family', attendeesUnder(r.entries[0]).map(a => a.id), [10, 11]);
  eq('every attendee under a company', attendeesUnder(r.entries[1]).map(a => a.id), [12]);
  eq('a page of entries flattens to its people', entriesToAttendees(r.entries).map(a => a.id), [10, 11, 12]);
  eq('the count line reads three units', countEntries(r.entries), { attendees: 3, companies: 3, families: 1 });
  eq('  and counts a slice, not the whole', countEntries(r.entries.slice(1)), { attendees: 1, companies: 1, families: 0 });
}

// ---------------------------------------------------------------------------
console.log('\n— what is open —');
{
  const s = EMPTY_COLLAPSE_STATE;
  eq('families start open', isFamilyExpanded(s, 1), true);
  eq('companies start shut', isCompanyExpanded(s, 1), false);
}
{
  const s = toggleFamily(EMPTY_COLLAPSE_STATE, 7);
  eq('shutting a family shuts it', isFamilyExpanded(s, 7), false);
  eq('  and leaves its neighbours alone', isFamilyExpanded(s, 8), true);
  eq('  reopening reopens', isFamilyExpanded(toggleFamily(s, 7), 7), true);
}
{
  const s = toggleCompany(EMPTY_COLLAPSE_STATE, 3);
  eq('opening a company opens it', isCompanyExpanded(s, 3), true);
  eq('  and only it', isCompanyExpanded(s, 4), false);
}
{
  // The independence property: an ancestor closing is not the reader undoing
  // what they opened inside it.
  let s = EMPTY_COLLAPSE_STATE;
  s = toggleCompany(s, 3);
  s = toggleCompany(s, 4);
  const openBefore = [isCompanyExpanded(s, 3), isCompanyExpanded(s, 4)];
  s = toggleFamily(s, 7);
  eq('shutting a family does not forget its open companies',
    [isCompanyExpanded(s, 3), isCompanyExpanded(s, 4)], openBefore);
  s = toggleFamily(s, 7);
  eq('  so reopening gives back the screen they left',
    [isFamilyExpanded(s, 7), isCompanyExpanded(s, 3), isCompanyExpanded(s, 4)], [true, true, true]);
}
{
  const before = EMPTY_COLLAPSE_STATE;
  const after = toggleFamily(before, 1);
  eq('state is replaced, never mutated', [before.collapsedFamilies.size, after.collapsedFamilies.size], [0, 1]);
  eq('  and the untouched set is carried across', after.expandedCompanies, before.expandedCompanies);
}

// ---------------------------------------------------------------------------
console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
