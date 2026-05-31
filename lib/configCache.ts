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

export function getConfig(): Promise<unknown> {
  return getCached('__config__', () => fetch('/api/config').then(r => r.json()));
}

export function invalidateConfigCache() {
  invalidateCached('__config__');
}
