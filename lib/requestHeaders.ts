/**
 * Request headers the middleware sets from trusted state, and the one way to
 * forward a request with a client's copies of them removed.
 *
 * `x-ops-impersonation-id` is set by middleware from the `ops_impersonation`
 * cookie and read by `requireAuth` to choose a tenant database. Middleware used
 * to only ever *set* that header and never remove one, so a client could send
 * its own and pick the database for its request. `requireAuth` now also checks
 * that the named session belongs to the caller and that they still hold ops
 * access, so stripping here is the second of two locks rather than the only one.
 *
 * One entry today. It is a list because the next header added to middleware
 * inherits the habit rather than the bug — the cost of getting this wrong is
 * invisible at the call site, and was invisible for the first one too.
 *
 * Lives outside middleware.ts so it can be tested: that module imports
 * @clerk/nextjs/server at load, which does not resolve outside the bundler.
 */
export const STRIPPED_REQUEST_HEADERS = ['x-ops-impersonation-id'] as const;

/**
 * The headers to forward: the request's own, minus anything a client must not
 * be able to supply, plus whatever middleware has established itself.
 *
 * Stripping happens before setting, so a trusted value always wins over a
 * forged one rather than colliding with it.
 */
export function sanitizeForwardedHeaders(
  requestHeaders: Headers,
  set?: Record<string, string>,
): Headers {
  const headers = new Headers(requestHeaders);
  for (const name of STRIPPED_REQUEST_HEADERS) headers.delete(name);
  for (const [name, value] of Object.entries(set ?? {})) headers.set(name, value);
  return headers;
}
