import { hasNoStartTime, timeToMinutes } from '@/lib/meetingTime';

/**
 * The arithmetic behind the meetings calendar.
 *
 * Kept out of the component because almost none of it can be read off the
 * markup: which days the grid shows, which hours, where a card sits, how two
 * meetings at one hour divide the column, and which of them a given person is
 * on. Each of those is a rule with edges, and the edges are where a calendar
 * goes wrong — a meeting on a day outside the conference, a day with nothing
 * on it, a meeting that runs past the last hour drawn.
 */

/* ── How long a meeting runs ──────────────────────────────────────────── */

/** The only lengths a meeting can be booked for. */
export const DURATION_OPTIONS = [15, 30, 45, 60] as const;
export type DurationMinutes = (typeof DURATION_OPTIONS)[number];

/** What a meeting is, unless it says otherwise. */
export const DEFAULT_DURATION: DurationMinutes = 30;

/** The shortest a card is ever drawn. A 15-minute slot is drawn as one. */
export const MIN_CARD_MINUTES = 30;

/**
 * A stored duration as one of the four, or 30.
 *
 * Null is the normal case, not an error: every meeting booked before the
 * column existed has one, and so does any row written by something that does
 * not know about it.
 */
export function normalizeDuration(value: number | string | null | undefined): DurationMinutes {
  const n = typeof value === 'string' ? Number(value) : value;
  return (DURATION_OPTIONS as readonly number[]).includes(n as number)
    ? (n as DurationMinutes)
    : DEFAULT_DURATION;
}

/**
 * How many minutes of the grid a meeting's card takes up.
 *
 * A quarter hour is drawn at half-hour height: 15 minutes is 20 pixels, which
 * fits a company name at no readable size. The card says "(15 min)" instead,
 * so the length is still on it — the request was for the size to match, not
 * for the length to disappear.
 */
export function cardMinutes(duration: number | null | undefined): number {
  return Math.max(MIN_CARD_MINUTES, normalizeDuration(duration));
}

/** '(15 min)' where the drawn height is not the real length, else null. */
export function durationSuffix(duration: number | null | undefined): string | null {
  const real = normalizeDuration(duration);
  return real < MIN_CARD_MINUTES ? `(${real} min)` : null;
}

/* ── Which days the calendar shows ────────────────────────────────────── */

/** 'YYYY-MM-DD' + n days, done on the date rather than on a timestamp. */
function addDays(date: string, n: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Whether a string is a date this can count on. */
function isDate(value: string | null | undefined): value is string {
  return !!value && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export interface CalendarMeeting {
  id: number;
  meeting_date: string;
  meeting_time: string | null;
  duration_minutes?: number | null;
  scheduled_by?: string | null;
  support_rep_ids?: string | null;
}

/**
 * Every day of the conference, plus any day a meeting actually lands on.
 *
 * The range is the point: a conference is Tuesday to Friday and the week
 * reads as four columns whether or not anything is booked on the Thursday.
 * But meetings do get booked outside it — a dinner the night before, a
 * breakfast on the way out — and a calendar that hides a meeting because its
 * date falls outside the conference is worse than one with a fifth column.
 */
export function calendarDays(
  start: string | null | undefined,
  end: string | null | undefined,
  meetings: Array<{ meeting_date: string }>,
): string[] {
  const days = new Set<string>();
  if (isDate(start) && isDate(end) && start <= end) {
    // Capped so a typo in a conference's end date cannot ask for a thousand
    // columns; the meetings below still carry their own days in.
    for (let d = start, i = 0; d <= end && i < 60; d = addDays(d, 1), i++) days.add(d);
  } else {
    if (isDate(start)) days.add(start);
    if (isDate(end)) days.add(end);
  }
  for (const m of meetings) if (isDate(m.meeting_date)) days.add(m.meeting_date);
  return Array.from(days).sort();
}

/** Whether a day is outside the conference's own dates — it gets a mark. */
export function isOutsideConference(
  day: string,
  start: string | null | undefined,
  end: string | null | undefined,
): boolean {
  if (!isDate(start) || !isDate(end) || start > end) return false;
  return day < start || day > end;
}

/* ── Which hours the calendar shows ───────────────────────────────────── */

/** The hours drawn when nothing is booked: a working day. */
export const DEFAULT_WINDOW = { startHour: 8, endHour: 18 };

/**
 * The hours this conference actually uses, with an hour of air either side.
 *
 * A fixed midnight-to-midnight grid is 24 rows of which four are used. This
 * one opens on the earliest meeting and closes after the latest, so the week
 * fills the space it is given.
 */
export function hourWindow(meetings: CalendarMeeting[]): { startHour: number; endHour: number } {
  let earliest = Infinity;
  let latest = -Infinity;
  for (const m of meetings) {
    const start = timeToMinutes(m.meeting_time);
    if (start == null) continue;
    earliest = Math.min(earliest, start);
    latest = Math.max(latest, start + cardMinutes(m.duration_minutes));
  }
  if (earliest === Infinity) return { ...DEFAULT_WINDOW };
  const startHour = Math.max(0, Math.floor(earliest / 60) - 1);
  const endHour = Math.min(24, Math.ceil(latest / 60) + 1);
  // Never fewer than four hours: one meeting at 9:00 should not leave a grid
  // two rows tall that reads as a broken table.
  return { startHour, endHour: Math.max(endHour, Math.min(24, startHour + 4)) };
}

/* ── Where a card sits ────────────────────────────────────────────────── */

export interface PlacedMeeting<T> {
  meeting: T;
  /** Minutes from the top of the window, and how many it covers. */
  topMinutes: number;
  heightMinutes: number;
  /** Which of `columns` side-by-side slots this one takes, from 0. */
  column: number;
  columns: number;
}

/**
 * One day's timed meetings, placed.
 *
 * Meetings that overlap share the width of the column, which is the only way
 * a calendar can show two at nine o'clock without hiding one. Done by
 * clustering: a run of meetings that touch each other all divide the same
 * width, so a day with one pair does not make every other card half-width.
 *
 * Measured in minutes, not pixels. The component multiplies by its own scale,
 * so the same rule serves the desktop grid and the phone's day drawer.
 */
export function layoutDay<T extends CalendarMeeting>(
  meetings: T[],
  startHour: number,
): PlacedMeeting<T>[] {
  const timed = meetings
    .map(m => ({ m, start: timeToMinutes(m.meeting_time) }))
    .filter((x): x is { m: T; start: number } => x.start != null)
    .map(x => ({ m: x.m, start: x.start, end: x.start + cardMinutes(x.m.duration_minutes) }))
    // By start, then by the longer meeting, then by id: a stable order, so
    // the same day always lays out the same way.
    .sort((a, b) => a.start - b.start || (b.end - b.start) - (a.end - a.start) || a.m.id - b.m.id);

  const placed: PlacedMeeting<T>[] = [];
  let cluster: Array<{ m: T; start: number; end: number; column: number }> = [];
  let clusterEnd = -Infinity;

  const flush = () => {
    const columns = cluster.reduce((n, x) => Math.max(n, x.column + 1), 0);
    for (const x of cluster) {
      placed.push({
        meeting: x.m,
        topMinutes: x.start - startHour * 60,
        heightMinutes: x.end - x.start,
        column: x.column,
        columns,
      });
    }
    cluster = [];
    clusterEnd = -Infinity;
  };

  for (const item of timed) {
    // A new cluster the moment nothing in the last one is still running.
    if (item.start >= clusterEnd && cluster.length > 0) flush();
    // The leftmost column free at this minute.
    const taken = new Set(cluster.filter(x => x.end > item.start).map(x => x.column));
    let column = 0;
    while (taken.has(column)) column++;
    cluster.push({ ...item, column });
    clusterEnd = Math.max(clusterEnd, item.end);
  }
  if (cluster.length > 0) flush();

  return placed;
}

/** The ones with no point on the clock — they stack above the hours. */
export function untimedOn<T extends CalendarMeeting>(meetings: T[], day: string): T[] {
  return meetings.filter(m =>
    m.meeting_date === day && (!m.meeting_time || hasNoStartTime(m.meeting_time)));
}

/** The ones with a time, for a day. */
export function timedOn<T extends CalendarMeeting>(meetings: T[], day: string): T[] {
  return meetings.filter(m =>
    m.meeting_date === day && timeToMinutes(m.meeting_time) != null);
}

/* ── Who is on a meeting ──────────────────────────────────────────────── */

/** config_options ids, from the comma-separated string the column holds. */
function ids(value: string | null | undefined): number[] {
  return String(value ?? '')
    .split(',')
    .map(s => Number(s.trim()))
    .filter(n => Number.isFinite(n) && n > 0);
}

/**
 * Everyone from our side who is on a meeting.
 *
 * `scheduled_by` carries the reps AND the internal people added through
 * Additional Attendees — the second group is listed again on
 * `support_rep_ids` so the table's Rep column does not claim them. For "whose
 * meetings are these", both count, so this is the union.
 */
export function internalIdsOn(meeting: CalendarMeeting): number[] {
  return Array.from(new Set([...ids(meeting.scheduled_by), ...ids(meeting.support_rep_ids)]));
}

export interface CalendarPerson {
  id: number;
  name: string;
  initials: string;
  /** How many of these meetings they are on. */
  count: number;
}

/** Initials from a display name: "Gavin Steele" → "GS". */
function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/**
 * Everyone this conference's calendar can draw a column for.
 *
 * The conference's own internal attendees first, in the order it lists them —
 * they are the people who are AT this thing, and a board that opened on a
 * different set would answer a different question. Then anyone else on a
 * meeting here: a rep booked in without being on the attendee list still has
 * a day worth reading.
 *
 * The conference stores names rather than ids, so they are matched back to
 * the user list; a name matching nobody is dropped rather than drawn as a
 * column nothing can be booked into.
 */
export function conferencePeople(
  internalAttendees: string | null | undefined,
  meetings: CalendarMeeting[],
  userOptions: Array<{ id: number; value: string }>,
): CalendarPerson[] {
  const byName = new Map(userOptions.map(u => [u.value.trim().toLowerCase(), u]));
  const byId = new Map(userOptions.map(u => [u.id, u]));
  const counts = new Map<number, number>();
  for (const m of meetings) {
    for (const id of internalIdsOn(m)) counts.set(id, (counts.get(id) ?? 0) + 1);
  }

  const people: CalendarPerson[] = [];
  const seen = new Set<number>();
  const add = (option: { id: number; value: string } | undefined) => {
    if (!option || seen.has(option.id)) return;
    seen.add(option.id);
    people.push({
      id: option.id,
      name: option.value,
      initials: initialsOf(option.value),
      count: counts.get(option.id) ?? 0,
    });
  };

  for (const name of String(internalAttendees ?? '').split(',').map(s => s.trim()).filter(Boolean)) {
    add(byName.get(name.toLowerCase()));
  }
  for (const m of meetings) for (const id of internalIdsOn(m)) add(byId.get(id));
  return people;
}

/** The ones a person is on, for their column. */
export function meetingsOfPerson<T extends CalendarMeeting>(meetings: T[], personId: number): T[] {
  return meetings.filter(m => internalIdsOn(m).includes(personId));
}

/**
 * The ones with nobody from the team on them.
 *
 * A meeting with no rep belongs to the conference rather than to nobody, so
 * the rep view gives it a column of its own rather than dropping it — it
 * would otherwise be hidden from the only board that shows the whole team.
 */
export function unassignedMeetings<T extends CalendarMeeting>(meetings: T[]): T[] {
  return meetings.filter(m => internalIdsOn(m).length === 0);
}

/**
 * Which day a board of people opens on.
 *
 * Today while the conference is running — that is the day somebody standing
 * at it wants — and its first day otherwise. A board of people with no day
 * cannot be drawn, so this never returns nothing when there are days.
 */
export function defaultCalendarDay(days: string[], today: string): string | null {
  if (days.length === 0) return null;
  return days.includes(today) ? today : days[0];
}

/**
 * The people to offer as filters: everyone on at least one of these meetings.
 *
 * Built from the meetings rather than from the whole user list, so the row is
 * the people at this conference and not the company directory. Ordered by how
 * many meetings they are on, then by name — the busiest rep is the one most
 * likely to be looking for their own day.
 */
export function calendarPeople(
  meetings: CalendarMeeting[],
  userOptions: Array<{ id: number; value: string }>,
): CalendarPerson[] {
  const names = new Map(userOptions.map(u => [u.id, u.value]));
  const counts = new Map<number, number>();
  for (const m of meetings) {
    for (const id of internalIdsOn(m)) counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .filter(([id]) => names.has(id))
    .map(([id, count]) => {
      const name = String(names.get(id));
      return { id, name, initials: initialsOf(name), count };
    })
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

/**
 * Whether a meeting stays lit while these people are picked.
 *
 * Nobody picked lights everything — the filter is a way of finding your own
 * meetings in a full week, not a way of emptying it. Several picked lights a
 * meeting any one of them is on, which is how two reps compare their days.
 */
export function matchesPeople(meeting: CalendarMeeting, picked: ReadonlySet<number>): boolean {
  if (picked.size === 0) return true;
  return internalIdsOn(meeting).some(id => picked.has(id));
}
