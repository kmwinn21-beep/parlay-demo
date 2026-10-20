/**
 * Finding one meeting in a conference's worth of them.
 *
 * The filters above the list answer "which of these" — this day, that rep,
 * that kind of company — one field at a time. This answers "the one with
 * Bridge in it", which is how anybody actually looks for a particular
 * meeting: a half-remembered company, a surname, a job title, or the rep
 * whose meeting it is.
 *
 * So everything the card shows about WHO is in one haystack: the company, the
 * attendee and their title, anyone added to the meeting from the roster, and
 * our own people on it — the rep who booked it and whoever is on support,
 * both of which are stored as config_options ids and have to be turned back
 * into names before they can be searched for.
 */

export interface SearchableMeeting {
  company_name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  title?: string | null;
  /** config_options ids, comma-separated: the rep, and anyone on support. */
  scheduled_by?: string | null;
  support_rep_ids?: string | null;
  /** Free text, where a guest was typed rather than picked off the roster. */
  additional_attendees?: string | null;
  additional_attendee_records?: Array<{
    first_name?: string | null;
    last_name?: string | null;
    title?: string | null;
    company_name?: string | null;
  }>;
}

/** config_options ids out of the comma-separated string a column holds. */
function ids(value: string | null | undefined): number[] {
  return String(value ?? '')
    .split(',')
    .map(s => Number(s.trim()))
    .filter(n => Number.isFinite(n) && n > 0);
}

/**
 * Everything about a meeting that a search is allowed to match, as one
 * lower-cased string.
 *
 * Built rather than searched field by field so that a query spanning two of
 * them — a first name and a company, say — still lands.
 */
export function meetingHaystack(
  meeting: SearchableMeeting,
  userOptions: Array<{ id: number; value: string }> = [],
): string {
  const names = new Map(userOptions.map(u => [u.id, u.value]));
  const parts: Array<string | null | undefined> = [
    meeting.company_name,
    meeting.first_name,
    meeting.last_name,
    meeting.title,
    meeting.additional_attendees,
  ];

  for (const record of meeting.additional_attendee_records ?? []) {
    parts.push(record.first_name, record.last_name, record.title, record.company_name);
  }

  // Our own side. scheduled_by already carries the support ids, but a bulk
  // rep reassignment rewrites it alone — so both are read rather than
  // trusting that one contains the other.
  for (const id of Array.from(new Set([...ids(meeting.scheduled_by), ...ids(meeting.support_rep_ids)]))) {
    const name = names.get(id);
    if (name) parts.push(name);
  }

  return parts.filter(Boolean).join(' ').toLowerCase();
}

/**
 * Whether a meeting answers a search.
 *
 * Every word has to appear somewhere, so "bridge inv" finds Bridge
 * Investment Group and "steele bridge" finds the one Gavin Steele has with
 * them — which is how a half-remembered search is actually typed. An empty
 * query matches everything: a search box with nothing in it is not a filter.
 */
export function matchesMeetingSearch(
  meeting: SearchableMeeting,
  query: string,
  userOptions: Array<{ id: number; value: string }> = [],
): boolean {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return true;
  const haystack = meetingHaystack(meeting, userOptions);
  return terms.every(term => haystack.includes(term));
}
