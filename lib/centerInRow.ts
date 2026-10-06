/**
 * Where a horizontal scroller has to be for one of its items to be seen.
 *
 * The drawer's chip row shows the open tab's name and nothing else's, so that
 * one chip is the only thing in the row saying where you are. Open a tab from
 * the eighth position and the row is still at its start: eleven anonymous
 * coloured squares and no sign which of them you are in. The row has to bring
 * the open chip to you.
 *
 * Kept apart from the component because it is the part worth testing, and a
 * component full of refs is the part that is awkward to test.
 */

/**
 * The scrollLeft that centres an item in the part of the row you can see.
 *
 * `reservedRight` is the width of anything parked over the row's right edge —
 * in the drawer, the opaque block holding the close button, which the chips
 * scroll underneath. Centring in the full width would park the open chip
 * half beneath it.
 *
 * Clamped at both ends, so an item near either end settles flush rather than
 * asking for a scroll position that does not exist.
 */
export function centerScrollLeft(
  itemLeft: number,
  itemWidth: number,
  clientWidth: number,
  scrollWidth: number,
  reservedRight = 0,
): number {
  const visible = Math.max(0, clientWidth - reservedRight);
  const ideal = itemLeft - (visible - itemWidth) / 2;
  const furthest = Math.max(0, scrollWidth - clientWidth);
  return Math.min(furthest, Math.max(0, ideal));
}
