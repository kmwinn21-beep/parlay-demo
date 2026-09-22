'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { SuggestionGroupCard } from '@/components/SuggestionGroupCard';
import { groupSuggestions, type SuggestionGroup } from '@/lib/suggestions/group';
import { useSuggestionCatalog } from '@/lib/suggestions/useSuggestionCatalog';
import { useSuggestionReview, SuggestionActions } from '@/components/SuggestionReview';
import { QuickViewDrawer, type QuickViewTarget } from '@/components/QuickViewDrawer';
import { useMobileCollapse } from '@/lib/useMobileCollapse';

interface PendingSuggestion {
  id: number;
  source_note_id: number | null;
  target_key: string;
  entity_type: string;
  entity_id: number;
  payload: Record<string, unknown>;
  quote: string | null;
  confidence: string;
  company_name: string | null;
}

/**
 * The same avatar rule the rollup uses: initials on a colour derived from the
 * name, so one company looks the same wherever it appears.
 */
function CompanyAvatar({ name }: { name: string }) {
  const initials = name.trim().split(/\s+/).slice(0, 2).map(w => w[0]?.toUpperCase() ?? '').join('');
  const colors = [
    { bg: '#dbeafe', text: '#1e40af' },
    { bg: '#dcfce7', text: '#166534' },
    { bg: '#fce7f3', text: '#9d174d' },
    { bg: '#fef3c7', text: '#92400e' },
    { bg: '#ede9fe', text: '#5b21b6' },
    { bg: '#ccfbf1', text: '#134e4a' },
  ];
  const hash = name.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
  const { bg, text } = colors[hash % colors.length];
  return (
    <div
      className="w-7 h-7 rounded-lg flex-shrink-0 flex items-center justify-center text-[10px] font-bold"
      style={{ backgroundColor: bg, color: text }}
    >
      {initials || '?'}
    </div>
  );
}

/**
 * Everything still waiting on you, from every company.
 *
 * The same decisions the record pages offer, gathered in one place so they can
 * be worked through rather than stumbled upon. A suggestion that nobody
 * happens to open the right record for is a suggestion that never gets
 * answered, and the extractor produces them faster than anyone visits records.
 *
 * Grouped by company and collapsed, because the unit of work is an account
 * rather than a sentence: three things read from three notes about the same
 * operator are one sitting, not three.
 *
 * Global on purpose — a suggestion is about a company, not about an event, so
 * it does not follow the conference the rest of the dashboard is scoped to.
 */
export function PendingReviewSection({ className = '', onCount }: {
  className?: string;
  /**
   * How many suggestions are waiting, reported as it changes.
   *
   * The column above decides how to divide its height on this, and needs to
   * know about zero as well — a queue with nothing in it renders nothing and
   * should not be given space.
   */
  onCount?: (count: number) => void;
}) {
  const [rows, setRows] = useState<PendingSuggestion[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [openCompany, setOpenCompany] = useState<number | null>(null);
  /** The company being looked at without leaving the queue. */
  const [quickView, setQuickView] = useState<QuickViewTarget | null>(null);
  const [edits, setEdits] = useState<Record<string, Record<string, unknown>>>({});
  const { options, companies } = useSuggestionCatalog();
  // Folds away on a phone like the three cards above it, and never folds on a
  // desktop, where it is one half of a column rather than a card in a stack.
  const { isMobile, expanded, toggle, showBody } = useMobileCollapse();

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/suggestions?scope=mine', { cache: 'no-store' });
      setRows(res.ok ? await res.json() : []);
    } catch {
      // A queue that fails to load is an empty queue, not an error card. The
      // work is still on the records themselves.
      setRows([]);
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { if (loaded) onCount?.(rows.length); }, [loaded, rows.length, onCount]);

  const { busyKey, review, openForm, modals } = useSuggestionReview(
    useCallback((ids: number[]) => {
      const done = new Set(ids);
      setRows(prev => prev.filter(r => !done.has(r.id)));
    }, []),
  );

  /**
   * One entry per company, each holding the grouped cards for it.
   *
   * groupSuggestions already collapses several targets about one company into
   * a single decision; this is the layer above that — several such decisions,
   * from different notes, about the same account.
   */
  const byCompany = useMemo(() => {
    const map = new Map<number, { id: number; name: string; groups: SuggestionGroup[] }>();
    for (const row of rows) {
      const entry = map.get(row.entity_id)
        ?? { id: row.entity_id, name: row.company_name || `Company ${row.entity_id}`, groups: [] };
      map.set(row.entity_id, entry);
    }
    for (const entry of Array.from(map.values())) {
      entry.groups = groupSuggestions(rows.filter(r => r.entity_id === entry.id));
    }
    return Array.from(map.values())
      .filter(c => c.groups.length > 0)
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [rows]);

  const total = rows.length;

  // Nothing waiting is not worth a card saying so — the dashboard is busy
  // enough, and this appears the moment there is something to do.
  if (!loaded || byCompany.length === 0) return null;

  return (
    <div className={`card flex flex-col min-h-0 ${className}`}>
      {/* The same header the three cards above it have: a w-5 icon, gap-2, and
          the serif title at text-lg. It was smaller and unmarked, which made it
          read as a subsection of the Feed rather than a section of its own. */}
      <div className="flex items-center gap-2 flex-shrink-0">
        <button
          type="button"
          onClick={toggle}
          aria-expanded={!isMobile || expanded}
          className={`flex items-center gap-2 text-left group min-w-0 ${isMobile ? '' : 'cursor-default'}`}
        >
          {/* A checklist: rows of things waiting to be ticked off, which is
              what the queue is. */}
          <svg
            className="w-5 h-5 flex-shrink-0 text-brand-secondary"
            fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden
          >
            <rect x="3" y="4" width="4" height="4" rx="1" strokeWidth={2} />
            <rect x="3" y="11" width="4" height="4" rx="1" strokeWidth={2} />
            <rect x="3" y="18" width="4" height="3" rx="1" strokeWidth={2} />
            <path strokeLinecap="round" strokeWidth={2} d="M11 6h10M11 13h10M11 19.5h10" />
          </svg>
          <span className="text-lg font-semibold text-brand-primary font-serif group-hover:text-brand-secondary transition-colors">
            Pending Review
          </span>
          <span className="flex-shrink-0 text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-200">
            {total}
          </span>
          <svg
            className={`w-4 h-4 text-gray-400 transition-transform duration-200 lg:hidden ${expanded ? 'rotate-180' : ''}`}
            fill="none" stroke="currentColor" viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      </div>

      {/* The subtitle belongs to the body, so it folds away with it. */}
      {showBody && (
      <p className="mt-0.5 text-xs text-gray-400 flex-shrink-0">
        Suggested updates based on your logged notes
      </p>
      )}

      {/* Thin on a desktop, where the bar is the only sign there is more below
          in a short column; absent on a phone, where the page scrolls anyway. */}
      {showBody && (
      <div className="mt-3 space-y-2 overflow-y-auto min-h-0 flex-1 scrollbar-desktop-thin">
        {byCompany.map(company => {
          const isOpen = openCompany === company.id;
          const count = company.groups.reduce((n, g) => n + g.members.length, 0);
          return (
            <div key={company.id} className="rounded-lg border border-gray-200 overflow-hidden">
              <button
                type="button"
                onClick={() => setOpenCompany(prev => prev === company.id ? null : company.id)}
                className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left hover:bg-gray-50 transition-colors"
              >
                <svg
                  className={`w-3.5 h-3.5 flex-shrink-0 text-gray-400 transition-transform ${isOpen ? 'rotate-90' : ''}`}
                  fill="none" stroke="currentColor" viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
                <CompanyAvatar name={company.name} />
                <span className="flex-1 min-w-0 truncate text-sm font-medium text-gray-800">
                  {company.name}
                </span>
                <span className="flex-shrink-0 w-5 h-5 flex items-center justify-center rounded-full bg-amber-100 text-amber-800 border border-amber-300 text-[10px] font-bold">
                  {count}
                </span>
              </button>

              {isOpen && (
                <div className="border-t border-gray-100 p-2 space-y-2 bg-gray-50/50">
                  {company.groups.map((group, i) => (
                    <SuggestionGroupCard
                      key={group.key}
                      index={i + 1}
                      collapsible
                      group={{ ...group, draft: { ...group.draft, ...(edits[group.key] ?? {}) } }}
                      options={options}
                      companies={companies}
                      onChange={(field, value) => setEdits(prev => ({
                        ...prev, [group.key]: { ...prev[group.key], [field]: value },
                      }))}
                    >
                      <SuggestionActions
                        group={group}
                        review={review}
                        openForm={openForm}
                        busyKey={busyKey}
                        draft={{ ...group.draft, ...(edits[group.key] ?? {}) }}
                      />
                    </SuggestionGroupCard>
                  ))}

                  {/* Two ways out of the queue and into the company: a look
                      without losing your place, and a move that gives it up.
                      Opposite ends because they are opposite intentions. */}
                  <div className="flex items-center justify-between gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setQuickView({ type: 'company', id: company.id, name: company.name })}
                      className="flex items-center gap-1.5 text-xs font-medium text-brand-secondary hover:underline"
                    >
                      <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      </svg>
                      Quick View
                    </button>
                    <Link
                      href={`/companies/${company.id}`}
                      className="text-xs font-medium text-brand-secondary hover:underline whitespace-nowrap"
                    >
                      Go to Record →
                    </Link>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
      )}

      {modals}
      {quickView && (
        <QuickViewDrawer target={quickView} onClose={() => setQuickView(null)} />
      )}
    </div>
  );
}
