/**
 * The empty seat for a company's type, on the mobile card.
 *
 *   node --experimental-strip-types --import ./tests/register-ts.mjs \
 *        tests/company-type-pill.mjs
 *
 * The card shows the type as a pill and showed nothing at all for a company
 * that has none — so the one field a reader could not fill in from the list
 * was the one whose absence they were looking at. It now offers a dotted
 * "+ Type" seat that opens a picker.
 *
 * The write is optimistic on purpose: the sheet closes on the same tap that
 * chooses, and a card still reading "+ Type" after it closes reads as the tap
 * having missed. So the pill has to change before the round trip, and has to
 * change back if that trip fails.
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

const table = strip('components/CompanyTable.tsx');

console.log('\n— the seat —');
{
  /*
   * The mobile card's badge row: from the type pill to the status pills.
   *
   * Both ends searched FORWARD from the first: "{(company.status ||" also
   * appears in the desktop table, thousands of lines earlier, and anchoring on
   * its first occurrence slices the file backwards into nothing — a block of
   * assertions that all pass for want of anything to read.
   */
  const typeAt = table.indexOf('{company.company_type ? (');
  const row = table.slice(typeAt, table.indexOf('{(company.status ||', typeAt));
  eq('the row was found', row.length > 0, true);

  eq('a company with a type still shows it', /company\.company_type \? \(/.test(row), true);
  eq('  and one without gets a seat', /\+ Type/.test(row), true);
  // Dotted and drained, like the "+ Rep" seat above it and the REP seat on the
  // relationship map: it is the absence of a fact, not one.
  eq('  drawn as an absence, not a value',
    /border border-dashed border-gray-300 text-gray-400[\s\S]{0,120}\+ Type/.test(row), true);
  // The card is a link to the record; the seat must not navigate.
  eq('  and the tap does not open the card',
    /e\.preventDefault\(\); e\.stopPropagation\(\); setTypePickerCompany\(company\)/.test(row), true);

  // Only on the mobile card. The desktop table has had an inline editor for
  // this since it had cells to put one in, and a second control in the same
  // place would be two ways to set one field.
  const sheetAt = table.indexOf('{typePickerCompany && (');
  const sheet = table.slice(sheetAt, table.indexOf('\n        {/*', sheetAt + 5));
  eq('the picker is mobile only', /z-50 flex items-end lg:hidden/.test(sheet), true);
  eq('  and names the company it is about', /Company Type[\s\S]{0,200}typePickerCompany\.name/.test(sheet), true);
}

console.log('\n— and what picking one does —');
{
  // To the next declaration after it, rather than to a named one: the
  // function this used to slice to is declared ABOVE it, which makes the
  // slice run backwards and come out empty.
  const chooseAt = table.indexOf('const chooseCompanyType');
  const choose = table.slice(chooseAt, table.indexOf('\n  const ', chooseAt + 5));
  eq('the picker exists', choose.length > 0, true);

  // Closed first, so the sheet is gone by the time the request starts.
  eq('the sheet closes on the choice', /setTypePickerCompany\(null\);/.test(choose), true);
  /*
   * The pill is set BEFORE the fetch, not after it.
   *
   * This is the whole point, and it is the one thing that cannot be seen in
   * the finished screen: a write that only updates the row on a 200 looks
   * identical once the network is fast, and wrong on a phone.
   */
  const optimisticAt = choose.indexOf('setLocalCompanies');
  const fetchAt = choose.indexOf('fetch(');
  eq('the pill is set before the request goes out',
    optimisticAt !== -1 && fetchAt !== -1 && optimisticAt < fetchAt, true);
  eq('  and the request is the one the route takes',
    /method: 'PATCH'[\s\S]{0,160}JSON\.stringify\(\{ company_type: type \}\)/.test(choose), true);

  // A failed write has to put the seat back, or the card claims a type the
  // record does not have.
  eq('a failed save puts the seat back',
    /catch \{[\s\S]{0,320}company_type: previous/.test(choose), true);
  // Reverting the one row rather than reloading the list: a refresh here would
  // also throw away everything else on screen.
  eq('  without reloading the list', /catch \{[\s\S]{0,320}onRefresh\(\)/.test(choose), false);
  eq('  and says so', /toast\.error\('Failed to set the company type\.'\)/.test(choose), true);
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
