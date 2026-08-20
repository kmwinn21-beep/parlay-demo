'use client';

import { useEffect, useState } from 'react';

/**
 * The follow_up_actions config category, which carries two names per option:
 * the full one in `value` (what gets stored on the follow-up) and a short one
 * in `description` (what the tables and pills show, since the full names are
 * too long for a column).
 */
export interface FollowUpAction {
  id: number;
  /** Full name — the value stored on follow_ups.follow_up_action. */
  value: string;
  /** Short name for display; falls back to the full name when unset. */
  shortName: string;
}

const CACHE_TTL = 60_000;
let cache: { options: FollowUpAction[]; ts: number } | null = null;

export function useFollowUpActions(): FollowUpAction[] {
  const [options, setOptions] = useState<FollowUpAction[]>(cache?.options ?? []);

  useEffect(() => {
    if (cache && Date.now() - cache.ts < CACHE_TTL) {
      setOptions(cache.options);
      return;
    }
    fetch('/api/config?category=follow_up_actions')
      .then(r => (r.ok ? r.json() : []))
      .then((rows: { id: number; value: string; sort_order: number; description: string | null }[]) => {
        const opts = [...rows]
          .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
          .map(o => ({
            id: Number(o.id),
            value: String(o.value),
            shortName: (o.description ?? '').trim() || String(o.value),
          }));
        cache = { options: opts, ts: Date.now() };
        setOptions(opts);
      })
      .catch(() => {});
  }, []);

  return options;
}

/** Stored full name → the short name to display. Unknown values pass through. */
export function followUpActionLabel(stored: string | null | undefined, options: FollowUpAction[]): string {
  if (!stored) return '';
  return options.find(o => o.value === stored)?.shortName ?? stored;
}
