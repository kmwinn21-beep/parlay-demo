import { timeToMinutes } from '@/lib/meetingTime';
import { internalIdsOn, normalizeDuration, type CalendarMeeting } from '@/lib/meetingCalendar';

/**
 * When each of our people is free, and for how long.
 *
 * The calendar answers "what is booked"; this answers "where is there room",
 * which is the question somebody with a company to meet and no slot for them
 * is actually asking. It is the same data read the other way round: not the
 * meetings, but the gaps between them.
 *
 * All of it is here rather than in the component because every part has an
 * edge: a meeting with no time on the clock, a meeting that starts before the
 * window and runs into it, an hour that needs two free half hours in a row,
 * a person who is on no meetings at all.
 */

/** The grain the board offers. Every slot starts on one of these. */
export const SLOT_STEP = 30;

/** 7am to 5pm, which is the conference day as the request put it. */
export const DEFAULT_WINDOW = { startMinutes: 7 * 60, endMinutes: 17 * 60 };

/** 'HH:MM' from minutes since midnight. */
export function minutesToTime(minutes: number): string {
  const m = Math.max(0, Math.min(24 * 60, Math.round(minutes)));
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

/** '1:00 PM' from minutes since midnight. */
export function minutesToLabel(minutes: number): string {
  const m = ((Math.round(minutes) % (24 * 60)) + 24 * 60) % (24 * 60);
  const hour = Math.floor(m / 60);
  const period = hour >= 12 ? 'PM' : 'AM';
  return `${hour % 12 || 12}:${String(m % 60).padStart(2, '0')} ${period}`;
}

/** '1:00 – 2:00 PM' — the two ends of a slot, said once where they agree. */
export function slotLabel(startMinutes: number, endMinutes: number): string {
  const start = minutesToLabel(startMinutes);
  const end = minutesToLabel(endMinutes);
  const startPeriod = start.slice(-2);
  // "1:00 – 2:00 PM" reads better than "1:00 PM – 2:00 PM", but only while
  // both ends are in the same half of the day.
  return startPeriod === end.slice(-2)
    ? `${start.slice(0, -3)} – ${end}`
    : `${start} – ${end}`;
}

/** The hours the window pickers offer: 6 AM to 9 PM, on the hour. */
export const WINDOW_OPTIONS: Array<{ value: number; label: string }> =
  Array.from({ length: 16 }, (_, i) => {
    const value = (6 + i) * 60;
    return { value, label: minutesToLabel(value) };
  });

/* ── A colour per day ─────────────────────────────────────────────────── */

/**
 * What one day's slots wear.
 *
 * Every time on the board looked the same, so a column of forty of them read
 * as one list and the day headings were the only thing dividing it — which is
 * exactly the thing a reader scrolling past stops seeing. A hue per day makes
 * the division visible without another line.
 *
 * The conference tabs' palette, so the two places this app colours by
 * position agree. Written out in full because Tailwind reads class names out
 * of the source: a template string generates nothing and every pill comes out
 * unstyled.
 *
 * Ordered to keep neighbours apart rather than to match the tabs' order —
 * rose, sky, indigo, violet in a row would give three blues to three
 * consecutive days of a conference.
 */
export interface DayHue {
  /** The slot button. */
  pill: string;
  /** The count beside the day's heading. */
  badge: string;
  /** The heading itself. */
  heading: string;
}

export const DAY_HUES: DayHue[] = [
  { pill: 'border-rose-200 bg-rose-50 text-rose-900 hover:border-rose-500 hover:bg-rose-100',
    badge: 'border-rose-200 bg-rose-50 text-rose-700', heading: 'text-rose-700' },
  { pill: 'border-teal-200 bg-teal-50 text-teal-900 hover:border-teal-500 hover:bg-teal-100',
    badge: 'border-teal-200 bg-teal-50 text-teal-700', heading: 'text-teal-700' },
  { pill: 'border-violet-200 bg-violet-50 text-violet-900 hover:border-violet-500 hover:bg-violet-100',
    badge: 'border-violet-200 bg-violet-50 text-violet-700', heading: 'text-violet-700' },
  { pill: 'border-amber-200 bg-amber-50 text-amber-900 hover:border-amber-500 hover:bg-amber-100',
    badge: 'border-amber-200 bg-amber-50 text-amber-700', heading: 'text-amber-700' },
  { pill: 'border-sky-200 bg-sky-50 text-sky-900 hover:border-sky-500 hover:bg-sky-100',
    badge: 'border-sky-200 bg-sky-50 text-sky-700', heading: 'text-sky-700' },
  { pill: 'border-pink-200 bg-pink-50 text-pink-900 hover:border-pink-500 hover:bg-pink-100',
    badge: 'border-pink-200 bg-pink-50 text-pink-700', heading: 'text-pink-700' },
  { pill: 'border-emerald-200 bg-emerald-50 text-emerald-900 hover:border-emerald-500 hover:bg-emerald-100',
    badge: 'border-emerald-200 bg-emerald-50 text-emerald-700', heading: 'text-emerald-700' },
  { pill: 'border-indigo-200 bg-indigo-50 text-indigo-900 hover:border-indigo-500 hover:bg-indigo-100',
    badge: 'border-indigo-200 bg-indigo-50 text-indigo-700', heading: 'text-indigo-700' },
  { pill: 'border-yellow-200 bg-yellow-50 text-yellow-900 hover:border-yellow-500 hover:bg-yellow-100',
    badge: 'border-yellow-200 bg-yellow-50 text-yellow-700', heading: 'text-yellow-700' },
  { pill: 'border-blue-200 bg-blue-50 text-blue-900 hover:border-blue-500 hover:bg-blue-100',
    badge: 'border-blue-200 bg-blue-50 text-blue-700', heading: 'text-blue-700' },
];

/**
 * The hue a day wears, by where it falls in the conference.
 *
 * Keyed off the day's place in the conference's own dates rather than its
 * place in whatever is on screen, so Wednesday is the same colour whether
 * every day is showing or only Wednesday is. A conference longer than the
 * palette starts round again, which is ten days later and nowhere near
 * anything it could be confused with.
 */
export function dayHue(index: number): DayHue {
  return DAY_HUES[((index % DAY_HUES.length) + DAY_HUES.length) % DAY_HUES.length];
}

/** A column on the board: id is the config_options id the columns key on. */
export type AvailabilityPerson = { id: number; name: string; initials: string };

export interface AvailabilitySlot {
  personId: number;
  /** 'YYYY-MM-DD'. */
  day: string;
  startMinutes: number;
  endMinutes: number;
}

/** [start, end) in minutes for a meeting, or null when it is not on the clock. */
function busySpan(meeting: CalendarMeeting): [number, number] | null {
  const start = timeToMinutes(meeting.meeting_time);
  if (start == null) return null;
  // The real length, not the height the calendar draws it at: a quarter-hour
  // meeting occupies a quarter of an hour.
  return [start, start + normalizeDuration(meeting.duration_minutes)];
}

/**
 * When a person is already spoken for, by day.
 *
 * Booth hours and TBD do not appear: they are meetings with no point on the
 * clock, so there is no half hour they can be said to block. Somebody with
 * four of them still reads as free all day, which is the honest answer —
 * their day is committed, but not at any particular minute.
 */
export function busyByDay(
  meetings: CalendarMeeting[],
  personId: number,
): Map<string, Array<[number, number]>> {
  const byDay = new Map<string, Array<[number, number]>>();
  for (const meeting of meetings) {
    if (!internalIdsOn(meeting).includes(personId)) continue;
    const span = busySpan(meeting);
    if (!span) continue;
    const list = byDay.get(meeting.meeting_date) ?? [];
    list.push(span);
    byDay.set(meeting.meeting_date, list);
  }
  return byDay;
}

export interface AvailabilityQuery {
  meetings: CalendarMeeting[];
  people: AvailabilityPerson[];
  days: string[];
  startMinutes: number;
  endMinutes: number;
  /** 15, 30, 45 or 60 — the length being looked for. */
  duration: number;
}

/**
 * Every place a meeting of this length would fit.
 *
 * Starts are on the half hour, because a board offering 9:00, 9:15, 9:30 and
 * 9:45 for a fifteen-minute meeting is four times as long and no more useful.
 * A slot is free when nothing the person is on overlaps ANY of it — which is
 * why a sixty-minute search offers 1:00 and 1:30 but not 12:30 when the next
 * meeting starts at two.
 */
export function freeSlots({
  meetings, people, days, startMinutes, endMinutes, duration,
}: AvailabilityQuery): AvailabilitySlot[] {
  const length = normalizeDuration(duration);
  const slots: AvailabilitySlot[] = [];
  if (endMinutes <= startMinutes) return slots;

  for (const person of people) {
    const busy = busyByDay(meetings, person.id);
    for (const day of days) {
      const taken = busy.get(day) ?? [];
      for (let start = startMinutes; start + length <= endMinutes; start += SLOT_STEP) {
        const end = start + length;
        const clash = taken.some(([bStart, bEnd]) => bStart < end && start < bEnd);
        if (!clash) slots.push({ personId: person.id, day, startMinutes: start, endMinutes: end });
      }
    }
  }
  return slots;
}

/** The slots of one person, in the order a column reads them. */
export function slotsOf(slots: AvailabilitySlot[], personId: number): AvailabilitySlot[] {
  return slots
    .filter(s => s.personId === personId)
    .sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : a.startMinutes - b.startMinutes));
}

/** How many meetings a person is on, for the count under their name. */
export function bookedCount(meetings: CalendarMeeting[], personId: number): number {
  return meetings.filter(m => internalIdsOn(m).includes(personId)).length;
}

/**
 * One person's slots cut into days, in order.
 *
 * With no day picked a column runs over the whole conference, and a list of
 * forty times with nothing saying where Tuesday ends is unreadable. With a
 * day picked there is one group and the component draws no heading for it.
 */
export function slotsByDay(slots: AvailabilitySlot[]): Array<{ day: string; slots: AvailabilitySlot[] }> {
  const groups: Array<{ day: string; slots: AvailabilitySlot[] }> = [];
  for (const slot of slots) {
    const last = groups[groups.length - 1];
    if (last && last.day === slot.day) last.slots.push(slot);
    else groups.push({ day: slot.day, slots: [slot] });
  }
  return groups;
}

/**
 * Who goes on the meeting besides the person booking it.
 *
 * The slot was somebody's gap. Booking into it without putting them on the
 * meeting is how a double booking is made — so they are added, unless they
 * are the one doing the booking, in which case there is nobody to add.
 */
export function additionalAttendeesFor(
  slotPersonId: number,
  bookingUserConfigId: number | null | undefined,
): number[] {
  return bookingUserConfigId != null && bookingUserConfigId === slotPersonId ? [] : [slotPersonId];
}
