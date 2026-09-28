'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  SIGNAL_ABBREVIATIONS, SIGNAL_FULL_LABELS, SIGNAL_KEYS, SIGNAL_TONE,
  type SignalKey,
} from '@/lib/competitiveSignals';

/** How long the spread names stay up before folding back. */
const EXPAND_MS = 3000;

/**
 * A company's competitive signals as a stack of two-letter badges, each
 * overlapping the one before it.
 *
 * The same shape as the rep pills in the meetings table, and for the same
 * reason: several marks on one row, in a column that cannot afford the width
 * of their names. Clicking spreads them into the full names for a few seconds
 * and folds itself back — on a touch screen there is no hover to read a title
 * with, and a second tap to close is a second thing to know.
 *
 * Folds back after three seconds rather than the rep pills' five. There are at
 * most four of these and they are two letters each, so the spread row is read
 * in a glance; five seconds of a row that has widened is longer than anybody
 * needs it.
 */
export function CompanySignalBadges({ signals, emptyLabel = '—', onWidthChange }: {
  signals: SignalKey[] | undefined;
  emptyLabel?: string | null;
  /**
   * How much room the spread names need, or null once they fold back.
   *
   * The companies table lays out fixed, so a cell cannot widen to its own
   * contents the way the meetings table's can — the column has to be told. The
   * width is MEASURED rather than guessed: four full names is about 470px and
   * one is about 130, so a single number would be far too wide almost always or
   * too narrow exactly when it mattered.
   */
  onWidthChange?: (px: number | null) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rowRef = useRef<HTMLSpanElement>(null);
  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  /*
   * Measured as it spreads, not once when it starts.
   *
   * The badges widen over 300ms, so a single reading taken when the class
   * changes is of the row still at its folded size — the column grew by about
   * a fifth of what it needed and clipped the rest. Watching the row instead
   * reports every frame of the widening, so the column moves with it, which is
   * what the meetings table gets for nothing from an auto layout.
   *
   * No feedback loop: the row is inline-flex and sized by its own contents, so
   * the column widening underneath it does not change its width.
   */
  const report = useCallback((px: number | null) => onWidthChange?.(px), [onWidthChange]);
  useLayoutEffect(() => {
    if (!expanded) { report(null); return; }
    const el = rowRef.current;
    if (!el) return;
    const measure = () => report(Math.ceil(el.getBoundingClientRect().width));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [expanded, report]);
  // A row that unmounts mid-expansion would otherwise leave the column wide
  // with nothing in it.
  useEffect(() => () => onWidthChange?.(null), [onWidthChange]);

  // Through the declared order rather than whatever order they arrived in, so
  // a row of badges reads the same way down as the legend that explains them.
  const on = SIGNAL_KEYS.filter(k => signals?.includes(k));
  if (on.length === 0) {
    return emptyLabel ? <span className="text-gray-300">{emptyLabel}</span> : null;
  }

  const toggle = (e: React.MouseEvent | React.KeyboardEvent) => {
    // The row underneath usually opens something; reading the names shouldn't.
    e.stopPropagation();
    if (timerRef.current) clearTimeout(timerRef.current);
    if (expanded) { setExpanded(false); return; }
    setExpanded(true);
    timerRef.current = setTimeout(() => setExpanded(false), EXPAND_MS);
  };

  return (
    <span
      ref={rowRef}
      role="button"
      tabIndex={0}
      onClick={toggle}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(e); } }}
      title={expanded ? 'Hide names' : on.map(k => SIGNAL_FULL_LABELS[k]).join(', ')}
      aria-expanded={expanded}
      aria-label={on.map(k => SIGNAL_FULL_LABELS[k]).join(', ')}
      className="inline-flex items-center align-middle cursor-pointer whitespace-nowrap"
    >
      {on.map((k, i) => (
        <span
          key={k}
          style={{
            zIndex: on.length - i,
            color: SIGNAL_TONE[k],
            backgroundColor: `${SIGNAL_TONE[k]}1F`,
          }}
          /* The same element in both states: the width, the padding and the
             overlap all transition, so the stack spreads and the names appear
             in place rather than one row being swapped for another. */
          className={`relative inline-flex items-center justify-center rounded-full font-bold ring-2 ring-white flex-shrink-0 overflow-hidden whitespace-nowrap transition-all duration-300 ease-out ${
            expanded
              ? `h-5 max-w-[11rem] px-2 text-[10px] ${i > 0 ? 'ml-1' : ''}`
              : `w-5 h-5 max-w-[1.25rem] px-0 text-[9px] ${i > 0 ? '-ml-1.5' : ''}`
          }`}
        >
          {expanded ? SIGNAL_FULL_LABELS[k] : SIGNAL_ABBREVIATIONS[k]}
        </span>
      ))}
    </span>
  );
}
