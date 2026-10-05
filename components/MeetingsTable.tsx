'use client';

import { useState, useRef, useEffect, useLayoutEffect, useCallback, Fragment } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { QuickViewDrawer, type QuickViewTarget } from '@/components/QuickViewDrawer';
import { getPreset, getHex, type ColorMap } from '@/lib/colors';
import { useIsPhone } from '@/lib/useIsPhone';
import { MEETING_TIME_OPTIONS, formatMeetingTime, formatCardDate } from '@/lib/meetingTime';
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
import { calcTooltipPos, type TooltipPos } from '@/lib/tooltipPosition';
import { PeopleTooltipCard, type TooltipPerson } from '@/components/PeopleTooltipCard';
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
  /**
   * 'md' matches the outcome pill it sits opposite on the mobile card — same
   * height, same text, same weight, so the two ends of that line read as a
   * pair rather than as a label and a control.
   */
  size?: 'md' | 'sm' | 'xs';
  /** Leads each pill with the user glyph, as the mobile card does. */
  withIcon?: boolean;
}) {
  const colorMaps = useConfigColors();
  const users = parseRepIds(scheduledBy).map(id => userOptions.find(u => u.id === id)).filter(Boolean);
  if (users.length === 0) return <span className="text-gray-300">—</span>;

  const baseClass =
    size === 'md'
      ? 'inline-flex items-center px-2 py-1 rounded-full text-xs font-semibold whitespace-nowrap'
      : size === 'xs'
        ? 'inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium whitespace-nowrap'
        : 'inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium whitespace-nowrap';

  return (
    <span className="inline-flex flex-wrap gap-1">
      {users.map((user, i) => (
        <span key={i} className={`${baseClass} gap-1 ${getPreset(colorMaps.user?.[user!.value]).badgeClass}`}>
          {/* Full strength at 'md', where it sits beside semibold text and a
              faded glyph reads as a different weight from the initials. */}
          {withIcon && (
            <svg className={`w-3 h-3 flex-shrink-0 ${size === 'md' ? '' : 'opacity-70'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={size === 'md' ? 2.5 : 2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
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

/** How close the outcome menu may come to the edge of the screen. */
const MENU_MARGIN = 8;

/** How wide the Title column is, leaving room for Location beside it. */
const TITLE_WIDTH = 150;

/**
 * How wide the Name column is on a table whose titles read under the names.
 *
 * Wider than the 220 it gets beside a Title column, because it now carries
 * what that column used to: a title cut at 220 would be no better read under
 * the name than it was in a 150px cell.
 */
const NAME_WIDTH_WITH_TITLE = 300;

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

/**
 * The same pill, for the row that answers when and where.
 *
 * Set larger than the row below it on purpose: those are what a rep checks
 * first, and the row below is what they read once one of them is worth a
 * second look.
 */
const FACT_PILL = 'inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold whitespace-nowrap border';

/**
 * The second row's pills: Type, the unit count, Value and the rest.
 *
 * One declared HEIGHT, not just one padding. They carry different things — a
 * few words, a number, a count with a glyph — so their text and padding differ
 * and nothing else would line them up. A row of pills at four heights reads as
 * four kinds of thing rather than one band of facts, and the support stack
 * beside them is square at the same height so it stays a circle.
 */
const ROW_PILL_H = 'h-6';
const ROW_PILL = `inline-flex items-center ${ROW_PILL_H} px-2 rounded-xl border ${PILL_TEXT} font-semibold whitespace-nowrap`;

/**
 * A label with its value under it, on the card's two rows of facts.
 *
 * A COLUMN rather than a plain block, which is what keeps the pills' top
 * edges level. A pill is inline-flex, so its line box reserves room under the
 * baseline — and a pill whose first child is an icon has no text baseline to
 * use, so the browser synthesises one from the icon's edge instead. The unit
 * count sat 1.8px above Type and Value for exactly that reason. As flex items
 * the pills are blockified and no baseline is involved at all.
 */
const CARD_FIELD = 'flex-shrink-0 flex flex-col items-start';

/** "Rep:" and "Status:", beside the pill rather than stacked above it. */
const INLINE_LABEL = 'text-[10px] font-medium text-gray-400 flex-shrink-0';

/**
 * Everyone a meeting is with, primary attendee first.
 *
 * The guests' titles are clipped in the same column as the primary one, so
 * the tooltip answers for the whole cell rather than for its first line.
 */
function meetingPeople(m: Meeting): TooltipPerson[] {
  return [
    { name: `${m.first_name} ${m.last_name}`.trim(), title: m.title },
    ...(m.additional_attendee_records ?? []).map(a => ({
      name: `${a.first_name} ${a.last_name}`.trim(),
      title: a.title,
    })),
  ].filter(p => p.name);
}

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
function MeetingActionsMenu({ hasNotes, hasConferenceNotes, onNotes, onQuickNote, onViewNotes, onEdit, onSelect }: {
  hasNotes: boolean;
  /** Notes already logged against this attendee for this conference — the
   *  button flags them so the menu is worth opening. */
  hasConferenceNotes?: boolean;
  onNotes?: () => void;
  onQuickNote?: () => void;
  /** Passed the button's viewport rect so the notes card can hang off it. */
  onViewNotes?: (anchor: DOMRect) => void;
  onEdit: () => void;
  /**
   * Starts a selection, on a card whose checkbox is not showing yet.
   *
   * Absent wherever the checkboxes are always visible, so the menu does not
   * offer to reveal something already on screen.
   */
  onSelect?: () => void;
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
    const height = 41 + (onNotes ? 33 : 0) + (onQuickNote ? 33 : 0) + (onViewNotes ? 33 : 0) + (onSelect ? 33 : 0);
    const flip = window.innerHeight - r.bottom - 8 < height && r.top - 8 > height;
    setPos({
      top: flip ? r.top - 4 - height : r.bottom + 4,
      left: Math.max(8, Math.min(r.right - ACTIONS_MENU_WIDTH, window.innerWidth - ACTIONS_MENU_WIDTH - 8)),
    });
  }, [onNotes, onQuickNote, onViewNotes, onSelect]);

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
          {onSelect && (
            <button type="button" role="menuitem" onClick={() => { setOpen(false); onSelect(); }} className={itemCls}>
              <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m-9 9h12a2 2 0 002-2V7a2 2 0 00-2-2H6a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
              Select
            </button>
          )}
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
  compact = false,
  subject,
}: {
  value: string | null;
  options: string[];
  colorMap: ColorMap;
  onChange: (val: string) => void;
  /**
   * Sits it on the mobile card's Where/When row, whose pills are 8px in.
   *
   * A prop rather than one padding for both: the table's pill is in a column
   * of its own where a little more room around the word reads better, and
   * nobody asked for that to change.
   */
  compact?: boolean;
  /**
   * What the sheet names under its heading, on a phone.
   *
   * A sheet covers the row it was opened from, so without this it is a list
   * of outcomes with nothing to say which meeting they would be set on. The
   * anchored menu on a pointer needs none of it — it is attached to the pill
   * it belongs to.
   */
  subject?: string;
}) {
  const isPhone = useIsPhone();
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
    // The sheet is full width and needs no clamping; this is the anchored
    // menu's problem only, and measuring a menu that is not rendered would
    // read zero and move the one that is.
    if (isPhone || !open || !dropdownPos) return;
    const el = menuRef.current;
    if (!el) return;
    const width = el.getBoundingClientRect().width;
    const clamped = Math.max(MENU_MARGIN, Math.min(dropdownPos.left, window.innerWidth - width - MENU_MARGIN));
    if (clamped !== dropdownPos.left) setDropdownPos(p => (p ? { ...p, left: clamped } : p));
  }, [isPhone, open, dropdownPos]);

  useEffect(() => {
    // The sheet has a backdrop of its own to close on, and closing it from
    // here as well would shut it on the tap that opened it.
    if (!open || isPhone) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open, isPhone]);

  const handleToggle = () => {
    if (!open && !isPhone && btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      const above = spaceBelow < 200 && rect.top > 200;
      setDropdownPos({ top: above ? rect.top : rect.bottom + 4, left: rect.left, above });
    }
    setOpen(o => !o);
  };

  const preset = value ? getPreset(colorMap[value]) : null;
  const pad = compact ? 'px-2 py-1' : 'px-2.5 py-1';
  const btnClass = preset
    ? `${preset.pillClass} ${pad} rounded-full text-xs font-semibold cursor-pointer whitespace-nowrap`
    : `bg-gray-100 text-gray-500 border border-gray-300 ${pad} rounded-full text-xs font-semibold cursor-pointer whitespace-nowrap`;

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
      {/* On a phone: a sheet, the same one the company card's type picker
          opens. An anchored menu has to be clamped back inside a 390px
          screen, ends up under the thumb that opened it, and puts seven
          colour dots in a 160px box; a sheet has the room to show each
          outcome as the pill it will become. */}
      {open && isPhone && createPortal(
        <div
          className="fixed inset-0 z-[9999] flex items-end sm:hidden"
          style={{ background: 'rgba(0,0,0,0.4)' }}
          onClick={() => setOpen(false)}
        >
          <div
            className="modal-sheet-mobile bg-white rounded-t-2xl shadow-2xl w-full flex flex-col"
            style={{ maxHeight: '70vh' }}
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 flex-shrink-0">
              <div className="min-w-0">
                <h3 className="font-semibold text-sm text-brand-primary">Outcome</h3>
                {subject && <p className="text-xs text-gray-500 truncate">{subject}</p>}
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-xs text-gray-500 px-3 py-1.5 rounded-lg border border-gray-200 flex-shrink-0"
              >
                Cancel
              </button>
            </div>
            <div className="overflow-y-auto">
              {/* First, as it is in the anchored menu: it is the one row that
                  takes something away rather than setting it. */}
              <button
                type="button"
                onClick={() => { onChange(''); setOpen(false); }}
                className="w-full text-left px-4 py-3 text-sm text-gray-400 border-b border-gray-100 hover:bg-gray-50 active:bg-gray-100"
              >
                — Clear —
              </button>
              {options.map(opt => {
                const p = getPreset(colorMap[opt]);
                return (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => { onChange(opt); setOpen(false); }}
                    className="w-full text-left px-4 py-3 border-b border-gray-100 hover:bg-gray-50 active:bg-gray-100"
                  >
                    {/* The pill itself rather than a dot beside a word, so the
                        choice looks like what it is about to put on the card. */}
                    <span className={`${p.pillClass} px-2.5 py-1 rounded-full text-xs font-semibold whitespace-nowrap ${
                      opt === value ? 'ring-2 ring-offset-1 ring-brand-secondary' : ''}`}>
                      {opt}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>,
        document.body,
      )}
      {open && !isPhone && dropdownPos && (
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
  /**
   * Whether this table has a Title column at all.
   *
   * Where it does not, the title reads under the name instead — the same
   * arrangement the conference attendees table uses. Keyed off the column
   * list rather than off `isVisible` on purpose: hiding Title from the
   * column menu should hide the title, not move it.
   */
  const titleUnderName = !orderedColumns.some(col => col.key === 'title');
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
  /**
   * Whether a selection is under way.
   *
   * The mobile cards hide their checkboxes until it is, and the kebab offers
   * Select only while it is not — so the menu never offers to reveal a box
   * that is already on screen.
   */
  const anySelected = selectedIds.size > 0;
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
  /**
   * The name cell being hovered, and where its tooltip goes.
   *
   * One at a time for the whole table rather than a hook per row: a row is a
   * branch of a switch here, not a component, so there is nowhere to put
   * per-row state.
   *
   * It hangs off Name rather than Title because on a table whose titles read
   * under the names there is no Title cell to hover, and a card listing who
   * the meeting is with belongs beside the names either way.
   */
  const [peopleTip, setPeopleTip] = useState<{ id: number; pos: TooltipPos } | null>(null);
  const nameCellRefs = useRef<Record<number, HTMLElement | null>>({});

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
            {/* Ruled off from the people below it, so the card reads as a
                company and then who from it was in the room. */}
            <div className="relative flex items-start gap-2 mb-2 pb-2 border-b border-gray-100 min-h-[1.25rem]">
              {/* Selecting a card is a thing you do TO the card, so it leads
                  the line the card is titled with rather than riding the row
                  of facts at the bottom. */}
              {/*
               * Shown once a selection is under way, and not before.
               *
               * A phone has no hover, so a checkbox per card is either always
               * there — a column of empty boxes down a list somebody is mostly
               * reading — or it is summoned. Select in the menu starts one, and
               * every card's box appears with it so the second and third are
               * one tap each.
               *
               * Derived from the selection rather than kept as its own flag:
               * the last box being unticked IS the end of the selection, so
               * there is no second piece of state to leave switched on.
               */}
              {hasSelection && anySelected && (
                <input
                  type="checkbox"
                  checked={selectedIds.has(m.id)}
                  onChange={() => toggleSelect(m.id)}
                  onClick={e => e.stopPropagation()}
                  className="flex-shrink-0 mt-0.5 h-4 w-4 rounded border-gray-300 text-brand-secondary focus:ring-brand-secondary cursor-pointer"
                />
              )}
              <div className="min-w-0 flex-1 overflow-x-auto scrollbar-hide pr-9">
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
              {/* Opaque, and the name scrolls underneath: a long company name
                  slides out of sight behind this rather than being cut off. */}
              {(onEdit || onNotesClick) && (
                <div className="absolute right-0 top-0 pl-1.5 bg-white">
                  <MeetingActionsMenu
                    hasNotes={!!m.has_notes}
                    hasConferenceNotes={noteCount(m) > 0}
                    onNotes={onNotesClick ? () => onNotesClick(m.id) : undefined}
                    onQuickNote={onQuickNote ? () => onQuickNote(m) : undefined}
                    onViewNotes={anchor => setNotesView({ meeting: m, anchor })}
                    onEdit={() => setEditingId(m.id)}
                    onSelect={hasSelection && !anySelected ? () => toggleSelect(m.id) : undefined}
                  />
                </div>
              )}
            </div>
            {/* Faces down the right edge, under the kebab, rather than
                leading each name. The primary attendee gets one too — only
                their guests had one, which read as though the guest were the
                subject. */}
            <div className="flex items-start justify-between gap-3">
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
              <AttendeeInitialsAvatar
                name={`${m.first_name} ${m.last_name}`.trim()}
                photoUrl={m.photo_url}
                title={m.title}
                companyName={m.company_name}
                className="w-6 h-6 text-[9px] mt-0.5 flex-shrink-0"
              />
            </div>
            {/* Guests and the company sit outside the name column, so their
                avatars start where the primary attendee's does and the company
                name lines up with both rather than being pushed in by it. */}
            {(m.additional_attendee_records ?? []).map(extra => (
              <div key={extra.id} className="flex items-center gap-3 mt-1.5 min-w-0">
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-normal text-gray-600 truncate">{extra.first_name} {extra.last_name}</p>
                  {extra.title && <p className="text-xs font-normal text-gray-400 truncate">{extra.title}</p>}
                </div>
                <AttendeeInitialsAvatar
                  name={`${extra.first_name} ${extra.last_name}`}
                  photoUrl={extra.photo_url}
                  title={extra.title}
                  companyName={extra.company_name}
                  className="w-6 h-6 text-[9px] flex-shrink-0"
                />
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
              <div className={CARD_FIELD}>
                <p className={EYEBROW}>When</p>
                <span className={`${FACT_PILL} bg-gray-50 text-gray-600 border-gray-200`}>
                  {formatCardDate(m.meeting_date)} at {formatMeetingTime(m.meeting_time)}
                </span>
              </div>
              <div className={`${CARD_FIELD} min-w-0 flex-1`}>
                <p className={EYEBROW}>Where</p>
                {m.location ? (
                  <span className={`${FACT_PILL} bg-gray-50 text-gray-600 border-gray-200 max-w-full`} title={m.location}>
                    <LocationIcon />
                    <span className="truncate">{m.location}</span>
                  </span>
                ) : (
                  /* An empty slot that says what is missing and takes you where
                     to fix it, rather than a gap that reads as "no location
                     needed". Dashed, because it is a placeholder and not a
                     value, and wordmark only — a pin drawn over "+ Location"
                     labels a location that is not there. */
                  <button
                    type="button"
                    onClick={() => setEditingId(m.id)}
                    title="Set a location"
                    className={`${FACT_PILL} border-dashed border-gray-300 text-gray-400 hover:text-gray-600 hover:border-gray-400 transition-colors`}
                  >
                    + Location
                  </button>
                )}
              </div>
            </div>

            {/*
             * What the meeting was, who else was on it, and what the account is
             * worth — on one line that scrolls.
             *
             * Type leads, under When: the two read as one sentence about the
             * meeting, and a reader going down the left edge gets both without
             * crossing the card. Every pill on the line is the same height, so
             * the row reads as one band rather than as four things of different
             * sizes; the support stack is square so it stays a circle.
             */}
            {(m.meeting_type || splitInternalIds(m).supportIds || m.company_wse != null
              || mobileValue(m) || mobileConference(m) || mobileGuests(m).length > 0) && (
              <ScrollRow className="mt-3" gapClass="gap-3" step={120}>
                {m.meeting_type && (
                  <div className={CARD_FIELD}>
                    <p className={EYEBROW}>Type</p>
                    <span className={`${ROW_PILL} text-gray-500 bg-gray-100 border-gray-200`}>{m.meeting_type}</span>
                  </div>
                )}
                {splitInternalIds(m).supportIds && (
                  <div className={CARD_FIELD}>
                    <p className={EYEBROW}>Support</p>
                    <OverlappingRepPills
                      repIds={splitInternalIds(m).supportIds}
                      userOptions={userOptions}
                      size="sm"
                      emptyLabel={null}
                    />
                  </div>
                )}
                {/* Named for whatever the account calls a unit — beds, keys,
                    doors — rather than for the column it is stored in. */}
                {m.company_wse != null && (
                  <div className={CARD_FIELD}>
                    <p className={EYEBROW}>{unitTypeLabel}</p>
                    <span className={`${ROW_PILL} bg-yellow-50 text-yellow-700 border-yellow-200 gap-1`}>
                      <svg className="w-3 h-3 text-yellow-600 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M2 18h20M4 18v-3a8 8 0 0116 0v3M12 3v2M4.93 7.93l1.41 1.41M19.07 7.93l-1.41 1.41" /></svg>
                      {Number(m.company_wse).toLocaleString()}
                    </span>
                  </div>
                )}
                {mobileValue(m) && (
                  <div className={CARD_FIELD}>
                    <p className={EYEBROW}>Value</p>
                    <span className={`${ROW_PILL} bg-green-100 text-green-700 border-green-300`}>
                      {mobileValue(m)}
                    </span>
                  </div>
                )}
                {/* Neither is in the rows above, and both were in the strip of
                    pills this replaced — dropped rather than relabelled, they
                    would just be gone. */}
                {mobileConference(m) && (
                  <div className={CARD_FIELD}>
                    <p className={EYEBROW}>Conference</p>
                    <span className={`${ROW_PILL} bg-brand-secondary/10 text-brand-secondary border-brand-secondary/30`} title={mobileConference(m)!}>
                      {mobileConference(m)}
                    </span>
                  </div>
                )}
                {mobileGuests(m).length > 0 && (
                  <div className={CARD_FIELD}>
                    <p className={EYEBROW}>Guests</p>
                    <span className={`${ROW_PILL} bg-blue-50 text-blue-700 border-blue-200`} title={mobileGuests(m).join(', ')}>
                      {mobileGuests(m).map(nameInitials).join(' | ')}
                    </span>
                  </div>
                )}
              </ScrollRow>
            )}

            {/*
             * Who owns it and how it went, under a rule.
             *
             * These two are the card's outcome rather than its description, so
             * they are separated from the facts above rather than listed among
             * them. Labelled inline instead of with an eyebrow: there are two
             * of them on one line, at opposite ends, and a label stacked above
             * each would read as the start of another row of facts.
             */}
            <div className="mt-3 pt-3 border-t border-gray-100 flex items-center justify-between gap-3">
              <span className="inline-flex items-center gap-1.5 min-w-0">
                <span className={INLINE_LABEL}>Rep:</span>
                <RepPills scheduledBy={splitInternalIds(m).repIds} userOptions={userOptions} size="md" withIcon />
              </span>
              <span className="inline-flex items-center gap-1.5 flex-shrink-0">
                <span className={INLINE_LABEL}>Status:</span>
                <OutcomeButton
                  value={m.outcome}
                  options={actionOptions}
                  colorMap={colorMap}
                  onChange={(val) => changeOutcome(m, val)}
                  compact
                  // The sheet covers the card it was opened from, so it has to
                  // say whose meeting it is about.
                  subject={m.company_name || `${m.first_name} ${m.last_name}`.trim()}
                />
              </span>
            </div>
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
          case 'name': return <td
            key="name"
            ref={el => { nameCellRefs.current[m.id] = el; }}
            onMouseEnter={() => {
              const el = nameCellRefs.current[m.id];
              if (el) setPeopleTip({ id: m.id, pos: calcTooltipPos(el) });
            }}
            onMouseLeave={() => setPeopleTip(null)}
            className="px-3 py-2 font-medium text-gray-800 overflow-hidden align-top relative"
            style={{ maxWidth: titleUnderName ? NAME_WIDTH_WITH_TITLE : 220 }}
          >
            {/* The avatar keeps the top of the stack, so the name sits on the
                same line as the date beside it and the title on the time's. */}
            <div className={`flex gap-1.5 group ${titleUnderName ? 'items-start' : 'items-center'}`}>
              {showAttendeeAvatar && (
                <AttendeeInitialsAvatar
                  name={`${m.first_name} ${m.last_name}`}
                  photoUrl={m.photo_url}
                  title={m.title}
                  companyName={m.company_name}
                  className="w-7 h-7 text-[10px] flex-shrink-0"
                />
              )}
              <div className="min-w-0 flex-1">
                {attendeeNameNode(m, 'text-xs font-semibold text-brand-secondary hover:underline leading-snug block truncate')}
                {/* Set like the time rather than like the name: the second line
                    of this cell and the second line of Date/Time are both the
                    quieter half of the pair. */}
                {titleUnderName && m.title && (
                  <div className="font-normal text-gray-400 leading-snug truncate" title={m.title}>{m.title}</div>
                )}
              </div>
              {m.as_additional_attendee && <AdditionalAttendeeBadge />}
            </div>
            {/* Everyone the meeting is with, read in one card rather than by
                hovering each clipped line of the cell in turn. */}
            {peopleTip?.id === m.id && meetingPeople(m).length > 0 && (
              <div
                style={{
                  position: 'fixed', top: peopleTip.pos.top, left: peopleTip.pos.left,
                  width: peopleTip.pos.width, zIndex: 9999,
                  transform: peopleTip.pos.above ? 'translateY(-100%)' : 'translateY(0)',
                }}
                className="pointer-events-none"
              >
                <PeopleTooltipCard heading="Attendees" people={meetingPeople(m)} />
              </div>
            )}
            {/* Guests on the meeting, in the same two-line shape as the
                attendee above them. */}
            {(m.additional_attendee_records ?? []).map(extra => (
              <div key={extra.id} className={`flex gap-1.5 mt-1.5 ${titleUnderName ? 'items-start' : 'items-center'}`}>
                <AttendeeInitialsAvatar
                  name={`${extra.first_name} ${extra.last_name}`}
                  photoUrl={extra.photo_url}
                  title={extra.title}
                  companyName={extra.company_name}
                  className={titleUnderName ? 'w-7 h-7 text-[10px] flex-shrink-0' : 'w-6 h-6 text-[9px] flex-shrink-0'}
                />
                <div className="min-w-0 flex-1">
                  <span className="text-xs font-normal text-gray-500 leading-snug block truncate" title={`${extra.first_name} ${extra.last_name}`}>
                    {extra.first_name} {extra.last_name}
                  </span>
                  {titleUnderName && extra.title && (
                    <div className="font-normal text-gray-400 leading-snug truncate" title={extra.title}>{extra.title}</div>
                  )}
                </div>
              </div>
            ))}
          </td>;
          case 'title': return <td key="title" className="px-3 py-2 text-gray-600 leading-snug align-top relative" style={{ maxWidth: TITLE_WIDTH }}>
            {/*
             * One line, cut with an ellipsis, so the column stays narrow
             * enough for Location to sit beside it. With guests below, each
             * title line takes the height of the matching name line's avatar
             * so the two columns stay in step.
             *
             * The whole title is read in the card the Name column opens on
             * hover, rather than by expanding this in place. Expanding it
             * meant an opaque copy sliding over the neighbouring cell, which
             * could only ever be one line wide — a long title ran out of room
             * and was cut off again, which is the problem it was there to
             * solve.
             */}
            <span
              className={`block text-xs font-semibold leading-snug truncate ${
                (m.additional_attendee_records?.length ?? 0) > 0
                  ? `flex items-center ${showAttendeeAvatar ? 'min-h-[28px]' : 'min-h-[20px]'}`
                  : ''
              }`}
            >{m.title || <span className="text-gray-300">\u2014</span>}</span>
            {(m.additional_attendee_records ?? []).map(extra => (
              <span key={extra.id} className="flex items-center h-6 mt-1.5 text-xs font-normal text-gray-400 leading-snug truncate" title={extra.title ?? ''}>
                {extra.title || '—'}
              </span>
            ))}
          </td>;
          // withIcon, as every other rep pill in the app is drawn — the
          // mobile card above, the company table, the relationship map. This
          // column was the one place initials appeared with nothing to say
          // they were a person's.
          case 'rep': return <td key="rep" className="px-3 py-2 leading-snug"><RepPills scheduledBy={splitInternalIds(m).repIds} userOptions={userOptions} withIcon /></td>;
          case 'company': return !hideCompany ? <td key="company" className="px-3 py-2 text-gray-600 leading-snug">
            {m.company_name && m.company_id ? (
              <div className="flex items-center gap-1 group">
                {companyNameNode(m, 'text-xs font-semibold text-brand-secondary hover:underline break-words whitespace-normal leading-snug')}
              </div>
            ) : (<span className="text-gray-300">—</span>)}
          </td> : null;
          case 'datetime': return <td key="datetime" className="px-3 py-2 text-gray-600 leading-snug align-top">
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
        <table className={`w-full ${CARD_TABLE}`} style={{ fontSize: '0.7rem' }}>
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
