'use client';

import { useState } from 'react';
import { getBadgeClass, getHex } from '@/lib/colors';
import { useConfigColors } from '@/lib/useConfigColors';

export interface OutreachAssignee {
  userId: number;
  displayName: string;
  initials: string;
}

export interface OutreachAttendee {
  attendeeId: number;
  firstName: string;
  lastName: string;
  title: string | null;
  seniorityLabel: string | null;
  activityCount: number;
}

export type OutreachStatus = 'not_started' | 'in_progress' | 'completed' | 'overdue';

export interface OutreachCompany {
  companyId: number;
  companyName: string;
  companyType: string | null;
  icp: string | null;
  status: OutreachStatus;
  assignees: OutreachAssignee[];
  attendees: OutreachAttendee[];
  totalActivityCount: number;
  noteCount: number;
}

const STATUS_STYLES: Record<OutreachStatus, { label: string; className: string }> = {
  not_started: { label: 'Not Started', className: 'bg-gray-100 text-gray-600 border border-gray-200' },
  in_progress: { label: 'In Progress', className: 'bg-green-50 text-green-700 border border-green-200' },
  completed: { label: 'Completed', className: 'bg-blue-50 text-blue-700 border border-blue-200' },
  overdue: { label: 'Overdue', className: 'bg-amber-50 text-amber-700 border border-amber-200' },
};

const ACTIVITY_ICONS: Record<'phone' | 'email' | 'linkedin', { title: string; hoverClass: string; path: React.ReactNode }> = {
  phone: {
    title: 'Log phone call',
    hoverClass: 'hover:border-green-400 hover:text-green-600 hover:bg-green-50',
    path: <path strokeLinecap="round" strokeLinejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />,
  },
  email: {
    title: 'Log email',
    hoverClass: 'hover:border-blue-400 hover:text-blue-600 hover:bg-blue-50',
    path: <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />,
  },
  linkedin: {
    title: 'Log LinkedIn touch',
    hoverClass: 'hover:border-purple-400 hover:text-purple-600 hover:bg-purple-50',
    path: <path strokeLinecap="round" strokeLinejoin="round" d="M16 8a6 6 0 016 6v7h-4v-7a2 2 0 00-2-2 2 2 0 00-2 2v7h-4v-7a6 6 0 016-6zM2 9h4v12H2zM4 6a2 2 0 100-4 2 2 0 000 4z" />,
  },
};

function AssigneeStack({ assignees, max = 3 }: { assignees: OutreachAssignee[]; max?: number }) {
  if (assignees.length === 0) {
    return <span className="text-xs text-gray-400 italic">Unassigned</span>;
  }
  const shown = assignees.slice(0, max);
  const overflow = assignees.length - shown.length;
  return (
    <div className="flex items-center -space-x-2">
      {shown.map(a => (
        <div
          key={a.userId}
          title={a.displayName}
          className="w-6 h-6 rounded-full bg-brand-secondary text-white text-[10px] font-semibold flex items-center justify-center border-2 border-white flex-shrink-0"
        >
          {a.initials}
        </div>
      ))}
      {overflow > 0 && (
        <div className="w-6 h-6 rounded-full bg-gray-200 text-gray-600 text-[10px] font-semibold flex items-center justify-center border-2 border-white flex-shrink-0">
          +{overflow}
        </div>
      )}
    </div>
  );
}

export function OutreachCompanyCard({
  company,
  conferenceId,
  onActivityLogged,
  onOpenDrawer,
  onOpenAssign,
}: {
  company: OutreachCompany;
  conferenceId: number;
  onActivityLogged: () => void;
  onOpenDrawer: (tab: 'timeline' | 'notes') => void;
  onOpenAssign: () => void;
}) {
  const colorMaps = useConfigColors();
  const [expanded, setExpanded] = useState(false);
  const [flashKey, setFlashKey] = useState<string | null>(null);
  const [localCounts, setLocalCounts] = useState<Record<number, number>>({});
  const [localTotal, setLocalTotal] = useState(company.totalActivityCount);
  const [localStatus, setLocalStatus] = useState<OutreachStatus>(company.status);

  const statusStyle = STATUS_STYLES[localStatus] ?? STATUS_STYLES.not_started;
  const companyTypeHex = company.companyType ? getHex(company.companyType, colorMaps.company_type || {}) : '#6b7280';

  const logActivity = async (attendeeId: number | null, activityType: 'phone' | 'email' | 'linkedin', flashId: string) => {
    try {
      const res = await fetch(`/api/conferences/${conferenceId}/outreach/${company.companyId}/activity`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ attendeeId: attendeeId ?? undefined, activityType }),
      });
      if (!res.ok) throw new Error('Failed to log activity');

      setFlashKey(flashId);
      setTimeout(() => setFlashKey(k => (k === flashId ? null : k)), 1000);

      if (attendeeId != null) {
        const base = localCounts[attendeeId] ?? company.attendees.find(a => a.attendeeId === attendeeId)?.activityCount ?? 0;
        setLocalCounts(prev => ({ ...prev, [attendeeId]: base + 1 }));
      }

      const isFirstActivity = localTotal === 0;
      setLocalTotal(t => t + 1);

      let statusPatch: Promise<unknown> = Promise.resolve();
      if (isFirstActivity && localStatus === 'not_started') {
        // Optimistic — flip locally without waiting on this request's response.
        setLocalStatus('in_progress');
        statusPatch = fetch(`/api/conferences/${conferenceId}/outreach/${company.companyId}/status`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'in_progress' }),
        }).catch(() => {});
      }
      // Wait for the status patch (not the UI update) before the parent re-fetches,
      // so the refreshed list doesn't briefly show stale 'not_started' and flicker.
      await statusPatch;
      onActivityLogged();
    } catch {
      // Silent — matches the "no confirmation modal" instant-log spec; a failed log
      // just doesn't flash/increment, which is signal enough for a rapid-fire action.
    }
  };

  const attendeeCount = company.attendees.length;

  return (
    <div className="border border-gray-200 rounded-xl bg-white overflow-hidden hover:border-gray-300 transition-colors">
      {/* Collapsed row */}
      <div className="flex items-center gap-3 px-4 py-3">
        <button
          type="button"
          onClick={() => setExpanded(v => !v)}
          className="flex items-center gap-3 flex-1 min-w-0 text-left"
        >
          <svg className={`w-4 h-4 text-gray-400 flex-shrink-0 transition-transform ${expanded ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
          <span className="text-sm font-bold text-gray-800 truncate">{company.companyName}</span>
          {company.companyType && (
            <span className={getBadgeClass(company.companyType, colorMaps.company_type || {})}>{company.companyType}</span>
          )}
          {company.icp === 'Yes' && <span className="badge-green text-xs px-2 py-0.5 flex-shrink-0">ICP</span>}
          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium flex-shrink-0 ${statusStyle.className}`}>
            {statusStyle.label}
          </span>
          <span className="text-xs text-gray-400 flex-shrink-0 hidden sm:inline">
            {attendeeCount} {attendeeCount === 1 ? 'attendee' : 'attendees'}
          </span>
        </button>

        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            type="button"
            onClick={company.assignees.length === 0 ? onOpenAssign : undefined}
            title={company.assignees.length === 0 ? 'Assign reps' : company.assignees.map(a => a.displayName).join(', ')}
            className={company.assignees.length === 0 ? 'cursor-pointer' : ''}
          >
            <AssigneeStack assignees={company.assignees} />
          </button>
          <button
            type="button"
            onClick={() => onOpenDrawer('timeline')}
            title="View timeline"
            className="w-7 h-7 rounded-full bg-gray-50 text-gray-400 hover:bg-gray-100 hover:text-brand-secondary flex items-center justify-center transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
          </button>
          <button
            type="button"
            onClick={() => onOpenDrawer('notes')}
            title="View notes"
            className={`w-7 h-7 rounded-full flex items-center justify-center transition-colors ${
              company.noteCount > 0 ? 'bg-blue-50 text-blue-500 hover:bg-blue-100' : 'bg-gray-50 text-gray-400 hover:bg-gray-100'
            }`}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
          </button>
        </div>
      </div>

      {/* Expanded attendee rows */}
      {expanded && (
        <div className="border-t border-gray-100">
          {company.attendees.length === 0 && (
            <p className="text-xs text-gray-400 px-4 py-3">No attendees from this company at this conference.</p>
          )}
          {company.attendees.map((attendee, idx) => {
            const count = localCounts[attendee.attendeeId] ?? attendee.activityCount;
            return (
              <div
                key={attendee.attendeeId}
                className={`flex items-center gap-3 px-4 py-2.5 ${idx % 2 === 0 ? 'bg-gray-50/60' : 'bg-white'}`}
              >
                <div
                  className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[10px] font-semibold flex-shrink-0"
                  style={{ backgroundColor: companyTypeHex }}
                >
                  {(attendee.firstName[0] ?? '') + (attendee.lastName[0] ?? '')}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-gray-800 truncate">{attendee.firstName} {attendee.lastName}</p>
                  <p className="text-[11px] text-gray-400 truncate">
                    {[attendee.title, attendee.seniorityLabel].filter(Boolean).join(' · ') || '—'}
                  </p>
                </div>
                <AssigneeStack assignees={company.assignees} />
                <div className="flex items-center gap-1 flex-shrink-0">
                  {(['phone', 'email', 'linkedin'] as const).map(type => {
                    const flashId = `${attendee.attendeeId}-${type}`;
                    const flashed = flashKey === flashId;
                    const icon = ACTIVITY_ICONS[type];
                    return (
                      <button
                        key={type}
                        type="button"
                        onClick={() => logActivity(attendee.attendeeId, type, flashId)}
                        title={icon.title}
                        className={`w-7 h-7 rounded-lg border flex items-center justify-center transition-colors duration-300 ${
                          flashed ? 'bg-green-100 border-green-400 text-green-600' : `border-gray-200 text-gray-400 ${icon.hoverClass}`
                        }`}
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>{icon.path}</svg>
                      </button>
                    );
                  })}
                </div>
                <span className={`text-[11px] font-medium flex-shrink-0 ${count > 0 ? 'text-green-600' : 'text-gray-400'}`}>
                  {count > 0 ? `${count} logged` : 'None logged'}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
