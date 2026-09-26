/**
 * Catching a vendor switch at the moment somebody records it.
 *
 * The competitive grid wants to show that an account LEFT one competitor FOR
 * another. That is a claim about cause, and no arrangement of statuses and
 * timestamps can establish one: "A is former and B is current" looks identical
 * whether they switched last week or have been settled for three years, and two
 * edits made in the same afternoon look identical to a switch.
 *
 * So it is not inferred. The rep is asked, once, at the only moment they
 * certainly know — while they are typing the change — and the answer is stored
 * as a fact of its own. Everything downstream reads that record rather than
 * re-deriving it, which is what makes the connector exact instead of probable.
 *
 * Two doors into the same room:
 *
 *   ARRIVAL   a relationship becomes current while a competitor is already
 *             current on the same account. "Are they replacing them, keeping
 *             both, or do you not know?"
 *   DEPARTURE a competitor's relationship goes from current to former. "Who
 *             replaced them?" — with nobody as a real answer.
 *
 * This module holds the rules and nothing else: no queries, no React. What
 * counts as current, which end of a row is the vendor and which companies are
 * competitors are all decided in competitiveResolution, because the grid asks
 * the same questions and two answers would be two answers.
 */

import {
  classOfStatuses, vendorEndOfStatuses, type StatusIndex,
} from '@/lib/competitiveResolution';

/**
 * What the rep said.
 *
 *   replacing  they moved off the incumbent and onto the incoming one. The
 *              only answer that draws a connector.
 *   keeping    both, in parallel. Not a switch, and worth knowing: an account
 *              deliberately running two vendors is a different competitive
 *              picture from one that moved.
 *   unknown    they were asked and do not know. Stored so the question is not
 *              asked again next week as though it had never come up.
 *   none       they left, and nobody replaced them — in-house, consolidated,
 *              shut down. A real outcome, not a missing answer.
 */
export type SwitchAnswer = 'replacing' | 'keeping' | 'unknown' | 'none';

export const SWITCH_ANSWERS: SwitchAnswer[] = ['replacing', 'keeping', 'unknown', 'none'];

/** Only this one means one vendor was displaced by another. */
export function drawsConnector(answer: string): boolean {
  return answer === 'replacing';
}

/** A stored relationship, as these rules need to see it. */
export interface SwitchRow {
  id: number;
  /** Whoever's page it was logged on. The status is written from this side. */
  companyId: number;
  relatedCompanyId: number;
  /** As written. Never rewritten before it gets here. */
  statuses: string[];
}

/** A competitor already current on this account when a new one arrives. */
export interface Incumbent {
  relationshipId: number;
  competitorId: number;
  /** The end of that row the account sits on, so a write lands the right way. */
  accountId: number;
  statuses: string[];
}

/**
 * Which end of a row is the vendor, by the same rule the grid uses.
 *
 * The status points at one end; a symmetric or unclassified status points
 * nowhere and the company types decide. Returns null when neither end is a
 * competitor, which is this workflow's whole scope — a switch between two
 * companies we do not compete with is somebody else's feature.
 */
export function endsOf(
  row: SwitchRow, index: StatusIndex, isCompetitor: (id: number) => boolean,
): { competitorId: number; accountId: number } | null {
  const end = vendorEndOfStatuses(row.statuses, index);
  let competitorId: number;
  let accountId: number;
  if (end === 'related') {
    competitorId = row.relatedCompanyId; accountId = row.companyId;
  } else if (end === 'logging') {
    competitorId = row.companyId; accountId = row.relatedCompanyId;
  } else if (isCompetitor(row.relatedCompanyId)) {
    competitorId = row.relatedCompanyId; accountId = row.companyId;
  } else if (isCompetitor(row.companyId)) {
    competitorId = row.companyId; accountId = row.relatedCompanyId;
  } else {
    return null;
  }
  // Never flipped to make it fit. A status naming an end that is not a
  // competitor means this is not an account-to-competitor relationship however
  // the other end is typed, and swapping them would invent a purchase running
  // the other way.
  return isCompetitor(competitorId) ? { competitorId, accountId } : null;
}

/**
 * The competitors already current on an account when another becomes current.
 *
 * Matched on the CLASS, not the words. "Preferred Partner" carries the same
 * class as "Current Vendor", and an account whose incumbent is recorded that
 * way is exactly the one being displaced — matching the literal string would
 * never prompt for it.
 *
 * Several is a real answer and the caller is expected to handle it: a
 * multi-vendor account exists, and picking one of three on the rep's behalf
 * would be wrong two times out of three.
 */
export function findIncumbents({
  accountId, incomingCompanyId, rows, index, isCompetitor, excludeRelationshipId,
}: {
  accountId: number;
  /** The company that is becoming current. Never its own incumbent. */
  incomingCompanyId: number;
  /** Every relationship touching this account, as stored. */
  rows: SwitchRow[];
  index: StatusIndex;
  isCompetitor: (id: number) => boolean;
  /** The row being saved, which must not find itself. */
  excludeRelationshipId?: number;
}): Incumbent[] {
  const out: Incumbent[] = [];
  const seen = new Set<number>();
  for (const row of rows) {
    if (row.id === excludeRelationshipId) continue;
    if (classOfStatuses(row.statuses, index) !== 'current') continue;
    const ends = endsOf(row, index, isCompetitor);
    if (!ends || ends.accountId !== accountId) continue;
    if (ends.competitorId === incomingCompanyId) continue;
    // One entry per competitor. A pair logged from both sides is two rows and
    // one relationship, and prompting twice about the same company reads as
    // the prompt being broken.
    if (seen.has(ends.competitorId)) continue;
    seen.add(ends.competitorId);
    out.push({
      relationshipId: row.id,
      competitorId: ends.competitorId,
      accountId: ends.accountId,
      statuses: row.statuses,
    });
  }
  return out;
}

/**
 * Whether a save is a competitor's relationship ending.
 *
 * Current to former, and only that. Evaluating to former is a dead evaluation,
 * not a departure — nobody was displaced — and prompting "who replaced them?"
 * for it would collect an answer to a question that was not asked.
 */
export function isDeparture(
  before: string[], after: string[], index: StatusIndex,
): boolean {
  return classOfStatuses(before, index) === 'current'
    && classOfStatuses(after, index) === 'former';
}

/** Whether a save makes a relationship current when it was not before. */
export function isArrival(
  before: string[], after: string[], index: StatusIndex,
): boolean {
  return classOfStatuses(after, index) === 'current'
    && classOfStatuses(before, index) !== 'current';
}

/**
 * The note put on a relationship this workflow creates.
 *
 * Notes / Context is required on a relationship, and one created by the system
 * has nobody to write it. Says what happened and when, in the words a rep would
 * use, so the card does not read as having appeared from nowhere.
 *
 * It is NOT where the switch is recorded. That lives in its own row, because a
 * sentence in a free-text field stops being a link the moment somebody edits
 * it, and nothing would say it had.
 */
export function switchNote(fromName: string, toName: string, on: Date): string {
  const mm = String(on.getMonth() + 1).padStart(2, '0');
  const dd = String(on.getDate()).padStart(2, '0');
  return `Switched from ${fromName} to ${toName} on ${mm}/${dd}/${on.getFullYear()}`;
}

/**
 * The thread entry left on a relationship this workflow changed for you.
 *
 * Every auto-change writes one. Without it somebody opens that card next week
 * and finds a status that moved with no author and no reason, which is the
 * exact thing the thread exists to prevent — and worse here, because they did
 * not make the change and cannot remember making it.
 */
export function departureEntry(replacedByName: string | null): string {
  return replacedByName
    ? `Marked former — replaced by ${replacedByName} on this account.`
    : 'Marked former — no replacement recorded.';
}

export function arrivalEntry(replacedName: string): string {
  return `Marked current — replacing ${replacedName} on this account.`;
}
