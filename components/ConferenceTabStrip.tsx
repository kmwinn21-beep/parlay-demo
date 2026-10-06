'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { activeDotPosition, dotCount, dotScale } from '@/lib/scrollDots';
import { badgeCount } from '@/lib/tabBadge';

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

/**
 * A colour and a glyph per tab.
 *
 * Written out in full rather than built from the key, because Tailwind reads
 * class names out of the source: a template string would generate nothing and
 * every tile would come out unstyled.
 *
 * `tint` is the tile, `icon` the glyph and the label, `badge` the count's
 * bubble, `ring` the outline the open tab wears.
 */
const TILE_STYLE: Record<string, { tint: string; icon: string; badge: string; ring: string; path: string }> = {
  targets: {
    tint: 'bg-rose-100', icon: 'text-rose-600', badge: 'bg-rose-500', ring: 'ring-rose-400',
    path: 'M12 21a9 9 0 100-18 9 9 0 000 18zm0-4a5 5 0 100-10 5 5 0 000 10zm0-4a1 1 0 100-2 1 1 0 000 2z',
  },
  attendees: {
    tint: 'bg-sky-100', icon: 'text-sky-600', badge: 'bg-sky-500', ring: 'ring-sky-400',
    path: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z',
  },
  companies: {
    tint: 'bg-indigo-100', icon: 'text-indigo-600', badge: 'bg-indigo-500', ring: 'ring-indigo-400',
    path: 'M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4',
  },
  meetings: {
    tint: 'bg-violet-100', icon: 'text-violet-600', badge: 'bg-violet-500', ring: 'ring-violet-400',
    path: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z',
  },
  'follow-ups': {
    tint: 'bg-amber-100', icon: 'text-amber-600', badge: 'bg-amber-500', ring: 'ring-amber-400',
    path: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4',
  },
  outreach: {
    tint: 'bg-teal-100', icon: 'text-teal-600', badge: 'bg-teal-500', ring: 'ring-teal-400',
    path: 'M12 19l9 2-9-18-9 18 9-2zm0 0v-8',
  },
  social: {
    tint: 'bg-pink-100', icon: 'text-pink-600', badge: 'bg-pink-500', ring: 'ring-pink-400',
    path: 'M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z',
  },
  analytics: {
    tint: 'bg-emerald-100', icon: 'text-emerald-600', badge: 'bg-emerald-500', ring: 'ring-emerald-400',
    path: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z',
  },
  notes: {
    tint: 'bg-yellow-100', icon: 'text-yellow-600', badge: 'bg-yellow-500', ring: 'ring-yellow-400',
    path: 'M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z',
  },
  forms: {
    tint: 'bg-slate-200', icon: 'text-slate-600', badge: 'bg-slate-500', ring: 'ring-slate-400',
    path: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2',
  },
  agenda: {
    tint: 'bg-blue-100', icon: 'text-blue-600', badge: 'bg-blue-500', ring: 'ring-blue-400',
    path: 'M4 6h16M4 12h16M4 18h7',
  },
};

/** Anything an account has added that this does not know about. */
const FALLBACK = {
  tint: 'bg-gray-100', icon: 'text-gray-500', badge: 'bg-gray-400', ring: 'ring-gray-400',
  path: 'M4 6h16M4 12h16M4 18h16',
};

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

        scrollbar-hide, because the dots below are the indicator — two of them
        saying the same thing in different units is worse than one.
      */}
      <div
        ref={rowRef}
        onScroll={measure}
        className="flex gap-1 overflow-x-auto scrollbar-hide px-3 pt-2 pb-2"
      >
        {tabs.map(tab => {
          const style = TILE_STYLE[tab.key] ?? FALLBACK;
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
