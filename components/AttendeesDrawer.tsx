'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { DashboardDrawer } from '@/components/DashboardDrawer';
import { MobileAttendeeCard, type AttendeeCardRow } from '@/components/MobileAttendeeCard';
import { MobileCard, MobileCardList } from '@/components/MobileCardList';
import { ScrollRow } from '@/components/ScrollRow';
import { KebabMenu } from '@/components/KebabMenu';
import { useActiveConference } from '@/components/ActiveConferenceContext';
import { useUser } from '@/components/UserContext';
import { useUserOptions, parseRepIds, getRepInitials } from '@/lib/useUserOptions';
import { useConfigColors } from '@/lib/useConfigColors';
import { getBadgeClass, getPreset, formatStatusLabel, type ColorMap } from '@/lib/colors';

interface DrawerAttendee extends AttendeeCardRow {
  company_icp?: string | null;
}

interface DrawerCompany {
  id: number;
  name: string;
  company_type?: string | null;
  status?: string | null;
  icp?: string | null;
  assigned_user?: string | null;
  conference_count?: number;
  /** Attendees from THIS conference, not the company's lifetime total. */
  attendee_count: number;
}

/**
 * The set conference's attendee list, in a drawer off the dashboard.
 *
 * Client-rendered and client-fetched throughout — no server component, no
 * Suspense boundary to adopt when it opens, for the same reason the agenda
 * drawer is built that way.
 */

/**
 * One company row, matching the shape of the phone's company card in the
 * conference Companies tab: name, assigned reps to the right, then type,
 * statuses and the two counts on one scrolling line.
 */
function DrawerCompanyCard({ company, userOptions, colorMaps, onOpen }: {
  company: DrawerCompany;
  userOptions: ReturnType<typeof useUserOptions>;
  colorMaps: Record<string, ColorMap>;
  onOpen: () => void;
}) {
  const reps = parseRepIds(company.assigned_user ?? '')
    .map(id => userOptions.find(u => u.id === id))
    .filter((u): u is NonNullable<typeof u> => Boolean(u));
  const statuses = String(company.status ?? '').split(',').map(v => v.trim()).filter(v => v && v !== 'Unknown');

  return (
    <div className="px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <button type="button" onClick={onOpen} className="min-w-0 text-left">
          <span className="block text-sm font-semibold text-brand-secondary hover:underline leading-snug">{company.name}</span>
        </button>
        <div className="flex flex-wrap justify-end gap-1 flex-shrink-0">
          {reps.map(u => (
            <span key={u.id} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap ${getPreset(colorMaps.user?.[u.value]).badgeClass}`}>
              <svg className="w-3 h-3 opacity-70" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
              {getRepInitials(u.value)}
            </span>
          ))}
        </div>
      </div>
      <ScrollRow className="mt-2" gapClass="gap-2">
        {company.company_type && (
          <span className={`${getBadgeClass(company.company_type, colorMaps.company_type || {})} flex-shrink-0 whitespace-nowrap`}>{company.company_type}</span>
        )}
        {statuses.map(st => (
          <span key={st} className={`${getBadgeClass(st, colorMaps.status || {})} flex-shrink-0 whitespace-nowrap`}>{formatStatusLabel(st)}</span>
        ))}
        <span className="inline-flex items-center gap-1 text-xs text-gray-500 flex-shrink-0 whitespace-nowrap">
          <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
          {company.attendee_count}
        </span>
        <span className="inline-flex items-center gap-1 text-xs text-gray-500 flex-shrink-0 whitespace-nowrap">
          <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
          {company.conference_count ?? 0}
        </span>
      </ScrollRow>
    </div>
  );
}

export function AttendeesDrawer({ onClose }: { onClose: () => void }) {
  const { activeConference } = useActiveConference();
  const { user: currentUser } = useUser();
  const userOptions = useUserOptions();
  const colorMaps = useConfigColors();

  const [mode, setMode] = useState<'attendees' | 'companies'>('attendees');
  const [attendees, setAttendees] = useState<DrawerAttendee[]>([]);
  const [companies, setCompanies] = useState<DrawerCompany[] | null>(null);
  const [companiesLoading, setCompaniesLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showPhotos, setShowPhotos] = useState(true);
  const [quickIcp, setQuickIcp] = useState(false);
  const [quickMine, setQuickMine] = useState(false);
  const [quickTypes, setQuickTypes] = useState<Set<string>>(new Set());
  const [quickView, setQuickView] = useState<{ type: 'attendee' | 'company'; id: number } | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [adding, setAdding] = useState(false);
  const EMPTY_ADD = { first_name: '', last_name: '', title: '', company: '', email: '', phone: '', linkedin_url: '' };
  const [addForm, setAddForm] = useState(EMPTY_ADD);

  const loadAttendees = useCallback(async () => {
    if (!activeConference) { setLoading(false); return; }
    try {
      // no-store: the refetch after adding someone was being served the
      // pre-add response from the browser cache, so the new row never appeared.
      const r = await fetch(`/api/conferences/${activeConference.id}`, { cache: 'no-store' });
      const data = r.ok ? await r.json() : null;
      setAttendees(Array.isArray(data?.attendees) ? data.attendees : []);
    } catch {
      setAttendees([]);
    } finally {
      setLoading(false);
    }
  }, [activeConference]);

  useEffect(() => { void loadAttendees(); }, [loadAttendees]);

  // Fetched on first switch to Companies rather than up front — most opens of
  // this drawer never leave the attendee list. Derived the same way the
  // conference Companies tab derives it: the companies its attendees belong
  // to, counted by attendees at THIS conference.
  useEffect(() => {
    if (mode !== 'companies' || companies !== null || !activeConference) return;
    let cancelled = false;
    setCompaniesLoading(true);
    (async () => {
      try {
        const wanted = new Map<number, number>();
        for (const a of attendees) {
          if (a.company_id) wanted.set(a.company_id, (wanted.get(a.company_id) ?? 0) + 1);
        }
        if (wanted.size === 0) { if (!cancelled) setCompanies([]); return; }
        const res = await fetch('/api/companies');
        const all = res.ok ? await res.json() : [];
        const list: DrawerCompany[] = (Array.isArray(all) ? all : [])
          .filter((c: DrawerCompany) => wanted.has(c.id))
          .map((c: DrawerCompany) => ({ ...c, attendee_count: wanted.get(c.id) ?? 0 }));
        if (!cancelled) setCompanies(list);
      } catch {
        if (!cancelled) setCompanies([]);
      } finally {
        if (!cancelled) setCompaniesLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [mode, companies, activeConference, attendees]);

  const handleAdd = async () => {
    if (!activeConference) return;
    if (!addForm.first_name.trim() || !addForm.last_name.trim()) {
      toast.error('First and last name are required.');
      return;
    }
    setAdding(true);
    try {
      const res = await fetch(`/api/conferences/${activeConference.id}/attendees/add`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(addForm),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Failed to add attendee');
      toast.success('Attendee added!');
      setAddForm(EMPTY_ADD);
      setShowAddForm(false);
      await loadAttendees();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to add attendee');
    } finally {
      setAdding(false);
    }
  };

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

  const companyTypeButtons = useMemo(() => {
    const seen = new Set<string>();
    (companies ?? []).forEach(c => { if (c.company_type) seen.add(c.company_type); });
    const rest = Array.from(seen).filter(t => t !== 'Customer' && t !== 'Competitor').sort();
    return [...rest, ...['Customer', 'Competitor'].filter(t => seen.has(t))];
  }, [companies]);

  const filteredCompanies = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (companies ?? []).filter(c => {
      if (q && !c.name.toLowerCase().includes(q)) return false;
      if (quickIcp && c.icp !== 'Yes') return false;
      if (quickTypes.size > 0 && !quickTypes.has(c.company_type || '')) return false;
      if (quickMine && !(currentUser?.configId != null && parseRepIds(c.assigned_user ?? '').includes(currentUser.configId))) return false;
      return true;
    }).sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));
  }, [companies, search, quickIcp, quickTypes, quickMine, currentUser]);

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
        title={
          // Replaces the title outright, so the drawer's two lists read as one
          // thing you switch between rather than two drawers.
          <div className="inline-flex rounded-lg border border-gray-200 bg-gray-50 p-0.5" role="tablist">
            {(['attendees', 'companies'] as const).map(m => (
              <button
                key={m}
                type="button"
                role="tab"
                aria-selected={mode === m}
                onClick={() => { setMode(m); setSearch(''); setQuickTypes(new Set()); }}
                className={`px-3 py-1 rounded-md text-sm font-semibold font-serif transition-colors ${
                  mode === m ? 'bg-white text-brand-primary shadow-sm' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {m === 'attendees' ? 'Attendees' : 'Companies'}
              </button>
            ))}
          </div>
        }
        subtitle={activeConference?.name ?? null}
        onClose={onClose}
      >
        <div className="px-4 pt-3 pb-2 flex flex-col gap-2 border-b border-gray-100">
          {mode === 'attendees' && (
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
                  { label: 'Add Attendee', onClick: () => setShowAddForm(v => !v), disabled: !activeConference },
                  { label: showPhotos ? 'Hide pictures' : 'Show pictures', onClick: () => setShowPhotos(v => !v) },
                ]}
              />
            </div>
          </div>
          )}

          <div className="relative">
            <svg className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11a6 6 0 11-12 0 6 6 0 0112 0z" />
            </svg>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder={mode === 'attendees' ? 'Search by name, company, title…' : 'Search companies…'}
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
            {(mode === 'attendees' ? typeButtons : companyTypeButtons).map(type => (
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

        {/* Same fields and endpoint the conference details list posts to, so an
            attendee added here lands exactly where one added there would. */}
        {mode === 'attendees' && showAddForm && activeConference && (
          <div className="m-4 p-4 bg-blue-50 border border-brand-secondary rounded-xl">
            <h3 className="text-sm font-semibold text-brand-primary mb-3">Add Attendee to Conference</h3>
            <div className="grid grid-cols-1 gap-3">
              {([
                ['first_name', 'First Name *', 'text'],
                ['last_name', 'Last Name *', 'text'],
                ['title', 'Title', 'text'],
                ['company', 'Company', 'text'],
                ['email', 'Email', 'email'],
                ['phone', 'Phone', 'tel'],
                ['linkedin_url', 'LinkedIn URL', 'url'],
              ] as const).map(([key, label, type]) => (
                <div key={key}>
                  <label className="label text-xs">{label}</label>
                  <input
                    type={type}
                    value={addForm[key]}
                    onChange={e => setAddForm(p => ({ ...p, [key]: e.target.value }))}
                    className="input-field text-sm"
                  />
                </div>
              ))}
            </div>
            <div className="flex gap-2 mt-3">
              <button
                type="button"
                onClick={handleAdd}
                disabled={adding || !addForm.first_name.trim() || !addForm.last_name.trim()}
                className="flex-1 px-3 py-2 text-sm font-semibold text-white bg-brand-secondary rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {adding ? 'Adding…' : 'Add Attendee'}
              </button>
              <button
                type="button"
                onClick={() => { setShowAddForm(false); setAddForm(EMPTY_ADD); }}
                className="px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-100 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {!activeConference ? (
          <p className="text-sm text-gray-400 text-center py-10">
            Set an active conference to see its {mode === 'attendees' ? 'attendees' : 'companies'}.
          </p>
        ) : mode === 'companies' ? (
          companiesLoading || companies === null ? (
            <div className="flex items-center justify-center py-10 text-gray-400">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-brand-secondary border-t-transparent mr-2" />
              <span className="text-xs">Loading companies…</span>
            </div>
          ) : filteredCompanies.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-10">
              {companies.length === 0 ? 'No companies on this conference yet.' : 'No companies match those filters.'}
            </p>
          ) : (
            <div className="divide-y divide-gray-100">
              {filteredCompanies.map(c => (
                <DrawerCompanyCard
                  key={c.id}
                  company={c}
                  userOptions={userOptions}
                  colorMaps={colorMaps}
                  onOpen={() => setQuickView({ type: 'company', id: c.id })}
                />
              ))}
            </div>
          )
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
          <MobileCardList>
            {filtered.map(a => (
              <MobileCard key={a.id}>
              <MobileAttendeeCard
                attendee={a}
                showPhotos={showPhotos}
                selected={false}
                onOpenAttendee={id => setQuickView({ type: 'attendee', id })}
                onOpenCompany={id => setQuickView({ type: 'company', id })}
                userOptions={userOptions}
                colorMaps={colorMaps}
              />
              </MobileCard>
            ))}
          </MobileCardList>
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
