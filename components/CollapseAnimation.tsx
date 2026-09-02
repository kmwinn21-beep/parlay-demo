'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';

/**
 * The two ways a section on a record page opens and closes.
 *
 * Both animate by measuring, because `max-height: none` is not a number and
 * cannot be transitioned from or to. Heights are re-measured with a
 * ResizeObserver, so a section whose contents grow while it is open — a note
 * expanding, a list loading — grows with them instead of clipping.
 */

/** How long the open/close takes, matched across every section. */
const DURATION_MS = 300;

/**
 * A section body that slides open and shut.
 *
 * The body stays mounted while closed, which is what makes the animation
 * possible at all: a conditionally rendered body has no height to animate from.
 * It is hidden from assistive tech and taken out of the tab order while closed
 * so a keyboard doesn't wander into it.
 */
export function AnimatedCollapse({ open, children, className = '' }: {
  open: boolean;
  children: ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  // `null` means no cap at all. A measured height is only needed for the
  // duration of the animation: `scrollHeight` does not include the last child's
  // bottom margin, so holding the measurement afterwards clips the bottom of
  // whatever is in there. Once open, the cap is released.
  const [maxHeight, setMaxHeight] = useState<number | null>(open ? null : 0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const height = Math.ceil(el.scrollHeight);
    if (open) {
      setMaxHeight(height);
      const t = setTimeout(() => setMaxHeight(null), DURATION_MS);
      return () => clearTimeout(t);
    }
    // Closing from an uncapped height needs a number to animate from, so the
    // measurement is applied first and zero only on the following frame.
    setMaxHeight(height);
    const raf = requestAnimationFrame(() => requestAnimationFrame(() => setMaxHeight(0)));
    return () => cancelAnimationFrame(raf);
  }, [open, children]);

  return (
    <div
      className={`overflow-hidden transition-[max-height,opacity] ease-out ${open ? 'opacity-100' : 'opacity-0'} ${className}`}
      style={{ maxHeight: maxHeight ?? undefined, transitionDuration: `${DURATION_MS}ms` }}
      aria-hidden={!open}
      // Closed, the body has no height but its children are still in the DOM;
      // without this, tabbing lands on controls nobody can see.
      inert={!open || undefined}
    >
      <div ref={ref}>{children}</div>
    </div>
  );
}

/**
 * A list that shows its first few rows and fades out, with a chevron below to
 * open the rest.
 *
 * The cut is measured from the rows themselves rather than set as a fixed
 * height: rows differ in height between records, and a hardcoded value would
 * land mid-row on one page and past the end on another. Callers mark their rows
 * with `data-collapse-row`.
 */
export function FadeCollapse({ children, rows = 2, peek = 20, className = '', label = 'list' }: {
  children: ReactNode;
  /** Rows shown in full before the cut; the next one is partly visible. */
  rows?: number;
  /** How much of the following row shows above the fade. */
  peek?: number;
  className?: string;
  /** Names the chevron for screen readers: "Expand <label>". */
  label?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  // Held only while the open animation runs — see AnimatedCollapse.
  const [openCapped, setOpenCapped] = useState(true);
  const [collapsedHeight, setCollapsedHeight] = useState<number | null>(null);
  const [fullHeight, setFullHeight] = useState<number | null>(null);
  // The fade covers the part-row at the cut and nothing above it — see below.
  const [fadeHeight, setFadeHeight] = useState(peek);
  const listRef = useRef<HTMLDivElement>(null);

  const measure = useCallback(() => {
    const list = listRef.current;
    if (!list) return;
    setFullHeight(Math.ceil(list.scrollHeight));
    // Only rows that are actually laid out: a section with a mobile card list
    // and a desktop table renders both and hides one, and the hidden one's rows
    // would otherwise be measured at zero height.
    const items = Array.from(list.querySelectorAll<HTMLElement>('[data-collapse-row]'))
      .filter(el => el.getClientRects().length > 0);
    // Nothing beyond the cut means nothing to collapse — no fade, no chevron.
    if (items.length <= rows) {
      setCollapsedHeight(null);
      return;
    }
    const listTop = list.getBoundingClientRect().top;
    const cutRow = items[rows];
    const cut = Math.round(cutRow.getBoundingClientRect().top - listTop + peek);
    setCollapsedHeight(cut);
    // The fade starts where the part-row does, rather than running a fixed
    // distance up from the bottom. A fixed fade is fine over the short text
    // lines of a timeline — the space above the cut is empty — but over a list
    // of cards it washes out the bottom of the card above, which reads as that
    // card being disabled rather than as the list continuing.
    setFadeHeight(Math.max(16, cut - Math.round(cutRow.getBoundingClientRect().top - listTop)));
  }, [rows, peek]);

  useLayoutEffect(() => {
    measure();
    const list = listRef.current;
    if (!list) return;
    const ro = new ResizeObserver(measure);
    ro.observe(list);
    return () => ro.disconnect();
  }, [measure, children]);

  useEffect(() => {
    if (!expanded) { setOpenCapped(true); return; }
    const t = setTimeout(() => setOpenCapped(false), DURATION_MS);
    return () => clearTimeout(t);
  }, [expanded]);

  const canCollapse = collapsedHeight != null;

  return (
    <div className={className}>
      <div
        className="relative overflow-hidden transition-[max-height] ease-out"
        style={{
          maxHeight: canCollapse
            ? (expanded ? (openCapped ? (fullHeight ?? undefined) : undefined) : collapsedHeight)
            : undefined,
          transitionDuration: `${DURATION_MS}ms`,
        }}
      >
        <div ref={listRef}>{children}</div>

        {/* Faded rather than unmounted, so it doesn't vanish a frame before the
            section has finished opening. */}
        {canCollapse && (
          <div
            className={`absolute inset-x-0 bottom-0 bg-gradient-to-t from-white to-transparent pointer-events-none transition-opacity ${
              expanded ? 'opacity-0' : 'opacity-100'
            }`}
            style={{ height: fadeHeight, transitionDuration: `${DURATION_MS}ms` }}
          />
        )}
      </div>

      {canCollapse && (
        <div className="flex justify-center pt-2">
          <button
            type="button"
            onClick={() => setExpanded(v => !v)}
            aria-expanded={expanded}
            aria-label={`${expanded ? 'Collapse' : 'Expand'} ${label}`}
            className="flex items-center justify-center w-8 h-8 rounded-full text-gray-400 hover:text-brand-secondary hover:bg-gray-50 transition-colors"
          >
            <svg className={`w-5 h-5 transition-transform ${expanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
        </div>
      )}
    </div>
  );
}
