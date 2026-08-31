import type { CompanyOption } from '@/components/VendorRelationshipFields';

/**
 * Companies that are probably the one a note named.
 *
 * A note writes "Advent Health" for a company on file as "AdventHealth Castle
 * Rock", and "new lesley" for "New Lesley Enterprises". Exact matching calls
 * both of those new, and accepting then creates a second record for a company
 * that is already there — which is harder to undo than a missed suggestion.
 *
 * These are offered, never applied: picking one is the reviewer's, because
 * "Advent Health" genuinely might be a different company from "AdventHealth
 * Castle Rock" and only a person knows which.
 */

/** Punctuation, spacing and case are all noise in a company name. */
function squash(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** Below this a fragment matches half the account and helps nobody. */
const MIN_LENGTH = 4;
const MAX_RESULTS = 3;

export function findNearMatches(name: string, companies: CompanyOption[]): CompanyOption[] {
  const q = squash(name);
  if (q.length < MIN_LENGTH) return [];

  const hits = companies.filter(c => {
    const s = squash(c.name);
    if (!s || s === q) return false; // an exact match isn't a "did you mean"
    return s.startsWith(q) || q.startsWith(s) || s.includes(q) || q.includes(s);
  });

  // Closest in length first: "AdventHealth Castle Rock" beats a company that
  // merely contains the same fragment somewhere in a much longer name.
  return hits
    .sort((a, b) => Math.abs(squash(a.name).length - q.length) - Math.abs(squash(b.name).length - q.length))
    .slice(0, MAX_RESULTS);
}

/** True when the account already holds this exact name. */
export function findExact(name: string, companies: CompanyOption[]): CompanyOption | undefined {
  const n = name.trim().toLowerCase();
  return companies.find(c => c.name.trim().toLowerCase() === n);
}
