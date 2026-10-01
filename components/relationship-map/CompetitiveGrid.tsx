'use client';

import { useMemo, useState } from 'react';
import { VendorRelationshipCard, type VendorRelationship } from '@/components/VendorRelationshipCard';
import {
  byRecency, hasAnySignal, ROW_LABELS, SIGNAL_ABBREVIATIONS, SIGNAL_FULL_LABELS,
  SIGNAL_OUTLINED, SIGNAL_TONE,
  type GridRow, type SignalCell, type SignalKey,
} from '@/lib/competitiveSignals';
import { getBadgeClass } from '@/lib/colors';
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
/**
 * Every rule in the grid, declared once.
 *
 * The bands and the columns are the thing being separated, so they are drawn
 * in one weight — a heading underlined more heavily than the column beside it
 * reads as two tables rather than one grid. Darker than the hairlines it
 * replaced, which disappeared entirely once the canvas stopped being white.
 */
const GRID_LINE = 'border-gray-400';
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
  cells, competitors, cardFor, nameOf, typesOf, statusesOf, onOpenCompany, onOpenInternal,
  signalsOnly, activeSignals, highlightSignals,
  userOptions, colorMaps, onUpdated,
}: {
  cells: SignalCell[];
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
  /** Opens a company's record beside the grid. Absent leaves names unclickable. */
  onOpenCompany?: (target: { id: number; name: string }) => void;
  /** Shows that company's internal relationships. Absent leaves IR unclickable. */
  onOpenInternal?: (companyId: number) => void;
  signalsOnly: boolean;
  activeSignals: Set<SignalKey>;
  /** Light every card carrying a signal at once, rather than one account on hover. */
  highlightSignals: boolean;
  userOptions: UserOption[];
  colorMaps: Record<string, Record<string, string | null>>;
  onUpdated?: () => void;
}) {
  /**
   * The account whose connected cells are lit, or null.
   *
   * Set only from a card that actually carries a connector signal. Hovering an
   * account's third, unconnected card would otherwise light two cells
   * somewhere else on screen and grey out the one under the cursor.
   */
  const [hovered, setHovered] = useState<{ companyId: number; signal: SignalKey } | null>(null);

  const visibleIds = useMemo(() => new Set(competitors.map(c => c.id)), [competitors]);

  /**
   * Which of the two connector signals a card carries, if any.
   *
   * First in CONNECTOR_SIGNALS order when it carries both — one card can be
   * weighing alternatives AND have switched, and it has one border.
   */
  const connectorSignalOf = (cell: SignalCell): SignalKey | null =>
    CONNECTOR_SIGNALS.find(k => cell.signals[k]) ?? null;

  /**
   * The colour a card is painted, or null for one that is not in play.
   *
   * Two ways in, and hovering wins. "Highlight signals" lights every
   * connected card at once, which answers "who is in play at all"; pointing at
   * one narrows it to that account's cards, which answers "what is THIS
   * account weighing". Leaving the broad highlight on under the cursor would
   * make the second question unanswerable.
   */
  const litWith = (cell: SignalCell): string | null => {
    if (hovered) return isLit(cell, hovered) ? SIGNAL_TONE[hovered.signal] : null;
    if (!highlightSignals) return null;
    const sig = connectorSignalOf(cell);
    return sig ? SIGNAL_TONE[sig] : null;
  };
  const anyHighlight = hovered !== null || highlightSignals;

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
    <div className="view-competitive flex-1 min-h-0 overflow-auto scrollbar-desktop-thin relative rounded-xl border border-gray-200 bg-gray-100">
      <div className="relative" style={{ minWidth: 'min-content' }}>
        {/* Column headings. Sticky, because the grid scrolls in both directions
            and a column you have scrolled past is a column you cannot name. */}
        <div
          className={`grid sticky top-0 z-10 bg-white/95 backdrop-blur-sm border-b ${GRID_LINE}`}
          style={{ gridTemplateColumns: gridTemplate }}
        >
          <div className="px-2 py-2" />
          {competitors.map(c => (
            <div key={c.id} className={`px-2 py-2 min-w-0 border-l ${GRID_LINE}`}>
              <div className="flex items-center gap-1.5 min-w-0">
                <p className="text-sm font-bold text-brand-primary font-serif truncate" title={c.name}>
                  {c.name}
                </p>
                {/* What the company IS, beside what it is called. The cards
                    below carry the ACCOUNT's type, so without this the column
                    never says its own — and "Competitor" on the heading is the
                    one place that word is worth reading. */}
                {c.types.slice(0, 1).map(t => (
                  <span key={t} className={`${getBadgeClass(t, colorMaps.company_type || {}, 'text-[10px]')} flex-shrink-0 whitespace-nowrap`}>
                    {t}
                  </span>
                ))}
              </div>
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
              className={`grid border-b ${GRID_LINE} last:border-b-0`}
              style={{ gridTemplateColumns: gridTemplate }}
            >
              <div className={`px-2 py-2.5 sticky left-0 bg-white z-[5] border-r ${GRID_LINE}`}>
                <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 leading-tight">
                  {ROW_LABELS[gridRow]}
                </p>
              </div>
              {competitors.map((c, i) => (
                <div key={c.id} className={`px-2 py-2.5 min-w-0 space-y-2 border-l ${GRID_LINE}`}>
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
                        // The first connector signal this card carries. Only a
                        // card that carries one starts a hover: any other card
                        // of the same account would light two cells elsewhere
                        // and dim the one being pointed at.
                        onMouseEnter={() => {
                          const sig = connectorSignalOf(cell);
                          if (sig) setHovered({ companyId: cell.companyId, signal: sig });
                        }}
                        onMouseLeave={() => setHovered(h => (h?.companyId === cell.companyId ? null : h))}
                        className={`transition-opacity ${
                          anyHighlight && litWith(cell) === null ? 'opacity-30' : ''}`}
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
                          titleBadges={
                            <SignalBadges cell={cell} onOpenInternal={onOpenInternal} />
                          }
                          highlight={litWith(cell)}
                          titleCompanyId={cell.companyId}
                          onOpenTitleCompany={onOpenCompany}
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
function SignalBadges({ cell, onOpenInternal }: {
  cell: SignalCell;
  onOpenInternal?: (companyId: number) => void;
}) {
  const on = (Object.keys(SIGNAL_ABBREVIATIONS) as SignalKey[]).filter(k => cell.signals[k]);
  if (on.length === 0) return null;
  return (
    <>
      {on.map(k => (
        <SignalBadge
          key={k}
          signal={k}
          // Only IR leads anywhere. The badge says somebody here knows somebody
          // there, and the column it opens is where you find out who — the
          // other two have nothing behind them to show.
          onClick={k === 'internalRelationship' && onOpenInternal
            ? () => onOpenInternal(cell.companyId)
            : undefined}
        />
      ))}
    </>
  );
}

/** The badge itself, so the card and the legend draw one thing. */
export function SignalBadge({ signal, onClick }: {
  signal: SignalKey;
  /** Makes it a button. Absent leaves it the plain mark the legend needs. */
  onClick?: () => void;
}) {
  const shared = 'inline-flex items-center justify-center w-[18px] h-[18px] rounded-full text-[9px] font-bold leading-none';
  // At Risk takes a border as well as a fill. Five badges in five tones read as
  // five facts of equal weight; the outline is what makes this one read as the
  // alarm it is. See SIGNAL_OUTLINED.
  const style = {
    color: SIGNAL_TONE[signal],
    backgroundColor: `${SIGNAL_TONE[signal]}1F`,
    border: SIGNAL_OUTLINED[signal] ? `1px solid ${SIGNAL_TONE[signal]}` : undefined,
  };
  // The full name on hover. A tooltip repeating the two letters already on
  // screen tells the one reader who needed it nothing.
  const label = SIGNAL_FULL_LABELS[signal];
  if (!onClick) {
    return <span className={shared} style={style} title={label}>{SIGNAL_ABBREVIATIONS[signal]}</span>;
  }
  return (
    <button
      type="button"
      // The header around it toggles the card, and a badge that both opened a
      // column and collapsed what you were reading would be two answers to one
      // click.
      onClick={e => { e.stopPropagation(); onClick(); }}
      title={`${label} — see who`}
      className={`${shared} hover:ring-2 hover:ring-offset-1 transition-shadow cursor-pointer`}
      style={{ ...style, '--tw-ring-color': SIGNAL_TONE[signal] } as React.CSSProperties}
    >
      {SIGNAL_ABBREVIATIONS[signal]}
    </button>
  );
}
