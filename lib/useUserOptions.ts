'use client';

import { useEffect, useState } from 'react';

export interface UserOption {
  id: number;
  value: string;
}

let cache: { options: UserOption[]; ts: number } | null = null;
const CACHE_TTL = 30_000;

export function useUserOptions(): UserOption[] {
  const [options, setOptions] = useState<UserOption[]>(cache?.options ?? []);

  useEffect(() => {
    if (cache && Date.now() - cache.ts < CACHE_TTL) {
      setOptions(cache.options);
      return;
    }
    fetch('/api/config?category=user')
      .then(r => r.json())
      .then((rows: { id: number; value: string }[]) => {
        const opts = rows.map(r => ({ id: Number(r.id), value: String(r.value) }));
        cache = { options: opts, ts: Date.now() };
        setOptions(opts);
      })
      .catch(() => {});
  }, []);

  return options;
}

export function invalidateUserOptions() {
  cache = null;
}

/** Parse a comma-separated string of user IDs into an array of numbers */
export function parseRepIds(stored: string | null | undefined): number[] {
  if (!stored) return [];
  return stored
    .split(',')
    .map(s => parseInt(s.trim(), 10))
    .filter(n => !isNaN(n) && n > 0);
}

/** Resolve stored rep IDs to full names, joined by ", " */
export function resolveRepNames(stored: string | null | undefined, opts: UserOption[]): string {
  if (!stored) return '';
  const ids = parseRepIds(stored);
  if (ids.length === 0) {
    // Legacy: stored as a name string — return as-is
    return stored;
  }
  return ids
    .map(id => opts.find(u => u.id === id)?.value ?? '')
    .filter(Boolean)
    .join(', ');
}

/** Derive "First Initial + Last Initial" from a full name, e.g. "Kevin Winn" → "KW" */
export function getRepInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0) return '';
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

/** Resolve stored rep IDs to an array of initials strings */
export function resolveRepInitials(stored: string | null | undefined, opts: UserOption[]): string[] {
  if (!stored) return [];
  const ids = parseRepIds(stored);
  if (ids.length === 0) {
    // Legacy: stored as a comma-separated name string
    return stored
      .split(',')
      .map(s => getRepInitials(s.trim()))
      .filter(Boolean);
  }
  return ids
    .map(id => {
      const user = opts.find(u => u.id === id);
      return user ? getRepInitials(user.value) : null;
    })
    .filter(Boolean) as string[];
}

// ---------------------------------------------------------------------------
// Generic config-with-IDs hook (for any category)
// ---------------------------------------------------------------------------

const configWithIdsCache: Record<string, { options: UserOption[]; ts: number }> = {};

/**
 * Fetch config options with their IDs for any category.
 * Results are cached per-category for 30 seconds.
 */
export function useConfigWithIds(category: string): UserOption[] {
  const [options, setOptions] = useState<UserOption[]>(
    configWithIdsCache[category]?.options ?? []
  );

  useEffect(() => {
    const cached = configWithIdsCache[category];
    if (cached && Date.now() - cached.ts < CACHE_TTL) {
      setOptions(cached.options);
      return;
    }
    fetch(`/api/config?category=${encodeURIComponent(category)}`)
      .then(r => r.json())
      .then((rows: { id: number; value: string; sort_order: number }[]) => {
        const opts = [...rows]
          .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
          .map(o => ({ id: Number(o.id), value: String(o.value) }));
        configWithIdsCache[category] = { options: opts, ts: Date.now() };
        setOptions(opts);
      })
      .catch(() => {});
  }, [category]);

  return options;
}

/**
 * Resolve a stored value (ID string or legacy name string) to a display value.
 * - If stored is a numeric string, looks up the option by ID.
 * - Otherwise returns stored as-is (backward compat).
 */
export function resolveConfigValue(
  stored: string | null | undefined,
  opts: UserOption[]
): string {
  if (!stored) return '';
  const num = parseInt(stored, 10);
  if (!isNaN(num) && String(num) === stored.trim()) {
    const found = opts.find(o => o.id === num);
    if (found) return found.value;
  }
  return stored;
}
