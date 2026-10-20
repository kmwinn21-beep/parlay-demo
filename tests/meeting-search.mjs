/**
 * Finding one meeting in a conference's worth of them.
 *
 *   node --experimental-strip-types --import ./tests/register-ts.mjs \
 *        tests/meeting-search.mjs
 *
 * The filters above the list answer "which of these" one field at a time.
 * The box answers "the one with Bridge in it", which is how anybody actually
 * looks for a meeting: a half-remembered company, a surname, a job title, or
 * the rep whose meeting it is.
 *
 * Both sides have edges. Our own people are stored as config_options ids and
 * have to be turned back into names before they can be matched; a guest can
 * be a roster record or a line of typed text; and a query of two words that
 * land in two different fields still has to find the row.
 *
 * Exits non-zero on the first failing expectation, so it can gate a build.
 */
import { readFileSync } from 'node:fs';
import { matchesMeetingSearch, meetingHaystack } from '@/lib/meetingSearch';

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

const USERS = [
  { id: 9, value: 'Gavin Steele' },
  { id: 10, value: 'Dan Lopez' },
  { id: 11, value: 'Henri Sejournet' },
];

const meeting = {
  company_name: 'Bridge Investment Group',
  first_name: 'Travis',
  last_name: 'Gulledge',
  title: 'CEO President',
  scheduled_by: '9,10',
  support_rep_ids: '10',
  additional_attendees: 'Robyn Yerger (COO)',
  additional_attendee_records: [
    { first_name: 'Carl', last_name: 'Hirschmann', title: 'CFO', company_name: 'Longevity Living' },
  ],
};
const hit = (q, m = meeting) => matchesMeetingSearch(m, q, USERS);

console.log('\n— what a search can match —');
{
  eq('the company', hit('bridge'), true);
  eq('  the attendee’s first name', hit('travis'), true);
  eq('  and their last', hit('gulledge'), true);
  eq('  their title', hit('ceo'), true);
  // Both kinds of guest: one picked off the roster, one typed in.
  eq('a guest from the roster', hit('hirschmann'), true);
  eq('  their title too', hit('cfo'), true);
  eq('  and their company', hit('longevity'), true);
  eq('  a guest who was only typed in', hit('yerger'), true);

  /*
   * Our own side is stored as ids, so without the user list a search for a
   * rep's name matches nothing at all — which is the whole reason the names
   * are passed in.
   */
  eq('the rep who booked it', hit('steele'), true);
  eq('  and whoever is on support', hit('lopez'), true);
  eq('  but not a rep who is on neither', hit('sejournet'), false);
  eq('  and nothing of ours without the names',
    matchesMeetingSearch(meeting, 'steele', []), false);
}

console.log('\n— how it reads a query —');
{
  eq('case does not matter', [hit('BRIDGE'), hit('bRiDgE')], [true, true]);
  // Every word has to land, which is how a half-remembered search is typed.
  eq('two words from one field', hit('bridge investment'), true);
  eq('  two words from two fields', hit('steele bridge'), true);
  eq('  and a word that is in neither fails the lot', hit('steele carespring'), false);
  eq('part of a word is enough', hit('inv'), true);

  eq('an empty box is not a filter', hit(''), true);
  eq('  nor is a box of spaces', hit('   '), true);
  eq('  and the spaces around a word are ignored', hit('  bridge  '), true);
}

console.log('\n— a meeting with almost nothing on it —');
{
  const bare = { company_name: null, first_name: 'Ann', last_name: null };
  eq('still matches what it does have', matchesMeetingSearch(bare, 'ann', USERS), true);
  eq('  and matches nothing it does not', matchesMeetingSearch(bare, 'bridge', USERS), false);
  eq('an empty meeting answers nothing', matchesMeetingSearch({}, 'x', USERS), false);
  eq('  but an empty query still lights it', matchesMeetingSearch({}, '', USERS), true);
  // The ids are read from both columns: a bulk rep reassignment rewrites
  // scheduled_by alone, so support_rep_ids can hold an id it does not.
  eq('a support id missing from scheduled_by is still searchable',
    matchesMeetingSearch({ scheduled_by: '', support_rep_ids: '11' }, 'henri', USERS), true);
  eq('  and a junk id is quietly skipped',
    meetingHaystack({ scheduled_by: '0,abc,-3' }, USERS), '');
}

console.log('\n— wired into the page —');
{
  const page = strip('app/conferences/[id]/page.tsx');
  eq('the box is where Availability used to be', /id="meeting-search"/.test(page), true);
  eq('  and narrows whatever is drawn',
    /if \(!matchesMeetingSearch\(m, meetingSearch, userOptions\)\) return false;/.test(page), true);
  eq('  with a way to empty it', /onClick=\{\(\) => setMeetingSearch\(''\)\}/.test(page), true);

  /*
   * Find Availability moved up beside the kebab and lost its fill: it opens
   * a board rather than choosing a view, and a filled button in a row of
   * outlined ones reads as the thing already chosen.
   */
  eq('Find Availability sits with the toggles', /Find Availability/.test(page), true);
  eq('  in an unpicked toggle’s clothes',
    /className="hidden lg:inline-flex flex-shrink-0 items-center gap-1\.5 rounded-lg border border-gray-200 bg-white px-2\.5 py-1\.5 text-xs font-medium text-gray-500/.test(page), true);
  eq('  and before the kebab',
    page.indexOf('Find Availability') < page.indexOf('title="Meeting actions"'), true);
  eq('  with no filled copy left on the filter row',
    /bg-brand-secondary px-3 py-1\.5 text-xs font-semibold text-white hover:bg-brand-primary/.test(page), false);
}

console.log('\n— and the board it opens —');
{
  const modal = strip('components/AvailabilityModal.tsx');
  // A time range is "11:30 AM – 12:00 PM" at its longest; a column that
  // cannot hold two of those side by side either wraps the text or drops to
  // one slot a line, which makes a day of half hours forty lines long.
  eq('two slots to a row', /<div className="grid grid-cols-2 gap-1\.5 pt-1\.5" inert=\{!open\}>/.test(modal), true);
  eq('  in equal tracks, so every button is one size', /grid-cols-2/.test(modal), true);
  eq('  and the sheet is wide enough for them', /max-w-\[1500px\]/.test(modal), true);
  eq('  with columns to match', /minmax\(320px, 1fr\)/.test(modal), true);

  /*
   * Pointing at one half hour dims every other, so what stays lit across the
   * columns is everyone else who is free then — the question a board of four
   * columns is opened to answer.
   */
  eq('pointing at a slot dims the rest',
    /const slotDimmed = \(slot: AvailabilitySlot\) =>/.test(modal), true);
  eq('  leaving only that same half hour lit',
    /!\(slot\.day === hoveredSlot\.day && slot\.startMinutes === hoveredSlot\.startMinutes\)/.test(modal), true);
  // Moving from one button to the next fires the new one's enter first.
  eq('  and leaving clears only what it set',
    /return prev && prev\.day === slot\.day && prev\.startMinutes === slot\.startMinutes \? null : prev;/.test(modal), true);
  eq('  by pointer or by keyboard',
    /onMouseEnter=\{\(\) => onHoverChange\?\.\(true\)\}/.test(modal) && /onFocus=\{\(\) => onHoverChange\?\.\(true\)\}/.test(modal), true);
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
