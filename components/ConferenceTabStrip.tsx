'use client';

import { badgeCount } from '@/lib/tabBadge';
import { tileRows } from '@/lib/tileRows';
import { conferenceTabStyle } from '@/lib/conferenceTabStyle';

/**
 * The conference page's tabs, as a grid of tiles on a phone and in the drawer.
 *
 * A row of text tabs on a 390px screen shows four of eleven and gives no sign
 * that there are seven more. The tiles make each tab recognisable at a glance
 * rather than a word to be read.
 *
 * Four to a row, and a row to a card. They used to be one scrolling row with
 * dots under it saying how much more there was — which meant the tabs you
 * could not see were a swipe away rather than on screen. Laid out, every tab
 * is visible at once and nothing has to be discovered.
 *
 * The tab's colour is the whole tile rather than a disc behind the glyph: at
 * this size a 36px circle is a small target to aim at and a small thing to
 * tell apart, and the tint reaching the tile's edge gives both the colour and
 * the tap area the whole tile.
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
  if (tabs.length === 0) return null;

  return (
    /* A card per row, which is what gives the rows the gap between them —
       the page's own stack spaces this component, not what is inside it. */
    <div className="lg:hidden space-y-3">
      {tileRows(tabs).map((row, i) => (
        /* The card the dashboard's Quick Views wears. It takes `.card` rather
           than copying the white, the radius, the border and the shadow, so
           it cannot drift from the panels around it; only the padding is its
           own, because the tiles carry their own gap. */
        <div key={i} className="card !px-3 !py-3">
          {/*
            Four columns whatever the row holds, so a short last row keeps the
            column widths of the rows above it rather than stretching to fill
            the card — three tiles each a third of the width would read as a
            different kind of thing.

            Nothing clips here any more: the badge sits above the tile's top
            edge and `ring-offset-1` pushes the open tab's ring 3px past every
            edge, both of which the old scroller cut off and had to be padded
            away from.
          */}
          <div className="grid grid-cols-4 gap-2">
            {row.map(tab => {
              const style = conferenceTabStyle(tab.key);
              const isActive = tab.key === activeKey;
              const count = badgeCount(tab.count);
              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => onPick(tab.key)}
                  aria-current={isActive ? 'page' : undefined}
                  className="relative min-w-0"
                >
                  {/* The tint is the tile, not a disc behind the glyph. One
                      background class, never two: both would apply and which
                      won would come down to the order Tailwind happened to
                      write them in. */}
                  <div className={`w-full h-[76px] rounded-xl px-1 flex flex-col items-center justify-center gap-1 ${
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
                    /* Filled in the tab's own colour, so the bubble and the
                       glyph under it read as one thing. The white ring is what
                       keeps it legible where it overhangs the tile beside it —
                       a five figure count is wider than the space above one
                       tile. tabular-nums so the digits do not jitter on a
                       re-count. */
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
        </div>
      ))}
    </div>
  );
}
