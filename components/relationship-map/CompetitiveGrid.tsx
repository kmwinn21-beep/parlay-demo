'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { VendorRelationshipCard, type VendorRelationship } from '@/components/VendorRelationshipCard';
import {
  byRecency, hasAnySignal, ROW_LABELS, SIGNAL_ABBREVIATIONS, SIGNAL_FULL_LABELS, SIGNAL_TONE,
  type AlternativePair, type GridRow, type SignalCell, type SignalKey, type SwitchPair,
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
 * How tall an open card's body may get before it scrolls itself.
 *
 * Measured, not picked: an expanded card with a real note and a thread grew its
 * band from 108px to 410px, and two open in one band would be most of the
 * canvas. The alternative was moving the body into a detail rail, which is the
 * wrong trade — the rail would cost about 320px, taking the four columns from
 * 232px to about 175px where most company names clip, and the four-column
 * comparison across a row is the entire reason this is a grid rather than a
 * list. Losing that to avoid vertical scroll gives up the thing to save the
 * thing it needs.
 *
 * One constant, passed to the card. The card has no opinion about it, and a
 * second copy of the number is a second number.
 */
const GRID_BODY_MAX_HEIGHT = 240;

/**
 * The signals a connector is drawn for.
 *
 * Named rather than written into each place that draws or lights something, so
 * a third is a list entry rather than a hunt.
 */
const CONNECTOR_SIGNALS: SignalKey[] = ['evaluatingAlternatives', 'switched'];

/** Space between a card's edge and the arrowhead pointing at it. */
const CONNECTOR_GAP = 7;

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
  cells, pairs, switches, competitors, cardFor, nameOf, typesOf, statusesOf,
  signalsOnly, activeSignals, showConnectors,
  userOptions, colorMaps, onUpdated,
}: {
  cells: SignalCell[];
  /** The account/competitor pairs the connectors are drawn from. */
  pairs: AlternativePair[];
  /** Switches a rep recorded, which the second connector is drawn from. */
  switches: SwitchPair[];
  /** Visible columns, in order, already filtered by the rail. */
  competitors: CompetitorColumn[];
  cardFor: (companyId: number, competitorId: number) => VendorRelationship | undefined;
  /* The card's subject here is the ACCOUNT, not the competitor the column names
     — so its name, its types and the status as IT reads them all come from the
     caller together. Half of that is worse than none: a card headed with the
     account showing the competitor's type and status is three false claims
     about the account. See the props on VendorRelationshipCard. */
  nameOf: (companyId: number) => string;
  typesOf: (companyId: number) => string[];
  statusesOf: (card: VendorRelationship) => string[];
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
  /**
   * The account whose connected cells are lit, or null.
   *
   * Set only from a card that actually carries the connector signal. Hovering
   * an account's third, unconnected card would otherwise light two cells
   * somewhere else on screen and grey out the one under the cursor.
   */
  const [hovered, setHovered] = useState<{ companyId: number; signal: SignalKey } | null>(null);
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

    /* Nearest sides, not centres. A line into the middle of a card runs across
       the company name it is pointing at, and its arrowhead lands underneath
       the card rather than against it.

       `toKey` marks the end a switch points AT, so the single arrowhead stays
       on the new vendor whichever side of the grid it happens to sit. */
    const join = (
      key: string, companyId: number, signal: SignalKey,
      fromKey: string, toKey: string, directional: boolean,
    ) => {
      const a = headerRefs.current.get(fromKey);
      const b = headerRefs.current.get(toKey);
      if (!a || !b) return;
      const ra = a.getBoundingClientRect();
      const rb = b.getBoundingClientRect();
      const aIsLeft = ra.left <= rb.left;
      const [left, right] = aIsLeft ? [ra, rb] : [rb, ra];
      next.push({
        key, companyId, signal,
        x1: left.right - origin.left + CONNECTOR_GAP,
        y1: left.top - origin.top + left.height / 2,
        x2: right.left - origin.left - CONNECTOR_GAP,
        y2: right.top - origin.top + right.height / 2,
        // An alternatives pair has no first and second — the account is caught
        // between two — so both ends get a head. A switch has a direction and
        // gets one, on the end it moved to.
        arrowStart: !directional || !aIsLeft,
        arrowEnd: !directional || aIsLeft,
      });
    };

    for (const p of pairs) {
      join(
        `ea:${p.companyId}:${p.currentCompetitorId}:${p.evaluatingCompetitorId}`,
        p.companyId, 'evaluatingAlternatives',
        `useCompetitor:${p.companyId}:${p.currentCompetitorId}`,
        `activeEvaluation:${p.companyId}:${p.evaluatingCompetitorId}`,
        false,
      );
    }
    for (const sw of switches) {
      join(
        `sw:${sw.companyId}:${sw.fromCompetitorId}:${sw.toCompetitorId}`,
        sw.companyId, 'switched',
        `recentChange:${sw.companyId}:${sw.fromCompetitorId}`,
        `useCompetitor:${sw.companyId}:${sw.toCompetitorId}`,
        true,
      );
    }
    setLines(next);
  }, [pairs, switches]);

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
            it is pointing at.

            Only when asked for. Hovering used to draw one of these too, and a
            line that appears under the cursor and vanishes cannot be followed
            — hover lights the two cards instead, which is the same fact said
            where the reader is already looking. */}
        {showConnectors && lines.length > 0 && (
          <svg aria-hidden className="absolute inset-0 w-full h-full pointer-events-none z-0">
            <defs>
              {/* One head per signal, because a marker cannot inherit the
                  line's stroke. auto-start-reverse so a head at the start
                  points outwards rather than back along the line. */}
              {CONNECTOR_SIGNALS.map(sig => (
                <marker
                  key={sig}
                  id={`competitive-arrow-${sig}`}
                  viewBox="0 0 10 10" refX="8" refY="5"
                  markerWidth="5" markerHeight="5"
                  orient="auto-start-reverse"
                >
                  <path d="M 0 0 L 10 5 L 0 10 z" fill={SIGNAL_TONE[sig]} />
                </marker>
              ))}
            </defs>
            {lines.map(l => (
              <line
                key={l.key}
                x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2}
                stroke={SIGNAL_TONE[l.signal]}
                strokeWidth={2.5}
                strokeDasharray="6 4"
                // A line recedes with the cards it joins. Left bright over two
                // greyed cards it points at an account the hover is saying to
                // ignore, which is the opposite of what the greying is for.
                opacity={hovered === null
                  || (hovered.companyId === l.companyId && hovered.signal === l.signal)
                  ? 0.9 : 0.15}
                markerStart={l.arrowStart ? `url(#competitive-arrow-${l.signal})` : undefined}
                markerEnd={l.arrowEnd ? `url(#competitive-arrow-${l.signal})` : undefined}
              />
            ))}
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
                        // Only a card that carries the connector signal starts a
                        // hover. Any other card of the same account would light
                        // two cells elsewhere and dim the one being pointed at.
                        // The first connector signal this card carries. Only a
                        // card that carries one starts a hover: any other card
                        // of the same account would light two cells elsewhere
                        // and dim the one being pointed at.
                        onMouseEnter={() => {
                          const sig = CONNECTOR_SIGNALS.find(k => cell.signals[k]);
                          if (sig) setHovered({ companyId: cell.companyId, signal: sig });
                        }}
                        onMouseLeave={() => setHovered(h => (h?.companyId === cell.companyId ? null : h))}
                        className={`transition-opacity ${
                          hovered !== null && !isLit(cell, hovered) ? 'opacity-30' : ''}`}
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
                          typeBadges={typesOf(cell.companyId)}
                          statuses={statusesOf(rel)}
                          bodyMaxHeight={GRID_BODY_MAX_HEIGHT}
                          titleBadges={<SignalBadges cell={cell} />}
                          highlight={isLit(cell, hovered) ? SIGNAL_TONE[hovered!.signal] : null}
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

/**
 * Whether a cell is one of the two ends the hover is pointing at.
 *
 * The same account carrying the connector signal, which is both halves of the
 * pair and nothing else — its other relationships are not what the hover is
 * about, and cross-column repetition only reads as a pair when the pair alone
 * is lit.
 */
function isLit(
  cell: SignalCell, hovered: { companyId: number; signal: SignalKey } | null,
): boolean {
  return hovered !== null
    && cell.companyId === hovered.companyId
    && cell.signals[hovered.signal];
}

interface Line {
  key: string;
  companyId: number;
  signal: SignalKey;
  x1: number; y1: number; x2: number; y2: number;
  arrowStart: boolean;
  arrowEnd: boolean;
}

/**
 * Why this card is in this cell.
 *
 * Two letters in a circle, beside the company name. Shared with the legend at
 * the foot of the grid, which is the same badge with the name spelled out — so
 * a reader meeting "EA" for the first time has somewhere to look, and the two
 * cannot drift into different shapes.
 *
 * Nothing at all when the card carries no signal, which happens with "Signals
 * only" off. An empty row is better than a placeholder saying it is empty.
 */
function SignalBadges({ cell }: { cell: SignalCell }) {
  const on = (Object.keys(SIGNAL_ABBREVIATIONS) as SignalKey[]).filter(k => cell.signals[k]);
  if (on.length === 0) return null;
  return (
    <>
      {on.map(k => <SignalBadge key={k} signal={k} />)}
    </>
  );
}

/** The badge itself, so the card and the legend draw one thing. */
export function SignalBadge({ signal }: { signal: SignalKey }) {
  return (
    <span
      className="inline-flex items-center justify-center w-[18px] h-[18px] rounded-full text-[9px] font-bold leading-none"
      style={{ color: SIGNAL_TONE[signal], backgroundColor: `${SIGNAL_TONE[signal]}1F` }}
      // The full name on hover. A tooltip repeating the two letters already on
      // screen tells the one reader who needed it nothing.
      title={SIGNAL_FULL_LABELS[signal]}
    >
      {SIGNAL_ABBREVIATIONS[signal]}
    </span>
  );
}
