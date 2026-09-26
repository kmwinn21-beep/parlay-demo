/**
 * What the competitive view highlights, and why each card survived a filter.
 *
 * Pure: no React, no queries, no clock of its own beyond the one passed in.
 * Everything it knows arrives as arguments, which is what lets the awkward
 * cases — a status nobody classified, a change nobody recorded — be tested
 * rather than argued about.
 *
 * Three signals:
 *
 *   evaluatingAlternatives  the account buys from one competitor and is trying
 *                           a different one at the same time. The matched pair
 *                           comes back with it, because the connector between
 *                           the two cells is drawn from that pair rather than
 *                           worked out again in the view.
 *   recentChange            the status changed inside the window. Not "the row
 *                           was touched" — see statusChangedAt below.
 *   internalRelationship    somebody here knows somebody there.
 */

/**
 * How long counts as recent, for every signal that asks.
 *
 * One constant. The status-change window and the meeting/touchpoint window are
 * the same ninety days, and two constants that happen to be equal today are two
 * constants that disagree later.
 */
export const RECENT_DAYS = 90;

/**
 * What a relationship status means, taken from config_options.action_key.
 *
 * Never inferred from the display value. Accounts rename these, and a rename
 * would silently change which accounts the view believes are being poached
 * from. A status with no key is unclassified and takes part in nothing.
 */
export type StatusClass = 'current' | 'evaluating' | 'former';

/** Grid rows. Keys, not labels — see ROW_LABELS. */
export type GridRow = 'activeEvaluation' | 'useCompetitor' | 'recentChange';

/** Signals. Keys, not labels — see SIGNAL_LABELS. */
export type SignalKey = 'evaluatingAlternatives' | 'recentChange' | 'internalRelationship';

/**
 * Display strings, in one place.
 *
 * Render sites read from here so a wording change is one edit. "Recent Change"
 * deliberately appears in both maps and they are not the same thing: the row
 * holds relationships the account has moved away from, the signal marks any
 * card whose status changed lately — including one sitting in Use Competitor
 * because it switched TO this competitor.
 */
export const ROW_LABELS: Record<GridRow, string> = {
  activeEvaluation: 'Active Evaluation',
  useCompetitor: 'Use Competitor',
  recentChange: 'Recent Change',
};

export const SIGNAL_LABELS: Record<SignalKey, string> = {
  evaluatingAlternatives: 'Evaluating Alternatives',
  recentChange: 'Recent Change',
  internalRelationship: 'Int. Relationship',
};

/** The same names at pill width, where the long form does not fit. */
export const SIGNAL_PILL_LABELS: Record<SignalKey, string> = {
  evaluatingAlternatives: 'Evaluating Alt.',
  recentChange: 'Recent Change',
  internalRelationship: 'Int. Relationship',
};

/**
 * Which row a relationship sits in, by what its status means.
 *
 * Three classes, three rows, one each. A company in two rows is two different
 * relationships to two different competitors, which is the point of the grid
 * and is never deduplicated.
 */
const ROW_FOR_CLASS: Record<StatusClass, GridRow> = {
  evaluating: 'activeEvaluation',
  current: 'useCompetitor',
  former: 'recentChange',
};

export interface SignalRelationship {
  id: number;
  companyId: number;
  competitorId: number;
  /** null when the status carries no action_key. Never guessed from the words. */
  statusClass: StatusClass | null;
  /**
   * When the status last changed, or null.
   *
   * null means no known change — not a change long ago, and not the epoch. The
   * backfill could only see changes logged through the update form, so a status
   * changed through the edit form before this column existed reads as null.
   * Treating null as an old change would be wrong; treating it as a recent one
   * would be worse.
   */
  statusChangedAt?: string | null;
}

export interface SignalInput {
  relationships: SignalRelationship[];
  /** Companies with an internal relationship. No window: a standing fact. */
  companiesWithInternal?: Iterable<number>;
  /**
   * Company id → the most recent meeting or touchpoint, as a timestamp.
   *
   * The most recent one only, because the window is applied here rather than
   * in the query — that keeps RECENT_DAYS in one place and makes the boundary
   * testable without a database.
   */
  lastActivityByCompany?: Record<number, string | null>;
  now?: Date;
}

/** The two competitors an account is caught between. */
export interface AlternativePair {
  companyId: number;
  currentCompetitorId: number;
  evaluatingCompetitorId: number;
}

export interface SignalCell {
  relationshipId: number;
  companyId: number;
  competitorId: number;
  statusClass: StatusClass;
  row: GridRow;
  signals: Record<SignalKey, boolean>;
}

export interface SignalResult {
  cells: SignalCell[];
  pairs: AlternativePair[];
  /**
   * Relationships on a status nobody classified.
   *
   * Reported rather than dropped quietly. A view that silently ignores twelve
   * relationships looks the same as one with nothing to show, and the rail says
   * which it is.
   */
  unclassifiedCount: number;
}

/**
 * Days between a stored timestamp and now, or null when there is no usable one.
 *
 * Stored as UTC without a zone marker, so the Z is added before parsing —
 * otherwise it reads as local and the age drifts by the offset. The same fix
 * the staleness module makes.
 */
export function daysSince(raw: string | null | undefined, now: Date): number | null {
  const value = String(raw ?? '').trim();
  if (!value) return null;
  const d = new Date(value.endsWith('Z') ? value : `${value.replace(' ', 'T')}Z`);
  if (isNaN(d.getTime())) return null;
  const ms = now.getTime() - d.getTime();
  // A stamp in the future is not old. Clock skew between a tenant's database
  // and the browser is small but real.
  return ms < 0 ? 0 : ms / (1000 * 60 * 60 * 24);
}

/** True when a timestamp falls inside the window. Null never does. */
export function isRecent(raw: string | null | undefined, now: Date): boolean {
  const days = daysSince(raw, now);
  return days !== null && days <= RECENT_DAYS;
}

/**
 * Every account's signals, per competitor.
 *
 * A relationship whose status has no class is counted and otherwise ignored: it
 * gets no cell, no row and no part in any pair. Guessing from the words is how
 * a renamed status quietly changes what the view believes.
 */
export function deriveSignals(input: SignalInput): SignalResult {
  const now = input.now ?? new Date();
  const withInternal = new Set(input.companiesWithInternal ?? []);
  const lastActivity = input.lastActivityByCompany ?? {};

  const classified: Array<SignalRelationship & { statusClass: StatusClass }> = [];
  let unclassifiedCount = 0;
  for (const r of input.relationships) {
    if (r.statusClass === 'current' || r.statusClass === 'evaluating' || r.statusClass === 'former') {
      classified.push(r as SignalRelationship & { statusClass: StatusClass });
    } else {
      unclassifiedCount++;
    }
  }

  // The self-join, once, per company. Current with one competitor and
  // evaluating a different one — the same competitor on both sides is an
  // account trying more of what it already buys, not an account in play.
  const pairs: AlternativePair[] = [];
  const byCompany = new Map<number, Array<SignalRelationship & { statusClass: StatusClass }>>();
  for (const r of classified) {
    const list = byCompany.get(r.companyId) ?? [];
    list.push(r);
    byCompany.set(r.companyId, list);
  }
  for (const [companyId, rels] of Array.from(byCompany.entries())) {
    const current = rels.filter(r => r.statusClass === 'current');
    const evaluating = rels.filter(r => r.statusClass === 'evaluating');
    for (const c of current) {
      for (const e of evaluating) {
        if (c.competitorId === e.competitorId) continue;
        pairs.push({
          companyId,
          currentCompetitorId: c.competitorId,
          evaluatingCompetitorId: e.competitorId,
        });
      }
    }
  }

  // Which competitors each company is caught between, for flagging the cells.
  const inPair = new Set<string>();
  for (const p of pairs) {
    inPair.add(`${p.companyId}:${p.currentCompetitorId}`);
    inPair.add(`${p.companyId}:${p.evaluatingCompetitorId}`);
  }

  const cells: SignalCell[] = classified.map(r => ({
    relationshipId: r.id,
    companyId: r.companyId,
    competitorId: r.competitorId,
    statusClass: r.statusClass,
    row: ROW_FOR_CLASS[r.statusClass],
    signals: {
      evaluatingAlternatives: inPair.has(`${r.companyId}:${r.competitorId}`),
      recentChange: isRecent(r.statusChangedAt, now),
      internalRelationship:
        withInternal.has(r.companyId) || isRecent(lastActivity[r.companyId], now),
    },
  }));

  return { cells, pairs, unclassifiedCount };
}

/** How many cells carry each signal, for the rail's filter counts. */
export function countSignals(cells: SignalCell[]): Record<SignalKey, number> {
  const counts: Record<SignalKey, number> = {
    evaluatingAlternatives: 0, recentChange: 0, internalRelationship: 0,
  };
  for (const c of cells) {
    for (const k of Object.keys(counts) as SignalKey[]) {
      if (c.signals[k]) counts[k]++;
    }
  }
  return counts;
}

/** True when a cell carries any signal at all — what "Signals only" filters on. */
export function hasAnySignal(cell: SignalCell): boolean {
  return Object.values(cell.signals).some(Boolean);
}
