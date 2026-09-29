'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';

/**
 * Keeps its children on a single line that scrolls horizontally instead of
 * wrapping. Chevrons appear on either side once there is somewhere to scroll
 * to, and the scrollbar itself is hidden.
 */
export function ScrollRow({
  children, className = '', gapClass = 'gap-2', step = 160, fade = false,
  alignClass = 'items-center',
}: {
  children: ReactNode;
  className?: string;
  /** Spacing between children. */
  gapClass?: string;
  /**
   * How the children sit against each other vertically.
   *
   * Centred by default, which is right for a row of pills. A row of CARDS
   * wants `items-stretch` instead: cards of different heights centred on one
   * line leave a ragged gap above and below each one.
   */
  alignClass?: string;
  /** Pixels moved per chevron press. */
  step?: number;
  /**
   * Fade the overflowing edge, so a clipped child reads as cut off rather than
   * as ending there.
   *
   * Opt-in rather than always on: the chevrons alone are enough in a roomy row,
   * and the mask needs a background colour to fade to, which only the caller
   * knows. Used where the row is genuinely tight — a grid cell four columns
   * wide, where a half-visible pill is easy to miss.
   */
  fade?: boolean;
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
    Array.from(el.children).forEach(c => ro.observe(c));
    window.addEventListener('resize', updateArrows);
    return () => { ro.disconnect(); window.removeEventListener('resize', updateArrows); };
  }, [updateArrows, children]);

  const scroll = (dir: -1 | 1) => rowRef.current?.scrollBy({ left: dir * step, behavior: 'smooth' });
  const arrowCls = 'flex-shrink-0 w-5 h-5 rounded-full bg-white border border-gray-200 text-gray-400 hover:text-brand-secondary hover:border-gray-300 flex items-center justify-center transition-colors';

  // Stops a scroll arrow from also firing whatever the row sits inside. The
  // card header this lands in is a div with its own onClick, and paging pills
  // must not collapse the card underneath them.
  return (
    <div className={`relative flex items-center gap-1 min-w-0 ${className}`}>
      {canLeft && (
        <button type="button" onClick={e => { e.stopPropagation(); scroll(-1); }} className={arrowCls} title="Scroll left">
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M15 19l-7-7 7-7" /></svg>
        </button>
      )}
      <div
        ref={rowRef}
        onScroll={updateArrows}
        // w-0 flex-1 keeps the nowrap content from widening the parent — the
        // row takes the space that's left and scrolls the overflow.
        className={`flex ${alignClass} flex-nowrap overflow-x-auto scrollbar-hide min-w-0 w-0 flex-1 ${gapClass}`}
      >
        {children}
      </div>
      {canRight && (
        <button type="button" onClick={e => { e.stopPropagation(); scroll(1); }} className={arrowCls} title="Scroll right">
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M9 5l7 7-7 7" /></svg>
        </button>
      )}
      {/* pointer-events-none, or the mask would eat clicks on the pill it is
          fading. Only on the side there is more to see. */}
      {fade && canLeft && (
        <span aria-hidden className="pointer-events-none absolute left-6 top-0 bottom-0 w-4 bg-gradient-to-r from-white to-transparent" />
      )}
      {fade && canRight && (
        <span aria-hidden className="pointer-events-none absolute right-6 top-0 bottom-0 w-4 bg-gradient-to-l from-white to-transparent" />
      )}
    </div>
  );
}
