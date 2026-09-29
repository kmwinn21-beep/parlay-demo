'use client';

import { useState, useRef, useEffect, useLayoutEffect, useCallback, Fragment } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { QuickViewDrawer, type QuickViewTarget } from '@/components/QuickViewDrawer';
import { getPreset, getHex, type ColorMap } from '@/lib/colors';
import { MEETING_TIME_OPTIONS, formatMeetingTime } from '@/lib/meetingTime';
import { AttendeeInitialsAvatar } from '@/components/AttendeePhoto';
import { useConfigColors } from '@/lib/useConfigColors';
import { RepMultiSelect } from '@/components/RepMultiSelect';
import { useUser } from '@/components/UserContext';
import { OverlappingRepPills } from '@/components/OverlappingRepPills';
import { NotesPopoverCard } from '@/components/NotesPopoverCard';
import { MobileCard, MobileCardList } from '@/components/MobileCardList';
import { CARD_TABLE, CARD_TABLE_SCROLL, CARD_TABLE_WRAP, SelectionCell, cardEmphasisClass, cardRowClass, useCardFocus } from '@/components/tableCards';
import { AssignFollowUpDialog } from '@/components/AssignFollowUpDialog';
import { AdditionalAttendeesModal, AdditionalAttendeesButton } from '@/components/AdditionalAttendeesModal';
import {
  type UserOption,
  parseRepIds,
  resolveRepNames,
  resolveRepInitials,
  getRepInitials,
} from '@/lib/useUserOptions';
import { useTableColumnConfig, useCustomColumns } from '@/lib/useTableColumnConfig';
import { CustomColumnCell } from './CustomColumnCell';
import { ScrollRow } from '@/components/ScrollRow';
import { useAvgCostPerUnit } from '@/lib/useAvgCostPerUnit';
import { useUnitTypeLabel } from '@/lib/useUnitTypeLabel';
import type { AdditionalAttendeeRecord } from '@/lib/additionalAttendees';
import { announceNoteSaved } from '@/lib/suggestions/announce';

export interface Meeting {
  id: number;
  attendee_id: number;
  conference_id: number;
  meeting_date: string;
  meeting_time: string;
  location: string | null;
  scheduled_by: string | null;
  /** Which of scheduled_by came from Additional Attendees rather than the Rep field. */
  support_rep_ids?: string | null;
  additional_attendees: string | null;
  /** CSV of attendee ids picked off the conference roster. */
  additional_attendee_ids?: string | null;
  additional_attendee_records?: AdditionalAttendeeRecord[];
  /** Set when the list was fetched for an attendee who is a guest on this
   *  meeting rather than its subject — the row gets an AA badge. */
  as_additional_attendee?: boolean;
  outcome: string | null;
  meeting_type: string | null;
  created_at: string;
  first_name: string;
  last_name: string;
  photo_url?: string | null;
  title: string | null;
  company_id: number | null;
  company_name: string | null;
  company_wse: number | null;
  conference_name: string;
  has_notes?: boolean;
  /** Notes logged against this attendee for this meeting's conference. */
  conference_note_count?: number;
}

/** Circular marker for a row the viewer only attends as a guest. */
function AdditionalAttendeeBadge() {
  return (
    <span
      title="Additional Attendee"
      className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-brand-secondary/10 text-brand-secondary border border-brand-secondary/30 text-[9px] font-bold flex-shrink-0 cursor-help"
    >
      AA
    </span>
  );
}

type SortKey = 'name' | 'title' | 'scheduled_by' | 'company' | 'datetime' | 'conference' | 'meeting_type' | 'outcome';

function formatMeetingDate(d: string) {
  if (!d) return '';
  return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/** "Monday, Aug 17" — the day-section heading. */
function formatGroupDate(d: string) {
  return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
}


/** Render initials pills for a stored scheduled_by value (CSV of IDs or legacy name) */
function RepPills({
  scheduledBy,
  userOptions,
  size = 'sm',
  withIcon = false,
}: {
  scheduledBy: string | null;
  userOptions: UserOption[];
  size?: 'sm' | 'xs';
  /** Leads each pill with the user glyph, as the mobile card does. */
  withIcon?: boolean;
}) {
  const colorMaps = useConfigColors();
  const users = parseRepIds(scheduledBy).map(id => userOptions.find(u => u.id === id)).filter(Boolean);
  if (users.length === 0) return <span className="text-gray-300">—</span>;

  const baseClass =
    size === 'xs'
      ? 'inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium whitespace-nowrap'
      : 'inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium whitespace-nowrap';

  return (
    <span className="inline-flex flex-wrap gap-1">
      {users.map((user, i) => (
        <span key={i} className={`${baseClass} gap-1 ${getPreset(colorMaps.user?.[user!.value]).badgeClass}`}>
          {withIcon && (
            <svg className="w-3 h-3 opacity-70 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
          )}
          {getRepInitials(user!.value)}
        </span>
      ))}
    </span>
  );
}

/** The rep who booked the meeting — the first id on scheduled_by. */
function bookingRepId(scheduledBy: string | null | undefined): number | null {
  return parseRepIds(scheduledBy)[0] ?? null;
}

/**
 * The two internal columns, split.
 *
 * scheduled_by is the whole internal roster; support_rep_ids marks which of
 * them were added under Additional Attendees rather than chosen in the Rep
 * field. Reps are therefore everyone who isn't support — which leaves a
 * deliberately-picked second rep in the Rep column, where it used to be
 * demoted to Support for being second in the list.
 */
function splitInternalIds(m: { scheduled_by: string | null; support_rep_ids?: string | null }): {
  repIds: string | null;
  supportIds: string | null;
} {
  const all = parseRepIds(m.scheduled_by);
  const support = parseRepIds(m.support_rep_ids).filter(id => all.includes(id));
  const reps = all.filter(id => !support.includes(id));
  return {
    repIds: reps.length > 0 ? reps.join(',') : null,
    supportIds: support.length > 0 ? support.join(',') : null,
  };
}

/** "$1.2M" / "$600K" — the card has no room for the full figure. */
function abbreviateValue(total: number): string {
  if (total >= 1_000_000) return `$${(total / 1_000_000).toFixed(total >= 10_000_000 ? 0 : 1).replace(/\.0$/, '')}M`;
  if (total >= 1_000) return `$${Math.round(total / 1_000)}K`;
  return `$${total}`;
}

/** Initials for a free-text attendee name: "Jane External" -> "JE". */
function nameInitials(name: string): string {
  return name.trim().split(/\s+/).filter(Boolean).map(p => p[0]).slice(0, 2).join('').toUpperCase();
}

/**
 * Location, additional attendees and company value for the mobile card — one
 * scrolling line, since three pills rarely fit a phone.
 */
/**
 * The Title column, closed and hovered.
 *
 * Narrow enough to leave room for Location beside it; wide enough hovered that
 * all but the longest titles finish. Declared rather than written into the
 * class list twice, because the transition runs BETWEEN these two numbers and
 * two numbers that happen to agree today are two numbers that stop agreeing.
 */
/** How close the outcome menu may come to the edge of the screen. */
const MENU_MARGIN = 8;

const TITLE_WIDTH = 150;
const TITLE_HOVER_WIDTH = 420;

/** The label above every value on the mobile card. Declared once so they match. */
const EYEBROW = 'text-[9px] uppercase tracking-wide text-gray-400 font-medium mb-1';

/**
 * The text size every pill on the mobile card is set in.
 *
 * Declared rather than written out at each one: Type is a plain rounded tag
 * and Location is a bordered pill, so they share no class list — but they sit
 * on the same row under matching labels, and a row of values at two sizes
 * reads as two kinds of thing.
 */
const PILL_TEXT = 'text-[10px]';

/** The pill shape the mobile card's values share. */
const DETAIL_PILL = `inline-flex items-center gap-1 px-2 py-0.5 rounded-full ${PILL_TEXT} font-medium whitespace-nowrap border`;

function LocationIcon() {
  return (
    <svg className="w-3 h-3 opacity-70 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a2 2 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  );
}

/**
 * Only the typed-in guest names.
 *
 * Guests picked off the conference roster get their own name-and-title row on
 * the card, so a pill for them repeats what is already a line above it.
 */
function mobileGuests(m: Meeting): string[] {
  return (m.additional_attendees || '').split(',').map(n => n.trim()).filter(Boolean);
}

/**
 * Conference days, in order, plus booth hours.
 *
 * Not taken from the config presets: those are picked to read as pill fills,
 * and several (yellow especially) are too light to serve as text on their own
 * wash, which is what a group heading needs.
 */
const DAY_COLORS = ['#d97706', '#16a34a', '#1B76BC', '#ea580c', '#dc2626'];
const BOOTH_HOURS_COLOR = '#7c3aed';

/** How long the expanded names stay up before folding back. */
const ACTIONS_MENU_WIDTH = 160;

/** Row actions — the notetaker and edit entries the icons used to carry. */
function MeetingActionsMenu({ hasNotes, hasConferenceNotes, onNotes, onQuickNote, onViewNotes, onEdit }: {
  hasNotes: boolean;
  /** Notes already logged against this attendee for this conference — the
   *  button flags them so the menu is worth opening. */
  hasConferenceNotes?: boolean;
  onNotes?: () => void;
  onQuickNote?: () => void;
  /** Passed the button's viewport rect so the notes card can hang off it. */
  onViewNotes?: (anchor: DOMRect) => void;
  onEdit: () => void;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  // The menu renders in a portal so a table with only a row or two can't clip
  // it against the bottom of its scroll container; that means positioning it
  // against the button's viewport rect by hand.
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  const position = useCallback(() => {
    const el = wrapRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    // Roughly two 33px items plus borders; enough to decide on flipping.
    const height = 41 + (onNotes ? 33 : 0) + (onQuickNote ? 33 : 0) + (onViewNotes ? 33 : 0);
    const flip = window.innerHeight - r.bottom - 8 < height && r.top - 8 > height;
    setPos({
      top: flip ? r.top - 4 - height : r.bottom + 4,
      left: Math.max(8, Math.min(r.right - ACTIONS_MENU_WIDTH, window.innerWidth - ACTIONS_MENU_WIDTH - 8)),
    });
  }, [onNotes, onQuickNote, onViewNotes]);

  useEffect(() => {
    if (!open) { setPos(null); return; }
    position();
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (wrapRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    const onScroll = () => position();
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onEsc);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onScroll);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onEsc);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onScroll);
    };
  }, [open, position]);

  const itemCls = 'w-full text-left px-3 py-2 text-xs font-medium flex items-center gap-2 text-gray-700 hover:bg-gray-50 transition-colors';

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        title="Actions"
        aria-haspopup="menu"
        aria-expanded={open}
        className={`relative p-1 rounded transition-colors ${
          open ? 'bg-gray-100 text-gray-700'
            : hasConferenceNotes ? 'bg-green-50 text-green-700 hover:bg-green-100'
            : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
        }`}
      >
        <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
          <path d="M10 6a1.5 1.5 0 110-3 1.5 1.5 0 010 3zm0 5.5a1.5 1.5 0 110-3 1.5 1.5 0 010 3zm0 5.5a1.5 1.5 0 110-3 1.5 1.5 0 010 3z" />
        </svg>
        {/* There's something to read in here — no count, just a nudge. */}
        {hasConferenceNotes && (
          <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-green-600 ring-2 ring-white" />
        )}
      </button>
      {open && mounted && pos && createPortal(
        <div
          ref={menuRef}
          role="menu"
          style={{ position: 'fixed', top: pos.top, left: pos.left, width: ACTIONS_MENU_WIDTH }}
          className="z-[10000] bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden"
        >
          {onViewNotes && (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                // The card hangs off the kebab, not off the menu item, which
                // is about to be unmounted.
                const anchor = wrapRef.current?.getBoundingClientRect();
                setOpen(false);
                if (anchor) onViewNotes(anchor);
              }}
              className={itemCls}
            >
              <span className="relative inline-flex flex-shrink-0">
                <svg className={`w-3.5 h-3.5 ${hasConferenceNotes ? 'text-green-600' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h6m-6 4h10M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2z" />
                </svg>
                {hasConferenceNotes && <span className="absolute -top-1 -right-1 w-1.5 h-1.5 rounded-full bg-green-600" />}
              </span>
              View Notes
            </button>
          )}
          {onQuickNote && (
            <button type="button" role="menuitem" onClick={() => { setOpen(false); onQuickNote(); }} className={itemCls}>
              <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              Add Note
            </button>
          )}
          {onNotes && (
            <button type="button" role="menuitem" onClick={() => { setOpen(false); onNotes(); }} className={itemCls}>
              <span className="relative inline-flex flex-shrink-0">
                <svg className={`w-3.5 h-3.5 ${hasNotes ? 'text-green-600' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                {hasNotes && <span className="absolute -top-1 -right-1 w-1.5 h-1.5 rounded-full bg-green-500" />}
              </span>
              Notetaker
            </button>
          )}
          <button type="button" role="menuitem" onClick={() => { setOpen(false); onEdit(); }} className={itemCls}>
            <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
            Edit
          </button>
        </div>,
        document.body
      )}
    </div>
  );
}

/**
 * Additional Attendees for the inline editor — a button that opens the picker
 * modal, since a dropdown wedged into a table row left no room to navigate.
 * Internal picks are routed into scheduled_by so the notetaker treats them as
 * Internal Attendees. Someone picked off the conference roster is kept by id,
 * which is what carries their photo and title onto the row and puts the meeting
 * on their own profile; a name that matches no record stays as free text in
 * additional_attendees.
 */
function EditAdditionalAttendees({
  meeting, userOptions, freeText, onFreeTextChange, internalIds, onInternalIdsChange,
  attendeeIds, onAttendeeIdsChange,
}: {
  meeting: Meeting;
  userOptions: UserOption[];
  freeText: string;
  onFreeTextChange: (v: string) => void;
  internalIds: number[];
  onInternalIdsChange: (ids: number[]) => void;
  attendeeIds: number[];
  onAttendeeIdsChange: (ids: number[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const freeTextCount = freeText.split(',').map(n => n.trim()).filter(Boolean).length;

  return (
    <>
      <AdditionalAttendeesButton
        count={attendeeIds.length + internalIds.length + freeTextCount}
        onClick={() => setOpen(true)}
      />
      {open && (
        <AdditionalAttendeesModal
          conferenceId={meeting.conference_id}
          primaryAttendeeId={meeting.attendee_id}
          primaryCompanyId={meeting.company_id}
          userOptions={userOptions}
          attendeeIds={attendeeIds}
          onAttendeeIdsChange={onAttendeeIdsChange}
          internalIds={internalIds}
          onInternalIdsChange={onInternalIdsChange}
          freeText={freeText}
          onFreeTextChange={onFreeTextChange}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

function OutcomeButton({
  value,
  options,
  colorMap,
  onChange,
}: {
  value: string | null;
  options: string[];
  colorMap: ColorMap;
  onChange: (val: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [dropdownPos, setDropdownPos] = useState<{ top: number; left: number; above: boolean } | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  /*
   * Pull the menu back inside the viewport.
   *
   * It opens left-aligned under the pill, which on a phone puts half of it off
   * the right edge — the Status pill sits at the end of its row, and the menu
   * is wider than the pill. Clamped AFTER it renders rather than against a
   * guessed width: the widest option decides how wide it is, and that is the
   * account's own wording.
   *
   * No loop: once clamped the measurement agrees with the state and the
   * effect stops setting it.
   */
  useLayoutEffect(() => {
    if (!open || !dropdownPos) return;
    const el = menuRef.current;
    if (!el) return;
    const width = el.getBoundingClientRect().width;
    const clamped = Math.max(MENU_MARGIN, Math.min(dropdownPos.left, window.innerWidth - width - MENU_MARGIN));
    if (clamped !== dropdownPos.left) setDropdownPos(p => (p ? { ...p, left: clamped } : p));
  }, [open, dropdownPos]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const handleToggle = () => {
    if (!open && btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      const above = spaceBelow < 200 && rect.top > 200;
      setDropdownPos({ top: above ? rect.top : rect.bottom + 4, left: rect.left, above });
    }
    setOpen(o => !o);
  };

  const preset = value ? getPreset(colorMap[value]) : null;
  const btnClass = preset
    ? `${preset.pillClass} px-2.5 py-1 rounded-full text-xs font-semibold cursor-pointer whitespace-nowrap`
    : 'bg-gray-100 text-gray-500 border border-gray-300 px-2.5 py-1 rounded-full text-xs font-semibold cursor-pointer whitespace-nowrap';

  return (
    <div ref={ref} className="relative inline-block">
      {/* The chevron only appears under the pointer: at rest the pill reads as
          a value, and a caret on every row was noise. Hovering it says the
          value is a control. It grows from zero width rather than appearing,
          so the pill widens smoothly instead of the text jumping. */}
      <button
        ref={btnRef}
        type="button"
        className={`group ${btnClass}`}
        onClick={handleToggle}
        title="Change outcome"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        {value || '— Select —'}
        <span
          aria-hidden
          className={`inline-flex items-center overflow-hidden align-middle transition-all duration-200 ease-out ${
            open ? 'max-w-4 opacity-100 ml-1' : 'max-w-0 opacity-0 ml-0 group-hover:max-w-4 group-hover:opacity-100 group-hover:ml-1'
          }`}
        >
          <svg className={`w-3 h-3 flex-shrink-0 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
          </svg>
        </span>
      </button>
      {open && dropdownPos && (
        <div
          ref={menuRef}
          style={{
            position: 'fixed',
            top: dropdownPos.top,
            left: dropdownPos.left,
            zIndex: 9999,
            transform: dropdownPos.above ? 'translateY(-100%)' : 'translateY(0)',
          }}
          /* Never wider than the screen it has to fit on, so the clamp above
             always has somewhere to put it. */
          className="bg-white rounded-lg shadow-lg border border-gray-200 py-1 min-w-[160px] max-w-[calc(100vw-1rem)]"
        >
          <button
            type="button"
            className="w-full text-left px-3 py-1.5 text-xs text-gray-400 hover:bg-gray-50"
            onClick={() => { onChange(''); setOpen(false); }}
          >
            — Clear —
          </button>
          {options.map(opt => {
            const p = getPreset(colorMap[opt]);
            return (
              <button
                key={opt}
                type="button"
                className="w-full text-left px-3 py-1.5 text-xs hover:bg-gray-50 flex items-center gap-2"
                onClick={() => { onChange(opt); setOpen(false); }}
              >
                <span className="inline-block w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: p.swatch }} />
                <span className={opt === value ? 'font-semibold' : ''}>{opt}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export interface EditFormData {
  meeting_date: string;
  meeting_time: string;
  location: string;
  scheduled_by: string;
  /** Which of scheduled_by are support rather than reps. */
  support_rep_ids: string;
  additional_attendees: string;
  /** Roster picks, kept by id so the row and their profile can show them. */
  additional_attendee_ids: string;
  meeting_type: string;
}

function EditMeetingRow({
  meeting,
  onSave,
  onCancel,
  onDelete,
  userOptions = [],
  meetingTypeOptions = [],
}: {
  meeting: Meeting;
  onSave: (meetingId: number, data: EditFormData) => void;
  onCancel: () => void;
  onDelete?: (meetingId: number) => void;
  userOptions?: UserOption[];
  meetingTypeOptions?: string[];
}) {
  const [form, setForm] = useState({
    meeting_date: meeting.meeting_date,
    meeting_time: meeting.meeting_time,
    location: meeting.location || '',
    additional_attendees: meeting.additional_attendees || '',
    meeting_type: meeting.meeting_type || '',
  });
  const [selectedRepIds, setSelectedRepIds] = useState<number[]>(() =>
    parseRepIds(splitInternalIds(meeting).repIds)
  );
  // Internal people added through the attendees picker. They save into
  // scheduled_by with the reps, which is where the notetaker reads them from,
  // and are listed again on support_rep_ids so the Rep column doesn't claim
  // them. Seeded from that split rather than from scheduled_by, or reopening
  // the form would promote every one of them to a rep.
  const [additionalInternalIds, setAdditionalInternalIds] = useState<number[]>(() =>
    parseRepIds(splitInternalIds(meeting).supportIds)
  );
  const [additionalAttendeeIds, setAdditionalAttendeeIds] = useState<number[]>(
    () => parseRepIds(meeting.additional_attendee_ids)
  );

  const inputClass = 'w-full border border-gray-300 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-brand-secondary focus:border-brand-secondary bg-white';

  const handleSave = () => {
    onSave(meeting.id, {
      ...form,
      scheduled_by: Array.from(new Set([...selectedRepIds, ...additionalInternalIds])).join(','),
      support_rep_ids: additionalInternalIds.filter(id => !selectedRepIds.includes(id)).join(','),
      additional_attendee_ids: additionalAttendeeIds.join(','),
    });
  };

  return (
    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-3">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-semibold text-gray-700">
          Editing meeting with {meeting.first_name} {meeting.last_name}
        </span>
      </div>
      {/* One column: this form also renders inside a 288px kanban card, where
          two columns squeezed every control down to nothing. */}
      <div className="grid grid-cols-1 gap-3">
        <div>
          <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1">Date *</label>
          <input type="date" className={inputClass} value={form.meeting_date} onChange={e => setForm(f => ({ ...f, meeting_date: e.target.value }))} required />
        </div>
        <div>
          <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1">Time *</label>
          <select className={inputClass} value={form.meeting_time} onChange={e => setForm(f => ({ ...f, meeting_time: e.target.value }))} required>
            <option value="">Select time...</option>
            {MEETING_TIME_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1">Location</label>
          <input type="text" className={inputClass} value={form.location} onChange={e => setForm(f => ({ ...f, location: e.target.value }))} placeholder="e.g. Room 201, Lobby" />
        </div>
        <div>
          <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1">Meeting Type</label>
          <select className={inputClass} value={form.meeting_type} onChange={e => setForm(f => ({ ...f, meeting_type: e.target.value }))}>
            <option value="">— None —</option>
            {meetingTypeOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1">Scheduled By</label>
          <RepMultiSelect
            options={userOptions}
            selectedIds={selectedRepIds}
            onChange={setSelectedRepIds}
            placeholder="Select reps..."
          />
        </div>
        <div>
          <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1">Additional Attendees</label>
          <EditAdditionalAttendees
            meeting={meeting}
            userOptions={userOptions}
            freeText={form.additional_attendees}
            onFreeTextChange={v => setForm(f => ({ ...f, additional_attendees: v }))}
            internalIds={additionalInternalIds}
            onInternalIdsChange={setAdditionalInternalIds}
            attendeeIds={additionalAttendeeIds}
            onAttendeeIdsChange={setAdditionalAttendeeIds}
          />
        </div>
      </div>
      <div className="flex items-center justify-between pt-1">
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="px-3 py-1.5 bg-brand-secondary text-white text-xs font-semibold rounded hover:bg-blue-700 transition-colors disabled:opacity-50"
            disabled={!form.meeting_date || !form.meeting_time}
            onClick={handleSave}
          >
            Save
          </button>
          <button
            type="button"
            className="px-3 py-1.5 bg-gray-200 text-gray-700 text-xs font-semibold rounded hover:bg-gray-300 transition-colors"
            onClick={onCancel}
          >
            Cancel
          </button>
        </div>
        {onDelete && (
          <button
            type="button"
            title="Delete meeting"
            aria-label="Delete meeting"
            className="p-1.5 rounded border border-red-200 bg-red-50 text-red-600 hover:bg-red-100 transition-colors"
            onClick={() => onDelete(meeting.id)}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}

function EditMeetingTableRow({
  meeting,
  onSave,
  onCancel,
  onDelete,
  colSpan,
  userOptions = [],
  meetingTypeOptions = [],
}: {
  meeting: Meeting;
  onSave: (meetingId: number, data: EditFormData) => void;
  onCancel: () => void;
  onDelete?: (meetingId: number) => void;
  colSpan: number;
  userOptions?: UserOption[];
  meetingTypeOptions?: string[];
}) {
  const [form, setForm] = useState({
    meeting_date: meeting.meeting_date,
    meeting_time: meeting.meeting_time,
    location: meeting.location || '',
    additional_attendees: meeting.additional_attendees || '',
    meeting_type: meeting.meeting_type || '',
  });
  const [selectedRepIds, setSelectedRepIds] = useState<number[]>(() =>
    parseRepIds(splitInternalIds(meeting).repIds)
  );
  // Internal people added through the attendees picker. They save into
  // scheduled_by with the reps, which is where the notetaker reads them from,
  // and are listed again on support_rep_ids so the Rep column doesn't claim
  // them. Seeded from that split rather than from scheduled_by, or reopening
  // the form would promote every one of them to a rep.
  const [additionalInternalIds, setAdditionalInternalIds] = useState<number[]>(() =>
    parseRepIds(splitInternalIds(meeting).supportIds)
  );
  const [additionalAttendeeIds, setAdditionalAttendeeIds] = useState<number[]>(
    () => parseRepIds(meeting.additional_attendee_ids)
  );

  const inputClass = 'w-full border border-gray-300 rounded px-1.5 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-brand-secondary focus:border-brand-secondary bg-white';

  const handleSave = () => {
    onSave(meeting.id, {
      ...form,
      scheduled_by: Array.from(new Set([...selectedRepIds, ...additionalInternalIds])).join(','),
      support_rep_ids: additionalInternalIds.filter(id => !selectedRepIds.includes(id)).join(','),
      additional_attendee_ids: additionalAttendeeIds.join(','),
    });
  };

  return (
    <tr className="bg-blue-50">
      <td colSpan={colSpan} className="px-3 py-3">
        <div className="space-y-2">
          <div className="flex items-center gap-1 mb-1">
            <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">
              Editing meeting with {meeting.first_name} {meeting.last_name}
            </span>
          </div>
          <div className="grid grid-cols-6 gap-2">
            <div>
              <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-0.5">Date *</label>
              <input type="date" className={inputClass} value={form.meeting_date} onChange={e => setForm(f => ({ ...f, meeting_date: e.target.value }))} />
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-0.5">Time *</label>
              <select className={inputClass} value={form.meeting_time} onChange={e => setForm(f => ({ ...f, meeting_time: e.target.value }))}>
                <option value="">Select time...</option>
                {MEETING_TIME_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-0.5">Meeting Type</label>
              <select className={inputClass} value={form.meeting_type} onChange={e => setForm(f => ({ ...f, meeting_type: e.target.value }))}>
                <option value="">— None —</option>
                {meetingTypeOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-0.5">Location</label>
              <input type="text" className={inputClass} value={form.location} onChange={e => setForm(f => ({ ...f, location: e.target.value }))} placeholder="e.g. Room 201" />
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-0.5">Scheduled By</label>
              <RepMultiSelect
                options={userOptions}
                selectedIds={selectedRepIds}
                onChange={setSelectedRepIds}
                placeholder="Select reps..."
              />
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-0.5">Add&apos;l Attendees</label>
              <EditAdditionalAttendees
                meeting={meeting}
                userOptions={userOptions}
                freeText={form.additional_attendees}
                onFreeTextChange={v => setForm(f => ({ ...f, additional_attendees: v }))}
                internalIds={additionalInternalIds}
                onInternalIdsChange={setAdditionalInternalIds}
                attendeeIds={additionalAttendeeIds}
                onAttendeeIdsChange={setAdditionalAttendeeIds}
              />
            </div>
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="px-2.5 py-1 bg-brand-secondary text-white text-xs font-semibold rounded hover:bg-blue-700 transition-colors disabled:opacity-50"
                disabled={!form.meeting_date || !form.meeting_time}
                onClick={handleSave}
              >
                Save
              </button>
              <button
                type="button"
                className="px-2.5 py-1 bg-gray-200 text-gray-700 text-xs font-semibold rounded hover:bg-gray-300 transition-colors"
                onClick={onCancel}
              >
                Cancel
              </button>
            </div>
            {onDelete && (
              <button
                type="button"
                className="px-2.5 py-1 bg-red-50 text-red-600 text-xs font-semibold rounded border border-red-200 hover:bg-red-100 transition-colors"
                onClick={() => onDelete(meeting.id)}
              >
                Delete Meeting
              </button>
            )}
          </div>
        </div>
      </td>
    </tr>
  );
}

/** Section header for one day's meetings — click to collapse the group. */
/** The count beside a group's name — a ring in the heading's own colour. */
function GroupCount({ count, color }: { count: number; color: string | null }) {
  return (
    <span
      className={`inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full border text-[10px] font-bold leading-none flex-shrink-0 ${
        color ? '' : 'border-gray-300 text-gray-500'
      }`}
      style={color ? { borderColor: color, color } : undefined}
    >
      {count}
    </span>
  );
}

function GroupHeader({ label, count, collapsed, onToggle, bare = false, color }: {
  label: string;
  count: number;
  collapsed: boolean;
  onToggle: () => void;
  /** Table variant: no background of its own, the row supplies it. */
  bare?: boolean;
  /** Hex of the pill this group is named after — the heading picks it up so a
   *  section reads as the same thing as the pills in its rows. */
  color?: string | null;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={!collapsed}
      // py-2.5 in both variants so a table heading stands the same height as a
      // kanban column's.
      className={`w-full flex items-center gap-2 text-left px-3 py-2.5 ${
        bare ? '' : `border-b border-gray-200 ${color ? '' : 'bg-gray-50'}`
      }`}
      style={!bare && color ? { backgroundColor: `${color}26` } : undefined}
    >
      <svg
        className={`w-3.5 h-3.5 flex-shrink-0 transition-transform ${collapsed ? '-rotate-90' : ''} ${color ? '' : 'text-gray-400'}`}
        style={color ? { color } : undefined}
        fill="none" stroke="currentColor" viewBox="0 0 24 24"
      >
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
      </svg>
      <span
        className={`text-xs font-semibold uppercase tracking-wider ${color ? '' : 'text-gray-600'}`}
        style={color ? { color } : undefined}
      >
        {label}
      </span>
      <GroupCount count={count} color={color ?? null} />
    </button>
  );
}

/**
 * One kanban column. Its header stays put and the cards scroll beneath it, so
 * a long column doesn't drag the whole board down with it — and every column
 * stands the same height whatever it holds.
 */
function KanbanColumn({ label, count, color, height, children }: {
  label: string;
  count: number;
  color: string | null;
  height: number | null;
  children: React.ReactNode;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  const [canUp, setCanUp] = useState(false);
  const [canDown, setCanDown] = useState(false);
  const update = useCallback(() => {
    const el = listRef.current;
    if (!el) return;
    setCanUp(el.scrollTop > 1);
    setCanDown(el.scrollTop + el.clientHeight < el.scrollHeight - 1);
  }, []);
  useEffect(() => {
    update();
    const el = listRef.current;
    if (!el) return;
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [update, height, children]);

  const nudge = (dir: -1 | 1) => listRef.current?.scrollBy({ top: dir * 180, behavior: 'smooth' });
  const arrow = 'absolute left-1/2 -translate-x-1/2 z-10 w-6 h-6 rounded-full bg-white border border-gray-200 shadow-sm text-gray-500 hover:text-gray-700 flex items-center justify-center transition-colors';

  return (
    <div
      className="w-72 flex-shrink-0 rounded-xl border border-gray-200 overflow-hidden flex flex-col"
      style={{ animation: 'meetingGroupIn 200ms ease-out', height: height ?? undefined }}
    >
      <div
        data-kanban-head
        className={`flex items-center gap-2 px-3 py-2.5 flex-shrink-0 ${color ? '' : 'bg-gray-50'}`}
        style={color ? { backgroundColor: `${color}26` } : undefined}
      >
        <span className={`text-xs font-semibold flex-1 truncate ${color ? '' : 'text-gray-600'}`} style={color ? { color } : undefined}>
          {label}
        </span>
        <GroupCount count={count} color={color} />
      </div>
      <div className="relative flex-1 min-h-0">
        {canUp && (
          <button type="button" onClick={() => nudge(-1)} title="Scroll up" className={`${arrow} top-1`}>
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 15l7-7 7 7" /></svg>
          </button>
        )}
        <div ref={listRef} onScroll={update} className="h-full overflow-y-auto scrollbar-hide bg-gray-50/50 p-2 space-y-2">
          {children}
        </div>
        {canDown && (
          <button type="button" onClick={() => nudge(1)} title="Scroll down" className={`${arrow} bottom-1`}>
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" /></svg>
          </button>
        )}
      </div>
    </div>
  );
}

export function MeetingsTable({
  meetings,
  actionOptions,
  colorMap,
  onOutcomeChange,
  onDelete,
  onEdit,
  onNotesClick,
  onBulkDelete,
  onBulkUpdate,
  userOptions = [],
  hideCompany = false,
  tableName = 'meetings',
  groupByDate = false,
  groupMode,
  onQuickNote,
  collapseAll,
  viewMode = 'table',
  cardsOnly = false,
  showConferencePill = false,
  showAttendeeAvatar = false,
}: {
  meetings: Meeting[];
  actionOptions: string[];
  colorMap: ColorMap;
  /** May resolve with the PATCH's response — when it names follow-ups the
   *  change created, the table offers to assign them. Callers that return
   *  nothing keep the old behaviour: the follow-up stays with whoever clicked. */
  onOutcomeChange: (meetingId: number, outcome: string) => void | Promise<{ auto_follow_up_ids?: number[] } | void>;
  onDelete?: (meetingId: number) => void;
  onEdit?: (meetingId: number, data: EditFormData) => void;
  onNotesClick?: (meetingId: number) => void;
  onBulkDelete?: (ids: number[]) => void;
  onBulkUpdate?: (ids: number[], field: 'scheduled_by' | 'meeting_type' | 'outcome', value: string) => void;
  userOptions?: UserOption[];
  hideCompany?: boolean;
  tableName?: string;
  /** Break the list into collapsible sections, one per meeting date. */
  groupByDate?: boolean;
  /** What the sections group on. Defaults to date when groupByDate is set. */
  groupMode?: 'date' | 'rep' | 'outcome';
  /** Opens a quick note pre-filled from the meeting. */
  onQuickNote?: (meeting: Meeting) => void;
  /** Bump the token to collapse (or expand) every section at once. */
  collapseAll?: { token: number; collapse: boolean };
  /** 'kanban' lays the mobile cards out in a column per group. */
  viewMode?: 'table' | 'kanban';
  /** Keep the mobile card layout at every width — for narrow containers. */
  cardsOnly?: boolean;
  /** Adds the conference name to the card's pill row. */
  showConferencePill?: boolean;
  /** Leads the name with the attendee's photo, or their initials. */
  showAttendeeAvatar?: boolean;
}) {
  const { isVisible, orderedColumns } = useTableColumnConfig(tableName);
  const customColumns = useCustomColumns(tableName);
  const [sortKey, setSortKey] = useState<SortKey>('datetime');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [editingId, setEditingId] = useState<number | null>(null);
  // The meeting card the reader has picked out; the rest recede behind it,
  // until it is clicked again or something outside the table is pressed.
  const { focusedId: focusedMeetingId, regionRef: meetingTableRef, onCardClick: onMeetingCardClick } = useCardFocus();
  const [quickView, setQuickView] = useState<QuickViewTarget | null>(null);
  // A follow-up the outcome change just created, waiting to be assigned.
  const [assignFollowUp, setAssignFollowUp] = useState<{ ids: number[]; meeting: Meeting; outcome: string } | null>(null);
  const [assigningFollowUp, setAssigningFollowUp] = useState(false);

  /** Runs the caller's handler, then offers to assign whatever it created. */
  const changeOutcome = async (m: Meeting, val: string) => {
    const res = await onOutcomeChange(m.id, val);
    const ids = res && 'auto_follow_up_ids' in res ? res.auto_follow_up_ids : undefined;
    // val, not m.outcome: the row still holds the outcome it had a moment ago.
    if (ids && ids.length > 0) setAssignFollowUp({ ids, meeting: m, outcome: val });
  };

  /** repIds null means "leave it with me" — the API already put it there. */
  const saveFollowUpAssignment = async (repIds: number[] | null, followUpAction: string, note: string) => {
    if (!assignFollowUp) return;
    const { meeting } = assignFollowUp;
    const patch: Record<string, unknown> = {};
    if (repIds !== null) patch.assigned_rep = repIds.join(',');
    if (followUpAction) patch.follow_up_action = followUpAction;
    const body = note.trim();
    // Assigning to myself with nothing else filled in leaves nothing to write.
    if (Object.keys(patch).length === 0 && !body) { setAssignFollowUp(null); return; }
    setAssigningFollowUp(true);
    try {
      const work: Promise<unknown>[] = [];
      if (Object.keys(patch).length > 0) {
        work.push(...assignFollowUp.ids.map(id => fetch('/api/follow-ups', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id, ...patch }),
        })));
      }
      if (body) {
        // Filed in all three places the same way the quick-note modal does it,
        // so it turns up wherever the reader happens to be looking. Whoever is
        // taking the follow-up is tagged; the attendee's copy carries the
        // notification, so the other two don't repeat it.
        const tagged = (repIds !== null && repIds.length > 0
          ? repIds
          : user?.configId != null ? [user.configId] : []).join(',') || null;
        const shared = {
          content: body,
          conference_name: meeting.conference_name || 'General Note',
          attendee_name: `${meeting.first_name} ${meeting.last_name}`.trim() || null,
          company_name: meeting.company_name ?? null,
          note_type: 'meeting_note',
          meeting_id: meeting.id,
        };
        const post = (extra: Record<string, unknown>) => fetch('/api/notes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...shared, ...extra }),
        });
        work.push(post({ entity_type: 'attendee', entity_id: meeting.attendee_id, tagged_users: tagged, skip_notification: false }));
        if (meeting.company_id) {
          work.push(post({ entity_type: 'company', entity_id: meeting.company_id, tagged_users: null, skip_notification: true }));
        }
        if (meeting.conference_id) {
          work.push(post({ entity_type: 'conference', entity_id: meeting.conference_id, tagged_users: null, skip_notification: true }));
        }
      }
      await Promise.all(work);
      if (body) announceNoteSaved('attendee', meeting.attendee_id);
      toast.success(body ? 'Follow-up assigned and note saved.' : 'Follow-up assigned.');
      setAssignFollowUp(null);
    } catch {
      toast.error('Failed to assign the follow-up.');
    } finally {
      setAssigningFollowUp(false);
    }
  };

  // The notes card opened from a row's kebab, and where it hangs from.
  const [notesView, setNotesView] = useState<{ meeting: Meeting; anchor: DOMRect } | null>(null);
  // What the card actually found, so adding a note lights the row's badge
  // without waiting for the list to be fetched again.
  const [noteCounts, setNoteCounts] = useState<Record<number, number>>({});
  const noteCount = useCallback(
    (m: Meeting) => noteCounts[m.attendee_id] ?? m.conference_note_count ?? 0,
    [noteCounts],
  );
  const [meetingTypeOptions, setMeetingTypeOptions] = useState<string[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  // Checkboxes stay out of the way until the table is being used: hovering it
  // offers them, and any selection keeps them out.
  const [checksHovered, setChecksHovered] = useState(false);
  const checksRevealed = checksHovered || selectedIds.size > 0;
  const [bulkRepIds, setBulkRepIds] = useState<number[]>([]);
  const tableColorMaps = useConfigColors();
  const kanbanScrollRef = useRef<HTMLDivElement>(null);
  /**
   * How tall a kanban column stands: room for five cards, measured off a real
   * card rather than guessed, since card height moves with what's on them.
   * Every column takes the same height, so the board reads as a board rather
   * than a row of ragged strips.
   */
  const KANBAN_TARGET_CARDS = 5;
  const [kanbanColumnH, setKanbanColumnH] = useState<number | null>(null);
  useEffect(() => {
    if (viewMode !== 'kanban') { setKanbanColumnH(null); return; }
    const measure = () => {
      const el = kanbanScrollRef.current;
      if (!el) return;
      const card = el.querySelector<HTMLElement>('[data-kanban-card]');
      const header = el.querySelector<HTMLElement>('[data-kanban-head]');
      const cardH = card?.getBoundingClientRect().height ?? 0;
      if (cardH <= 0) return;
      const headerH = header?.getBoundingClientRect().height ?? 0;
      // Clamped only against a pathologically tall card, not against the
      // five-card target itself — a lower cap quietly cost a card.
      const body = KANBAN_TARGET_CARDS * cardH + (KANBAN_TARGET_CARDS - 1) * 8 + 16;
      setKanbanColumnH(Math.round(headerH + Math.min(body, 1400)));
    };
    // Two frames: the first render has the columns but not yet their final
    // card heights, so measuring immediately reads zero.
    const id = requestAnimationFrame(() => requestAnimationFrame(measure));
    window.addEventListener('resize', measure);
    return () => { cancelAnimationFrame(id); window.removeEventListener('resize', measure); };
  }, [viewMode, groupMode, groupByDate, meetings.length]);
  // Keyed by mode + group key: a rep name and a date could collide, and
  // switching modes shouldn't inherit what was collapsed in the other one.
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const hasActions = !!onEdit;
  const hasSelection = !!(onBulkDelete || onBulkUpdate);
  const { user } = useUser();
  const avgCostPerUnit = useAvgCostPerUnit();
  const unitTypeLabel = useUnitTypeLabel();

  // Deleting a meeting belongs to the rep who booked it. Administrators keep
  // the ability to clean up, and meetings with nobody on scheduled_by have no
  // owner to defer to.
  const canDelete = useCallback((meeting: Meeting) => {
    const owner = bookingRepId(meeting.scheduled_by);
    if (owner == null || user?.role === 'administrator') return true;
    return user?.configId != null && user.configId === owner;
  }, [user]);

  useEffect(() => {
    fetch('/api/config?category=meeting_type', { cache: 'no-store' })
      .then(r => r.json())
      .then((data: { value: string }[]) => setMeetingTypeOptions(data.map(d => d.value)))
      .catch(() => {});
  }, []);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDir('asc'); }
  };

  const toggleSelect = (id: number) => setSelectedIds(prev => {
    const s = new Set(prev);
    if (s.has(id)) s.delete(id); else s.add(id);
    return s;
  });

  const handleBulkDelete = () => {
    const selected = meetings.filter(m => selectedIds.has(m.id));
    if (!selected.length || !onBulkDelete) return;
    const ids = selected.filter(canDelete).map(m => m.id);
    const blocked = selected.length - ids.length;
    if (!ids.length) {
      toast.error(`Only the rep who scheduled a meeting can delete it.`);
      return;
    }
    const suffix = blocked
      ? `\n\n${blocked} meeting${blocked > 1 ? 's' : ''} scheduled by someone else will be left alone.`
      : '';
    if (!confirm(`Delete ${ids.length} meeting${ids.length > 1 ? 's' : ''}? This cannot be undone.${suffix}`)) return;
    onBulkDelete(ids);
    setSelectedIds(new Set());
  };

  const handleBulkRepApply = () => {
    const ids = Array.from(selectedIds);
    if (!ids.length || !onBulkUpdate) return;
    onBulkUpdate(ids, 'scheduled_by', bulkRepIds.join(','));
    setBulkRepIds([]);
  };

  const handleBulkFieldUpdate = (field: 'meeting_type' | 'outcome', value: string) => {
    const ids = Array.from(selectedIds);
    if (!ids.length || !onBulkUpdate) return;
    onBulkUpdate(ids, field, value);
  };

  const sorted = [...meetings].sort((a, b) => {
    let cmp = 0;
    switch (sortKey) {
      case 'name':
        cmp = `${a.last_name} ${a.first_name}`.localeCompare(`${b.last_name} ${b.first_name}`);
        break;
      case 'title':
        cmp = (a.title || '').localeCompare(b.title || '');
        break;
      case 'scheduled_by':
        cmp = resolveRepNames(a.scheduled_by, userOptions).localeCompare(
          resolveRepNames(b.scheduled_by, userOptions)
        );
        break;
      case 'company':
        cmp = (a.company_name || '').localeCompare(b.company_name || '');
        break;
      case 'datetime':
        cmp = `${a.meeting_date} ${a.meeting_time}`.localeCompare(`${b.meeting_date} ${b.meeting_time}`);
        break;
      case 'conference':
        cmp = a.conference_name.localeCompare(b.conference_name);
        break;
      case 'meeting_type':
        cmp = (a.meeting_type || '').localeCompare(b.meeting_type || '');
        break;
      case 'outcome':
        cmp = (a.outcome || '').localeCompare(b.outcome || '');
        break;
    }
    return sortDir === 'asc' ? cmp : -cmp;
  });

  // Sections run oldest day first regardless of the column sort; the rows
  // inside each keep whatever order the sort asked for. Grouping by rep or
  // outcome keeps that shape and only changes what a section stands for.
  const mode = groupMode ?? (groupByDate ? 'date' : null);
  const groupedMeetings = mode
    ? (() => {
        const map = new Map<string, { label: string; rows: Meeting[] }>();
        const push = (key: string, label: string, m: Meeting) => {
          const entry = map.get(key);
          if (entry) entry.rows.push(m); else map.set(key, { label, rows: [m] });
        };
        for (const m of sorted) {
          if (mode === 'date') {
            const key = m.meeting_date ?? '';
            push(key, key ? formatGroupDate(key) : 'No date', m);
          } else if (mode === 'outcome') {
            const key = (m.outcome ?? '').trim();
            push(key, key || 'No outcome', m);
          } else {
            // A meeting with several reps belongs under each of them, so a rep
            // looking for their own meetings finds all of them in one section.
            const reps = parseRepIds(splitInternalIds(m).repIds)
              .map(id => userOptions.find(u => u.id === id)?.value)
              .filter((v): v is string => !!v);
            if (reps.length === 0) push('', 'Unassigned', m);
            else for (const name of reps) push(name, name, m);
          }
        }
        const entries = Array.from(map.entries());
        if (mode === 'date') {
          entries.sort((a, b) => (a[0] || '9999-12-31').localeCompare(b[0] || '9999-12-31'));
        } else if (mode === 'outcome') {
          // Configured order first, so outcomes read in the order the admin set
          // them; anything off the list (or blank) trails behind.
          const rank = (k: string) => { const i = actionOptions.indexOf(k); return i === -1 ? actionOptions.length + (k ? 0 : 1) : i; };
          entries.sort((a, b) => rank(a[0]) - rank(b[0]) || a[1].label.localeCompare(b[1].label));
        } else {
          // Unassigned last, everyone else alphabetical.
          entries.sort((a, b) => (a[0] ? 0 : 1) - (b[0] ? 0 : 1) || a[1].label.localeCompare(b[1].label));
        }
        return entries;
      })()
    : null;

  // Rep groups take the rep pill's colour, outcome groups the outcome pill's —
  // read from the same config maps the cells use, so they can't disagree.
  // Date groups run through the conference's days in order — first day amber,
  // then green, blue, orange, red — with booth hours purple wherever it lands.
  const dayColorByKey = new Map<string, string>();
  if (mode === 'date') {
    let day = 0;
    for (const [key, group] of groupedMeetings ?? []) {
      if (/booth\s*hours/i.test(group.label)) {
        dayColorByKey.set(key, BOOTH_HOURS_COLOR);
      } else if (key) {
        dayColorByKey.set(key, DAY_COLORS[day % DAY_COLORS.length]);
        day += 1;
      }
    }
  }
  const groupColor = (key: string): string | null => {
    if (mode === 'date') return dayColorByKey.get(key) ?? null;
    if (!key) return null;
    if (mode === 'rep') return getHex(key, tableColorMaps.user || {});
    if (mode === 'outcome') return getHex(key, colorMap);
    return null;
  };
  const groupKey = (key: string) => `${mode ?? 'none'}:${key}`;
  // Collapse/expand every section at once. Driven by a token rather than a
  // boolean so pressing the same option twice still takes effect, and read off
  // the groups actually on screen — the caller has no idea what they are.
  const groupKeysRef = useRef<string[]>([]);
  groupKeysRef.current = (groupedMeetings ?? []).map(([k]) => groupKey(k));
  const collapseToken = collapseAll?.token ?? 0;
  const collapseTarget = collapseAll?.collapse ?? false;
  useEffect(() => {
    if (!collapseToken) return;
    setCollapsedGroups(collapseTarget ? new Set(groupKeysRef.current) : new Set());
  }, [collapseToken, collapseTarget]);
  const isCollapsed = (key: string) => collapsedGroups.has(groupKey(key));
  const toggleGroup = (key: string) => setCollapsedGroups(prev => {
    const next = new Set(prev);
    const gk = groupKey(key);
    if (next.has(gk)) next.delete(gk); else next.add(gk);
    return next;
  });

  const allSelected = sorted.length > 0 && sorted.every(m => selectedIds.has(m.id));
  const someSelected = !allSelected && sorted.some(m => selectedIds.has(m.id));
  const toggleAll = () => setSelectedIds(allSelected ? new Set() : new Set(sorted.map(m => m.id)));

  const tableColSpan = (hideCompany ? 8 : 9) + (hasActions ? 1 : 0) + (hasSelection ? 1 : 0)
    + customColumns.filter(c => c.visible).length;

  const SortHeader = ({ label, col }: { label: string; col: SortKey }) => (
    <th
      className="px-3 py-2 text-left font-semibold text-gray-500 uppercase tracking-wider cursor-pointer select-none hover:text-gray-700"
      onClick={() => handleSort(col)}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {sortKey === col && (
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            {sortDir === 'asc'
              ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
              : <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />}
          </svg>
        )}
      </span>
    </th>
  );

  /**
   * The two values the mobile card computes from more than the meeting row.
   *
   * Closures rather than module helpers: both need something only this
   * component has — the account's cost per unit, and whether this list spans
   * conferences at all.
   */
  const mobileValue = (m: Meeting) =>
    m.company_wse != null && avgCostPerUnit > 0
      ? abbreviateValue(Math.round(m.company_wse * avgCostPerUnit))
      : null;
  const mobileConference = (m: Meeting) => (showConferencePill ? m.conference_name : null);

  const renderMobileCard = (m: Meeting) => (
      <div key={m.id} className="p-4 bg-white">
        {editingId === m.id && onEdit ? (
          <EditMeetingRow
            meeting={m}
            onSave={(id, data) => { onEdit(id, data); setEditingId(null); }}
            onCancel={() => setEditingId(null)}
            onDelete={onDelete && canDelete(m) ? (id) => { onDelete(id); setEditingId(null); } : undefined}
            userOptions={userOptions}
            meetingTypeOptions={meetingTypeOptions}
          />
        ) : (
          <>
            {/* Eyebrow: whose company this meeting is with, and the actions
                for it. The attendees below then read as people at that
                company rather than the company trailing them. */}
            {/* A long company name scrolls sideways under the kebab rather
                than being cut off by it — the kebab sits on the card's own
                background, so the name slides out of sight behind it. */}
            <div className="relative flex items-start mb-2 min-h-[1.25rem]">
              <div className={`min-w-0 flex-1 overflow-x-auto scrollbar-hide ${!hideCompany && m.company_wse != null ? 'pr-24' : 'pr-9'}`}>
                {!hideCompany && (m.company_name && m.company_id ? (
                  <button
                    type="button"
                    onClick={() => setQuickView({ type: 'company', id: m.company_id!, name: m.company_name! })}
                    className="block text-sm font-semibold text-brand-secondary hover:underline text-left whitespace-nowrap"
                  >
                    {m.company_name}
                  </button>
                ) : m.company_name ? (
                  <p className="text-sm font-semibold text-gray-500 whitespace-nowrap">{m.company_name}</p>
                ) : null)}
              </div>
              {/* The size of the company, beside its name — the one number a
                  rep sizes an account by, and on mobile it was only reachable
                  by opening the company. Part of the same opaque cluster the
                  kebab sits in, so a long name still slides away underneath
                  both rather than being cut off by either. */}
              {/*
               * The units pill and the kebab, in ONE cluster.
               *
               * Two separately positioned boxes meant guessing how wide the
               * kebab is to place the pill beside it, and the guess was short
               * — the pill lost its right edge behind the menu's border. Laid
               * out together they cannot overlap whatever either one measures.
               *
               * Opaque, and the name scrolls underneath: a long company name
               * slides out of sight behind this rather than being cut off.
               */}
              {((!hideCompany && m.company_wse != null) || onEdit || onNotesClick) && (
                <div className="absolute right-0 top-0 flex items-start gap-1.5 pl-1.5 bg-white">
                  {!hideCompany && m.company_wse != null && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-yellow-50 text-yellow-700 border border-yellow-200 whitespace-nowrap" title={`${Number(m.company_wse).toLocaleString()} ${unitTypeLabel}`}>
                      <svg className="w-3 h-3 text-yellow-600 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M2 18h20M4 18v-3a8 8 0 0116 0v3M12 3v2M4.93 7.93l1.41 1.41M19.07 7.93l-1.41 1.41" /></svg>
                      {Number(m.company_wse).toLocaleString()}
                    </span>
                  )}
                  {(onEdit || onNotesClick) && (
                    <MeetingActionsMenu
                      hasNotes={!!m.has_notes}
                      hasConferenceNotes={noteCount(m) > 0}
                      onNotes={onNotesClick ? () => onNotesClick(m.id) : undefined}
                      onQuickNote={onQuickNote ? () => onQuickNote(m) : undefined}
                      onViewNotes={anchor => setNotesView({ meeting: m, anchor })}
                      onEdit={() => setEditingId(m.id)}
                    />
                  )}
                </div>
              )}
            </div>
            <div className="flex items-start justify-between gap-3">
              {/* The primary attendee gets a face too — only their guests had
                  one, which read as though the guest were the subject. */}
              <AttendeeInitialsAvatar
                name={`${m.first_name} ${m.last_name}`.trim()}
                photoUrl={m.photo_url}
                title={m.title}
                companyName={m.company_name}
                className="w-6 h-6 text-[9px] mt-0.5 flex-shrink-0"
              />
              <div className="flex-1 min-w-0">
                {/* Names open the quick-view drawer rather than the full profile */}
                <span className="flex items-center gap-1.5 min-w-0">
                  <button
                    type="button"
                    onClick={() => setQuickView({ type: 'attendee', id: m.attendee_id, name: `${m.first_name} ${m.last_name}` })}
                    className="text-xs font-semibold text-brand-secondary hover:underline text-left truncate"
                  >
                    {m.first_name} {m.last_name}
                  </button>
                  {m.as_additional_attendee && <AdditionalAttendeeBadge />}
                </span>
                {m.title && <p className="text-xs font-semibold text-gray-500 mt-0.5">{m.title}</p>}
              </div>
            </div>
            {/* Guests and the company sit outside the name column, so their
                avatars start where the primary attendee's does and the company
                name lines up with both rather than being pushed in by it. */}
            {(m.additional_attendee_records ?? []).map(extra => (
              <div key={extra.id} className="flex items-center gap-3 mt-1.5 min-w-0">
                <AttendeeInitialsAvatar
                  name={`${extra.first_name} ${extra.last_name}`}
                  photoUrl={extra.photo_url}
                  title={extra.title}
                  companyName={extra.company_name}
                  className="w-6 h-6 text-[9px] flex-shrink-0"
                />
                <div className="min-w-0">
                  <p className="text-xs font-normal text-gray-600 truncate">{extra.first_name} {extra.last_name}</p>
                  {extra.title && <p className="text-xs font-normal text-gray-400 truncate">{extra.title}</p>}
                </div>
              </div>
            ))}

            {/*
             * The facts, in two labelled rows.
             *
             * These were scattered down the card — the time beside the type,
             * the location in a scrolling strip of pills, the status next to
             * the rep, the support badges below that — so answering "when,
             * where, and did it happen" meant reading the whole card. Each
             * value now sits under a word saying what it is.
             */}
            <div className="mt-3 flex items-start gap-3">
              <div className="flex-shrink-0">
                <p className={EYEBROW}>When</p>
                <p className="text-xs text-gray-600 whitespace-nowrap">
                  {formatMeetingDate(m.meeting_date)} at {formatMeetingTime(m.meeting_time)}
                </p>
              </div>
              <div className="min-w-0 flex-1">
                <p className={EYEBROW}>Where</p>
                {m.location ? (
                  <span className={`${DETAIL_PILL} bg-gray-50 text-gray-600 border-gray-200 max-w-full`} title={m.location}>
                    <LocationIcon />
                    <span className="truncate">{m.location}</span>
                  </span>
                ) : (
                  /* An empty slot that says what is missing and takes you where
                     to fix it, rather than a gap that reads as "no location
                     needed". Dashed, because it is a placeholder and not a
                     value. */
                  <button
                    type="button"
                    onClick={() => setEditingId(m.id)}
                    title="Set a location"
                    className={`${DETAIL_PILL} border-dashed border-gray-300 text-gray-400 hover:text-gray-600 hover:border-gray-400 transition-colors`}
                  >
                    <LocationIcon />
                    + Location
                  </button>
                )}
              </div>
              <div className="flex-shrink-0">
                <p className={EYEBROW}>Status</p>
                <OutcomeButton
                  value={m.outcome}
                  options={actionOptions}
                  colorMap={colorMap}
                  onChange={(val) => changeOutcome(m, val)}
                />
              </div>
            </div>

            {/*
             * Everything else, on one line that scrolls.
             *
             * The checkbox sits OUTSIDE the scrolling region: selecting rows is
             * the one thing here that has to work without finding it first, and
             * a checkbox that scrolls out of reach is a checkbox that is gone.
             * Support keeps its click-to-expand — the row is a ScrollRow, so
             * widening it pushes the rest along and the chevrons appear.
             */}
            {(splitInternalIds(m).repIds || splitInternalIds(m).supportIds || m.meeting_type
              || mobileValue(m) || mobileConference(m) || mobileGuests(m).length > 0 || hasSelection) && (
              <div className="mt-3 flex items-center gap-2">
                <ScrollRow className="flex-1 min-w-0" gapClass="gap-3" step={120}>
                  {splitInternalIds(m).repIds && (
                    <div className="flex-shrink-0">
                      <p className={EYEBROW}>Rep</p>
                      <RepPills scheduledBy={splitInternalIds(m).repIds} userOptions={userOptions} size="xs" withIcon />
                    </div>
                  )}
                  {splitInternalIds(m).supportIds && (
                    <div className="flex-shrink-0">
                      <p className={EYEBROW}>Support</p>
                      <OverlappingRepPills
                        repIds={splitInternalIds(m).supportIds}
                        userOptions={userOptions}
                        size="xs"
                        emptyLabel={null}
                      />
                    </div>
                  )}
                  {m.meeting_type && (
                    <div className="flex-shrink-0">
                      <p className={EYEBROW}>Type</p>
                      <span className={`${PILL_TEXT} text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded whitespace-nowrap`}>{m.meeting_type}</span>
                    </div>
                  )}
                  {mobileValue(m) && (
                    <div className="flex-shrink-0">
                      <p className={EYEBROW}>Value</p>
                      <span className={`${DETAIL_PILL} bg-green-100 text-green-700 border-green-300 font-semibold`}>
                        {mobileValue(m)}
                      </span>
                    </div>
                  )}
                  {/* Neither is in the row above, and both were in the strip of
                      pills this replaced — dropped rather than relabelled, they
                      would just be gone. */}
                  {mobileConference(m) && (
                    <div className="flex-shrink-0">
                      <p className={EYEBROW}>Conference</p>
                      <span className={`${DETAIL_PILL} bg-brand-secondary/10 text-brand-secondary border-brand-secondary/30`} title={mobileConference(m)!}>
                        {mobileConference(m)}
                      </span>
                    </div>
                  )}
                  {mobileGuests(m).length > 0 && (
                    <div className="flex-shrink-0">
                      <p className={EYEBROW}>Guests</p>
                      <span className={`${DETAIL_PILL} bg-blue-50 text-blue-700 border-blue-200`} title={mobileGuests(m).join(', ')}>
                        {mobileGuests(m).map(nameInitials).join(' | ')}
                      </span>
                    </div>
                  )}
                </ScrollRow>
                {hasSelection && (
                  <input
                    type="checkbox"
                    checked={selectedIds.has(m.id)}
                    onChange={() => toggleSelect(m.id)}
                    onClick={e => e.stopPropagation()}
                    className="flex-shrink-0 h-4 w-4 rounded border-gray-300 text-brand-secondary focus:ring-brand-secondary cursor-pointer"
                  />
                )}
              </div>
            )}
          </>
        )}
      </div>
  );

  /** The name is the control — it opens the quick view, so the separate eye
   *  beside it is gone. The drawer links on to the full record. */
  const attendeeNameNode = (m: Meeting, className: string) => {
    const name = `${m.first_name} ${m.last_name}`;
    return (
      <button
        type="button"
        onClick={() => setQuickView({ type: 'attendee', id: m.attendee_id, name })}
        className={`${className} text-left`}
        title={name}
      >
        {name}
      </button>
    );
  };

  /** Company name — same treatment. */
  const companyNameNode = (m: Meeting, className: string) => {
    if (!m.company_name || !m.company_id) return null;
    return (
      <button
        type="button"
        onClick={() => setQuickView({ type: 'company', id: m.company_id!, name: m.company_name! })}
        className={`${className} text-left`}
      >
        {m.company_name}
      </button>
    );
  };

  const renderTableRow = (m: Meeting) => (
  editingId === m.id && onEdit ? (
    <EditMeetingTableRow
      key={m.id}
      meeting={m}
      onSave={(id, data) => { onEdit(id, data); setEditingId(null); }}
      onCancel={() => setEditingId(null)}
      onDelete={onDelete && canDelete(m) ? (id) => { onDelete(id); setEditingId(null); } : undefined}
      colSpan={(hideCompany ? 8 : 9) + (hasActions ? 1 : 0) + (hasSelection ? 1 : 0) + customColumns.filter(c => c.visible).length}
      userOptions={userOptions}
      meetingTypeOptions={meetingTypeOptions}
    />
  ) : (
    // Each row is a card. The fill, border and rounded ends are applied to the
    // cells rather than the row, because a <tr> cannot be rounded — done with a
    // child selector so every cell picks it up without the switch below having
    // to repeat it. Same treatment as the follow-ups table.
    <tr
      key={m.id}
      onClick={onMeetingCardClick(m.id)}
      className={`align-top ${cardRowClass(selectedIds.has(m.id), focusedMeetingId === m.id)} ${cardEmphasisClass({
        focused: focusedMeetingId === m.id,
        otherFocused: focusedMeetingId != null && focusedMeetingId !== m.id,
        dimmed: false,
      })}`}
    >
      {hasSelection && (
        <td className="p-0 py-2 w-0">
          <SelectionCell revealed={checksRevealed}>
            <input
              type="checkbox"
              checked={selectedIds.has(m.id)}
              onChange={() => toggleSelect(m.id)}
              className="h-4 w-4 rounded border-gray-300 text-brand-secondary focus:ring-brand-secondary cursor-pointer"
            />
          </SelectionCell>
        </td>
      )}
      {orderedColumns.map(col => {
        if (!isVisible(col.key)) return null;
        switch (col.key) {
          case 'name': return <td key="name" className="px-3 py-2 font-medium text-gray-800 overflow-hidden align-top" style={{ maxWidth: 220 }}>
            <div className="flex items-center gap-1.5 group">
              {showAttendeeAvatar && (
                <AttendeeInitialsAvatar
                  name={`${m.first_name} ${m.last_name}`}
                  photoUrl={m.photo_url}
                  title={m.title}
                  companyName={m.company_name}
                  className="w-7 h-7 text-[10px]"
                />
              )}
              {attendeeNameNode(m, 'text-xs font-semibold text-brand-secondary hover:underline leading-snug block truncate')}
              {m.as_additional_attendee && <AdditionalAttendeeBadge />}
            </div>
            {/* Guests on the meeting, stacked under its subject and lined up
                with their titles in the next column. */}
            {(m.additional_attendee_records ?? []).map(extra => (
              <div key={extra.id} className="flex items-center gap-1.5 mt-1.5">
                <AttendeeInitialsAvatar
                  name={`${extra.first_name} ${extra.last_name}`}
                  photoUrl={extra.photo_url}
                  title={extra.title}
                  companyName={extra.company_name}
                  className="w-6 h-6 text-[9px]"
                />
                <span className="text-xs font-normal text-gray-500 leading-snug truncate" title={`${extra.first_name} ${extra.last_name}`}>
                  {extra.first_name} {extra.last_name}
                </span>
              </div>
            ))}
          </td>;
          case 'title': return <td key="title" className="px-3 py-2 text-gray-600 leading-snug align-top relative group/title" style={{ maxWidth: TITLE_WIDTH }}>
            {/* With guests below, each title line takes the height of the
                matching name line's avatar so the two columns stay in step.
                One line, cut with an ellipsis, so the column stays narrow
                enough for Location to sit beside it. */}
            {/* The tooltip stays, for the titles too long to finish even
                expanded, and for anyone not using a pointer. */}
            <span
              title={m.title ?? ''}
              className={`block text-xs font-semibold leading-snug truncate ${
                (m.additional_attendee_records?.length ?? 0) > 0
                  ? `flex items-center ${showAttendeeAvatar ? 'min-h-[28px]' : 'min-h-[20px]'}`
                  : ''
              }`}
            >{m.title || <span className="text-gray-300">\u2014</span>}</span>
            {/*
             * The whole title, over the cell rather than in it.
             *
             * A block inside the cell cannot be wider than the cell, so the
             * expansion has to leave the flow. Widening the CELL would be
             * worse anyway: the table lays out automatically, so every row
             * would be re-measured and the whole thing would jump under the
             * pointer. The line above keeps the row's height; this one grows
             * over the neighbour, which is why it is opaque.
             *
             * Always mounted and faded rather than toggled, or there is no
             * width for the transition to start from. pointer-events-none, so
             * it never swallows a click meant for what it covers.
             *
             * Plain text, not a pill: no border, no rounding, no shadow.
             *
             * Its background is white with the row's hover tint laid over it,
             * which is the colour the row underneath is already showing —
             * hovering the title necessarily hovers the row. Two layers
             * rather than one because the tint is semi-transparent: on its
             * own it lets the column behind show through the title, and one
             * line of text over another is unreadable. The gradient is a flat
             * colour; it is only a gradient because that paints ON the white
             * rather than replacing it.
             */}
            {m.title && (
              <span
                aria-hidden
                /* Both widths as classes. An inline max-width would win over
                   the hover rule no matter what it said, and the expansion
                   would never happen — the numbers reach the stylesheet as
                   custom properties on the table instead. */
                className="pointer-events-none absolute left-3 top-2 z-20 block max-w-[var(--title-rest)] overflow-hidden whitespace-nowrap bg-white bg-gradient-to-r from-brand-highlight/20 to-brand-highlight/20 text-xs font-semibold leading-snug text-gray-600 opacity-0 transition-all duration-300 ease-out group-hover/title:max-w-[var(--title-hover)] group-hover/title:opacity-100"
              >
                {m.title}
              </span>
            )}
            {(m.additional_attendee_records ?? []).map(extra => (
              <span key={extra.id} className="flex items-center h-6 mt-1.5 text-xs font-normal text-gray-400 leading-snug truncate" title={extra.title ?? ''}>
                {extra.title || '—'}
              </span>
            ))}
          </td>;
          case 'rep': return <td key="rep" className="px-3 py-2 leading-snug"><RepPills scheduledBy={splitInternalIds(m).repIds} userOptions={userOptions} /></td>;
          case 'company': return !hideCompany ? <td key="company" className="px-3 py-2 text-gray-600 leading-snug">
            {m.company_name && m.company_id ? (
              <div className="flex items-center gap-1 group">
                {companyNameNode(m, 'text-xs font-semibold text-brand-secondary hover:underline break-words whitespace-normal leading-snug')}
              </div>
            ) : (<span className="text-gray-300">—</span>)}
          </td> : null;
          case 'datetime': return <td key="datetime" className="px-3 py-2 text-gray-600 leading-snug">
            <div className="font-medium">{formatMeetingDate(m.meeting_date)}</div>
            <div className="text-gray-400">{formatMeetingTime(m.meeting_time)}</div>
          </td>;
          case 'location': return <td key="location" className="px-3 py-2 text-gray-600 leading-snug">
            {m.location ? (
              <span className={`${DETAIL_PILL} bg-gray-50 text-gray-600 border-gray-200 max-w-full`} title={m.location}>
                <LocationIcon />
                <span className="truncate">{m.location}</span>
              </span>
            ) : <span className="text-gray-300">&mdash;</span>}
          </td>;
          case 'conference': return <td key="conference" className="px-3 py-2 text-gray-600 leading-snug">
            <Link href={`/conferences/${m.conference_id}`} className="text-brand-secondary hover:underline">{m.conference_name}</Link>
          </td>;
          case 'meeting_type': return <td key="meeting_type" className="px-3 py-2 text-gray-600 leading-snug">{m.meeting_type || <span className="text-gray-300">—</span>}</td>;
          // Everyone internal on the meeting bar the rep who booked
          // it — that rep already has the Rep column to themselves.
          case 'support': return <td key="support" className="px-3 py-2">
            <OverlappingRepPills repIds={splitInternalIds(m).supportIds} userOptions={userOptions} size="xs" />
          </td>;
          case 'outcome': return <td key="outcome" className="px-3 py-2">
            <OutcomeButton value={m.outcome} options={actionOptions} colorMap={colorMap} onChange={(val) => changeOutcome(m, val)} />
          </td>;
          default: return null;
        }
      })}
      {customColumns.filter(c => c.visible).map(col => (
        <td key={`custom_${col.id}`} className="px-3 py-2 text-gray-600 leading-snug">
          <CustomColumnCell column={col} value={(m as unknown as Record<string, unknown>)[col.data_key]} />
        </td>
      ))}
      {hasActions && (
        <td className="px-3 py-2">
          <MeetingActionsMenu
            hasNotes={!!m.has_notes}
            hasConferenceNotes={noteCount(m) > 0}
            onNotes={onNotesClick ? () => onNotesClick(m.id) : undefined}
            onQuickNote={onQuickNote ? () => onQuickNote(m) : undefined}
            onViewNotes={anchor => setNotesView({ meeting: m, anchor })}
            onEdit={() => setEditingId(m.id)}
          />
        </td>
      )}
    </tr>
  )
  );

  if (meetings.length === 0) {
    return (
      <div className="text-center py-8">
        <svg className="w-10 h-10 text-gray-200 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
        <p className="text-gray-400 text-xs">No meetings scheduled yet.</p>
      </div>
    );
  }

  return (
    <>
      {/* Bulk action toolbar */}
      {selectedIds.size > 0 && (onBulkDelete || onBulkUpdate) && (
        <div className="flex flex-wrap items-center gap-2 px-4 py-2.5 bg-blue-50 border border-blue-200 rounded-lg mb-2 text-xs">
          <span className="font-semibold text-blue-700">{selectedIds.size} selected</span>
          <button
            type="button"
            onClick={() => setSelectedIds(new Set())}
            className="text-blue-500 hover:text-blue-700 underline"
          >
            Clear
          </button>
          {onBulkDelete && (
            <button
              type="button"
              onClick={handleBulkDelete}
              className="px-2.5 py-1 bg-red-50 text-red-600 border border-red-200 rounded hover:bg-red-100 font-medium ml-1"
            >
              Delete
            </button>
          )}
          {onBulkUpdate && (
            <>
              <span className="text-gray-300 hidden sm:inline">|</span>
              <div className="flex items-center gap-1.5">
                <span className="text-gray-500 hidden sm:inline">Rep:</span>
                <div className="w-44">
                  <RepMultiSelect
                    options={userOptions}
                    selectedIds={bulkRepIds}
                    onChange={setBulkRepIds}
                    placeholder="Set rep…"
                  />
                </div>
                <button
                  type="button"
                  onClick={handleBulkRepApply}
                  disabled={bulkRepIds.length === 0}
                  className="px-2 py-1 bg-gray-100 text-gray-700 border border-gray-300 rounded hover:bg-gray-200 font-medium disabled:opacity-40"
                >
                  Apply
                </button>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-gray-500 hidden sm:inline">Type:</span>
                <select
                  value=""
                  onChange={e => { if (e.target.value) handleBulkFieldUpdate('meeting_type', e.target.value); }}
                  className="border border-gray-300 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-brand-secondary bg-white"
                >
                  <option value="">Set type…</option>
                  {meetingTypeOptions.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-gray-500 hidden sm:inline">Outcome:</span>
                <select
                  value=""
                  onChange={e => { if (e.target.value) handleBulkFieldUpdate('outcome', e.target.value); }}
                  className="border border-gray-300 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-brand-secondary bg-white"
                >
                  <option value="">Set outcome…</option>
                  {actionOptions.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              </div>
            </>
          )}
        </div>
      )}

      {/* Kanban — the phone's cards, one column per group. Columns scroll
          sideways rather than shrinking, so a card reads the same however many
          groups there are.

          Every column stands the same height and scrolls on its own beneath a
          pinned header, so a long column doesn't drag the board down with it
          and leave the horizontal scrollbar far below the fold. */}
      {viewMode === 'kanban' && !cardsOnly && (
        <div className="hidden lg:block relative p-3">
          <button
            type="button"
            onClick={() => kanbanScrollRef.current?.scrollBy({ left: -320, behavior: 'smooth' })}
            title="Scroll left"
            className="absolute left-0 top-1/2 -translate-y-1/2 z-10 w-7 h-7 flex items-center justify-center rounded-full bg-white border border-gray-200 shadow-sm text-gray-500 hover:text-gray-700 hover:bg-gray-50 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <button
            type="button"
            onClick={() => kanbanScrollRef.current?.scrollBy({ left: 320, behavior: 'smooth' })}
            title="Scroll right"
            className="absolute right-0 top-1/2 -translate-y-1/2 z-10 w-7 h-7 flex items-center justify-center rounded-full bg-white border border-gray-200 shadow-sm text-gray-500 hover:text-gray-700 hover:bg-gray-50 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
          <div
            ref={kanbanScrollRef}
            className="overflow-x-auto scroll-smooth pb-2 mx-5"
            style={{ overflowY: 'visible' }}
          >
          <div className="flex gap-3 items-start min-w-max">
            {(groupedMeetings ?? [['', { label: 'All meetings', rows: sorted }]] as [string, { label: string; rows: Meeting[] }][])
              .map(([key, group]) => (
                <KanbanColumn
                  key={`kanban-${mode}-${key || 'none'}`}
                  label={group.label}
                  count={group.rows.length}
                  color={groupColor(key)}
                  height={kanbanColumnH}
                >
                  {group.rows.length === 0
                    ? <p className="px-3 py-6 text-center text-[11px] text-gray-400">No meetings</p>
                    : group.rows.map(m => (
                        <MobileCard key={m.id} data-kanban-card>
                          {renderMobileCard(m)}
                        </MobileCard>
                      ))}
                </KanbanColumn>
              ))}
          </div>
          </div>
        </div>
      )}

      {/* Mobile card layout — also the desktop list when the view is a table.
          Each meeting sits in the same bordered card the kanban columns use,
          on the same tinted backing: run flush against each other they read as
          one long list rather than as separate meetings. */}
      <div className={`${cardsOnly ? 'block' : `block ${viewMode === 'kanban' ? 'lg:hidden' : 'lg:hidden'}`}`}>
        {groupedMeetings
          ? groupedMeetings.map(([key, group]) => (
            <div key={`${mode}-${key || 'none'}`} style={{ animation: 'meetingGroupIn 200ms ease-out' }}>
              <GroupHeader
                label={group.label}
                count={group.rows.length}
                collapsed={isCollapsed(key)}
                onToggle={() => toggleGroup(key)}
                color={groupColor(key)}
              />
              {!isCollapsed(key) && (
                <MobileCardList>
                  {group.rows.map(m => <MobileCard key={m.id}>{renderMobileCard(m)}</MobileCard>)}
                </MobileCardList>
              )}
            </div>
          ))
          : (
            <MobileCardList>
              {sorted.map(m => <MobileCard key={m.id}>{renderMobileCard(m)}</MobileCard>)}
            </MobileCardList>
          )}
      </div>

      {/* Desktop table layout */}
      {/* The cards sit on the same grey the header row uses, inset from the
          container so the gap around them matches the gap between them. */}
      {!cardsOnly && viewMode === 'table' && (
      <div
        ref={meetingTableRef}
        className={`hidden lg:block ${CARD_TABLE_WRAP}`}
        onMouseEnter={() => setChecksHovered(true)}
        onMouseLeave={() => setChecksHovered(false)}
      >
      <div className={CARD_TABLE_SCROLL}>
        {/* border-spacing gives the cards the gap between them that a plain
            table has nowhere to put. */}
        <table className={`w-full ${CARD_TABLE}`} style={{ fontSize: '0.7rem', ['--title-rest' as string]: `${TITLE_WIDTH}px`, ['--title-hover' as string]: `${TITLE_HOVER_WIDTH}px` }}>
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              {hasSelection && (
                <th className="p-0 py-2 w-0">
                  <SelectionCell revealed={checksRevealed}>
                    <input
                      type="checkbox"
                      checked={allSelected}
                      ref={el => { if (el) el.indeterminate = someSelected; }}
                      onChange={toggleAll}
                      className="h-4 w-4 rounded border-gray-300 text-brand-secondary focus:ring-brand-secondary cursor-pointer"
                    />
                  </SelectionCell>
                </th>
              )}
              {orderedColumns.map(col => {
                if (!isVisible(col.key)) return null;
                switch (col.key) {
                  case 'name': return <SortHeader key="name" label="Name" col="name" />;
                  case 'title': return <SortHeader key="title" label="Title" col="title" />;
                  case 'rep': return <SortHeader key="rep" label="Rep" col="scheduled_by" />;
                  case 'company': return !hideCompany ? <SortHeader key="company" label="Company" col="company" /> : null;
                  case 'datetime': return <SortHeader key="datetime" label="Date/Time" col="datetime" />;
                  case 'conference': return <SortHeader key="conference" label="Conference" col="conference" />;
                  case 'meeting_type': return <SortHeader key="meeting_type" label="Type" col="meeting_type" />;
                  case 'location': return <th key="location" className="px-3 py-2 text-left font-semibold text-gray-500 uppercase tracking-wider">Location</th>;
                  case 'support': return <th key="support" className="px-3 py-2 text-left font-semibold text-gray-500 uppercase tracking-wider">Support</th>;
                  case 'outcome': return <SortHeader key="outcome" label="Outcome" col="outcome" />;
                  default: return null;
                }
              })}
              {customColumns.filter(c => c.visible).map(col => (
                <th key={`custom_${col.id}`} className="px-3 py-2 text-left font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">
                  {col.label}
                </th>
              ))}
              {hasActions && <th className="px-3 py-2"></th>}
            </tr>
          </thead>
          <tbody>
            {groupedMeetings
              ? groupedMeetings.map(([key, group], gi) => (
                  <Fragment key={`${mode}-${key || 'none'}`}>
                    <tr style={{ animation: 'meetingGroupIn 200ms ease-out' }}>
                      {/* The cell carries no padding: the spacer above sets a
                          group apart from the rows of the one before it, and
                          the heading keeps its own height. */}
                      <td colSpan={tableColSpan} className="p-0">
                        {gi > 0 && <div className="h-2 bg-white" aria-hidden />}
                        <div
                          className={groupColor(key) ? '' : 'bg-gray-50/70'}
                          style={groupColor(key) ? { backgroundColor: `${groupColor(key)}26` } : undefined}
                        >
                          <GroupHeader
                            label={group.label}
                            count={group.rows.length}
                            collapsed={isCollapsed(key)}
                            onToggle={() => toggleGroup(key)}
                            color={groupColor(key)}
                            bare
                          />
                        </div>
                      </td>
                    </tr>
                    {!isCollapsed(key) && group.rows.map(renderTableRow)}
                  </Fragment>
                ))
              : sorted.map(renderTableRow)}
          </tbody>
        </table>
      </div>
      </div>
      )}
      {quickView && (
        <QuickViewDrawer target={quickView} onClose={() => setQuickView(null)} />
      )}
      {assignFollowUp && (
        <AssignFollowUpDialog
          userOptions={userOptions}
          attendeeName={`${assignFollowUp.meeting.first_name} ${assignFollowUp.meeting.last_name}`.trim()}
          outcome={assignFollowUp.outcome}
          onAssignToMe={(action, note) => saveFollowUpAssignment(null, action, note)}
          onAssignToSelected={(ids, action, note) => saveFollowUpAssignment(ids, action, note)}
          onCancel={() => setAssignFollowUp(null)}
          submitting={assigningFollowUp}
        />
      )}

      {notesView && (
        <NotesPopoverCard
          attendeeId={notesView.meeting.attendee_id}
          conferenceName={notesView.meeting.conference_name}
          anchor={notesView.anchor}
          onClose={() => setNotesView(null)}
          onCountChange={count => setNoteCounts(prev => ({ ...prev, [notesView.meeting.attendee_id]: count }))}
        />
      )}
    </>
  );
}
