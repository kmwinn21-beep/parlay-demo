/**
 * How a company stand-in reads on screen.
 *
 * A conference's company list is derived from its attendees, so a company
 * known to be attending with nobody named against it is represented by a
 * stand-in attendee — `is_placeholder = 1`, stored as first name "-" and last
 * name the company's own, the convention lib/parsers.ts uses for Companies
 * Only uploads and the add route reuses for one-off additions.
 *
 * Stored that way it renders as "- Belmont Care", which reads as a typo. The
 * company already has its own column, so the name column says what is actually
 * true of the row: nobody is named yet.
 *
 * No server-only imports — this is used from client components.
 */

/** A row's placeholder flag arrives as 1/0 from SQLite or as a boolean. */
export function isPlaceholderAttendee(
  attendee: { is_placeholder?: number | boolean | null },
): boolean {
  return attendee.is_placeholder === 1 || attendee.is_placeholder === true;
}

export const UNKNOWN_ATTENDEE_LABEL = 'Attendee unknown';

/**
 * The name to show for an attendee row.
 *
 * Stand-ins get the label; everyone else gets their name, trimmed so a missing
 * half doesn't leave a hanging space.
 */
export function attendeeDisplayName(
  attendee: { first_name?: string | null; last_name?: string | null; is_placeholder?: number | boolean | null },
): string {
  if (isPlaceholderAttendee(attendee)) return UNKNOWN_ATTENDEE_LABEL;
  return `${attendee.first_name ?? ''} ${attendee.last_name ?? ''}`.trim();
}
