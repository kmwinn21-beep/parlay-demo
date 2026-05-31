'use client';

import { useEffect, useState } from 'react';
import { getConfig } from '@/lib/configCache';

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
let globalCache: Record<string, { options: Record<string, string[]>; ts: number }> = {};
const CACHE_TTL = 5 * 60_000; // 5 minutes
const formKeyInFlight = new Map<string, Promise<unknown>>();

// Legacy "True"/"False" values should never appear in ICP options
const BLOCKED_ICP_VALUES = new Set(['True', 'False']);

export function useConfigOptions(formKey?: string): Record<string, string[]> {
  const cacheKey = formKey ?? '__all__';
  const [options, setOptions] = useState<Record<string, string[]>>(globalCache[cacheKey]?.options ?? {});

  useEffect(() => {
    if (globalCache[cacheKey] && Date.now() - globalCache[cacheKey].ts < CACHE_TTL) {
      setOptions(globalCache[cacheKey].options);
      return;
    }

    let fetchPromise: Promise<unknown>;
    if (formKey) {
      if (!formKeyInFlight.has(formKey)) {
        const p = fetch(`/api/config?form=${encodeURIComponent(formKey)}`, { cache: 'no-store' })
          .then(r => r.json())
          .finally(() => formKeyInFlight.delete(formKey));
        formKeyInFlight.set(formKey, p);
      }
      fetchPromise = formKeyInFlight.get(formKey)!;
    } else {
      fetchPromise = getConfig();
    }

    fetchPromise
      .then((data: unknown) => {
        const rows = data as ConfigOption[];
        const byCategory: Record<string, ConfigOption[]> = {};
        for (const row of rows) {
          (byCategory[row.category] ??= []).push(row);
        }
        const result: Record<string, string[]> = {};
        for (const [cat, opts] of Object.entries(byCategory)) {
          let values = opts
            .sort((a, b) => a.sort_order - b.sort_order)
            .map(o => o.value);
          if (cat === 'icp') {
            values = values.filter(v => !BLOCKED_ICP_VALUES.has(v));
          }
          result[cat] = values;
        }
        globalCache[cacheKey] = { options: result, ts: Date.now() };
        setOptions(result);
      })
      .catch(() => { /* keep existing/empty options */ });
  }, [cacheKey, formKey]); // eslint-disable-line react-hooks/exhaustive-deps

  return options;
}

/** Invalidate the cache (call after admin panel saves an option) */
export function invalidateConfigOptions() {
  globalCache = {};
}
