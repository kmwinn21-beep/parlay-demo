/**
 * Where a hover tooltip goes.
 *
 * Centred on what it describes, pulled back from either edge of the screen,
 * and flipped above once there is room — a tooltip that opens downward near
 * the bottom of a long table is a tooltip nobody can read.
 *
 * Shared because it was written out identically in three components, and a
 * fourth was about to be added. `above` is returned rather than applied: the
 * callers position with `transform`, and the flip has to be the same decision
 * in all of them or two tooltips on one screen point different ways.
 */

export type TooltipPos = { top: number; left: number; width: number; above: boolean };

export function calcTooltipPos(el: HTMLElement, maxW = 260): TooltipPos {
  const rect = el.getBoundingClientRect();
  const w = Math.min(maxW, window.innerWidth - 16);
  const left = Math.max(8, Math.min(rect.left + rect.width / 2 - w / 2, window.innerWidth - w - 8));
  const above = rect.top > 180;
  return { top: above ? rect.top - 8 : rect.bottom + 8, left, width: w, above };
}
