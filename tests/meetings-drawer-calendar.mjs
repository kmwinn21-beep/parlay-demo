/**
 * The dashboard's Meetings drawer, as a board.
 *
 *   node --experimental-strip-types --import ./tests/register-ts.mjs \
 *        tests/meetings-drawer-calendar.mjs
 *
 * The drawer behind Quick Views → Meetings was a list of cards with one
 * toggle on it. It now answers three questions instead of one — whose
 * meetings, which of them, and how they are drawn — and opens on the
 * calendar, as one column at any width, because the drawer is opened
 * mid-conference where the question is what is next.
 *
 * What is checked here is what would quietly break: the defaults each
 * toggle opens on, the ownership rule (on it, not merely booked by it),
 * the day chips dimming rather than filtering on the board while booth
 * hours still filter, and the stack being forced rather than inherited
 * from the window's width.
 *
 * Exits non-zero on the first failing expectation, so it can gate a build.
 */
import { readFileSync } from 'node:fs';
import { internalIdsOn } from '../lib/meetingCalendar.ts';

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

const card = strip('components/DashboardActionCard.tsx');
const table = strip('components/MeetingsTable.tsx');
const calendar = strip('components/MeetingsCalendar.tsx');

console.log('\n— two controls, not four buttons —');
{
  eq('one toggle component, used twice',
    /function DrawerToggle<T extends string>\(\{ value, options, onChange \}/.test(card), true);
  eq('  whose', /\{ key: 'mine' as const, label: 'My Mtgs', name: 'My meetings' \}/.test(card), true);
  eq('  and how', /<DrawerToggle value=\{drawerView\} options=\{VIEW_OPTIONS\} onChange=\{setDrawerView\} \/>/.test(card), true);

  /*
   * Upcoming/All is gone. It dropped every earlier day of the conference,
   * which is a strange thing to do to a board being read at four in the
   * afternoon — the morning is what you are checking against. The fade on a
   * past block says the same thing and leaves the day where it was.
   */
  eq('nothing filters by when any more', /drawerScope/.test(card), false);
  eq('  because the board fades what has passed instead',
    /isPastMeeting/.test(strip('components/MeetingsCalendar.tsx')), true);

  // Whose, then how, left to right.
  const order = ['drawerOwner', 'drawerView'].map(s => card.indexOf(`value={${s}}`));
  eq('they run whose, then how', order[0] < order[1], true);
  eq('  in one row that scrolls rather than wraps',
    /flex items-center gap-2 overflow-x-auto scrollbar-hide/.test(card), true);
}

console.log('\n— the two drawings, as pictures —');
{
  // A word that long is most of the width of a 560px drawer's control row.
  eq('calendar is a calendar', /name: 'Calendar',\n    label: \(/.test(card), true);
  eq('  and cards are a list', /name: 'Cards',\n    label: \(/.test(card), true);
  eq('  drawn as rows', /d="M4 6h16M4 12h16M4 18h16"/.test(card), true);
  // An icon with no name is a rebus. Every option carries one, and it is
  // both the tooltip and what a screen reader announces.
  eq('each carries a name', /aria-label=\{name\}\n          title=\{name\}/.test(card), true);
}

console.log('\n— what the drawer opens on —');
{
  eq('mine', /useState<'mine' \| 'all'>\('mine'\)/.test(card), true);
  eq('the calendar', /useState<'calendar' \| 'cards'>\('calendar'\)/.test(card), true);

  // Opening it again has to start over, or yesterday's filters are still on.
  const opener = card.match(/setMeetingsOpen\(true\);[^\n]*/)?.[0] ?? '';
  eq('and opening it resets both',
    ["setDrawerOwner('mine')", "setDrawerView('calendar')"].every(s => opener.includes(s)), true);
  eq('  along with the day and booth filters',
    opener.includes('setDrawerDateFilter([])') && opener.includes('setDrawerBoothOnly(false)'), true);
}

console.log('\n— one key row fewer —');
{
  /*
   * Three key rows above a 560px board is most of the first screen, and the
   * outcome one is the least useful of them here: the drawer is read
   * mid-conference to find what is next, and the dot on a card already says
   * what was recorded. The conference's own board keeps it.
   */
  eq('the drawer asks for the board without it', /calendarShowOutcomeKey=\{false\}/.test(card), true);
  eq('  the table passes it on', /showOutcomeKey=\{calendarShowOutcomeKey\}/.test(strip('components/MeetingsTable.tsx')), true);
  eq('  and the calendar honours it',
    /const outcomeKey = showOutcomeKey && \(outcomesPresent\.length > 0/.test(strip('components/MeetingsCalendar.tsx')), true);
  eq('  while everywhere else still draws it',
    /calendarShowOutcomeKey = true,/.test(strip('components/MeetingsTable.tsx')), true);
  // The type and rep rows stay: they are what the board is filtered by.
  eq('the rows that filter stay', /const typeKey = typeTallies\.length > 0/.test(strip('components/MeetingsCalendar.tsx')), true);
}

console.log('\n— whose meetings “mine” means —');
{
  // The rule the conference's own Meetings tab reads: the Rep field and the
  // additional internal attendees, as one set.
  eq('the drawer reads the shared rule',
    /internalIdsOn\(m as unknown as CalendarMeeting\)\.includes\(myConfigId\)/.test(card), true);
  eq('  and All Mtgs skips the test entirely',
    /if \(drawerOwner === 'all'\) return true;/.test(card), true);
  eq('  with no signed-in id, mine is empty rather than everything',
    /if \(myConfigId == null\) return false;/.test(card), true);

  // And the rule itself, on meetings rather than on source text.
  const booked = { scheduled_by: '7', support_rep_ids: null };
  const supporting = { scheduled_by: '3', support_rep_ids: '7,9' };
  const neither = { scheduled_by: '3', support_rep_ids: '9' };
  eq('booked by me counts', internalIdsOn(booked).includes(7), true);
  eq('put on it by somebody else counts', internalIdsOn(supporting).includes(7), true);
  eq('  and it keeps the booker too', internalIdsOn(supporting).includes(3), true);
  eq('neither does not', internalIdsOn(neither).includes(7), false);
}

console.log('\n— the board, in a 560px drawer —');
{
  const branch = card.slice(card.indexOf("drawerView === 'calendar'"));
  eq('calendar draws the calendar', /viewMode="calendar"/.test(branch.slice(0, 900)), true);
  eq('  as one column whatever the window is doing',
    /calendarLayout="stack"/.test(branch.slice(0, 900)), true);
  eq('  the day chips dim rather than filter',
    /calendarDimDays=\{drawerDateFilter\}/.test(branch.slice(0, 900)), true);
  eq('  so the board is fed the un-dated list',
    /meetings=\{boothFilteredDrawerMeetings\}/.test(branch.slice(0, 900)), true);
  eq('  which booth hours still filter',
    /myMeetings\.filter\(m => !drawerBoothOnly \|\| isBoothHours\(m\.meeting_time\)\)/.test(card), true);
  eq('  and it is coloured by company type like the conference board',
    /companyTypeColorMap=\{colorMaps\.company_type \|\| \{\}\}/.test(branch.slice(0, 900)), true);

  // Cards keep the date filter: a list with three days dropped is still a
  // readable list, where a board with three columns dropped is not.
  eq('cards keep filtering by day',
    /meetings=\{filteredDrawerMeetings\}/.test(card), true);
  eq('  and say so when nothing matches',
    /No meetings match those filters\./.test(card), true);
}

console.log('\n— a day at a time —');
{
  eq('the drawer asks for folding days', /calendarCollapsibleSections/.test(card), true);
  eq('  and the table passes it on', /collapsibleSections=\{calendarCollapsibleSections\}/.test(table), true);

  // Two rules make the default, and nothing else does.
  eq('an empty day opens folded',
    /\(picked\.length > 0 \? !picked\.includes\(col\.day\) : col\.meetings\.length === 0\)/.test(calendar), true);
  eq('  a picked day folds the others', /const dayPick = dimDays\.join\(','\);/.test(calendar), true);
  eq('  and picking a different one drops what was folded by hand',
    /useEffect\(\(\) => \{ setFoldOverrides\(\{\}\); \}, \[dayPick\]\);/.test(calendar), true);
  // A default plus overrides, so the first paint is already folded right.
  eq('the reader can still fold any of them',
    /const toggleFold = \(key: string\) =>/.test(calendar), true);

  eq('the heading is the control', /aria-expanded=\{!folded\}/.test(calendar), true);
  eq('  and it pins whether the day is open or shut',
    /const headClass = `sticky z-10 flex w-full items-center gap-2/.test(calendar), true);
  // Nothing to measure: a ten-hour day folds as fast as a short one.
  eq('the body folds by row size, not by height',
    /gridTemplateRows: folded \? '0fr' : '1fr'/.test(calendar), true);
  eq('  and a folded day is out of the tab order',
    /aria-hidden=\{folded\} inert=\{folded \|\| undefined\}/.test(calendar), true);
}

console.log('\n— booking an empty half hour from the drawer —');
{
  eq('the board hands the slot back',
    /onCalendarSlotPick=\{slot => setSlotPrefill\(\{ date: slot\.day, time: slot\.time \}\)\}/.test(card), true);
  eq('  which opens the booking form on it',
    /prefillDate=\{slotPrefill\?\.date\}/.test(card) && /prefillTime=\{slotPrefill\?\.time\}/.test(card), true);
  eq('  at the usual length', /prefillDuration=\{DEFAULT_DURATION\}/.test(card), true);
  eq('  and what it books lands in the drawer without a reload',
    /setMeetings\(prev => \(prev\.some\(m => m\.id === meeting\.id\) \? prev : \[meeting as Meeting, \.\.\.prev\]\)\)/.test(card), true);

  // Whether the outline waits for a tap is a question about the POINTER: the
  // stack is also what a 560px drawer gets on a 1600px screen.
  eq('a pointer reveals the outline by hovering it',
    /'opacity-0 hover:opacity-100 focus-visible:opacity-100'/.test(calendar), true);
  eq('  a finger taps once to see it and again to take it',
    /if \(touch && !revealed\) \{ setRevealedSlot\(slotKey\); return; \}/.test(calendar), true);
  eq('  and which it is comes from the pointer',
    /const touch = coarsePointer;/.test(calendar), true);
}

console.log('\n— the key rows, when they run past the edge —');
{
  // In a 560px drawer both rows overflow with nothing to say so.
  eq('the type key scrolls with chevrons',
    /<ScrollRow className="flex-1" gapClass="gap-1\.5" step=\{140\}>[\s\S]*?typeTallies\.map/.test(calendar), true);
  eq('  and so does the rep key',
    /<ScrollRow className="flex-1" gapClass="gap-1\.5" step=\{140\}>[\s\S]*?whosePeople\.map/.test(calendar), true);
  eq('  from the row the rest of the app uses',
    /import \{ ScrollRow \} from '@\/components\/ScrollRow';/.test(calendar), true);
}

console.log('\n— how “stack” reaches the calendar —');
{
  eq('the table passes it through', /layout=\{calendarLayout\}/.test(table), true);
  eq('  with auto as the default', /calendarLayout = 'auto',/.test(table), true);
  eq('the calendar takes it', /layout = 'auto',/.test(calendar), true);
  eq('  stack shows the phone board at every width',
    /className=\{layout === 'stack' \? '' : 'lg:hidden'\}/.test(calendar), true);
  eq('  and hides the wide grid at every width',
    /layout === 'stack' \? 'hidden' : 'hidden lg:block'/.test(calendar), true);
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
