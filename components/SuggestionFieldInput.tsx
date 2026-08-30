'use client';

import { useState } from 'react';
import { MultiSelect, CompanyPicker, type CompanyOption, type ConfigOption } from '@/components/VendorRelationshipFields';
import type { SuggestionField } from '@/lib/suggestions/registry';

/** One field, rendered as whatever the registry says it is. */
export function SuggestionFieldInput({ field, value, options, companies, onChange }: {
  field: SuggestionField;
  value: unknown;
  options: ConfigOption[];
  companies: CompanyOption[];
  onChange: (v: unknown) => void;
}) {
  const [other, setOther] = useState(false);

  if (field.companyRef) {
    const name = String(value ?? '');
    const match = companies.find(c => c.name.trim().toLowerCase() === name.trim().toLowerCase());
    // An unmatched name is the normal case for a vendor nobody has recorded
    // yet — it becomes a new company on accept, which is why it stays visible
    // as typed rather than being silently blanked.
    return (
      <div>
        {other || !match ? (
          <div>
            <label className="label text-xs">{field.label}</label>
            <input
              value={name}
              onChange={e => onChange(e.target.value)}
              className="input-field"
              placeholder="Company name"
            />
            <p className="text-[11px] text-gray-400 mt-1">
              {match ? 'Matches an existing company.' : 'No company by this name yet — accepting will create it.'}
            </p>
          </div>
        ) : (
          <CompanyPicker
            companies={companies}
            value={match.id}
            onChange={id => onChange(companies.find(c => c.id === id)?.name ?? name)}
            onPickOther={() => setOther(true)}
            otherName={name}
          />
        )}
      </div>
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
        rows={2}
        className="input-field resize-none"
        placeholder={field.required ? '' : 'Optional'}
      />
    </div>
  );
}

