/**
 * The rules behind a conference's floor plan.
 *
 * Out of the route because neither is visible in the result: which files the
 * viewer can actually open, and which year's documents the plan is filed
 * under. The second one is the whole reason an uploaded plan turns up in the
 * Logistics drawer's Files tab, and it is one line that could drift from the
 * tab's own year without anything looking wrong until somebody went looking
 * for the file.
 */

/**
 * What the viewer can display.
 *
 * Images and PDFs. A floor plan arrives as one or the other, and accepting a
 * spreadsheet would put a file in the Files tab that the Floor Plan button
 * then opens onto nothing.
 *
 * The name is checked as well as the type because a file dragged in from some
 * desktops arrives with no type at all.
 */
export function isFloorPlanType(type: string | null | undefined, name: string): boolean {
  const t = String(type ?? '').trim().toLowerCase();
  if (t.startsWith('image/') || t === 'application/pdf') return true;
  return /\.(png|jpe?g|gif|webp|svg|pdf)$/i.test(String(name ?? ''));
}

/**
 * The plan year an uploaded floor plan is filed under.
 *
 * Taken from the conference's own start date, because that is exactly what
 * the Logistics drawer passes as its planYear — see the conference page,
 * which reads `new Date(conference.start_date).getFullYear()`. Filing the
 * plan under any other year would store it correctly and show it nowhere.
 *
 * A conference with no usable start date falls back to the current year
 * rather than to year zero, so the file still lands somewhere a person would
 * think to look.
 */
export function floorPlanYear(startDate: string | null | undefined, today = new Date()): number {
  const year = Number(String(startDate ?? '').slice(0, 4));
  return Number.isFinite(year) && year > 1900 ? year : today.getFullYear();
}
