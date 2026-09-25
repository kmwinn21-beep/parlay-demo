'use client';

import { useMemo, useState } from 'react';
import {
  groupCompanies, filterCompanies, typesPresent, NO_TYPE_GROUP,
  type PickerCompany,
} from '@/lib/relationshipPicker';

/** Three across, two rows, before the rest fold away. */
const COLS = 3;
const ROWS_COLLAPSED = 2;
const VISIBLE = COLS * ROWS_COLLAPSED;

/**
 * Choosing what the map is centred on.
 *
 * The filter chips are the company types actually on this map rather than the
 * account's whole taxonomy — a chip that filters to nothing is worse than no
 * chip. They are alternatives rather than conditions: selecting Customer and
 * Partner shows both, which is what a row of chips means to the person
 * clicking them.
 */
export function EntityPicker({ companies, icpTypes, selectedId, onSelect }: {
  companies: PickerCompany[];
  icpTypes: string[];
  selectedId: number | null;
  onSelect: (id: number) => void;
}) {
  const [search, setSearch] = useState('');
  const [selectedTypes, setSelectedTypes] = useState<string[]>([]);
  const [showAllTypes, setShowAllTypes] = useState(false);

  const allTypes = useMemo(() => typesPresent(companies, icpTypes), [companies, icpTypes]);
  // Counted off the collapsed slice, not the visible one — measuring the
  // visible list makes this zero once expanded and the control disappears
  // with it, leaving the section expandable but not collapsible.
  const hiddenCount = Math.max(0, allTypes.length - VISIBLE);
  const visibleTypes = showAllTypes ? allTypes : allTypes.slice(0, VISIBLE);

  const groups = useMemo(
    () => groupCompanies(filterCompanies(companies, selectedTypes, search), icpTypes),
    [companies, selectedTypes, search, icpTypes],
  );

  const toggleType = (t: string) =>
    setSelectedTypes(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t]);

  return (
    <div className="w-72 flex-shrink-0 flex flex-col min-h-0 rounded-xl border border-gray-200 bg-white">
      <div className="p-3 border-b border-gray-100 space-y-3">
        <p className="text-sm font-bold text-brand-primary font-serif">Select an entity</p>

        <input
          type="search"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search companies and vendors"
          className="w-full rounded-lg border border-gray-300 px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-brand-secondary/40"
        />

        {allTypes.length > 0 && (
          <div>
            {/* Animated on max-height rather than height: the rows are of
                unknown height until they render, and a fixed height would clip
                a chip whose label wraps. */}
            <div
              className="overflow-hidden transition-[max-height] duration-300 ease-in-out"
              style={{ maxHeight: showAllTypes ? `${Math.ceil(allTypes.length / COLS) * 34 + 8}px` : `${ROWS_COLLAPSED * 34}px` }}
            >
              <div className="grid grid-cols-3 gap-1.5">
                {visibleTypes.map(t => {
                  const on = selectedTypes.includes(t);
                  return (
                    <button
                      key={t}
                      type="button"
                      onClick={() => toggleType(t)}
                      aria-pressed={on}
                      title={t}
                      className={`truncate px-2 py-1.5 rounded-lg border text-[11px] font-medium transition-colors ${
                        on
                          ? 'border-brand-secondary bg-brand-secondary text-white'
                          : 'border-gray-200 bg-gray-50 text-gray-600 hover:border-gray-300'
                      }`}
                    >
                      {t === NO_TYPE_GROUP ? 'No type' : t}
                    </button>
                  );
                })}
              </div>
            </div>
            {hiddenCount > 0 && (
              <button
                type="button"
                onClick={() => setShowAllTypes(v => !v)}
                aria-expanded={showAllTypes}
                className="w-full mt-1.5 flex items-center justify-center gap-1 py-1 text-[11px] font-medium text-gray-400 hover:text-brand-secondary transition-colors"
              >
                {showAllTypes ? 'See fewer' : `See more (${hiddenCount})`}
                <svg className={`w-3.5 h-3.5 transition-transform duration-200 ${showAllTypes ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
            )}
          </div>
        )}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto scrollbar-desktop-thin p-2 space-y-4">
        {groups.length === 0 && (
          <p className="text-xs text-gray-400 text-center py-6">No companies match.</p>
        )}
        {groups.map(group => (
          <div key={group.type}>
            <p className="px-1 pb-1 text-[10px] font-bold uppercase tracking-widest text-gray-400">
              {group.type}
            </p>
            <div className="space-y-1">
              {group.companies.map(c => {
                const selected = selectedId === c.id;
                // Everything else recedes once a company is chosen, so the one
                // the map is drawn around is obvious at a glance.
                const dimmed = selectedId !== null && !selected;
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => onSelect(c.id)}
                    className={`w-full text-left rounded-lg border px-2.5 py-2 transition-all ${
                      selected
                        ? 'border-brand-secondary bg-brand-secondary/5'
                        : 'border-transparent hover:bg-gray-50'
                    } ${dimmed ? 'opacity-40' : ''}`}
                  >
                    <div className="flex items-start gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-semibold text-gray-800 truncate">{c.name}</p>
                        {/* ICP groups get the numbers a rep is judging them on;
                            everything else gets the type, which is the thing
                            that distinguishes one vendor row from another. */}
                        {group.isIcp ? (
                          <p className="text-[10px] text-gray-500 mt-0.5 truncate">
                            {c.units != null && <>{c.units.toLocaleString()} units</>}
                            {c.units != null && ' · '}
                            {c.attendeeCount} attendee{c.attendeeCount === 1 ? '' : 's'}
                          </p>
                        ) : (
                          <div className="flex flex-wrap gap-1 mt-0.5">
                            {c.company_types.slice(0, 2).map(t => (
                              <span key={t} className="px-1.5 py-0.5 rounded-full bg-gray-100 text-[9px] font-medium text-gray-500">
                                {t}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                      <span className="flex-shrink-0 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-gray-100 text-[10px] font-bold text-gray-600">
                        {c.relationshipCount}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
