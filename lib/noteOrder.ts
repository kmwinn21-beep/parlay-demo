/**
 * The order notes are read in.
 *
 * Pinned first, then everything else newest first. A pin is somebody saying
 * "read this one before the others", and a list that honours it only when the
 * pinned note happens to be recent is not honouring it at all.
 *
 * Kept apart from the panel because the ordering is the part worth testing and
 * a panel full of fetches is the part that is awkward to.
 */

export interface OrderableNote {
  id: number;
  created_at: string;
}

/**
 * Pinned notes first, then by date, newest first.
 *
 * Within the pinned group the same date rule applies, so two pins are not left
 * in whatever order the server sent them.
 *
 * Stable where two notes share a timestamp — and they do, because a batch
 * import stamps them all alike — so a list does not reshuffle between renders.
 * The id breaks the tie, highest first, which matches "most recent" for rows
 * written in sequence.
 */
export function orderNotes<T extends OrderableNote>(
  notes: readonly T[],
  pinnedIds: ReadonlySet<number>,
): T[] {
  return [...notes].sort((a, b) => {
    const aPinned = pinnedIds.has(a.id) ? 0 : 1;
    const bPinned = pinnedIds.has(b.id) ? 0 : 1;
    if (aPinned !== bPinned) return aPinned - bPinned;
    const byDate = dateValue(b.created_at) - dateValue(a.created_at);
    if (byDate !== 0) return byDate;
    return b.id - a.id;
  });
}

/**
 * A timestamp as a number, with anything unparseable sorting last.
 *
 * created_at is text in this database and has arrived as both
 * 'YYYY-MM-DD HH:MM:SS' and an ISO string. A NaN from Date.parse would make
 * every comparison against it false and leave the sort order undefined, which
 * is worse than putting the odd row at the end.
 */
function dateValue(raw: string | null | undefined): number {
  const t = Date.parse(String(raw ?? '').replace(' ', 'T'));
  return Number.isNaN(t) ? -Infinity : t;
}
