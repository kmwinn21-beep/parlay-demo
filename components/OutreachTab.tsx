'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { OutreachCompanyCard, type OutreachCompany } from './OutreachCompanyCard';
import { OutreachDrawer } from './OutreachDrawer';
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

  const [drawerState, setDrawerState] = useState<{
    companyId: number;
    companyName: string;
    initialTab: 'timeline' | 'notes';
  } | null>(null);

  const [assignModalState, setAssignModalState] = useState<{
    companyId?: number;
    companyName?: string;
    currentAssigneeIds: number[];
  } | null>(null);

  const [assigneeFilter, setAssigneeFilter] = useState<number | null>(null);
  const [statusFilter, setStatusFilter] = useState<string | null>(null);

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
      return true;
    });
  }, [data, statusFilter, assigneeFilter]);

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

  return (
    <div className="card p-0 overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold text-brand-primary font-serif">Outreach</h2>
          {totalCount > 0 && (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
              {totalCount}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <select
            value={assigneeFilter ?? ''}
            onChange={e => setAssigneeFilter(e.target.value ? Number(e.target.value) : null)}
            className="input-field text-xs py-1.5"
          >
            <option value="">All Assignees</option>
            {assigneeOptions.map(a => <option key={a.userId} value={a.userId}>{a.displayName}</option>)}
          </select>
          <select
            value={statusFilter ?? ''}
            onChange={e => setStatusFilter(e.target.value || null)}
            className="input-field text-xs py-1.5"
          >
            <option value="">All Statuses</option>
            {STATUS_FILTER_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <button
            type="button"
            onClick={() => setAssignModalState({ currentAssigneeIds: [] })}
            className="btn-primary text-xs px-3 py-1.5"
          >
            Assign company
          </button>
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
            <div className="flex-1 min-w-0 space-y-2">
              {filteredCompanies.length === 0 && (
                <p className="text-sm text-gray-400 text-center py-8">No companies match the current filters.</p>
              )}
              {filteredCompanies.map(company => (
                <OutreachCompanyCard
                  key={company.companyId}
                  company={company}
                  conferenceId={conferenceId}
                  onActivityLogged={loadOutreach}
                  onOpenDrawer={(tab) => setDrawerState({ companyId: company.companyId, companyName: company.companyName, initialTab: tab })}
                  onOpenAssign={() => setAssignModalState({
                    companyId: company.companyId,
                    companyName: company.companyName,
                    currentAssigneeIds: company.assignees.map(a => a.userId),
                  })}
                />
              ))}
            </div>
            {drawerState && (
              <div className="w-72 flex-shrink-0">
                <OutreachDrawer
                  conferenceId={conferenceId}
                  companyId={drawerState.companyId}
                  companyName={drawerState.companyName}
                  initialTab={drawerState.initialTab}
                  onClose={() => setDrawerState(null)}
                />
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
