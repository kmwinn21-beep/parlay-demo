'use client';

import Link from 'next/link';
import type { MeetingRow, PostConferenceData } from '../PostConferenceReview';

type Meetings = PostConferenceData['meetings'];

function fmtDate(d: string | null) {
  if (!d) return null;
  try {
    const [y, m, day] = d.split('-').map(Number);
    return new Date(y, m - 1, day).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  } catch { return d; }
}

function StatusPill({ status }: { status: MeetingRow['status'] }) {
  const map: Record<MeetingRow['status'], { label: string; className: string }> = {
    held: { label: 'Held', className: 'bg-emerald-50 text-emerald-700 border border-emerald-200' },
    no_show: { label: 'No Show', className: 'bg-red-50 text-red-700 border border-red-200' },
    rescheduled: { label: 'Rescheduled', className: 'bg-amber-50 text-amber-700 border border-amber-200' },
    cancelled: { label: 'Cancelled', className: 'bg-gray-100 text-gray-600 border border-gray-200' },
  };
  const { label, className } = map[status] ?? map.cancelled;
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${className}`}>{label}</span>;
}

function MeetingCard({ m }: { m: MeetingRow }) {
  return (
    <div className="rounded-xl border border-gray-200 p-4 bg-white space-y-2 hover:shadow-sm transition-all">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <Link href={`/attendees/${m.attendee_id}`} className="text-sm font-semibold text-brand-primary hover:text-brand-secondary transition-colors block truncate">
            {m.attendeeName}
          </Link>
          {m.company_name && (
            <Link href={m.company_id ? `/companies/${m.company_id}` : '#'} className="text-xs text-gray-400 hover:text-brand-secondary truncate block">
              {m.company_name}
            </Link>
          )}
        </div>
        <StatusPill status={m.status} />
      </div>
      <div className="flex flex-wrap gap-1">
        {m.isWalkIn && (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-purple-50 text-purple-700 border border-purple-200">
            {m.meeting_type ?? 'Unplanned'}
          </span>
        )}
        {m.seniority && (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-gray-100 text-gray-600 border border-gray-200">
            {m.seniority}
          </span>
        )}
        {m.company_type && (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-gray-100 text-gray-600 border border-gray-200">
            {m.company_type.split(',')[0].trim()}
          </span>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-gray-500">
        {m.meeting_date && <span>{fmtDate(m.meeting_date)}{m.meeting_time ? ` · ${m.meeting_time}` : ''}</span>}
        {m.location && <span>{m.location}</span>}
        {m.scheduled_by && <span>by {m.scheduled_by}</span>}
      </div>
      {m.outcome && (
        <p className="text-xs text-gray-600 border-t border-gray-100 pt-2">{m.outcome}</p>
      )}
    </div>
  );
}

export function MeetingsTab({ meetings }: { meetings: Meetings }) {
  const held = meetings.filter(m => m.status === 'held');
  const noShows = meetings.filter(m => m.status === 'no_show');
  const other = meetings.filter(m => m.status !== 'held' && m.status !== 'no_show');
  const walkIns = held.filter(m => m.isWalkIn).length;
  const withOutcome = held.filter(m => m.outcome).length;

  return (
    <div className="space-y-6">
      {/* Stat cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
        {[
          { label: 'Total Meetings', value: meetings.length, color: '#223A5E' },
          { label: 'Meetings Held', value: held.length, color: '#059669' },
          { label: 'Unplanned', value: walkIns, color: '#7c3aed' },
          { label: 'With Outcome', value: withOutcome, color: '#0f766e' },
          { label: 'No Shows', value: noShows.length, color: '#ef4444' },
        ].map(s => (
          <div key={s.label} className="rounded-xl border border-gray-100 p-4 bg-white">
            <div className="text-2xl font-bold" style={{ color: s.color }}>{s.value}</div>
            <div className="text-xs font-semibold text-gray-600 mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Held */}
      {held.length > 0 && (
        <div>
          <div className="flex items-center gap-3 my-2">
            <div className="flex-1 h-px bg-gray-200" />
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">Meetings Held ({held.length})</span>
            <div className="flex-1 h-px bg-gray-200" />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {held.map(m => <MeetingCard key={m.id} m={m} />)}
          </div>
        </div>
      )}

      {/* No shows */}
      {noShows.length > 0 && (
        <div>
          <div className="flex items-center gap-3 my-2">
            <div className="flex-1 h-px bg-gray-200" />
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">No Shows ({noShows.length})</span>
            <div className="flex-1 h-px bg-gray-200" />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {noShows.map(m => <MeetingCard key={m.id} m={m} />)}
          </div>
        </div>
      )}

      {/* Rescheduled / cancelled */}
      {other.length > 0 && (
        <div>
          <div className="flex items-center gap-3 my-2">
            <div className="flex-1 h-px bg-gray-200" />
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">Other ({other.length})</span>
            <div className="flex-1 h-px bg-gray-200" />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {other.map(m => <MeetingCard key={m.id} m={m} />)}
          </div>
        </div>
      )}

      {meetings.length === 0 && (
        <p className="text-sm text-gray-400 text-center py-16">No meeting data available.</p>
      )}
    </div>
  );
}
