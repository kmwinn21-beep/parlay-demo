'use client';

import { useEffect, useState } from 'react';
import { buildColorMap, type ColorMap } from '@/lib/colors';

interface ConfigOption {
  id: number;
  category: string;
  value: string;
  sort_order: number;
  color: string | null;
}

/**
 * Fetches all config options and returns color maps keyed by category.
 * Caches in-memory so multiple components on the same page share data.
 */
let globalCache: { maps: Record<string, ColorMap>; ts: number } | null = null;
const CACHE_TTL = 30_000; // 30 seconds

export function useConfigColors(): Record<string, ColorMap> {
  const [maps, setMaps] = useState<Record<string, ColorMap>>(globalCache?.maps ?? {});

  useEffect(() => {
    if (globalCache && Date.now() - globalCache.ts < CACHE_TTL) {
      setMaps(globalCache.maps);
      return;
    }

    fetch('/api/config')
      .then(r => r.json())
      .then((rows: ConfigOption[]) => {
        const byCategory: Record<string, ConfigOption[]> = {};
        for (const row of rows) {
          (byCategory[row.category] ??= []).push(row);
        }
        const result: Record<string, ColorMap> = {};
        for (const [cat, opts] of Object.entries(byCategory)) {
          result[cat] = buildColorMap(opts);
        }
        globalCache = { maps: result, ts: Date.now() };
        setMaps(result);
      })
      .catch(() => { /* keep existing/empty maps */ });
  }, []);

  return maps;
}

/** Invalidate the cache (call after admin panel saves a color) */
export function invalidateConfigColors() {
  globalCache = null;
}
