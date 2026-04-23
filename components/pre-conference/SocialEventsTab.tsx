'use client';

import type { SocialEventRow } from '../PreConferenceReview';

function fmtDate(d: string | null) {
  if (!d) return '—';
  try {
    return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
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

function EventCard({ event }: { event: SocialEventRow }) {
  const isInternal = event.event_type === 'Internal' || event.host?.toLowerCase().includes('internal');
  const internalReps = event.internal_attendees
    ? String(event.internal_attendees).split(',').map((r) => r.trim()).filter(Boolean)
    : [];

  return (
    <div className="border border-gray-200 rounded-xl p-4 hover:shadow-sm transition-all">
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="min-w-0">
          <h4 className="font-semibold text-gray-900 text-sm truncate">{event.event_name || event.event_type || 'Untitled Event'}</h4>
          {event.host && <p className="text-xs text-gray-500">Hosted by {event.host}</p>}
        </div>
        <div className="flex flex-col items-end gap-1 flex-shrink-0">
          {event.invite_only === 'Yes' && (
            <span className="px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 text-xs font-medium">Invite Only</span>
          )}
          {event.event_type && (
            <span className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 text-xs">{event.event_type}</span>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-3 text-xs text-gray-500 mb-3">
        {event.event_date && (
          <span className="flex items-center gap-1">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            {fmtDate(event.event_date)}{event.event_time ? ` · ${fmtTime(event.event_time)}` : ''}
          </span>
        )}
        {event.location && (
          <span className="flex items-center gap-1">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
            </svg>
            {event.location}
          </span>
        )}
      </div>

      <div className="flex items-center gap-4 text-xs mb-2">
        {Number(event.attending_count) > 0 && (
          <span className="text-emerald-600 font-medium">✓ {event.attending_count} attending</span>
        )}
        {Number(event.declined_count) > 0 && (
          <span className="text-red-500">{event.declined_count} declined</span>
        )}
      </div>

      {internalReps.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2">
          {internalReps.map((rep) => (
            <span key={rep} className="px-2 py-0.5 rounded-full bg-blue-50 text-brand-secondary text-xs border border-blue-200">
              {rep}
            </span>
          ))}
        </div>
      )}

      {event.notes && (
        <p className="text-xs text-gray-500 mt-2 line-clamp-2">{event.notes}</p>
      )}
    </div>
  );
}

export function SocialEventsTab({ events }: { events: SocialEventRow[] }) {
  if (events.length === 0) {
    return (
      <div className="text-center py-16">
        <p className="text-gray-400 text-sm">No social events for this conference.</p>
      </div>
    );
  }

  const internal = events.filter((e) => e.event_type === 'Internal');
  const external = events.filter((e) => e.event_type !== 'Internal');

  return (
    <div className="space-y-8">
      {internal.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Company-Hosted Events ({internal.length})</h3>
          <div className="grid sm:grid-cols-2 gap-4">
            {internal.map((e) => <EventCard key={e.id} event={e} />)}
          </div>
        </div>
      )}
      {external.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-gray-700 mb-3">External Events ({external.length})</h3>
          <div className="grid sm:grid-cols-2 gap-4">
            {external.map((e) => <EventCard key={e.id} event={e} />)}
          </div>
        </div>
      )}
    </div>
  );
}
