'use client';

import { useEffect } from 'react';

/**
 * Swipe-down-to-close for every mobile drawer and bottom sheet, wired once here
 * rather than threaded through the thirty-odd places that render one.
 *
 * The gesture is read off the sheet element itself (.drawer-mobile-responsive /
 * .modal-sheet-mobile). Closing is then handed back to the sheet's own dismiss
 * path — its backdrop, or its close button — so a drawer that guards dismissal
 * keeps guarding it. If the sheet is still on screen shortly after, the swipe is
 * treated as refused and it slides back into place.
 */
const SHEET_SELECTOR = '.drawer-mobile-responsive, .modal-sheet-mobile';

/** Past this far, or this fast, the sheet goes. */
const DISTANCE_PX = 96;
const FLICK_PX = 40;
const FLICK_VELOCITY = 0.5; // px per ms
/** Below this the gesture is still ambiguous between a scroll and a drag. */
const DIRECTION_SLOP = 8;

/**
 * A downward drag must not steal a scroll: walk from the touch target up to the
 * sheet and, if anything on the way scrolls vertically, only start the drag when
 * that thing is already at its top.
 */
function scrollableAtTop(from: Element | null, sheet: HTMLElement): boolean {
  let el: Element | null = from;
  while (el && el !== sheet) {
    const node = el as HTMLElement;
    if (node.scrollHeight > node.clientHeight + 1) {
      const overflowY = getComputedStyle(node).overflowY;
      if (overflowY === 'auto' || overflowY === 'scroll') return node.scrollTop <= 0;
    }
    el = el.parentElement;
  }
  if (sheet.scrollHeight > sheet.clientHeight + 1) return sheet.scrollTop <= 0;
  return true;
}

/**
 * The sheet's own way out, in order of how deliberate it is: an explicit opt-in
 * hook, then the backdrop it sits on, then the close button in its header.
 */
function dismiss(sheet: HTMLElement): boolean {
  const optIn = sheet.querySelector<HTMLElement>('[data-swipe-dismiss]');
  if (optIn) { optIn.click(); return true; }

  // Backdrops are the dimmed layer the sheet sits on — its parent, or a sibling
  // rendered just before it.
  const candidates = [sheet.parentElement, sheet.previousElementSibling, sheet.parentElement?.previousElementSibling];
  for (const c of candidates) {
    if (c instanceof HTMLElement && /bg-black\//.test(c.className)) { c.click(); return true; }
  }

  const closeButton = sheet.querySelector<HTMLElement>(
    'button[aria-label="Close" i], button[title="Close" i], button[aria-label*="close" i]',
  );
  if (closeButton) { closeButton.click(); return true; }
  return false;
}

export function SwipeToDismissSheets() {
  useEffect(() => {
    let sheet: HTMLElement | null = null;
    let startX = 0;
    let startY = 0;
    let startedAt = 0;
    let offset = 0;
    let dragging = false;
    let decided = false;

    const release = () => {
      if (sheet) {
        sheet.style.transition = '';
        sheet.style.transform = '';
        sheet.style.willChange = '';
      }
      sheet = null;
      dragging = false;
      decided = false;
      offset = 0;
    };

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      // Only the phone layout stacks these at the bottom edge; from sm up the
      // same class is a side drawer, where a downward swipe means nothing.
      if (!window.matchMedia('(max-width: 639px)').matches) return;

      const target = e.target as Element | null;
      const found = target?.closest<HTMLElement>(SHEET_SELECTOR);
      if (!found || found.hasAttribute('data-no-swipe-dismiss')) return;
      // A control the finger is meant to drag keeps the gesture.
      if (target?.closest('input[type="range"], [data-no-swipe-dismiss]')) return;

      sheet = found;
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
      startedAt = e.timeStamp;
      offset = 0;
      dragging = false;
      decided = false;
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!sheet || e.touches.length !== 1) return;
      const dx = e.touches[0].clientX - startX;
      const dy = e.touches[0].clientY - startY;

      if (!decided) {
        if (Math.abs(dx) < DIRECTION_SLOP && Math.abs(dy) < DIRECTION_SLOP) return;
        decided = true;
        // Downward, mostly vertical, and nothing underneath still to scroll.
        const isDownwardDrag = dy > 0 && Math.abs(dy) > Math.abs(dx);
        if (!isDownwardDrag || !scrollableAtTop(e.target as Element, sheet)) { sheet = null; return; }
        dragging = true;
        sheet.style.transition = 'none';
        sheet.style.willChange = 'transform';
      }
      if (!dragging) return;

      offset = Math.max(0, dy);
      sheet.style.transform = `translateY(${offset}px)`;
      // Stop the page behind from scrolling with the finger.
      if (e.cancelable) e.preventDefault();
    };

    const onTouchEnd = (e: TouchEvent) => {
      if (!sheet || !dragging) { release(); return; }
      const el = sheet;
      const velocity = offset / Math.max(1, e.timeStamp - startedAt);
      const leaving = offset > DISTANCE_PX || (offset > FLICK_PX && velocity > FLICK_VELOCITY);

      if (!leaving) {
        el.style.transition = 'transform 0.18s ease-out';
        el.style.transform = '';
        window.setTimeout(() => { el.style.transition = ''; el.style.willChange = ''; }, 200);
        release();
        return;
      }

      el.style.transition = 'transform 0.2s ease-in';
      el.style.transform = `translateY(${el.getBoundingClientRect().height}px)`;
      const closed = dismiss(el);
      // A sheet that declined to close (unsaved work, say) is still here — put
      // it back rather than leaving it parked off screen.
      window.setTimeout(() => {
        if (!closed || el.isConnected) {
          el.style.transition = 'transform 0.18s ease-out';
          el.style.transform = '';
          window.setTimeout(() => { el.style.transition = ''; el.style.willChange = ''; }, 200);
        }
      }, 220);
      release();
    };

    document.addEventListener('touchstart', onTouchStart, { passive: true });
    document.addEventListener('touchmove', onTouchMove, { passive: false });
    document.addEventListener('touchend', onTouchEnd, { passive: true });
    document.addEventListener('touchcancel', release, { passive: true });
    return () => {
      document.removeEventListener('touchstart', onTouchStart);
      document.removeEventListener('touchmove', onTouchMove);
      document.removeEventListener('touchend', onTouchEnd);
      document.removeEventListener('touchcancel', release);
    };
  }, []);

  return null;
}
