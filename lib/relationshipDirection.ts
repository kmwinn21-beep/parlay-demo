/**
 * Reading a directional relationship from the other company's side.
 *
 * vendor_relationships stores one row per relationship, written from the point
 * of view of whoever logged it. "Current Vendor" on Abshire → Abbott means
 * Abbott is Abshire's vendor. Rendering that row unchanged on Abbott's page
 * would claim the opposite — that Abshire is Abbott's vendor — with full
 * confidence, in a field reps use to decide who to sell against.
 *
 * So an inbound row is relabelled before it is shown. Some statuses invert
 * (Current Vendor becomes Customer), some are the same fact from either end
 * (Preferred Partner), and the account decides which is which by filling in
 * config_options.inverse_value. An option nobody has filled in reads as
 * symmetric, because showing a status unchanged is a smaller error than
 * showing one that was guessed.
 */

export type Direction = 'outbound' | 'inbound';

/** value → the words for the other end, or null when the status is symmetric. */
export type InverseMap = Record<string, string | null>;

/**
 * What a status reads as from the given side.
 *
 * Outbound is the row as written and is never touched. Inbound swaps in the
 * inverse where the account has set one and leaves the rest alone.
 */
export function statusesFor(
  statuses: string[],
  direction: Direction,
  inverses: InverseMap,
): string[] {
  if (direction === 'outbound') return statuses;
  return statuses.map(s => inverses[s] || s);
}

/**
 * True when this status means different things at the two ends.
 *
 * The card uses it to explain itself: a Customer pill on a page whose row says
 * Current Vendor is correct but surprising, and saying where it was logged is
 * the difference between trusting it and reporting it.
 */
export function isInverted(status: string, inverses: InverseMap): boolean {
  const inv = inverses[status];
  return !!inv && inv !== status;
}

export interface DirectionalRow {
  id: number;
  subject_id: number;
  related_company_id: number;
  direction: Direction;
  relationship_status: string[];
  [key: string]: unknown;
}

/**
 * One card per pair, when both companies logged the same relationship.
 *
 * Nothing stops two reps recording the same pair from opposite ends — one on
 * Abshire's page, one on Abbott's. Before this they never met; now they land
 * on the same page as two cards saying the same thing twice, or worse,
 * disagreeing.
 *
 * The outbound row wins, because it belongs to the record being viewed: its
 * rep, its thread, and the one that page can edit. The inbound row is not
 * discarded silently — the survivor carries `counterpart` so the card can say
 * the other company recorded this too, and `conflict` when the two do not
 * agree once the inbound one has been read from this side.
 */
export function collapsePairs(rows: DirectionalRow[], inverses: InverseMap): DirectionalRow[] {
  const byPair = new Map<string, DirectionalRow[]>();
  for (const r of rows) {
    // Keyed on the subject too: a row between two companies that were both
    // asked for is genuinely two cards, one on each page.
    const key = `${r.subject_id}:${r.related_company_id}`;
    const list = byPair.get(key) ?? [];
    list.push(r);
    byPair.set(key, list);
  }

  const out: DirectionalRow[] = [];
  for (const group of Array.from(byPair.values())) {
    if (group.length === 1) { out.push(group[0]); continue; }

    const outbound = group.find(r => r.direction === 'outbound');
    const inbound = group.find(r => r.direction === 'inbound');
    // Two rows in the same direction is the same pair logged twice on one
    // page, which the create form already refuses. Newest wins.
    if (!outbound || !inbound) { out.push(group[group.length - 1]); continue; }

    const mine = statusesFor(outbound.relationship_status, 'outbound', inverses);
    const theirs = statusesFor(inbound.relationship_status, 'inbound', inverses);
    out.push({
      ...outbound,
      counterpart: { id: inbound.id, statuses: theirs },
      conflict: mine.join() !== theirs.join(),
    });
  }
  return out;
}
