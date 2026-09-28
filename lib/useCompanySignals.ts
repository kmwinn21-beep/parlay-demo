'use client';

import { useEffect, useState } from 'react';
import type { SignalKey } from '@/lib/competitiveSignals';

/**
 * Which competitive signals each company carries, by company id.
 *
 * One fetch per scope, shared: several tables can render the same conference's
 * companies on one page, and each asking separately is the same answer computed
 * three times.
 *
 * Cached by scope rather than globally — the conference-scoped answer and the
 * whole-book answer are different answers to different questions, and a cache
 * that confused them would badge a company for a relationship at another show.
 */
export type CompanySignals = Record<number, SignalKey[]>;

const cache = new Map<string, CompanySignals>();
const inFlight = new Map<string, Promise<CompanySignals>>();

function load(conferenceId?: number): Promise<CompanySignals> {
  const key = conferenceId ? `conference:${conferenceId}` : 'all';
  const hit = cache.get(key);
  if (hit) return Promise.resolve(hit);
  const pending = inFlight.get(key);
  if (pending) return pending;

  const url = conferenceId
    ? `/api/companies/signals?conference_id=${conferenceId}`
    : '/api/companies/signals';
  const p = fetch(url, { cache: 'no-store' })
    .then(r => (r.ok ? r.json() : null))
    .then((d: { signals?: CompanySignals } | null) => {
      const signals = d?.signals ?? {};
      cache.set(key, signals);
      return signals;
    })
    // An empty map is the right answer when this fails: the badges are extra
    // information about a row, and a table that will not render because one
    // optional column could not load is a worse outcome than a table without
    // it.
    .catch(() => ({} as CompanySignals))
    .finally(() => { inFlight.delete(key); });
  inFlight.set(key, p);
  return p;
}

export function useCompanySignals(conferenceId?: number): CompanySignals {
  const key = conferenceId ? `conference:${conferenceId}` : 'all';
  const [signals, setSignals] = useState<CompanySignals>(() => cache.get(key) ?? {});

  useEffect(() => {
    let cancelled = false;
    void load(conferenceId).then(s => { if (!cancelled) setSignals(s); });
    return () => { cancelled = true; };
  }, [conferenceId, key]);

  return signals;
}

/** Forget what was loaded — after something that changes a relationship. */
export function invalidateCompanySignals() {
  cache.clear();
}
