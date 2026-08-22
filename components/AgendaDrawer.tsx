'use client';

import { useEffect, useMemo, useState } from 'react';
import { DashboardDrawer } from '@/components/DashboardDrawer';
import { DashboardAgendaSection } from '@/components/DashboardAgendaSection';
import { useActiveConference } from '@/components/ActiveConferenceContext';

interface DrawerConference {
  id: number;
  name: string;
  start_date: string;
  end_date: string;
  status: 'in_progress' | 'upcoming' | 'past';
}

/**
 * The agenda, in a drawer opened from the dashboard's Agenda button.
 *
 * Everything here is client-rendered and client-fetched. The conference list
 * used to arrive from an async server component wrapped in Suspense, and
 * mounting that boundary after hydration is what crashed the dashboard on
 * tenant instances. The same list comes from /api/conferences instead, so the
 * drawer has no server-created boundary to adopt when it opens.
 */
export function AgendaDrawer({ onClose }: { onClose: () => void }) {
  const { activeConference } = useActiveConference();
  const [conferences, setConferences] = useState<DrawerConference[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [view, setView] = useState<'my' | 'full'>('my');

  useEffect(() => {
    let cancelled = false;
    fetch('/api/conferences')
      .then(r => (r.ok ? r.json() : []))
      .then((rows: Record<string, unknown>[]) => {
        if (cancelled) return;
        const today = new Date().toISOString().slice(0, 10);
        const list: DrawerConference[] = (Array.isArray(rows) ? rows : []).map(r => {
          const start = String(r.start_date ?? '');
          const end = String(r.end_date ?? '');
          const status: DrawerConference['status'] =
            start <= today && end >= today ? 'in_progress' : end >= today ? 'upcoming' : 'past';
          return {
            id: Number(r.id),
            name: String(r.name ?? ''),
            start_date: start,
            end_date: end,
            // Same rule the dashboard used server-side.
            status,
          };
        }).filter(c => c.id > 0);
        setConferences(list);
      })
      .catch(() => { if (!cancelled) setConferences([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const groups = useMemo(() => ({
    inProgress: conferences.filter(c => c.status === 'in_progress').sort((a, b) => a.start_date.localeCompare(b.start_date)),
    upcoming: conferences.filter(c => c.status === 'upcoming').sort((a, b) => a.end_date.localeCompare(b.end_date)),
    past: conferences.filter(c => c.status === 'past').sort((a, b) => b.start_date.localeCompare(a.start_date)),
  }), [conferences]);

  // The conference in the header wins, then whatever is running, then next up.
  useEffect(() => {
    if (selectedId != null || conferences.length === 0) return;
    const active = activeConference && conferences.find(c => c.id === activeConference.id);
    setSelectedId(active?.id ?? groups.inProgress[0]?.id ?? groups.upcoming[0]?.id ?? conferences[0]?.id ?? null);
  }, [conferences, activeConference, groups, selectedId]);

  const selected = conferences.find(c => c.id === selectedId) ?? null;

  return (
    <DashboardDrawer title="Agenda" subtitle={selected?.name ?? null} onClose={onClose}>
      <div className="flex flex-col gap-2 px-4 pt-3 pb-4 flex-shrink-0">
        {/* Full width — there is nothing sharing this row any more. */}
        <div className="flex items-center gap-0.5 bg-gray-100 rounded-lg p-0.5">
          <button
            type="button"
            onClick={() => setView('my')}
            className={`flex-1 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${view === 'my' ? 'bg-white text-brand-primary shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
          >
            My Agenda
          </button>
          <button
            type="button"
            onClick={() => setView('full')}
            className={`flex-1 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${view === 'full' ? 'bg-white text-brand-primary shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
          >
            Full Agenda
          </button>
        </div>

        {conferences.length > 0 && (
          <select
            value={selectedId ?? ''}
            onChange={e => setSelectedId(Number(e.target.value))}
            className="input-field text-sm w-full"
          >
            {groups.inProgress.length > 0 && (
              <optgroup label="In Progress">
                {groups.inProgress.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </optgroup>
            )}
            {groups.upcoming.length > 0 && (
              <optgroup label="Upcoming">
                {groups.upcoming.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </optgroup>
            )}
            {groups.past.length > 0 && (
              <optgroup label="Past">
                {groups.past.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </optgroup>
            )}
          </select>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-10 text-gray-400">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-brand-secondary border-t-transparent mr-2" />
          <span className="text-xs">Loading conferences…</span>
        </div>
      ) : selected ? (
        <DashboardAgendaSection
          conferenceId={selected.id}
          conferenceName={selected.name}
          view={view}
          onViewChange={setView}
        />
      ) : (
        <p className="text-sm text-gray-400 text-center py-10">No conferences available.</p>
      )}
    </DashboardDrawer>
  );
}
