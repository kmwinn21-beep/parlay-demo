'use client';

import { useEffect, useRef, useState } from 'react';
import { MultiSelect, type CompanyOption, type ConfigOption } from '@/components/VendorRelationshipFields';
import type { SuggestionField } from '@/lib/suggestions/registry';
import { findExact, findNearMatches } from '@/lib/suggestions/companyMatch';

/**
 * The company a suggestion names — searchable, and correctable.
 *
 * The extracted name is a starting point, not an answer: it can be the wrong
 * company, or the right one under a name the account already holds. So this
 * searches what exists while leaving whatever is typed intact — an unmatched
 * name is the normal case for a vendor nobody has recorded yet, and becomes a
 * new company on accept.
 */
function CompanyField({ label, name, companies, onChange }: {
  label: string;
  name: string;
  companies: CompanyOption[];
  onChange: (name: string) => void;
}) {
  const [query, setQuery] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) { setOpen(false); setQuery(null); }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  const match = findExact(name, companies);
  const nearMatches = match ? [] : findNearMatches(name, companies);
  // While searching, the box shows the search; otherwise it shows the value.
  const shown = query ?? name;
  const q = shown.trim().toLowerCase();
  // Filtering starts when the person types, not from the name already there —
  // opening the list to browse would otherwise show only the one company the
  // extractor guessed, which is the case where they most want to see others.
  const typed = (query ?? '').trim().toLowerCase();
  const results = (typed ? companies.filter(c => c.name.toLowerCase().includes(typed)) : companies).slice(0, 50);
  const exact = companies.some(c => c.name.trim().toLowerCase() === q);

  const pick = (value: string) => { onChange(value); setQuery(null); setOpen(false); };

  return (
    <div ref={ref}>
      <label className="label text-xs">{label}</label>
      <div className="relative">
        <input
          value={shown}
          // Typing is itself the answer when nothing is picked, so it edits the
          // value as well as the search — leaving the box is never a way to
          // lose what was typed.
          onChange={e => { setQuery(e.target.value); onChange(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          placeholder="Search or type a company name"
          className="input-field"
        />
        {open && (
          <div className="absolute z-30 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-56 overflow-y-auto">
            {shown.trim() && !exact && (
              <button
                type="button"
                onClick={() => pick(shown.trim())}
                className="w-full text-left px-3 py-2 text-sm font-medium text-brand-secondary hover:bg-gray-50 border-b border-gray-100"
              >
                Create “{shown.trim()}”
              </button>
            )}
            {results.length === 0 ? (
              <div className="px-3 py-2 text-sm text-gray-400">No companies match.</div>
            ) : results.map(c => (
              <button
                key={c.id}
                type="button"
                onClick={() => pick(c.name)}
                className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 truncate"
              >
                {c.name}
              </button>
            ))}
          </div>
        )}
      </div>
      {/* Offered, not applied: "Advent Health" may or may not be the same
          company as "AdventHealth Castle Rock", and only a person knows. */}
      {nearMatches.length > 0 && (
        <div className="mt-1 flex flex-wrap items-center gap-1">
          <span className="text-[11px] text-gray-500">Did you mean</span>
          {nearMatches.map(c => (
            <button
              key={c.id}
              type="button"
              onClick={() => pick(c.name)}
              className="text-[11px] font-medium px-1.5 py-0.5 rounded-full bg-white text-brand-secondary border border-gray-200 hover:bg-gray-50"
            >
              {c.name}
            </button>
          ))}
        </div>
      )}
      <p className="text-[11px] text-gray-400 mt-1">
        {match ? 'Matches an existing company.' : 'No company by this name yet — accepting will create it.'}
      </p>
    </div>
  );
}

/** One field, rendered as whatever the registry says it is. */
export function SuggestionFieldInput({ field, value, options, companies, onChange }: {
  field: SuggestionField;
  value: unknown;
  options: ConfigOption[];
  companies: CompanyOption[];
  onChange: (v: unknown) => void;
}) {
  if (field.companyRef) {
    return (
      <CompanyField
        label={field.label}
        name={String(value ?? '')}
        companies={companies}
        onChange={onChange}
      />
    );
  }

  if (field.optionCategory) {
    const values = Array.isArray(value) ? (value as string[]) : value ? [String(value)] : [];
    return (
      <MultiSelect
        label={field.label}
        options={options}
        values={values}
        onChange={v => onChange(field.multi ? v : (v[0] ?? null))}
        placeholder={`Select ${field.label.toLowerCase()}…`}
      />
    );
  }

  return (
    <div>
      <label className="label text-xs">{field.label}</label>
      <textarea
        value={String(value ?? '')}
        onChange={e => onChange(e.target.value)}
        // A provenance field arrives with the quote and its source on separate
        // lines; two rows would hide half of it behind a scroll.
        rows={field.provenance ? 4 : 2}
        className="input-field resize-none"
        placeholder={field.required ? '' : 'Optional'}
      />
    </div>
  );
}

