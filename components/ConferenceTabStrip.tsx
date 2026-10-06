'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { activeDotPosition, dotCount, dotScale } from '@/lib/scrollDots';

/**
 * The conference page's tabs, as a strip of tiles on a phone.
 *
 * A row of text tabs on a 390px screen shows four of eleven and gives no sign
 * that there are seven more. The tiles are the shape the dashboard's Quick
 * Views already uses — a coloured circle over a label — which makes each tab
 * recognisable at a glance rather than a word to be read, and the dots under
 * them say how much more there is in items rather than in pixels.
 *
 * Tapping a tile does exactly what tapping a tab did: it opens the drawer,
 * which carries its own pinned tab row for moving around once you are inside.
 */

export interface TabTile {
  key: string;
  /** The tab's name and count, as the drawer's own row renders it. */
  label: string;
}

/**
 * A colour and a glyph per tab.
 *
 * Written out in full rather than built from the key, because Tailwind reads
 * class names out of the source: a template string would generate nothing and
 * every circle would come out unstyled.
 */
const TILE_STYLE: Record<string, { ring: string; icon: string; fill: string; active: string; path: string }> = {
  targets: {
    ring: 'bg-rose-100', icon: 'text-rose-600', fill: 'group-hover:bg-rose-500', active: 'bg-rose-500',
    path: 'M12 21a9 9 0 100-18 9 9 0 000 18zm0-4a5 5 0 100-10 5 5 0 000 10zm0-4a1 1 0 100-2 1 1 0 000 2z',
  },
  attendees: {
    ring: 'bg-sky-100', icon: 'text-sky-600', fill: 'group-hover:bg-sky-500', active: 'bg-sky-500',
    path: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z',
  },
  companies: {
    ring: 'bg-indigo-100', icon: 'text-indigo-600', fill: 'group-hover:bg-indigo-500', active: 'bg-indigo-500',
    path: 'M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4',
  },
  meetings: {
    ring: 'bg-violet-100', icon: 'text-violet-600', fill: 'group-hover:bg-violet-500', active: 'bg-violet-500',
    path: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z',
  },
  'follow-ups': {
    ring: 'bg-amber-100', icon: 'text-amber-600', fill: 'group-hover:bg-amber-500', active: 'bg-amber-500',
    path: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4',
  },
  outreach: {
    ring: 'bg-teal-100', icon: 'text-teal-600', fill: 'group-hover:bg-teal-500', active: 'bg-teal-500',
    path: 'M12 19l9 2-9-18-9 18 9-2zm0 0v-8',
  },
  social: {
    ring: 'bg-pink-100', icon: 'text-pink-600', fill: 'group-hover:bg-pink-500', active: 'bg-pink-500',
    path: 'M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z',
  },
  analytics: {
    ring: 'bg-emerald-100', icon: 'text-emerald-600', fill: 'group-hover:bg-emerald-500', active: 'bg-emerald-500',
    path: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z',
  },
  notes: {
    ring: 'bg-yellow-100', icon: 'text-yellow-600', fill: 'group-hover:bg-yellow-500', active: 'bg-yellow-500',
    path: 'M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z',
  },
  forms: {
    ring: 'bg-slate-200', icon: 'text-slate-600', fill: 'group-hover:bg-slate-500', active: 'bg-slate-500',
    path: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2',
  },
  agenda: {
    ring: 'bg-blue-100', icon: 'text-blue-600', fill: 'group-hover:bg-blue-500', active: 'bg-blue-500',
    path: 'M4 6h16M4 12h16M4 18h7',
  },
};

/** Anything an account has added that this does not know about. */
const FALLBACK = {
  ring: 'bg-gray-100', icon: 'text-gray-500', fill: 'group-hover:bg-gray-400', active: 'bg-gray-400',
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
    <div className="lg:hidden">
      {/* scrollbar-hide, because the dots below are the indicator — two of
          them saying the same thing in different units is worse than one. */}
      <div
        ref={rowRef}
        onScroll={measure}
        className="flex gap-1 overflow-x-auto scrollbar-hide px-1"
      >
        {tabs.map(tab => {
          const style = TILE_STYLE[tab.key] ?? FALLBACK;
          const isActive = tab.key === activeKey;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => onPick(tab.key)}
              aria-current={isActive ? 'page' : undefined}
              className="group flex-shrink-0 w-20 flex flex-col items-center gap-1 p-2 rounded-xl hover:bg-gray-50 transition-colors"
            >
              {/* One background class, never two. The first version of this
                  kept the pale ring and added the filled colour beside it for
                  the active tile, and which of them applied came down to the
                  order Tailwind happened to write them in — the pale one won,
                  so the active tile had a white icon on a pale circle. */}
              <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 transition-colors ${
                isActive ? style.active : `${style.ring} ${style.fill}`}`}
              >
                <svg
                  className={`w-4 h-4 transition-colors group-hover:text-white ${isActive ? 'text-white' : style.icon}`}
                  fill="none" stroke="currentColor" viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={style.path} />
                </svg>
              </div>
              {/* Two lines at most: "Follow Ups (12)" wraps rather than
                  widening the tile and pulling the row out of step. */}
              <p className={`text-[11px] leading-tight text-center line-clamp-2 ${
                isActive ? 'text-brand-secondary font-semibold' : 'text-gray-500'}`}
              >
                {tab.label}
              </p>
            </button>
          );
        })}
      </div>

      {dots > 1 && (
        <div className="flex items-center justify-center gap-1.5 pt-2" aria-hidden>
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
