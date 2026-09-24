/**
 * What a rep says happened, when they scan a badge on the floor.
 *
 * This used to be four hard-coded buttons — Stopped By, Demo, Meeting,
 * Follow-up Req — which were not the touchpoint types the account had
 * configured and could not be changed. An account whose floor work is Coffee,
 * Dinner and Session had to answer a question about booth demos.
 *
 * It is the account's own touchpoint list now, the same one the dashboard's
 * Log Touchpoint card offers, so the follow-up that assigning the note
 * generates is named after the touchpoint the rep actually picked.
 *
 * The tag is stored on quick_notes.secondary_tag and read back when the note
 * is assigned, so it has to survive a round trip through a TEXT column.
 */

/** Marks a secondary_tag as a touchpoint option id rather than a legacy value. */
const TOUCHPOINT_PREFIX = 'tp:';

/** The tag stored on the note for a chosen touchpoint option. */
export function touchpointTag(optionId: number): string {
  return `${TOUCHPOINT_PREFIX}${optionId}`;
}

/**
 * The touchpoint option id a tag refers to, or null if it is not one.
 *
 * Null covers both the legacy booth-* tags and notes saved with no tag at all,
 * which is what Skip does.
 */
export function touchpointIdFromTag(tag: string | null | undefined): number | null {
  const raw = String(tag ?? '');
  if (!raw.startsWith(TOUCHPOINT_PREFIX)) return null;
  const id = Number(raw.slice(TOUCHPOINT_PREFIX.length));
  return Number.isInteger(id) && id > 0 ? id : null;
}

/**
 * The four buttons this replaced.
 *
 * Notes saved before the change still carry these, and they are still assigned
 * from the same queue — a rep who scanned on Tuesday and assigns on Thursday
 * would otherwise find the tag rendered as raw text and the submit route with
 * no branch to take. Kept for reading, never written.
 */
export const LEGACY_BOOTH_LABELS: Record<string, string> = {
  'booth-stop': 'Stopped By',
  'booth-demo': 'Demo',
  'booth-meeting': 'Meeting',
  'booth-followup': 'Follow-up Req',
};

/**
 * What to show on a note's badge for the interaction it recorded.
 *
 * Returns null when there is nothing to show — an untagged note, or a
 * touchpoint option that has since been deleted from the account's config.
 * The caller renders no badge rather than "tp:14".
 */
export function interactionLabel(
  tag: string | null | undefined,
  options: Array<{ id: number; value: string }>,
): string | null {
  const id = touchpointIdFromTag(tag);
  if (id !== null) return options.find(o => o.id === id)?.value ?? null;
  const raw = String(tag ?? '');
  return LEGACY_BOOTH_LABELS[raw] ?? null;
}
