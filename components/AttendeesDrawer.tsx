'use client';

import { useEffect, useMemo, useState } from 'react';
import { DashboardDrawer } from '@/components/DashboardDrawer';
import { MobileAttendeeCard, type AttendeeCardRow } from '@/components/MobileAttendeeCard';
import { ScrollRow } from '@/components/ScrollRow';
import { KebabMenu } from '@/components/KebabMenu';
import { useActiveConference } from '@/components/ActiveConferenceContext';
import { useUser } from '@/components/UserContext';
import { useUserOptions, parseRepIds } from '@/lib/useUserOptions';
import { useConfigColors } from '@/lib/useConfigColors';

interface DrawerAttendee extends AttendeeCardRow {
  company_icp?: string | null;
}

/**
 * The set conference's attendee list, in a drawer off the dashboard.
 *
 * Client-rendered and client-fetched throughout — no server component, no
 * Suspense boundary to adopt when it opens, for the same reason the agenda
 * drawer is built that way.
 */
export function AttendeesDrawer({ onClose }: { onClose: () => void }) {
  const { activeConference } = useActiveConference();
  const { user: currentUser } = useUser();
  const userOptions = useUserOptions();
  const colorMaps = useConfigColors();

  const [attendees, setAttendees] = useState<DrawerAttendee[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showPhotos, setShowPhotos] = useState(false);
  const [quickIcp, setQuickIcp] = useState(false);
  const [quickMine, setQuickMine] = useState(false);
  const [quickTypes, setQuickTypes] = useState<Set<string>>(new Set());
  const [quickView, setQuickView] = useState<{ type: 'attendee' | 'company'; id: number } | null>(null);

  useEffect(() => {
    if (!activeConference) { setLoading(false); return; }
    let cancelled = false;
    fetch(`/api/conferences/${activeConference.id}`)
      .then(r => (r.ok ? r.json() : null))
      .then(data => {
        if (cancelled) return;
        setAttendees(Array.isArray(data?.attendees) ? data.attendees : []);
      })
      .catch(() => { if (!cancelled) setAttendees([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [activeConference]);

  // The company types actually present, so no button filters to nothing.
  const typeButtons = useMemo(() => {
    const seen = new Set<string>();
    attendees.forEach(a => { if (a.company_type) seen.add(a.company_type); });
    const rest = Array.from(seen).filter(t => t !== 'Customer' && t !== 'Competitor').sort();
    return [...rest, ...['Customer', 'Competitor'].filter(t => seen.has(t))];
  }, [attendees]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return attendees.filter(a => {
      if (q) {
        const name = `${a.first_name} ${a.last_name}`.toLowerCase();
        if (!(
          name.includes(q) ||
          (a.company_name || '').toLowerCase().includes(q) ||
          (a.title || '').toLowerCase().includes(q)
        )) return false;
      }
      if (quickIcp && a.company_icp !== 'Yes') return false;
      if (quickTypes.size > 0 && !quickTypes.has(a.company_type || '')) return false;
      if (quickMine && !(currentUser?.configId != null && parseRepIds(a.company_assigned_user ?? '').includes(currentUser.configId))) return false;
      return true;
    }).sort((a, b) =>
      `${a.last_name} ${a.first_name}`.toLowerCase().localeCompare(`${b.last_name} ${b.first_name}`.toLowerCase()));
  }, [attendees, search, quickIcp, quickTypes, quickMine, currentUser]);

  const anyQuick = quickIcp || quickMine || quickTypes.size > 0;
  const dim = (on: boolean) => (anyQuick && !on ? ' opacity-40' : '');

  const toggleType = (t: string) => setQuickTypes(prev => {
    const next = new Set(prev);
    next.has(t) ? next.delete(t) : next.add(t);
    return next;
  });

  return (
    <>
      <DashboardDrawer
        title="Attendees"
        subtitle={activeConference?.name ?? null}
        onClose={onClose}
      >
        <div className="px-4 pt-3 pb-2 flex flex-col gap-2 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <span className="text-xs font-medium text-gray-600">Show Pictures</span>
            <button
              type="button"
              role="switch"
              aria-checked={showPhotos}
              onClick={() => setShowPhotos(v => !v)}
              className={`relative inline-flex h-6 w-11 flex-shrink-0 rounded-full transition-colors ${showPhotos ? 'bg-brand-secondary' : 'bg-gray-200'}`}
            >
              <span className={`inline-block h-5 w-5 mt-0.5 rounded-full bg-white shadow transition-transform ${showPhotos ? 'translate-x-[22px]' : 'translate-x-0.5'}`} />
            </button>
            <div className="ml-auto">
              <KebabMenu
                title="Attendee actions"
                items={[
                  { label: 'Clear filters', onClick: () => { setSearch(''); setQuickIcp(false); setQuickMine(false); setQuickTypes(new Set()); }, disabled: !anyQuick && !search },
                  { label: showPhotos ? 'Hide pictures' : 'Show pictures', onClick: () => setShowPhotos(v => !v) },
                ]}
              />
            </div>
          </div>

          <div className="relative">
            <svg className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11a6 6 0 11-12 0 6 6 0 0112 0z" />
            </svg>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search by name, company, title…"
              className="input-field pl-9 text-sm w-full"
            />
          </div>

          <ScrollRow className="w-full" gapClass="gap-2">
            {currentUser && (
              <button
                type="button"
                onClick={() => setQuickMine(v => !v)}
                className={`flex-shrink-0 whitespace-nowrap px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors border-brand-secondary bg-brand-secondary/10 text-brand-secondary${dim(quickMine)}`}
              >
                My Accounts
              </button>
            )}
            <button
              type="button"
              onClick={() => setQuickIcp(v => !v)}
              className={`flex-shrink-0 whitespace-nowrap px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors border-green-300 bg-green-50 text-green-700${dim(quickIcp)}`}
            >
              ICP
            </button>
            {typeButtons.map(type => (
              <button
                key={type}
                type="button"
                onClick={() => toggleType(type)}
                className={`flex-shrink-0 whitespace-nowrap px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors border-gray-300 text-gray-600 hover:border-gray-400${dim(quickTypes.has(type))}`}
              >
                {type}
              </button>
            ))}
          </ScrollRow>
        </div>

        {!activeConference ? (
          <p className="text-sm text-gray-400 text-center py-10">Set an active conference to see its attendees.</p>
        ) : loading ? (
          <div className="flex items-center justify-center py-10 text-gray-400">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-brand-secondary border-t-transparent mr-2" />
            <span className="text-xs">Loading attendees…</span>
          </div>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-10">
            {attendees.length === 0 ? 'No attendees on this conference yet.' : 'No attendees match those filters.'}
          </p>
        ) : (
          <div className="divide-y divide-gray-100">
            {filtered.map(a => (
              <MobileAttendeeCard
                key={a.id}
                attendee={a}
                showPhotos={showPhotos}
                selected={false}
                onOpenAttendee={id => setQuickView({ type: 'attendee', id })}
                onOpenCompany={id => setQuickView({ type: 'company', id })}
                userOptions={userOptions}
                colorMaps={colorMaps}
              />
            ))}
          </div>
        )}
      </DashboardDrawer>

      {/* The record itself, embedded — the same view the conference details
          attendees tab opens from a name or a company. */}
      {quickView && (
        <>
          <div className="fixed inset-0 z-[71] bg-black/40" onClick={() => setQuickView(null)} />
          <div className="drawer-mobile-responsive fixed bottom-0 left-0 right-0 sm:inset-y-0 sm:left-auto sm:right-0 h-[85vh] sm:h-auto w-full sm:w-[520px] bg-white shadow-2xl flex flex-col rounded-t-2xl sm:rounded-tl-2xl sm:rounded-tr-none z-[72]">
            <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-gray-200 flex-shrink-0">
              <a
                href={`/${quickView.type === 'attendee' ? 'attendees' : 'companies'}/${quickView.id}`}
                className="text-sm text-brand-secondary hover:underline"
              >
                Go to {quickView.type === 'attendee' ? 'Attendee' : 'Company'} Record →
              </a>
              <button type="button" onClick={() => setQuickView(null)} className="p-1.5 rounded hover:bg-gray-100 text-gray-500" aria-label="Close">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <iframe
              src={`/${quickView.type === 'attendee' ? 'attendees' : 'companies'}/${quickView.id}?embed=true`}
              className="flex-1 w-full border-0"
              title="Record"
            />
          </div>
        </>
      )}
    </>
  );
}
