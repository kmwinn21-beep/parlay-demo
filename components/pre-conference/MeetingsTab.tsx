'use client';

import Link from 'next/link';
import type { MeetingRow } from '../PreConferenceReview';

function fmtDate(d: string | null) {
  if (!d) return '—';
  try {
    return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  } catch { return d; }
}

function fmtTime(t: string | null) {
  if (!t) return '';
  try {
    const [h, m] = t.split(':').map(Number);
    const ampm = h >= 12 ? 'pm' : 'am';
    const hr = h % 12 || 12;
    return `${hr}:${String(m).padStart(2, '0')}${ampm}`;
  } catch { return t; }
}

export function MeetingsTab({ meetings }: { meetings: MeetingRow[] }) {
  if (meetings.length === 0) {
    return (
      <div className="text-center py-16">
        <p className="text-gray-400 text-sm">No meetings scheduled for this conference.</p>
      </div>
    );
  }

  const conflicts = meetings.filter((m) => m.hasConflict);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <p className="text-sm text-gray-500">{meetings.length} meeting{meetings.length !== 1 ? 's' : ''} scheduled</p>
        {conflicts.length > 0 && (
          <span className="px-2 py-0.5 rounded-full bg-red-100 text-red-700 text-xs font-semibold">
            {conflicts.length} conflict{conflicts.length !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {/* Mobile card view */}
      <div className="sm:hidden space-y-3">
        {meetings.map((m) => (
          <div
            key={m.id}
            className={`rounded-xl border p-4 space-y-2 ${m.hasConflict ? 'border-red-200 bg-red-50' : 'border-gray-200 bg-white'}`}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <Link href={`/attendees/${m.attendee_id}`} className="font-medium text-brand-secondary hover:underline text-sm">
                  {m.first_name} {m.last_name}
                </Link>
                {m.title && <p className="text-xs text-gray-400 truncate">{m.title}</p>}
              </div>
              {m.outcome ? (
                <span className="flex-shrink-0 px-2 py-0.5 rounded-full bg-green-100 text-green-700 text-xs font-medium">{m.outcome}</span>
              ) : (
                <span className="flex-shrink-0 text-gray-400 text-xs">Pending</span>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2 text-xs text-gray-600">
              <span>{fmtDate(m.meeting_date)}{m.meeting_time ? ` · ${fmtTime(m.meeting_time)}` : ''}</span>
              {m.hasConflict && (
                <span className="px-1.5 py-0.5 rounded bg-red-100 text-red-700 font-medium">Conflict</span>
              )}
            </div>

            {m.company_name && (
              <p className="text-xs text-gray-500 truncate">{m.company_name}</p>
            )}

            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500">
              {m.scheduled_by && <span>Rep: {m.scheduled_by}</span>}
              {m.meeting_type && <span className="text-gray-400">{m.meeting_type}</span>}
            </div>
          </div>
        ))}
      </div>

      {/* Desktop table view */}
      <div className="hidden sm:block overflow-x-auto rounded-xl border border-gray-200">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Attendee</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Company</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Date / Time</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Rep</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Type</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Outcome</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {meetings.map((m) => (
              <tr key={m.id} className={`${m.hasConflict ? 'bg-red-50' : 'hover:bg-gray-50'} transition-colors`}>
                <td className="px-4 py-3">
                  <Link href={`/attendees/${m.attendee_id}`} className="font-medium text-brand-secondary hover:underline">
                    {m.first_name} {m.last_name}
                  </Link>
                  {m.title && <p className="text-xs text-gray-400">{m.title}</p>}
                </td>
                <td className="px-4 py-3 text-gray-700 text-xs">{m.company_name ?? '—'}</td>
                <td className="px-4 py-3">
                  <span className="text-gray-700">{fmtDate(m.meeting_date)}</span>
                  {m.meeting_time && <span className="text-gray-400 text-xs block">{fmtTime(m.meeting_time)}</span>}
                  {m.hasConflict && (
                    <span className="inline-block mt-0.5 px-1.5 py-0.5 rounded text-xs bg-red-100 text-red-700 font-medium">Conflict</span>
                  )}
                </td>
                <td className="px-4 py-3 text-gray-700 text-xs">{m.scheduled_by ?? '—'}</td>
                <td className="px-4 py-3 text-gray-600 text-xs">{m.meeting_type ?? '—'}</td>
                <td className="px-4 py-3">
                  {m.outcome ? (
                    <span className="px-2 py-0.5 rounded-full bg-green-100 text-green-700 text-xs font-medium">{m.outcome}</span>
                  ) : (
                    <span className="text-gray-400 text-xs">Pending</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
