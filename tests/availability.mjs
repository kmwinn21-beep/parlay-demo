/**
 * Where the team has room.
 *
 *   node --experimental-strip-types --import ./tests/register-ts.mjs \
 *        tests/availability.mjs
 *
 * The calendar answers "what is booked"; this answers "where is there room",
 * which is the question somebody with a company to meet and no slot for them
 * is actually asking. It is the same data read backwards — not the meetings,
 * the gaps between them — and every part of reading it backwards has an edge:
 *
 *   - a meeting with no time on the clock blocks nothing, because there is no
 *     half hour it can be said to occupy;
 *   - an hour needs two free half hours in a row, so 1:00 is offered and
 *     12:30 is not when the next meeting starts at two;
 *   - a meeting that ends exactly when a slot starts is not in the way;
 *   - and booking into somebody's gap has to put them on the meeting, unless
 *     they are the one doing the booking.
 *
 * So the rules are RUN. The board itself is measured in Chromium at 1440 —
 * columns that scroll on their own, the empty column's way out, and the slot
 * arriving in the meeting form with its day, time, length and person.
 *
 * Exits non-zero on the first failing expectation, so it can gate a build.
 */
import { readFileSync } from 'node:fs';
import {
  DEFAULT_WINDOW, SLOT_STEP, WINDOW_OPTIONS,
  additionalAttendeesFor, availabilityPeople, bookedCount, busyByDay,
  freeSlots, minutesToLabel, minutesToTime, slotLabel, slotsByDay, slotsOf,
} from '@/lib/availability';

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
/** A meeting, as the columns the availability reads hold one. */
const mtg = (date, time, who, duration = 30, support = null) =>
  ({ id: ++nextId, meeting_date: date, meeting_time: time, duration_minutes: duration, scheduled_by: who, support_rep_ids: support });

const GAVIN = { id: 11, name: 'Gavin Steele', initials: 'GS' };
const at = (h, m = 0) => h * 60 + m;
/** The times of one person's slots, as a reader would say them. */
const times = (slots) => slots.map(s => minutesToTime(s.startMinutes));

console.log('\n— the window and the grain —');
{
  eq('half hours', SLOT_STEP, 30);
  eq('7am to 5pm unless somebody says otherwise', DEFAULT_WINDOW, { startMinutes: 420, endMinutes: 1020 });
  eq('the pickers offer 6 AM to 9 PM', [WINDOW_OPTIONS[0].label, WINDOW_OPTIONS[WINDOW_OPTIONS.length - 1].label], ['6:00 AM', '9:00 PM']);
  eq('  on the hour', WINDOW_OPTIONS.every(o => o.value % 60 === 0), true);

  eq('minutes read as a time', [minutesToLabel(at(7)), minutesToLabel(at(12)), minutesToLabel(at(13, 30)), minutesToLabel(0)],
    ['7:00 AM', '12:00 PM', '1:30 PM', '12:00 AM']);
  eq('  and as a value', [minutesToTime(at(7)), minutesToTime(at(13, 30))], ['07:00', '13:30']);
  // "1:00 – 2:00 PM" where both ends agree, both said where they do not.
  eq('a slot says its two ends once', slotLabel(at(13), at(14)), '1:00 – 2:00 PM');
  eq('  and twice across noon', slotLabel(at(11, 30), at(12, 30)), '11:30 AM – 12:30 PM');
}

console.log('\n— who the board is about —');
{
  const users = [
    { id: 9, value: 'Kevin Winn' }, { id: 11, value: 'Gavin Steele' },
    { id: 12, value: 'Mikkel Wad Thorsen' }, { id: 13, value: 'Henri Sejournet' },
  ];
  /*
   * The conference's own internal attendees first, in its order — they are
   * the people who are AT this thing. The conference stores names, so they
   * are matched back to the user list.
   */
  eq('the conference’s internal attendees, in its order',
    availabilityPeople('Henri Sejournet, Gavin Steele', [], users).map(p => p.name),
    ['Henri Sejournet', 'Gavin Steele']);
  eq('  with their initials', availabilityPeople('Mikkel Wad Thorsen', [], users).map(p => p.initials), ['MT']);
  eq('  matched however they are cased or spaced',
    availabilityPeople('  gavin steele ', [], users).map(p => p.id), [11]);
  eq('  and a name matching nobody is dropped',
    availabilityPeople('Someone Else', [], users).map(p => p.name), []);

  // Then anyone else on a meeting here: a rep booked in without being on the
  // attendee list still has a day that can be filled.
  eq('then whoever else is on a meeting',
    availabilityPeople('Gavin Steele', [mtg('2026-10-21', '09:00', '9')], users).map(p => p.name),
    ['Gavin Steele', 'Kevin Winn']);
  eq('  including the people added to one',
    availabilityPeople('', [mtg('2026-10-21', '09:00', '9,13', 30, '13')], users).map(p => p.name),
    ['Kevin Winn', 'Henri Sejournet']);
  eq('  and nobody twice',
    availabilityPeople('Gavin Steele', [mtg('2026-10-21', '09:00', '11')], users).map(p => p.name), ['Gavin Steele']);
  eq('nobody at all is no columns', availabilityPeople(null, [], users), []);
}

console.log('\n— when somebody is spoken for —');
{
  const day = '2026-10-21';
  const meetings = [
    mtg(day, '09:00', '11', 60),
    mtg(day, '11:30', '11', 30),
    mtg(day, '14:00', '12', 30),
  ];
  eq('their meetings, by day', busyByDay(meetings, 11).get(day), [[540, 600], [690, 720]]);
  eq('  the real length, not the height a card is drawn at',
    busyByDay([mtg(day, '09:00', '11', 15)], 11).get(day), [[540, 555]]);
  eq('  thirty where none was recorded',
    busyByDay([mtg(day, '09:00', '11', null)], 11).get(day), [[540, 570]]);
  eq('  and somebody else’s are not theirs', busyByDay(meetings, 11).has('2026-10-22'), false);

  /*
   * Booth hours and TBD are meetings with no point on the clock, so there is
   * no half hour they block. Somebody with four of them reads as free all
   * day — their day is committed, but not at any particular minute.
   */
  eq('a meeting with no time blocks nothing',
    busyByDay([mtg(day, 'tbd', '11'), mtg(day, 'booth', '11'), mtg(day, '', '11')], 11).size, 0);

  eq('the count under a name is their meetings', bookedCount(meetings, 11), 2);
  eq('  and counts the ones they were added to', bookedCount([mtg(day, '09:00', '9,11', 30, '11')], 11), 1);
}

console.log('\n— where an hour fits, and where half of one does —');
{
  const day = '2026-10-21';
  const base = {
    people: [GAVIN], days: [day],
    startMinutes: at(8), endMinutes: at(12),
  };
  // Booked 9:00–10:00 and 11:30–12:00.
  const meetings = [mtg(day, '09:00', '11', 60), mtg(day, '11:30', '11', 30)];

  eq('half hours fill the gaps',
    times(freeSlots({ ...base, meetings, duration: 30 })),
    ['08:00', '08:30', '10:00', '10:30', '11:00']);

  /*
   * The rule the request named: an hour is filtered OUT where there is not an
   * hour. 8:30 goes because 8:30–9:30 runs into the nine o'clock; 10:30 goes
   * because 10:30–11:30 ends exactly as the 11:30 begins — which is allowed.
   */
  eq('  an hour needs two of them in a row',
    times(freeSlots({ ...base, meetings, duration: 60 })),
    ['08:00', '10:00', '10:30']);
  eq('  and a quarter hour fits wherever a half does',
    times(freeSlots({ ...base, meetings, duration: 15 })),
    ['08:00', '08:30', '10:00', '10:30', '11:00']);
  // 45 minutes: 10:30–11:15 fits, 11:00–11:45 runs into the 11:30.
  eq('  while three quarters is its own answer',
    times(freeSlots({ ...base, meetings, duration: 45 })),
    ['08:00', '10:00', '10:30']);

  // Touching is not overlapping, at either end.
  eq('a meeting ending as a slot starts is not in the way',
    times(freeSlots({ ...base, meetings: [mtg(day, '08:00', '11', 30)], duration: 30 })),
    ['08:30', '09:00', '09:30', '10:00', '10:30', '11:00', '11:30']);

  // The window is a hard edge: nothing starts before it or ends after it.
  eq('nothing runs past the end of the window',
    times(freeSlots({ ...base, meetings: [], duration: 60 })).slice(-1), ['11:00']);
  eq('  nor starts before its beginning',
    times(freeSlots({ ...base, meetings: [], duration: 30 }))[0], '08:00');
  eq('a window that ends before it starts has nothing in it',
    freeSlots({ ...base, meetings: [], duration: 30, startMinutes: at(16), endMinutes: at(8) }), []);
  eq('  and a window too short for the meeting too',
    freeSlots({ ...base, meetings: [], duration: 60, startMinutes: at(8), endMinutes: at(8, 30) }), []);

  // Somebody with nothing booked is free the whole window.
  eq('an empty day is the whole window',
    times(freeSlots({ ...base, meetings: [], duration: 30 })).length, 8);
  // And the untimed meetings leave it that way.
  eq('  and stays that way through booth hours',
    times(freeSlots({ ...base, meetings: [mtg(day, 'booth', '11'), mtg(day, 'tbd', '11')], duration: 30 })).length, 8);
}

console.log('\n— a column, and what it is cut into —');
{
  const people = [GAVIN, { id: 12, name: 'Mikkel Wad Thorsen', initials: 'MT' }];
  const days = ['2026-10-20', '2026-10-21'];
  const slots = freeSlots({
    meetings: [mtg('2026-10-20', '08:00', '11', 60)],
    people, days, startMinutes: at(8), endMinutes: at(10), duration: 60,
  });

  // Three starts fit an hour in a two-hour window — 8:00, 8:30 and 9:00 —
  // so Mikkel, who is on nothing, has three on each of the two days, and
  // Gavin loses the two that run into his eight o'clock.
  eq('each person gets their own', [slotsOf(slots, 11).length, slotsOf(slots, 12).length], [4, 6]);
  eq('  in day then time order',
    slotsOf(slots, 11).map(s => `${s.day.slice(5)} ${minutesToTime(s.startMinutes)}`),
    ['10-20 09:00', '10-21 08:00', '10-21 08:30', '10-21 09:00']);

  /*
   * Cut into days, because a column running over a whole conference is forty
   * times with nothing saying where Tuesday ends. One day picked makes one
   * group, and the component draws no heading for it.
   */
  const groups = slotsByDay(slotsOf(slots, 11));
  eq('a column over several days is cut into them', groups.map(g => g.day), ['2026-10-20', '2026-10-21']);
  eq('  each holding its own', groups.map(g => g.slots.length), [1, 3]);
  eq('  and one day is one group',
    slotsByDay(slotsOf(slots, 11).filter(s => s.day === '2026-10-21')).length, 1);
  eq('nothing free is no groups', slotsByDay([]), []);
}

console.log('\n— and who ends up on the meeting —');
{
  /*
   * The slot was somebody's gap. Booking into it without putting them on the
   * meeting is how a double booking is made — so they are added, unless they
   * are the one booking it, and then there is nobody to add.
   */
  eq('somebody else’s gap puts them on it', additionalAttendeesFor(11, 9), [11]);
  eq('  your own adds nobody', additionalAttendeesFor(9, 9), []);
  eq('  and a signed-out user adds them too', additionalAttendeesFor(11, null), [11]);
}

console.log('\n— the board, and the button that opens it —');
{
  const page = strip('app/conferences/[id]/page.tsx');
  const modal = strip('components/AvailabilityModal.tsx');
  const form = strip('components/NewMeetingModal.tsx');

  /*
   * The day filters came off the title row onto one of their own, which is
   * what makes room for a button that OPENS something rather than narrowing
   * what is already on screen.
   */
  eq('the day filters have a row of their own',
    /<div className="mt-3 flex items-center gap-3">[\s\S]{0,400}<MeetingDateFilterBar/.test(page), true);
  eq('  with Availability at its end', /onClick=\{\(\) => setAvailabilityOpen\(true\)\}/.test(page), true);
  eq('  and no copy left on the title row',
    (page.match(/<MeetingDateFilterBar/g) ?? []).length, 1);

  // A column per person, holding their gaps.
  eq('the board is a column per person', /data-availability-person=\{person\.id\}/.test(modal), true);
  eq('  of slots that can be clicked', /data-availability-slot=/.test(modal), true);
  eq('  with the three controls', /Meeting length/.test(modal) && /Between/.test(modal) && />Day</.test(modal), true);
  eq('  the day heading only where there is more than one',
    /\{groups\.length > 1 && \(/.test(modal), true);
  // A column with nothing says so, and offers the length that would find some.
  eq('  and an empty column offers a shorter meeting',
    /Show \{fallback\} min instead/.test(modal), true);

  /*
   * The handoff. The form it opens is the one the + Meeting button opens,
   * with the day, the time, the length and the person whose gap it was
   * already in it.
   */
  eq('a slot fills the meeting form',
    /prefillDate=\{meetingPrefill\?\.date\}/.test(page) && /prefillTime=\{meetingPrefill\?\.time\}/.test(page), true);
  eq('  with its length', /prefillDuration=\{meetingPrefill\?\.duration\}/.test(page), true);
  eq('  and whose gap it was',
    /internalUserIds: additionalAttendeesFor\(pick\.personId, currentUser\?\.configId \?\? null\)/.test(page), true);
  eq('  applied as the form opens', /if \(prefillDate\) setMeetingDate\(prefillDate\);/.test(form), true);
  eq('  and cleared when it closes',
    /onClose=\{\(\) => \{ setNewMeetingOpen\(false\); setMeetingPrefill\(null\); \}\}/.test(page), true);
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
