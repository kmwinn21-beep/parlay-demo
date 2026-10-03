/**
 * Making a parent/child relationship from one selected company.
 *
 *   node --experimental-strip-types --import ./tests/register-ts.mjs \
 *        tests/parent-child-modal.mjs
 *
 * The action used to need two companies selected, which meant a rep looking at
 * a conference's companies had to leave for the companies page to link one of
 * them to a parent that was never coming to the show. The modal already
 * searched every company in the account, so the second selection was never the
 * thing that made the relationship possible — and a parent that is not in
 * Parlay at all can now be added from inside the modal.
 *
 * The two rules that decide what happens — who becomes a child, and whether a
 * typed name is a duplicate — are run. The wiring is read.
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

const { childrenOf, clashingName, newCompanyPayload, EMPTY_NEW_COMPANY } =
  await import('@/lib/parentChildSelection');

const ids = (rows) => rows.map(r => r.id);
const A = { id: 1, label: 'Maple Springs Anchorage' };
const B = { id: 2, label: 'Maple Springs North Logan' };

console.log('\n— who becomes a child —');
{
  // A parent from OUTSIDE the selection — searched for, or just added — makes
  // children of everything selected. This is the one-company case, and the
  // whole reason the action no longer needs two.
  eq('one company, parent found by search', ids(childrenOf([B], 99)), [2]);
  eq('  two companies, parent found by search', ids(childrenOf([A, B], 99)), [1, 2]);

  // A parent from INSIDE the selection makes children of the rest.
  eq('parent among the selected', ids(childrenOf([A, B], 1)), [2]);
  eq('  and the order of the rest is kept', ids(childrenOf([A, B, { id: 3, label: 'C' }], 2)), [1, 3]);

  /*
   * The dead end: one company selected, named as its own parent.
   *
   * The route 400s on an empty child list, so the modal has to disable the
   * button rather than post and report a server error for a choice that was
   * visibly empty.
   */
  eq('a company cannot be its own parent', ids(childrenOf([B], 2)), []);
  eq('nothing chosen yet', ids(childrenOf([A, B], null)), []);
  eq('nothing selected at all', ids(childrenOf([], 99)), []);
}

console.log('\n— and whether the typed name is one already on screen —');
{
  const onScreen = ['Maple Ridge Living', 'Maple Springs North Logan'];
  eq('an exact match', clashingName('Maple Ridge Living', onScreen), 'Maple Ridge Living');
  eq('  ignoring case', clashingName('maple ridge living', onScreen), 'Maple Ridge Living');
  eq('  and surrounding space', clashingName('  Maple Ridge Living  ', onScreen), 'Maple Ridge Living');
  eq('a name nobody has', clashingName('Maple Springs Holdings', onScreen), null);
  // A partial match is not a duplicate: "Maple Springs" is a real company name
  // whether or not "Maple Springs North Logan" exists.
  eq('  a prefix of one is not a match', clashingName('Maple Springs', onScreen), null);
  eq('an empty name matches nothing', clashingName('', onScreen), null);
  eq('  nor does whitespace', clashingName('   ', ['', 'Maple Ridge Living']), null);
}

console.log('\n— what the new company is created with —');
{
  const fields = (over) => ({ ...EMPTY_NEW_COMPANY, ...over });

  // The name is the only required one, and the only one sent on its own.
  eq('a name alone', newCompanyPayload(fields({ name: 'Maple Springs Holdings' })),
    { name: 'Maple Springs Holdings' });
  eq('  trimmed', newCompanyPayload(fields({ name: '  Maple Springs Holdings  ' })),
    { name: 'Maple Springs Holdings' });
  eq('no name is nothing to create', newCompanyPayload(fields({ name: '  ', website: 'x.com' })), null);

  eq('everything filled in', newCompanyPayload(fields({
    name: 'Maple Springs Holdings',
    assigned_user: '1,2',
    company_type: 'Capital',
    website: 'https://maplesprings.example',
    wse: '1240',
    services: ['Memory Care', 'Skilled Nursing'],
  })), {
    name: 'Maple Springs Holdings',
    assigned_user: '1,2',
    company_type: 'Capital',
    website: 'https://maplesprings.example',
    wse: 1240,
    services: ['Memory Care', 'Skilled Nursing'],
  });

  /*
   * Blanks are LEFT OUT, not sent empty.
   *
   * POST /api/companies classifies a company from its name when no type comes
   * with it, and a record added here should be indistinguishable from one
   * typed on the companies page.
   */
  eq('a blank optional field is omitted',
    Object.keys(newCompanyPayload(fields({ name: 'A', company_type: '   ', website: '' }))), ['name']);
  eq('  and no services is no services key',
    Object.keys(newCompanyPayload(fields({ name: 'A', services: [] }))), ['name']);

  // Units go in as a number. Text in a number field is not a unit count, and
  // sending it would store null under a value the reader believes they typed.
  eq('units are a number', newCompanyPayload(fields({ name: 'A', wse: '240' })).wse, 240);
  eq('  zero is a number, not a blank', newCompanyPayload(fields({ name: 'A', wse: '0' })).wse, 0);
  eq('  and nonsense is left out',
    Object.keys(newCompanyPayload(fields({ name: 'A', wse: 'lots' }))), ['name']);
}

console.log('\n— the action is offered on one selection —');
{
  const table = strip('components/CompanyTable.tsx');
  // The bulk bar itself still needs a selection; this button no longer needs
  // a second one.
  eq('the bar appears on one selection', /\{selectedIds\.size >= 1 && \(/.test(table), true);
  eq('  and Parent\/Child is not held back to two',
    /selectedIds\.size >= 2 && \([\s\S]{0,200}Parent\/Child Relationship/.test(table), false);
  eq('  the button is still there',
    /setShowParentChildModal\(true\)[\s\S]{0,160}\+ Parent\/Child Relationship/.test(table), true);
}

console.log('\n— and a parent that is not in Parlay yet can be added here —');
{
  const modal = strip('components/ParentChildModal.tsx');

  eq('there is an Other option', /Other \(not in list\)/.test(modal), true);
  // Under the search, so it is the answer to having looked and not found.
  eq('  prefilled from what was searched for',
    /setOtherFields\(\{ \.\.\.EMPTY_NEW_COMPANY, name: searchQuery\.trim\(\) \}\)/.test(modal), true);
  eq('  it creates the company', /fetch\('\/api\/companies', \{\s*method: 'POST'/.test(modal), true);
  eq('  with the payload built above',
    /const payload = newCompanyPayload\(otherFields\);/.test(modal)
      && /body: JSON\.stringify\(payload\)/.test(modal), true);

  // Every optional field the request asked for, each off the account's own
  // config rather than a list written out here.
  eq('  the optional fields are all on the form',
    ['Assigned User', 'Company Type', '{unitLabel}', 'Website', 'Services']
      .every((label) => modal.includes(label)), true);
  eq('  Company Type comes from config options',
    /companyTypeOptions = configOptions\.company_type/.test(modal), true);
  eq('  Services too', /servicesOptions = configOptions\.services/.test(modal), true);
  eq('  Assigned User from the account’s users',
    /options=\{userOptions\}[\s\S]{0,200}parseRepIds\(otherFields\.assigned_user\)/.test(modal), true);
  // "Units" is whatever the account calls them — beds, doors, keys.
  eq('  and Units is labelled as admin settings has it',
    /const unitLabel = useUnitTypeLabel\(\);/.test(modal), true);
  // Only the name blocks the button.
  eq('  and only the name is required',
    /disabled=\{!otherFields\.name\.trim\(\) \|\| isCreating\}/.test(modal), true);
  // The point of adding it here: no second screen, no reopening the modal.
  eq('  and selects it as the parent straight away',
    /setCreated\(\(prev\) => \[\.\.\.prev, company\]\);[\s\S]{0,400}setParentId\(company\.id\);/.test(modal), true);
  eq('  so it is never listed twice',
    /const shown = new Set\(\[\.\.\.items\.map\(\(i\) => i\.id\), \.\.\.createdIdsRef\.current\]\)/.test(modal), true);

  // Both rules come from the module above rather than being written out here.
  eq('the modal uses the shared rules',
    /import \{ childrenOf, clashingName \} from '@\/lib\/parentChildSelection'/.test(modal), true);
  eq('  children off childrenOf', /const childItems = childrenOf\(items, parentId\);/.test(modal), true);
  eq('  and the button follows it',
    /const canSubmit = parentId != null && childItems\.length > 0;/.test(modal)
      && /disabled=\{!canSubmit \|\| isLoading\}/.test(modal), true);
  // A greyed-out button with no reason beside it reads as a broken modal.
  eq('  with the dead end explained',
    /A company cannot be its own parent/.test(modal), true);
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
