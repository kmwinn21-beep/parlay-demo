/**
 * Who covers this account, on the relationship map's cards.
 *
 *   node --experimental-strip-types --import ./tests/register-ts.mjs \
 *        tests/map-rep-pill.mjs
 *
 * The cards in the relationship map modal carry a rep pill at the end of their
 * pill row — but only on the company types the account named in ICP
 * Parameters, and with a dotted REP placeholder where one of those companies
 * has nobody assigned.
 *
 * Two rules decide what is drawn, and both are pure functions checked here by
 * running them: which companies the pill applies to (matchesIcpTypeList) and
 * who it names (resolveRepValues). The wiring that joins them to the cards is
 * read, because a correct pair of functions nothing calls draws nothing.
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

const strip = (f) => readFileSync(f, 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const { matchesIcpTypeList, matchesIcpCompanyType } = await import('@/lib/useIcpCompanyTypes');
const { resolveRepValues, resolveRepInitials } = await import('@/lib/useUserOptions');

console.log('\n— which companies the pill is for —');
{
  const icp = ['Customer', 'Prospect'];
  eq('an ICP type matches', matchesIcpTypeList(['Customer'], icp), true);
  // The map resolves company_type to a LIST, and a company carries several.
  // One hit is enough: an operator that is also a customer is a customer.
  eq('  one of several types is enough', matchesIcpTypeList(['Operator', 'Customer'], icp), true);
  eq('  case and padding do not matter', matchesIcpTypeList([' customer '], icp), true);
  eq('a type outside the rule does not', matchesIcpTypeList(['Capital'], icp), false);
  eq('  nor does a competitor', matchesIcpTypeList(['Competitor'], icp), false);
  eq('  nor a company with no type', matchesIcpTypeList([], icp), false);

  /*
   * An account with no ICP company_type rule matches NOTHING here.
   *
   * The server-side twin matches everything when unconfigured, because it
   * gates metrics and a confident zero is worse than an obviously broad
   * number. This gates an affordance: turning the pill on for every card of an
   * account that never configured ICP would read as a backlog of unassigned
   * companies that nobody asked to see.
   */
  eq('an unconfigured account matches nothing', matchesIcpTypeList(['Customer'], []), false);

  // The string form is the same rule, so the two cannot drift.
  eq('the comma-separated form agrees',
    matchesIcpCompanyType('Operator, Customer', icp), matchesIcpTypeList(['Operator', 'Customer'], icp));
  eq('  and on a miss too',
    matchesIcpCompanyType('Capital', icp), matchesIcpTypeList(['Capital'], icp));
}

console.log('\n— who it names —');
{
  const opts = [{ id: 1, value: 'Kevin Winn' }, { id: 2, value: 'Ron Swanson' }];
  eq('one rep', resolveRepValues('1', opts), ['Kevin Winn']);
  eq('  several, in the stored order', resolveRepValues('2,1', opts), ['Ron Swanson', 'Kevin Winn']);
  eq('  spaces around the ids', resolveRepValues(' 1 , 2 ', opts), ['Kevin Winn', 'Ron Swanson']);
  // An id whose option was deleted names nobody. Showing the raw number would
  // be a pill reading "3".
  eq('  an id with no option behind it is dropped', resolveRepValues('1,99', opts), ['Kevin Winn']);

  /*
   * Nobody assigned is an EMPTY LIST, not null — that is the dotted REP seat.
   * The card only draws nothing when the caller passes null, which is the ICP
   * gate above saying the company is not one of the account's.
   */
  eq('nobody assigned', resolveRepValues(null, opts), []);
  eq('  and an empty column', resolveRepValues('', opts), []);

  // Legacy rows stored names rather than ids. A name with no option behind it
  // still names a person, and dropping it would read as an empty seat.
  eq('a legacy name string', resolveRepValues('Kevin Winn', opts), ['Kevin Winn']);
  eq('  several of them', resolveRepValues('Kevin Winn, Ron Swanson', opts), ['Kevin Winn', 'Ron Swanson']);

  // The initials helper is the same resolution, so the two cannot disagree
  // about who is assigned — which is how one surface showed a rep and another
  // showed none for the same company.
  eq('initials read off the same values', resolveRepInitials('2,1', opts), ['RS', 'KW']);
  eq('  including the legacy form', resolveRepInitials('Kevin Winn', opts), ['KW']);
  eq('  and nobody is nobody', resolveRepInitials(null, opts), []);
}

console.log('\n— and it is wired to the cards —');
{
  const modal = strip('components/RelationshipMapModal.tsx');

  // The gate lives in the modal, which is the thing that knows the account's
  // ICP types. The card is shared by five surfaces and must not learn them.
  eq('the modal gates on the ICP types',
    /const repsFor = useCallback\(\(companyId: number\): string\[\] \| null => \{[\s\S]{0,320}matchesIcpTypeList\(node\.company_types, icpTypes\)\) return null;/.test(modal), true);
  eq('  and resolves the company’s own assigned_user',
    /return resolveRepValues\(node\.assigned_user, userOptions\);/.test(modal), true);
  const card = strip('components/VendorRelationshipCard.tsx');
  eq('the card knows nothing about ICP', /icp/i.test(card), false);

  // Map: the card's subject is the company at the other end of the
  // relationship, so the pill has to be that company's and not the hub's.
  eq('the map pills the far end of each relationship',
    /assignedReps: repsFor\(rel\.related_company_id\)/.test(modal), true);
  eq('  and the hub, which is a company too',
    /assignedReps: repsFor\(hubNode\.id\)/.test(modal), true);
  eq('  the canvas passes it to the card',
    /assignedReps=\{s\.assignedReps\}/.test(strip('components/relationship-map/MapCanvas.tsx')), true);

  // Competition: the card's subject is the ACCOUNT, which is what every other
  // overridden field on these cards is about.
  eq('the grid pills the account, not the column’s competitor',
    /assignedReps=\{repsFor\?\.\(cell\.companyId\)\}/.test(strip('components/relationship-map/CompetitiveGrid.tsx')), true);
  eq('  and the modal hands it the same resolver', /repsFor=\{repsFor\}/.test(modal), true);

  // Last in the row, after what the company is.
  const row = card.slice(card.indexOf('{shownTypes.map('), card.indexOf('</>,'));
  eq('the pill comes after the type badges', /assignedReps && \(assignedReps\.length === 0/.test(row), true);

  // The empty seat reads as an absence, like StalePill above it, rather than
  // as a rep called REP.
  eq('an empty seat is dotted and drained',
    /border border-dashed border-gray-300 text-gray-400[\s\S]{0,200}REP/.test(card), true);

  // Without this the pill is null on every card and the feature is invisible.
  const route = strip('app/api/conferences/[id]/relationship-map/route.ts');
  eq('the route sends assigned_user', /SELECT id, name, company_type, wse, assigned_user FROM companies/.test(route), true);
  eq('  and degrades to no pill rather than no map',
    /NULL AS wse, NULL AS assigned_user FROM companies/.test(route), true);
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
