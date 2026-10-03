/**
 * Matching a company against the master account list.
 *
 * In its own module rather than in the component because the one rule here
 * has a reason behind it that a screenshot of the search box does not show.
 */

/**
 * How much of a company's name the master search opens with.
 *
 * A master list is a list of PARENTS: a company called "Oak Creek Senior Care"
 * is found under "Cornerstone Of Oak Creek". Seeding the box with the whole
 * name therefore finds nothing, and the reader has to delete most of it before
 * the search does anything at all. Five characters is usually the first word,
 * which is what somebody types by hand anyway.
 */
export const MASTER_SEARCH_SEED_LENGTH = 5;

/** What the master search box opens with, for a company of this name. */
export function masterSearchSeed(companyName: string | null | undefined): string {
  // Trimmed on both sides of the cut: the leading trim stops indentation in
  // the stored name from eating the budget, and the trailing one stops a cut
  // that lands mid-gap from leaving a space the search box shows as a typo.
  return String(companyName ?? '').trim().slice(0, MASTER_SEARCH_SEED_LENGTH).trim();
}
