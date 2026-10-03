/**
 * Matching a company to the master list from its row.
 *
 *   node --experimental-strip-types --import ./tests/register-ts.mjs \
 *        tests/master-search.mjs
 *
 * The master-account match lived only inside the company record's edit form,
 * so linking a company spotted in a table meant opening the record and
 * switching it into edit mode. The row's kebab now opens the same search and
 * the same side-by-side modal.
 *
 * The one rule with anything to get wrong — what the search box opens with —
 * is run. The wiring is read, including the part that matters most: this
 * modal has no Save button, so it has to write as it goes, and it has to send
 * the WHOLE record because the route it writes to overwrites every column it
 * is given.
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

console.log('\n— what the search opens with —');
{
  // Imported from the component's own module, so the test cannot drift from
  // what the modal actually seeds.
  const { masterSearchSeed, MASTER_SEARCH_SEED_LENGTH } =
    await import('@/lib/masterAccountMatch');

  eq('the first five characters', masterSearchSeed('Oak Creek Senior Care'), 'Oak C');
  eq('  which is what the constant says', MASTER_SEARCH_SEED_LENGTH, 5);
  /*
   * Five characters, not the whole name.
   *
   * A master list is a list of PARENTS: "Oak Creek Senior Care" is looked for
   * under "Cornerstone Of Oak Creek". Seeding the full name finds nothing and
   * the reader has to delete most of it before the search does anything.
   */
  eq('  not the whole name', masterSearchSeed('Oak Creek Senior Care').length < 'Oak Creek Senior Care'.length, true);

  // A short name is used whole rather than padded or rejected.
  eq('a name shorter than five', masterSearchSeed('Ark'), 'Ark');
  // No trailing space left behind by the cut — the search trims before it
  // queries, and a seed ending in one reads as a typo in the box.
  eq('  a cut landing on a space', masterSearchSeed('Oak Creek'), 'Oak C');
  eq('  and one that would leave a trailing space', masterSearchSeed('Ark  Senior'), 'Ark');
  eq('leading space is not spent on the budget', masterSearchSeed('  Oak Creek'), 'Oak C');
  eq('no name is no query', masterSearchSeed(null), '');
  eq('  nor an empty one', masterSearchSeed('   '), '');
}

console.log('\n— the row offers it —');
{
  const kebab = strip('components/RowActionsKebab.tsx');
  eq('there is a Search Master item', /label: 'Search Master'/.test(kebab), true);
  // Companies only: an attendee has no master account to match.
  eq('  on company rows only',
    /entityType === 'company'[\s\S]{0,200}label: 'Search Master'/.test(kebab), true);
  eq('  and it opens the modal', /onClick: \(\) => setAction\('master'\)/.test(kebab), true);
  eq('  with the row’s company',
    /<MasterAccountSearchModal[\s\S]{0,200}companyId=\{companyId\}[\s\S]{0,80}companyName=\{companyName \?\? ''\}/.test(kebab), true);
  // The row's counts and pills change when a match is applied.
  eq('  and tells the table to refresh', /onApplied=\{\(\) => onDone\?\.\(\)\}/.test(kebab), true);
}

console.log('\n— and it saves what it applies —');
{
  const field = strip('components/MatchMasterAccountField.tsx');

  eq('the modal is exported for the row to use',
    /export function MasterAccountSearchModal\(/.test(field), true);
  // The same modal the edit form opens, not a second one built beside it.
  eq('  and reuses the field-by-field modal',
    /<MatchModal[\s\S]{0,300}onApply=\{patch => \{ void applyPatch\(patch\); \}\}/.test(field), true);
  eq('  seeded from the company name',
    /useState\(\(\) => masterSearchSeed\(companyName\)\)/.test(field), true);

  /*
   * There is no Save button here, so every Update writes.
   *
   * And it writes the WHOLE record: PUT /api/companies/[id] sets every column
   * it names from the body, so a request carrying only the patch would empty
   * the notes, the ICP, the industry and the sub types.
   */
  const apply = field.slice(field.indexOf('const applyPatch'), field.indexOf('if (selectedRecord && company)'));
  eq('applying writes straight away', /method: 'PUT'/.test(apply), true);
  for (const field_ of ['name', 'notes', 'icp', 'industry', 'sub_types', 'master_account_key']) {
    eq(`  the request carries ${field_}`, new RegExp(`${field_}: next\\.${field_}`).test(apply), true);
  }
  // A failed write must not leave the modal showing a value the record does
  // not have.
  eq('  and a failed save puts the copy back', /setCompany\(company\);/.test(apply), true);
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
