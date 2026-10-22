'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/** "Monday, Aug 17" */
function longLabel(d: string) {
  return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
}

/** 1st, 2nd, 3rd, 4th — 11th through 13th are the exceptions. */
function ordinal(day: number): string {
  if (day % 100 >= 11 && day % 100 <= 13) return `${day}th`;
  return `${day}${['th', 'st', 'nd', 'rd'][day % 10] ?? 'th'}`;
}

/** "Wednesday, October 21st" — the whole date, spelled out. */
export function spelledLabel(d: string): string {
  const dt = new Date(d + 'T00:00:00');
  const weekday = dt.toLocaleDateString('en-US', { weekday: 'long' });
  const month = dt.toLocaleDateString('en-US', { month: 'long' });
  return `${weekday}, ${month} ${ordinal(dt.getDate())}`;
}

/** "Mon, 8/17" */
function shortLabel(d: string) {
  const dt = new Date(d + 'T00:00:00');
  const day = dt.toLocaleDateString('en-US', { weekday: 'short' });
  return `${day}, ${dt.getMonth() + 1}/${dt.getDate()}`;
}

/**
 * One button per conference day. Clicking filters the list to that day;
 * clicking the active day clears it. The row never wraps — it scrolls, with
 * chevrons appearing on either side once there is somewhere to scroll to.
 */
export function MeetingDateFilterBar({
  dates, selected, onChange, variant = 'long', centered = false,
  showBoothHours = false, boothHoursOnly = false, onBoothHoursChange,
}: {
  dates: string[];
  /** Dates currently filtered on — a button is active when its date is in here. */
  selected: string[];
  onChange: (dates: string[]) => void;
  /** 'long' = "Monday, Aug 17" (desktop), 'short' = "Mon, 8.17" (mobile). */
  variant?: 'long' | 'short';
  /**
   * Sit the days in the middle of the row rather than against its left edge.
   *
   * For the calendar, where the row reads as the board's own header: three
   * chips hard against the left of a wide board look like something that
   * failed to load. Only while they fit — a row with more days than width
   * scrolls, and centering a scroller hides its first day.
   */
  centered?: boolean;
  /** Offered only when the conference actually has booth-hours meetings. */
  showBoothHours?: boolean;
  boothHoursOnly?: boolean;
  onBoothHoursChange?: (next: boolean) => void;
}) {
  const rowRef = useRef<HTMLDivElement>(null);
  const [canLeft, setCanLeft] = useState(false);
  const [canRight, setCanRight] = useState(false);

  const updateArrows = useCallback(() => {
    const el = rowRef.current;
    if (!el) return;
    setCanLeft(el.scrollLeft > 1);
    setCanRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 1);
  }, []);

  useEffect(() => {
    updateArrows();
    const el = rowRef.current;
    if (!el) return;
    const ro = new ResizeObserver(updateArrows);
    ro.observe(el);
    window.addEventListener('resize', updateArrows);
    return () => { ro.disconnect(); window.removeEventListener('resize', updateArrows); };
  }, [updateArrows, dates.length]);

  if (dates.length === 0 && !showBoothHours) return null;

  const scroll = (dir: -1 | 1) => rowRef.current?.scrollBy({ left: dir * 160, behavior: 'smooth' });
  const arrowCls = 'flex-shrink-0 w-5 h-5 rounded-full bg-white border border-gray-200 text-gray-400 hover:text-brand-secondary hover:border-gray-300 flex items-center justify-center transition-colors';

  return (
    <div className="flex items-center gap-1 min-w-0">
      {canLeft && (
        <button type="button" onClick={() => scroll(-1)} className={arrowCls} title="Scroll left">
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M15 19l-7-7 7-7" /></svg>
        </button>
      )}
      <div
        ref={rowRef}
        onScroll={updateArrows}
        className={`flex items-center gap-1.5 overflow-x-auto scrollbar-hide min-w-0 flex-1 ${
          centered && !canLeft && !canRight ? 'justify-center' : ''}`}
      >
        {dates.map(d => {
          const active = selected.includes(d);
          return (
            <button
              key={d}
              type="button"
              onClick={() => onChange(active && selected.length === 1 ? [] : [d])}
              aria-pressed={active}
              className={`flex-shrink-0 whitespace-nowrap px-2.5 py-1 rounded-lg border text-xs font-medium transition-colors ${
                active
                  ? 'border-brand-secondary text-brand-secondary bg-blue-50'
                  : 'border-gray-200 text-gray-600 hover:border-gray-400'
              }`}
            >
              {variant === 'short' ? shortLabel(d) : longLabel(d)}
            </button>
          );
        })}
        {showBoothHours && onBoothHoursChange && (
          <button
            type="button"
            onClick={() => onBoothHoursChange(!boothHoursOnly)}
            aria-pressed={boothHoursOnly}
            title="Meetings booked for booth hours rather than a set time"
            className={`flex-shrink-0 whitespace-nowrap px-2.5 py-1 rounded-lg border text-xs font-medium transition-colors ${
              boothHoursOnly
                ? 'border-brand-secondary text-brand-secondary bg-blue-50'
                : 'border-gray-200 text-gray-600 hover:border-gray-400'
            }`}
          >
            Booth Hours
          </button>
        )}
      </div>
      {canRight && (
        <button type="button" onClick={() => scroll(1)} className={arrowCls} title="Scroll right">
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M9 5l7 7-7 7" /></svg>
        </button>
      )}
    </div>
  );
}

/**
 * One day at a time, with a step either side.
 *
 * The rep axis draws a single day — a column per person — so the row above it
 * is not a filter with several answers but a place on a calendar with a
 * before and an after. Chips said that badly: four of them, one lit, and the
 * way to Thursday was to find Thursday. A stepper says it in the shape of the
 * thing, and leaves room for the date to be written out in full rather than
 * abbreviated to fit beside three others.
 *
 * The ends stop rather than wrap. A conference has a first day and a last
 * one, and arriving back at Tuesday from Friday would be a lie about that.
 */
export function MeetingDayStepper({
  dates, selected, onChange,
  showBoothHours = false, boothHoursOnly = false, onBoothHoursChange,
}: {
  dates: string[];
  /** The day being drawn. Out of range falls back to the first. */
  selected: string | null;
  onChange: (date: string) => void;
  showBoothHours?: boolean;
  boothHoursOnly?: boolean;
  onBoothHoursChange?: (next: boolean) => void;
}) {
  if (dates.length === 0) return null;
  const index = selected ? dates.indexOf(selected) : -1;
  const at = index >= 0 ? index : 0;
  const day = dates[at];
  const step = (dir: -1 | 1) => {
    const next = dates[at + dir];
    if (next) onChange(next);
  };
  const arrowCls = 'flex-shrink-0 w-7 h-7 rounded-full border border-gray-200 bg-white text-gray-500 '
    + 'flex items-center justify-center transition-colors hover:text-brand-secondary hover:border-gray-400 '
    + 'disabled:opacity-30 disabled:hover:text-gray-500 disabled:hover:border-gray-200 disabled:cursor-default';

  return (
    <div className="flex items-center justify-center gap-2 min-w-0">
      <button
        type="button"
        onClick={() => step(-1)}
        disabled={at === 0}
        title="The day before"
        aria-label="The day before"
        className={arrowCls}
      >
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M15 19l-7-7 7-7" /></svg>
      </button>
      <p className="min-w-0 truncate text-center text-sm font-semibold text-brand-primary">{spelledLabel(day)}</p>
      <button
        type="button"
        onClick={() => step(1)}
        disabled={at === dates.length - 1}
        title="The day after"
        aria-label="The day after"
        className={arrowCls}
      >
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M9 5l7 7-7 7" /></svg>
      </button>
      {/* Booth hours has nowhere else to go: it rides with the day row in
          every other view, and a day of people hides the booth-hours
          meetings as readily as a week of them does. */}
      {showBoothHours && onBoothHoursChange && (
        <button
          type="button"
          onClick={() => onBoothHoursChange(!boothHoursOnly)}
          aria-pressed={boothHoursOnly}
          title="Meetings booked for booth hours rather than a set time"
          className={`flex-shrink-0 whitespace-nowrap px-2.5 py-1 rounded-lg border text-xs font-medium transition-colors ${
            boothHoursOnly
              ? 'border-brand-secondary text-brand-secondary bg-blue-50'
              : 'border-gray-200 text-gray-600 hover:border-gray-400'
          }`}
        >
          Booth Hours
        </button>
      )}
    </div>
  );
}
