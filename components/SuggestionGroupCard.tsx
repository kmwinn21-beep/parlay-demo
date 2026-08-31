'use client';

import { useState, type ReactNode } from 'react';
import { type CompanyOption, type ConfigOption } from '@/components/VendorRelationshipFields';
import { SuggestionFieldInput } from '@/components/SuggestionFieldInput';
import { NEW_COMPANY_TYPE_FIELD, type SuggestionGroup } from '@/lib/suggestions/group';

/**
 * Everything one note said about one company, as a single decision.
 *
 * The buttons are passed in because the two places this appears answer
 * different questions: on the record it is accept or dismiss, straight after a
 * note it is confirm, defer, or ignore.
 */
export function SuggestionGroupCard({ group, index, options, companies, onChange, collapsible = false, children }: {
  group: SuggestionGroup;
  /** 1-based position, shown as a badge so one card is visibly one of several. */
  index: number;
  options: Record<string, ConfigOption[]>;
  companies: CompanyOption[];
  onChange: (key: string, value: unknown) => void;
  /**
   * Collapsed to its header and quote until opened. For the queue on a record,
   * where several of these stack up and the point is to scan what is waiting.
   * The prompt after a note leaves them open — there the whole point is to
   * decide on the spot.
   */
  collapsible?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(!collapsible);
  // A name that matches nothing will be created on accept, and a company
  // created with no type is one somebody has to go back and fix. So the type
  // is asked for exactly when it is about to be needed.
  const companyField = group.fields.find(f => f.companyRef);
  const companyName = companyField ? String(group.draft[companyField.key] ?? '').trim() : '';
  const willCreate = !!companyName && !companies.some(c => c.name.trim().toLowerCase() === companyName.toLowerCase());

  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50/40 p-3">
      <div
        className={`flex items-center justify-between gap-2 mb-2${collapsible ? ' cursor-pointer' : ''}`}
        onClick={collapsible ? () => setOpen(v => !v) : undefined}
        role={collapsible ? 'button' : undefined}
        tabIndex={collapsible ? 0 : undefined}
        onKeyDown={collapsible ? e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen(v => !v); } } : undefined}
      >
        <div className="flex items-center gap-1.5 min-w-0">
          {collapsible && (
            <svg className={`w-3.5 h-3.5 text-gray-400 flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          )}
          <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide truncate">
            {group.summary}
          </p>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {group.confidence !== 'high' && (
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-white text-gray-500 border border-gray-200">
              {group.confidence} confidence
            </span>
          )}
          <span className="w-5 h-5 flex items-center justify-center rounded-full bg-amber-100 text-amber-800 border border-amber-300 text-[10px] font-bold">
            {index}
          </span>
        </div>
      </div>

      {/* The words this came from — the reason to believe it, and the quickest
          way to spot one that's wrong. Members usually share a quote; when they
          don't, both are worth seeing. */}
      {group.quotes.map(q => (
        <p key={q} className={`text-xs text-gray-600 italic border-l-2 border-amber-300 pl-2 ${open ? 'mb-3' : 'mb-0'}`}>
          “{q}”
        </p>
      ))}

      {open && (
      <div className="space-y-2">
        {group.fields.map(f => (
          <div key={f.key} className="space-y-2">
            <SuggestionFieldInput
              field={f}
              value={group.draft[f.key]}
              options={f.optionCategory ? options[f.optionCategory] ?? [] : []}
              companies={companies}
              onChange={v => onChange(f.key, v)}
            />
            {/* Directly under the company it applies to, so it reads as part of
                creating that company rather than as another fact from the note. */}
            {f.companyRef && willCreate && (
              <SuggestionFieldInput
                field={NEW_COMPANY_TYPE_FIELD}
                value={group.draft[NEW_COMPANY_TYPE_FIELD.key]}
                options={options[NEW_COMPANY_TYPE_FIELD.optionCategory!] ?? []}
                companies={companies}
                onChange={v => onChange(NEW_COMPANY_TYPE_FIELD.key, v)}
              />
            )}
          </div>
        ))}
      </div>
      )}

      {open && <div className="flex flex-wrap items-center gap-2 mt-3">{children}</div>}
    </div>
  );
}
