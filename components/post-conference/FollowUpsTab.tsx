'use client';

import Link from 'next/link';
import type { FollowUpRow, PostConferenceData } from '../PostConferenceReview';

type FollowUps = PostConferenceData['followUps'];

function StatusPill({ status }: { status: FollowUpRow['status'] }) {
  const map: Record<FollowUpRow['status'], { label: string; className: string }> = {
    completed: { label: 'Completed', className: 'bg-emerald-50 text-emerald-700 border border-emerald-200' },
    in_progress: { label: 'In Progress', className: 'bg-blue-50 text-brand-secondary border border-blue-200' },
    not_started: { label: 'Not Started', className: 'bg-amber-50 text-amber-700 border border-amber-200' },
  };
  const { label, className } = map[status];
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${className}`}>{label}</span>;
}

function DaysChip({ days }: { days: number }) {
  const urgent = days >= 7;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${urgent ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-gray-100 text-gray-600 border border-gray-200'}`}>
      {days}d since conf
    </span>
  );
}

function FollowUpCard({ f }: { f: FollowUpRow }) {
  return (
    <div className="rounded-xl border border-gray-200 p-4 bg-white space-y-2 hover:shadow-sm transition-all">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <Link href={`/attendees/${f.attendee_id}`} className="text-sm font-semibold text-brand-primary hover:text-brand-secondary transition-colors block truncate">
            {f.attendeeName}{f.attendeeTitle ? `, ${f.attendeeTitle}` : ''}
          </Link>
          {f.company_name && (
            <Link href={f.company_id ? `/companies/${f.company_id}` : '#'} className="text-xs text-gray-400 hover:text-brand-secondary truncate block">
              {f.company_name}
            </Link>
          )}
        </div>
        <StatusPill status={f.status} />
      </div>
      {f.next_steps && (
        <p className="text-xs text-gray-700 leading-relaxed">{f.next_steps}</p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <DaysChip days={f.daysSinceConference} />
        {f.assigned_rep && (
          <span className="text-xs text-gray-500">→ {f.assigned_rep}</span>
        )}
      </div>
    </div>
  );
}

export function FollowUpsTab({ followUps }: { followUps: FollowUps }) {
  const completed = followUps.filter(f => f.status === 'completed');
  const inProgress = followUps.filter(f => f.status === 'in_progress');
  const notStarted = followUps.filter(f => f.status === 'not_started');
  const rate = followUps.length > 0 ? Math.round((completed.length / followUps.length) * 100) : 0;
  const overdue = notStarted.filter(f => f.daysSinceConference >= 7).length;

  return (
    <div className="space-y-6">
      {/* Stat cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
        {[
          { label: 'Total Follow-ups', value: followUps.length, color: '#223A5E' },
          { label: 'Completed', value: completed.length, color: '#059669' },
          { label: 'In Progress', value: inProgress.length, color: '#1B76BC' },
          { label: 'Not Started', value: notStarted.length, color: '#d97706' },
          { label: 'Follow-up Rate', value: `${rate}%`, color: rate >= 40 ? '#059669' : '#d97706' },
          { label: 'Overdue (7d+)', value: overdue, color: overdue > 0 ? '#ef4444' : '#059669' },
        ].map(s => (
          <div key={s.label} className="rounded-xl border border-gray-100 p-4 bg-white">
            <div className="text-2xl font-bold" style={{ color: s.color }}>{s.value}</div>
            <div className="text-xs font-semibold text-gray-600 mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Completion bar */}
      {followUps.length > 0 && (
        <div className="rounded-xl border border-gray-200 p-4 bg-white">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Completion Progress</span>
            <span className="text-sm font-bold text-gray-700">{rate}%</span>
          </div>
          <div className="w-full bg-gray-100 rounded-full h-3 overflow-hidden">
            <div className="h-3 rounded-full transition-all" style={{ width: `${rate}%`, backgroundColor: rate >= 40 ? '#059669' : '#d97706' }} />
          </div>
          <p className="text-xs text-gray-400 mt-1">{completed.length} of {followUps.length} follow-ups completed</p>
        </div>
      )}

      {/* Not started */}
      {notStarted.length > 0 && (
        <div>
          <div className="flex items-center gap-3 my-2">
            <div className="flex-1 h-px bg-gray-200" />
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">Not Started ({notStarted.length})</span>
            <div className="flex-1 h-px bg-gray-200" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {notStarted.map(f => <FollowUpCard key={f.id} f={f} />)}
          </div>
        </div>
      )}

      {/* In progress */}
      {inProgress.length > 0 && (
        <div>
          <div className="flex items-center gap-3 my-2">
            <div className="flex-1 h-px bg-gray-200" />
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">In Progress ({inProgress.length})</span>
            <div className="flex-1 h-px bg-gray-200" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {inProgress.map(f => <FollowUpCard key={f.id} f={f} />)}
          </div>
        </div>
      )}

      {/* Completed */}
      {completed.length > 0 && (
        <div>
          <div className="flex items-center gap-3 my-2">
            <div className="flex-1 h-px bg-gray-200" />
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">Completed ({completed.length})</span>
            <div className="flex-1 h-px bg-gray-200" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {completed.map(f => <FollowUpCard key={f.id} f={f} />)}
          </div>
        </div>
      )}

      {followUps.length === 0 && (
        <p className="text-sm text-gray-400 text-center py-16">No follow-up data available.</p>
      )}
    </div>
  );
}
