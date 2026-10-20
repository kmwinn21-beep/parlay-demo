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

console.log('\n— three controls, not seven buttons —');
{
  eq('one toggle component, used three times',
    /function DrawerToggle<T extends string>\(\{ value, options, onChange \}/.test(card), true);
  eq('  whose', /options=\{\[\['mine', 'My Mtgs'\], \['all', 'All Mtgs'\]\] as const\}/.test(card), true);
  eq('  which', /options=\{\[\['upcoming', 'Upcoming'\], \['all', 'All'\]\] as const\}/.test(card), true);
  eq('  how', /options=\{\[\['calendar', 'Calendar'\], \['cards', 'Cards'\]\] as const\}/.test(card), true);

  // Order left to right: whose, which, how. The owner toggle sits to the
  // LEFT of Upcoming/All, which is what was asked for.
  const order = ['drawerOwner', 'drawerScope', 'drawerView']
    .map(s => card.indexOf(`value={${s}}`));
  eq('they run whose, which, how', order[0] < order[1] && order[1] < order[2], true);
  eq('  in one row that scrolls rather than wraps',
    /flex items-center gap-2 overflow-x-auto scrollbar-hide/.test(card), true);
}

console.log('\n— what the drawer opens on —');
{
  eq('mine', /useState<'mine' \| 'all'>\('mine'\)/.test(card), true);
  eq('upcoming', /useState<'upcoming' \| 'all'>\('upcoming'\)/.test(card), true);
  eq('the calendar', /useState<'calendar' \| 'cards'>\('calendar'\)/.test(card), true);

  // Opening it again has to start over, or yesterday's filters are still on.
  const opener = card.match(/setMeetingsOpen\(true\);[^\n]*/)?.[0] ?? '';
  eq('and opening it resets all three',
    ["setDrawerScope('upcoming')", "setDrawerOwner('mine')", "setDrawerView('calendar')"]
      .every(s => opener.includes(s)), true);
  eq('  along with the day and booth filters',
    opener.includes('setDrawerDateFilter([])') && opener.includes('setDrawerBoothOnly(false)'), true);
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
