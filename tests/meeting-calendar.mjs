/**
 * The conference's meetings as a week.
 *
 *   node --experimental-strip-types --import ./tests/register-ts.mjs \
 *        tests/meeting-calendar.mjs
 *
 * A third view beside the table and the kanban, and the first one that has to
 * be right about time rather than merely about rows. Which days it shows,
 * which hours, where a card sits, how two meetings at nine o'clock divide a
 * column, how long a meeting runs and whose it is — every one of those is a
 * rule with an edge, and the edges are where a calendar goes wrong.
 *
 * So the rules are RUN, over the cases a conference actually produces: a
 * meeting with no time at all, two at once, three at once, a quarter-hour
 * drawn at half-hour height, a day with nothing on it, and a meeting on a day
 * outside the conference's own dates.
 *
 * The geometry is also measured in Chromium at 1440 and 390 — an hour's label
 * and its line at the same height, which is the one thing this file cannot
 * check.
 *
 * Exits non-zero on the first failing expectation, so it can gate a build.
 */
import { readFileSync } from 'node:fs';
import {
  DEFAULT_DURATION, DURATION_OPTIONS, MIN_CARD_MINUTES,
  calendarDays, calendarPeople, cardMinutes, durationSuffix, hourWindow,
  internalIdsOn, isOutsideConference, layoutDay, matchesPeople, normalizeDuration,
  timedOn, untimedOn,
} from '@/lib/meetingCalendar';

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

/** A meeting, named so a layout can be read at a glance. */
let nextId = 0;
const mtg = (name, date, time, duration = null, who = '9') =>
  ({ id: ++nextId, name, meeting_date: date, meeting_time: time, duration_minutes: duration, scheduled_by: who });

console.log('\n— how long a meeting runs —');
{
  eq('four lengths, no others', [...DURATION_OPTIONS], [15, 30, 45, 60]);
  eq('  and thirty is the default', DEFAULT_DURATION, 30);

  // Null is the normal case, not a fault: every meeting booked before the
  // column existed has one.
  eq('a meeting with no length is half an hour', normalizeDuration(null), 30);
  eq('  and so is one with nonsense in it', normalizeDuration(23), 30);
  eq('  or a string that is not a number', normalizeDuration('soon'), 30);
  eq('  while a real one is itself', [15, 30, 45, 60].map(n => normalizeDuration(n)), [15, 30, 45, 60]);
  // The form posts a number; a hand-written request might post the string.
  eq('  and "45" counts as 45', normalizeDuration('45'), 45);

  /*
   * A quarter hour is drawn at half-hour height. Fifteen minutes is twenty
   * pixels, which fits a company name at no readable size — so the card is
   * the size of a thirty and says "(15 min)" on it. Asked for in those words.
   */
  eq('a quarter-hour card is drawn as a half-hour', cardMinutes(15), MIN_CARD_MINUTES);
  eq('  and says so', durationSuffix(15), '(15 min)');
  eq('every other length is drawn at its own', [30, 45, 60].map(n => cardMinutes(n)), [30, 45, 60]);
  eq('  and says nothing extra', [30, 45, 60].map(n => durationSuffix(n)), [null, null, null]);
  eq('  nor does a meeting with no length', durationSuffix(null), null);
}

console.log('\n— which days the week shows —');
{
  const meetings = [mtg('a', '2026-10-21', '09:00')];

  // The point of a calendar: the Thursday with nothing on it is still a day
  // of the conference, and still a column.
  eq('every day of the conference',
    calendarDays('2026-10-20', '2026-10-23', meetings),
    ['2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23']);

  /*
   * And the edge case that was asked for: meetings do get booked outside the
   * dates — a dinner the night before, a breakfast on the way out — and a
   * calendar that hides one because of its date is worse than a fifth column.
   */
  eq('  plus any day a meeting actually lands on',
    calendarDays('2026-10-20', '2026-10-21', [mtg('x', '2026-10-25', '08:00'), mtg('y', '2026-10-19', '18:00')]),
    ['2026-10-19', '2026-10-20', '2026-10-21', '2026-10-25']);
  eq('  marked as outside', [
    isOutsideConference('2026-10-25', '2026-10-20', '2026-10-23'),
    isOutsideConference('2026-10-19', '2026-10-20', '2026-10-23'),
    isOutsideConference('2026-10-21', '2026-10-20', '2026-10-23'),
  ], [true, true, false]);

  eq('one-day conferences are one column', calendarDays('2026-10-20', '2026-10-20', []), ['2026-10-20']);
  eq('  a month crosses its end', calendarDays('2026-10-30', '2026-11-02', []),
    ['2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02']);
  eq('  and nothing at all is no columns', calendarDays(null, null, []), []);

  // Dates arriving the wrong way round, or not as dates, must not spin.
  eq('a backwards range falls back to its two ends',
    calendarDays('2026-10-23', '2026-10-20', []), ['2026-10-20', '2026-10-23']);
  eq('  and junk is ignored', calendarDays('soon', 'later', [mtg('a', '2026-10-21', '09:00')]), ['2026-10-21']);
  // A typo in an end date cannot ask for a thousand columns.
  eq('  a runaway range is capped', calendarDays('2026-01-01', '2030-01-01', []).length, 60);
}

console.log('\n— which hours —');
{
  // Opens on the earliest and closes after the latest, with an hour of air:
  // a fixed midnight-to-midnight grid is 24 rows of which four are used.
  eq('an hour either side of the day',
    hourWindow([mtg('a', '2026-10-21', '09:00', 30), mtg('b', '2026-10-21', '16:00', 30)]),
    { startHour: 8, endHour: 18 });
  // The last meeting's END decides the bottom, not its start.
  eq('  measured to the end of the last meeting',
    hourWindow([mtg('a', '2026-10-21', '16:45', 60)]).endHour, 19);
  // A 15-minute meeting is drawn as 30, so the window has to allow for that.
  eq('  including the height a quarter-hour is drawn at',
    hourWindow([mtg('a', '2026-10-21', '16:45', 15)]).endHour, 19);

  eq('nothing timed is a working day', hourWindow([]), { startHour: 8, endHour: 18 });
  eq('  and so is a day of untimed meetings',
    hourWindow([mtg('a', '2026-10-21', 'tbd'), mtg('b', '2026-10-21', 'booth')]),
    { startHour: 8, endHour: 18 });

  // One meeting must not leave a grid two rows tall that reads as a broken
  // table, and midnight must not produce a negative first hour.
  eq('never fewer than four hours', (() => {
    const w = hourWindow([mtg('a', '2026-10-21', '09:00', 30)]);
    return w.endHour - w.startHour >= 4;
  })(), true);
  eq('  and never before midnight', hourWindow([mtg('a', '2026-10-21', '00:15', 30)]).startHour, 0);
  eq('  nor past it', hourWindow([mtg('a', '2026-10-21', '23:30', 60)]).endHour, 24);
}

console.log('\n— where a card sits —');
{
  // Minutes from the top of the window, so the component can scale them.
  const one = layoutDay([mtg('a', '2026-10-21', '09:30', 30)], 8);
  eq('an hour and a half in, half an hour tall',
    one.map(p => [p.topMinutes, p.heightMinutes]), [[90, 30]]);
  eq('  a quarter-hour takes a half-hour of the grid',
    layoutDay([mtg('a', '2026-10-21', '09:00', 15)], 9).map(p => p.heightMinutes), [30]);
  eq('  and a meeting with no length takes thirty',
    layoutDay([mtg('a', '2026-10-21', '09:00', null)], 9).map(p => p.heightMinutes), [30]);

  /*
   * Two at nine o'clock is the case a list can be vague about and a calendar
   * cannot: they share the column's width rather than one hiding the other.
   */
  const two = layoutDay([mtg('a', '2026-10-21', '09:00', 30), mtg('b', '2026-10-21', '09:00', 30)], 9);
  eq('two at once divide the column', two.map(p => [p.column, p.columns]), [[0, 2], [1, 2]]);

  // Three overlapping, where one runs under the other two.
  const three = layoutDay([
    mtg('long', '2026-10-21', '09:00', 60),
    mtg('short', '2026-10-21', '09:00', 30),
    mtg('later', '2026-10-21', '09:15', 15),
  ], 9);
  eq('  three make thirds', three.map(p => p.columns), [3, 3, 3]);
  eq('  each in its own', three.map(p => `${p.meeting.name}:${p.column}`), ['long:0', 'short:1', 'later:2']);

  /*
   * And a pair must not make the whole day half-width. The clustering is what
   * keeps an untouched meeting full width.
   */
  const apart = layoutDay([
    mtg('nine', '2026-10-21', '09:00', 30),
    mtg('also nine', '2026-10-21', '09:00', 30),
    mtg('eleven', '2026-10-21', '11:00', 30),
  ], 9);
  eq('a cluster does not widen to the whole day',
    apart.map(p => `${p.meeting.name}:${p.columns}`), ['nine:2', 'also nine:2', 'eleven:1']);

  // Back to back is not an overlap: 9:00–9:30 and 9:30–10:00 are both full
  // width, which is the common case at a conference.
  eq('back to back is not at once',
    layoutDay([mtg('a', '2026-10-21', '09:00', 30), mtg('b', '2026-10-21', '09:30', 30)], 9)
      .map(p => p.columns), [1, 1]);

  // The same day always lays out the same way.
  const order = () => layoutDay([
    mtg('z', '2026-10-21', '09:00', 30), mtg('a', '2026-10-21', '09:00', 60),
  ], 9).map(p => `${p.meeting.name}:${p.column}`);
  eq('the order is stable', order(), order());
  eq('  longest first in a tie', order()[0].startsWith('a'), true);

  eq('nothing to place is nothing', layoutDay([], 9), []);
}

console.log('\n— and the ones with no time at all —');
{
  /*
   * meeting_time carries two sentinels — booth hours and TBD — for meetings
   * agreed but not placed on a clock. They belong to a day, so they stack at
   * the top of that day rather than piling at midnight or vanishing.
   */
  const day = [
    mtg('timed', '2026-10-21', '09:00', 30),
    mtg('booth', '2026-10-21', 'booth'),
    mtg('tbd', '2026-10-21', 'tbd'),
    mtg('empty', '2026-10-21', ''),
    mtg('другой день', '2026-10-22', '09:00', 30),
  ];
  eq('the untimed stack holds all three kinds',
    untimedOn(day, '2026-10-21').map(m => m.name), ['booth', 'tbd', 'empty']);
  eq('  and the hours hold the rest', timedOn(day, '2026-10-21').map(m => m.name), ['timed']);
  eq('  each on its own day', timedOn(day, '2026-10-22').map(m => m.name), ['другой день']);
  // None of them reaches the grid, where it would have to be drawn at a time
  // nobody chose.
  eq('  and none of them is placed in the hours',
    layoutDay(untimedOn(day, '2026-10-21'), 8), []);
}

console.log('\n— whose meetings these are —');
{
  /*
   * scheduled_by carries the reps AND the internal people added through
   * Additional Attendees; the second group is listed again on support_rep_ids
   * so the table's Rep column does not claim them. For "whose meetings are
   * these", both count.
   */
  const withSupport = { id: 1, meeting_date: '2026-10-21', meeting_time: '09:00', scheduled_by: '9,11', support_rep_ids: '11' };
  eq('the reps and the people added to them', internalIdsOn(withSupport), [9, 11]);
  eq('  deduplicated', internalIdsOn({ ...withSupport, support_rep_ids: '9,11' }), [9, 11]);
  eq('  and nothing from an empty field', internalIdsOn({ id: 2, meeting_date: '', meeting_time: '', scheduled_by: null }), []);
  eq('  nor from junk in it', internalIdsOn({ id: 3, meeting_date: '', meeting_time: '', scheduled_by: 'me, ,0,-2' }), []);

  const users = [{ id: 9, value: 'Kevin Winn' }, { id: 11, value: 'Gavin Steele' }, { id: 12, value: 'Nobody Here' }];
  const week = [
    { id: 1, meeting_date: '2026-10-21', meeting_time: '09:00', scheduled_by: '9' },
    { id: 2, meeting_date: '2026-10-21', meeting_time: '10:00', scheduled_by: '9,11', support_rep_ids: '11' },
    { id: 3, meeting_date: '2026-10-22', meeting_time: '09:00', scheduled_by: '11' },
  ];
  const people = calendarPeople(week, users);
  // Built from the meetings, so the row is the people at this conference and
  // not the company directory.
  eq('only people who are on a meeting', people.map(p => p.name), ['Gavin Steele', 'Kevin Winn']);
  eq('  with their count', people.map(p => p.count), [2, 2]);
  eq('  and their initials', people.map(p => p.initials), ['GS', 'KW']);
  // Busiest first, so the rep most likely to be looking for their own day is
  // the first chip; alphabetical settles a tie, as here.
  eq('  busiest first', calendarPeople([...week, { id: 5, meeting_date: '2026-10-23', meeting_time: '09:00', scheduled_by: '11' }], users)
    .map(p => `${p.name}:${p.count}`), ['Gavin Steele:3', 'Kevin Winn:2']);
  // An id with no user behind it is dropped rather than drawn as a blank chip.
  eq('an unknown id is not offered',
    calendarPeople([{ id: 4, meeting_date: '2026-10-21', meeting_time: '09:00', scheduled_by: '404' }], users), []);

  /*
   * Dimming, not hiding. Nobody picked lights everything — the filter finds
   * your meetings in a full week, it does not empty the week.
   */
  eq('nobody picked lights everything', week.map(m => matchesPeople(m, new Set())), [true, true, true]);
  eq('  one picked lights theirs', week.map(m => matchesPeople(m, new Set([11]))), [false, true, true]);
  eq('  including where they were added rather than booked it',
    matchesPeople(week[1], new Set([11])), true);
  eq('  and two picked light either’s', week.map(m => matchesPeople(m, new Set([9, 11]))), [true, true, true]);
}

console.log('\n— the view, wired in —');
{
  const cal = strip('components/MeetingsCalendar.tsx');
  const table = strip('components/MeetingsTable.tsx');
  const page = strip('app/conferences/[id]/page.tsx');

  eq('the toggle offers a third view', /\{ key: 'calendar' as const, label: 'Calendar'/.test(page), true);
  eq('  which the table knows how to draw', /viewMode\?: 'table' \| 'kanban' \| 'calendar';/.test(table), true);
  eq('  and is given the conference’s own dates',
    /conferenceStart=\{conference\.start_date\}/.test(page) && /conferenceEnd=\{conference\.end_date\}/.test(page), true);

  /*
   * The popup is the card the kanban already draws — renderMobileCard, the
   * same function — so it keeps every control the card has rather than being
   * a second, poorer copy of it.
   */
  // The card, through the chooser that shows a notes panel in its place when
  // one is open — see the section below.
  eq('the popup is the meeting’s own card',
    /renderDetail=\{calendarDetail\}/.test(table) && /return renderMobileCard\(m\);/.test(table), true);
  eq('  opened by clicking one', /onClick=\{\(\) => setOpenId\(m\.id\)\}/.test(cal), true);
  eq('  and closed by Escape', /if \(e\.key !== 'Escape'\) return;/.test(cal), true);

  // Dimming rather than filtering, below the outcome legend — as asked.
  eq('the people row sits under the legend',
    cal.indexOf('{legend}') < cal.indexOf('{peopleFilter}'), true);
  eq('  and dims what they are not on', /dimmed\(m\) \? 'opacity-25'/.test(cal), true);

  /*
   * And a phone can reach it. Table and Kanban both draw the same card list
   * below lg, so the desktop toggle was hidden there with nothing to choose
   * between; the calendar is a different thing on a phone, so the choice is
   * offered on the row the grouping toggle sits on.
   */
  // The phone row the grouping toggle sits on, which is where the choice is.
  const rowStart = page.indexOf('<ScrollRow className="lg:hidden mt-2"');
  const phoneToggle = page.slice(rowStart, page.indexOf('</ScrollRow>', rowStart));
  eq('the phone row exists', rowStart > 0, true);
  eq('a phone is offered Cards or Calendar',
    /label: 'Cards'/.test(phoneToggle) && /label: 'Calendar'/.test(phoneToggle), true);
  eq('  beside the grouping toggle', /<GroupToggle short \/>/.test(phoneToggle), true);
  eq('  and the buttons set the view', /onClick=\{\(\) => setMeetingViewMode\(opt\.key\)\}/.test(phoneToggle), true);

  // A phone gets one day in a drawer, with the dates to move between them.
  eq('a phone opens a day in a drawer', /<DayDrawer/.test(cal), true);
  eq('  and the week grid is desktop only', /className="hidden lg:block p-4"/.test(cal), true);
  eq('  with the days as buttons below it', /onClick=\{\(\) => setOpenDay\(day\)\}/.test(cal), true);
  eq('  and the other days inside it', /onClick=\{\(\) => onPick\(d\)\}/.test(cal), true);
}

console.log('\n— and what the card opens, opens where the calendar is —');
{
  const table = strip('components/MeetingsTable.tsx');
  const cal = strip('components/MeetingsCalendar.tsx');

  /*
   * Reported: a note added from the popup's kebab appeared BEHIND the popup,
   * and both notes panels appeared under the week — in the slot they take
   * beside a table, which the calendar does not have. Each is the same
   * mistake: the card inside the popup opens something that knows nothing
   * about the popup.
   *
   * So the panels are drawn inside it, where the inline edit form already
   * drew itself, and the page-level modals get it out of the way first.
   * Driven in Chromium at 1440: the pre-meeting notes and the company notes
   * both inside the popup and nowhere else, Add Note's modal on top with the
   * popup gone, and at 390 the sheet over a closed popup.
   */
  eq('the notes open inside the popup',
    /const inCalendarPopup = !cardsOnly && viewMode === 'calendar' && !isPhone;/.test(table), true);
  eq('  the meeting’s own', /if \(inCalendarPopup && notesMeetingId === m\.id && meetingNotesDrawer\) return meetingNotesDrawer;/.test(table), true);
  eq('  and the attendee’s', /if \(inCalendarPopup && notesView\?\.meeting\.id === m\.id && attendeeNotesPanel\) return attendeeNotesPanel;/.test(table), true);
  eq('  and not also in the slot beside a table that is not there',
    /\{meetingNotesDrawer && !notesAnchorable && !inCalendarPopup && \(/.test(table)
      && /\{notesView && !isPhone && !inCalendarPopup && \(/.test(table), true);

  // The page's own modals draw below the popup, so it stands aside.
  eq('a page-level modal gets the popup out of the way', /stepAside\(\); onQuickNote\(m\);/.test(table), true);
  eq('  the page’s notes drawer too', /stepAside\(\); onNotesClick\(m\.id\);/.test(table), true);
  eq('  and on a phone, the notes sheets', /if \(phoneCalendar && \(notesMeetingId != null \|\| notesView != null\)\)/.test(table), true);

  /*
   * And one Escape closes one thing. The panels and the edit form each close
   * themselves; without this, Escape closed the panel and the popup under it
   * at once, losing the meeting as well as the notes.
   */
  eq('what is inside the popup owns Escape', /if \(detailLocked\) return;/.test(cal), true);
  eq('  and the click outside', /onClick=\{locked \? undefined : onClose\}/.test(cal), true);
  eq('  while it is a notes panel or the edit form',
    /const calendarDetailLocked = inCalendarPopup\n\s*&& \(notesMeetingId != null \|\| notesView != null \|\| editingId != null\);/.test(table), true);
  eq('closing the popup finishes what it was showing',
    /const closeCalendarDetail = useCallback\(\(\) => \{/.test(table), true);
}

console.log('\n— and the form that sets the length —');
{
  const modal = strip('components/NewMeetingModal.tsx');
  eq('the schedule form offers a duration', /<label className=\{labelClass\} htmlFor="meeting-duration">Duration<\/label>/.test(modal), true);
  eq('  with only the four lengths', /\{DURATION_OPTIONS\.map\(mins => \(/.test(modal), true);
  eq('  defaulting to thirty minutes', /useState<number>\(DEFAULT_DURATION\)/.test(modal), true);
  eq('  posted with the meeting', /duration_minutes: durationMinutes,/.test(modal), true);
  // The field sits with the time it qualifies, three across where there is
  // room for three.
  eq('  beside the time it belongs to',
    /<div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">/.test(modal), true);
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
