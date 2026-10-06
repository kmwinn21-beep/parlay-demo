'use client';

/**
 * The dots under a horizontally scrolling strip.
 *
 * A scrollbar is the usual answer and the wrong one on a phone: it is a
 * hairline nobody can grab, and it says how far along you are in pixels,
 * which is not a unit anybody is counting in. Dots say it in items.
 *
 * One dot per group of three tiles, and the dot for the group you are looking
 * at is the large one. Its size tracks the scroll continuously rather than
 * snapping at each boundary — half way between two groups both dots are half
 * way between the two sizes, which is what makes the row read as a position
 * rather than as a counter.
 */

/** Tiles to a dot. Three is what the strip was designed around. */
export const TILES_PER_DOT = 3;

/** How many dots a strip of this many tiles gets. 11 tiles → 4 dots. */
export function dotCount(tiles: number, perDot = TILES_PER_DOT): number {
  if (tiles <= 0) return 0;
  return Math.ceil(tiles / perDot);
}

/**
 * Where the strip is, as a fractional dot index from 0 to dots - 1.
 *
 * Measured from the scroll progress rather than from a tile width, because
 * the tiles are not all the same width — their labels differ — so counting
 * "three tiles along" in pixels would drift and never quite reach the last
 * dot. Progress reaches exactly 1 at the end, so the last dot is always the
 * large one when the strip is scrolled to its end.
 */
export function activeDotPosition(
  scrollLeft: number,
  scrollWidth: number,
  clientWidth: number,
  dots: number,
): number {
  if (dots <= 1) return 0;
  const travel = scrollWidth - clientWidth;
  // Nothing to scroll: the first dot is the one you are on.
  if (travel <= 0) return 0;
  const progress = Math.min(1, Math.max(0, scrollLeft / travel));
  return progress * (dots - 1);
}

/**
 * How big one dot is, from 0 (smallest) to 1 (largest).
 *
 * Linear in the distance from the live position and clamped at one dot away,
 * so only the two dots either side of the position are ever mid-sized and the
 * rest sit at their smallest.
 */
export function dotScale(index: number, position: number): number {
  return Math.max(0, 1 - Math.abs(index - position));
}
