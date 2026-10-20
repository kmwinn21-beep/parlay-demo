'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { formatMeetingTime, hasNoStartTime, timeToMinutes, unscheduledLabel } from '@/lib/meetingTime';
import { getValuePreset, type ColorMap } from '@/lib/colors';
import {
  SLOT_MINUTES, calendarDays, calendarPeople, cardMinutes, companyTypeOf, companyTypesPresent,
  conferencePeople, defaultCalendarDay, durationSuffix, hourWindow, isOutsideConference,
  conferenceIsRunning, isPastMeeting, layoutDay, matchesCompanyTypes, matchesDays,
  matchesPeople, meetingsOfPerson, meetingsWithoutColumn, openSlots, sharedMeetingIds,
  type CalendarMeeting,
} from '@/lib/meetingCalendar';
import { minutesToTime, slotLabel } from '@/lib/availability';
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

/**
 * How far down the page something has to pin to clear the tab row.
 *
 * Measured rather than written down: the tabs wrap to two lines on a narrow
 * desktop window, and a constant would leave the headings either floating in
 * a gap or half under the tabs. Zero where there is no tab row — the drawer,
 * and anywhere else the board is embedded — which pins the headings to the
 * top of the viewport, the right answer when nothing is above them.
 */
function useStickyTop(): number {
  const [top, setTop] = useState(0);
  useEffect(() => {
    const tabs = document.querySelector<HTMLElement>('[data-sticky-tabs]');
    if (!tabs) return;
    const measure = () => setTop(tabs.getBoundingClientRect().height);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(tabs);
    window.addEventListener('resize', measure);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, []);
  return top;
}

/**
 * The time, to the minute, for as long as this is on screen.
 *
 * A conference board is left open for an hour at a time, and what has passed
 * is the thing that changes while nobody touches it. A minute is as fine as
 * the grid can show.
 */
function useNowMinutes(): { today: string; minutes: number } {
  const read = () => {
    const d = new Date();
    return {
      today: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
      minutes: d.getHours() * 60 + d.getMinutes(),
    };
  };
  const [now, setNow] = useState(read);
  useEffect(() => {
    const id = setInterval(() => setNow(read()), 60_000);
    return () => clearInterval(id);
  }, []);
  return now;
}

/**
 * The top padding of the box this scrolls inside.
 *
 * A sticky `top: 0` stops at the scrollport's CONTENT edge, not its padding
 * edge, so a scroller with padding leaves exactly that much of a gap above a
 * pinned heading — and the cards passing behind it show through it. The phone
 * drawer's body has 12px of it; <main> has 16, or 24 from lg.
 *
 * Measured rather than named, because the padding belongs to the page that
 * happens to be scrolling this and a constant here would go quietly wrong the
 * day it changes.
 */
function useScrollerPaddingTop(ref: React.RefObject<HTMLElement | null>): number {
  const [pad, setPad] = useState(0);
  useEffect(() => {
    const measure = () => {
      for (let el = ref.current?.parentElement ?? null; el; el = el.parentElement) {
        const style = getComputedStyle(el);
        if (style.overflowY === 'auto' || style.overflowY === 'scroll') {
          setPad(parseFloat(style.paddingTop) || 0);
          return;
        }
      }
      setPad(0);
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [ref]);
  return pad;
}

/** '7 AM', '12 PM' — the gutter's labels. */
function hourLabel(hour: number): string {
  const h = hour % 24;
  const period = h >= 12 ? 'PM' : 'AM';
  return `${h % 12 || 12} ${period}`;
}

/**
 * What a meeting with no company type wears.
 *
 * Dashed and plain rather than grey-filled: grey is a colour an admin can
 * choose — Other wears it out of the box — and a company nobody has typed
 * should not be able to pass for one that was typed as nothing. The dashes
 * are also a nudge, since the fix is a field on the company record.
 */
const UNTYPED_CLASS = 'bg-white text-gray-600 border border-dashed border-gray-400';

/**
 * The three key rows, which are also the filters.
 *
 * A phone puts the label above what it labels, as an eyebrow: at 390px
 * "Company type:" and the first swatch took the width between them and the
 * rest of the row was off screen. From lg the label leads the line, which is
 * what there is room for and what the rest of the app does.
 */
const KEY_ROW = 'flex flex-col gap-1.5 px-4 py-2.5 border-b border-gray-100 '
  + 'lg:flex-row lg:items-center lg:gap-2';
const KEY_LABEL = 'flex-shrink-0 text-[10px] font-semibold uppercase tracking-wide text-gray-500 '
  + 'lg:text-[11px] lg:font-medium lg:normal-case lg:tracking-normal';

/** A neutral fill for the legend's conflict swatch, which has no value. */
const NEUTRAL_CLASS = 'bg-brand-secondary/10 text-brand-primary border border-brand-secondary/30';

/**
 * The colour a card wears: its company's type, from the config's own colours.
 *
 * A calendar is scanned rather than read, and what kind of company it is
 * answers the question a week of meetings is laid out to ask — am I spending
 * this conference on operators or on capital. It is also the one fact a card
 * has exactly one of: a meeting has one company, so the fill never has to
 * choose between two people on it the way colouring by rep would.
 *
 * The badge class, which means a card and the type badge on the company's own
 * record are the same colour without either being told about the other.
 */
function companyTypeClass(type: string | null, colorMap: ColorMap): string {
  if (type == null) return UNTYPED_CLASS;
  return getValuePreset(type, colorMap).badgeClass;
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
  /**
   * Whether an empty half hour here can be booked into.
   *
   * Every column but one: "Nobody attending" is not a diary, so a free half
   * hour in it is not a place to put a meeting.
   */
  offersSlots: boolean;
  head: ReactNode;
  /** What the phone's list and the drawer's chips call it. */
  shortLabel: string;
  longLabel: string;
}

/** A free half hour, handed back to whatever opens the meeting form. */
export interface CalendarSlotPick {
  day: string;
  /** 'HH:MM'. */
  time: string;
  /** The column's person on the rep axis; null on the date axis. */
  personId: number | null;
}

export function MeetingsCalendar({
  meetings, conferenceStart, conferenceEnd, userOptions, colorMap, renderDetail,
  companyTypeOptions = [], companyTypeColorMap = {},
  axis = 'date', internalAttendees = null, repDay = null, dimDays = [], layout = 'auto',
  closeSignal = 0, detailLocked = false, onDetailClose, onPickSlot,
}: {
  meetings: Meeting[];
  conferenceStart: string | null;
  conferenceEnd: string | null;
  userOptions: Array<{ id: number; value: string }>;
  /** The action colours, for the outcome mark and the key beside it. */
  colorMap: ColorMap;
  /** The configured company types, in their order — the key reads in it. */
  companyTypeOptions?: string[];
  /** The company-type colours: what fills a card. */
  companyTypeColorMap?: ColorMap;
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
   * Which of the two shapes to draw.
   *
   * 'auto' is the page's: a grid of columns from lg, the stack below it.
   * 'stack' forces the stack at every width, for the places this is drawn
   * inside something narrow — a 560px drawer is a phone's width whatever the
   * window around it is doing, and four day columns in it are unreadable.
   */
  layout?: 'auto' | 'stack';
  /**
   * The days the picker above has lit, if any.
   *
   * These dim the rest of the board rather than removing it — see matchesDays.
   * Empty means every day reads normally, which is also what the rep axis
   * passes, since there the picked day is the one column set being drawn.
   */
  dimDays?: string[];
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
  /**
   * An empty half hour was clicked — open the meeting form on it.
   *
   * Left out where the conference's stage does not allow logging a meeting,
   * and the board then draws no slots at all rather than offering a button
   * whose form refuses it.
   */
  onPickSlot?: (slot: CalendarSlotPick) => void;
}) {
  const stickyTop = useStickyTop();
  const now = useNowMinutes();
  const phoneStackRef = useRef<HTMLDivElement>(null);
  const scrollerPad = useScrollerPaddingTop(phoneStackRef);
  /*
   * Where a phone's day headings stop.
   *
   * Under the tab row where there is one — the same place the desktop's stop.
   * In the tab drawer there is none, and the headings stop flush against the
   * top of the scrolling area instead, which is what the padding is subtracted
   * for: at 0 they stopped 12px lower and the cards showed through the strip.
   */
  const phoneHeadTop = stickyTop > 0 ? stickyTop : -scrollerPad;
  const [openId, setOpenId] = useState<number | null>(null);
  const [pickedPeople, setPickedPeople] = useState<Set<number>>(new Set());
  /** Types picked off the key. Null in the set is "No type set". */
  const [pickedTypes, setPickedTypes] = useState<Set<string | null>>(new Set());
  /** The shared meeting being pointed at, if any — see `sharedIds` below. */
  const [tracedId, setTracedId] = useState<number | null>(null);
  /**
   * The empty half hour a phone has tapped, if any.
   *
   * A pointer reveals the + Meeting outline by hovering it; a finger has no
   * hover, and a board where every empty half hour books a meeting the moment
   * it is brushed is a board nobody can scroll. So the first tap shows the
   * outline — one at a time — and the second takes it.
   */
  const [revealedSlot, setRevealedSlot] = useState<string | null>(null);

  const days = useMemo(
    () => calendarDays(conferenceStart, conferenceEnd, meetings),
    [conferenceStart, conferenceEnd, meetings],
  );
  const { startHour, endHour } = useMemo(() => hourWindow(meetings as CalendarMeeting[]), [meetings]);
  const whosePeople = useMemo(
    () => calendarPeople(meetings as CalendarMeeting[], userOptions),
    [meetings, userOptions],
  );
  const typeTallies = useMemo(
    () => companyTypesPresent(meetings as CalendarMeeting[], companyTypeOptions),
    [meetings, companyTypeOptions],
  );
  /** The outcomes on this board, in the order the key should read them. */
  const outcomesPresent = useMemo(
    () => Array.from(new Set(meetings.map(m => m.outcome).filter((o): o is string => !!o))).slice(0, 6),
    [meetings],
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
          offersSlots: true,
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
        offersSlots: true,
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
      offersSlots: false,
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
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [openId, detailLocked, closeDetail]);

  useEffect(() => {
    if (closeSignal === 0) return;
    setOpenId(null);
  }, [closeSignal]);

  const togglePerson = (id: number) => setPickedPeople(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const toggleType = (value: string | null) => setPickedTypes(prev => {
    const next = new Set(prev);
    if (next.has(value)) next.delete(value); else next.add(value);
    return next;
  });

  // Nothing to trace or reveal once the columns change under the pointer.
  useEffect(() => { setTracedId(null); setRevealedSlot(null); }, [axis, theDay]);

  /**
   * Dimmed, not hidden: the board keeps its shape while one thing stands out.
   *
   * Four reasons to dim. The day filters pick days, which here light a day
   * rather than empty the week. The key picks company types. The Whose row
   * picks people, on the date axis. And pointing at a meeting that is in
   * several columns leaves its own copies lit and dims the rest, so where it
   * appears can be seen at a glance rather than read out of four columns of
   * company names.
   */
  const dimmed = (m: Meeting) =>
    !matchesDays(m as CalendarMeeting, dimDays)
    || !matchesCompanyTypes(m as CalendarMeeting, pickedTypes)
    || !matchesPeople(m as CalendarMeeting, pickedPeople)
    || (tracedId != null && m.id !== tracedId);

  /**
   * And a lighter fade for what has already happened.
   *
   * Only while the conference is actually on, which is the only time it says
   * anything: before it starts nothing has passed, and after it ends
   * everything has, which would dim the whole board to no purpose.
   *
   * Lighter than a filter's dim on purpose. A filtered-out meeting is one you
   * asked not to see; a meeting at nine this morning is one you were at. They
   * are different statements and the board should not make them in the same
   * voice — so this one is still legible at a glance, and a card that is both
   * takes the filter's, which is the stronger claim.
   */
  const running = conferenceIsRunning(conferenceStart, conferenceEnd, now.today);
  const past = (m: Meeting) =>
    running && isPastMeeting(m as CalendarMeeting, now.today, now.minutes);

  /**
   * A day the picker has not lit.
   *
   * The meetings in it dim, and so does its heading — a dimmed column under a
   * heading in full strength reads as a rendering fault rather than as a
   * filter, and the heading is the part that says which day it is.
   */
  const dayDimmed = (day: string) => dimDays.length > 0 && !dimDays.includes(day);

  const card = (m: Meeting, opts: { style?: React.CSSProperties; compact?: boolean; conflict?: boolean } = {}) => {
    const type = companyTypeOf(m as CalendarMeeting);
    const tint = companyTypeClass(type, companyTypeColorMap);
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
        data-past={past(m) ? 'true' : undefined}
        title={`${name}${type ? ` — ${type}` : ''}${m.outcome ? ` — ${m.outcome}` : ''}${
          past(m) ? ' — already started' : ''}${
          opts.conflict ? ' — conflict' : ''}${
          unscheduled ? ` — ${unscheduled}` : m.meeting_time ? ` — ${formatMeetingTime(m.meeting_time)}` : ''}${
          sharedIds.has(m.id) ? ' — on more than one column' : ''}`}
        className={`relative block w-full text-left overflow-hidden rounded-md px-1.5 py-1 transition-opacity ${tint} ${
          opts.conflict ? 'ring-2 ring-red-600' : ''} ${
          dimmed(m) ? 'opacity-25' : past(m) ? 'opacity-60 hover:opacity-100' : 'opacity-100 hover:brightness-95'}`}
      >
        {/* The outcome, which no longer has the fill.
            A dot rather than a tick and a cross, because outcomes are
            configured: a tenant can have five, and only two of them are ever
            "it went well" and "it did not". It takes its colour from the same
            table the outcome pill does, and a meeting with nothing recorded
            yet — most of them, most of the time — carries no dot at all,
            which is the quietest thing the commonest state can look like. */}
        {m.outcome && (
          <span
            className="absolute top-1 right-1 w-2 h-2 rounded-full ring-1 ring-white/90"
            style={{ backgroundColor: getValuePreset(m.outcome, colorMap).hex }}
            aria-hidden
          />
        )}
        {/* The length rides the name's line rather than taking one of its
            own: a quarter-hour card is drawn at half-hour height, which is
            28px, and two lines do not fit in it. The name truncates, the
            length does not — it is the shorter and the more surprising. */}
        <span className={`flex items-baseline gap-1 min-w-0 ${m.outcome ? 'pr-2.5' : ''}`}>
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

          {/*
            The empty half hours, as somewhere to click.

            Invisible until pointed at, because a board showing twenty dashed
            outlines is a board of buttons with some meetings in it. Drawn
            before the cards so the cards sit over them — though none of these
            overlaps one: openSlots leaves out any half hour a card is drawn
            in, so the outline never appears under a meeting, where clicking
            it would mean double-booking.

            Phone only draws the day drawer, where a long press competes with
            scrolling and there is no hover to reveal anything; the + Meeting
            button above the list is already a tap away there.
          */}
          {col.offersSlots && onPickSlot
            && openSlots(col.meetings as CalendarMeeting[], startHour, endHour).map(start => {
              const slotKey = `${col.key}-${start}`;
              const revealed = revealedSlot === slotKey;
              return (
              <button
                key={start}
                type="button"
                onClick={() => {
                  // A finger asks to see it first, then asks for it.
                  if (phone && !revealed) { setRevealedSlot(slotKey); return; }
                  onPickSlot({ day: col.day, time: minutesToTime(start), personId: col.personId });
                }}
                aria-label={phone && !revealed
                  ? `Book this half hour, ${slotLabel(start, start + SLOT_MINUTES)}`
                  : `Schedule a meeting, ${slotLabel(start, start + SLOT_MINUTES)}`}
                title={`Schedule a meeting · ${slotLabel(start, start + SLOT_MINUTES)}`}
                data-calendar-slot={slotKey}
                className={`absolute inset-x-0 flex items-center px-0.5 py-px transition-opacity ${
                  phone
                    ? (revealed ? 'opacity-100' : 'opacity-0')
                    : 'opacity-0 hover:opacity-100 focus-visible:opacity-100'}`}
                style={{
                  top: (start - startHour * 60) * PX_PER_MINUTE,
                  height: SLOT_MINUTES * PX_PER_MINUTE,
                }}
              >
                {/* The width of a card, because that is what it would become
                    — a pill in the middle of the column points at a slot the
                    size of a pill, and the half hour is the whole column. */}
                <span className="pointer-events-none flex h-full w-full items-center justify-center truncate rounded-md border border-dashed border-gray-400 bg-white/70 px-2 text-[10px] font-medium text-gray-500">
                  + Meeting
                </span>
              </button>
              );
            })}

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

  /*
   * The key to the fill, which is also a filter.
   *
   * Every swatch is a button: a key that tells you teal means OpCo and then
   * leaves you to find the OpCos is half an answer, and the dimming already
   * exists for the Whose row. Picking "No type set" is the useful edge of it —
   * the companies somebody has to go and type.
   *
   * Only the types this conference actually uses, so a tenant with fourteen
   * configured types gets the four that are in the room.
   */
  const typeKey = typeTallies.length > 0 && (
    <div className={`${KEY_ROW} bg-gray-50/60`}>
      <span className={KEY_LABEL}>Type</span>
      <div className="flex-1 min-w-0 overflow-x-auto scrollbar-hide flex items-center gap-1.5">
        {typeTallies.map(t => {
          const on = pickedTypes.has(t.value);
          const label = t.value ?? 'No type set';
          return (
            <button
              key={label}
              type="button"
              onClick={() => toggleType(t.value)}
              aria-pressed={on}
              title={`${label} — ${t.count} meeting${t.count === 1 ? '' : 's'}`}
              className={`flex-shrink-0 inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors ${
                on
                  ? 'bg-brand-secondary text-white border-brand-secondary'
                  : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}
            >
              {/* The swatch stays its own colour on a picked button: it is
                  what the cards are wearing, and a key whose swatch changes
                  colour when clicked has stopped being a key. */}
              <span className={`w-2.5 h-2.5 rounded-sm ${companyTypeClass(t.value, companyTypeColorMap)}`} />
              {label}
              <span className={`text-[10px] font-semibold ${on ? 'text-white/80' : 'text-gray-400'}`}>{t.count}</span>
            </button>
          );
        })}
      </div>
      {pickedTypes.size > 0 && (
        <button
          type="button"
          onClick={() => setPickedTypes(new Set())}
          className="flex-shrink-0 text-[11px] font-medium text-gray-500 hover:text-red-500 transition-colors"
        >
          Clear
        </button>
      )}
    </div>
  );

  /*
   * The outcome, which the fill no longer carries.
   *
   * Only once anything has been recorded: on the Monday of a conference every
   * meeting is still to happen, and a key to marks that are nowhere on the
   * board is a row of noise.
   */
  const outcomeKey = (outcomesPresent.length > 0 || axis === 'rep') && (
    <div className={KEY_ROW}>
      {outcomesPresent.length > 0 && (
        <>
          <span className={KEY_LABEL}>Outcome</span>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
          {outcomesPresent.map(outcome => (
            <span key={outcome} className="inline-flex items-center gap-1.5 text-[11px] font-medium text-gray-600">
              <span
                className="w-2 h-2 rounded-full ring-1 ring-gray-300"
                style={{ backgroundColor: getValuePreset(outcome, colorMap).hex }}
              />
              {outcome}
            </span>
          ))}
          <span className="text-[11px] text-gray-400">no dot · nothing recorded yet</span>
          </div>
        </>
      )}
      {/* Only where it can happen: on the date axis two cards side by side
          are two different people, and nothing is wrong. */}
      {axis === 'rep' && (
        <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-gray-600">
          <span className={`w-2.5 h-2.5 rounded-sm ring-2 ring-red-600 ${NEUTRAL_CLASS}`} />
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
    <div className={KEY_ROW}>
      <span className={KEY_LABEL}>Rep</span>
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
      {typeKey}
      {outcomeKey}
      {peopleFilter}

      {/* The rep axis says which day it is about, since the columns no longer
          can and the picker that chose it is a row away. */}
      {axis === 'rep' && theDay && (
        <div className="hidden lg:flex items-center gap-2 px-4 py-2 border-b border-gray-100">
          <p className="text-xs font-semibold text-brand-primary">
            {dayParts(theDay).weekday}, {dayParts(theDay).label}
          </p>
        </div>
      )}

      {/* ── Phone: one column, run end to end ──

          An hour grid four columns wide is unreadable at 390px, so a phone
          gets them stacked: Tuesday's grid, then Wednesday's, in one scroll.
          Each heading pins to the top while its own day runs under it and is
          pushed off by the next one, so the day a card belongs to is never
          more than a glance away — which a board of four taps-to-open could
          not say at all.

          The rep axis stacks the same way: one day, a section per person,
          and the name pins instead of the date. */}
      <div className={layout === 'stack' ? '' : 'lg:hidden'} ref={phoneStackRef}>
        {axis === 'rep' && theDay && (
          <p className="text-[11px] font-medium text-gray-500 px-4 py-2 border-b border-gray-100">
            {dayParts(theDay).weekday}, {dayParts(theDay).label}
          </p>
        )}
        {columns.map(col => {
          const band = untimedBandHeight([col]);
          return (
            <section key={col.key} data-calendar-section={col.key}>
              <div
                className={`sticky z-10 flex items-center gap-2 border-y border-gray-100 bg-gray-50/95 px-4 py-2 backdrop-blur-sm transition-opacity ${
                  axis === 'date' && dayDimmed(col.day) ? 'opacity-60' : ''}`}
                style={{ top: phoneHeadTop }}
              >
                <p className="text-sm font-semibold text-brand-primary truncate">
                  {col.longLabel}
                </p>
                {axis === 'date' && isOutsideConference(col.day, conferenceStart, conferenceEnd) && (
                  <span className="flex-shrink-0 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-700">
                    Outside
                  </span>
                )}
                <span className="ml-auto flex-shrink-0 text-[11px] font-semibold text-gray-500">
                  {col.meetings.length === 0 ? 'Nothing booked' : col.meetings.length}
                </span>
              </div>
              <div className="flex px-3 py-2">
                {/* Padded by the band so an hour's label and its line are at
                    the same height — the untimed stack sits above the grid
                    inside the column beside it. */}
                <div className="w-14 flex-shrink-0" style={{ paddingTop: band }}>
                  <div className="relative" style={{ height: gridHeight }}>
                    {hours.map((h, i) => (
                      <span key={h} className="absolute right-2 text-[11px] text-gray-400" style={{ top: i * HOUR_PX - 6 }}>
                        {hourLabel(h)}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="flex-1 min-w-0 border-l border-gray-200">
                  {columnBody(col, true, band)}
                </div>
              </div>
            </section>
          );
        })}
        {columns.length === 0 && (
          <p className="text-xs text-gray-400 text-center py-6">
            No internal attendees on this conference yet — add them to the conference to draw their days.
          </p>
        )}
      </div>

      {/* ── Desktop: the board ── */}
      <div className={`${layout === 'stack' ? 'hidden' : 'hidden lg:block'} p-4 ${scrolls ? 'overflow-x-auto' : ''}`}>
        <div className={scrolls ? 'min-w-max' : ''}>
          {/*
            The headings stay put while the day scrolls under them.

            A board is ten hours tall and a conference day is read from the
            bottom as often as from the top, where a column of company names
            with nothing saying whose column it is means re-scrolling to find
            out. Pinned under the tab row rather than over it, and below it in
            the stack — the tabs are z-20 — so the two rows read as one header
            rather than as two things fighting for the same pixels.

            White, because the cards pass behind it. Above them, and above the
            hour gutter's z-10, because the labels and the cards would
            otherwise both pass over it; below the tabs' z-20, because it
            belongs under them.

            One caveat: past six columns the board scrolls sideways, and the
            ancestor that does that is also what a sticky top would measure
            against, so on those boards the headings scroll away as they did
            before. The gutter's sticky left is the same trade in reverse.
          */}
          <div
            className="flex sticky z-[15] bg-white border-b border-gray-200"
            style={{ top: stickyTop }}
          >
            <div className="w-16 flex-shrink-0 sticky left-0 bg-white" />
            {columns.map(col => (
              <div
                key={col.key}
                className={`px-1 pt-1 pb-2 transition-opacity ${
                  axis === 'date' && dayDimmed(col.day) ? 'opacity-40' : ''}`}
                style={columnStyle}
              >
                {col.head}
              </div>
            ))}
          </div>

          <div className="flex">
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
        /*
         * As wide as the same card is in the dashboard's meetings drawer,
         * which is the size people read it at everywhere else: that drawer is
         * 560px with 16px of padding either side, so the card's own box is
         * 528 — plus this frame's two 1px borders. At max-w-md it was 446,
         * and a card holding a name, a title, a time, a place and six pills
         * spent the difference on wrapping.
         */
        className="relative w-full max-w-[530px] max-h-[85vh] overflow-visible rounded-2xl bg-white shadow-2xl border border-gray-200"
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
