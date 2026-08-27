'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/** "Monday, Aug 17" */
function longLabel(d: string) {
  return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
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
  dates, selected, onChange, variant = 'long',
  showBoothHours = false, boothHoursOnly = false, onBoothHoursChange,
}: {
  dates: string[];
  /** Dates currently filtered on — a button is active when its date is in here. */
  selected: string[];
  onChange: (dates: string[]) => void;
  /** 'long' = "Monday, Aug 17" (desktop), 'short' = "Mon, 8.17" (mobile). */
  variant?: 'long' | 'short';
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
      <div ref={rowRef} onScroll={updateArrows} className="flex items-center gap-1.5 overflow-x-auto scrollbar-hide min-w-0">
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
