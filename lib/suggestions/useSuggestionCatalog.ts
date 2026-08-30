'use client';

import { useCallback, useEffect, useState } from 'react';
import { type CompanyOption, type ConfigOption } from '@/components/VendorRelationshipFields';
import { SUGGESTION_TARGETS } from './registry';

/**
 * The option lists and companies a suggestion's fields need, loaded once.
 *
 * Only the categories the registry actually uses — adding a target picks up
 * its list here without anyone remembering to.
 */
export function useSuggestionCatalog(enabled = true) {
  const [options, setOptions] = useState<Record<string, ConfigOption[]>>({});
  const [companies, setCompanies] = useState<CompanyOption[]>([]);

  const load = useCallback(() => {
    const cats = new Set<string>();
    for (const t of SUGGESTION_TARGETS) for (const f of t.fields) if (f.optionCategory) cats.add(f.optionCategory);
    Array.from(cats).forEach(cat => {
      fetch(`/api/config?category=${cat}`)
        .then(r => (r.ok ? r.json() : []))
        .then((d: ConfigOption[]) => setOptions(prev => ({ ...prev, [cat]: Array.isArray(d) ? d : [] })))
        .catch(() => {});
    });
    fetch('/api/companies?limit=2000')
      .then(r => (r.ok ? r.json() : []))
      .then((d: CompanyOption[]) => setCompanies(Array.isArray(d) ? d.map(c => ({ id: c.id, name: c.name })) : []))
      .catch(() => {});
  }, []);

  useEffect(() => { if (enabled) load(); }, [enabled, load]);

  return { options, companies, load };
}
