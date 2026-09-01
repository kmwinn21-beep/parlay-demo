'use client';

import { useEffect, useState } from 'react';

/**
 * The company types an account counts as its target audience, read from the
 * ICP Parameters rule in Admin > ICP (icp_rules, category 'company_type').
 *
 * The server-side equivalent is lib/icpCompanyTypes.ts, which also resolves
 * option ids. Here the comparison is against display values, because that is
 * what the attendee and company rows carry into the browser.
 */
export function useIcpCompanyTypes(): { types: string[]; loaded: boolean } {
  const [types, setTypes] = useState<string[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/admin/icp-rules', { cache: 'no-store' })
      .then(r => (r.ok ? r.json() : null))
      .then((data: { rules?: { category: string; conditions: { option_value: string }[] }[] } | null) => {
        if (cancelled) return;
        // Every company_type rule, not just the first — the admin UI allows more
        // than one, and they are all part of the same definition.
        const values = (data?.rules ?? [])
          .filter(r => r.category === 'company_type')
          .flatMap(r => r.conditions.map(c => String(c.option_value ?? '').trim()))
          .filter(Boolean);
        setTypes(Array.from(new Set(values)));
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoaded(true); });
    return () => { cancelled = true; };
  }, []);

  return { types, loaded };
}

/**
 * Whether a company_type cell — one value, or a comma-separated list of them —
 * names any of the ICP types.
 *
 * An account with no ICP company_type rule matches nothing here rather than
 * everything: this gates an affordance, and offering it on every row of an
 * unconfigured account is noisier than offering it on none.
 */
export function matchesIcpCompanyType(companyType: string | null | undefined, icpTypes: string[]): boolean {
  if (icpTypes.length === 0) return false;
  const wanted = new Set(icpTypes.map(t => t.toLowerCase()));
  return String(companyType ?? '')
    .split(',')
    .map(s => s.trim().toLowerCase())
    .filter(Boolean)
    .some(t => wanted.has(t));
}
