'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Shared open/shut state for the collapsible sections down a detail page's
 * side column, so one control can drive all of them.
 *
 * The sections don't share a parent — some are rendered by the page, others by
 * their own components — so rather than lift the state up, each one registers
 * itself here and Expand All walks the registry. A section that unmounts takes
 * itself out, which is what keeps the count honest when Section Management
 * hides one or a section renders nothing.
 */
interface Registration {
  expanded: boolean;
  set: (value: boolean) => void;
}

const sections = new Map<number, Registration>();

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

/** Below this the sections are stacked full-width and scrolling is the cost. */
const NARROW_MAX_W = 768;
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
 * Expanding something near the bottom of a phone screen leaves most of it
 * below the fold, and the person has to go looking for what they just asked
 * for. This scrolls by the least amount that shows the whole thing — or, when
 * the section is taller than the screen, puts its top near the top so they at
 * least start at the beginning.
 *
 * Only on narrow screens, and only when the tap that opened it was inside the
 * section itself, so Expand All doesn't send the page chasing after several
 * sections at once.
 */
function revealExpandedSection(): void {
  if (typeof window === 'undefined') return;
  if (window.innerWidth > NARROW_MAX_W) return;

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

/** Drop-in for useState(false) that also joins the registry. */
export function useCollapsibleSection(initial = false): [boolean, React.Dispatch<React.SetStateAction<boolean>>] {
  const [expanded, setExpanded] = useState(initial);
  const idRef = useRef(0);
  if (idRef.current === 0) idRef.current = ++nextId;
  const wasExpanded = useRef(initial);

  // Opening one is a request to read it, so make sure it can be read.
  useEffect(() => {
    const opened = expanded && !wasExpanded.current;
    wasExpanded.current = expanded;
    if (opened) revealExpandedSection();
  }, [expanded]);

  useEffect(() => {
    const id = idRef.current;
    sections.set(id, { expanded, set: v => setExpanded(v) });
    notify();
    return () => { sections.delete(id); notify(); };
  }, [expanded]);

  return [expanded, setExpanded];
}

/** True while at least one registered section is open. */
export function useAnySectionExpanded(): boolean {
  const [any, setAny] = useState(false);
  useEffect(() => {
    const update = () => setAny(Array.from(sections.values()).some(s => s.expanded));
    subscribers.add(update);
    update();
    return () => { subscribers.delete(update); };
  }, []);
  return any;
}

export function setAllSections(expand: boolean): void {
  sections.forEach(s => s.set(expand));
}
