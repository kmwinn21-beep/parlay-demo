'use client';

import type { ReactNode } from 'react';
import { type CompanyOption, type ConfigOption } from '@/components/VendorRelationshipFields';
import { SuggestionFieldInput } from '@/components/SuggestionFieldInput';
import type { SuggestionGroup } from '@/lib/suggestions/group';

/**
 * Everything one note said about one company, as a single decision.
 *
 * The buttons are passed in because the two places this appears answer
 * different questions: on the record it is accept or dismiss, straight after a
 * note it is confirm, defer, or ignore.
 */
export function SuggestionGroupCard({ group, options, companies, onChange, children }: {
  group: SuggestionGroup;
  options: Record<string, ConfigOption[]>;
  companies: CompanyOption[];
  onChange: (key: string, value: unknown) => void;
  children: ReactNode;
}) {
  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50/40 p-3">
      <div className="flex items-center justify-between gap-2 mb-2">
        <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide truncate">
          {group.summary}
        </p>
        {group.confidence !== 'high' && (
          <span className="flex-shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-white text-gray-500 border border-gray-200">
            {group.confidence} confidence
          </span>
        )}
      </div>

      {/* The words this came from — the reason to believe it, and the quickest
          way to spot one that's wrong. Members usually share a quote; when they
          don't, both are worth seeing. */}
      {group.quotes.map(q => (
        <p key={q} className="text-xs text-gray-600 italic border-l-2 border-amber-300 pl-2 mb-3">
          “{q}”
        </p>
      ))}

      <div className="space-y-2">
        {group.fields.map(f => (
          <SuggestionFieldInput
            key={f.key}
            field={f}
            value={group.draft[f.key]}
            options={f.optionCategory ? options[f.optionCategory] ?? [] : []}
            companies={companies}
            onChange={v => onChange(f.key, v)}
          />
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2 mt-3">{children}</div>
    </div>
  );
}
