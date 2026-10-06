/**
 * The count on the conference page's Companies tab.
 *
 *   node --experimental-strip-types --import ./tests/register-ts.mjs \
 *        tests/conference-company-count.mjs
 *
 * Attendees, Meetings, Follow Ups, Social and Notes all carried their count in
 * the tab; Companies did not, because its list is fetched only when somebody
 * opens it. A count that waited for the fetch would be missing at exactly the
 * moment it is useful — while deciding whether to go there.
 *
 * So the count is derived from the attendees, who are already loaded, and
 * replaced by the real list once that arrives. The deriving is the part that is
 * RUN here; the rest reads the page for where the count ends up.
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

const { conferenceCompanyCount } = await import('@/lib/conferenceCompanyCount');

console.log('\n— counted from the attendees, before the list arrives —');
{
  // The tab lists the companies with somebody at this conference, so the
  // count is the distinct company among the attendees — not the attendees.
  const attendees = [
    { company_id: 4 }, { company_id: 4 }, { company_id: 9 }, { company_id: 4 },
  ];
  eq('three attendees at one company are one company',
    conferenceCompanyCount(attendees, null), 2);
  eq('  and one each is one each',
    conferenceCompanyCount([{ company_id: 1 }, { company_id: 2 }], null), 2);

  /*
   * An attendee with no company is at the conference on their own. Counting
   * them would invent a company per unattached person, which is the number
   * the tab would then disagree with.
   */
  eq('an attendee with no company is not a company',
    conferenceCompanyCount([{ company_id: 4 }, { company_id: null }, {}], null), 1);
  eq('  nor is one with a zero id',
    conferenceCompanyCount([{ company_id: 0 }, { company_id: 7 }], null), 1);

  // The ids come back from the API as numbers in one place and strings in
  // another; 4 and "4" are one company, not two.
  eq('the same id in two shapes is one company',
    conferenceCompanyCount([{ company_id: 4 }, { company_id: '4' }], null), 1);

  eq('nobody is none', conferenceCompanyCount([], null), 0);
  eq('  and no attendees at all is none', conferenceCompanyCount(null, null), 0);
}

console.log('\n— and from the list once it has —');
{
  /*
   * The fetched list wins because it is the thing on screen. The two differ
   * when a company_id points at a company the list does not return, and the
   * honest number then is the one you can actually count in the table.
   */
  const attendees = [{ company_id: 1 }, { company_id: 2 }, { company_id: 3 }];
  eq('the fetched list is what the tab shows',
    conferenceCompanyCount(attendees, [{ id: 1 }, { id: 2 }]), 2);
  // An empty fetched list is a real answer, not a reason to fall back to the
  // derived count — that would show a number the table contradicts.
  eq('  including when it came back empty',
    conferenceCompanyCount(attendees, []), 0);
}

console.log('\n— where the count ends up —');
{
  const page = strip('app/conferences/[id]/page.tsx');

  eq('the Companies tab has a count', /if \(tabKey === 'companies'\)/.test(page), true);
  eq('  derived until the list is fetched',
    /conferenceCompanyCount\(\s*conference\?\.attendees, companiesLoaded \? conferenceCompanies : null\)/.test(page), true);

  /*
   * Through tabCount, which is the one place a count is decided. The desktop
   * row parenthesises it, the tile badges it and the drawer's chips show
   * none — all three follow from this, so there is nothing to add per place.
   */
  eq('  through the same tabCount as every other tab',
    /const tabCount = \(tabKey: ConferenceTabKey\): number \| null => \{[\s\S]{0,400}tabKey === 'companies'/.test(page), true);

  // Zero reads as no count at all, as it does for Meetings and the rest: an
  // empty tab says so by being empty.
  eq('  and nothing at zero', /return companies > 0 \? companies : null;/.test(page), true);
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
