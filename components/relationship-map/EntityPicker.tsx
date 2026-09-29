'use client';

import { useMemo, useState } from 'react';
import {
  groupCompanies, groupByTier, filterCompanies, typesPresent, NO_TYPE_GROUP,
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
export function EntityPicker({ companies, icpTypes, selectedId, onSelect, targetTiers, conferenceName, className = 'w-72 flex-shrink-0', style }: {
  companies: PickerCompany[];
  icpTypes: string[];
  selectedId: number | null;
  onSelect: (id: number) => void;
  /**
   * companyId → the best tier anyone there was targeted at, for this
   * conference. Absent while it loads, and empty when nobody was targeted —
   * which are different things to the reader, so the button says which.
   */
  targetTiers?: Map<number, string>;
  /** Named in the empty state: "No Targets set for ALIS FWD". */
  conferenceName?: string;
  /** The desktop column is a fixed width; on a phone it is the whole screen. */
  className?: string;
  /** Its width, when the caller owns it. See RAIL_WIDTH. */
  style?: React.CSSProperties;
}) {
  const [search, setSearch] = useState('');
  const [selectedTypes, setSelectedTypes] = useState<string[]>([]);
  const [showAllTypes, setShowAllTypes] = useState(false);
  const [targetsOnly, setTargetsOnly] = useState(false);

  const hasTargets = (targetTiers?.size ?? 0) > 0;

  const allTypes = useMemo(() => typesPresent(companies, icpTypes), [companies, icpTypes]);
  // Targets takes a cell in the same grid, so the collapsed block is still two
  // full rows rather than two rows and an orphan.
  const typeSlots = VISIBLE - 1;
  // Counted off the collapsed slice, not the visible one — measuring the
  // visible list makes this zero once expanded and the control disappears
  // with it, leaving the section expandable but not collapsible.
  const hiddenCount = Math.max(0, allTypes.length - typeSlots);
  const visibleTypes = showAllTypes ? allTypes : allTypes.slice(0, typeSlots);

  /**
   * The two filters compose rather than replace each other: Targets narrows to
   * the people this conference is about, the type chips narrow within that.
   * They are different questions, so answering one does not discard the other.
   */
  const shown = useMemo(() => {
    const byType = filterCompanies(companies, selectedTypes, search);
    if (!targetsOnly) return byType;
    return byType.filter(c => targetTiers?.has(c.id));
  }, [companies, selectedTypes, search, targetsOnly, targetTiers]);

  const groups = useMemo(() => groupCompanies(shown, icpTypes), [shown, icpTypes]);
  // Under Targets the headings are the tiers, because that is the ranking the
  // reader came to this button for — a tier list sorted into company types
  // answers a question nobody asked.
  const tierGroups = useMemo(
    () => (targetsOnly ? groupByTier(shown, id => targetTiers?.get(id)) : []),
    [targetsOnly, shown, targetTiers],
  );

  /**
   * The two groupings rendered through one list.
   *
   * Only the heading and the subtitle differ, so they are reduced to a heading
   * and a flag here rather than duplicating the row markup — which is where the
   * two would drift apart.
   */
  const sections = useMemo(() => (
    targetsOnly
      ? tierGroups.map(g => ({ key: `tier:${g.tier}`, label: g.label, companies: g.companies, showCounts: true }))
      : groups.map(g => ({ key: `type:${g.type}`, label: g.type, companies: g.companies, showCounts: g.isIcp }))
  ), [targetsOnly, tierGroups, groups]);

  const toggleType = (t: string) =>
    setSelectedTypes(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t]);

  return (
    <div style={style} className={`${className} flex flex-col min-h-0 rounded-xl border border-gray-200 bg-white`}>
      <div className="p-3 border-b border-gray-100 space-y-3">
        <input
          type="search"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search companies and vendors"
          className="w-full rounded-lg border border-gray-300 px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-brand-secondary/40"
        />

        {/* Rendered whether or not any types are present: Targets is not one
            of them, and a map of untyped companies still has targets. */}
        {
          <div>
            {/* Animated on max-height rather than height: the rows are of
                unknown height until they render, and a fixed height would clip
                a chip whose label wraps. Counted over the cells, Targets
                included, or the last row is clipped when it is expanded. */}
            <div
              className="overflow-hidden transition-[max-height] duration-300 ease-in-out"
              style={{ maxHeight: showAllTypes ? `${Math.ceil((allTypes.length + 1) / COLS) * 34 + 8}px` : `${ROWS_COLLAPSED * 34}px` }}
            >
              <div className="grid grid-cols-3 gap-1.5">
                {/*
                 * First cell, and red whether or not it is on: this is the one
                 * filter here that is about the trip rather than about the
                 * data, and a rep opening the map at a conference is usually
                 * looking for exactly these companies.
                 *
                 * Greyed when nobody has been targeted, but still pressable —
                 * a dead button leaves the reader wondering whether it is
                 * broken or whether there is nothing to see, and the list says
                 * which.
                 */}
                <button
                  type="button"
                  onClick={() => setTargetsOnly(v => !v)}
                  aria-pressed={targetsOnly}
                  title={hasTargets
                    ? 'Companies with a target at this conference'
                    : `No targets set for ${conferenceName ?? 'this conference'}`}
                  className={`truncate px-2 py-1.5 rounded-lg border text-[11px] font-medium transition-colors ${
                    !hasTargets
                      ? (targetsOnly
                        ? 'border-gray-300 bg-gray-100 text-gray-400'
                        : 'border-gray-200 bg-gray-50 text-gray-300')
                      : (targetsOnly
                        ? 'border-red-400 bg-red-100 text-red-700'
                        : 'border-red-300 bg-gray-50 text-red-600 hover:border-red-400')
                  }`}
                >
                  Targets
                </button>
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
        }
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto scrollbar-desktop-thin p-2 space-y-4">
        {/* Said plainly, and naming the conference: the reader pressed a
            greyed-out button to find out whether it was empty or broken, and
            "No companies match" would answer neither. */}
        {targetsOnly && !hasTargets && (
          <p className="text-xs text-gray-400 text-center py-6">
            No Targets set for {conferenceName ?? 'this conference'}
          </p>
        )}
        {!(targetsOnly && !hasTargets) && sections.length === 0 && (
          <p className="text-xs text-gray-400 text-center py-6">No companies match.</p>
        )}
        {sections.map(section => (
          <div key={section.key}>
            <p className="px-1 pb-1 text-[10px] font-bold uppercase tracking-widest text-gray-400">
              {section.label}
            </p>
            <div className="space-y-1.5">
              {section.companies.map(c => {
                const selected = selectedId === c.id;
                // Everything else recedes once a company is chosen, so the one
                // the map is drawn around is obvious at a glance.
                const dimmed = selectedId !== null && !selected;
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => onSelect(c.id)}
                    className={`w-full text-left rounded-lg border px-3 py-2.5 transition-all ${
                      selected
                        ? 'border-brand-secondary bg-brand-secondary/5'
                        : 'border-gray-100 bg-gray-50 hover:bg-gray-100'
                    } ${dimmed ? 'opacity-40' : ''}`}
                  >
                    <div className="flex items-start gap-2">
                      <div className="min-w-0 flex-1">
                        {/* Full-strength until something else is chosen. The
                            rows were grey by default, which read as every
                            company being unavailable. */}
                        <p className="text-xs font-semibold text-brand-primary truncate">{c.name}</p>
                        {/* ICP groups get the numbers a rep is judging them on;
                            everything else gets the type, which is the thing
                            that distinguishes one vendor row from another. A
                            tier group is a list of accounts, so it reads as
                            ICP does. */}
                        {section.showCounts ? (
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
