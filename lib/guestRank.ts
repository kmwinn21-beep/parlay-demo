/**
 * Guest-list ranking: the scale, the colours, and the sort.
 *
 * Kept out of the component so the ordering rule has one definition. It is
 * applied in two places that must agree — the guest list drawer and the Build
 * Guest List modal's selected block — and a sort duplicated in two files is a
 * sort that will disagree with itself eventually.
 */

export const RANK_MIN = 1;
export const RANK_MAX = 25;

/** Every value the picker offers, best first. */
export const RANK_VALUES: number[] = Array.from(
  { length: RANK_MAX - RANK_MIN + 1 },
  (_, i) => RANK_MIN + i,
);

export interface GuestRank {
  repRank: number | null;
  teamRank: number | null;
}

export const EMPTY_RANK: GuestRank = { repRank: null, teamRank: null };

/** A rank the database will accept: a whole number in range, or null to clear it. */
export function normalizeRank(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  if (!Number.isInteger(n) || n < RANK_MIN || n > RANK_MAX) return null;
  return n;
}

/** True for a value that is neither a valid rank nor an explicit clear. */
export function isInvalidRank(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  const n = Number(value);
  return !Number.isInteger(n) || n < RANK_MIN || n > RANK_MAX;
}

/**
 * Badge colours, five bands of five.
 *
 * Twenty-five distinguishable colours would not be distinguishable, so the bands
 * carry the meaning and the number carries the precision. Green at the top
 * through to red at the bottom, which is the direction people already read these
 * in without being told.
 */
export function rankBadgeClass(rank: number | null): string {
  if (rank == null) return 'bg-gray-100 text-gray-400';
  if (rank <= 5) return 'bg-green-100 text-green-800';
  if (rank <= 10) return 'bg-lime-100 text-lime-800';
  if (rank <= 15) return 'bg-amber-100 text-amber-800';
  if (rank <= 20) return 'bg-orange-100 text-orange-800';
  return 'bg-red-100 text-red-700';
}

/**
 * Where an unranked guest sorts.
 *
 * After everyone with a number, rather than before. An empty rank is "not yet
 * considered", and burying the ranked guests under a wall of blanks would defeat
 * the point of ranking them.
 */
const UNRANKED = Number.POSITIVE_INFINITY;
const at = (rank: number | null): number => (rank == null ? UNRANKED : rank);

/**
 * Compare two rank positions.
 *
 * NOT `a - b`. Unranked is Infinity, and `Infinity - Infinity` is NaN, which a
 * sort treats as "equal" only by accident — it made two unranked guests compare
 * as unordered and skip the name tiebreaker entirely, so the list came back in
 * whatever order the database happened to return. Checking equality first keeps
 * every comparison a real number.
 */
const byPosition = (a: number, b: number): number => (a === b ? 0 : a - b);

export interface RankSortable {
  last_name?: string | null;
  first_name?: string | null;
}

/**
 * Team rank ascending, then rep rank ascending, then last name A–Z.
 *
 * First name breaks a tie on last name, so two Smiths have a stable order rather
 * than whichever the database happened to return first.
 */
export function compareByRank<T extends RankSortable>(
  a: T,
  b: T,
  rankOf: (item: T) => GuestRank,
): number {
  const ra = rankOf(a);
  const rb = rankOf(b);

  const team = byPosition(at(ra.teamRank), at(rb.teamRank));
  if (team !== 0) return team;

  const rep = byPosition(at(ra.repRank), at(rb.repRank));
  if (rep !== 0) return rep;

  const last = (a.last_name ?? '').localeCompare(b.last_name ?? '', undefined, { sensitivity: 'base' });
  if (last !== 0) return last;

  return (a.first_name ?? '').localeCompare(b.first_name ?? '', undefined, { sensitivity: 'base' });
}

/** The same order, applied to a list. Does not mutate the input. */
export function sortByRank<T extends RankSortable>(items: T[], rankOf: (item: T) => GuestRank): T[] {
  return [...items].sort((a, b) => compareByRank(a, b, rankOf));
}
