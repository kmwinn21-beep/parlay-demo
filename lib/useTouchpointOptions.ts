'use client';

import { useEffect, useState } from 'react';

export interface TouchpointOption {
  id: number;
  value: string;
  color: string | null;
}

/**
 * The account's touchpoint types, fetched once for the page.
 *
 * Cached at module scope with the in-flight request shared, because the floor
 * notes list renders one NoteCard per note and every one of them needs this to
 * put a name on the interaction the note recorded. Without the cache a screen
 * of twenty notes is twenty identical requests.
 *
 * The list is small and changes only in admin settings, so a stale copy for
 * the life of a page is the right trade.
 */
let cache: TouchpointOption[] | null = null;
let inFlight: Promise<TouchpointOption[]> | null = null;

function load(): Promise<TouchpointOption[]> {
  if (cache) return Promise.resolve(cache);
  if (!inFlight) {
    inFlight = fetch('/api/config?category=touchpoints')
      .then(r => (r.ok ? r.json() : []))
      .then((d: TouchpointOption[]) => {
        cache = Array.isArray(d) ? d : [];
        return cache;
      })
      .catch(() => [] as TouchpointOption[])
      .finally(() => { inFlight = null; });
  }
  return inFlight;
}

/** Drops the cache, for when admin settings change the list. */
export function invalidateTouchpointOptions() {
  cache = null;
}

export function useTouchpointOptions(): TouchpointOption[] {
  const [options, setOptions] = useState<TouchpointOption[]>(cache ?? []);

  useEffect(() => {
    let alive = true;
    void load().then(list => { if (alive) setOptions(list); });
    return () => { alive = false; };
  }, []);

  return options;
}
