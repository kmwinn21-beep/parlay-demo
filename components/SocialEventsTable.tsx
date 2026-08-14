'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { LocationAutocompleteInput } from './LocationAutocompleteInput';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { getBadgeClass, getPreset } from '@/lib/colors';
import { useConfigColors } from '@/lib/useConfigColors';
import { getConfig } from '@/lib/configCache';
import { parseRepIds, getRepInitials } from '@/lib/useUserOptions';
import { useUser } from '@/components/UserContext';
import { useTableColumnConfig, useCustomColumns } from '@/lib/useTableColumnConfig';
import { CustomColumnCell } from './CustomColumnCell';

type RsvpStatus = 'yes' | 'no' | 'maybe' | 'attended';

export interface SocialEvent {
  id: number;
  conference_id: number;
  entered_by: string | null;
  internal_attendees: string | null;
  event_name: string | null;
  event_type: string | null;
  host: string | null;
  venue_name: string | null;
  location: string | null;
  company_hosted?: boolean;
  event_date: string | null;
  event_time: string | null;
  invite_only: string;
  prospect_attendees: string | null;
  notes: string | null;
  created_at: string;
  rsvps: Array<{ attendee_id: number; rsvp_status: string }>;
}

const COMPETITOR_TYPE_DEFS: Record<string, string> = {
  'Direct': 'Offers the same core product or service to the same buyer profile.',
  'Adjacent': 'Overlaps in one area but does not offer the full solution.',
  'Market alternative': 'Competes for the same buyer budget or decision-making attention.',
  'Emerging': 'A newer entrant moving into your space. Lower threat weight today but worth tracking.',
  'Unknown': 'Competitor type undetermined. Treated as Direct for scoring purposes.',
};

function CompetitorBadgeSE({ type, competitorType, badgeClass }: { type: string; competitorType?: string; badgeClass: string }) {
  const [show, setShow] = useState(false);
  const ctype = competitorType || 'Unknown';
  const def = COMPETITOR_TYPE_DEFS[ctype] ?? COMPETITOR_TYPE_DEFS['Unknown'];
  return (
    <span className={`${badgeClass} text-[10px] relative cursor-default`} onMouseEnter={() => setShow(true)} onMouseLeave={() => setShow(false)}>
      {type}
      {show && (
        <span className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-1.5 w-48 bg-gray-900 text-white text-xs rounded-lg px-2.5 py-2 pointer-events-none shadow-lg whitespace-normal">
          <span className="block font-semibold">{ctype}</span>
          <span className="block text-gray-300 mt-0.5">{def}</span>
        </span>
      )}
    </span>
  );
}

interface Attendee {
  id: number;
  first_name: string;
  last_name: string;
  title?: string | null;
  company_id?: number;
  company_name?: string;
  company_type?: string;
  company_competitor_type?: string;
}

interface CompanyOption {
  id: number;
  name: string;
  assigned_user?: string | null;
}

export interface SocialEventsTableProps {
  conferenceId: number;
  conferenceName: string;
  events: SocialEvent[];
  onRefresh: () => void;
  userOptions: string[];
  userOptionsFull: Array<{ id: number; value: string }>;
  eventTypeOptions: string[];
  companies: CompanyOption[];
  attendees: Attendee[];
}

/* ─── helpers ─── */
function formatDate(d: string | null) {
  if (!d) return '—';
  return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
function formatTime(t: string | null) {
  if (!t) return '—';
  const [h, m] = t.split(':');
  const hour = parseInt(h, 10);
  return `${hour % 12 || 12}:${m} ${hour >= 12 ? 'PM' : 'AM'}`;
}
function parseStatuses(stored: string | null | undefined): RsvpStatus[] {
  if (!stored) return [];
  return stored.split(',').map(s => s.trim()).filter(s => ['yes','no','maybe','attended'].includes(s)) as RsvpStatus[];
}

/* ─── RSVP icon ─── */
const StarSvg = ({ cls }: { cls: string }) => (
  <svg className={cls} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
  </svg>
);
const CheckSvg = ({ cls }: { cls: string }) => (
  <svg className={cls} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
  </svg>
);

function RSVPIcon({ statuses }: { statuses: RsvpStatus[] }) {
  const has = (s: RsvpStatus) => statuses.includes(s);
  // Dual icon: yes + attended together
  if (has('yes') && has('attended')) return (
    <span className="inline-flex items-center gap-0.5 flex-shrink-0">
      <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-green-100"><CheckSvg cls="w-3 h-3 text-green-600" /></span>
      <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-purple-100"><StarSvg cls="w-3 h-3 text-purple-600" /></span>
    </span>
  );
  if (has('no') && has('attended')) return (
    <span className="inline-flex items-center gap-0.5 flex-shrink-0">
      <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-red-50">
        <svg className="w-3 h-3 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" /></svg>
      </span>
      <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-purple-100"><StarSvg cls="w-3 h-3 text-purple-600" /></span>
    </span>
  );
  if (has('maybe') && has('attended')) return (
    <span className="inline-flex items-center gap-0.5 flex-shrink-0">
      <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-gray-100 text-gray-400 font-bold text-xs leading-none">?</span>
      <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-purple-100"><StarSvg cls="w-3 h-3 text-purple-600" /></span>
    </span>
  );
  if (has('attended')) return (
    <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-purple-100 flex-shrink-0"><StarSvg cls="w-3.5 h-3.5 text-purple-600" /></span>
  );
  if (has('yes')) return (
    <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-green-100 flex-shrink-0"><CheckSvg cls="w-3.5 h-3.5 text-green-600" /></span>
  );
  if (has('no')) return (
    <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-red-50 flex-shrink-0">
      <svg className="w-3.5 h-3.5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" /></svg>
    </span>
  );
  if (has('maybe')) return (
    <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-gray-100 flex-shrink-0 text-gray-400 font-bold text-sm leading-none">?</span>
  );
  return (
    <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-gray-100 flex-shrink-0 text-gray-300 font-bold text-sm leading-none">?</span>
  );
}

/* ─── Assigned-user icon pill with hover tooltip ─── */
function AssignedUserPill({ assignedUser, userOptionsFull }: {
  assignedUser: string | null | undefined;
  userOptionsFull: Array<{ id: number; value: string }>;
}) {
  const colorMaps = useConfigColors();
  if (!assignedUser) return null;
  const names = parseRepIds(assignedUser)
    .map(id => userOptionsFull.find(u => u.id === id)?.value)
    .filter(Boolean) as string[];
  if (names.length === 0) return null;
  // Standard rep pill — user icon + initials, matching the SF Owner column in
  // components/CompanyTable.tsx.
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      {names.map(name => (
        <span
          key={name}
          title={name}
          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium whitespace-nowrap ${getPreset(colorMaps.user?.[name]).badgeClass}`}
        >
          <svg className="w-3 h-3 opacity-70" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
          </svg>
          {getRepInitials(name)}
        </span>
      ))}
    </span>
  );
}

/* ─── RSVP summary totals + Primary Company Type toggle ─── */
function RSVPSummaryBar({ invitedIds, rsvpMap, selectedTypes, icpCompanyTypes, attendees, onToggleType, activeFilters, onToggleFilter, stackOperators }: {
  invitedIds: number[];
  rsvpMap: Record<number, RsvpStatus[]>;
  selectedTypes: Set<string>;
  icpCompanyTypes: string[];
  attendees: Attendee[];
  onToggleType: (type: string) => void;
  activeFilters: RsvpStatus[];
  onToggleFilter: (f: RsvpStatus | null) => void;
  stackOperators?: boolean;
}) {
  const filtered = selectedTypes.size > 0
    ? invitedIds.filter(id => {
        const t = attendees.find(a => a.id === id)?.company_type;
        return t ? selectedTypes.has(t) : false;
      })
    : invitedIds;
  const yes = filtered.filter(id => (rsvpMap[id] || []).includes('yes')).length;
  const attended = filtered.filter(id => (rsvpMap[id] || []).includes('attended')).length;
  const no = filtered.filter(id => (rsvpMap[id] || []).includes('no')).length;
  const maybe = filtered.filter(id => (rsvpMap[id] || []).includes('maybe')).length;
  const cards: { label: string; value: number; cls: string; activeCls: string; filter: RsvpStatus | null }[] = [
    { label: 'Invited',  value: filtered.length, filter: null,       cls: 'bg-gray-50 border-gray-200 text-gray-800',         activeCls: 'ring-2 ring-gray-400' },
    { label: 'Yes',      value: yes,              filter: 'yes',      cls: 'bg-green-50 border-green-100 text-green-700',      activeCls: 'ring-2 ring-green-400' },
    { label: 'Attended', value: attended,         filter: 'attended', cls: 'bg-purple-50 border-purple-100 text-purple-700',  activeCls: 'ring-2 ring-purple-400' },
    { label: 'No',       value: no,               filter: 'no',       cls: 'bg-red-50 border-red-100 text-red-600',           activeCls: 'ring-2 ring-red-300' },
    { label: 'Maybe',    value: maybe,            filter: 'maybe',    cls: 'bg-gray-50 border-gray-200 text-gray-500',        activeCls: 'ring-2 ring-gray-300' },
  ];
  const noneActive = activeFilters.length === 0;
  const countRow = (
    <div className="flex gap-1.5 flex-1 min-w-0">
      {cards.map(({ label, value, cls, activeCls, filter }) => {
        const isActive = filter === null ? noneActive : activeFilters.includes(filter);
        return (
          <button
            key={label}
            type="button"
            onClick={() => onToggleFilter(filter)}
            className={`flex-1 rounded-lg p-2 text-center border transition-all ${cls} ${isActive ? activeCls : 'opacity-60 hover:opacity-90'}`}
          >
            <p className="text-base font-bold leading-none">{value}</p>
            <p className="text-[10px] text-gray-500 uppercase tracking-wide mt-0.5">{label}</p>
          </button>
        );
      })}
    </div>
  );
  // One toggle per ICP company type; multiple can be active at once.
  const primaryTypeBtn = icpCompanyTypes.length > 0 ? (
    <div className="flex items-center gap-1.5 flex-wrap">
      {icpCompanyTypes.map(type => (
        <button
          key={type}
          type="button"
          onClick={() => onToggleType(type)}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex-shrink-0 ${selectedTypes.has(type) ? 'bg-brand-primary text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
        >
          {type}
        </button>
      ))}
    </div>
  ) : null;
  if (stackOperators) {
    return (
      <div className="space-y-2">
        {countRow}
        {primaryTypeBtn && <div>{primaryTypeBtn}</div>}
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <div className="flex gap-1.5 flex-1 min-w-0">
        {cards.map(({ label, value, cls, activeCls, filter }) => {
          const isActive = filter === null ? noneActive : activeFilters.includes(filter);
          return (
            <button
              key={label}
              type="button"
              onClick={() => onToggleFilter(filter)}
              className={`flex-1 rounded-lg p-2 text-center border transition-all ${cls} ${isActive ? activeCls : 'opacity-60 hover:opacity-90'}`}
            >
              <p className="text-xl font-bold leading-none">{value}</p>
              <p className="text-sm text-gray-500 uppercase tracking-wide mt-0.5">{label}</p>
            </button>
          );
        })}
      </div>
      {primaryTypeBtn}
    </div>
  );
}

/* ─── Individual attendee card with RSVP picker ─── */
function AttendeeRSVPCard({ attendee, statuses, onToggleRsvp, onRemove, colorMaps, companies, userOptionsFull }: {
  attendee: Attendee;
  statuses: RsvpStatus[];
  onToggleRsvp: (s: RsvpStatus) => void;
  onRemove?: () => void;
  colorMaps: Record<string, Record<string, string | null>>;
  companies: CompanyOption[];
  userOptionsFull: Array<{ id: number; value: string }>;
}) {
  const [open, setOpen] = useState(false);
  const company = companies.find(c => c.id === attendee.company_id);
  const has = (s: RsvpStatus) => statuses.includes(s);
  return (
    <div className="border border-gray-200 rounded-xl bg-white overflow-hidden">
      <button type="button" className="w-full text-left p-3" onClick={() => setOpen(v => !v)}>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <a href={`/attendees/${attendee.id}`} onClick={e => e.stopPropagation()} className="font-semibold text-sm text-brand-primary hover:underline leading-tight block">{attendee.first_name} {attendee.last_name}</a>
            {attendee.title && <p className="text-xs text-gray-500 mt-0.5">{attendee.title}</p>}
            {attendee.company_name && (
              attendee.company_id
                ? <a href={`/companies/${attendee.company_id}`} onClick={e => e.stopPropagation()} className="text-xs text-brand-primary hover:underline mt-0.5 block">{attendee.company_name}</a>
                : <p className="text-xs text-gray-600 mt-0.5">{attendee.company_name}</p>
            )}
            <div className="flex flex-wrap items-center gap-1 mt-1.5">
              {attendee.company_type && (
                attendee.company_type === 'Competitor'
                  ? <CompetitorBadgeSE type={attendee.company_type} competitorType={attendee.company_competitor_type} badgeClass={getBadgeClass(attendee.company_type, colorMaps.company_type || {})} />
                  : <span className={`${getBadgeClass(attendee.company_type, colorMaps.company_type || {})} text-[10px]`}>{attendee.company_type}</span>
              )}
              <AssignedUserPill assignedUser={company?.assigned_user} userOptionsFull={userOptionsFull} />
            </div>
          </div>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <RSVPIcon statuses={statuses} />
            {onRemove && (
              <button
                type="button"
                title="Remove from guest list"
                onClick={e => { e.stopPropagation(); onRemove(); }}
                className="p-1 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            )}
          </div>
        </div>
      </button>
      {open && (
        <div className="px-3 pb-3 pt-0 border-t border-gray-100">
          <div className="flex gap-1.5 pt-2">
            {(['yes', 'attended', 'no', 'maybe'] as RsvpStatus[]).map(s => (
              <button key={s} type="button"
                onClick={() => onToggleRsvp(s)}
                className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center justify-center gap-1 ${
                  has(s)
                    ? s === 'yes' ? 'bg-green-100 text-green-700' : s === 'attended' ? 'bg-purple-100 text-purple-700' : s === 'no' ? 'bg-red-50 text-red-600' : 'bg-gray-200 text-gray-700'
                    : 'bg-gray-50 text-gray-500 hover:bg-gray-100'
                }`}>
                {s === 'yes' && <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
                {s === 'attended' && <StarSvg cls="w-3 h-3" />}
                {s === 'no' && <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" /></svg>}
                {s === 'maybe' && <span className="font-bold leading-none">?</span>}
                {s.charAt(0).toUpperCase() + s.slice(1)}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Mobile: full-screen guest list bottom sheet ─── */
function GuestListSheet({ event, invitedAttendees, rsvpMap, onToggleRsvp, onRemoveGuest, onClose, colorMaps, companies, userOptionsFull, icpCompanyTypes }: {
  event: SocialEvent;
  invitedAttendees: Attendee[];
  rsvpMap: Record<number, RsvpStatus[]>;
  onToggleRsvp: (attendeeId: number, s: RsvpStatus) => void;
  onRemoveGuest: (attendeeId: number) => void;
  onClose: () => void;
  colorMaps: Record<string, Record<string, string | null>>;
  companies: CompanyOption[];
  userOptionsFull: Array<{ id: number; value: string }>;
  icpCompanyTypes: string[];
}) {
  const [selectedTypes, setSelectedTypes] = useState<Set<string>>(new Set());
  const toggleType = (t: string) => setSelectedTypes(prev => {
    const next = new Set(prev);
    if (next.has(t)) next.delete(t); else next.add(t);
    return next;
  });
  const [activeFilters, setActiveFilters] = useState<RsvpStatus[]>([]);
  const handleToggleFilter = (f: RsvpStatus | null) => {
    if (f === null) { setActiveFilters([]); return; }
    setActiveFilters(prev => prev.includes(f) ? prev.filter(x => x !== f) : [...prev, f]);
  };
  const byPrimaryType = selectedTypes.size > 0 ? invitedAttendees.filter(a => a.company_type != null && selectedTypes.has(a.company_type)) : invitedAttendees;
  const visible = activeFilters.length === 0 ? byPrimaryType : byPrimaryType.filter(a => {
    const s = rsvpMap[a.id] || [];
    return activeFilters.some(f => s.includes(f));
  });
  return (
    // Dimmed backdrop plus the shared slide-up animation and h-[90vh], so this
    // matches every other mobile drawer on the site rather than appearing
    // instantly at whatever height its content happens to need.
    <div className="fixed inset-0 z-[60] flex flex-col justify-end bg-black/40" onClick={onClose}>
      <div
        className="drawer-mobile-responsive relative bg-white rounded-t-2xl shadow-2xl border border-brand-highlight flex flex-col h-[90vh]"
        onClick={e => e.stopPropagation()}
      >
        <div className="px-4 pt-4 pb-3 border-b border-gray-100 flex-shrink-0">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="font-semibold text-brand-primary">Guest List</h3>
              <p className="text-xs text-gray-500">{event.event_type || 'Social Event'}{event.host ? ` · ${event.host}` : ''}</p>
            </div>
            <button type="button" onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
          <RSVPSummaryBar invitedIds={invitedAttendees.map(a => a.id)} rsvpMap={rsvpMap} selectedTypes={selectedTypes} icpCompanyTypes={icpCompanyTypes} attendees={invitedAttendees} onToggleType={toggleType} activeFilters={activeFilters} onToggleFilter={handleToggleFilter} stackOperators />
        </div>
        <div className="overflow-y-auto flex-1 p-3 space-y-2 pb-24">
          {visible.length === 0
            ? <p className="text-sm text-gray-400 text-center py-8">No attendees to show.</p>
            : visible.map(att => (
              <AttendeeRSVPCard key={att.id} attendee={att} statuses={rsvpMap[att.id] || []} onToggleRsvp={s => onToggleRsvp(att.id, s)} onRemove={() => onRemoveGuest(att.id)} colorMaps={colorMaps} companies={companies} userOptionsFull={userOptionsFull} />
            ))}
        </div>
      </div>
    </div>
  );
}

/* ─── Desktop: inline RSVP expansion below table row ─── */
function RSVPExpansion({ event, invitedAttendees, rsvpMap, onToggleRsvp, onRemoveGuest, colorMaps, companies, userOptionsFull, icpCompanyTypes }: {
  event: SocialEvent;
  invitedAttendees: Attendee[];
  rsvpMap: Record<number, RsvpStatus[]>;
  onToggleRsvp: (attendeeId: number, s: RsvpStatus) => void;
  onRemoveGuest: (attendeeId: number) => void;
  colorMaps: Record<string, Record<string, string | null>>;
  companies: CompanyOption[];
  userOptionsFull: Array<{ id: number; value: string }>;
  icpCompanyTypes: string[];
}) {
  const [selectedTypes, setSelectedTypes] = useState<Set<string>>(new Set());
  const toggleType = (t: string) => setSelectedTypes(prev => {
    const next = new Set(prev);
    if (next.has(t)) next.delete(t); else next.add(t);
    return next;
  });
  const [activeFilters, setActiveFilters] = useState<RsvpStatus[]>([]);
  const handleToggleFilter = (f: RsvpStatus | null) => {
    if (f === null) { setActiveFilters([]); return; }
    setActiveFilters(prev => prev.includes(f) ? prev.filter(x => x !== f) : [...prev, f]);
  };
  const byPrimaryType = selectedTypes.size > 0 ? invitedAttendees.filter(a => a.company_type != null && selectedTypes.has(a.company_type)) : invitedAttendees;
  const visible = activeFilters.length === 0 ? byPrimaryType : byPrimaryType.filter(a => {
    const s = rsvpMap[a.id] || [];
    return activeFilters.some(f => s.includes(f));
  });
  return (
    <div className="p-4 bg-gray-50 border-t border-gray-200">
      <div className="mb-4">
        <RSVPSummaryBar invitedIds={invitedAttendees.map(a => a.id)} rsvpMap={rsvpMap} selectedTypes={selectedTypes} icpCompanyTypes={icpCompanyTypes} attendees={invitedAttendees} onToggleType={toggleType} activeFilters={activeFilters} onToggleFilter={handleToggleFilter} />
      </div>
      {visible.length === 0
        ? <p className="text-sm text-gray-400 text-center py-4">No attendees to show.</p>
        : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200">
                {['Name','Title','Company','Type','Rep','RSVP (multi-select)',''].map(h => (
                  <th key={h} className="pb-2 pr-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {visible.map(att => {
                const co = companies.find(c => c.id === att.company_id);
                const statuses = rsvpMap[att.id] || [];
                const has = (opt: RsvpStatus) => statuses.includes(opt);
                return (
                  <tr key={att.id} className="hover:bg-white">
                    <td className="py-2 pr-3 font-medium whitespace-nowrap"><Link href={`/attendees/${att.id}`} className="text-brand-primary hover:underline">{att.first_name} {att.last_name}</Link></td>
                    <td className="py-2 pr-3 text-gray-700 text-sm whitespace-nowrap">{att.title || '—'}</td>
                    <td className="py-2 pr-3 whitespace-nowrap">{att.company_id ? <Link href={`/companies/${att.company_id}`} className="text-brand-primary hover:underline">{att.company_name}</Link> : <span className="text-gray-700">{att.company_name || '—'}</span>}</td>
                    <td className="py-2 pr-3">
                      {att.company_type
                        ? (att.company_type === 'Competitor'
                          ? <CompetitorBadgeSE type={att.company_type} competitorType={att.company_competitor_type} badgeClass={getBadgeClass(att.company_type, colorMaps.company_type || {})} />
                          : <span className={`${getBadgeClass(att.company_type, colorMaps.company_type || {})} text-[10px]`}>{att.company_type}</span>)
                        : <span className="text-gray-400">—</span>}
                    </td>
                    <td className="py-2 pr-3"><AssignedUserPill assignedUser={co?.assigned_user} userOptionsFull={userOptionsFull} /></td>
                    <td className="py-2 pr-3">
                      <div className="flex gap-1">
                        {(['yes','attended','no','maybe'] as RsvpStatus[]).map(opt => (
                          <button key={opt} type="button" title={opt.charAt(0).toUpperCase() + opt.slice(1)} onClick={() => onToggleRsvp(att.id, opt)}
                            className={`w-6 h-6 rounded-full flex items-center justify-center transition-colors ${
                              has(opt)
                                ? opt === 'yes' ? 'bg-green-100 text-green-600' : opt === 'attended' ? 'bg-purple-100 text-purple-600' : opt === 'no' ? 'bg-red-50 text-red-500' : 'bg-gray-200 text-gray-600'
                                : 'bg-gray-50 text-gray-300 hover:text-gray-500 hover:bg-gray-100'
                            }`}>
                            {opt === 'yes' && <CheckSvg cls="w-3 h-3" />}
                            {opt === 'attended' && <StarSvg cls="w-3 h-3" />}
                            {opt === 'no' && <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" /></svg>}
                            {opt === 'maybe' && <span className="font-bold text-[10px] leading-none">?</span>}
                          </button>
                        ))}
                      </div>
                    </td>
                    <td className="py-2">
                      <button
                        type="button"
                        title="Remove from guest list"
                        onClick={() => onRemoveGuest(att.id)}
                        className="p-1 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
    </div>
  );
}

/* ─── Social event card pieces ─── */

/**
 * Google Places returns "3600 S Las Vegas Blvd, Las Vegas, NV 89109, USA".
 * Only formatted_address is stored, so the venue name isn't recoverable —
 * the trailing ", USA" is dropped instead to keep the pill readable.
 */
function displayLocation(venueName: string | null, address: string): string {
  const addr = address.replace(/,\s*USA\s*$/i, '').trim();
  const venue = (venueName ?? '').trim();
  return [venue, addr].filter(Boolean).join(', ');
}

function mapsHref(location: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location)}`;
}

/** Eyebrow label with its value beneath, used across the card's meta row. */
function CardField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-0.5 whitespace-nowrap">{label}</p>
      <div className="text-xs text-gray-700 min-w-0">{children}</div>
    </div>
  );
}

/**
 * Internal attendees as the abbreviated rep pills used in the company tables.
 * They sit on one line rather than wrapping — on a narrow card that would eat
 * several rows — so the row scrolls horizontally when it overflows, with
 * chevrons appearing on either side once there is somewhere to scroll to.
 */
function InternalRepPills({ internalAttendees }: { internalAttendees: string | null }) {
  const colorMaps = useConfigColors();
  const rowRef = useRef<HTMLDivElement>(null);
  const [canLeft, setCanLeft] = useState(false);
  const [canRight, setCanRight] = useState(false);

  const names = (internalAttendees ?? '').split(',').map(n => n.trim()).filter(Boolean);

  const updateArrows = useCallback(() => {
    const el = rowRef.current;
    if (!el) return;
    setCanLeft(el.scrollLeft > 1);
    setCanRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 1);
  }, []);

  useEffect(() => {
    updateArrows();
    const el = rowRef.current;
    if (!el) return;
    const ro = new ResizeObserver(updateArrows);
    ro.observe(el);
    window.addEventListener('resize', updateArrows);
    return () => { ro.disconnect(); window.removeEventListener('resize', updateArrows); };
  }, [updateArrows, internalAttendees]);

  if (names.length === 0) return <span className="text-gray-400">—</span>;

  const scroll = (dir: -1 | 1) => rowRef.current?.scrollBy({ left: dir * 120, behavior: 'smooth' });
  const arrowCls = 'flex-shrink-0 w-4 h-4 rounded-full bg-white border border-gray-200 text-gray-400 hover:text-brand-secondary hover:border-gray-300 flex items-center justify-center transition-colors';

  return (
    <div className="flex items-center gap-1 min-w-0">
      {canLeft && (
        <button type="button" onClick={e => { e.stopPropagation(); scroll(-1); }} className={arrowCls} title="Scroll left">
          <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M15 19l-7-7 7-7" /></svg>
        </button>
      )}
      <div ref={rowRef} onScroll={updateArrows} className="flex items-center gap-1 overflow-x-auto scrollbar-hide min-w-0">
        {names.map(name => (
          <span
            key={name}
            title={name}
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium whitespace-nowrap flex-shrink-0 ${getPreset(colorMaps.user?.[name]).badgeClass}`}
          >
            <svg className="w-3 h-3 opacity-70" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
            {getRepInitials(name)}
          </span>
        ))}
      </div>
      {canRight && (
        <button type="button" onClick={e => { e.stopPropagation(); scroll(1); }} className={arrowCls} title="Scroll right">
          <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M9 5l7 7-7 7" /></svg>
        </button>
      )}
    </div>
  );
}


/* ─── Build Guest List modal ─── */
function GuestListModal({ attendees, selected, onConfirm, onClose, icpCompanyTypes }: {
  attendees: Attendee[];
  selected: string[];
  onConfirm: (ids: string[]) => void;
  onClose: () => void;
  icpCompanyTypes: string[];
}) {
  const [draft, setDraft] = useState<string[]>(selected);
  const [search, setSearch] = useState('');

  // ICP company types sort to the top of the pick list.
  const icpTypeSet = new Set(icpCompanyTypes);
  const sorted = [...attendees].sort((a, b) => {
    const aOp = a.company_type && icpTypeSet.has(a.company_type) ? 0 : 1;
    const bOp = b.company_type && icpTypeSet.has(b.company_type) ? 0 : 1;
    if (aOp !== bOp) return aOp - bOp;
    return (a.company_name || '').localeCompare(b.company_name || '');
  });

  const q = search.toLowerCase().trim();
  const visible = q
    ? sorted.filter(a =>
        `${a.first_name} ${a.last_name}`.toLowerCase().includes(q) ||
        (a.company_name || '').toLowerCase().includes(q) ||
        (a.title || '').toLowerCase().includes(q)
      )
    : sorted;

  const toggle = (id: string) =>
    setDraft(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

  const visibleIds = visible.map(a => String(a.id));
  const allVisibleChecked = visibleIds.length > 0 && visibleIds.every(id => draft.includes(id));

  const toggleAll = () => {
    if (allVisibleChecked) {
      setDraft(prev => prev.filter(id => !visibleIds.includes(id)));
    } else {
      setDraft(prev => Array.from(new Set([...prev, ...visibleIds])));
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4" onClick={onClose}>
      <div className="relative bg-white rounded-2xl shadow-2xl border border-brand-highlight flex flex-col w-full max-w-2xl max-h-[80vh]" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="px-5 pt-5 pb-4 border-b border-gray-100 flex-shrink-0">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="text-base font-semibold text-brand-primary">Build Guest List</h3>
              <p className="text-xs text-gray-500 mt-0.5">{draft.length} selected</p>
            </div>
            <button type="button" onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by name, company, or title..."
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-secondary"
            autoFocus
          />
        </div>

        {/* Table */}
        <div className="overflow-y-auto flex-1">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-white border-b border-gray-100 z-10">
              <tr>
                <th className="pl-4 pr-2 py-2.5 w-8">
                  <button type="button" onClick={toggleAll} className={`w-4 h-4 rounded border flex items-center justify-center ${allVisibleChecked ? 'bg-brand-secondary border-brand-secondary' : 'border-gray-300 hover:border-gray-400'}`}>
                    {allVisibleChecked && <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
                  </button>
                </th>
                <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Attendee</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {visible.length === 0 ? (
                <tr><td colSpan={2} className="px-4 py-8 text-sm text-gray-400 text-center">No matching attendees.</td></tr>
              ) : visible.map(att => {
                const id = String(att.id);
                const checked = draft.includes(id);
                const op = att.company_type != null && icpTypeSet.has(att.company_type);
                return (
                  <tr key={att.id} onClick={() => toggle(id)} className={`cursor-pointer transition-colors ${checked ? 'bg-blue-50 hover:bg-blue-50' : 'hover:bg-gray-50'}`}>
                    <td className="pl-4 pr-2 py-2.5 align-middle">
                      <span className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 ${checked ? 'bg-brand-secondary border-brand-secondary' : 'border-gray-300'}`}>
                        {checked && <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
                      </span>
                    </td>
                    <td className="px-3 py-2 align-middle">
                      <div className="flex items-center gap-1.5">
                        {op && (
                          <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-green-100 text-green-700 border border-green-300 text-[9px] font-bold flex-shrink-0">O</span>
                        )}
                        <span className="font-medium text-gray-900">{att.first_name} {att.last_name}</span>
                      </div>
                      <div className="text-xs text-gray-400 mt-0.5 pl-0.5">
                        {att.title && <span>{att.title}</span>}
                        {att.title && att.company_name && <span className="mx-1">·</span>}
                        {att.company_name && <span>{att.company_name}</span>}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-gray-100 flex items-center justify-between flex-shrink-0 gap-3">
          <span className="text-sm text-gray-500">{draft.length} attendee{draft.length !== 1 ? 's' : ''} selected</span>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="btn-secondary text-sm">Cancel</button>
            <button type="button" onClick={() => { onConfirm(draft); onClose(); }} className="btn-primary text-sm">
              Confirm Guest List
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Main component ─── */
export function SocialEventsTable({
  conferenceId, conferenceName, events, onRefresh,
  userOptions, userOptionsFull, eventTypeOptions, companies, attendees,
}: SocialEventsTableProps) {
  const colorMaps = useConfigColors();
  const { user } = useUser();
  // Company-type filter buttons come from the ICP Parameters rule in Admin >
  // ICP (icp_rules, category 'company_type'), so the RSVP table offers the same
  // types that define an ICP company — one button each — rather than the single
  // is_primary type it used before. Same source CompanyTable reads.
  const [icpCompanyTypes, setIcpCompanyTypes] = useState<string[]>([]);
  useEffect(() => {
    fetch('/api/admin/icp-rules', { cache: 'no-store' })
      .then(r => (r.ok ? r.json() : null))
      .then((data: { rules?: { category: string; conditions: { option_value: string }[] }[] } | null) => {
        const rule = data?.rules?.find(r => r.category === 'company_type');
        setIcpCompanyTypes(rule ? rule.conditions.map(c => c.option_value).filter(Boolean) : []);
      })
      .catch(() => {});
  }, []);
  const customColumns = useCustomColumns('social_events');

  /* form state */
  const [showForm, setShowForm] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editingEventId, setEditingEventId] = useState<number | null>(null);
  const [formData, setFormData] = useState({
    entered_by: '', internal_attendees: [] as string[], event_name: '', event_type: '',
    host: '', venue_name: '', location: '', company_hosted: false, event_date: '', event_time: '',
    invite_only: 'No', prospect_attendees: [] as string[], notes: '',
  });
  const [internalOpen, setInternalOpen] = useState(false);
  const [showGuestListModal, setShowGuestListModal] = useState(false);
  const internalRef = useRef<HTMLDivElement>(null);

  /* RSVP state */
  const [localRsvps, setLocalRsvps] = useState<Record<string, RsvpStatus[]>>({});
  const [guestListEventId, setGuestListEventId] = useState<number | null>(null);
  // Below sm the RSVP table is too wide to read inline, so expanding opens the
  // mobile guest-list sheet instead — same breakpoint the outreach cards use.
  const toggleEvent = (id: number) => {
    if (isDesktop) setExpandedEventId(v => (v === id ? null : id));
    else setGuestListEventId(v => (v === id ? null : id));
  };
  const [isDesktop, setIsDesktop] = useState(true);
  useEffect(() => {
    const media = window.matchMedia('(min-width: 640px)');
    const update = () => setIsDesktop(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  const [expandedEventId, setExpandedEventId] = useState<number | null>(null);

  /* sync RSVP changes from other components (e.g. pre-conference review) */
  useEffect(() => {
    const handler = (e: Event) => {
      const { eventId, attendeeId, rsvpStatus } = (e as CustomEvent).detail as { eventId: number; attendeeId: number; rsvpStatus: string };
      const key = `${eventId}:${attendeeId}`;
      const statuses = rsvpStatus.split(',').map((s: string) => s.trim()).filter(Boolean) as RsvpStatus[];
      setLocalRsvps(prev => {
        if (JSON.stringify(prev[key]) === JSON.stringify(statuses)) return prev;
        return { ...prev, [key]: statuses };
      });
    };
    window.addEventListener('rsvp-updated', handler);
    return () => window.removeEventListener('rsvp-updated', handler);
  }, []);

  /* close dropdowns on outside click */
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (internalRef.current && !internalRef.current.contains(e.target as Node)) setInternalOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  /* RSVP helpers */
  const getEffectiveRsvp = useCallback((eventId: number, attendeeId: number): RsvpStatus[] => {
    const key = `${eventId}:${attendeeId}`;
    if (key in localRsvps) return localRsvps[key];
    const ev = events.find(e => e.id === eventId);
    const r = ev?.rsvps?.find(r => r.attendee_id === attendeeId);
    return r ? parseStatuses(r.rsvp_status) : [];
  }, [localRsvps, events]);

  const handleToggleRsvp = useCallback(async (eventId: number, attendeeId: number, status: RsvpStatus) => {
    const key = `${eventId}:${attendeeId}`;
    const current = localRsvps[key] ?? ((): RsvpStatus[] => {
      const ev = events.find(e => e.id === eventId);
      const r = ev?.rsvps?.find(r => r.attendee_id === attendeeId);
      return r ? parseStatuses(r.rsvp_status) : [];
    })();
    const next = current.includes(status) ? current.filter(s => s !== status) : [...current, status];
    setLocalRsvps(prev => ({ ...prev, [key]: next }));
    window.dispatchEvent(new CustomEvent('rsvp-updated', { detail: { eventId, attendeeId, rsvpStatus: next.length > 0 ? next.join(',') : 'maybe' } }));
    try {
      const res = await fetch(`/api/social-events/${eventId}/rsvp`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ attendee_id: attendeeId, rsvp_status: next.length > 0 ? next.join(',') : 'maybe' }),
      });
      if (!res.ok) throw new Error();
    } catch {
      setLocalRsvps(prev => { const n = { ...prev }; delete n[key]; return n; });
      toast.error('Failed to save RSVP');
    }
  }, [localRsvps, events]);

  /* form helpers */
  const resetForm = () => {
    setFormData({ entered_by: '', internal_attendees: [], event_name: '', event_type: '', host: '', venue_name: '', location: '', company_hosted: false, event_date: '', event_time: '', invite_only: 'No', prospect_attendees: [], notes: '' });
    setEditingEventId(null);
    setShowForm(false);
  };

  const handleEdit = (ev: SocialEvent) => {
    setFormData({
      entered_by: ev.entered_by || '',
      internal_attendees: ev.internal_attendees ? ev.internal_attendees.split(',').map(n => n.trim()).filter(Boolean) : [],
      event_name: ev.event_name || '',
      event_type: ev.event_type || '',
      host: ev.host || '',
      venue_name: ev.venue_name || '',
      location: ev.location || '',
      company_hosted: Boolean(ev.company_hosted),
      event_date: ev.event_date || '',
      event_time: ev.event_time || '',
      invite_only: ev.invite_only || 'No',
      prospect_attendees: ev.prospect_attendees ? ev.prospect_attendees.split(',').map(n => n.trim()).filter(Boolean) : [],
      notes: ev.notes || '',
    });
    setEditingEventId(ev.id);
    setShowForm(true);
  };

  const handleSubmit = async () => {
    if (!formData.event_name.trim()) {
      toast.error('Event Name is required.');
      return;
    }
    setIsSubmitting(true);
    try {
      const payload = {
        conference_id: conferenceId,
        entered_by: formData.entered_by || null,
        internal_attendees: formData.internal_attendees.length > 0 ? formData.internal_attendees.join(',') : null,
        event_name: formData.event_name.trim(),
        event_type: formData.event_type || null,
        host: formData.host || null,
        venue_name: formData.venue_name || null,
        location: formData.location || null,
        company_hosted: formData.company_hosted,
        event_date: formData.event_date || null,
        event_time: formData.event_time || null,
        invite_only: formData.invite_only,
        prospect_attendees: formData.prospect_attendees.length > 0 ? formData.prospect_attendees.join(',') : null,
        notes: formData.notes || null,
      };
      const isEditing = editingEventId !== null;
      const res = await fetch(isEditing ? `/api/social-events/${editingEventId}` : '/api/social-events', {
        method: isEditing ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error();

      if (!isEditing && formData.notes?.trim()) {
        const label = formData.event_type ? `[${formData.event_type}]` : '[Social Event]';
        const attLabel = `[${conferenceName} | ${formData.event_type || 'Social Event'} | ${formData.host || 'N/A'}]`;
        const promises: Promise<unknown>[] = [
          fetch('/api/notes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ entity_type: 'conference', entity_id: conferenceId, content: `${label} ${formData.notes.trim()}`, conference_name: conferenceName, rep: formData.entered_by || null }) }),
        ];
        for (const idStr of formData.prospect_attendees) {
          const att = attendees.find(a => a.id === parseInt(idStr, 10));
          if (!att) continue;
          promises.push(fetch('/api/notes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ entity_type: 'attendee', entity_id: att.id, content: `${attLabel} ${formData.notes.trim()}`, conference_name: conferenceName, rep: formData.entered_by || null }) }));
          if (att.company_id) promises.push(fetch('/api/notes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ entity_type: 'company', entity_id: att.company_id, content: `[${att.first_name} ${att.last_name}] ${label} ${formData.notes.trim()}`, conference_name: conferenceName, rep: formData.entered_by || null }) }));
        }
        await Promise.allSettled(promises);
      }

      toast.success(isEditing ? 'Social event updated.' : 'Social event added.');
      resetForm();
      onRefresh();
    } catch {
      toast.error('Failed to save social event.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRemoveGuest = useCallback(async (eventId: number, attendeeId: number) => {
    if (!confirm('Remove this attendee from the guest list?')) return;
    try {
      const res = await fetch(`/api/social-events/${eventId}/guest`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ attendee_id: attendeeId }),
      });
      if (!res.ok) throw new Error();
      toast.success('Removed from guest list.');
      onRefresh();
    } catch {
      toast.error('Failed to remove from guest list.');
    }
  }, [onRefresh]);

  const handleDelete = async (eventId: number) => {
    if (!confirm('Delete this social event? This cannot be undone.')) return;
    try {
      const res = await fetch(`/api/social-events/${eventId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error();
      toast.success('Social event deleted.');
      onRefresh();
    } catch {
      toast.error('Failed to delete social event.');
    }
  };

  /* per-event invited attendees + rsvp map */
  const getEventData = (ev: SocialEvent) => {
    const ids = parseRepIds(ev.prospect_attendees);
    const invited = ids.map(id => attendees.find(a => a.id === id)).filter(Boolean) as Attendee[];
    const rsvpMap: Record<number, RsvpStatus[]> = {};
    for (const a of invited) rsvpMap[a.id] = getEffectiveRsvp(ev.id, a.id);
    return { invited, rsvpMap };
  };

  return (
    <div className="card">
      {/* header */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-brand-primary font-serif">Social Events</h2>
        {!showForm && (
          <button type="button" onClick={() => { setEditingEventId(null); setFormData(p => ({ ...p, entered_by: user?.displayName || '' })); setShowForm(true); }} className="flex items-center gap-1.5 text-sm text-brand-secondary hover:text-brand-primary font-medium transition-colors">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" /></svg>
            Add Social Event
          </button>
        )}
      </div>

      {/* form */}
      {showForm && (
        <div className="mb-5 p-4 bg-blue-50 border border-brand-secondary rounded-xl">
          <div className="flex items-center justify-between gap-3 mb-3">
            <p className="text-sm font-semibold text-brand-primary">{editingEventId ? 'Edit Social Event' : 'New Social Event'}</p>
            {/* Marks an event the account hosts or sponsors. Separate from
                event_type, since a Dinner can also be company-hosted. */}
            <label className="flex items-center gap-2 cursor-pointer flex-shrink-0">
              <input
                type="checkbox"
                checked={formData.company_hosted}
                onChange={e => setFormData(p => ({ ...p, company_hosted: e.target.checked }))}
                className="accent-brand-secondary w-4 h-4 flex-shrink-0"
              />
              <span className="text-xs font-semibold text-gray-600 whitespace-nowrap">
                <span className="sm:hidden">Company Hosted</span>
                <span className="hidden sm:inline">Company Hosted / Sponsored</span>
              </span>
            </label>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-3">

            {/* Entered By */}
            <div>
              <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1">Entered By</label>
              <select value={formData.entered_by} onChange={e => setFormData(p => ({ ...p, entered_by: e.target.value }))} className="input-field text-sm w-full">
                <option value="">Select user...</option>
                {userOptions.map(u => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>

            {/* Internal Attendees */}
            <div ref={internalRef}>
              <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1">Internal Attendees</label>
              <div className="relative">
                <button type="button" onClick={() => setInternalOpen(v => !v)} className="input-field w-full text-left flex items-center justify-between text-sm">
                  <span className={formData.internal_attendees.length === 0 ? 'text-gray-400' : 'text-gray-800'}>{formData.internal_attendees.length === 0 ? 'Select...' : `${formData.internal_attendees.length} selected`}</span>
                  <svg className={`w-4 h-4 text-gray-400 transition-transform ${internalOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                </button>
                {internalOpen && (
                  <div className="absolute z-30 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-56 overflow-y-auto">
                    {userOptions.map(opt => {
                      const checked = formData.internal_attendees.includes(opt);
                      return (
                        <button key={opt} type="button" onClick={() => setFormData(p => ({ ...p, internal_attendees: checked ? p.internal_attendees.filter(v => v !== opt) : [...p.internal_attendees, opt] }))} className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 flex items-center gap-2">
                          <span className={`w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center ${checked ? 'bg-brand-secondary border-brand-secondary' : 'border-gray-300'}`}>{checked && <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}</span>
                          {opt}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
              {formData.internal_attendees.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1">
                  {formData.internal_attendees.map(v => (
                    <span key={v} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-brand-secondary border border-blue-200">
                      {v}
                      <button type="button" onClick={() => setFormData(p => ({ ...p, internal_attendees: p.internal_attendees.filter(x => x !== v) }))} className="hover:text-red-500"><svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Event Name */}
            <div>
              <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1">Event Name <span className="text-red-500">*</span></label>
              <input
                type="text"
                value={formData.event_name}
                onChange={e => setFormData(p => ({ ...p, event_name: e.target.value }))}
                placeholder="Enter event name..."
                className="input-field text-sm w-full"
              />
            </div>

            {/* Type */}
            <div>
              <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1">Type</label>
              <select value={formData.event_type} onChange={e => setFormData(p => ({ ...p, event_type: e.target.value }))} className="input-field text-sm w-full">
                <option value="">Select type...</option>
                {eventTypeOptions.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>

            {/* Host */}
            <div>
              <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1">Host</label>
              {/* Free text with company suggestions — hosts are often a venue,
                  a partner or a co-sponsor that isn't a company on record, so
                  the list can't be exhaustive. A native datalist gives the
                  dropdown without constraining the value. */}
              <input
                type="text"
                list="social-event-host-options"
                value={formData.host}
                onChange={e => setFormData(p => ({ ...p, host: e.target.value }))}
                placeholder="Select a company or type a host…"
                className="input-field text-sm w-full"
                autoComplete="off"
              />
              <datalist id="social-event-host-options">
                {companies.map(c => <option key={c.id} value={c.name} />)}
              </datalist>
            </div>

            {/* Venue Name — captured separately because a Places result's
                formatted_address never carries the venue's name. */}
            <div>
              <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1">Venue Name</label>
              <input
                type="text"
                value={formData.venue_name}
                onChange={e => setFormData(p => ({ ...p, venue_name: e.target.value }))}
                placeholder="e.g. The Bellagio"
                className="input-field text-sm w-full"
              />
            </div>

            {/* Address */}
            <div>
              <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1">Address</label>
              {/* Same Places-backed lookup as the conference Location field.
                  Only formatted_address is kept — social_events has no columns
                  for the lat/lng/timezone the details call also returns. */}
              <LocationAutocompleteInput
                value={formData.location}
                onChange={v => setFormData(p => ({ ...p, location: v }))}
                onSelect={details => setFormData(p => ({ ...p, location: details.formatted_address }))}
                placeholder="e.g., The Bellagio, Las Vegas, NV"
                className="input-field text-sm w-full"
              />
            </div>

            {/* Date */}
            <div>
              <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1">Date</label>
              <input type="date" value={formData.event_date} onChange={e => setFormData(p => ({ ...p, event_date: e.target.value }))} className="input-field text-sm w-full" />
            </div>

            {/* Time */}
            <div>
              <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1">Time</label>
              <input type="time" value={formData.event_time} onChange={e => setFormData(p => ({ ...p, event_time: e.target.value }))} className="input-field text-sm w-full" />
            </div>

            {/* Invite Only */}
            <div>
              <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1">Invite Only?</label>
              <select value={formData.invite_only} onChange={e => setFormData(p => ({ ...p, invite_only: e.target.value }))} className="input-field text-sm w-full">
                <option value="No">No</option>
                <option value="Yes">Yes</option>
              </select>
            </div>

            {/* Invited Attendees — Build Guest List */}
            <div className="sm:col-span-2 lg:col-span-1">
              <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1">Invited</label>
              <button
                type="button"
                onClick={() => setShowGuestListModal(true)}
                className="input-field w-full text-left flex items-center gap-2 text-sm text-brand-secondary hover:text-brand-primary font-medium transition-colors"
              >
                <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                Build Guest List
                {formData.prospect_attendees.length > 0 && (
                  <span className="ml-auto px-2 py-0.5 rounded-full bg-brand-secondary text-white text-xs font-semibold">
                    {formData.prospect_attendees.length}
                  </span>
                )}
              </button>
            </div>
          </div>

          {/* Notes */}
          <div className="mb-3">
            <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1">Notes</label>
            <textarea value={formData.notes} onChange={e => setFormData(p => ({ ...p, notes: e.target.value }))} placeholder="Enter notes..." className="input-field resize-none w-full text-sm" rows={3} />
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={handleSubmit} disabled={isSubmitting} className="btn-primary text-sm">{isSubmitting ? 'Saving...' : editingEventId ? 'Update Event' : 'Add Event'}</button>
            <button type="button" onClick={resetForm} className="btn-secondary text-sm">Cancel</button>
          </div>
        </div>
      )}

      {/* Guest List Modal */}
      {showGuestListModal && (
        <GuestListModal
          attendees={attendees}
          selected={formData.prospect_attendees}
          onConfirm={ids => setFormData(p => ({ ...p, prospect_attendees: ids }))}
          onClose={() => setShowGuestListModal(false)}
          icpCompanyTypes={icpCompanyTypes}
        />
      )}

      {events.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-6">No social events yet. Click &quot;Add Social Event&quot; to get started.</p>
      ) : (
        <div className="space-y-2">
          {events.map(ev => {
            const { invited, rsvpMap } = getEventData(ev);
            const isExpanded = expandedEventId === ev.id;
            const dateText = formatDate(ev.event_date);
            const timeText = formatTime(ev.event_time);
            const when = [dateText, timeText].filter(t => t && t !== '—').join(' · ');
            const addr = (ev.location || '').trim();
            const locText = displayLocation(ev.venue_name, addr);
            return (
              <div key={ev.id} className="border border-gray-200 rounded-xl bg-white overflow-hidden hover:border-gray-300 transition-colors">
                {/* ── Header: event name + date/time pill, actions right ── */}
                <div className="flex items-start gap-2 px-3 py-3 sm:gap-3 sm:px-4">
                  <div className="flex-1 min-w-0">
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() => toggleEvent(ev.id)}
                      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') toggleEvent(ev.id); }}
                      className="flex items-center gap-2 flex-wrap min-w-0 text-left cursor-pointer"
                    >
                      <svg className={`w-4 h-4 text-gray-400 flex-shrink-0 transition-transform ${isExpanded ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                      <span className="text-sm font-semibold text-gray-800 truncate">{ev.event_name || ev.event_type || 'Social Event'}</span>
                    </div>

                    {/* Date then invited count, on their own row under the name */}
                    {(when || invited.length > 0) && (
                      <div className="flex items-center gap-2 flex-wrap mt-1.5 pl-6">
                        {when && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-brand-secondary/10 text-brand-secondary border border-brand-secondary/30 whitespace-nowrap flex-shrink-0">
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                            </svg>
                            {when}
                          </span>
                        )}
                        {invited.length > 0 && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-green-100 text-green-700 whitespace-nowrap flex-shrink-0">
                            {invited.length} invited
                          </span>
                        )}
                      </div>
                    )}

                    {/* Company-hosted marker gets its own row beneath */}
                    {ev.company_hosted && (
                      <div className="flex items-center mt-1.5 pl-6">
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-600 whitespace-nowrap" title="Hosted or sponsored by your company">
                          <svg className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor">
                            <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.286 3.958a1 1 0 00.95.69h4.162c.969 0 1.371 1.24.588 1.81l-3.367 2.446a1 1 0 00-.363 1.118l1.286 3.957c.3.922-.755 1.688-1.538 1.118l-3.366-2.445a1 1 0 00-1.176 0l-3.366 2.445c-.783.57-1.838-.196-1.538-1.118l1.286-3.957a1 1 0 00-.363-1.118L2.005 9.385c-.783-.57-.38-1.81.588-1.81h4.162a1 1 0 00.95-.69l1.286-3.958z" />
                          </svg>
                          Company Hosted
                        </span>
                      </div>
                    )}

                    {/* ── Meta row: 2-up on mobile, inline from sm ── */}
                    {/* Mobile stacks into three bands — Location, then
                        Type/Host/Invite Only, then the attendee pills. The
                        sm:contents wrappers dissolve at sm+ so the desktop row
                        stays a single flex line. */}
                    <div className="mt-2.5 space-y-2 sm:pl-6 sm:space-y-0 sm:flex sm:flex-wrap sm:gap-x-8 sm:gap-y-2">
                      <CardField label="Location">
                        {locText ? (
                          <a
                            href={mapsHref(addr || locText)}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={e => e.stopPropagation()}
                            title={locText}
                            className="text-brand-secondary hover:underline break-words"
                          >
                            {locText}
                          </a>
                        ) : <span className="text-gray-400">—</span>}
                      </CardField>
                      <div className="grid grid-cols-[1fr_1fr_auto] gap-x-3 sm:contents">
                        <CardField label="Type">{ev.event_type || <span className="text-gray-400">—</span>}</CardField>
                        <CardField label="Host">{ev.host || <span className="text-gray-400">—</span>}</CardField>
                        <CardField label="Invite Only">{ev.invite_only === 'Yes' ? 'Yes' : 'No'}</CardField>
                      </div>
                      <CardField label="Internal Attendees"><InternalRepPills internalAttendees={ev.internal_attendees} /></CardField>
                      {customColumns.filter(c => c.visible).length > 0 && (
                        <div className="grid grid-cols-[1fr_1fr_auto] gap-x-3 sm:contents">
                          {customColumns.filter(c => c.visible).map(col => (
                            <CardField key={`custom_${col.id}`} label={col.label}>
                              <CustomColumnCell column={col} value={(ev as unknown as Record<string, unknown>)[col.data_key]} />
                            </CardField>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button type="button" onClick={() => handleEdit(ev)} className="text-gray-300 hover:text-brand-secondary transition-colors p-1" title="Edit">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                    </button>
                    <button type="button" onClick={() => handleDelete(ev.id)} className="text-gray-300 hover:text-red-500 transition-colors p-1" title="Delete">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                    </button>
                  </div>
                </div>

                {/* ── Expanded: RSVP table, unchanged ── */}
                {isExpanded && (
                  <div className="border-t border-gray-200 hidden sm:block">
                    {invited.length > 0 ? (
                      <RSVPExpansion
                        event={ev}
                        invitedAttendees={invited}
                        rsvpMap={rsvpMap}
                        onToggleRsvp={(aid, st) => handleToggleRsvp(ev.id, aid, st)}
                        onRemoveGuest={aid => handleRemoveGuest(ev.id, aid)}
                        colorMaps={colorMaps}
                        companies={companies}
                        userOptionsFull={userOptionsFull}
                        icpCompanyTypes={icpCompanyTypes}
                      />
                    ) : (
                      <p className="text-xs text-gray-400 px-4 py-3">No guests invited yet.</p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Mobile guest list overlay */}
      {guestListEventId !== null && (() => {
        const ev = events.find(e => e.id === guestListEventId);
        if (!ev) return null;
        const { invited, rsvpMap } = getEventData(ev);
        return (
          <GuestListSheet event={ev} invitedAttendees={invited} rsvpMap={rsvpMap} onToggleRsvp={(aid, s) => handleToggleRsvp(ev.id, aid, s)} onRemoveGuest={aid => handleRemoveGuest(ev.id, aid)} onClose={() => setGuestListEventId(null)} colorMaps={colorMaps} companies={companies} userOptionsFull={userOptionsFull} icpCompanyTypes={icpCompanyTypes} />
        );
      })()}
    </div>
  );
}

