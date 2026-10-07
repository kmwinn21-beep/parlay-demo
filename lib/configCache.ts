'use client';

// ---------------------------------------------------------------------------
// Generic request deduplication + TTL cache
// ---------------------------------------------------------------------------

type CacheEntry<T> = { data: T; cachedAt: number };

const cache = new Map<string, CacheEntry<unknown>>();
const inFlight = new Map<string, Promise<unknown>>();

const DEFAULT_TTL = 60_000; // 60 seconds

/**
 * Fetch with in-flight deduplication and TTL caching.
 * Concurrent callers with the same key share one Promise.
 * Subsequent callers within ttlMs get the cached result immediately.
 */
export function getCached<T>(
  key: string,
  fetcher: () => Promise<T>,
  ttlMs: number = DEFAULT_TTL,
): Promise<T> {
  const entry = cache.get(key) as CacheEntry<T> | undefined;
  if (entry && Date.now() - entry.cachedAt < ttlMs) {
    return Promise.resolve(entry.data);
  }

  const existing = inFlight.get(key) as Promise<T> | undefined;
  if (existing) return existing;

  const promise = fetcher()
    .then(data => {
      cache.set(key, { data, cachedAt: Date.now() });
      inFlight.delete(key);
      return data;
    })
    .catch(err => {
      inFlight.delete(key);
      throw err;
    });

  inFlight.set(key, promise as Promise<unknown>);
  return promise;
}

export function invalidateCached(key: string) {
  cache.delete(key);
  inFlight.delete(key);
}

// ---------------------------------------------------------------------------
// /api/config convenience wrapper (backwards-compat with Prompt 5 callers)
// ---------------------------------------------------------------------------

/**
 * When the account's config options were last edited from this browser.
 *
 * /api/config is answered from the browser's own HTTP cache for five minutes,
 * which is right for a few hundred rows every page wants and nobody changes —
 * and wrong for the minute after an admin changes one, when clearing the entry
 * above only means the refetch is served the very body we just threw away.
 *
 * So the URL carries the version: repeat loads ask for the same URL and are
 * still answered from the cache, while an edit moves every later fetch to a URL
 * the cache has never seen. In localStorage rather than a module variable
 * because it has to survive a reload — and because the admin's other tabs are
 * looking at the same stale copy.
 */
const CONFIG_VERSION_KEY = 'parlay_config_version';

function configVersion(): string {
  try {
    return localStorage.getItem(CONFIG_VERSION_KEY) ?? '0';
  } catch {
    // Storage can throw outright where site data is blocked. A constant version
    // is the pre-existing behaviour, not a new failure.
    return '0';
  }
}

export function getConfig(): Promise<unknown> {
  return getCached('__config__', () =>
    fetch(`/api/config?v=${configVersion()}`).then(r => r.json()));
}

/**
 * Drop the cached config, here and in the browser.
 *
 * Call it after anything writes to config_options. The per-hook invalidators
 * do: they clear their own derived maps but then read straight back through
 * this cache, so on their own they were no-ops.
 */
export function invalidateConfigCache() {
  try {
    localStorage.setItem(CONFIG_VERSION_KEY, String(Date.now()));
  } catch { /* see configVersion */ }
  invalidateCached('__config__');
}

/**
 * One category of config options, deduplicated and cached briefly.
 *
 * Several components want one list each — statuses, meeting types, seniority —
 * and each fetched it for itself on mount. Two of them wanting the same
 * category meant two identical requests in the same instant, and switching
 * tabs asked again for something nobody had changed. Measured on a conference
 * page: five /api/config requests inside one second.
 *
 * Keyed by the URL, so two callers asking for the same category share one
 * request and a third asking a minute later still gets a fresh one. The
 * version is carried for the same reason getConfig carries it: an admin's edit
 * has to move every later fetch to a URL the browser's own cache has not seen.
 *
 * Returns the parsed rows, or [] if the request fails — the shape every
 * current caller already falls back to.
 */
export function getConfigCategory(category: string, form?: string): Promise<unknown[]> {
  const url = `/api/config?category=${encodeURIComponent(category)}`
    + (form ? `&form=${encodeURIComponent(form)}` : '')
    + `&v=${configVersion()}`;
  return getCached(url, () =>
    fetch(url)
      .then(r => (r.ok ? r.json() : []))
      .then(rows => (Array.isArray(rows) ? rows as unknown[] : []))
      .catch(() => []));
}
