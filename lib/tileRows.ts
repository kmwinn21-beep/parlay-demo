/**
 * The conference tab tiles, cut into rows.
 *
 * They were one row that scrolled sideways, with dots underneath counting the
 * groups you had not reached — so seven of eleven tabs were a swipe away and
 * the dots were the only sign that they existed. Four to a row and a row to a
 * card instead: every tab is on screen, and there is nothing left for an
 * indicator to indicate.
 *
 * Here rather than in the component so the rule can be run: the shape of the
 * last row, and the edges either side of a full one, are the part that cannot
 * be read off the markup.
 */

/** Tiles to a row. The grid is written `grid-cols-4` to match. */
export const TILES_PER_ROW = 4;

/**
 * The tabs in the order given, cut into rows of at most TILES_PER_ROW.
 *
 * Order is kept: the rows are a wrap of the list, not a regrouping of it, so
 * the tabs read left to right and top to bottom in the order the page lists
 * them.
 */
export function tileRows<T>(tiles: T[]): T[][] {
  const rows: T[][] = [];
  for (let i = 0; i < tiles.length; i += TILES_PER_ROW) rows.push(tiles.slice(i, i + TILES_PER_ROW));
  return rows;
}
