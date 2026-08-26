'use client';

import { useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { ScrollRow } from '@/components/ScrollRow';
import { AttendeeInitialsAvatar } from '@/components/AttendeePhoto';
import { NotesPopover } from '@/components/NotesPopover';
import { getBadgeClass, formatStatusLabel, getPreset } from '@/lib/colors';
import { effectiveSeniority } from '@/lib/parsers';
import { parseRepIds, getRepInitials, type UserOption } from '@/lib/useUserOptions';

/** The shape the card reads. Deliberately loose — both callers hand it rows
 *  straight from the conference API. */
export interface AttendeeCardRow {
  id: number;
  first_name: string;
  last_name: string;
  title?: string | null;
  seniority?: string | null;
  status?: string | null;
  photo_url?: string | null;
  company_id?: number | null;
  company_name?: string | null;
  company_type?: string | null;
  company_assigned_user?: string | null;
  conference_count?: number | string | null;
  conference_names?: string | null;
  entity_notes_count?: number | string | null;
  created_at?: string | null;
}

function fmtDate(dateStr?: string | null): string {
  if (!dateStr) return '—';
  try {
    const d = new Date(dateStr.endsWith('Z') || dateStr.includes('+') ? dateStr : dateStr + 'Z');
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch { return '—'; }
}

/**
 * The conference count, with the conference names on tap. Lives here rather
 * than in the conference page so the attendees drawer can show the same thing.
 */
export function ConferenceCountTooltip({ count, names }: { count: number; names?: string }) {
  const [pos, setPos] = useState<{ top: number; left: number; width: number; above: boolean } | null>(null);
  const ref = useRef<HTMLSpanElement>(null);
  const list = names ? names.split(',').map(n => n.trim()).filter(Boolean) : [];

  const open = () => {
    const el = ref.current;
    if (!el || list.length === 0) return;
    const r = el.getBoundingClientRect();
    const above = r.top > window.innerHeight / 2;
    setPos({ top: above ? r.top - 8 : r.bottom + 8, left: r.left, width: 220, above });
  };

  return (
    <>
      <span
        ref={ref}
        onMouseEnter={open}
        onMouseLeave={() => setPos(null)}
        onClick={e => { e.stopPropagation(); pos ? setPos(null) : open(); }}
        className={`inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-blue-50 text-blue-700 text-xs font-medium ${list.length ? 'cursor-pointer' : ''}`}
      >
        {count}
      </span>
      {pos && typeof document !== 'undefined' && createPortal(
        <div
          style={{ position: 'fixed', top: pos.above ? undefined : pos.top, bottom: pos.above ? window.innerHeight - pos.top : undefined, left: pos.left, width: pos.width, zIndex: 80 }}
          className="rounded-lg border border-gray-200 bg-white shadow-xl p-2 text-xs text-gray-700 space-y-0.5"
        >
          {list.map(n => <p key={n} className="truncate">{n}</p>)}
        </div>,
        document.body,
      )}
    </>
  );
}

/**
 * One attendee, as the conference details attendees tab shows them on a phone.
 * Shared so the dashboard's Attendees drawer shows the same card rather than a
 * lookalike that drifts from it.
 */
export function MobileAttendeeCard({
  attendee, showPhotos, selected, onToggleSelect, onOpenAttendee, onOpenCompany,
  onClassifyTitle, titleWarning = false, userOptions, colorMaps, actions, dimmed = false,
}: {
  attendee: AttendeeCardRow;
  showPhotos: boolean;
  selected: boolean;
  onToggleSelect?: (id: number) => void;
  onOpenAttendee: (id: number) => void;
  onOpenCompany: (id: number) => void;
  /** Omitted where retitling isn't offered — the title then renders as text. */
  onClassifyTitle?: (id: number, title: string) => void;
  titleWarning?: boolean;
  userOptions: UserOption[];
  colorMaps: Record<string, Record<string, string | null>>;
  /** Row actions menu, pinned to the end of the pill row. */
  actions?: ReactNode;
  /** Another card's actions menu is open — recede so that one stands out. */
  dimmed?: boolean;
}) {
  const seniority = effectiveSeniority(attendee.seniority ?? undefined, attendee.title ?? undefined);
  const statuses = (attendee.status || '').split(',').map(s => s.trim()).filter(s => s && s !== 'Unknown');

  return (
    <div className={`px-4 py-4 transition-opacity ${selected ? 'bg-blue-50' : 'bg-white'} ${dimmed ? 'opacity-40' : ''}`}>
      {/* Name / title / company share a column so the photo can sit alongside
          all three rather than only the name. */}
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0 flex-1">
              {onToggleSelect && (
                <input
                  type="checkbox"
                  checked={selected}
                  onChange={() => onToggleSelect(attendee.id)}
                  className="accent-brand-secondary flex-shrink-0"
                />
              )}
              <button
                type="button"
                onClick={() => onOpenAttendee(attendee.id)}
                className="font-semibold text-brand-secondary hover:underline text-sm truncate text-left"
              >
                {attendee.first_name} {attendee.last_name}
              </button>
            </div>
          </div>

          {attendee.title && (
            <div className={`flex items-center gap-1 mt-1 ${onToggleSelect ? 'ml-6' : ''}`}>
              {onClassifyTitle ? (
                <button
                  type="button"
                  onClick={() => onClassifyTitle(attendee.id, attendee.title!)}
                  className="text-xs text-gray-500 hover:text-brand-secondary text-left"
                >
                  {attendee.title}
                </button>
              ) : (
                <span className="text-xs text-gray-500">{attendee.title}</span>
              )}
              {titleWarning && (
                <span className="text-amber-500 flex-shrink-0 pointer-events-none">
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" /></svg>
                </span>
              )}
            </div>
          )}

          {attendee.company_name && (
            <div className={`mt-1 flex items-center gap-1.5 flex-wrap ${onToggleSelect ? 'ml-6' : ''}`}>
              {attendee.company_id ? (
                <button
                  type="button"
                  onClick={() => onOpenCompany(attendee.company_id!)}
                  className="text-xs text-gray-700 hover:text-brand-secondary hover:underline text-left"
                >
                  {attendee.company_name}
                </button>
              ) : (
                <span className="text-xs text-gray-700">{attendee.company_name}</span>
              )}
              {/* Whoever owns the company, in the initialled pill used for reps
                  everywhere else. */}
              {parseRepIds(attendee.company_assigned_user ?? '')
                .map(rid => userOptions.find(u => u.id === rid))
                .filter((u): u is UserOption => Boolean(u))
                .map(user => (
                  <span
                    key={user.id}
                    title={user.value}
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap flex-shrink-0 ${getPreset(colorMaps.user?.[user.value]).badgeClass}`}
                  >
                    <svg className="w-3 h-3 opacity-70 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                    {getRepInitials(user.value)}
                  </span>
                ))}
            </div>
          )}
        </div>

        {showPhotos && (
          <AttendeeInitialsAvatar
            name={`${attendee.first_name} ${attendee.last_name}`}
            photoUrl={attendee.photo_url ?? null}
            title={attendee.title ?? null}
            companyName={attendee.company_name ?? null}
            className="w-11 h-11 text-xs"
          />
        )}
      </div>

      {/* Everything else rides one scrolling line, company type first. The
          actions menu sits at the end of that line and stays put — the pills
          pass behind it rather than pushing it off the edge. */}
      <div className={`mt-2 flex items-center gap-2 ${onToggleSelect ? 'ml-6' : ''}`}>
      <ScrollRow className="flex-1 min-w-0" gapClass="gap-2">
        {attendee.company_type && (
          <span className={`${getBadgeClass(attendee.company_type, colorMaps.company_type || {})} text-xs flex-shrink-0 whitespace-nowrap`}>{attendee.company_type}</span>
        )}
        {statuses.map(s => (
          <span key={s} className={`${getBadgeClass(s, colorMaps.status || {})} flex-shrink-0 whitespace-nowrap`}>{formatStatusLabel(s)}</span>
        ))}
        <span className={`${getBadgeClass(seniority, colorMaps.seniority || {})} inline-flex items-center gap-1 flex-shrink-0 whitespace-nowrap`}>
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
          {seniority}
        </span>
        <span className="inline-flex items-center gap-1 flex-shrink-0 whitespace-nowrap">
          <svg className="w-3 h-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
          <ConferenceCountTooltip count={Number(attendee.conference_count ?? 0)} names={attendee.conference_names ?? undefined} />
        </span>
        {Number(attendee.entity_notes_count ?? 0) > 0 && (
          <span className="flex-shrink-0">
            <NotesPopover attendeeId={attendee.id} notesCount={Number(attendee.entity_notes_count)} />
          </span>
        )}
        {attendee.created_at && (
          <span className="text-[11px] text-gray-400 flex-shrink-0 whitespace-nowrap">Added {fmtDate(attendee.created_at)}</span>
        )}
      </ScrollRow>
      {actions && <div className="flex-shrink-0">{actions}</div>}
      </div>
    </div>
  );
}
