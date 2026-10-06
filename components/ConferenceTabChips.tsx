'use client';

import { useEffect, useRef } from 'react';
import { centerScrollLeft } from '@/lib/centerInRow';
import { conferenceTabStyle } from '@/lib/conferenceTabStyle';

/**
 * The tab row pinned at the top of the conference drawer, on a phone.
 *
 * Eleven tabs written as words run to about four screens, so the row the
 * drawer pins is mostly off screen and switching tabs means scrolling the
 * thing you opened the drawer to avoid scrolling. Each tab here is the glyph
 * and colour its tile already wears, in a 32px square — the open one alone
 * expands to carry its name, which is what keeps the row from being eleven
 * anonymous squares.
 *
 * The count is deliberately absent. The tile strip carries the counts, and in
 * here the tab you are in says its own in the panel below.
 */

export interface TabChip {
  key: string;
  /** The tab's name. Shown on the open chip, and read aloud for the rest. */
  label: string;
}

/** The width of the block holding the close button, which the chips run under. */
const CLOSE_BLOCK_W = 40;

export function ConferenceTabChips({ tabs, activeKey, onPick }: {
  tabs: TabChip[];
  activeKey: string;
  onPick: (key: string) => void;
}) {
  const rowRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef<HTMLButtonElement>(null);

  /*
   * Bring the open chip into view whenever it changes.
   *
   * Written against the row's own scrollLeft rather than scrollIntoView,
   * which walks up the tree and would scroll the drawer and the page behind
   * it as well — the panel under this row is a scroller of its own, and
   * having it jump because a tab was picked is worse than the problem.
   */
  useEffect(() => {
    const row = rowRef.current;
    const chip = activeRef.current;
    if (!row || !chip) return;
    const left = centerScrollLeft(
      chip.offsetLeft, chip.offsetWidth, row.clientWidth, row.scrollWidth, CLOSE_BLOCK_W,
    );
    const still = typeof window !== 'undefined'
      && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    row.scrollTo({ left, behavior: still ? 'auto' : 'smooth' });
  }, [activeKey, tabs.length]);

  return (
    <div
      ref={rowRef}
      className="overflow-x-auto hide-scrollbar flex-1 min-w-0 pl-3 py-2"
    >
      {/* py-2 on the scroller, not the chips: it clips its vertical axis, and
          ring-offset-1 paints 3px outside the open chip on every edge. */}
      <div className="flex gap-1.5">
        {tabs.map(tab => {
          const style = conferenceTabStyle(tab.key);
          const isActive = tab.key === activeKey;
          return (
            <button
              key={tab.key}
              ref={isActive ? activeRef : undefined}
              type="button"
              onClick={() => onPick(tab.key)}
              aria-current={isActive ? 'page' : undefined}
              /* The name is the accessible name whether or not it is drawn,
                 so a closed tab is never an unlabelled button. */
              aria-label={tab.label}
              title={tab.label}
              className={`flex-shrink-0 flex items-center justify-center h-8 rounded-lg transition-colors ${
                style.tint} ${isActive ? `gap-1.5 px-2.5 ring-2 ring-offset-1 ${style.ring}` : 'w-8'}`}
            >
              <svg
                className={`w-4 h-4 flex-shrink-0 ${style.icon}`}
                fill="none" stroke="currentColor" viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={style.path} />
              </svg>
              {isActive && (
                <span className={`text-[13px] font-semibold whitespace-nowrap ${style.icon}`}>
                  {tab.label}
                </span>
              )}
            </button>
          );
        })}
        {/*
          A real element, not padding on the scroller.

          The close button sits in an opaque block over the row's right edge,
          and the row used padding-right to keep the last tab out from under
          it. Measured in Chromium: it does not work. Scrolled fully to the
          end the last chip's right edge lands at 390 on a 390px screen —
          flush with the row's edge and 40px beneath the X — because the
          padding is counted in scrollWidth but not laid out past content that
          overflows. A spacer is content, so the scroll actually stops short
          of the block and the last tab can be reached.
        */}
        <span className="flex-shrink-0 w-10" aria-hidden />
      </div>
    </div>
  );
}
