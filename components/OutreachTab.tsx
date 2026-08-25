'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { KebabPopover } from '@/components/KebabMenu';
import toast from 'react-hot-toast';
import { useUser } from '@/components/UserContext';
import { OutreachCompanyCard, type OutreachCompany, type OutreachAttendeeFilter } from './OutreachCompanyCard';
import { OutreachDrawer, type TimelineActivity, type ThreadNote } from './OutreachDrawer';
import { useAnchoredDrawer } from '@/lib/useAnchoredDrawer';
import { OutreachAssignModal } from './OutreachAssignModal';

interface OutreachResponse {
  companies: OutreachCompany[];
}

const STATUS_FILTER_OPTIONS: { value: string; label: string }[] = [
  { value: 'not_started', label: 'Not Started' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'completed', label: 'Completed' },
  { value: 'overdue', label: 'Overdue' },
];

export function OutreachTab({ conferenceId, conferenceName }: { conferenceId: number; conferenceName: string }) {
  const [data, setData] = useState<OutreachResponse | null>(null);
  const [loading, setLoading] = useState(true);
  // companyId -> target tier key ('1'|'2'|'3'|'unassigned'), sourced from the same
  // targeting endpoint the Conference Targets tab uses — reused as-is rather than
  // re-deriving tier scoring here (tier is a company-level classification, so it
  // applies to every attendee row within that company on the outreach card).
  const [tierByCompany, setTierByCompany] = useState<Map<number, string>>(new Map());

  const [drawerState, setDrawerState] = useState<{
    companyId: number;
    companyName: string;
    initialTab: 'timeline' | 'notes';
    attendeeFilter?: OutreachAttendeeFilter;
  } | null>(null);

  const [assignModalState, setAssignModalState] = useState<{
    companyId?: number;
    companyName?: string;
    currentAssigneeIds: number[];
  } | null>(null);

  const [assigneeFilter, setAssigneeFilter] = useState<number | null>(null);
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [myOutreachOnly, setMyOutreachOnly] = useState(false);
  const { user: currentUser } = useUser();

  // Holds the most recently logged activity/note so the open OutreachDrawer
  // (a sibling of the card that logged it) can fold it into its timeline/notes
  // immediately instead of waiting for a page refresh.
  const [pendingActivity, setPendingActivity] = useState<{ companyId: number; activity: TimelineActivity } | null>(null);
  const listWrapRef = useRef<HTMLDivElement>(null);
  const drawerPanelRef = useRef<HTMLDivElement>(null);
  const { offset: drawerOffset, overhang: drawerOverhang } = useAnchoredDrawer({
    open: drawerState != null,
    anchorKey: drawerState ? String(drawerState.companyId) : null,
    wrapRef: listWrapRef,
    panelRef: drawerPanelRef,
    findAnchor: (wrap, key) => wrap.querySelector<HTMLElement>(`[data-outreach-company="${CSS.escape(key)}"]`),
  });
  const [pendingNote, setPendingNote] = useState<{ companyId: number; note: ThreadNote } | null>(null);

  const loadOutreach = useCallback(async () => {
    try {
      const res = await fetch(`/api/conferences/${conferenceId}/outreach`);
      if (!res.ok) throw new Error();
      const json = await res.json() as OutreachResponse;
      setData(json);
    } catch {
      toast.error('Failed to load outreach data');
    } finally {
      setLoading(false);
    }
  }, [conferenceId]);

  useEffect(() => { loadOutreach(); }, [loadOutreach]);

  useEffect(() => {
    fetch(`/api/conferences/${conferenceId}/targeting`)
      .then(r => (r.ok ? r.json() : Promise.reject()))
      .then((json: { companies?: { company_id: number; target_priority_tier_key: string }[] }) => {
        const map = new Map<number, string>();
        for (const c of json.companies ?? []) map.set(c.company_id, c.target_priority_tier_key);
        setTierByCompany(map);
      })
      .catch(() => {});
  }, [conferenceId]);

  // Assignee filter options come from the outreach data itself (unique assignees
  // already present in the fetched companies) rather than a separate /api/users
  // call — no point listing reps who have nothing assigned at this conference.
  const assigneeOptions = useMemo(() => {
    const byId = new Map<number, string>();
    for (const c of data?.companies ?? []) {
      for (const a of c.assignees) byId.set(a.userId, a.displayName);
    }
    return Array.from(byId.entries())
      .map(([userId, displayName]) => ({ userId, displayName }))
      .sort((a, b) => a.displayName.localeCompare(b.displayName));
  }, [data]);

  const filteredCompanies = useMemo(() => {
    const companies = data?.companies ?? [];
    return companies.filter(c => {
      if (statusFilter && c.status !== statusFilter) return false;
      if (assigneeFilter != null && !c.assignees.some(a => a.userId === assigneeFilter)) return false;
      if (myOutreachOnly && currentUser?.configId != null && !c.assignees.some(a => a.userId === currentUser.configId)) return false;
      return true;
    });
  }, [data, statusFilter, assigneeFilter, myOutreachOnly, currentUser?.configId]);

  const totalCount = data?.companies.length ?? 0;

  if (loading) {
    return (
      <div className="card">
        <div className="flex items-center justify-center h-48">
          <div className="animate-spin w-8 h-8 border-4 border-brand-secondary border-t-transparent rounded-full" />
        </div>
      </div>
    );
  }

  const anyOutreachFilter = assigneeFilter != null || statusFilter != null || myOutreachOnly;
  const filterControls = (
    <>
      <select
        value={assigneeFilter ?? ''}
        onChange={e => setAssigneeFilter(e.target.value ? Number(e.target.value) : null)}
        className="input-field text-xs py-1.5 w-full lg:w-auto"
      >
        <option value="">All Assignees</option>
        {assigneeOptions.map(a => <option key={a.userId} value={a.userId}>{a.displayName}</option>)}
      </select>
      <select
        value={statusFilter ?? ''}
        onChange={e => setStatusFilter(e.target.value || null)}
        className="input-field text-xs py-1.5 w-full lg:w-auto"
      >
        <option value="">All Statuses</option>
        {STATUS_FILTER_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      {currentUser?.configId != null && (
        <button
          type="button"
          onClick={() => setMyOutreachOnly(v => !v)}
          className={`inline-flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-full border text-xs font-semibold transition-colors whitespace-nowrap flex-shrink-0 w-full lg:w-auto ${
            myOutreachOnly
              ? 'border-brand-secondary bg-brand-secondary/10 text-brand-secondary'
              : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
          }`}
        >
          My Outreach
        </button>
      )}
    </>
  );

  return (
    <div className="card p-0 overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between gap-3 flex-nowrap overflow-x-auto">
        <div className="flex items-center gap-2 flex-shrink-0">
          <h2 className="text-lg font-semibold text-brand-primary font-serif">Outreach</h2>
          {totalCount > 0 && (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
              {totalCount}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 flex-nowrap flex-shrink-0">
          {/* Desktop keeps the filters inline; mobile tucks them into the kebab. */}
          <div className="hidden lg:contents">{filterControls}</div>
          <button
            type="button"
            onClick={() => setAssignModalState({ currentAssigneeIds: [] })}
            className="btn-primary text-xs px-3 py-1.5 whitespace-nowrap flex-shrink-0"
          >
            Assign company
          </button>
          <KebabPopover className="lg:hidden" title="Outreach filters" active={anyOutreachFilter}>
            {filterControls}
          </KebabPopover>
        </div>
      </div>

      <div className="p-6">
        {totalCount === 0 ? (
          <div className="text-center py-12">
            <svg className="w-10 h-10 text-gray-200 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" /></svg>
            <p className="text-sm font-medium text-gray-500">No outreach assigned yet</p>
            <p className="text-xs text-gray-400 mt-1">Assign companies to your team to start tracking outreach activity</p>
            <button
              type="button"
              onClick={() => setAssignModalState({ currentAssigneeIds: [] })}
              className="btn-primary text-sm mt-4"
            >
              Assign first company
            </button>
          </div>
        ) : (
          <div className="flex gap-3 items-start">
            <div className="flex-1 min-w-0">
            <div ref={listWrapRef} className="space-y-2">
              {filteredCompanies.length === 0 && (
                <p className="text-sm text-gray-400 text-center py-8">No companies match the current filters.</p>
              )}
              {filteredCompanies.map(company => (
                <div
                  key={company.companyId}
                  data-outreach-company={company.companyId}
                  // Everything but the open card recedes, so the panel reads as
                  // belonging to one company.
                  className={drawerState && drawerState.companyId !== company.companyId
                    ? 'opacity-40 transition-opacity'
                    : 'transition-opacity'}
                >
                <OutreachCompanyCard
                  company={company}
                  conferenceId={conferenceId}
                  targetTier={tierByCompany.get(company.companyId)}
                  selectedAttendeeId={
                    drawerState?.companyId === company.companyId ? drawerState.attendeeFilter?.id ?? null : null
                  }
                  onActivityLogged={loadOutreach}
                  onActivityCreated={(companyId, activity) => setPendingActivity({ companyId, activity })}
                  onNoteCreated={(companyId, note) => setPendingNote({ companyId, note })}
                  onOpenDrawer={(tab, attendee) => setDrawerState({
                    companyId: company.companyId,
                    companyName: company.companyName,
                    initialTab: tab,
                    attendeeFilter: attendee,
                  })}
                  onOpenAssign={() => setAssignModalState({
                    companyId: company.companyId,
                    companyName: company.companyName,
                    currentAssigneeIds: company.assignees.map(a => a.userId),
                  })}
                />
                </div>
              ))}
            </div>
            {/* Room below the list for a panel anchored to a card near the
                bottom, so the rest of it can be scrolled to. Deliberately a
                sibling of the measured wrap, not a child: inside it, growing
                the spacer would grow the wrap, which shrinks the overhang,
                which shrinks the spacer — and it never settles. */}
            {drawerState && <div className="hidden sm:block" style={{ height: drawerOverhang }} aria-hidden />}
            </div>
            {drawerState && (
              <div className="sm:w-72 sm:flex-shrink-0" style={{ paddingTop: drawerOffset }}>
                <div ref={drawerPanelRef}>
                <OutreachDrawer
                  conferenceId={conferenceId}
                  companyId={drawerState.companyId}
                  companyName={drawerState.companyName}
                  initialTab={drawerState.initialTab}
                  attendeeFilter={drawerState.attendeeFilter}
                  pendingActivity={pendingActivity?.companyId === drawerState.companyId ? pendingActivity.activity : null}
                  pendingNote={pendingNote?.companyId === drawerState.companyId ? pendingNote.note : null}
                  onClose={() => setDrawerState(null)}
                />
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {assignModalState && (
        <OutreachAssignModal
          conferenceId={conferenceId}
          companyId={assignModalState.companyId}
          companyName={assignModalState.companyName}
          currentAssigneeIds={assignModalState.currentAssigneeIds}
          onClose={() => setAssignModalState(null)}
          onAssigned={loadOutreach}
        />
      )}
    </div>
  );
}
