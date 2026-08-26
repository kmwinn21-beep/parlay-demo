'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * The controls the Vendor / Other Relationship form is built from.
 *
 * They live here rather than beside the section because the same form is
 * offered twice — once per company from the detail page, and once across a
 * selection from the companies table's bulk actions. Two copies of a form this
 * fiddly would drift.
 */

export interface CompanyOption { id: number; name: string }
export interface ConfigOption { id: number; value: string }

/** The escape hatch's sentinel — no company id can collide with it. */
export const OTHER_COMPANY = -1;
/** How long a typed-in "Other" value may be. */
export const OTHER_VALUE_MAX = 20;

export function SingleSelect({ label, value, onChange, options, placeholder }: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  placeholder: string;
}) {
  return (
    <div>
      <label className="label">{label}</label>
      <select value={value} onChange={e => onChange(e.target.value)} className="input-field w-full">
        <option value="">{placeholder}</option>
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}

/**
 * Multi-select over config option values. Values rather than ids, so a card
 * keeps reading correctly if an option is renamed later.
 */
export function MultiSelect({ label, options, values, onChange, placeholder }: {
  label: string;
  options: ConfigOption[];
  values: string[];
  onChange: (v: string[]) => void;
  placeholder: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onDocClick = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  const toggle = (v: string) => onChange(values.includes(v) ? values.filter(x => x !== v) : [...values, v]);

  return (
    <div ref={ref}>
      <label className="label">{label}</label>
      <div className="relative">
        <button type="button" onClick={() => setOpen(o => !o)} className="input-field w-full text-left flex items-center justify-between">
          <span className={values.length === 0 ? 'text-gray-400' : 'text-gray-800'}>
            {values.length === 0 ? placeholder : values.join(', ')}
          </span>
          <svg className={`w-4 h-4 text-gray-400 flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        {open && (
          <div className="absolute z-30 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-56 overflow-y-auto">
            {options.length === 0 ? (
              <div className="px-3 py-2 text-sm text-gray-500">No options available.</div>
            ) : options.map(o => {
              const checked = values.includes(o.value);
              return (
                <button key={o.id} type="button" onClick={() => toggle(o.value)}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 flex items-center gap-2">
                  <span className={`w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center ${checked ? 'bg-brand-secondary border-brand-secondary' : 'border-gray-300'}`}>
                    {checked && <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
                  </span>
                  {o.value}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

/** Type-to-filter company picker with the site's standard "Other" escape hatch. */
export function CompanyPicker({ companies, value, onChange, onPickOther, otherName }: {
  companies: CompanyOption[];
  value: number | null;
  onChange: (id: number) => void;
  onPickOther: () => void;
  otherName: string;
}) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onDocClick = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  const selectedName = value === OTHER_COMPANY
    ? (otherName || 'Other (not in list)')
    : companies.find(c => c.id === value)?.name ?? '';
  const q = query.trim().toLowerCase();
  const results = (q ? companies.filter(c => c.name.toLowerCase().includes(q)) : companies).slice(0, 50);

  return (
    <div ref={ref}>
      <label className="label">Company *</label>
      <div className="relative">
        <input
          value={open ? query : selectedName}
          onChange={e => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => { setQuery(''); setOpen(true); }}
          placeholder="Search companies..."
          className="input-field w-full"
        />
        {open && (
          <div className="absolute z-30 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-56 overflow-y-auto">
            <button
              type="button"
              onClick={() => { onPickOther(); setOpen(false); }}
              className="w-full text-left px-3 py-2 text-sm font-medium text-brand-secondary hover:bg-gray-50 border-b border-gray-100"
            >
              Other (not in list)
            </button>
            {results.length === 0 ? (
              <div className="px-3 py-2 text-sm text-gray-400">No companies match &quot;{query.trim()}&quot;.</div>
            ) : results.map(c => (
              <button key={c.id} type="button" onClick={() => { onChange(c.id); setOpen(false); }}
                className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 truncate">
                {c.name}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/** Replaces the literal "Other" with whatever the person typed in its place. */
export function resolveOther(values: string[], typed: string): string[] {
  return values.map(v => (v === 'Other' ? typed.trim() : v)).filter(Boolean);
}
