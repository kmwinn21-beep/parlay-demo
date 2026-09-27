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
 *   switched                a rep recorded that this account left one
 *                           competitor for another. Never inferred: "they left
 *                           A for B" is a claim about cause, and two end-states
 *                           and a calendar cannot establish one. It arrives
 *                           because somebody was asked and answered.
 *   evaluatingAlternatives  the account is weighing two competitors against
 *                           each other — one they buy from against one they
 *                           are trying, or two trials against each other. The
 *                           matched pair comes back with it, because the
 *                           connector between the two cells is drawn from that
 *                           pair rather than worked out again in the view.
 *   recentChange            the status changed inside the window. Not "the row
 *                           was touched" — see statusChangedAt below.
 *   internalRelationship    somebody here knows somebody there. A standing
 *                           fact, so no window — and only that fact, never a
 *                           recent meeting standing in for it.
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
export type SignalKey =
  'evaluatingAlternatives' | 'switched' | 'recentChange' | 'internalRelationship';

/**
 * Display strings, in one place.
 *
 * Render sites read from here so a wording change is one edit.
 *
 * The row key is still recentChange and its label is not, deliberately. The two
 * were the same words once and they are not the same thing: the ROW holds
 * relationships the account has moved away from, while the SIGNAL marks any
 * card whose status changed lately, in any row, including one that changed
 * toward a competitor. Shown side by side they read as a contradiction, so the
 * row took the name that describes its contents. The key stays because it is
 * what the status class maps to.
 */
export const ROW_LABELS: Record<GridRow, string> = {
  activeEvaluation: 'Active Evaluation',
  useCompetitor: 'Use Competitor',
  // NOT "Recent Change", which this row was called until it was looked at
  // against data. The signal of that name lands on cards in ALL THREE rows —
  // including cards that changed TOWARD a competitor — so a reader saw Recent
  // Change pills sitting in Active Evaluation and reasonably asked why those
  // cards were not in the Recent Change row. The row holds accounts that left a
  // competitor, which is a different fact and now says so. It also parallels
  // Use Competitor, which is the row it is the past tense of.
  recentChange: 'Left Competitor',
};

export const SIGNAL_LABELS: Record<SignalKey, string> = {
  evaluatingAlternatives: 'Evaluating Alternatives',
  switched: 'Switched Vendors',
  recentChange: 'Recent Changes',
  internalRelationship: 'Internal Relationships',
};

/**
 * Two letters, for the badge beside a card's name.
 *
 * A card in a 232px column has no room for a row of worded pills beside the
 * company it is about. The badge says a signal is there and where to look; the
 * legend at the foot of the grid says what it means, which is why that one
 * spells the names out in full rather than repeating these.
 */
export const SIGNAL_ABBREVIATIONS: Record<SignalKey, string> = {
  evaluatingAlternatives: 'EA',
  switched: 'SW',
  recentChange: 'RC',
  internalRelationship: 'IR',
};

/**
 * The names spelled out, for the legend.
 *
 * Not SIGNAL_LABELS. Those head a filter row with a count beside it — "8
 * Recent Changes" — so they name a quantity and read plural. The legend names
 * the signal itself, once, in the singular, and is the one place a reader goes
 * to find out what IR means.
 */
export const SIGNAL_FULL_LABELS: Record<SignalKey, string> = {
  evaluatingAlternatives: 'Evaluating Alternatives',
  switched: 'Switched Vendors',
  recentChange: 'Recent Change',
  internalRelationship: 'Internal Relationship',
};

/**
 * One colour per signal, for the pill and the legend that explains it.
 *
 * Here rather than in either render site: a legend whose swatch does not match
 * the pill it describes is worse than no legend, and that is what two copies of
 * a colour drift into. Amber leads because an account caught between two
 * vendors is the one worth a call today.
 */
export const SIGNAL_TONE: Record<SignalKey, string> = {
  evaluatingAlternatives: '#D97706',
  switched: '#7C3AED',
  recentChange: '#2563EB',
  internalRelationship: '#059669',
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

/**
 * A switch a rep recorded: this account left one competitor for another.
 *
 * Directional, unlike an alternatives pair. An account caught between two
 * vendors has no first and second; one that moved does.
 */
export interface SwitchPair {
  companyId: number;
  fromCompetitorId: number;
  toCompetitorId: number;
}

export interface SignalInput {
  relationships: SignalRelationship[];
  /** Recorded switches. Not derived here, and not derivable — see SignalKey. */
  switches?: SwitchPair[];
  /**
   * Companies with an internal relationship. No window: a standing fact.
   *
   * Only this. A recent meeting or touchpoint deliberately does NOT light this
   * pill — the pill says "Int. Relationship", and a booth conversation is not
   * one. Lighting it for activity would make the label lie about what it found.
   * If recent activity earns a signal it comes back as its own, with its own
   * name; see BACKLOG.md.
   */
  companiesWithInternal?: Iterable<number>;
  now?: Date;
}

/** The two competitors an account is caught between. */
/** One end of a pair: which competitor, and the row its cell sits in. */
export interface PairEnd {
  competitorId: number;
  row: GridRow;
}

export interface AlternativePair {
  companyId: number;
  /**
   * The two competitors, in no meaningful order.
   *
   * Named a and b rather than current and evaluating because a pair is not
   * always one of each: an account weighing two trials against each other is
   * evaluating alternatives in the plainest sense of the words, and neither end
   * of that is the incumbent. The order is deterministic so the grid draws the
   * same line twice in a row, and carries no other meaning.
   *
   * Each end knows its row, so a connector can be drawn between any two cells
   * without the view working out where they landed.
   */
  a: PairEnd;
  b: PairEnd;
}

export interface SignalCell {
  relationshipId: number;
  companyId: number;
  competitorId: number;
  statusClass: StatusClass;
  row: GridRow;
  /** Carried through so a cell can be ordered by it. See byRecency. */
  statusChangedAt: string | null;
  signals: Record<SignalKey, boolean>;
}

export interface SignalResult {
  cells: SignalCell[];
  pairs: AlternativePair[];
  /**
   * The switches whose BOTH ends are on screen as cells.
   *
   * Half a connector points at a cell that is not there — a column switched
   * off, or a status that has moved on since — and reads as a bug rather than
   * as missing data.
   */
  switches: SwitchPair[];
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
  const switchPairs = input.switches ?? [];
  // Both ends of every recorded switch, so a cell knows it is one of them.
  const inSwitch = new Set<string>();
  for (const sw of switchPairs) {
    inSwitch.add(`${sw.companyId}:${sw.fromCompetitorId}`);
    inSwitch.add(`${sw.companyId}:${sw.toCompetitorId}`);
  }

  const classified: Array<SignalRelationship & { statusClass: StatusClass }> = [];
  let unclassifiedCount = 0;
  for (const r of input.relationships) {
    if (r.statusClass === 'current' || r.statusClass === 'evaluating' || r.statusClass === 'former') {
      classified.push(r as SignalRelationship & { statusClass: StatusClass });
    } else {
      unclassifiedCount++;
    }
  }

  /*
   * The self-join, once, per company. Two shapes count:
   *
   *   current x evaluating   they buy from one and are trying another
   *   evaluating x evaluating   they are trying two, against each other
   *
   * The second is the signal's own words taken literally, and it is the case a
   * rep most wants at a conference: nobody has won yet.
   *
   * Two CURRENTS are not a pair. An account running two vendors side by side
   * has decided; it is not weighing anything, and saying so would put the pill
   * on half the book.
   *
   * The same competitor on both sides is never a pair either — that is an
   * account trying more of what it already buys, not an account in play.
   */
  const pairs: AlternativePair[] = [];
  const byCompany = new Map<number, Array<SignalRelationship & { statusClass: StatusClass }>>();
  for (const r of classified) {
    const list = byCompany.get(r.companyId) ?? [];
    list.push(r);
    byCompany.set(r.companyId, list);
  }
  const end = (r: { competitorId: number; statusClass: StatusClass }): PairEnd =>
    ({ competitorId: r.competitorId, row: ROW_FOR_CLASS[r.statusClass] });
  for (const [companyId, rels] of Array.from(byCompany.entries())) {
    const current = rels.filter(r => r.statusClass === 'current');
    const evaluating = rels.filter(r => r.statusClass === 'evaluating');
    for (const c of current) {
      for (const e of evaluating) {
        if (c.competitorId === e.competitorId) continue;
        pairs.push({ companyId, a: end(c), b: end(e) });
      }
    }
    // Every unordered pair of evaluations, once. i < j rather than a seen-set:
    // (A,B) and (B,A) are one fact, and emitting both would draw the same line
    // twice and count the signal twice in the rail.
    for (let i = 0; i < evaluating.length; i++) {
      for (let j = i + 1; j < evaluating.length; j++) {
        if (evaluating[i].competitorId === evaluating[j].competitorId) continue;
        pairs.push({ companyId, a: end(evaluating[i]), b: end(evaluating[j]) });
      }
    }
  }

  // Which competitors each company is caught between, for flagging the cells.
  const inPair = new Set<string>();
  for (const p of pairs) {
    inPair.add(`${p.companyId}:${p.a.competitorId}`);
    inPair.add(`${p.companyId}:${p.b.competitorId}`);
  }

  const cells: SignalCell[] = classified.map(r => ({
    relationshipId: r.id,
    companyId: r.companyId,
    competitorId: r.competitorId,
    statusClass: r.statusClass,
    row: ROW_FOR_CLASS[r.statusClass],
    statusChangedAt: r.statusChangedAt ?? null,
    signals: {
      evaluatingAlternatives: inPair.has(`${r.companyId}:${r.competitorId}`),
      switched: inSwitch.has(`${r.companyId}:${r.competitorId}`),
      recentChange: isRecent(r.statusChangedAt, now),
      internalRelationship: withInternal.has(r.companyId),
    },
  }));

  const drawn = new Set(cells.map(c => `${c.companyId}:${c.competitorId}`));
  const switches = switchPairs.filter(sw =>
    drawn.has(`${sw.companyId}:${sw.fromCompetitorId}`)
      && drawn.has(`${sw.companyId}:${sw.toCompetitorId}`));

  return { cells, pairs, switches, unclassifiedCount };
}

/** How many cells carry each signal, for the rail's filter counts. */
export function countSignals(cells: SignalCell[]): Record<SignalKey, number> {
  const counts: Record<SignalKey, number> = {
    evaluatingAlternatives: 0, switched: 0, recentChange: 0, internalRelationship: 0,
  };
  for (const c of cells) {
    for (const k of Object.keys(counts) as SignalKey[]) {
      if (c.signals[k]) counts[k]++;
    }
  }
  return counts;
}

/**
 * Most recently changed first, unknown dates last.
 *
 * For the Recent Change row, where the order IS the information: the account
 * that moved last week is the call to make, and it has to be at the top rather
 * than wherever the query happened to return it.
 *
 * A null date sorts last and never first. It means no KNOWN change — see
 * SignalRelationship — and putting "we have no idea when this moved" above
 * "this moved on Tuesday" would be exactly backwards. Compared as text because
 * the stamps are SQLite's fixed-width UTC, and the relationship id breaks a tie
 * so two reads of the same data lay the cell out the same way.
 */
export function byRecency(a: SignalCell, b: SignalCell): number {
  const x = a.statusChangedAt ?? '';
  const y = b.statusChangedAt ?? '';
  if (x !== y) return y.localeCompare(x);
  return a.relationshipId - b.relationshipId;
}

/** True when a cell carries any signal at all — what "Signals only" filters on. */
export function hasAnySignal(cell: SignalCell): boolean {
  return Object.values(cell.signals).some(Boolean);
}
