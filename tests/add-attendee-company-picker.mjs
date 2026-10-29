/**
 * The company picker on the add-attendee form offers every company.
 *
 *   node --experimental-strip-types --import ./tests/register-ts.mjs \
 *        tests/add-attendee-company-picker.mjs
 *
 * Adding somebody by hand is what you do for a person the uploaded list did
 * not carry — and they usually work somewhere that is not on the conference
 * yet, since that is most of the reason to be adding them. The picker was
 * built from `conferenceCompanies`, the companies derived from this
 * conference's own attendees, so the only way to name any other company on
 * file was "Other (not in list)" and retyping it: a free-text name that the
 * add route then matches back, case-insensitively, to the very record that
 * was sitting one list away.
 *
 * Both pickers on that form now read `allCompanies`, which is the unfiltered
 * /api/companies list. Driven end to end against a real database before this
 * was written — six companies on file, two of them at the conference; the
 * picker offered all six, a search for one of the four found it, and adding a
 * person at it bound them to the existing company rather than creating a
 * seventh.
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
  .replace(/(^|[\s{(,;])\/\*[\s\S]*?\*\//g, '$1').replace(/^\s*\/\/.*$/gm, '');

const page = strip('app/conferences/[id]/page.tsx');
const addRoute = strip('app/api/conferences/[id]/attendees/add/route.ts');

console.log('\n— what the picker is built from —');
{
  /*
   * Both of the add form's pickers: the attendee one (a person at a company)
   * and the company-only one (a company attending with nobody named yet).
   * They are the same question — which company, out of all of them.
   */
  const pickers = [...page.matchAll(/<SearchableSelect\b[\s\S]*?\/>/g)].map(m => m[0]);
  const companyPickers = pickers.filter(p => p.includes('Select a company…'));
  eq('the add form has two company pickers', companyPickers.length, 2);
  eq('  and neither is narrowed to this conference',
    companyPickers.filter(p => /options=\{conferenceCompanies\}/.test(p)).length, 0);
  eq('  both offering every company on file',
    companyPickers.filter(p => /options=\{allCompanies\}/.test(p)).length, 2);
  // The value has to be looked up in the same list, or a company that is not
  // at the conference reads back as nothing selected.
  eq('  and each reads its selection back from that list',
    companyPickers.filter(p => /allCompanies\.find\(/.test(p)).length, 2);
  // "Other" is still there: a company genuinely not on file is typed in.
  eq('  with "Other" still the way to name a new one',
    companyPickers.filter(p => /onSelectOther=/.test(p)).length, 2);
}

console.log('\n— and when that list is fetched —');
{
  /*
   * It used to load only for company-only mode, which is how the attendee
   * picker came to be built from the narrower list in the first place. Opening
   * the form at all has to fetch it now, or the picker opens empty.
   */
  const effect = page.slice(page.indexOf('if ((!showAddForm && !addCompanyOnly)'));
  eq('opening the add form fetches it', effect.length > 0, true);
  eq('  from the unfiltered companies endpoint', /fetch\('\/api\/companies'\)/.test(effect.slice(0, 400)), true);
  eq('  once, not on every render', /allCompanies\.length > 0\) return;/.test(effect.slice(0, 200)), true);
  // A dependency array missing showAddForm would not re-run when the form
  // opens, which is the whole trigger.
  eq('  and the effect watches the form opening',
    /\}, \[showAddForm, addCompanyOnly, allCompanies\.length\]\);/.test(effect.slice(0, 900)), true);
  // conferenceCompanies is still loaded — the rest of the page reads it.
  eq('this conference\'s own companies are still loaded for the rest of the page',
    /if \(showAddForm\) loadCompanies\(\);/.test(page), true);
}

console.log('\n— the server never required the conference —');
{
  /*
   * Worth pinning: the narrowing was only ever in the UI. The add route looks
   * a company up by name across every company on file and creates one only
   * when there is no match, so naming a company that is not at the conference
   * binds to the existing record instead of making a second one.
   */
  eq('the company is matched by name, account-wide',
    /SELECT id FROM companies WHERE LOWER\(name\) = LOWER\(\?\)/.test(addRoute), true);
  eq('  with no conference in that lookup',
    /SELECT id FROM companies WHERE LOWER\(name\) = LOWER\(\?\)[\s\S]{0,120}conference/i.test(addRoute), false);
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
