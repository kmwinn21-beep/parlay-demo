'use client';

import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';

interface AnchoredDrawerOptions {
  /** Whether the panel is showing. Everything resets to 0 when it isn't. */
  open: boolean;
  /** Identifies the row/card the panel belongs to; re-measures when it changes. */
  anchorKey: string | null;
  /** The list the panel sits beside — offsets are measured against its top. */
  wrapRef: RefObject<HTMLElement | null>;
  /** The panel itself, measured for height. */
  panelRef: RefObject<HTMLElement | null>;
  /** Finds the element to line the panel up with. Identity doesn't matter. */
  findAnchor: (wrap: HTMLElement, key: string) => HTMLElement | null;
  /** Clearance below the panel for anything pinned to the viewport. */
  gutter?: number;
}

/**
 * A side panel that starts level with the row it belongs to, and can be
 * scrolled to in full even when that row is near the bottom of the list.
 *
 * `offset` is padding above the panel so its top meets its row — measured
 * rather than computed, since rows aren't a uniform height. `overhang` is a
 * spacer the caller renders below the list: a panel anchored near the bottom
 * would otherwise hang past the end with nothing underneath to scroll to. The
 * spacer sits outside the list so growing it can't move the row the offset was
 * measured against.
 *
 * Once both are in place, the panel is scrolled into view by exactly the amount
 * needed — never more, so its row stays on screen.
 */
export function useAnchoredDrawer({
  open,
  anchorKey,
  wrapRef,
  panelRef,
  findAnchor,
  gutter = 96,
}: AnchoredDrawerOptions): { offset: number; overhang: number } {
  const [offset, setOffset] = useState(0);
  const [overhang, setOverhang] = useState(0);

  const findAnchorRef = useRef(findAnchor);
  findAnchorRef.current = findAnchor;

  useLayoutEffect(() => {
    if (!open || !anchorKey) { setOffset(0); setOverhang(0); return; }
    const wrap = wrapRef.current;
    const anchor = wrap ? findAnchorRef.current(wrap, anchorKey) : null;
    if (!wrap || !anchor) { setOffset(0); setOverhang(0); return; }

    const measure = () => {
      const a = anchor.getBoundingClientRect();
      const w = wrap.getBoundingClientRect();
      const top = Math.max(0, Math.round(a.top - w.top));
      setOffset(top);
      const panelH = panelRef.current?.offsetHeight ?? 0;
      setOverhang(panelH > 0 ? Math.max(0, Math.round(top + panelH + gutter - wrap.offsetHeight)) : 0);
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(wrap);
    if (panelRef.current) ro.observe(panelRef.current);
    return () => ro.disconnect();
  }, [open, anchorKey, wrapRef, panelRef, gutter]);

  useEffect(() => {
    if (!open || !anchorKey) return;
    // The panel unfurls over ~220ms; measuring mid-animation reads short.
    const t = setTimeout(() => {
      const panel = panelRef.current;
      if (!panel || panel.offsetHeight === 0) return;

      // The page may scroll inside a container rather than the window.
      let scroller: HTMLElement | null = panel.parentElement;
      while (scroller && scroller !== document.body) {
        const oy = getComputedStyle(scroller).overflowY;
        if ((oy === 'auto' || oy === 'scroll') && scroller.scrollHeight > scroller.clientHeight) break;
        scroller = scroller.parentElement;
      }
      const usesWindow = !scroller || scroller === document.body;

      const pr = panel.getBoundingClientRect();
      let bottomLimit = usesWindow ? window.innerHeight : scroller!.getBoundingClientRect().bottom;
      // Anything pinned to the bottom of the window over the panel's own column
      // — the messaging bar — would cover the end of the card, so scroll clear
      // of it rather than to the container's edge.
      for (const el of Array.from(document.querySelectorAll<HTMLElement>('body *'))) {
        if (getComputedStyle(el).position !== 'fixed') continue;
        const r = el.getBoundingClientRect();
        if (r.height === 0 || r.width === 0) continue;
        if (r.bottom < window.innerHeight - 4 || r.top > window.innerHeight) continue;
        if (r.right < pr.left || r.left > pr.right) continue;
        bottomLimit = Math.min(bottomLimit, r.top);
      }
      const delta = Math.round(pr.bottom - (bottomLimit - 12));
      if (delta <= 0) return;

      if (usesWindow) window.scrollBy({ top: delta, behavior: 'smooth' });
      else scroller!.scrollBy({ top: delta, behavior: 'smooth' });
    }, 280);
    return () => clearTimeout(t);
  }, [open, anchorKey, overhang, panelRef]);

  return { offset, overhang };
}
