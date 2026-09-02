'use client';

import { useCallback, useEffect, useState } from 'react';

/**
 * Where a searchable dropdown's panel goes on a phone.
 *
 * A dropdown anchored to its trigger has nowhere to go on a small screen: the
 * trigger is usually halfway down a form, the keyboard takes the bottom half of
 * what's left, and the panel ends up flipped above the field — pushing the
 * search box itself off the top of the screen, so you cannot see what you are
 * typing. The fix is to stop anchoring it at all. Below `lg` the panel docks
 * under the site header and opens downward, the way the global search does.
 *
 * Desktop keeps anchoring to the trigger, where there is room and where a panel
 * that jumped to the top of the window would be disorienting.
 */

/** Matches Tailwind's `lg` breakpoint, which is where the app switches layouts. */
const DESKTOP_QUERY = '(min-width: 1024px)';

/** Fallback for the header's height if it can't be found in the DOM. */
const HEADER_FALLBACK = 61;

export interface DockRect {
  top: number;
  left: number;
  width: number;
  maxHeight: number;
}

/** True while the viewport is narrow enough that dropdowns should dock. */
export function useMobileDock(): boolean {
  const [dock, setDock] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(DESKTOP_QUERY);
    const apply = () => setDock(!mq.matches);
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, []);
  return dock;
}

/**
 * The docked panel's box: full width bar an inset in from each edge, starting
 * just under the header.
 *
 * Height is measured against the visual viewport, not innerHeight, so the panel
 * ends where the keyboard begins rather than running underneath it.
 */
export function computeDockRect(): DockRect {
  const header = document.querySelector('header');
  const headerBottom = header ? header.getBoundingClientRect().bottom : HEADER_FALLBACK;
  const vv = window.visualViewport;
  const viewportBottom = vv ? vv.offsetTop + vv.height : window.innerHeight;
  const inset = 8;
  const top = Math.max(headerBottom + inset, inset);
  return {
    top,
    left: inset,
    width: window.innerWidth - inset * 2,
    maxHeight: Math.max(160, viewportBottom - top - inset),
  };
}

/**
 * Keeps a docked panel's box current while it is open.
 *
 * The keyboard opening and closing is reported by visualViewport and nowhere
 * else on iOS — no window resize, no scroll — so without listening there the
 * panel would keep whatever height it had when the keyboard appeared.
 */
export function useDockRect(active: boolean): DockRect | null {
  const [rect, setRect] = useState<DockRect | null>(null);

  const measure = useCallback(() => setRect(computeDockRect()), []);

  useEffect(() => {
    if (!active) { setRect(null); return; }
    measure();
    window.addEventListener('resize', measure);
    const vv = window.visualViewport;
    vv?.addEventListener('resize', measure);
    vv?.addEventListener('scroll', measure);
    return () => {
      window.removeEventListener('resize', measure);
      vv?.removeEventListener('resize', measure);
      vv?.removeEventListener('scroll', measure);
    };
  }, [active, measure]);

  return rect;
}
