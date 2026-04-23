'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { SocialEventRow, SocialEventGuest } from '../PreConferenceReview';

type RsvpStatus = 'yes' | 'no' | 'maybe' | 'attended';

function parseStatuses(s: string): RsvpStatus[] {
  return s.split(',').map(x => x.trim()).filter(x => ['yes','no','maybe','attended'].includes(x)) as RsvpStatus[];
}

function fmtDate(d: string | null) {
  if (!d) return '—';
  try { return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }); }
  catch { return d; }
}
function fmtTime(t: string | null) {
  if (!t) return '';
  try {
    const [h, m] = t.split(':').map(Number);
    return `${h % 12 || 12}:${String(m).padStart(2, '0')}${h >= 12 ? 'pm' : 'am'}`;
  } catch { return t; }
}

/* ─── SVG helpers ─── */
const CheckSvg = () => <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>;
const XSvg = () => <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" /></svg>;
const StarSvg = () => <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" /></svg>;

/* ─── RSVP summary pills ─── */
function RsvpPills({ guestList }: { guestList: SocialEventGuest[] }) {
  const statuses = guestList.map(g => parseStatuses(g.rsvp_status));
  const yes      = statuses.filter(s => s.includes('yes')).length;
  const attended = statuses.filter(s => s.includes('attended')).length;
  const no       = statuses.filter(s => s.includes('no')).length;
  const maybe    = statuses.filter(s => s.includes('maybe')).length;
  const total    = guestList.length;

  if (total === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5 text-xs">
      <span className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 font-medium">{total} invited</span>
      {yes      > 0 && <span className="px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-medium">✓ {yes} yes</span>}
      {attended > 0 && <span className="px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 font-medium">★ {attended} attended</span>}
      {no       > 0 && <span className="px-2 py-0.5 rounded-full bg-red-50 text-red-600 font-medium">✕ {no} no</span>}
      {maybe    > 0 && <span className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 font-medium">? {maybe} maybe</span>}
    </div>
  );
}

/* ─── Guest list row ─── */
function GuestRow({ guest, eventId, onUpdate }: {
  guest: SocialEventGuest;
  eventId: number;
  onUpdate: (attendeeId: number, newStatus: string) => void;
}) {
  const statuses = parseStatuses(guest.rsvp_status);
  const has = (s: RsvpStatus) => statuses.includes(s);

  async function toggle(s: RsvpStatus) {
    const next: RsvpStatus[] = has(s) ? statuses.filter(x => x !== s) : [...statuses, s];
    const statusStr = next.length > 0 ? next.join(',') : 'maybe';
    try {
      await fetch(`/api/social-events/${eventId}/rsvp`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ attendee_id: guest.attendee_id, rsvp_status: statusStr }),
      });
      onUpdate(guest.attendee_id, statusStr);
    } catch { /* ignore */ }
  }

  return (
    <tr className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
      <td className="py-2 pr-3 min-w-0">
        <Link href={`/attendees/${guest.attendee_id}`} className="font-medium text-xs text-brand-primary hover:underline whitespace-nowrap">
          {guest.first_name} {guest.last_name}
        </Link>
        {guest.title && <p className="text-[10px] text-gray-400 leading-tight">{guest.title}</p>}
      </td>
      <td className="py-2 pr-3 text-xs text-gray-600 whitespace-nowrap hidden sm:table-cell">
        {guest.company_id
          ? <Link href={`/companies/${guest.company_id}`} className="hover:underline text-brand-primary">{guest.company_name}</Link>
          : <span>{guest.company_name || '—'}</span>
        }
      </td>
      <td className="py-2">
        <div className="flex gap-1">
          {(['yes', 'attended', 'no', 'maybe'] as RsvpStatus[]).map(opt => (
            <button key={opt} type="button" title={opt.charAt(0).toUpperCase() + opt.slice(1)}
              onClick={() => toggle(opt)}
              className={`w-6 h-6 rounded-full flex items-center justify-center transition-colors flex-shrink-0 ${
                has(opt)
                  ? opt === 'yes'      ? 'bg-green-100 text-green-600'
                  : opt === 'attended' ? 'bg-purple-100 text-purple-600'
                  : opt === 'no'       ? 'bg-red-50 text-red-500'
                  :                     'bg-gray-200 text-gray-600'
                  : 'bg-gray-50 text-gray-300 hover:text-gray-500 hover:bg-gray-100'
              }`}>
              {opt === 'yes'      && <CheckSvg />}
              {opt === 'attended' && <StarSvg />}
              {opt === 'no'       && <XSvg />}
              {opt === 'maybe'    && <span className="font-bold text-[10px] leading-none">?</span>}
            </button>
          ))}
        </div>
      </td>
    </tr>
  );
}

/* ─── Guest list panel (inline expansion) ─── */
function GuestListPanel({ event }: { event: SocialEventRow }) {
  const [guests, setGuests] = useState<SocialEventGuest[]>(event.guestList);
  const [operatorsOnly, setOperatorsOnly] = useState(false);
  const [activeFilter, setActiveFilter] = useState<RsvpStatus | null>(null);

  function handleUpdate(attendeeId: number, newStatus: string) {
    setGuests(prev => prev.map(g => g.attendee_id === attendeeId ? { ...g, rsvp_status: newStatus } : g));
  }

  const isOperator = (ct: string | null | undefined) => {
    const l = (ct || '').toLowerCase();
    return l.includes('operator') || l.includes('own/op') || l.includes('opco');
  };

  const filtered = guests
    .filter(g => !operatorsOnly || isOperator(g.company_type))
    .filter(g => {
      if (!activeFilter) return true;
      return parseStatuses(g.rsvp_status).includes(activeFilter);
    });

  const allStatuses = guests.map(g => parseStatuses(g.rsvp_status));
  const counts = {
    total:    guests.length,
    yes:      allStatuses.filter(s => s.includes('yes')).length,
    attended: allStatuses.filter(s => s.includes('attended')).length,
    no:       allStatuses.filter(s => s.includes('no')).length,
    maybe:    allStatuses.filter(s => s.includes('maybe')).length,
  };

  const statCards: { label: string; value: number; filter: RsvpStatus | null; cls: string; activeCls: string }[] = [
    { label: 'Invited',  value: counts.total,    filter: null,       cls: 'bg-gray-50 border-gray-200 text-gray-800',        activeCls: 'ring-2 ring-gray-400' },
    { label: 'Yes',      value: counts.yes,      filter: 'yes',      cls: 'bg-green-50 border-green-100 text-green-700',     activeCls: 'ring-2 ring-green-400' },
    { label: 'Attended', value: counts.attended, filter: 'attended', cls: 'bg-purple-50 border-purple-100 text-purple-700', activeCls: 'ring-2 ring-purple-400' },
    { label: 'No',       value: counts.no,       filter: 'no',       cls: 'bg-red-50 border-red-100 text-red-600',          activeCls: 'ring-2 ring-red-300' },
    { label: 'Maybe',    value: counts.maybe,    filter: 'maybe',    cls: 'bg-gray-50 border-gray-200 text-gray-500',       activeCls: 'ring-2 ring-gray-300' },
  ];

  return (
    <div className="mt-3 border-t border-gray-200 pt-3">
      {/* Summary bar */}
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <div className="flex gap-1 flex-1 min-w-0">
          {statCards.map(card => {
            const isActive = card.filter === null ? activeFilter === null : activeFilter === card.filter;
            return (
              <button key={card.label} type="button" onClick={() => setActiveFilter(card.filter === activeFilter ? null : card.filter)}
                className={`flex-1 rounded-lg p-1.5 text-center border transition-all ${card.cls} ${isActive ? card.activeCls : 'opacity-60 hover:opacity-90'}`}>
                <p className="text-sm font-bold leading-none">{card.value}</p>
                <p className="text-[9px] text-gray-500 uppercase tracking-wide mt-0.5 hidden sm:block">{card.label}</p>
              </button>
            );
          })}
        </div>
        <button type="button" onClick={() => setOperatorsOnly(v => !v)}
          className={`px-2 py-1 rounded-lg text-xs font-medium transition-colors flex-shrink-0 ${operatorsOnly ? 'bg-brand-primary text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
          Operators
        </button>
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <p className="text-xs text-gray-400 text-center py-4">No attendees to show.</p>
      ) : (
        <div className="overflow-y-auto max-h-64">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-white">
              <tr className="border-b border-gray-200">
                <th className="pb-1.5 pr-3 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Name</th>
                <th className="pb-1.5 pr-3 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wide hidden sm:table-cell">Company</th>
                <th className="pb-1.5 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wide">RSVP</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(g => (
                <GuestRow key={g.attendee_id} guest={g} eventId={event.id} onUpdate={handleUpdate} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ─── Event card ─── */
function EventCard({ event }: { event: SocialEventRow }) {
  const [showGuests, setShowGuests] = useState(false);
  const internalReps = event.internal_attendees
    ? String(event.internal_attendees).split(',').map(r => r.trim()).filter(Boolean)
    : [];

  return (
    <div className="border border-gray-200 rounded-xl p-4 hover:shadow-sm transition-all">
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="min-w-0">
          <h4 className="font-semibold text-gray-900 text-sm truncate">{event.event_name || event.event_type || 'Untitled Event'}</h4>
          {event.host && <p className="text-xs text-gray-500">Hosted by {event.host}</p>}
        </div>
        <div className="flex items-start gap-2 flex-shrink-0">
          <div className="flex flex-col items-end gap-1">
            {event.invite_only === 'Yes' && (
              <span className="px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 text-xs font-medium">Invite Only</span>
            )}
            {event.event_type && (
              <span className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 text-xs">{event.event_type}</span>
            )}
          </div>
          {event.guestList.length > 0 && (
            <button
              type="button"
              onClick={() => setShowGuests(v => !v)}
              title="Toggle guest list"
              className={`p-1.5 rounded-lg transition-colors flex-shrink-0 ${showGuests ? 'bg-brand-secondary/10 text-brand-secondary' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'}`}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </button>
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

      {/* RSVP pills */}
      <RsvpPills guestList={event.guestList} />

      {internalReps.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2">
          {internalReps.map(rep => (
            <span key={rep} className="px-2 py-0.5 rounded-full bg-blue-50 text-brand-secondary text-xs border border-blue-200">
              {rep}
            </span>
          ))}
        </div>
      )}

      {event.notes && (
        <p className="text-xs text-gray-500 mt-2 line-clamp-2">{event.notes}</p>
      )}

      {/* Expandable guest list */}
      {showGuests && <GuestListPanel event={event} />}
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

  const internal = events.filter(e => e.event_type === 'Internal');
  const external = events.filter(e => e.event_type !== 'Internal');

  return (
    <div className="space-y-8">
      {internal.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Company-Hosted Events ({internal.length})</h3>
          <div className="grid sm:grid-cols-2 gap-4">
            {internal.map(e => <EventCard key={e.id} event={e} />)}
          </div>
        </div>
      )}
      {external.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-gray-700 mb-3">External Events ({external.length})</h3>
          <div className="grid sm:grid-cols-2 gap-4">
            {external.map(e => <EventCard key={e.id} event={e} />)}
          </div>
        </div>
      )}
    </div>
  );
}
