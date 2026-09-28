'use client';

import { useEffect, useState } from 'react';
import type { SignalKey } from '@/lib/competitiveSignals';

/**
 * Which competitive signals each company carries, by company id.
 *
 * One fetch, shared: several tables can render companies on one page, and each
 * asking separately is the same answer computed three times.
 *
 * Not scoped to a conference. A badge answers "what is going on with this
 * company", which does not stop being true because the other end of it did not
 * come to this show.
 */
export type CompanySignals = Record<number, SignalKey[]>;

let cache: CompanySignals | null = null;
let inFlight: Promise<CompanySignals> | null = null;

function load(): Promise<CompanySignals> {
  if (cache) return Promise.resolve(cache);
  if (inFlight) return inFlight;

  const p = fetch('/api/companies/signals', { cache: 'no-store' })
    .then(r => (r.ok ? r.json() : null))
    .then((d: { signals?: CompanySignals } | null) => {
      const signals = d?.signals ?? {};
      cache = signals;
      return signals;
    })
    // An empty map is the right answer when this fails: the badges are extra
    // information about a row, and a table that will not render because one
    // optional column could not load is a worse outcome than a table without
    // it.
    .catch(() => ({} as CompanySignals))
    .finally(() => { inFlight = null; });
  inFlight = p;
  return p;
}

export function useCompanySignals(): CompanySignals {
  const [signals, setSignals] = useState<CompanySignals>(() => cache ?? {});

  useEffect(() => {
    let cancelled = false;
    void load().then(s => { if (!cancelled) setSignals(s); });
    return () => { cancelled = true; };
  }, []);

  return signals;
}

/** Forget what was loaded — after something that changes a relationship. */
export function invalidateCompanySignals() {
  cache = null;
}
