'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { formatMeetingTime, hasNoStartTime, timeToMinutes, unscheduledLabel } from '@/lib/meetingTime';
import { useIsPhone } from '@/lib/useIsPhone';
import { getPreset, type ColorMap } from '@/lib/colors';
import {
  calendarDays, calendarPeople, cardMinutes, conferencePeople, defaultCalendarDay,
  durationSuffix, hourWindow, isOutsideConference, layoutDay, matchesPeople,
  meetingsOfPerson, meetingsWithoutColumn, sharedMeetingIds,
  type CalendarMeeting,
} from '@/lib/meetingCalendar';
import type { Meeting } from '@/components/MeetingsTable';

/**
 * The conference's meetings on a time grid, beside the table and the kanban.
 *
 * The other two views answer "what is booked"; this one answers "what does
 * Tuesday look like" — or, turned on its side, "what does Gavin's Wednesday
 * look like". The columns are the week by default and the team when the
 * header's By Rep is picked; everything else about the board is the same, so
 * the switch costs a reader nothing.
 *
 * Everything with edges is in lib/meetingCalendar: which days show, which
 * hours, where a card sits, how two meetings at nine o'clock divide a column,
 * and who is on what. This file is the drawing.
 */

/** A pixel per minute would be a six-hundred-pixel morning. */
const PX_PER_MINUTE = 60 / 60; // 60px to the hour
const HOUR_PX = 60;

/** Past this many columns the board scrolls rather than shrinking them. */
const COLUMNS_BEFORE_SCROLL = 6;
const MIN_SCROLL_COLUMN = 190;

/** 'YYYY-MM-DD' → { weekday: 'Tue', label: 'Oct 20' }. */
function dayParts(day: string): { weekday: string; label: string; short: string } {
  const d = new Date(`${day}T00:00:00`);
  return {
    weekday: d.toLocaleDateString('en-US', { weekday: 'short' }),
    label: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    short: `${d.getMonth() + 1}/${String(d.getDate()).padStart(2, '0')}`,
  };
}

/** Today where the reader is, as the dates are written. */
function todayYmd(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** '7 AM', '12 PM' — the gutter's labels. */
function hourLabel(hour: number): string {
  const h = hour % 24;
  const period = h >= 12 ? 'PM' : 'AM';
  return `${h % 12 || 12} ${period}`;
}

/** What a meeting with no outcome yet wears. */
const NO_OUTCOME_CLASS = 'bg-brand-secondary/10 text-brand-primary border border-brand-secondary/30';

/**
 * The colour a card wears: its outcome's, from the same table the pills use.
 *
 * A calendar is scanned rather than read, and the outcome is the thing worth
 * telling apart at a glance — what is still to happen, what happened, what
 * did not. The badge class, so a card and the outcome pill on it agree.
 */
function outcomeClass(outcome: string | null | undefined, colorMap: ColorMap): string {
  if (!outcome) return NO_OUTCOME_CLASS;
  return getPreset(colorMap[outcome]).badgeClass;
}

/** The two things a column can be about. */
export type CalendarAxis = 'date' | 'rep';

/** One column of the board, whichever axis it is on. */
interface Column {
  key: string;
  /** The day its hours belong to — every column on the rep axis shares one. */
  day: string;
  /** Null on the date axis, and on the rep axis's leading unassigned column. */
  personId: number | null;
  /** The meetings in it, already narrowed to the day and the person. */
  meetings: Meeting[];
  /** Overlapping cards here mean one person in two places: ring them. */
  marksConflicts: boolean;
  head: ReactNode;
  /** What the phone's list and the drawer's chips call it. */
  shortLabel: string;
  longLabel: string;
}

export function MeetingsCalendar({
  meetings, conferenceStart, conferenceEnd, userOptions, colorMap, renderDetail,
  axis = 'date', internalAttendees = null, repDay = null,
  closeSignal = 0, detailLocked = false, onDetailClose,
}: {
  meetings: Meeting[];
  conferenceStart: string | null;
  conferenceEnd: string | null;
  userOptions: Array<{ id: number; value: string }>;
  /** The action colours, so a card and its outcome pill agree. */
  colorMap: ColorMap;
  /** The meeting's own card, rendered in the popup. */
  renderDetail: (meeting: Meeting) => ReactNode;
  /**
   * What the columns are.
   *
   * 'date' is the week. 'rep' is one day with a column per person — the
   * header's By Rep, which in a list groups rows and here picks an axis.
   */
  axis?: CalendarAxis;
  /** The conference's own internal attendees, as it stores them: names. */
  internalAttendees?: string | null;
  /** Which day the rep axis shows, from the day filters. Null falls back. */
  repDay?: string | null;
  /**
   * Bumped by the table when the card in the popup opens something of its
   * own — a quick view, a call sheet, an add-contact sheet.
   *
   * Those draw below this popup, so without it tapping a company name in the
   * popup looks like nothing happening. Getting out of the way is the honest
   * answer: the thing that was asked for is what ends up on screen.
   */
  closeSignal?: number;
  /**
   * The popup is showing something that closes itself — the notes panels, the
   * inline edit form — so Escape and a click outside belong to it rather than
   * to the popup. Without this, one Escape closes both at once.
   */
  detailLocked?: boolean;
  /** The popup closed: whatever it was showing for that meeting is done. */
  onDetailClose?: () => void;
}) {
  const isPhone = useIsPhone();
  const [openId, setOpenId] = useState<number | null>(null);
  const [pickedPeople, setPickedPeople] = useState<Set<number>>(new Set());
  const [openColumn, setOpenColumn] = useState<string | null>(null);
  /** The shared meeting being pointed at, if any — see `sharedIds` below. */
  const [tracedId, setTracedId] = useState<number | null>(null);

  const days = useMemo(
    () => calendarDays(conferenceStart, conferenceEnd, meetings),
    [conferenceStart, conferenceEnd, meetings],
  );
  const { startHour, endHour } = useMemo(() => hourWindow(meetings as CalendarMeeting[]), [meetings]);
  const whosePeople = useMemo(
    () => calendarPeople(meetings as CalendarMeeting[], userOptions),
    [meetings, userOptions],
  );
  const hours = useMemo(
    () => Array.from({ length: Math.max(1, endHour - startHour) }, (_, i) => startHour + i),
    [startHour, endHour],
  );
  const gridHeight = hours.length * HOUR_PX;

  /** The one day the rep axis is about. */
  const theDay = useMemo(
    () => (repDay && days.includes(repDay) ? repDay : defaultCalendarDay(days, todayYmd())),
    [repDay, days],
  );

  const onDay = useCallback(
    (day: string) => meetings.filter(m => m.meeting_date === day),
    [meetings],
  );

  /*
   * The columns, whichever axis the header asked for.
   *
   * The rep axis puts a meeting in EVERY column of a person on it — the rep
   * who booked it and anyone added through Additional Attendees — because
   * that is what the column means: this person's day. A meeting with nobody
   * on it gets the leading column rather than being dropped.
   */
  const columns: Column[] = useMemo(() => {
    if (axis === 'date') {
      return days.map(day => {
        const parts = dayParts(day);
        const outside = isOutsideConference(day, conferenceStart, conferenceEnd);
        return {
          key: day,
          day,
          personId: null,
          meetings: onDay(day),
          marksConflicts: false,
          shortLabel: `${parts.weekday} ${parts.short}`,
          longLabel: `${parts.weekday} ${parts.label}`,
          head: (
            <>
              <p className="text-[11px] font-medium text-gray-500 uppercase tracking-wide">{parts.weekday}</p>
              <p className="text-sm font-semibold text-brand-primary">
                {parts.label}
                {outside && (
                  <span
                    className="ml-1.5 align-middle text-[10px] font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-1.5 py-0.5"
                    title="This day is outside the conference's own dates, and has meetings on it"
                  >
                    Outside
                  </span>
                )}
              </p>
            </>
          ),
        };
      });
    }

    if (!theDay) return [];
    const people = conferencePeople(internalAttendees, meetings as CalendarMeeting[], userOptions);
    /* No internal attendees, no board: a lone column holding every meeting
       under "Nobody attending" is a true statement that explains nothing.
       The empty state names what is missing instead. */
    if (people.length === 0) return [];
    const dayMeetings = onDay(theDay);
    const orphans = meetingsWithoutColumn(dayMeetings as CalendarMeeting[], people) as Meeting[];

    const personColumns: Column[] = people.map(person => {
      const mine = meetingsOfPerson(dayMeetings as CalendarMeeting[], person.id) as Meeting[];
      return {
        key: `person-${person.id}`,
        day: theDay,
        personId: person.id,
        meetings: mine,
        marksConflicts: true,
        shortLabel: person.initials,
        longLabel: person.name,
        head: (
          <div className="flex items-center gap-2 min-w-0">
            <span className="w-6 h-6 flex-shrink-0 rounded-full bg-brand-secondary/10 text-brand-primary text-[9px] font-semibold flex items-center justify-center">
              {person.initials}
            </span>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-brand-primary truncate">{person.name}</p>
              <p className="text-[10px] text-gray-500">
                {mine.length === 0 ? 'Nothing booked' : `${mine.length} meeting${mine.length === 1 ? '' : 's'}`}
              </p>
            </div>
          </div>
        ),
      };
    });

    /* Only when there is one: an empty column on every other conference
       would be a question nobody asked. */
    if (orphans.length === 0) return personColumns;
    return [{
      key: 'unassigned',
      day: theDay,
      personId: null,
      meetings: orphans,
      marksConflicts: true,
      shortLabel: 'Nobody',
      longLabel: 'Nobody attending',
      head: (
        <div className="min-w-0" title="Booked with no rep, or by someone who is not at this conference">
          <p className="text-[11px] font-medium text-gray-500 uppercase tracking-wide">Nobody attending</p>
          <p className="text-sm font-semibold text-gray-500">
            {orphans.length} meeting{orphans.length === 1 ? '' : 's'}
          </p>
        </div>
      ),
    }, ...personColumns];
  }, [axis, days, theDay, onDay, meetings, internalAttendees, userOptions, conferenceStart, conferenceEnd]);

  /*
   * The meetings that are in more than one column.
   *
   * Only on the rep axis, and only these: a meeting one person is on appears
   * once, and dimming the whole board to point at it would say nothing. The
   * ones worth tracing are the shared ones — the rep who booked it and
   * whoever was added to it — where the board is otherwise four separate
   * days that happen to contain the same company name.
   */
  const sharedIds = useMemo(() => {
    if (axis !== 'rep') return new Set<number>();
    const withColumns = columns
      .filter(c => c.personId != null)
      .map(c => ({ id: c.personId as number }));
    return sharedMeetingIds(meetings as CalendarMeeting[], withColumns);
  }, [axis, columns, meetings]);

  const bandHeight = useMemo(() => untimedBandHeight(columns), [columns]);
  const openMeeting = openId != null ? meetings.find(m => m.id === openId) ?? null : null;
  const drawerColumn = openColumn != null ? columns.find(c => c.key === openColumn) ?? null : null;

  // Esc closes whatever is open, innermost first.
  const closeDetail = useCallback(() => {
    setOpenId(null);
    onDetailClose?.();
  }, [onDetailClose]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      // What is inside the popup closes first, and closes itself.
      if (detailLocked) return;
      if (openId != null) closeDetail();
      else if (openColumn != null) setOpenColumn(null);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [openId, openColumn, detailLocked, closeDetail]);

  useEffect(() => {
    if (closeSignal === 0) return;
    setOpenId(null);
    // On a phone the column drawer is above those layers too.
    if (isPhone) setOpenColumn(null);
    // isPhone is read, not depended on: the signal is the event.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [closeSignal]);

  // A column open on one axis means nothing on the other.
  useEffect(() => { setOpenColumn(null); }, [axis, theDay]);

  const togglePerson = (id: number) => setPickedPeople(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  // Nothing to trace once the columns change under the pointer.
  useEffect(() => { setTracedId(null); }, [axis, theDay]);

  /**
   * Dimmed, not hidden: the board keeps its shape while one thing stands out.
   *
   * Two reasons to dim. The Whose row picks people, on the date axis. And
   * pointing at a meeting that is in several columns leaves its own copies
   * lit and dims the rest, so where it appears can be seen at a glance
   * rather than read out of four columns of company names.
   */
  const dimmed = (m: Meeting) =>
    !matchesPeople(m as CalendarMeeting, pickedPeople)
    || (tracedId != null && m.id !== tracedId);

  const card = (m: Meeting, opts: { style?: React.CSSProperties; compact?: boolean; conflict?: boolean } = {}) => {
    const tint = outcomeClass(m.outcome, colorMap);
    const suffix = durationSuffix(m.duration_minutes);
    const unscheduled = unscheduledLabel(m.meeting_time);
    const name = m.company_name || `${m.first_name} ${m.last_name}`.trim() || 'Meeting';
    return (
      <button
        key={m.id}
        type="button"
        onClick={() => setOpenId(m.id)}
        /* Keyboard as well as pointer: tabbing through the board traces the
           same meeting that hovering it does. */
        onMouseEnter={() => { if (sharedIds.has(m.id)) setTracedId(m.id); }}
        onMouseLeave={() => setTracedId(prev => (prev === m.id ? null : prev))}
        onFocus={() => { if (sharedIds.has(m.id)) setTracedId(m.id); }}
        onBlur={() => setTracedId(prev => (prev === m.id ? null : prev))}
        style={opts.style}
        data-shared={sharedIds.has(m.id) ? 'true' : undefined}
        data-conflict={opts.conflict ? 'true' : undefined}
        title={`${name}${opts.conflict ? ' — conflict' : ''}${
          unscheduled ? ` — ${unscheduled}` : m.meeting_time ? ` — ${formatMeetingTime(m.meeting_time)}` : ''}${
          sharedIds.has(m.id) ? ' — on more than one column' : ''}`}
        className={`block w-full text-left overflow-hidden rounded-md px-1.5 py-1 transition-opacity ${tint} ${
          opts.conflict ? 'ring-2 ring-red-600' : ''} ${
          dimmed(m) ? 'opacity-25' : 'opacity-100 hover:brightness-95'}`}
      >
        {/* The length rides the name's line rather than taking one of its
            own: a quarter-hour card is drawn at half-hour height, which is
            28px, and two lines do not fit in it. The name truncates, the
            length does not — it is the shorter and the more surprising. */}
        <span className="flex items-baseline gap-1 min-w-0">
          <span className="text-[11px] font-semibold leading-tight truncate">{name}</span>
          {suffix && <span className="flex-shrink-0 text-[9px] font-medium leading-tight opacity-80">{suffix}</span>}
        </span>
        {!suffix && !opts.compact && cardMinutes(m.duration_minutes) >= 45 && (
          <span className="block text-[10px] font-normal leading-tight opacity-80 truncate">
            {formatMeetingTime(m.meeting_time)}{m.location ? ` · ${m.location}` : ''}
          </span>
        )}
      </button>
    );
  };

  /** One column: the untimed stack, then the hours. */
  const columnBody = (col: Column, phone: boolean, band: number) => {
    const untimed = col.meetings.filter(m => !m.meeting_time || hasNoStartTime(m.meeting_time));
    const timed = col.meetings.filter(m => timeToMinutes(m.meeting_time) != null);
    const placed = layoutDay(timed as CalendarMeeting[], startHour) as Array<{
      meeting: Meeting; topMinutes: number; heightMinutes: number; column: number; columns: number;
    }>;
    return (
      <>
        {/* The band is the same height in every column, filled or empty, or
            the hour lines in a column with two untimed meetings would sit
            lower than the ones beside it and 9 AM would be at two heights. */}
        {band > 0 && (
          <div
            className="flex flex-col gap-1 p-1.5 border-b border-gray-100 bg-gray-50/40"
            style={{ height: band }}
            data-untimed-for={col.key}
          >
            {untimed.map(m => card(m, { compact: true }))}
          </div>
        )}
        <div className="relative" style={{ height: gridHeight }}>
          {/* The hour lines, behind everything. */}
          {hours.map((h, i) => (
            <div
              key={h}
              className="absolute inset-x-0 border-t border-gray-100"
              style={{ top: i * HOUR_PX }}
              aria-hidden
            />
          ))}
          {placed.map(p => {
            const width = 100 / p.columns;
            /* Overlapping cards in a PERSON's column are one person in two
               places, which is the thing a team sheet is read to catch. In a
               day's column they are two reps at nine o'clock — ordinary. */
            const conflict = col.marksConflicts && p.columns > 1;
            return (
              <div
                key={p.meeting.id}
                className="absolute px-0.5"
                style={{
                  top: p.topMinutes * PX_PER_MINUTE,
                  height: Math.max(22, p.heightMinutes * PX_PER_MINUTE - 2),
                  left: `${p.column * width}%`,
                  width: `${width}%`,
                }}
                data-meeting-card={p.meeting.id}
              >
                {card(p.meeting, { style: { height: '100%' }, compact: phone || p.columns > 1, conflict })}
              </div>
            );
          })}
        </div>
      </>
    );
  };

  if (days.length === 0) {
    return (
      <div className="text-center py-10">
        <p className="text-xs text-gray-400">No meetings and no conference dates to lay out.</p>
      </div>
    );
  }

  const legend = (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5 border-b border-gray-100 bg-gray-50/60">
      <span className="text-[11px] font-medium text-gray-500">Outcome:</span>
      {Array.from(new Set(meetings.map(m => m.outcome).filter((o): o is string => !!o))).slice(0, 6).map(outcome => (
        <span key={outcome} className="inline-flex items-center gap-1.5 text-[11px] font-medium text-gray-600">
          <span className={`w-2.5 h-2.5 rounded-sm ${outcomeClass(outcome, colorMap)}`} />
          {outcome}
        </span>
      ))}
      <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-gray-600">
        <span className={`w-2.5 h-2.5 rounded-sm ${NO_OUTCOME_CLASS}`} />
        No outcome yet
      </span>
      {/* Only where it can happen: on the date axis two cards side by side
          are two different people, and nothing is wrong. */}
      {axis === 'rep' && (
        <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-gray-600">
          <span className={`w-2.5 h-2.5 rounded-sm ring-2 ring-red-600 ${NO_OUTCOME_CLASS}`} />
          Conflict
        </span>
      )}
    </div>
  );

  /*
   * Whose meetings to light up.
   *
   * Everyone on at least one of these meetings, reps and the internal people
   * added through Additional Attendees alike — picking one dims everything
   * they are not on, so their day stands out of a full week. Nobody picked
   * lights everything; several picked light a meeting any of them is on.
   *
   * Gone on the rep axis: dimming the meetings a person is not on is exactly
   * what a column each already does.
   */
  const peopleFilter = axis === 'date' && whosePeople.length > 0 && (
    <div className="flex items-center gap-2 px-4 py-2.5 border-b border-gray-100">
      <span className="text-[11px] font-medium text-gray-500 flex-shrink-0">Whose:</span>
      <div className="flex-1 min-w-0 overflow-x-auto scrollbar-hide flex items-center gap-1.5">
        {whosePeople.map(p => {
          const on = pickedPeople.has(p.id);
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => togglePerson(p.id)}
              aria-pressed={on}
              title={`${p.name} — ${p.count} meeting${p.count === 1 ? '' : 's'}`}
              className={`flex-shrink-0 inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors ${
                on
                  ? 'bg-brand-secondary text-white border-brand-secondary'
                  : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}
            >
              {p.name}
              <span className={`text-[10px] font-semibold ${on ? 'text-white/80' : 'text-gray-400'}`}>{p.count}</span>
            </button>
          );
        })}
      </div>
      {pickedPeople.size > 0 && (
        <button
          type="button"
          onClick={() => setPickedPeople(new Set())}
          className="flex-shrink-0 text-[11px] font-medium text-gray-500 hover:text-red-500 transition-colors"
        >
          Clear
        </button>
      )}
    </div>
  );

  /* Past six columns they stop being readable at a share of the width, so
     the board scrolls and the hour gutter stays put. */
  const scrolls = columns.length > COLUMNS_BEFORE_SCROLL;
  const columnStyle = scrolls
    ? { flex: `0 0 ${MIN_SCROLL_COLUMN}px`, minWidth: MIN_SCROLL_COLUMN }
    : { flex: '1 1 0%', minWidth: 0 };

  return (
    <div>
      {legend}
      {peopleFilter}

      {/* The rep axis says which day it is about, since the columns no longer
          can and the picker that chose it is a row away. */}
      {axis === 'rep' && theDay && (
        <div className="hidden lg:flex items-center gap-2 px-4 py-2 border-b border-gray-100">
          <p className="text-xs font-semibold text-brand-primary">
            {dayParts(theDay).weekday}, {dayParts(theDay).label}
          </p>
          <p className="text-[11px] text-gray-500">
            · a column each · a meeting shows in every column of a person on it
          </p>
        </div>
      )}

      {/* ── Phone: the columns as buttons, one at a time in a drawer ──
          An hour grid four columns wide is unreadable at 390px, so a phone
          picks a column and gets it in full width. */}
      <div className="lg:hidden p-3 flex flex-col gap-2">
        {axis === 'rep' && theDay && (
          <p className="text-[11px] font-medium text-gray-500 px-1">
            {dayParts(theDay).weekday}, {dayParts(theDay).label} — pick a person
          </p>
        )}
        {columns.map(col => (
          <button
            key={col.key}
            type="button"
            onClick={() => setOpenColumn(col.key)}
            className="w-full flex items-center gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3 text-left hover:border-gray-300 transition-colors"
          >
            <div className="flex-1 min-w-0">
              {axis === 'date' ? (
                <>
                  <p className="text-[11px] font-medium text-gray-500 uppercase tracking-wide">{dayParts(col.day).weekday}</p>
                  <p className="text-sm font-semibold text-brand-primary">{dayParts(col.day).label}</p>
                </>
              ) : (
                <p className="text-sm font-semibold text-brand-primary truncate">{col.longLabel}</p>
              )}
            </div>
            {axis === 'date' && isOutsideConference(col.day, conferenceStart, conferenceEnd) && (
              <span className="text-[10px] font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5">
                Outside
              </span>
            )}
            <span className="text-xs font-semibold text-gray-500">{col.meetings.length}</span>
            <svg className="w-4 h-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        ))}
        {columns.length === 0 && (
          <p className="text-xs text-gray-400 text-center py-6">
            No internal attendees on this conference yet — add them to the conference to draw their days.
          </p>
        )}
      </div>

      {/* ── Desktop: the board ── */}
      <div className={`hidden lg:block p-4 ${scrolls ? 'overflow-x-auto' : ''}`}>
        <div className={scrolls ? 'min-w-max' : ''}>
          <div className="flex">
            <div className="w-16 flex-shrink-0 sticky left-0 bg-white z-10" />
            {columns.map(col => (
              <div key={col.key} className="px-1 pb-2" style={columnStyle}>
                {col.head}
              </div>
            ))}
          </div>

          <div className="flex border-t border-gray-200">
            {/* The hour gutter, pushed down by the untimed band so a label and
                its line are at the same height, and pinned while the board
                scrolls sideways. */}
            <div className="w-16 flex-shrink-0 relative sticky left-0 bg-white z-10" style={{ paddingTop: bandHeight }}>
              <div className="relative" style={{ height: gridHeight }}>
                {hours.map((h, i) => (
                  <span
                    key={h}
                    className="absolute right-2 text-[11px] text-gray-400"
                    style={{ top: i * HOUR_PX - 6 }}
                  >
                    {hourLabel(h)}
                  </span>
                ))}
              </div>
            </div>

            {columns.map(col => (
              <div
                key={col.key}
                className="border-l border-gray-200"
                style={columnStyle}
                data-calendar-column={col.key}
                data-calendar-day={axis === 'date' ? col.day : undefined}
                data-calendar-person={col.personId ?? undefined}
              >
                {columnBody(col, false, bandHeight)}
              </div>
            ))}
            {columns.length === 0 && (
              <p className="flex-1 text-center text-xs text-gray-400 py-10">
                No internal attendees on this conference yet — add them to the conference to draw their days.
              </p>
            )}
          </div>
        </div>
      </div>

      {/* ── One column, on a phone ── */}
      {drawerColumn && isPhone && (
        <ColumnDrawer
          column={drawerColumn}
          columns={columns}
          axis={axis}
          onPick={setOpenColumn}
          onClose={() => setOpenColumn(null)}
          conferenceStart={conferenceStart}
          conferenceEnd={conferenceEnd}
          hours={hours}
          gridHeight={gridHeight}
          hourLabelOf={hourLabel}
          bandHeight={untimedBandHeight([drawerColumn])}
          body={columnBody(drawerColumn, true, untimedBandHeight([drawerColumn]))}
        />
      )}

      {/* ── The meeting, in full ── */}
      {openMeeting && (
        <DetailPopup onClose={closeDetail} locked={detailLocked}>
          {renderDetail(openMeeting)}
        </DetailPopup>
      )}
    </div>
  );
}

/**
 * How tall the untimed band is, across every column.
 *
 * One height for all of them, or the hour lines in a column with two untimed
 * meetings sit lower than the ones beside it and 9 AM is at two different
 * heights across the board. Zero when nothing is untimed, so an ordinary
 * week has no empty strip.
 */
function untimedBandHeight(columns: Array<{ meetings: Meeting[] }>): number {
  const most = columns.reduce(
    (n, col) => Math.max(n, col.meetings.filter(m => !m.meeting_time || hasNoStartTime(m.meeting_time)).length),
    0,
  );
  return most === 0 ? 0 : most * 30 + 12;
}

/** The popup: the meeting's own card, over a scrim. */
function DetailPopup({ children, onClose, locked = false }: {
  children: ReactNode;
  onClose: () => void;
  /** Something inside owns the way out — no scrim click, no close button. */
  locked?: boolean;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); return () => setMounted(false); }, []);
  if (!mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={locked ? undefined : onClose} aria-hidden />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Meeting details"
        className="relative w-full max-w-md max-h-[85vh] overflow-visible rounded-2xl bg-white shadow-2xl border border-gray-200"
      >
        <div className="max-h-[85vh] overflow-y-auto rounded-2xl">
        {/* Outside the card's corner, because the card already has its notes
            button and its kebab there. Gone while something inside owns the
            way out, or there are two X's in one corner saying different
            things. */}
        {!locked && <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute -top-3 -right-3 z-10 w-7 h-7 rounded-full bg-white shadow-md border border-gray-200 text-gray-500 hover:text-gray-800 flex items-center justify-center transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>}
        {children}
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** One column, full width, with the others a tap away. */
function ColumnDrawer({
  column, columns, axis, onPick, onClose, conferenceStart, conferenceEnd,
  hours, gridHeight, hourLabelOf, bandHeight, body,
}: {
  column: Column;
  columns: Column[];
  axis: CalendarAxis;
  onPick: (key: string) => void;
  onClose: () => void;
  conferenceStart: string | null;
  conferenceEnd: string | null;
  hours: number[];
  gridHeight: number;
  hourLabelOf: (hour: number) => string;
  /** The untimed stack's height, which the gutter has to clear. */
  bandHeight: number;
  body: ReactNode;
}) {
  const [mounted, setMounted] = useState(false);
  const activeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => { setMounted(true); return () => setMounted(false); }, []);
  // Keep the open column's button in view as the reader moves along.
  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: 'nearest', inline: 'center' });
  }, [column.key]);
  if (!mounted) return null;

  const parts = dayParts(column.day);
  return createPortal(
    <>
      <div className="fixed inset-0 bg-black/30 z-[110]" onClick={onClose} aria-hidden />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={axis === 'date' ? `Meetings on ${parts.weekday} ${parts.label}` : `${column.longLabel} on ${parts.weekday} ${parts.label}`}
        className="drawer-mobile-responsive fixed inset-x-0 bottom-0 z-[115] h-[82vh] rounded-t-2xl border border-gray-200 bg-white flex flex-col overflow-hidden"
      >
        <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100 flex-shrink-0">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-medium text-gray-500 uppercase tracking-wide">
              {axis === 'date' ? parts.weekday : `${parts.weekday}, ${parts.label}`}
            </p>
            <p className="text-sm font-semibold text-brand-primary truncate">
              {axis === 'date' ? parts.label : column.longLabel}
              {axis === 'date' && isOutsideConference(column.day, conferenceStart, conferenceEnd) && (
                <span className="ml-1.5 align-middle text-[10px] font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-1.5 py-0.5">
                  Outside
                </span>
              )}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex-shrink-0 text-gray-400 hover:text-gray-700 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* The other columns, to move between them without closing. */}
        <div className="flex gap-1.5 px-4 py-2 border-b border-gray-100 overflow-x-auto scrollbar-hide flex-shrink-0">
          {columns.map(c => {
            const on = c.key === column.key;
            return (
              <button
                key={c.key}
                ref={on ? activeRef : undefined}
                type="button"
                onClick={() => onPick(c.key)}
                aria-pressed={on}
                className={`flex-shrink-0 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                  on ? 'bg-brand-secondary text-white border-brand-secondary' : 'bg-white text-gray-600 border-gray-200'}`}
              >
                {c.shortLabel}
              </button>
            );
          })}
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto">
          <div className="flex p-3">
            {/* Padded by the band, so an hour's label and its line are at the
                same height — the untimed stack sits above the grid inside the
                column beside it. */}
            <div className="w-14 flex-shrink-0" style={{ paddingTop: bandHeight }}>
              <div className="relative" style={{ height: gridHeight }}>
                {hours.map((h, i) => (
                  <span key={h} className="absolute right-2 text-[11px] text-gray-400" style={{ top: i * 60 - 6 }}>
                    {hourLabelOf(h)}
                  </span>
                ))}
              </div>
            </div>
            <div className="flex-1 min-w-0 border-l border-gray-200">{body}</div>
          </div>
        </div>
      </div>
    </>,
    document.body,
  );
}
