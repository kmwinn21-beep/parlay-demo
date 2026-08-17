'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ScrollRow } from '@/components/ScrollRow';
import { getPreset } from '@/lib/colors';
import { useConfigColors } from '@/lib/useConfigColors';
import { getRepInitials } from '@/lib/useUserOptions';

/**
 * The pieces a social event card is built from. Shared so the Social tab in
 * conference details and the Social Events tab in the pre-conference review
 * render the same card instead of drifting apart.
 */

export function formatEventDate(d: string | null) {
  if (!d) return '—';
  return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function formatEventTime(t: string | null) {
  if (!t) return '—';
  const [h, m] = t.split(':');
  const hour = parseInt(h, 10);
  return `${hour % 12 || 12}:${m} ${hour >= 12 ? 'PM' : 'AM'}`;
}

/** 'Sep 23, 2026 · 7:00 PM' — the date pill's text, time omitted when unset. */
export function formatEventWhen(date: string | null, time: string | null) {
  return [formatEventDate(date), formatEventTime(time)].filter(t => t && t !== '—').join(' · ');
}

/**
 * Google Places returns "3600 S Las Vegas Blvd, Las Vegas, NV 89109, USA".
 * Only formatted_address is stored, so the venue name isn't recoverable —
 * the trailing ", USA" is dropped instead to keep the pill readable.
 */
export function displayLocation(venueName: string | null, address: string): string {
  const addr = address.replace(/,\s*USA\s*$/i, '').trim();
  const venue = (venueName ?? '').trim();
  return [venue, addr].filter(Boolean).join(', ');
}

export function mapsHref(location: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location)}`;
}

/** Eyebrow label with its value beneath, used across the card's meta row. */
export function CardField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-0.5 whitespace-nowrap">{label}</p>
      <div className="text-xs text-gray-700 min-w-0">{children}</div>
    </div>
  );
}

/**
 * "Company Hosted" marker, shown after the event name in the card header.
 * The label is dropped below sm — there is no room for it beside a long
 * name — so the tooltip and the screen-reader copy carry it there.
 */
export function CompanyHostedStar({ className }: { className?: string }) {
  return (
    <span
      className={`items-center gap-1 text-[11px] font-semibold text-amber-600 whitespace-nowrap flex-shrink-0 ${className ?? ''}`}
      title="Hosted or sponsored by your company"
    >
      <svg className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor">
        <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.286 3.958a1 1 0 00.95.69h4.162c.969 0 1.371 1.24.588 1.81l-3.367 2.446a1 1 0 00-.363 1.118l1.286 3.957c.3.922-.755 1.688-1.538 1.118l-3.366-2.445a1 1 0 00-1.176 0l-3.366 2.445c-.783.57-1.838-.196-1.538-1.118l1.286-3.957a1 1 0 00-.363-1.118L2.005 9.385c-.783-.57-.38-1.81.588-1.81h4.162a1 1 0 00.95-.69l1.286-3.958z" />
      </svg>
      <span className="hidden sm:inline">Company Hosted</span>
      <span className="sr-only">Company Hosted</span>
    </span>
  );
}

/** The date (and time) pill that sits under the card's header row. */
export function EventDatePill({ when }: { when: string }) {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-brand-secondary/10 text-brand-secondary border border-brand-secondary/30 whitespace-nowrap flex-shrink-0">
      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
      </svg>
      {when}
    </span>
  );
}

/** Location value for the meta row — a Google Maps link, or a dash. */
export function EventLocationLink({ venueName, location }: { venueName: string | null; location: string | null }) {
  const addr = (location ?? '').trim();
  const text = displayLocation(venueName, addr);
  if (!text) return <span className="text-gray-400">—</span>;
  return (
    <a
      href={mapsHref(addr || text)}
      target="_blank"
      rel="noopener noreferrer"
      onClick={e => e.stopPropagation()}
      title={text}
      className="text-brand-secondary hover:underline break-words"
    >
      {text}
    </a>
  );
}

/**
 * Internal attendees as the abbreviated rep pills used in the company tables.
 * They sit on one line rather than wrapping — on a narrow card that would eat
 * several rows — so the row scrolls horizontally when it overflows, with
 * chevrons appearing on either side once there is somewhere to scroll to.
 */
export function InternalRepPills({ internalAttendees }: { internalAttendees: string | null }) {
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

/**
 * The card header + meta row shared by both social event surfaces. The caller
 * supplies whatever belongs to its own context — row actions, the expanded
 * body — and this lays out the parts every surface shows the same way.
 */
export function SocialEventCardBody({
  eventName, eventType, host, venueName, location, eventDate, eventTime,
  companyHosted, inviteOnly, internalAttendees, invitedCount,
  isExpanded, onToggle, actions, extraFields,
}: {
  eventName: string | null;
  eventType: string | null;
  host: string | null;
  venueName: string | null;
  location: string | null;
  eventDate: string | null;
  eventTime: string | null;
  companyHosted: boolean;
  inviteOnly: string | null;
  internalAttendees: string | null;
  invitedCount: number;
  isExpanded: boolean;
  onToggle: () => void;
  actions?: React.ReactNode;
  extraFields?: React.ReactNode;
}) {
  const when = formatEventWhen(eventDate, eventTime);

  return (
    <div className="flex items-start gap-2 px-3 py-3 sm:gap-3 sm:px-4">
      <div className="flex-1 min-w-0">
        <div
          role="button"
          tabIndex={0}
          onClick={onToggle}
          onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') onToggle(); }}
          /* No wrap — the name truncates instead, so the star
             stays on the header line. */
          className="flex items-center gap-2 min-w-0 text-left cursor-pointer"
        >
          <svg className={`w-4 h-4 text-gray-400 flex-shrink-0 transition-transform ${isExpanded ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
          <span className="text-sm font-semibold text-gray-800 truncate min-w-0">{eventName || eventType || 'Social Event'}</span>
          {companyHosted && <CompanyHostedStar className="inline-flex ml-1.5" />}
        </div>

        {/* Padding matches the meta row below (none on mobile,
            sm:pl-6 to clear the chevron) so the pill's left edge
            lines up with the Location eyebrow. */}
        {when && (
          <div className="flex items-center gap-2 flex-wrap mt-1.5 sm:pl-6">
            <EventDatePill when={when} />
          </div>
        )}

        {/* ── Meta row: 2-up on mobile, inline from sm ── */}
        <div className="mt-2.5 space-y-2 sm:pl-6 sm:space-y-0 sm:flex sm:flex-wrap sm:gap-x-8 sm:gap-y-2">
          <CardField label="Location">
            <EventLocationLink venueName={venueName} location={location} />
          </CardField>
          {/* Below sm these share one scrolling line rather than wrapping to
              two grid rows; from sm they join the inline meta row. */}
          <ScrollRow className="sm:hidden" gapClass="gap-x-6">
            <span className="flex-shrink-0"><CardField label="Type">{eventType || <span className="text-gray-400">—</span>}</CardField></span>
            <span className="flex-shrink-0"><CardField label="Host">{host || <span className="text-gray-400">—</span>}</CardField></span>
            <span className="flex-shrink-0"><CardField label="# Invited">{invitedCount > 0 ? invitedCount : <span className="text-gray-400">—</span>}</CardField></span>
            <span className="flex-shrink-0"><CardField label="Invite Only">{inviteOnly === 'Yes' ? 'Yes' : 'No'}</CardField></span>
          </ScrollRow>
          <div className="hidden sm:contents">
            <CardField label="Type">{eventType || <span className="text-gray-400">—</span>}</CardField>
            <CardField label="Host">{host || <span className="text-gray-400">—</span>}</CardField>
            <CardField label="# Invited">{invitedCount > 0 ? invitedCount : <span className="text-gray-400">—</span>}</CardField>
            <CardField label="Invite Only">{inviteOnly === 'Yes' ? 'Yes' : 'No'}</CardField>
          </div>
          <CardField label="Internal Attendees"><InternalRepPills internalAttendees={internalAttendees} /></CardField>
          {extraFields}
        </div>
      </div>
      {actions}
    </div>
  );
}

/**
 * The card's action menu — a dark-gray kebab that opens Edit / Delete (and,
 * below sm, Notes, since the notes icon button is desktop-only there).
 */
export function CardActionMenu({ onEdit, onDelete, onNotes, noteCount }: {
  onEdit: () => void;
  onDelete: () => void;
  onNotes?: () => void;
  noteCount?: number;
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

  const itemCls = 'w-full text-left px-3 py-2 text-xs font-medium flex items-center gap-2 transition-colors';

  return (
    <div ref={wrapRef} className="relative flex-shrink-0">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        title="Actions"
        aria-haspopup="menu"
        aria-expanded={open}
        className={`p-1.5 rounded-lg transition-colors ${open ? 'bg-gray-100 text-gray-700' : 'text-gray-600 hover:text-gray-800 hover:bg-gray-100'}`}
      >
        <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
          <path d="M10 6a1.5 1.5 0 110-3 1.5 1.5 0 010 3zm0 5.5a1.5 1.5 0 110-3 1.5 1.5 0 010 3zm0 5.5a1.5 1.5 0 110-3 1.5 1.5 0 010 3z" />
        </svg>
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-full mt-1 z-30 w-36 bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden">
          {onNotes && (
            // Desktop has its own notes icon button beside the kebab, so this
            // entry only earns its place on mobile.
            <button type="button" role="menuitem" onClick={() => { setOpen(false); onNotes(); }} className={`${itemCls} text-gray-700 hover:bg-gray-50 sm:hidden`}>
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h8m-8 4h5m1 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              Notes
              {!!noteCount && noteCount > 0 && (
                <span className="ml-auto text-[10px] font-semibold text-brand-secondary">{noteCount}</span>
              )}
            </button>
          )}
          <button type="button" role="menuitem" onClick={() => { setOpen(false); onEdit(); }} className={`${itemCls} text-gray-700 hover:bg-gray-50`}>
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
            Edit
          </button>
          <button type="button" role="menuitem" onClick={() => { setOpen(false); onDelete(); }} className={`${itemCls} text-red-600 hover:bg-red-50`}>
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
            Delete
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * Circular notes button that sits left of the kebab on desktop. The count
 * bubble in its upper-left corner shows how many notes the event has.
 */
export function CardNotesButton({ count, onClick }: { count: number; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={count > 0 ? `${count} note${count === 1 ? '' : 's'}` : 'Notes'}
      className="relative hidden sm:flex flex-shrink-0 w-8 h-8 rounded-full border border-gray-200 text-gray-500 hover:text-brand-secondary hover:border-brand-secondary/40 hover:bg-brand-secondary/5 transition-colors items-center justify-center"
    >
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h8m-8 4h5m1 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
      {count > 0 && (
        <span className="absolute -top-1 -left-1 min-w-[16px] h-4 px-1 rounded-full bg-brand-secondary text-white text-[9px] font-bold flex items-center justify-center">
          {count > 99 ? '99+' : count}
        </span>
      )}
    </button>
  );
}
