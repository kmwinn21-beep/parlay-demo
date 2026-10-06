'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { getPreset } from '@/lib/colors';
import { useConfigColors } from '@/lib/useConfigColors';
import { parseRepIds, getRepInitials, type UserOption } from '@/lib/useUserOptions';

/** How long the expanded names stay up before folding back. */
const EXPAND_MS = 5000;

/** One badge in a stack: its short form, its full form, and its colour. */
export interface OverlapItem {
  key: string;
  /** What the circle shows while collapsed — initials, or a single letter. */
  short: string;
  /** What it reads as once the stack is spread open. */
  label: string;
  badgeClass: string;
}

/**
 * A stack of circular badges, each overlapping the one before it, that spreads
 * into full labels when tapped.
 *
 * The shape, the overlap, the timing and the scroll chevrons live here once.
 * Reps were the first use and for a while the only one, so this logic was
 * written in terms of them; a second stack of a different kind of thing would
 * otherwise have meant a second copy of all of it, which is how two stacks
 * that are supposed to behave identically stop doing so.
 *
 * The caller decides what a badge says and what colour it is. This decides
 * how a stack behaves.
 */
export function OverlappingBadges({
  items, size = 'sm', max = 4, emptyLabel = '\u2014', collapsedTitle,
}: {
  items: OverlapItem[];
  size?: 'sm' | 'xs';
  /** Extra badges collapse into a +N pill. */
  max?: number;
  emptyLabel?: string | null;
  /** The hover title while collapsed. Defaults to the labels, comma-joined. */
  collapsedTitle?: string;
}) {
  // Click to read the labels, which the short forms and a hover title can't
  // give you on a touch screen. It folds itself back rather than needing a
  // second tap — the expanded row is wide enough to disturb the column it
  // sits in.
  const [expanded, setExpanded] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  // Expanded, the labels can outrun the space they're in — so the row scrolls
  // rather than wrapping, and grows chevrons once there's somewhere to go.
  const rowRef = useRef<HTMLDivElement>(null);
  const [canLeft, setCanLeft] = useState(false);
  const [canRight, setCanRight] = useState(false);
  const updateArrows = useCallback(() => {
    const el = rowRef.current;
    if (!el) { setCanLeft(false); setCanRight(false); return; }
    setCanLeft(el.scrollLeft > 1);
    setCanRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 1);
  }, []);

  useEffect(() => {
    updateArrows();
    const el = rowRef.current;
    if (!el) return;
    const ro = new ResizeObserver(updateArrows);
    ro.observe(el);
    return () => ro.disconnect();
  }, [updateArrows, expanded, items.length]);

  if (items.length === 0) {
    return emptyLabel ? <span className="text-gray-300">{emptyLabel}</span> : null;
  }

  const dim = size === 'xs' ? 'w-5 h-5 text-[9px]' : 'w-6 h-6 text-[10px]';
  const shown = expanded ? items : items.slice(0, max);
  const extra = items.length - shown.length;

  const toggle = (e: React.MouseEvent) => {
    // The row underneath usually opens something; reading the labels shouldn't.
    e.stopPropagation();
    if (timerRef.current) clearTimeout(timerRef.current);
    if (expanded) { setExpanded(false); return; }
    setExpanded(true);
    timerRef.current = setTimeout(() => setExpanded(false), EXPAND_MS);
  };

  // Scrolling shouldn't count as reading the labels, so the timer restarts.
  const nudge = (dir: -1 | 1) => (e: React.MouseEvent) => {
    e.stopPropagation();
    rowRef.current?.scrollBy({ left: dir * 110, behavior: 'smooth' });
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setExpanded(false), EXPAND_MS);
  };
  const arrowCls = 'flex-shrink-0 w-4 h-4 rounded-full bg-white border border-gray-200 text-gray-400 hover:text-brand-secondary hover:border-gray-300 flex items-center justify-center transition-colors';

  return (
    <span className="inline-flex items-center gap-1 align-middle min-w-0 max-w-full">
      {expanded && canLeft && (
        <button type="button" onClick={nudge(-1)} title="Scroll left" className={arrowCls}>
          <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M15 19l-7-7 7-7" /></svg>
        </button>
      )}
      {/* A span rather than a button: the chevrons beside it are buttons, and a
          button inside a button is invalid markup. */}
      <span
        ref={rowRef}
        role="button"
        tabIndex={0}
        onClick={toggle}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(e as unknown as React.MouseEvent); } }}
        onScroll={updateArrows}
        title={expanded ? 'Hide' : (collapsedTitle ?? items.map(i => i.label).join(', '))}
        aria-expanded={expanded}
        className="inline-flex items-center text-left align-middle cursor-pointer min-w-0 overflow-x-auto scrollbar-hide"
      >
        {shown.map((item, i) => (
          <span
            key={item.key}
            style={{ zIndex: shown.length - i }}
            // Same element in both states: the width, padding and overlap
            // transition, so the stack spreads out and the labels appear in
            // place rather than one row being swapped for another.
            className={`relative inline-flex items-center justify-center rounded-full font-semibold ring-2 ring-white flex-shrink-0 overflow-hidden whitespace-nowrap transition-all duration-300 ease-out ${
              expanded
                ? `h-6 max-w-[9rem] px-2 text-[10px] ${i > 0 ? 'ml-1' : ''}`
                : `${dim} max-w-[1.5rem] px-0 ${i > 0 ? '-ml-1.5' : ''}`
            } ${item.badgeClass}`}
          >
            {expanded ? item.label : item.short}
          </span>
        ))}
        {extra > 0 && (
          <span
            className={`${dim} -ml-1.5 relative inline-flex items-center justify-center rounded-full font-semibold ring-2 ring-white bg-gray-100 text-gray-500 flex-shrink-0`}
          >
            +{extra}
          </span>
        )}
      </span>
      {expanded && canRight && (
        <button type="button" onClick={nudge(1)} title="Scroll right" className={arrowCls}>
          <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M9 5l7 7-7 7" /></svg>
        </button>
      )}
    </span>
  );
}

/**
 * Internal people on a record as a stack of circular initial pills. Used where
 * several reps share a row and a wrapping list of pills would cost too much
 * width.
 */
export function OverlappingRepPills({
  repIds, userOptions, size = 'sm', max = 4, emptyLabel = '\u2014',
}: {
  /** Comma-separated config_options ids, as stored on scheduled_by. */
  repIds: string | null | undefined;
  userOptions: UserOption[];
  size?: 'sm' | 'xs';
  max?: number;
  emptyLabel?: string | null;
}) {
  const colorMaps = useConfigColors();
  const names = parseRepIds(repIds)
    .map(id => userOptions.find(u => u.id === id)?.value)
    .filter((v): v is string => !!v);

  return (
    <OverlappingBadges
      items={names.map((name, i) => ({
        key: `${name}-${i}`,
        short: getRepInitials(name),
        label: name,
        badgeClass: getPreset(colorMaps.user?.[name]).badgeClass,
      }))}
      size={size}
      max={max}
      emptyLabel={emptyLabel}
    />
  );
}

/**
 * A company's statuses as the same stack, a letter to a circle.
 *
 * Statuses are stored comma-separated and a company often carries more than
 * one, so on a card they have exactly the problem the rep stack was built
 * for: several short things that must not cost a row of width. Behaving the
 * same way is the point — a reader who has learned to tap the support badges
 * should not have to learn these separately.
 */
export function OverlappingStatusBadges({ status, max = 4, emptyLabel = '\u2014' }: {
  /** companies.status, comma-separated. */
  status: string | null | undefined;
  max?: number;
  emptyLabel?: string | null;
}) {
  const colorMaps = useConfigColors();
  const values = String(status ?? '')
    .split(',')
    .map(v => v.trim())
    // 'Unknown' is the column's default rather than something anybody chose,
    // and the company table already declines to draw it.
    .filter(v => v && v !== 'Unknown');

  return (
    <OverlappingBadges
      items={values.map((value, i) => ({
        key: `${value}-${i}`,
        short: value.charAt(0).toUpperCase(),
        label: value,
        badgeClass: getPreset(colorMaps.status?.[value]).badgeClass,
      }))}
      max={max}
      emptyLabel={emptyLabel}
    />
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
