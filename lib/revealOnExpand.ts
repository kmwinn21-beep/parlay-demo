'use client';

import { useEffect, useRef } from 'react';

/**
 * The last thing tapped, so an expansion can be traced back to the tap that
 * caused it — and so the section that grew can be found without every caller
 * having to hand one down.
 */
let lastPointer: { el: Element | null; at: number } = { el: null, at: 0 };
if (typeof document !== 'undefined') {
  document.addEventListener(
    'pointerdown',
    e => { lastPointer = { el: e.target as Element, at: Date.now() }; },
    true,
  );
}

/** How long after a tap an expansion still counts as caused by it. */
const TAP_WINDOW_MS = 1000;
/** Breathing room left above or below the revealed section. */
const MARGIN = 12;

/** The thing that actually scrolls around this element — a drawer, or the page. */
function scrollParent(el: Element): HTMLElement | null {
  let node = el.parentElement;
  while (node) {
    const style = getComputedStyle(node);
    if (/(auto|scroll|overlay)/.test(style.overflowY) && node.scrollHeight > node.clientHeight + 1) return node;
    node = node.parentElement;
  }
  return null;
}

/**
 * Bring a section that has just opened into view.
 *
 * Expanding something near the bottom of the screen leaves most of it below
 * the fold, and the person has to go looking for what they just asked for. This scrolls by the least amount that shows the whole thing — or, when
 * the section is taller than the screen, puts its top near the top so they at
 * least start at the beginning.
 *
 * Only when the tap that opened it was inside the section itself, so Expand
 * All doesn't send the page chasing after several sections at once, and a
 * section opened programmatically on mount stays where it is.
 */
function revealExpandedSection(): void {
  if (typeof window === 'undefined') return;

  const tapped = lastPointer.el;
  if (!tapped || Date.now() - lastPointer.at > TAP_WINDOW_MS) return;
  if (!tapped.isConnected) return;

  const container = tapped.closest('.card') ?? tapped.closest('section') ?? tapped.parentElement;
  if (!container || !container.contains(tapped)) return;

  // Two frames: one for React to commit the newly revealed content, one for
  // the browser to lay it out. Measuring before that gives the collapsed size.
  requestAnimationFrame(() => requestAnimationFrame(() => {
    const scroller = scrollParent(container);
    const viewTop = scroller ? scroller.getBoundingClientRect().top : 0;
    const viewBottom = scroller ? scroller.getBoundingClientRect().bottom : window.innerHeight;
    const rect = container.getBoundingClientRect();

    // Already fully visible: leave the page where the person put it.
    if (rect.bottom <= viewBottom - MARGIN) return;

    const fits = rect.height <= (viewBottom - viewTop) - MARGIN * 2;
    const delta = fits
      ? rect.bottom - viewBottom + MARGIN
      : rect.top - viewTop - MARGIN;

    if (Math.abs(delta) < 2) return;
    if (scroller) scroller.scrollBy({ top: delta, behavior: 'smooth' });
    else window.scrollBy({ top: delta, behavior: 'smooth' });
  }));
}
const subscribers = new Set<() => void>();
let nextId = 0;

function notify() {
  subscribers.forEach(fn => fn());
}


/**
 * Reveal a section whenever it goes from shut to open.
 *
 * Kept apart from any one collapsing hook because the app has two of them —
 * the registry-backed sections down a record's side column, and the dashboard
 * cards that fold on a phone — and opening either is the same request.
 */
export function useRevealOnExpand(expanded: boolean): void {
  const wasExpanded = useRef(expanded);
  useEffect(() => {
    const opened = expanded && !wasExpanded.current;
    wasExpanded.current = expanded;
    if (opened) revealExpandedSection();
  }, [expanded]);
}
