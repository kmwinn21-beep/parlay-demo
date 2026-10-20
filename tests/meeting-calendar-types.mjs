/**
 * The calendar coloured by company type, and the empty half hours on it.
 *
 *   node --experimental-strip-types --import ./tests/register-ts.mjs \
 *        tests/meeting-calendar-types.mjs
 *
 * Four changes to the board, each with an edge worth running rather than
 * reading:
 *
 *   · the fill is the company's type instead of the meeting's outcome, which
 *     means a key of only the types in the room, an untyped company that must
 *     not pass for a typed one, and a Competitor that is red whatever the
 *     config says;
 *   · that key is also a filter, the same dimming the Whose row does;
 *   · picking a day lights it and dims the rest of the week, where every
 *     other view drops the days not picked;
 *   · and an empty half hour is somewhere to click, which means knowing
 *     exactly which half hours are empty — including under a quarter-hour
 *     meeting drawn at half-hour height, and under one that started before
 *     the window opened.
 *
 * Exits non-zero on the first failing expectation, so it can gate a build.
 */
import { readFileSync } from 'node:fs';
import {
  SLOT_MINUTES, companyTypeOf, companyTypesPresent, matchesCompanyTypes,
  matchesDays, openSlots,
} from '@/lib/meetingCalendar';
import { getValuePreset } from '@/lib/colors';

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

let nextId = 0;
/** A meeting at a time, of a type. */
const mtg = (time, duration = null, type = 'Own/Op') =>
  ({ id: ++nextId, meeting_date: '2026-03-10', meeting_time: time, duration_minutes: duration, company_type: type });

console.log('\n— what kind of company it is —');
{
  eq('a type is its own value', companyTypeOf({ company_type: 'OpCo' }), 'OpCo');
  eq('  trimmed, since an import leaves spaces', companyTypeOf({ company_type: '  Capital ' }), 'Capital');
  // Untyped is ordinary: a company imported from a list and never typed, or
  // an attendee with no company at all.
  eq('no type is null', companyTypeOf({ company_type: null }), null);
  eq('  and so is a field that is only spaces', companyTypeOf({ company_type: '   ' }), null);
  eq('  and so is no field at all', companyTypeOf({}), null);
}

console.log('\n— the key is the types in the room —');
{
  const order = ['Capital', 'Own/Op', 'Pr. Vendor', 'OpCo', 'PropCo', 'CCRC', 'Vendor', 'Other'];
  const week = [
    mtg('09:00', null, 'Own/Op'), mtg('10:00', null, 'OpCo'), mtg('11:00', null, 'Own/Op'),
    mtg('12:00', null, 'Capital'), mtg('13:00', null, null), mtg('14:00', null, 'OpCo'),
    mtg('15:00', null, 'Own/Op'),
  ];
  eq('only the types present, in the config’s order, with counts',
    companyTypesPresent(week, order),
    [{ value: 'Capital', count: 1 }, { value: 'Own/Op', count: 3 }, { value: 'OpCo', count: 2 },
      { value: null, count: 1 }]);

  // A tenant can have fourteen configured types and four in the room.
  eq('  a configured type nobody is meeting is not in the key',
    companyTypesPresent([mtg('09:00', null, 'Vendor')], order), [{ value: 'Vendor', count: 1 }]);

  // Typed by hand, or configured since the meeting was booked: still drawn,
  // after the ones the config knows about, in the order they turn up.
  eq('  a type the config has never heard of still gets a swatch',
    companyTypesPresent([mtg('09:00', null, 'Zebra'), mtg('10:00', null, 'Capital'), mtg('11:00', null, 'Aardvark')], order),
    [{ value: 'Capital', count: 1 }, { value: 'Zebra', count: 1 }, { value: 'Aardvark', count: 1 }]);

  eq('  the untyped are last, because they are the absence of an answer',
    companyTypesPresent([mtg('09:00', null, null), mtg('10:00', null, 'Capital')], order),
    [{ value: 'Capital', count: 1 }, { value: null, count: 1 }]);
  eq('  and are left out entirely when there are none',
    companyTypesPresent([mtg('09:00', null, 'Capital')], order), [{ value: 'Capital', count: 1 }]);

  eq('no meetings, no key', companyTypesPresent([], order), []);
  // Without the config list the key still reads, in first-appearance order.
  eq('  and no config list is not no key',
    companyTypesPresent([mtg('09:00', null, 'OpCo'), mtg('10:00', null, 'Capital')]),
    [{ value: 'OpCo', count: 1 }, { value: 'Capital', count: 1 }]);
}

console.log('\n— the key dims what it is not —');
{
  const none = new Set();
  eq('nothing picked lights everything', matchesCompanyTypes(mtg('09:00', null, 'OpCo'), none), true);
  eq('  a picked type lights its own', matchesCompanyTypes(mtg('09:00', null, 'OpCo'), new Set(['OpCo'])), true);
  eq('  and dims the rest', matchesCompanyTypes(mtg('09:00', null, 'Capital'), new Set(['OpCo'])), false);
  eq('  two picked light either', [
    matchesCompanyTypes(mtg('09:00', null, 'Capital'), new Set(['OpCo', 'Capital'])),
    matchesCompanyTypes(mtg('09:00', null, 'Vendor'), new Set(['OpCo', 'Capital'])),
  ], [true, false]);
  // The useful edge of it: the companies somebody has to go and type.
  eq('“No type set” is a thing you can pick',
    matchesCompanyTypes(mtg('09:00', null, null), new Set([null])), true);
  eq('  and picking it dims the typed', matchesCompanyTypes(mtg('09:00', null, 'OpCo'), new Set([null])), false);
  eq('  while picking a type dims the untyped',
    matchesCompanyTypes(mtg('09:00', null, null), new Set(['OpCo'])), false);
}

console.log('\n— Competitor is red wherever it is drawn —');
{
  // The override lived inside getBadgeClass, where a new surface could not
  // reach it; the calendar fills a card from the preset directly.
  const red = getValuePreset('Competitor', { Competitor: 'green' });
  eq('a Competitor overrides its configured colour', red.key, 'red');
  eq('  while everything else wears what it was given',
    getValuePreset('OpCo', { OpCo: 'teal' }).key, 'teal');
  eq('  and an unconfigured type falls back to grey',
    getValuePreset('Brand New', {}).key, 'gray');
  eq('  and no value at all is grey too', getValuePreset(null, {}).key, 'gray');
}

console.log('\n— picking a day lights it, rather than emptying the week —');
{
  const tue = { id: 1, meeting_date: '2026-03-10', meeting_time: '09:00' };
  const wed = { id: 2, meeting_date: '2026-03-11', meeting_time: '09:00' };
  eq('no day picked lights the week', [matchesDays(tue, []), matchesDays(wed, [])], [true, true]);
  eq('  one picked lights that day', matchesDays(tue, ['2026-03-10']), true);
  eq('  and dims the others', matchesDays(wed, ['2026-03-10']), false);
  eq('  two picked light both', [
    matchesDays(tue, ['2026-03-10', '2026-03-11']),
    matchesDays(wed, ['2026-03-10', '2026-03-11']),
  ], [true, true]);
}

console.log('\n— where there is room —');
{
  const at = (t, d = null) => mtg(t, d);
  // 9 to 11 is four half hours: 9:00, 9:30, 10:00, 10:30.
  eq('an empty window is all of it', openSlots([], 9, 11), [540, 570, 600, 630]);
  eq('  on the half hour, and only the half hour', SLOT_MINUTES, 30);

  eq('a meeting takes its own half hour', openSlots([at('09:30')], 9, 11), [540, 600, 630]);
  eq('  an hour-long one takes two', openSlots([at('09:30', 60)], 9, 11), [540, 630]);
  // Drawn height, not real length: a quarter-hour card is drawn at half-hour
  // height, so the bottom half of its half hour cannot be pointed at.
  eq('  and a quarter-hour one still takes a whole one', openSlots([at('10:00', 15)], 9, 11), [540, 570, 630]);

  // A breakfast that started before the board opens still occupies the hour
  // it runs into.
  eq('a meeting that started before the window takes what it runs into',
    openSlots([{ id: 99, meeting_date: '2026-03-10', meeting_time: '08:45', duration_minutes: 30 }], 9, 11),
    [570, 600, 630]);
  // One that starts off the half hour blocks the half hour it sits across.
  eq('  and one that starts at a quarter past blocks the half hour it is in',
    openSlots([at('09:15', 30)], 9, 11), [600, 630]);

  // Booth hours and TBD are meetings with no point on the clock; they stack
  // in the band above the grid and cannot be said to take any half hour.
  eq('a meeting with no time takes nothing',
    openSlots([{ id: 98, meeting_date: '2026-03-10', meeting_time: 'booth' },
      { id: 97, meeting_date: '2026-03-10', meeting_time: 'tbd' },
      { id: 96, meeting_date: '2026-03-10', meeting_time: null }], 9, 11),
    [540, 570, 600, 630]);

  eq('nothing runs past the end of the window', openSlots([], 9, 10), [540, 570]);
  eq('  and a window with no room in it offers nothing', openSlots([], 9, 9), []);
  eq('a full window offers nothing', openSlots([at('09:00', 60), at('10:00', 60)], 9, 11), []);
}

console.log('\n— the board —');
{
  const cal = strip('components/MeetingsCalendar.tsx');

  eq('the fill is the company’s type', /const tint = companyTypeClass\(type, companyTypeColorMap\);/.test(cal), true);
  eq('  from the same colours its badge wears', /return getValuePreset\(type, colorMap\)\.badgeClass;/.test(cal), true);
  // Grey is a colour an admin can choose — Other wears it — so an untyped
  // company is drawn in a way no configured type can produce.
  eq('  and an untyped company is dashed rather than grey',
    /const UNTYPED_CLASS = 'bg-white text-gray-600 border border-dashed border-gray-400';/.test(cal), true);

  // Outcomes are configured and there can be five of them, so a tick and a
  // cross cannot carry it.
  eq('the outcome is a dot in the corner', /className="absolute top-1 right-1 w-2 h-2 rounded-full ring-1 ring-white\/90"/.test(cal), true);
  eq('  coloured from the action map', /backgroundColor: getValuePreset\(m\.outcome, colorMap\)\.hex/.test(cal), true);
  eq('  and a meeting with nothing recorded carries none', /\{m\.outcome && \(/.test(cal), true);

  // An eyebrow above the row on a phone, a label leading it from lg: at
  // 390px "Company type:" and one swatch took the width between them.
  eq('the keys name themselves above the row they label',
    /const KEY_ROW = 'flex flex-col gap-1\.5 px-4 py-2\.5 border-b border-gray-100 '/.test(cal), true);
  eq('  and say Type, Outcome and Rep',
    /<span className=\{KEY_LABEL\}>Type<\/span>/.test(cal)
      && /<span className=\{KEY_LABEL\}>Outcome<\/span>/.test(cal)
      && /<span className=\{KEY_LABEL\}>Rep<\/span>/.test(cal), true);

  eq('the key is a row of buttons', /onClick=\{\(\) => toggleType\(t\.value\)\}/.test(cal), true);
  eq('  that say whether they are on', /aria-pressed=\{on\}/.test(cal), true);
  eq('  keep the swatch in the card’s own colour',
    /className=\{`w-2\.5 h-2\.5 rounded-sm \$\{companyTypeClass\(t\.value, companyTypeColorMap\)\}`\}/.test(cal), true);
  eq('  name the untyped', /const label = t\.value \?\? 'No type set';/.test(cal), true);
  eq('  and clear in one click', /onClick=\{\(\) => setPickedTypes\(new Set\(\)\)\}/.test(cal), true);

  /*
   * And a lighter fade for what has happened, which is a different statement
   * from a filter's: one is a meeting you asked not to see, the other one you
   * were at. A card that is both takes the filter's, the stronger claim.
   */
  eq('what has passed fades, less than a filter dims',
    /dimmed\(m\) \? 'opacity-25' : past\(m\) \? 'opacity-60 hover:opacity-100' : 'opacity-100 hover:brightness-95'/.test(cal), true);
  eq('  only while the conference is on',
    /const running = conferenceIsRunning\(conferenceStart, conferenceEnd, now\.today\);/.test(cal), true);
  eq('  and the board keeps its own clock', /setInterval\(\(\) => setNow\(read\(\)\), 60_000\)/.test(cal), true);

  eq('four things dim a card', /!matchesDays\(m as CalendarMeeting, dimDays\)\n\s*\|\| !matchesCompanyTypes\(m as CalendarMeeting, pickedTypes\)\n\s*\|\| !matchesPeople\(m as CalendarMeeting, pickedPeople\)/.test(cal), true);
  eq('  and a day nobody picked dims its heading too',
    /const dayDimmed = \(day: string\) => dimDays\.length > 0 && !dimDays\.includes\(day\);/.test(cal), true);

  eq('an empty half hour is a button', /openSlots\(col\.meetings as CalendarMeeting\[\], startHour, endHour\)\.map\(start => \{/.test(cal), true);
  eq('  invisible until pointed at', /'opacity-0 hover:opacity-100 focus-visible:opacity-100'/.test(cal), true);
  // A pill in the middle of the column points at a slot the size of a pill.
  eq('  the width of the card it would become',
    /flex h-full w-full items-center justify-center truncate rounded-md border border-dashed border-gray-400/.test(cal), true);
  eq('  reading “+ Meeting”', /\+ Meeting/.test(cal), true);
  eq('  and not without somewhere to send it',
    /\{col\.offersSlots && onPickSlot/.test(cal), true);
  /*
   * A finger has no hover, and a board where every empty half hour books a
   * meeting the moment it is brushed cannot be scrolled. So a touch screen
   * asks to see the outline first and takes it with the second tap — read
   * off the POINTER rather than the width, since the stack is also what a
   * 560px drawer gets on a desktop.
   */
  eq('  a finger reveals it before it takes it',
    /if \(touch && !revealed\) \{ setRevealedSlot\(slotKey\); return; \}/.test(cal), true);
  eq('    and a finger is what cannot hover, not what is narrow',
    /const media = window\.matchMedia\('\(hover: none\)'\);/.test(cal), true);
  eq('    one at a time', /const revealed = revealedSlot === slotKey;/.test(cal), true);
  // "Nobody attending" is not a diary.
  eq('  and not in the column that is nobody’s day',
    /key: 'unassigned',[\s\S]{0,160}offersSlots: false,/.test(cal), true);
  eq('  handing back the day, the time and whose column it was',
    /onPickSlot\(\{ day: col\.day, time: minutesToTime\(start\), personId: col\.personId \}\);/.test(cal), true);

  // The headings are the only thing saying whose column is whose, and a board
  // is ten hours tall.
  eq('the headings pin under the tab row', /className="flex sticky z-\[15\] bg-white border-b border-gray-200"/.test(cal), true);
  // Over the hour gutter's z-10, which otherwise draws its labels across the
  // pinned headings, and under the tab row's z-20.
  eq('  over the gutter and under the tabs',
    /sticky left-0 bg-white z-10/.test(cal) && /sticky top-0 z-20/.test(strip('app/conferences/[id]/page.tsx')), true);
  eq('  at the height the tab row measures', /style=\{\{ top: stickyTop \}\}/.test(cal), true);
  eq('  which is measured rather than written down',
    /document\.querySelector<HTMLElement>\('\[data-sticky-tabs\]'\)/.test(cal), true);
  eq('  and re-measured when the tabs wrap', /new ResizeObserver\(measure\)/.test(cal), true);

  // Said once, in the day's own heading — the sentence explaining the columns
  // was a caption on a board that no longer needs one.
  eq('the rep axis no longer explains itself in a caption',
    /a column each/.test(cal.replace(/^\s*\*.*$/gm, '')), false);
}

console.log('\n— the page —');
{
  const page = strip('app/conferences/[id]/page.tsx');
  const table = strip('components/MeetingsTable.tsx');

  eq('the tab row is named so the board can measure it', /data-sticky-tabs/.test(page), true);

  eq('the calendar’s date axis dims days rather than dropping them',
    /const calendarDimsDays = meetingViewMode === 'calendar' && meetingGroupMode !== 'rep';/.test(page), true);
  eq('  so the filter lets them through',
    /if \(meetingFilterDates\.length > 0 && !calendarDimsDays\n\s*&& !meetingFilterDates\.includes\(m\.meeting_date\)\) return false;/.test(page), true);
  eq('  and the board is told which ones are lit',
    /calendarDimDays=\{calendarDimsDays \? meetingFilterDates : \[\]\}/.test(page), true);
  // The rep axis is the exception: there the picked day is which board is
  // drawn, so it still filters.
  eq('  except on the rep axis, where the day is the board',
    /const calendarByRep = meetingViewMode === 'calendar' && meetingGroupMode === 'rep';/.test(page), true);

  eq('the fill’s colours come from the config', /companyTypeColorMap=\{colorMaps\.company_type \|\| \{\}\}/.test(page), true);
  eq('  in the order the config lists them', /companyTypeOptions=\{meetingCompanyTypeOpts\}/.test(page), true);
  eq('  and the API hands the type down with the meeting',
    /company_type: r\.company_type != null \? String\(r\.company_type\) : null,/.test(strip('app/api/meetings/route.ts')), true);

  // The same form, prefilled the same way, as the availability board's slots.
  eq('a slot opens the meeting form on that half hour',
    /date: slot\.day,\n\s*time: slot\.time,\n\s*duration: DEFAULT_DURATION,/.test(page), true);
  eq('  with the column’s person added, unless they are the one booking',
    /: additionalAttendeesFor\(slot\.personId, currentUser\?\.configId \?\? null\),/.test(page), true);
  eq('  and nobody added on the date axis, where a column is not a person',
    /slot\.personId == null\n\s*\? \[\]/.test(page), true);
  // A button whose form would refuse it is worse than no button.
  eq('  and no slots at all where logging is closed',
    /onCalendarSlotPick=\{newMeetingBlocked \? undefined : slot => \{/.test(page), true);

  eq('the table passes it all through', [
    /dimDays=\{calendarDimDays\}/.test(table),
    /companyTypeOptions=\{companyTypeOptions\}/.test(table),
    /companyTypeColorMap=\{companyTypeColorMap\}/.test(table),
    /onPickSlot=\{onCalendarSlotPick\}/.test(table),
  ], [true, true, true, true]);
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
