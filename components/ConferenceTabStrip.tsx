'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { activeDotPosition, dotCount, dotScale } from '@/lib/scrollDots';
import { badgeCount } from '@/lib/tabBadge';
import { conferenceTabStyle } from '@/lib/conferenceTabStyle';

/**
 * The conference page's tabs, as a strip of tiles on a phone.
 *
 * A row of text tabs on a 390px screen shows four of eleven and gives no sign
 * that there are seven more. The tiles make each tab recognisable at a glance
 * rather than a word to be read, and the dots under them say how much more
 * there is in items rather than in pixels.
 *
 * The tab's colour is the whole tile rather than a disc behind the glyph: at
 * this size a 36px circle is a small target to aim at and a small thing to
 * tell apart, and the tint reaching the tile's edge gives both the colour and
 * the tap area the full 88x76.
 *
 * Tapping a tile does exactly what tapping a tab did: it opens the drawer,
 * which carries its own pinned tab row for moving around once you are inside.
 */

export interface TabTile {
  key: string;
  /** The tab's name on its own. The count rides in the badge, not the name. */
  label: string;
  /** How many items the tab holds, or null when it does not count. */
  count?: number | null;
}

export function ConferenceTabStrip({ tabs, activeKey, onPick }: {
  tabs: TabTile[];
  activeKey: string;
  onPick: (key: string) => void;
}) {
  const rowRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState(0);
  const dots = dotCount(tabs.length);

  const measure = useCallback(() => {
    const el = rowRef.current;
    if (!el) return;
    setPosition(activeDotPosition(el.scrollLeft, el.scrollWidth, el.clientWidth, dots));
  }, [dots]);

  useEffect(() => {
    measure();
    const el = rowRef.current;
    if (!el) return;
    // Re-measured on resize as well as on scroll: a label gaining a count
    // changes the scroll width, and the dots would be describing the old one.
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [measure, tabs.length]);

  if (tabs.length === 0) return null;

  return (
    /* The card the dashboard's Quick Views wears, with the padding a
       scroller needs: the sides come off so the tiles run to the card's own
       edge and scroll under it, rather than stopping short of a 24px gutter
       and leaving the row looking cut off. Everything else about the card —
       the white, the radius, the border, the shadow — stays with `.card`, so
       this one does not drift from the panels around it. */
    <div className="lg:hidden card !px-0 !py-2">
      {/*
        The row pads itself on BOTH axes, and the vertical half is not
        decoration.

        `overflow-x-auto` clips the vertical axis as well, and two things here
        paint outside their tile's box: the badge, which sits above the top
        edge, and the open tab's ring, which `ring-offset-1` pushes 3px past
        every edge. With the tiles flush against the scroller the ring's
        bottom was shaved off. Measured at 390px: the clip box runs 49.5-141.5
        and the ring paints 54.5-136.5, so there is 5px to spare either side.

        The gap is 8px rather than 4: each tile is a solid block of colour now
        that the tint fills it, so at 4px two tiles read as one two-tone shape
        and the badge sat close enough to its neighbour to look as if it
        belonged to it.

        scrollbar-hide, because the dots below are the indicator — two of them
        saying the same thing in different units is worse than one.
      */}
      <div
        ref={rowRef}
        onScroll={measure}
        className="flex gap-2 overflow-x-auto scrollbar-hide px-3 pt-2 pb-2"
      >
        {tabs.map(tab => {
          const style = conferenceTabStyle(tab.key);
          const isActive = tab.key === activeKey;
          const count = badgeCount(tab.count);
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => onPick(tab.key)}
              aria-current={isActive ? 'page' : undefined}
              className="relative flex-shrink-0"
            >
              {/* The tint is the tile, not a disc behind the glyph. One
                  background class, never two: both would apply and which won
                  would come down to the order Tailwind happened to write
                  them in. */}
              <div className={`w-[88px] h-[76px] rounded-xl px-2 flex flex-col items-center justify-center gap-1 ${
                style.tint} ${isActive ? `ring-2 ring-offset-1 ${style.ring}` : ''}`}
              >
                <svg className={`w-5 h-5 ${style.icon}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={style.path} />
                </svg>
                {/* Two lines at most: "Conference Forms" wraps rather than
                    widening the tile and pulling the row out of step. */}
                <p className={`text-[11px] leading-tight text-center line-clamp-2 ${
                  isActive ? `font-semibold ${style.icon}` : style.icon}`}
                >
                  {tab.label}
                </p>
              </div>
              {count !== null && (
                /* Filled in the tab's own colour, so the bubble and the glyph
                   under it read as one thing. The white ring is what keeps it
                   legible where it overhangs the tile beside it — a five
                   figure count is wider than the space above one tile.
                   tabular-nums so the digits do not jitter on a re-count. */
                <span
                  className={`absolute -top-1 right-0 h-5 px-1.5 rounded-full flex items-center justify-center ring-2 ring-white tabular-nums text-white text-[10px] font-bold ${style.badge}`}
                >
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {dots > 1 && (
        <div className="flex items-center justify-center gap-1.5 pt-1.5" aria-hidden>
          {Array.from({ length: dots }, (_, i) => {
            // 3px at rest, 7px at the position, and every size between while
            // the strip is moving.
            const size = 3 + dotScale(i, position) * 4;
            return (
              <span
                key={i}
                className="rounded-full bg-gray-400 transition-[width,height,opacity] duration-150"
                style={{
                  width: size, height: size,
                  opacity: 0.35 + dotScale(i, position) * 0.65,
                }}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
