'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { formatMeetingTime, unscheduledLabel } from '@/lib/meetingTime';
import { useIsPhone } from '@/lib/useIsPhone';
import { getPreset, type ColorMap } from '@/lib/colors';
import {
  calendarDays, calendarPeople, cardMinutes, durationSuffix, hourWindow,
  isOutsideConference, layoutDay, matchesPeople, timedOn, untimedOn,
  type CalendarMeeting,
} from '@/lib/meetingCalendar';
import type { Meeting } from '@/components/MeetingsTable';

/**
 * The conference's meetings as a week, beside the table and the kanban.
 *
 * The other two views answer "what is booked"; this one answers "what does
 * Tuesday look like" — which is the question a rep standing at a conference
 * is actually asking, and the one a list of thirty rows answers badly.
 *
 * Everything with edges is in lib/meetingCalendar: which days show, which
 * hours, where a card sits, how two meetings at nine o'clock divide the
 * column, and who is on what. This file is the drawing.
 */

/** A pixel per minute would be a six-hundred-pixel morning. */
const PX_PER_MINUTE = 60 / 60; // 60px to the hour
const HOUR_PX = 60;

/** 'YYYY-MM-DD' → { weekday: 'Tue', label: 'Oct 20' }. */
function dayParts(day: string): { weekday: string; label: string; short: string } {
  const d = new Date(`${day}T00:00:00`);
  return {
    weekday: d.toLocaleDateString('en-US', { weekday: 'short' }),
    label: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    short: `${d.getMonth() + 1}/${String(d.getDate()).padStart(2, '0')}`,
  };
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

export function MeetingsCalendar({
  meetings, conferenceStart, conferenceEnd, userOptions, colorMap, renderDetail,
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
  const [openDay, setOpenDay] = useState<string | null>(null);

  const days = useMemo(
    () => calendarDays(conferenceStart, conferenceEnd, meetings),
    [conferenceStart, conferenceEnd, meetings],
  );
  const { startHour, endHour } = useMemo(() => hourWindow(meetings as CalendarMeeting[]), [meetings]);
  const people = useMemo(() => calendarPeople(meetings as CalendarMeeting[], userOptions), [meetings, userOptions]);
  const hours = useMemo(
    () => Array.from({ length: Math.max(1, endHour - startHour) }, (_, i) => startHour + i),
    [startHour, endHour],
  );
  const gridHeight = hours.length * HOUR_PX;
  const bandHeight = useMemo(() => untimedBandHeight(meetings, days), [meetings, days]);

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
      else if (openDay != null) setOpenDay(null);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [openId, openDay, detailLocked, closeDetail]);

  useEffect(() => {
    if (closeSignal === 0) return;
    setOpenId(null);
    // On a phone the day drawer is above those layers too.
    if (isPhone) setOpenDay(null);
    // isPhone is read, not depended on: the signal is the event.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [closeSignal]);

  const togglePerson = (id: number) => setPickedPeople(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  /** Dimmed, not hidden: the week keeps its shape while one person's stands out. */
  const dimmed = (m: Meeting) => !matchesPeople(m as CalendarMeeting, pickedPeople);

  const card = (m: Meeting, opts: { style?: React.CSSProperties; compact?: boolean } = {}) => {
    const tint = outcomeClass(m.outcome, colorMap);
    const suffix = durationSuffix(m.duration_minutes);
    const unscheduled = unscheduledLabel(m.meeting_time);
    return (
      <button
        key={m.id}
        type="button"
        onClick={() => setOpenId(m.id)}
        style={opts.style}
        title={`${m.company_name ?? `${m.first_name} ${m.last_name}`.trim()}${unscheduled ? ` — ${unscheduled}` : m.meeting_time ? ` — ${formatMeetingTime(m.meeting_time)}` : ''}`}
        className={`block w-full text-left overflow-hidden rounded-md px-1.5 py-1 transition-opacity ${tint} ${
          dimmed(m) ? 'opacity-25' : 'opacity-100 hover:brightness-95'}`}
      >
        {/* The length rides the name's line rather than taking one of its
            own: a quarter-hour card is drawn at half-hour height, which is
            28px, and two lines do not fit in it. The name truncates, the
            length does not — it is the shorter and the more surprising. */}
        <span className="flex items-baseline gap-1 min-w-0">
          <span className="text-[11px] font-semibold leading-tight truncate">
            {m.company_name || `${m.first_name} ${m.last_name}`.trim() || 'Meeting'}
          </span>
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

  /** One day's column: the untimed stack, then the hours. */
  const dayColumn = (day: string, phone: boolean, bandHeight: number) => {
    const untimed = untimedOn(meetings as CalendarMeeting[], day) as Meeting[];
    const placed = layoutDay(timedOn(meetings as CalendarMeeting[], day) as Meeting[], startHour);
    return (
      <>
        {/* The band is the same height in every column, filled or empty, or
            the hour lines in a day with two untimed meetings would sit lower
            than the ones beside it and 9 AM would be at two heights. */}
        {bandHeight > 0 && (
          <div
            className="flex flex-col gap-1 p-1.5 border-b border-gray-100 bg-gray-50/40"
            style={{ height: bandHeight }}
            data-untimed-for={day}
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
                {card(p.meeting, { style: { height: '100%' }, compact: phone || p.columns > 1 })}
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
    </div>
  );

  /*
   * Whose meetings to light up.
   *
   * Everyone on at least one of these meetings, reps and the internal people
   * added through Additional Attendees alike — picking one dims everything
   * they are not on, so their day stands out of a full week. Nobody picked
   * lights everything; several picked light a meeting any of them is on.
   */
  const peopleFilter = people.length > 0 && (
    <div className="flex items-center gap-2 px-4 py-2.5 border-b border-gray-100">
      <span className="text-[11px] font-medium text-gray-500 flex-shrink-0">Whose:</span>
      <div className="flex-1 min-w-0 overflow-x-auto scrollbar-hide flex items-center gap-1.5">
        {people.map(p => {
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

  return (
    <div>
      {legend}
      {peopleFilter}

      {/* ── Phone: the days as buttons, one day at a time in a drawer ──
          An hour grid four columns wide is unreadable at 390px, so a phone
          picks a day and gets that day in full width. */}
      <div className="lg:hidden p-3 flex flex-col gap-2">
        {days.map(day => {
          const parts = dayParts(day);
          const count = meetings.filter(m => m.meeting_date === day).length;
          return (
            <button
              key={day}
              type="button"
              onClick={() => setOpenDay(day)}
              className="w-full flex items-center gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3 text-left hover:border-gray-300 transition-colors"
            >
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-medium text-gray-500 uppercase tracking-wide">{parts.weekday}</p>
                <p className="text-sm font-semibold text-brand-primary">{parts.label}</p>
              </div>
              {isOutsideConference(day, conferenceStart, conferenceEnd) && (
                <span className="text-[10px] font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5">
                  Outside
                </span>
              )}
              <span className="text-xs font-semibold text-gray-500">{count}</span>
              <svg className="w-4 h-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          );
        })}
      </div>

      {/* ── Desktop: the week ── */}
      <div className="hidden lg:block p-4">
        <div className="flex">
          <div className="w-16 flex-shrink-0" />
          {days.map(day => {
            const parts = dayParts(day);
            const outside = isOutsideConference(day, conferenceStart, conferenceEnd);
            return (
              <div key={day} className="flex-1 min-w-0 px-1 pb-2">
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
              </div>
            );
          })}
        </div>

        <div className="flex border-t border-gray-200">
          {/* The hour gutter, pushed down by the untimed band so a label and
              its line are at the same height. */}
          <div className="w-16 flex-shrink-0 relative" style={{ paddingTop: bandHeight }}>
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

          {days.map(day => (
            <div key={day} className="flex-1 min-w-0 border-l border-gray-200" data-calendar-day={day}>
              {dayColumn(day, false, bandHeight)}
            </div>
          ))}
        </div>
      </div>

      {/* ── The day drawer, on a phone ── */}
      {openDay && isPhone && (
        <DayDrawer
          day={openDay}
          days={days}
          onPick={setOpenDay}
          onClose={() => setOpenDay(null)}
          conferenceStart={conferenceStart}
          conferenceEnd={conferenceEnd}
          hours={hours}
          gridHeight={gridHeight}
          hourLabelOf={hourLabel}
          bandHeight={phoneBandHeight(meetings, openDay)}
          body={dayColumn(openDay, true, phoneBandHeight(meetings, openDay))}
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
 * How tall the untimed band is, across every day.
 *
 * One height for all of them, or the hour lines in a day with two untimed
 * meetings sit lower than the ones beside it and 9 AM is at two different
 * heights across the week. Zero when nothing is untimed, so an ordinary week
 * has no empty strip.
 */
function untimedBandHeight(meetings: Meeting[], days: string[]): number {
  const most = days.reduce(
    (n, day) => Math.max(n, untimedOn(meetings as CalendarMeeting[], day).length),
    0,
  );
  return most === 0 ? 0 : most * 30 + 12;
}

/** The same, for the one day the phone's drawer is showing. */
function phoneBandHeight(meetings: Meeting[], day: string): number {
  return untimedBandHeight(meetings, [day]);
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

/** One day, full width, with the other days a tap away. */
function DayDrawer({
  day, days, onPick, onClose, conferenceStart, conferenceEnd, hours, gridHeight, hourLabelOf, bandHeight, body,
}: {
  day: string;
  days: string[];
  onPick: (day: string) => void;
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
  // Keep the open day's button in view as the reader moves along the week.
  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: 'nearest', inline: 'center' });
  }, [day]);
  if (!mounted) return null;

  const parts = dayParts(day);
  return createPortal(
    <>
      <div className="fixed inset-0 bg-black/30 z-[110]" onClick={onClose} aria-hidden />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Meetings on ${parts.weekday} ${parts.label}`}
        className="drawer-mobile-responsive fixed inset-x-0 bottom-0 z-[115] h-[82vh] rounded-t-2xl border border-gray-200 bg-white flex flex-col overflow-hidden"
      >
        <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100 flex-shrink-0">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-medium text-gray-500 uppercase tracking-wide">{parts.weekday}</p>
            <p className="text-sm font-semibold text-brand-primary truncate">
              {parts.label}
              {isOutsideConference(day, conferenceStart, conferenceEnd) && (
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

        {/* The days, to move between them without closing the drawer. */}
        <div className="flex gap-1.5 px-4 py-2 border-b border-gray-100 overflow-x-auto scrollbar-hide flex-shrink-0">
          {days.map(d => {
            const p = dayParts(d);
            const on = d === day;
            return (
              <button
                key={d}
                ref={on ? activeRef : undefined}
                type="button"
                onClick={() => onPick(d)}
                aria-pressed={on}
                className={`flex-shrink-0 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                  on ? 'bg-brand-secondary text-white border-brand-secondary' : 'bg-white text-gray-600 border-gray-200'}`}
              >
                {p.weekday} {p.short}
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
