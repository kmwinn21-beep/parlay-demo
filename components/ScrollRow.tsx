'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';

/**
 * Keeps its children on a single line that scrolls horizontally instead of
 * wrapping. Chevrons appear on either side once there is somewhere to scroll
 * to, and the scrollbar itself is hidden.
 */
export function ScrollRow({ children, className = '', gapClass = 'gap-2', step = 160 }: {
  children: ReactNode;
  className?: string;
  /** Spacing between children. */
  gapClass?: string;
  /** Pixels moved per chevron press. */
  step?: number;
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

  return (
    <div className={`flex items-center gap-1 min-w-0 ${className}`}>
      {canLeft && (
        <button type="button" onClick={() => scroll(-1)} className={arrowCls} title="Scroll left">
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M15 19l-7-7 7-7" /></svg>
        </button>
      )}
      <div
        ref={rowRef}
        onScroll={updateArrows}
        // w-0 flex-1 keeps the nowrap content from widening the parent — the
        // row takes the space that's left and scrolls the overflow.
        className={`flex items-center flex-nowrap overflow-x-auto scrollbar-hide min-w-0 w-0 flex-1 ${gapClass}`}
      >
        {children}
      </div>
      {canRight && (
        <button type="button" onClick={() => scroll(1)} className={arrowCls} title="Scroll right">
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M9 5l7 7-7 7" /></svg>
        </button>
      )}
    </div>
  );
}
