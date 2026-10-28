import type { FeedScope } from './types';

/**
 * Which view the dashboard feed opens on.
 *
 * Active first: while a show is running it is the only one worth looking at.
 * But between shows it is empty for weeks at a time, and a feed whose default
 * view is blank reads as a feed with no data in it — the empty state says
 * otherwise, and nobody reads an empty state. So the opening view falls
 * through to the next scope that has something in it, ending at All, which has
 * nowhere further to go and is shown whether or not it is empty.
 *
 * Emptiness is measured in ITEMS, not in conferences. A show that is running
 * with nothing logged against it yet is an empty view too, and the point of
 * this is to open on something to read.
 *
 * Separated from the component because the rule is worth testing and a fetch
 * inside a React effect is not: the caller supplies the fetcher, which is the
 * real `/api/feed` call in the app and a stub in tests.
 */
export const SCOPE_FALLBACK: readonly FeedScope[] = ['active', 'upcoming', 'all'];

/**
 * Walk SCOPE_FALLBACK until a scope has items, and return it with what was
 * fetched for it — so the caller renders the response it already paid for
 * rather than asking again.
 *
 * Sequential on purpose. The common case is the first candidate answering with
 * items, so a running show costs one request and only an account between shows
 * pays for the walk.
 *
 * Throws whatever `fetchScope` throws: it is the caller's load path, and its
 * failure is the caller's to handle.
 */
export async function pickOpeningScope<T extends { items: unknown[] }>(
  fetchScope: (scope: FeedScope) => Promise<T>,
): Promise<{ scope: FeedScope; payload: T }> {
  const last = SCOPE_FALLBACK[SCOPE_FALLBACK.length - 1];
  for (const scope of SCOPE_FALLBACK) {
    const payload = await fetchScope(scope);
    if (payload.items.length > 0 || scope === last) return { scope, payload };
  }
  // Unreachable: the loop returns on `last`. Here so the signature does not
  // have to admit undefined for a case the list's own shape rules out.
  throw new Error('pickOpeningScope: empty SCOPE_FALLBACK');
}
