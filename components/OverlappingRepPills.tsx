'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { getPreset } from '@/lib/colors';
import { useConfigColors } from '@/lib/useConfigColors';
import { parseRepIds, getRepInitials, type UserOption } from '@/lib/useUserOptions';

/**
 * Internal people on a record as a stack of circular initial pills, each
 * overlapping the one before it. Used where several reps share a row and a
 * wrapping list of pills would cost too much width.
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
  const names = parseRepIds(repIds)
    .map(id => userOptions.find(u => u.id === id)?.value)
    .filter((v): v is string => !!v);

  if (names.length === 0) {
    return emptyLabel ? <span className="text-gray-300">{emptyLabel}</span> : null;
  }

  const dim = size === 'xs' ? 'w-5 h-5 text-[9px]' : 'w-6 h-6 text-[10px]';
  const shown = names.slice(0, max);
  const extra = names.length - shown.length;

  return (
    <span className="inline-flex items-center">
      {shown.map((name, i) => (
        <span
          key={`${name}-${i}`}
          title={name}
          style={{ zIndex: shown.length - i }}
          className={`${dim} ${i > 0 ? '-ml-1.5' : ''} relative inline-flex items-center justify-center rounded-full font-semibold ring-2 ring-white flex-shrink-0 ${getPreset(colorMaps.user?.[name]).badgeClass}`}
        >
          {getRepInitials(name)}
        </span>
      ))}
      {extra > 0 && (
        <span
          title={names.slice(max).join(', ')}
          className={`${dim} -ml-1.5 relative inline-flex items-center justify-center rounded-full font-semibold ring-2 ring-white bg-gray-100 text-gray-500 flex-shrink-0`}
        >
          +{extra}
        </span>
      )}
    </span>
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
