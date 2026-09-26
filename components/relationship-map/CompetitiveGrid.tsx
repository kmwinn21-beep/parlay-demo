'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { VendorRelationshipCard, type VendorRelationship } from '@/components/VendorRelationshipCard';
import {
  byRecency, hasAnySignal, ROW_LABELS, SIGNAL_PILL_LABELS, SIGNAL_TONE,
  type AlternativePair, type GridRow, type SignalCell, type SignalKey,
} from '@/lib/competitiveSignals';
import type { CompetitorColumn } from '@/components/relationship-map/CompetitiveRail';
import type { UserOption } from '@/lib/useUserOptions';

/** Top to bottom: who is in play now, who is settled, who just moved. */
const ROW_ORDER: GridRow[] = ['activeEvaluation', 'useCompetitor', 'recentChange'];

/**
 * Four columns and a row label, inside the modal, without a horizontal scroll.
 *
 * The modal caps at 1360px and the rail takes 288 of it, leaving about 1030 for
 * the canvas. 92 + 4 x 232 is 1020. Wider columns look better with two or three
 * competitors and push the fourth off the edge, and a column you have to scroll
 * to is a column you cannot compare against — which is the entire point of the
 * grid. minmax lets them grow past this when there are fewer.
 */
const COL_WIDTH = 232;
const LABEL_WIDTH = 92;

/**
 * Accounts by competitor and by what the relationship is.
 *
 * Columns are competitors, rows are the three states. The thing you read is a
 * ROW: the same account under two different columns is an account in play, and
 * that is why nothing here is deduplicated by company — cross-column repetition
 * is the feature, not a bug to collapse.
 *
 * The cards are the same VendorRelationshipCard the company record and the
 * pre-conference views render, collapsed. A lighter card built for this one
 * surface would be a second card to keep in step with the real one, and the
 * thread and the Update button are exactly what a rep wants once a cell has
 * told them where to look.
 */
export function CompetitiveGrid({
  cells, pairs, competitors, cardFor, nameOf,
  signalsOnly, activeSignals, showConnectors,
  userOptions, colorMaps, onUpdated,
}: {
  cells: SignalCell[];
  /** The account/competitor pairs the connectors are drawn from. */
  pairs: AlternativePair[];
  /** Visible columns, in order, already filtered by the rail. */
  competitors: CompetitorColumn[];
  cardFor: (companyId: number, competitorId: number) => VendorRelationship | undefined;
  nameOf: (companyId: number) => string;
  signalsOnly: boolean;
  activeSignals: Set<SignalKey>;
  showConnectors: boolean;
  userOptions: UserOption[];
  colorMaps: Record<string, Record<string, string | null>>;
  onUpdated?: () => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  /** The scrolled content, which the connectors are measured and drawn against. */
  const contentRef = useRef<HTMLDivElement>(null);
  /** Card header element per cell, for anchoring a connector on the header. */
  const headerRefs = useRef(new Map<string, HTMLElement>());
  const [hovered, setHovered] = useState<number | null>(null);
  const [lines, setLines] = useState<Line[]>([]);

  const visibleIds = useMemo(() => new Set(competitors.map(c => c.id)), [competitors]);

  /**
   * Which cells survive the rail's filters.
   *
   * Signals only drops every card carrying none. The three signal filters are
   * alternatives rather than conditions — picking two means "either", which is
   * what a row of toggles means to the person clicking them — and picking none
   * means no filter rather than nothing shown.
   */
  const shown = useMemo(() => cells.filter(c => {
    if (!visibleIds.has(c.competitorId)) return false;
    if (signalsOnly && !hasAnySignal(c)) return false;
    if (activeSignals.size > 0 && !Array.from(activeSignals).some(k => c.signals[k])) return false;
    return true;
  }), [cells, visibleIds, signalsOnly, activeSignals]);

  const byRowAndColumn = useMemo(() => {
    const map = new Map<string, SignalCell[]>();
    for (const c of shown) {
      const key = `${c.row}:${c.competitorId}`;
      const list = map.get(key) ?? [];
      list.push(c);
      map.set(key, list);
    }
    for (const [key, list] of Array.from(map.entries())) {
      // Recent Change is ordered by when it changed, because there the order IS
      // the information. The other two have no such clock, so they go
      // alphabetically — deterministic, and findable by eye.
      map.set(key, key.startsWith('recentChange:')
        ? list.slice().sort(byRecency)
        : list.slice().sort((a, b) => nameOf(a.companyId).localeCompare(nameOf(b.companyId))));
    }
    return map;
  }, [shown, nameOf]);

  /**
   * The connectors, measured from the DOM.
   *
   * Anchored on each card's HEADER rather than the card, because a card grows
   * when it is expanded and a line drawn to the middle of one would slide down
   * the moment somebody opened it. The header does not move.
   *
   * Only pairs whose BOTH ends survived the filters: half a connector pointing
   * at a column that is switched off is worse than none.
   */
  const measure = useCallback(() => {
    const host = contentRef.current;
    if (!host) { setLines([]); return; }
    // Against the CONTENT box, not the scrolling viewport. The overlay lives
    // inside the content and scrolls with it, so a line measured against the
    // viewport would be drawn at the right place once and slide out of true the
    // moment anybody scrolled.
    const origin = host.getBoundingClientRect();
    const next: Line[] = [];
    for (const p of pairs) {
      const a = headerRefs.current.get(`useCompetitor:${p.companyId}:${p.currentCompetitorId}`);
      const b = headerRefs.current.get(`activeEvaluation:${p.companyId}:${p.evaluatingCompetitorId}`);
      if (!a || !b) continue;
      const ra = a.getBoundingClientRect();
      const rb = b.getBoundingClientRect();
      next.push({
        key: `${p.companyId}:${p.currentCompetitorId}:${p.evaluatingCompetitorId}`,
        companyId: p.companyId,
        x1: ra.left - origin.left + ra.width / 2,
        y1: ra.top - origin.top + ra.height / 2,
        x2: rb.left - origin.left + rb.width / 2,
        y2: rb.top - origin.top + rb.height / 2,
      });
    }
    setLines(next);
  }, [pairs]);

  // Measured after layout rather than in an effect that runs alongside it, so a
  // line is never drawn against last render's positions.
  useLayoutEffect(measure, [measure, byRowAndColumn, competitors]);
  useEffect(() => {
    const host = scrollRef.current;
    const content = contentRef.current;
    if (!host || !content) return;
    // Cards change height when they expand, and the whole grid shifts with
    // them. Observing the host catches that as well as a window resize.
    const ro = new ResizeObserver(measure);
    ro.observe(host);
    ro.observe(content);
    Array.from(host.querySelectorAll('[data-card-header]')).forEach(el => ro.observe(el));
    host.addEventListener('scroll', measure);
    window.addEventListener('resize', measure);
    return () => {
      ro.disconnect();
      host.removeEventListener('scroll', measure);
      window.removeEventListener('resize', measure);
    };
  }, [measure, byRowAndColumn]);

  if (competitors.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-sm text-gray-400">No competitors shown. Pick one in the rail.</p>
      </div>
    );
  }
  if (shown.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-sm text-gray-400">
          {signalsOnly || activeSignals.size > 0
            ? 'No relationships match these filters.'
            : 'No competitor relationships to compare.'}
        </p>
      </div>
    );
  }

  const gridTemplate = `${LABEL_WIDTH}px repeat(${competitors.length}, minmax(${COL_WIDTH}px, 1fr))`;

  return (
    <div
      ref={scrollRef}
      className="view-competitive flex-1 min-h-0 overflow-auto scrollbar-desktop-thin relative rounded-xl border border-gray-200 bg-white"
    >
      <div ref={contentRef} className="relative" style={{ minWidth: 'min-content' }}>
        {/* Under the cards, over the background: a connector painted on top
            would run across the company names it is connecting. Inside the
            content rather than pinned to the scroller, so it scrolls with what
            it is pointing at. */}
        {(showConnectors || hovered !== null) && lines.length > 0 && (
          <svg aria-hidden className="absolute inset-0 w-full h-full pointer-events-none z-0">
            {lines.map(l => {
              const lit = hovered === l.companyId;
              if (!showConnectors && !lit) return null;
              return (
                <line
                  key={l.key}
                  x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2}
                  stroke={SIGNAL_TONE.evaluatingAlternatives}
                  strokeWidth={lit ? 2 : 1}
                  strokeDasharray={lit ? undefined : '4 3'}
                  opacity={lit ? 0.9 : 0.35}
                />
              );
            })}
          </svg>
        )}
        <div className="relative z-10">
        {/* Column headings. Sticky, because the grid scrolls in both directions
            and a column you have scrolled past is a column you cannot name. */}
        <div
          className="grid sticky top-0 z-10 bg-white/95 backdrop-blur-sm border-b border-gray-200"
          style={{ gridTemplateColumns: gridTemplate }}
        >
          <div className="px-2 py-2" />
          {competitors.map(c => (
            <div key={c.id} className="px-2 py-2 min-w-0 border-l border-gray-100">
              <p className="text-xs font-bold text-brand-primary font-serif truncate" title={c.name}>
                {c.name}
              </p>
              <p className="text-[10px] text-gray-400">
                {c.accountCount} account{c.accountCount === 1 ? '' : 's'}
              </p>
            </div>
          ))}
        </div>

        {ROW_ORDER.map(gridRow => {
          const rowCells = competitors.map(c => byRowAndColumn.get(`${gridRow}:${c.id}`) ?? []);
          // A band with nothing in it anywhere is dropped rather than left as
          // three empty cells of vertical space.
          if (rowCells.every(list => list.length === 0)) return null;
          return (
            <div
              key={gridRow}
              className="grid border-b border-gray-100 last:border-b-0"
              style={{ gridTemplateColumns: gridTemplate }}
            >
              <div className="px-2 py-2.5 sticky left-0 bg-white z-[5] border-r border-gray-100">
                <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 leading-tight">
                  {ROW_LABELS[gridRow]}
                </p>
              </div>
              {competitors.map((c, i) => (
                <div key={c.id} className="px-2 py-2.5 min-w-0 space-y-2 border-l border-gray-100">
                  {rowCells[i].map(cell => {
                    const rel = cardFor(cell.companyId, cell.competitorId);
                    const key = `${cell.row}:${cell.companyId}:${cell.competitorId}`;
                    if (!rel) {
                      // The resolution found a relationship the card query did
                      // not return. Said out loud rather than rendered as a gap
                      // — a missing card is the shape of a scoping bug.
                      return (
                        <p key={key} className="text-[11px] text-gray-400 italic px-1">
                          {nameOf(cell.companyId) || 'A company'} — card unavailable
                        </p>
                      );
                    }
                    return (
                      <div
                        key={key}
                        ref={el => {
                          const header = el?.querySelector('[data-card-header]') as HTMLElement | null;
                          if (header) headerRefs.current.set(key, header);
                          else headerRefs.current.delete(key);
                        }}
                        onMouseEnter={() => setHovered(cell.companyId)}
                        onMouseLeave={() => setHovered(h => (h === cell.companyId ? null : h))}
                      >
                        <VendorRelationshipCard
                          rel={rel}
                          userOptions={userOptions}
                          colorMaps={colorMaps}
                          onUpdated={onUpdated}
                          // The column already names the competitor. The card
                          // names the account, which is what the reader is
                          // looking for in a cell under that column.
                          title={nameOf(cell.companyId)}
                          leadingBadges={<SignalPills cell={cell} />}
                        />
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          );
        })}
        </div>
      </div>
    </div>
  );
}

interface Line {
  key: string;
  companyId: number;
  x1: number; y1: number; x2: number; y2: number;
}

/**
 * Why this card is in this cell.
 *
 * Leads the card's badge row, ahead of the status pills, because it is the
 * reason the grid drew the card at all. Nothing at all when the card carries no
 * signal — which happens with "Signals only" off, and an empty row of nothing
 * is better than a placeholder saying so.
 */
function SignalPills({ cell }: { cell: SignalCell }) {
  const on = (Object.keys(SIGNAL_PILL_LABELS) as SignalKey[]).filter(k => cell.signals[k]);
  if (on.length === 0) return null;
  return (
    <>
      {on.map(k => (
        <span
          key={k}
          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-semibold whitespace-nowrap"
          style={{ color: SIGNAL_TONE[k], backgroundColor: `${SIGNAL_TONE[k]}1A` }}
        >
          {SIGNAL_PILL_LABELS[k]}
        </span>
      ))}
    </>
  );
}
