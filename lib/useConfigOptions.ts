'use client';

import { useEffect, useState } from 'react';

interface ConfigOption {
  id: number;
  category: string;
  value: string;
  sort_order: number;
  color: string | null;
}

/**
 * Fetches all config options and returns values grouped by category.
 * Caches in-memory so multiple components on the same page share data.
 */
let globalCache: { options: Record<string, string[]>; ts: number } | null = null;
const CACHE_TTL = 30_000; // 30 seconds

export function useConfigOptions(): Record<string, string[]> {
  const [options, setOptions] = useState<Record<string, string[]>>(globalCache?.options ?? {});

  useEffect(() => {
    if (globalCache && Date.now() - globalCache.ts < CACHE_TTL) {
      setOptions(globalCache.options);
      return;
    }

    fetch('/api/config')
      .then(r => r.json())
      .then((rows: ConfigOption[]) => {
        const byCategory: Record<string, ConfigOption[]> = {};
        for (const row of rows) {
          (byCategory[row.category] ??= []).push(row);
        }
        const result: Record<string, string[]> = {};
        for (const [cat, opts] of Object.entries(byCategory)) {
          result[cat] = opts
            .sort((a, b) => a.sort_order - b.sort_order)
            .map(o => o.value);
        }
        globalCache = { options: result, ts: Date.now() };
        setOptions(result);
      })
      .catch(() => { /* keep existing/empty options */ });
  }, []);

  return options;
}

/** Invalidate the cache (call after admin panel saves an option) */
export function invalidateConfigOptions() {
  globalCache = null;
}
