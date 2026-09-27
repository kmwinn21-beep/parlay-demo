'use client';

import { useEffect, useState } from 'react';
import { expandStatusOptions, type StatusOption } from '@/lib/relationshipStatusOptions';

/**
 * The relationship statuses a rep can pick, both halves of every pair.
 *
 * "Current Vendor" and "Customer" are the same fact from opposite ends, and
 * either is a reasonable thing to reach for depending on whose record you are
 * looking at. Both are offered; whichever is chosen is stored as written and
 * read back from the other side through the same pairing.
 *
 * Cached at module scope because three forms ask for this list — the company
 * record's section, the bulk add, and the update form — and they were three
 * separate fetches of the same rows.
 */
let cache: StatusOption[] | null = null;
let inFlight: Promise<StatusOption[]> | null = null;

function load(): Promise<StatusOption[]> {
  if (cache) return Promise.resolve(cache);
  if (!inFlight) {
    inFlight = fetch('/api/config?category=other_relationship_status', { cache: 'no-store' })
      .then(r => (r.ok ? r.json() : []))
      .then((rows: { id?: number; value?: string; inverse_value?: string | null }[]) => {
        cache = expandStatusOptions(
          (Array.isArray(rows) ? rows : []).map(r => ({
            id: Number(r.id ?? 0),
            value: String(r.value ?? ''),
            inverse_value: r.inverse_value ?? null,
          })),
        );
        return cache;
      })
      .catch(() => [] as StatusOption[])
      .finally(() => { inFlight = null; });
  }
  return inFlight;
}

/** Drops the cache, for when admin settings change the list. */
export function invalidateRelationshipStatusOptions() {
  cache = null;
}

export function useRelationshipStatusOptions(): StatusOption[] {
  const [options, setOptions] = useState<StatusOption[]>(cache ?? []);

  useEffect(() => {
    let alive = true;
    void load().then(list => { if (alive) setOptions(list); });
    return () => { alive = false; };
  }, []);

  return options;
}
