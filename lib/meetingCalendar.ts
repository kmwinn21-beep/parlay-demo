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
  /** The company's type, which is what colours the card. */
  company_type?: string | null;
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

/**
 * The day the calendar always draws: 7am to 7pm.
 *
 * A conference day is this long whether or not anything is booked in it, and
 * the empty hours are the useful ones — a board is read to find the gap as
 * often as to find the meeting.
 */
export const DEFAULT_WINDOW = { startHour: 7, endHour: 19 };

/**
 * The hours to draw: the working day, plus whatever falls outside it.
 *
 * This used to open an hour before the earliest meeting and close an hour
 * after the latest, which on a day with two meetings at 9 and 10 drew a
 * four-hour grid — a calendar that stopped at 11am, with nowhere to put the
 * afternoon and nothing to say the afternoon was free. Two meetings and
 * twenty are the same day.
 *
 * So 7am to 7pm is the floor rather than the fallback, and the window only
 * grows: a 6:30 meeting opens the grid at 6, a 7:30pm one closes it at 8, and
 * both are rounded to the hour the grid is drawn in. Twelve hours is taller
 * than a phone and most windows, which is what the scroll is for.
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
  return {
    startHour: Math.max(0, Math.min(DEFAULT_WINDOW.startHour, Math.floor(earliest / 60))),
    endHour: Math.min(24, Math.max(DEFAULT_WINDOW.endHour, Math.ceil(latest / 60))),
  };
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

/* ── What has already happened ────────────────────────────────────────── */

/**
 * Whether the conference is on today.
 *
 * The only time dimming what has passed says anything. Before it starts
 * nothing has; after it ends everything has, and a board where every card is
 * dimmed has simply lost a channel.
 */
export function conferenceIsRunning(
  start: string | null | undefined,
  end: string | null | undefined,
  today: string,
): boolean {
  if (!isDate(start) || !isDate(end) || start > end) return false;
  return today >= start && today <= end;
}

/**
 * Whether a meeting's own moment has passed.
 *
 * Measured against its START, which is what "past the scheduled time" says:
 * a meeting that has begun is no longer one of the ones left to get to, and
 * the board is read for the ones that are.
 *
 * A meeting with no time on the clock — booth hours, TBD — passes with its
 * DAY and not before: there is no minute it can be said to be over, but
 * yesterday is still yesterday.
 */
export function isPastMeeting(
  meeting: CalendarMeeting,
  today: string,
  nowMinutes: number,
): boolean {
  if (!isDate(meeting.meeting_date)) return false;
  if (meeting.meeting_date !== today) return meeting.meeting_date < today;
  const start = timeToMinutes(meeting.meeting_time);
  return start == null ? false : start < nowMinutes;
}

/* ── Where there is room ──────────────────────────────────────────────── */

/** The grain the board offers a free slot at, same as the availability board. */
export const SLOT_MINUTES = 30;

/**
 * The half hours of this column with nothing drawn in them.
 *
 * What a column is about does not matter here: a day's free time and a
 * person's free time are the same question asked of a different set of
 * meetings, so the caller passes the ones already narrowed to the column.
 *
 * Measured against the height a card is DRAWN at rather than its real length,
 * because the answer becomes a place to click: offering 9:15 under the bottom
 * half of a quarter-hour meeting's card would be offering a slot that cannot
 * be pointed at. On the half hour for the same reason the availability board
 * is — four starts an hour is four times the pills and no more useful.
 */
export function openSlots(
  meetings: CalendarMeeting[],
  startHour: number,
  endHour: number,
): number[] {
  const busy: Array<[number, number]> = [];
  for (const m of meetings) {
    const start = timeToMinutes(m.meeting_time);
    if (start == null) continue;
    busy.push([start, start + cardMinutes(m.duration_minutes)]);
  }
  const open: number[] = [];
  for (let s = startHour * 60; s + SLOT_MINUTES <= endHour * 60; s += SLOT_MINUTES) {
    const end = s + SLOT_MINUTES;
    if (!busy.some(([bStart, bEnd]) => bStart < end && s < bEnd)) open.push(s);
  }
  return open;
}

/* ── What kind of company it is ───────────────────────────────────────── */

/**
 * A meeting's company type, or null where there is none.
 *
 * Null is ordinary: a company imported from a list and not yet typed, or an
 * attendee with no company at all. The board draws those plainly rather than
 * giving them a colour, so a missing type cannot pass for a chosen one.
 */
export function companyTypeOf(meeting: { company_type?: string | null }): string | null {
  const value = String(meeting.company_type ?? '').trim();
  return value === '' ? null : value;
}

/** A type on the board, and how many meetings wear it. Null is the untyped. */
export interface CompanyTypeTally {
  value: string | null;
  count: number;
}

/**
 * The company types these meetings actually use, in the config's own order.
 *
 * Only the ones present: a tenant with fourteen configured types should not
 * get a fourteen-swatch key for a four-type week. In config order so the key
 * reads the same as every type picker in the app, with anything configured
 * since a meeting was booked — or typed by hand — after them, and the untyped
 * last because it is the absence of an answer rather than one of them.
 */
export function companyTypesPresent(
  meetings: Array<{ company_type?: string | null }>,
  configOrder: string[] = [],
): CompanyTypeTally[] {
  const counts = new Map<string, number>();
  let untyped = 0;
  const appeared: string[] = [];
  for (const m of meetings) {
    const type = companyTypeOf(m);
    if (type == null) { untyped++; continue; }
    if (!counts.has(type)) appeared.push(type);
    counts.set(type, (counts.get(type) ?? 0) + 1);
  }

  const tallies: CompanyTypeTally[] = [];
  const taken = new Set<string>();
  for (const value of configOrder) {
    if (!counts.has(value) || taken.has(value)) continue;
    taken.add(value);
    tallies.push({ value, count: counts.get(value) as number });
  }
  for (const value of appeared) {
    if (taken.has(value)) continue;
    taken.add(value);
    tallies.push({ value, count: counts.get(value) as number });
  }
  if (untyped > 0) tallies.push({ value: null, count: untyped });
  return tallies;
}

/**
 * Whether a meeting stays lit while these company types are picked.
 *
 * The same rule as the people filter, read off the key rather than off a row
 * of names: nothing picked lights everything, and several picked light a
 * meeting of any of them. Null is a type here — "No type set" is a thing a
 * key can be clicked on, and the companies that need typing are worth being
 * able to pick out of a week.
 */
export function matchesCompanyTypes(
  meeting: { company_type?: string | null },
  picked: ReadonlySet<string | null>,
): boolean {
  if (picked.size === 0) return true;
  return picked.has(companyTypeOf(meeting));
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
 * The people this conference's calendar draws a column for.
 *
 * Its own internal attendees, in the order the conference lists them, and
 * NOBODY ELSE. The people on a meeting are not the same set: a rep who is
 * not at the conference books a meeting and puts whoever IS there on it as
 * an additional attendee, which is what the Rep and Additional Attendees
 * fields are for. Drawing a column for the booking rep would be a day's
 * schedule for somebody who is not in the building.
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
  return people;
}

/** The ones a person is on, for their column. */
export function meetingsOfPerson<T extends CalendarMeeting>(meetings: T[], personId: number): T[] {
  return meetings.filter(m => internalIdsOn(m).includes(personId));
}

/**
 * The ones nobody with a column is on.
 *
 * Two kinds, and they want the same answer: a meeting with no rep at all,
 * and a meeting whose reps are not at this conference — booked by someone
 * back at the office, with nobody here added to it yet. Either way it
 * belongs to the conference rather than to nobody, so the rep view gives it
 * a column of its own rather than dropping it; it would otherwise be hidden
 * from the only board that shows the whole team.
 */
export function meetingsWithoutColumn<T extends CalendarMeeting>(
  meetings: T[],
  people: Array<{ id: number }>,
): T[] {
  const columned = new Set(people.map(p => p.id));
  return meetings.filter(m => !internalIdsOn(m).some(id => columned.has(id)));
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
 * The meetings more than one of these people is on.
 *
 * On the rep axis those are the ones drawn in several columns at once, and
 * the only ones worth tracing: pointing at a meeting one person is on would
 * dim the whole board to say nothing. Counted against the people who HAVE a
 * column — somebody on a meeting who is not on the board cannot make it
 * appear twice.
 */
export function sharedMeetingIds(
  meetings: CalendarMeeting[],
  people: Array<{ id: number }>,
): Set<number> {
  const columned = new Set(people.map(p => p.id));
  const shared = new Set<number>();
  for (const meeting of meetings) {
    let seen = 0;
    for (const id of internalIdsOn(meeting)) {
      if (columned.has(id)) seen++;
      if (seen > 1) { shared.add(meeting.id); break; }
    }
  }
  return shared;
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

/**
 * Whether a meeting stays lit while these days are picked.
 *
 * The day filters take meetings off the table and out of the kanban, because
 * a list of Tuesday's meetings with Wednesday's still in it is not a filter.
 * A calendar is the other way round: the days are its columns, so dropping
 * three of the four leaves a board that cannot say where Tuesday sits in the
 * week. Here the picked day is lit and the rest of the week dims — the shape
 * of the conference is the thing a calendar is read for.
 */
export function matchesDays(meeting: CalendarMeeting, picked: readonly string[]): boolean {
  if (picked.length === 0) return true;
  return picked.includes(meeting.meeting_date);
}
