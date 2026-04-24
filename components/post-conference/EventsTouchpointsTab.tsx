'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { SocialEventRow, SocialEventGuest, TouchpointAttendeeRow } from '../PostConferenceReview';

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
    const ampm = h >= 12 ? 'PM' : 'AM';
    return `${h % 12 || 12}:${String(m).padStart(2, '0')}${ampm}`;
  } catch { return t; }
}

// ── RSVP icons ─────────────────────────────────────────────────────────────
const CheckSvg = () => <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>;
const StarSvg = () => <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" /></svg>;
const XSvg = () => <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>;

// ── Guest row with RSVP toggle ──────────────────────────────────────────────
function GuestRow({ guest, eventId, onUpdate }: { guest: SocialEventGuest; eventId: number; onUpdate: (aid: number, s: string) => void }) {
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
      window.dispatchEvent(new CustomEvent('rsvp-updated', { detail: { eventId, attendeeId: guest.attendee_id, rsvpStatus: statusStr } }));
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
      <td className="py-2 pr-3 text-xs text-gray-600 hidden sm:table-cell">
        {guest.company_name || '—'}
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

// ── Guest list panel ────────────────────────────────────────────────────────
function GuestListPanel({ event }: { event: SocialEventRow }) {
  const [guests, setGuests] = useState<SocialEventGuest[]>(event.guestList);

  function handleUpdate(attendeeId: number, newStatus: string) {
    setGuests(prev => prev.map(g => g.attendee_id === attendeeId ? { ...g, rsvp_status: newStatus } : g));
  }

  useEffect(() => {
    const handler = (e: Event) => {
      const { eventId, attendeeId, rsvpStatus } = (e as CustomEvent).detail as { eventId: number; attendeeId: number; rsvpStatus: string };
      if (eventId !== event.id) return;
      handleUpdate(attendeeId, rsvpStatus);
    };
    window.addEventListener('rsvp-updated', handler);
    return () => window.removeEventListener('rsvp-updated', handler);
  }, [event.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const statuses = guests.map(g => parseStatuses(g.rsvp_status));
  const counts = {
    total: guests.length,
    yes: statuses.filter(s => s.includes('yes')).length,
    attended: statuses.filter(s => s.includes('attended')).length,
    no: statuses.filter(s => s.includes('no')).length,
    maybe: statuses.filter(s => s.includes('maybe')).length,
  };

  return (
    <div className="mt-3 border-t border-gray-200 pt-3 space-y-2">
      <div className="flex gap-1.5 flex-wrap text-xs">
        {[
          { label: `${counts.total} invited`, cls: 'bg-gray-100 text-gray-700' },
          { label: `✓ ${counts.yes} yes`, cls: 'bg-green-50 text-green-700' },
          { label: `★ ${counts.attended} attended`, cls: 'bg-purple-50 text-purple-700' },
          { label: `✕ ${counts.no} no`, cls: 'bg-red-50 text-red-600' },
          { label: `? ${counts.maybe} maybe`, cls: 'bg-gray-50 text-gray-500' },
        ].map(c => (
          <span key={c.label} className={`px-2 py-0.5 rounded-full font-medium ${c.cls}`}>{c.label}</span>
        ))}
      </div>
      {guests.length > 0 && (
        <div className="overflow-y-auto max-h-56">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-white">
              <tr className="border-b border-gray-200">
                <th className="pb-1 pr-3 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Name</th>
                <th className="pb-1 pr-3 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wide hidden sm:table-cell">Company</th>
                <th className="pb-1 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wide">RSVP</th>
              </tr>
            </thead>
            <tbody>
              {guests.map(g => <GuestRow key={g.attendee_id} guest={g} eventId={event.id} onUpdate={handleUpdate} />)}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Event card ──────────────────────────────────────────────────────────────
function EventCard({ event }: { event: SocialEventRow }) {
  const [showGuests, setShowGuests] = useState(false);

  return (
    <div className="border border-gray-200 rounded-xl p-4 hover:shadow-sm transition-all bg-white">
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="min-w-0">
          <h4 className="font-semibold text-gray-900 text-sm truncate">{event.event_name || event.event_type || 'Untitled Event'}</h4>
          {event.host && <p className="text-xs text-gray-500">Hosted by {event.host}</p>}
        </div>
        <div className="flex items-start gap-2 flex-shrink-0">
          {event.invite_only === 'Yes' && (
            <span className="px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 text-xs font-medium">Invite Only</span>
          )}
          {event.event_type && (
            <span className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 text-xs">{event.event_type}</span>
          )}
          {event.guestList.length > 0 && (
            <button type="button" onClick={() => setShowGuests(v => !v)}
              className={`p-1.5 rounded-lg transition-colors ${showGuests ? 'bg-brand-secondary/10 text-brand-secondary' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'}`}>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </button>
          )}
        </div>
      </div>
      <div className="flex flex-wrap gap-3 text-xs text-gray-500">
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
      {showGuests && <GuestListPanel event={event} />}
    </div>
  );
}

// ── Touchpoint pill ─────────────────────────────────────────────────────────
function TouchpointPill({ value, color, count }: { value: string; color: string | null; count: number }) {
  const hex = color || '#6b7280';
  return (
    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold border"
      style={{ backgroundColor: `${hex}18`, borderColor: `${hex}60`, color: hex }}>
      {value} {count}
    </span>
  );
}

// ── Touchpoint attendee card ────────────────────────────────────────────────
function TouchpointCard({ row }: { row: TouchpointAttendeeRow }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-3 hover:shadow-sm transition-all relative">
      <span className="absolute top-2.5 right-3 text-xs font-bold text-gray-500">{row.totalCount}</span>
      <div className="pr-6 mb-1.5">
        <Link href={`/attendees/${row.attendee_id}`} className="text-sm font-semibold text-brand-primary hover:text-brand-secondary block truncate">
          {row.first_name} {row.last_name}
        </Link>
        {row.title && <p className="text-xs text-gray-500 truncate">{row.title}</p>}
        {row.company_name && (
          <p className="text-xs text-gray-400 truncate">{row.company_name}</p>
        )}
      </div>
      <div className="flex flex-wrap gap-1 mt-1">
        {row.options.map(opt => (
          <TouchpointPill key={opt.option_id} value={opt.value} color={opt.color} count={opt.count} />
        ))}
      </div>
    </div>
  );
}

// ── Main component ──────────────────────────────────────────────────────────
export function EventsTouchpointsTab({ socialEvents, touchpoints }: {
  socialEvents: SocialEventRow[];
  touchpoints: TouchpointAttendeeRow[];
}) {
  // Aggregate touchpoint type totals across all attendees
  const typeTotals = new Map<string, { value: string; color: string | null; count: number }>();
  for (const row of touchpoints) {
    for (const opt of row.options) {
      const existing = typeTotals.get(opt.value);
      if (existing) {
        existing.count += opt.count;
      } else {
        typeTotals.set(opt.value, { value: opt.value, color: opt.color, count: opt.count });
      }
    }
  }
  const typeSummary = Array.from(typeTotals.values()).sort((a, b) => b.count - a.count);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
      {/* Left — External Events */}
      <div className="space-y-4">
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
          External Events ({socialEvents.length})
        </h3>
        {socialEvents.length === 0 ? (
          <p className="text-sm text-gray-400 py-8 text-center">No social events recorded for this conference.</p>
        ) : (
          <div className="space-y-3">
            {socialEvents.map(ev => <EventCard key={ev.id} event={ev} />)}
          </div>
        )}
      </div>

      {/* Right — Touchpoints */}
      <div className="space-y-4">
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
          Touchpoints ({touchpoints.reduce((s, r) => s + r.totalCount, 0)} total)
        </h3>

        {touchpoints.length === 0 ? (
          <p className="text-sm text-gray-400 py-8 text-center">No touchpoints recorded for this conference.</p>
        ) : (
          <>
            {/* Summary pills */}
            <div className="flex flex-wrap gap-2">
              {typeSummary.map(t => (
                <TouchpointPill key={t.value} value={t.value} color={t.color} count={t.count} />
              ))}
            </div>

            {/* Attendee cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {touchpoints.map(row => <TouchpointCard key={row.attendee_id} row={row} />)}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
