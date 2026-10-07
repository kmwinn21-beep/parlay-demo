/**
 * Finding somebody on a saved guest list.
 *
 * A dinner can carry fifty guests, and the drawer's filters answer "which
 * kind" rather than "where is this person". The chips narrow by account and by
 * company type; this narrows by who they are.
 *
 * Every term has to match SOMETHING, but not all in the same field: "acosta
 * vp" finds the VP of HR called Acosta, and "karlfurt ceo" finds the CEO at
 * Karlfurt. A single haystack per person is what makes that work, and it is
 * why this is not a per-field startsWith.
 */

export interface SearchableGuest {
  first_name?: string | null;
  last_name?: string | null;
  title?: string | null;
  company_name?: string | null;
}

/** The terms a query is made of. Empty when there is nothing to search for. */
export function guestQueryTerms(query: string): string[] {
  return query.toLowerCase().split(/\s+/).filter(Boolean);
}

/**
 * Does this guest match every term?
 *
 * Case-insensitive and substring, because a reader half-remembering a name
 * types the middle of it as often as the start.
 */
export function matchesGuestQuery(guest: SearchableGuest, terms: readonly string[]): boolean {
  if (terms.length === 0) return true;
  const haystack = [guest.first_name, guest.last_name, guest.title, guest.company_name]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return terms.every(t => haystack.includes(t));
}

/** The guests matching a query, in the order they came in. */
export function filterGuests<T extends SearchableGuest>(guests: readonly T[], query: string): T[] {
  const terms = guestQueryTerms(query);
  if (terms.length === 0) return guests as T[];
  return guests.filter(g => matchesGuestQuery(g, terms));
}
