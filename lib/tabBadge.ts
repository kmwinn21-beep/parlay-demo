/**
 * The count on a tab tile's badge.
 *
 * A conference has five figures of attendance, so the badge shows the number
 * in full with thousands separators — "14,250", not "14.2k" and not "99+".
 * Rounding it would make the badge a rough signal on a page whose whole job is
 * the exact figure, and a reader who sees "14.2k" has to open the tab to learn
 * what they could have been told here.
 *
 * Nothing is shown at zero. An empty tab says so by being empty; a badge
 * reading "0" is a mark that draws the eye to the one tab with nothing in it.
 */

/**
 * The badge's text, or null when there should be no badge.
 *
 * Takes the undefined and null that a tab with no count at all passes, so the
 * caller does not need to test for them separately.
 */
export function badgeCount(count: number | null | undefined): string | null {
  if (count == null || !Number.isFinite(count) || count <= 0) return null;
  return Math.round(count).toLocaleString('en-US');
}
