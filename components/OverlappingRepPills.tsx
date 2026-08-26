'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { getPreset } from '@/lib/colors';
import { useConfigColors } from '@/lib/useConfigColors';
import { parseRepIds, getRepInitials, type UserOption } from '@/lib/useUserOptions';

/** How long the expanded names stay up before folding back. */
const EXPAND_MS = 5000;

/**
 * Internal people on a record as a stack of circular initial pills, each
 * overlapping the one before it. Used where several reps share a row and a
 * wrapping list of pills would cost too much width.
 *
 * Clicking the stack spreads it into full-name pills for a few seconds.
 */
export function OverlappingRepPills({
  repIds, userOptions, size = 'sm', max = 4, emptyLabel = '—',
}: {
  /** Comma-separated config_options ids, as stored on scheduled_by. */
  repIds: string | null | undefined;
  userOptions: UserOption[];
  size?: 'sm' | 'xs';
  /** Extra people collapse into a +N pill. */
  max?: number;
  emptyLabel?: string | null;
}) {
  const colorMaps = useConfigColors();
  // Click to read the names, which the initials and a hover title can't give
  // you on a touch screen. It folds itself back rather than needing a second
  // tap — the expanded row is wide enough to disturb the column it sits in.
  const [expanded, setExpanded] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  const names = parseRepIds(repIds)
    .map(id => userOptions.find(u => u.id === id)?.value)
    .filter((v): v is string => !!v);

  if (names.length === 0) {
    return emptyLabel ? <span className="text-gray-300">{emptyLabel}</span> : null;
  }

  const dim = size === 'xs' ? 'w-5 h-5 text-[9px]' : 'w-6 h-6 text-[10px]';
  const shown = expanded ? names : names.slice(0, max);
  const extra = names.length - shown.length;

  const toggle = (e: React.MouseEvent) => {
    // The row underneath usually opens something; reading the names shouldn't.
    e.stopPropagation();
    if (timerRef.current) clearTimeout(timerRef.current);
    if (expanded) { setExpanded(false); return; }
    setExpanded(true);
    timerRef.current = setTimeout(() => setExpanded(false), EXPAND_MS);
  };

  return (
    <button
      type="button"
      onClick={toggle}
      title={expanded ? 'Hide names' : names.join(', ')}
      aria-expanded={expanded}
      className="inline-flex items-center text-left align-middle"
    >
      {shown.map((name, i) => (
        <span
          key={`${name}-${i}`}
          style={{ zIndex: shown.length - i }}
          // Same element in both states: the width, padding and overlap
          // transition, so the stack spreads out and the names appear in place
          // rather than one row being swapped for another.
          className={`relative inline-flex items-center justify-center rounded-full font-semibold ring-2 ring-white flex-shrink-0 overflow-hidden whitespace-nowrap transition-all duration-300 ease-out ${
            expanded
              ? `h-6 max-w-[9rem] px-2 text-[10px] ${i > 0 ? 'ml-1' : ''}`
              : `${dim} max-w-[1.5rem] px-0 ${i > 0 ? '-ml-1.5' : ''}`
          } ${getPreset(colorMaps.user?.[name]).badgeClass}`}
        >
          {expanded ? name : getRepInitials(name)}
        </span>
      ))}
      {extra > 0 && (
        <span
          className={`${dim} -ml-1.5 relative inline-flex items-center justify-center rounded-full font-semibold ring-2 ring-white bg-gray-100 text-gray-500 flex-shrink-0`}
        >
          +{extra}
        </span>
      )}
    </button>
  );
}


/**
 * The same people as full-name pills on a single line. The row scrolls
 * horizontally rather than wrapping, with chevrons appearing on either side
 * once there is somewhere to scroll to — the treatment the social event cards
 * use for their internal attendees.
 */
export function ScrollingRepPills({ repIds, userOptions, emptyLabel = null }: {
  repIds: string | null | undefined;
  userOptions: UserOption[];
  emptyLabel?: string | null;
}) {
  const colorMaps = useConfigColors();
  const rowRef = useRef<HTMLDivElement>(null);
  const [canLeft, setCanLeft] = useState(false);
  const [canRight, setCanRight] = useState(false);

  const names = parseRepIds(repIds)
    .map(id => userOptions.find(u => u.id === id)?.value)
    .filter((v): v is string => !!v);

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
  }, [updateArrows, repIds, userOptions.length]);

  if (names.length === 0) {
    return emptyLabel ? <span className="text-gray-300">{emptyLabel}</span> : null;
  }

  const scroll = (dir: -1 | 1) => rowRef.current?.scrollBy({ left: dir * 120, behavior: 'smooth' });
  const arrowCls = 'flex-shrink-0 w-4 h-4 rounded-full bg-white border border-gray-200 text-gray-400 hover:text-brand-secondary hover:border-gray-300 flex items-center justify-center transition-colors';

  return (
    <div className="flex items-center gap-1 min-w-0">
      {canLeft && (
        <button type="button" onClick={e => { e.stopPropagation(); scroll(-1); }} className={arrowCls} title="Scroll left">
          <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M15 19l-7-7 7-7" /></svg>
        </button>
      )}
      <div ref={rowRef} onScroll={updateArrows} className="flex items-center gap-1 overflow-x-auto scrollbar-hide min-w-0">
        {names.map((name, i) => (
          <span
            key={`${name}-${i}`}
            title={name}
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium whitespace-nowrap flex-shrink-0 ${getPreset(colorMaps.user?.[name]).badgeClass}`}
          >
            <svg className="w-3 h-3 opacity-70" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
            {name}
          </span>
        ))}
      </div>
      {canRight && (
        <button type="button" onClick={e => { e.stopPropagation(); scroll(1); }} className={arrowCls} title="Scroll right">
          <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M9 5l7 7-7 7" /></svg>
        </button>
      )}
    </div>
  );
}
