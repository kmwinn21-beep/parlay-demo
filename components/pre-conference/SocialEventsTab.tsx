'use client';

import { useEffect, useRef, useState } from 'react';
import { useRecordDrawer } from './RecordDrawerContext';
import { SocialEventCardBody } from '../SocialEventCardParts';
import { getBadgeClass, getPreset } from '@/lib/colors';
import { useConfigColors } from '@/lib/useConfigColors';
import { getRepInitials } from '@/lib/useUserOptions';
import type { SocialEventRow, SocialEventGuest } from '../PreConferenceReview';

type RsvpStatus = 'yes' | 'no' | 'maybe' | 'attended';

/** The fields a Social-tab save broadcasts; ids identify the row to patch. */
type SocialEventPatch = Partial<SocialEventRow> & { id: number; prospect_attendees?: string | null };

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

/** Standard rep pill — user icon + initials, matching the Social tab's table. */
function UserPill({ name }: { name: string }) {
  const colorMaps = useConfigColors();
  return (
    <span
      title={name}
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium whitespace-nowrap ${getPreset(colorMaps.user?.[name]).badgeClass}`}
    >
      <svg className="w-3 h-3 opacity-70 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
      </svg>
      {getRepInitials(name)}
    </span>
  );
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

/* ─── RSVP status control ─── */

const RSVP_OPTIONS: { key: RsvpStatus; label: string }[] = [
  { key: 'yes', label: 'Yes' },
  { key: 'attended', label: 'Attended' },
  { key: 'no', label: 'No' },
  { key: 'maybe', label: 'Maybe' },
];

/** Filled treatment for a recorded status; the trigger borrows it too. */
function rsvpFillClass(s: RsvpStatus): string {
  return s === 'yes' ? 'bg-green-100 text-green-600'
    : s === 'attended' ? 'bg-purple-100 text-purple-600'
    : s === 'no' ? 'bg-red-50 text-red-500'
    : 'bg-gray-200 text-gray-600';
}

function RsvpGlyph({ status }: { status: RsvpStatus }) {
  if (status === 'yes') return <CheckSvg />;
  if (status === 'attended') return <StarSvg />;
  if (status === 'no') return <XSvg />;
  return <span className="font-bold text-[10px] leading-none">?</span>;
}

/**
 * Collapsed RSVP control: a kebab until something is recorded, after which the
 * trigger becomes the filled circular icon for that status. Either way clicking
 * it opens the picker, so a status can always be changed.
 */
function RsvpMenu({ statuses, onToggle }: {
  statuses: RsvpStatus[];
  onToggle: (s: RsvpStatus) => void;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onEsc);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onEsc); };
  }, [open]);

  // With several statuses recorded, the first in canonical order leads.
  const primary = RSVP_OPTIONS.map(o => o.key).find(k => statuses.includes(k)) ?? null;

  return (
    <div ref={wrapRef} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        title={primary ? `RSVP: ${primary}` : 'Set RSVP'}
        aria-haspopup="menu"
        aria-expanded={open}
        className={`w-6 h-6 rounded-full flex items-center justify-center transition-colors flex-shrink-0 ${
          primary ? rsvpFillClass(primary) : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'
        }`}
      >
        {primary ? <RsvpGlyph status={primary} /> : (
          <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
            <path d="M10 6a1.5 1.5 0 110-3 1.5 1.5 0 010 3zm0 5.5a1.5 1.5 0 110-3 1.5 1.5 0 010 3zm0 5.5a1.5 1.5 0 110-3 1.5 1.5 0 010 3z" />
          </svg>
        )}
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-full mt-1 z-30 bg-white border border-gray-200 rounded-lg shadow-lg p-1.5 flex gap-1">
          {RSVP_OPTIONS.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              role="menuitem"
              title={label}
              onClick={() => onToggle(key)}
              className={`w-6 h-6 rounded-full flex items-center justify-center transition-colors flex-shrink-0 ${
                statuses.includes(key) ? rsvpFillClass(key) : 'bg-gray-50 text-gray-300 hover:text-gray-500 hover:bg-gray-100'
              }`}
            >
              <RsvpGlyph status={key} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── Guest list row ─── */
function GuestRow({ guest, eventId, onUpdate }: {
  guest: SocialEventGuest;
  eventId: number;
  onUpdate: (attendeeId: number, newStatus: string) => void;
}) {
  const openRecord = useRecordDrawer();
  const colorMaps = useConfigColors();
  const statuses = parseStatuses(guest.rsvp_status);

  async function toggle(s: RsvpStatus) {
    const next: RsvpStatus[] = statuses.includes(s) ? statuses.filter(x => x !== s) : [...statuses, s];
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
        <button type="button" onClick={() => openRecord('attendee', guest.attendee_id)} className="font-medium text-xs text-brand-primary hover:underline whitespace-nowrap text-left">
          {guest.first_name} {guest.last_name}
        </button>
      </td>
      <td className="py-2 pr-3 hidden sm:table-cell">
        {guest.seniority
          ? <span className={`${getBadgeClass(guest.seniority, colorMaps.seniority || {})} text-[10px] whitespace-nowrap`}>{guest.seniority}</span>
          : <span className="text-xs text-gray-400">—</span>}
      </td>
      <td className="py-2 pr-3 text-xs text-gray-600 whitespace-nowrap hidden sm:table-cell">
        {guest.company_id
          ? <button type="button" onClick={() => openRecord('company', guest.company_id!)} className="hover:underline text-brand-primary text-left">{guest.company_name}</button>
          : <span>{guest.company_name || '—'}</span>
        }
      </td>
      <td className="py-2 pr-3 hidden sm:table-cell">
        {guest.company_type
          ? <span className={`${getBadgeClass(guest.company_type, colorMaps.company_type || {})} text-[10px] whitespace-nowrap`}>{guest.company_type}</span>
          : <span className="text-xs text-gray-400">—</span>}
      </td>
      <td className="py-2 pr-3 hidden sm:table-cell">
        {guest.assigned_user_names.length > 0 && <UserPill name={guest.assigned_user_names[0]} />}
      </td>
      <td className="py-2">
        <RsvpMenu statuses={statuses} onToggle={toggle} />
      </td>
    </tr>
  );
}

/* ─── Guest list panel (inline expansion) ─── */
function GuestListPanel({ event }: { event: SocialEventRow }) {
  const [guests, setGuests] = useState<SocialEventGuest[]>(event.guestList);
  // Company-type filter buttons come from the ICP Parameters rule in Admin >
  // ICP (icp_rules, category 'company_type') — the same source the Social tab's
  // RSVP table reads, so both offer the same set.
  const [icpCompanyTypes, setIcpCompanyTypes] = useState<string[]>([]);
  const [selectedTypes, setSelectedTypes] = useState<Set<string>>(new Set());
  useEffect(() => {
    fetch('/api/admin/icp-rules', { cache: 'no-store' })
      .then(r => (r.ok ? r.json() : null))
      .then((data: { rules?: { category: string; conditions: { option_value: string }[] }[] } | null) => {
        const rule = data?.rules?.find(x => x.category === 'company_type');
        setIcpCompanyTypes(rule ? rule.conditions.map(c => c.option_value).filter(Boolean) : []);
      })
      .catch(() => {});
  }, []);
  const toggleType = (t: string) => setSelectedTypes(prev => {
    const next = new Set(prev);
    if (next.has(t)) next.delete(t); else next.add(t);
    return next;
  });
  const [activeFilter, setActiveFilter] = useState<RsvpStatus | null>(null);

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


  const filtered = guests
    .filter(g => selectedTypes.size === 0 || (g.company_type != null && selectedTypes.has(g.company_type)))
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
        {icpCompanyTypes.length > 0 && (
          <div className="flex items-center gap-1.5 flex-wrap">
            {icpCompanyTypes.map(type => (
              <button
                key={type}
                type="button"
                onClick={() => toggleType(type)}
                className={`px-2 py-1 rounded-lg text-xs font-medium transition-colors flex-shrink-0 ${selectedTypes.has(type) ? 'bg-brand-primary text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
              >
                {type}
              </button>
            ))}
          </div>
        )}
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
                <th className="pb-1.5 pr-3 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wide hidden sm:table-cell" title="Seniority">Snrty</th>
                <th className="pb-1.5 pr-3 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wide hidden sm:table-cell">Company</th>
                <th className="pb-1.5 pr-3 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wide hidden sm:table-cell">Type</th>
                <th className="pb-1.5 pr-3 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wide hidden sm:table-cell">Rep</th>
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
/**
 * Mirrors the card in the conference-details Social tab — the header, date
 * pill and meta row come from the same shared component, so the two surfaces
 * cannot drift. Only the expanded body differs: this one is read-only apart
 * from the RSVP toggles.
 */
function EventCard({ event }: { event: SocialEventRow }) {
  const [showGuests, setShowGuests] = useState(false);

  return (
    <div className="border border-gray-200 rounded-xl bg-white overflow-hidden hover:border-gray-300 transition-colors">
      <SocialEventCardBody
        eventName={event.event_name}
        eventType={event.event_type}
        host={event.host}
        venueName={event.venue_name ?? null}
        location={event.location}
        eventDate={event.event_date}
        eventTime={event.event_time}
        companyHosted={!!event.company_hosted}
        inviteOnly={event.invite_only}
        internalAttendees={event.internal_attendees}
        invitedCount={event.guestList.length}
        isExpanded={showGuests}
        onToggle={() => setShowGuests(v => !v)}
      />

      {event.notes && (
        <p className="text-xs text-gray-500 px-3 pb-3 sm:px-4 sm:pl-10 line-clamp-2">{event.notes}</p>
      )}

      {showGuests && (
        <div className="border-t border-gray-200 px-3 pb-3 sm:px-4">
          {event.guestList.length > 0
            ? <GuestListPanel event={event} />
            : <p className="text-xs text-gray-400 py-3">No guests invited yet.</p>}
        </div>
      )}
    </div>
  );
}

export function SocialEventsTab({ events }: { events: SocialEventRow[] }) {
  // The pre-conference payload is fetched once when the modal opens. Edits made
  // in the conference-details Social tab broadcast, so patch the local copy
  // rather than showing a stale card until the modal is reopened.
  const [rows, setRows] = useState<SocialEventRow[]>(events);
  useEffect(() => { setRows(events); }, [events]);

  useEffect(() => {
    const onSaved = (e: Event) => {
      const ev = (e as CustomEvent).detail as SocialEventPatch | undefined;
      if (!ev) return;
      setRows(prev => {
        const idx = prev.findIndex(r => r.id === ev.id);
        if (idx === -1) return prev;
        const next = [...prev];
        const merged = { ...next[idx], ...ev };
        // Guests dropped from the list go immediately. Newly invited ones can't
        // be built here — they arrive with the next pre-conference load.
        if (typeof ev.prospect_attendees === 'string') {
          const stillInvited = new Set(
            ev.prospect_attendees.split(',').map(v => Number(v.trim())).filter(n => n > 0),
          );
          merged.guestList = merged.guestList.filter(g => stillInvited.has(g.attendee_id));
        }
        next[idx] = merged;
        return next;
      });
    };
    const onDeleted = (e: Event) => {
      const { id } = ((e as CustomEvent).detail ?? {}) as { id?: number };
      if (id == null) return;
      setRows(prev => prev.filter(r => r.id !== id));
    };
    window.addEventListener('social-event-saved', onSaved);
    window.addEventListener('social-event-deleted', onDeleted);
    return () => {
      window.removeEventListener('social-event-saved', onSaved);
      window.removeEventListener('social-event-deleted', onDeleted);
    };
  }, []);

  if (rows.length === 0) {
    return (
      <div className="text-center py-16">
        <p className="text-gray-400 text-sm">No social events for this conference.</p>
      </div>
    );
  }

  // Grouped on the Company Hosted / Sponsored flag — the same field the Social
  // tab shows a star for — rather than on an 'Internal' event type.
  const hosted = rows.filter(e => e.company_hosted);
  const external = rows.filter(e => !e.company_hosted);

  return (
    <div className="space-y-8">
      {hosted.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Company-Hosted Events ({hosted.length})</h3>
          <div className="grid sm:grid-cols-2 gap-4">
            {hosted.map(e => <EventCard key={e.id} event={e} />)}
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
