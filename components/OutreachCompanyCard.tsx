'use client';

import { useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { getBadgeClass, getHex } from '@/lib/colors';
import { useConfigColors } from '@/lib/useConfigColors';
import { useAvgCostPerUnit, formatValuePill } from '@/lib/useAvgCostPerUnit';
import { NewMeetingModal } from './NewMeetingModal';
import { EditOutreachMeetingModal } from './EditOutreachMeetingModal';
import { type Meeting } from './MeetingsTable';

export interface OutreachAssignee {
  userId: number;
  displayName: string;
  initials: string;
}

export interface OutreachAttendee {
  attendeeId: number;
  firstName: string;
  lastName: string;
  title: string | null;
  seniorityLabel: string | null;
  email: string | null;
  phone: string | null;
  linkedinUrl: string | null;
  activityCount: number;
  activityCounts: { phone: number; email: number; linkedin: number };
  meetingId: number | null;
}

export interface OutreachAttendeeFilter {
  id: number;
  name: string;
  email: string | null;
  phone: string | null;
  linkedinUrl: string | null;
}

export type OutreachStatus = 'not_started' | 'in_progress' | 'completed' | 'overdue';

export interface OutreachCompany {
  companyId: number;
  companyName: string;
  companyType: string | null;
  icp: string | null;
  wse: number | null;
  status: OutreachStatus;
  assignees: OutreachAssignee[];
  attendees: OutreachAttendee[];
  totalActivityCount: number;
  noteCount: number;
}

const STATUS_STYLES: Record<OutreachStatus, { label: string; className: string }> = {
  not_started: { label: 'Not Started', className: 'bg-gray-100 text-gray-600 border border-gray-200' },
  in_progress: { label: 'In Progress', className: 'bg-green-50 text-green-700 border border-green-200' },
  completed: { label: 'Completed', className: 'bg-blue-50 text-blue-700 border border-blue-200' },
  overdue: { label: 'Overdue', className: 'bg-amber-50 text-amber-700 border border-amber-200' },
};

// Same tier key/label/color convention as components/pre-conference/ConferenceTargetsTab.tsx's
// TIERS array (not exported from there, so duplicated here — small enough to match this
// codebase's precedent of per-file helper duplication rather than a shared import).
const TIER_STYLES: Record<string, { label: string; className: string }> = {
  '1': { label: 'Must Target', className: 'bg-red-50 text-red-600 border border-red-200' },
  '2': { label: 'High Priority', className: 'bg-brand-primary/10 text-brand-primary border border-brand-primary/40' },
  '3': { label: 'Worth Engaging', className: 'bg-brand-highlight/10 text-brand-highlight border border-brand-highlight/40' },
  unassigned: { label: 'Monitor', className: 'bg-gray-50 text-gray-500 border border-gray-200' },
};

export const ACTIVITY_ICONS: Record<'phone' | 'email' | 'linkedin', { title: string; label: string; hoverClass: string; path: React.ReactNode }> = {
  phone: {
    title: 'Log phone call',
    label: 'Phone call',
    hoverClass: 'hover:border-green-400 hover:text-green-600 hover:bg-green-50',
    path: <path strokeLinecap="round" strokeLinejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />,
  },
  email: {
    title: 'Log email',
    label: 'Email',
    hoverClass: 'hover:border-blue-400 hover:text-blue-600 hover:bg-blue-50',
    path: <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />,
  },
  linkedin: {
    title: 'Log LinkedIn touch',
    label: 'LinkedIn touch',
    hoverClass: 'hover:border-purple-400 hover:text-purple-600 hover:bg-purple-50',
    path: <path strokeLinecap="round" strokeLinejoin="round" d="M16 8a6 6 0 016 6v7h-4v-7a2 2 0 00-2-2 2 2 0 00-2 2v7h-4v-7a6 6 0 016-6zM2 9h4v12H2zM4 6a2 2 0 100-4 2 2 0 000 4z" />,
  },
};

// Matches OutreachDrawer's DOT_COLOR so a note tagged with an activity shows the
// same colored dot in the notes thread as that activity gets in the timeline.
export const ACTIVITY_DOT_CLASS: Record<'phone' | 'email' | 'linkedin', string> = {
  phone: 'bg-green-500',
  email: 'bg-blue-500',
  linkedin: 'bg-purple-500',
};

// Small popover anchored to an activity icon for adding a note about that
// specific logged activity. Fixed-positioned (computed from the trigger's
// bounding rect, like components/FollowUpNotesPopover.tsx) rather than
// absolutely positioned, since the card it lives in clips overflow.
function ActivityNotePopover({
  anchorRef,
  onClose,
  onSubmit,
}: {
  anchorRef: React.RefObject<HTMLElement>;
  onClose: () => void;
  onSubmit: (body: string) => Promise<void>;
}) {
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const [text, setText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!anchorRef.current) return;
    const rect = anchorRef.current.getBoundingClientRect();
    const width = 220;
    setPos({
      top: rect.bottom + 6,
      left: Math.max(8, Math.min(rect.left, window.innerWidth - width - 8)),
    });
  }, [anchorRef]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node) && anchorRef.current && !anchorRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [anchorRef, onClose]);

  const handleSubmit = async () => {
    const body = text.trim();
    if (!body || submitting) return;
    setSubmitting(true);
    await onSubmit(body);
    setSubmitting(false);
  };

  if (!pos) return null;

  return (
    <div
      ref={popoverRef}
      style={{ position: 'fixed', top: pos.top, left: pos.left, width: 220, zIndex: 10000 }}
      className="bg-white rounded-lg shadow-xl border border-gray-200 p-2.5"
      onClick={e => e.stopPropagation()}
    >
      <textarea
        value={text}
        onChange={e => setText(e.target.value)}
        rows={3}
        autoFocus
        placeholder="Add a note about this…"
        className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-brand-secondary resize-none"
      />
      <div className="flex items-center justify-end gap-2 mt-1.5">
        <button type="button" onClick={onClose} className="text-xs text-gray-400 hover:text-gray-600 px-1.5 py-1">Cancel</button>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={submitting || !text.trim()}
          className="text-xs font-medium text-white bg-brand-secondary hover:bg-brand-primary px-2.5 py-1 rounded-lg transition-colors disabled:opacity-50"
        >
          {submitting ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  );
}

export function OutreachCompanyCard({
  company,
  conferenceId,
  targetTier,
  selectedAttendeeId,
  onActivityLogged,
  onOpenDrawer,
  onOpenAssign,
}: {
  company: OutreachCompany;
  conferenceId: number;
  /** This company's target tier key ('1'|'2'|'3'|'unassigned'), if it's on the targets board. */
  targetTier?: string | null;
  /** The attendee the timeline/notes drawer is currently filtered to, if any — highlights that row. */
  selectedAttendeeId?: number | null;
  onActivityLogged: () => void;
  onOpenDrawer: (tab: 'timeline' | 'notes', attendee?: OutreachAttendeeFilter) => void;
  onOpenAssign: () => void;
}) {
  const colorMaps = useConfigColors();
  const avgCostPerUnit = useAvgCostPerUnit();
  const [expanded, setExpanded] = useState(false);
  const [flashKey, setFlashKey] = useState<string | null>(null);
  const [hoverKey, setHoverKey] = useState<string | null>(null);
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [localCounts, setLocalCounts] = useState<Record<number, { phone: number; email: number; linkedin: number }>>({});
  const [localTotal, setLocalTotal] = useState(company.totalActivityCount);
  const [localNoteCount, setLocalNoteCount] = useState(company.noteCount);
  const [localStatus, setLocalStatus] = useState<OutreachStatus>(company.status);
  const [localMeetingIds, setLocalMeetingIds] = useState<Record<number, number>>({});
  const [schedulingAttendee, setSchedulingAttendee] = useState<OutreachAttendee | null>(null);
  const [editingMeetingId, setEditingMeetingId] = useState<number | null>(null);
  const [notePopoverKey, setNotePopoverKey] = useState<string | null>(null);
  const activityIconRefs = useRef<Record<string, HTMLDivElement | null>>({});

  // Below sm (640px), the header's timeline/notes/edit-assignees icons and each
  // attendee row's meeting/activity icons collapse behind a kabob button —
  // matches the app's other mobile-vs-desktop breakpoint (e.g. drawers switch
  // at the same width).
  const [isDesktop, setIsDesktop] = useState(true);
  useEffect(() => {
    const media = window.matchMedia('(min-width: 640px)');
    const update = () => setIsDesktop(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  const [headerMenuOpen, setHeaderMenuOpen] = useState(false);
  const headerMenuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!headerMenuOpen) return;
    const h = (e: MouseEvent) => { if (headerMenuRef.current && !headerMenuRef.current.contains(e.target as Node)) setHeaderMenuOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [headerMenuOpen]);

  const [mobileAttendeeMenuKey, setMobileAttendeeMenuKey] = useState<number | null>(null);
  const mobileMenuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (mobileAttendeeMenuKey == null) return;
    const h = (e: MouseEvent) => { if (mobileMenuRef.current && !mobileMenuRef.current.contains(e.target as Node)) setMobileAttendeeMenuKey(null); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [mobileAttendeeMenuKey]);

  const statusStyle = STATUS_STYLES[localStatus] ?? STATUS_STYLES.not_started;
  const tierStyle = targetTier ? TIER_STYLES[targetTier] : null;
  const companyTypeHex = company.companyType ? getHex(company.companyType, colorMaps.company_type || {}) : '#6b7280';
  const valuePill = formatValuePill(company.wse, avgCostPerUnit);

  const countsFor = (attendee: OutreachAttendee) => localCounts[attendee.attendeeId] ?? attendee.activityCounts;
  const meetingIdFor = (attendee: OutreachAttendee) => localMeetingIds[attendee.attendeeId] ?? attendee.meetingId;

  const logActivity = async (attendee: OutreachAttendee, activityType: 'phone' | 'email' | 'linkedin') => {
    const key = `${attendee.attendeeId}-${activityType}`;
    try {
      const res = await fetch(`/api/conferences/${conferenceId}/outreach/${company.companyId}/activity`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ attendeeId: attendee.attendeeId, activityType }),
      });
      if (!res.ok) throw new Error('Failed to log activity');

      setFlashKey(key);
      setTimeout(() => setFlashKey(k => (k === key ? null : k)), 1000);

      const base = countsFor(attendee);
      setLocalCounts(prev => ({ ...prev, [attendee.attendeeId]: { ...base, [activityType]: base[activityType] + 1 } }));

      const isFirstActivity = localTotal === 0;
      setLocalTotal(t => t + 1);

      if (isFirstActivity && localStatus === 'not_started') {
        // Optimistic, fire-and-forget — local state flips immediately, the PATCH
        // isn't awaited before continuing.
        setLocalStatus('in_progress');
        fetch(`/api/conferences/${conferenceId}/outreach/${company.companyId}/status`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'in_progress' }),
        }).catch(() => {});
      }
      onActivityLogged();
    } catch {
      // Silent — matches the "no confirmation modal" instant-log spec; a failed log
      // just doesn't flash/increment, which is signal enough for a rapid-fire action.
    }
  };

  const removeActivity = async (attendee: OutreachAttendee, activityType: 'phone' | 'email' | 'linkedin') => {
    const key = `${attendee.attendeeId}-${activityType}`;
    const base = countsFor(attendee);
    if (base[activityType] === 0 || pendingKey === key) return;
    setPendingKey(key);
    try {
      const res = await fetch(`/api/conferences/${conferenceId}/outreach/${company.companyId}/activity`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ attendeeId: attendee.attendeeId, activityType }),
      });
      if (!res.ok) throw new Error('Failed to remove activity');
      setLocalCounts(prev => ({ ...prev, [attendee.attendeeId]: { ...base, [activityType]: Math.max(0, base[activityType] - 1) } }));
      setLocalTotal(t => Math.max(0, t - 1));
      onActivityLogged();
    } catch {
      // Silent, matches logActivity's failure handling.
    } finally {
      setPendingKey(null);
    }
  };

  const submitActivityNote = async (attendee: OutreachAttendee, activityType: 'phone' | 'email' | 'linkedin', body: string) => {
    // Adding a note about an activity logs that activity too — the note popover
    // is reached by hovering an activity icon, so submitting it is a statement
    // that the touch happened, same as clicking the icon itself would be.
    await logActivity(attendee, activityType);
    try {
      const res = await fetch(`/api/conferences/${conferenceId}/outreach/${company.companyId}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body, activityType, attendeeId: attendee.attendeeId }),
      });
      if (!res.ok) throw new Error();
      setLocalNoteCount(n => n + 1);
      toast.success('Note added');
      onActivityLogged();
    } catch {
      toast.error('Failed to add note');
    } finally {
      setNotePopoverKey(null);
    }
  };

  const attendeeCount = company.attendees.length;

  const assigneePill = (
    <button
      type="button"
      onClick={e => { e.stopPropagation(); if (company.assignees.length === 0) onOpenAssign(); }}
      title={company.assignees.length === 0 ? 'Assign reps' : company.assignees.map(a => a.displayName).join(', ')}
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium flex-shrink-0 truncate max-w-[220px] ${
        company.assignees.length > 0
          ? 'bg-blue-50 text-blue-600 border border-blue-300'
          : 'bg-gray-100 text-gray-500 border border-gray-200 cursor-pointer hover:bg-gray-200'
      }`}
    >
      {company.assignees.length > 0
        ? company.assignees.map(a => a.displayName).join(', ')
        : 'Unassigned'}
    </button>
  );

  const badgesRow = (
    <>
      {company.companyType && (
        <span className={getBadgeClass(company.companyType, colorMaps.company_type || {})}>{company.companyType}</span>
      )}
      {company.icp === 'Yes' && <span className="badge-green text-xs px-2 py-0.5 flex-shrink-0">ICP</span>}
      {tierStyle && (
        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium flex-shrink-0 ${tierStyle.className}`}>
          {tierStyle.label}
        </span>
      )}
      {localStatus !== 'overdue' && (
        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium flex-shrink-0 ${statusStyle.className}`}>
          {statusStyle.label}
        </span>
      )}
      {isDesktop ? (
        valuePill && (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-700 border border-green-300 flex-shrink-0 whitespace-nowrap">
            {valuePill}
          </span>
        )
      ) : (
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-500 flex-shrink-0">
          {attendeeCount} {attendeeCount === 1 ? 'attendee' : 'attendees'}
        </span>
      )}
      {assigneePill}
    </>
  );

  const headerIcons = (
    <>
      <div className="relative">
        <button
          type="button"
          onClick={() => onOpenDrawer('timeline')}
          title="View timeline"
          className="w-7 h-7 rounded-full bg-gray-50 text-gray-400 hover:bg-gray-100 hover:text-brand-secondary flex items-center justify-center transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
        </button>
        {localTotal > 0 && (
          <span className="absolute -top-1.5 -left-1.5 min-w-[16px] h-4 px-1 rounded-full bg-brand-secondary text-white text-[9px] font-bold flex items-center justify-center leading-none">
            {localTotal}
          </span>
        )}
      </div>
      <div className="relative">
        <button
          type="button"
          onClick={() => onOpenDrawer('notes')}
          title="View notes"
          className={`w-7 h-7 rounded-full flex items-center justify-center transition-colors ${
            localNoteCount > 0 ? 'bg-blue-50 text-blue-500 hover:bg-blue-100' : 'bg-gray-50 text-gray-400 hover:bg-gray-100'
          }`}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
        </button>
        {localNoteCount > 0 && (
          <span className="absolute -top-1.5 -left-1.5 min-w-[16px] h-4 px-1 rounded-full bg-green-500 text-white text-[9px] font-bold flex items-center justify-center leading-none">
            {localNoteCount}
          </span>
        )}
      </div>
      <button
        type="button"
        onClick={onOpenAssign}
        title="Edit assigned reps"
        className="w-7 h-7 rounded-full bg-gray-50 text-gray-400 hover:bg-gray-100 hover:text-brand-secondary flex items-center justify-center transition-colors"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
      </button>
    </>
  );

  const expandToggle = (
    <>
      <svg className={`w-4 h-4 text-gray-400 flex-shrink-0 transition-transform ${expanded ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
      </svg>
      <span className="text-sm font-bold text-gray-800 truncate">{company.companyName}</span>
    </>
  );

  return (
    <div className="border border-gray-200 rounded-xl bg-white overflow-hidden hover:border-gray-300 transition-colors">
      {/* Collapsed row */}
      {isDesktop ? (
        <div className="flex items-center gap-3 px-4 py-3">
          <div
            role="button"
            tabIndex={0}
            onClick={() => setExpanded(v => !v)}
            onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') setExpanded(v => !v); }}
            className="flex items-center gap-3 flex-1 min-w-0 text-left cursor-pointer"
          >
            {expandToggle}
            {badgesRow}
          </div>
          <div className="flex items-center gap-4 flex-shrink-0">
            {headerIcons}
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-2 px-4 py-3">
          <div className="flex items-center gap-2">
            <div
              role="button"
              tabIndex={0}
              onClick={() => setExpanded(v => !v)}
              onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') setExpanded(v => !v); }}
              className="flex items-center gap-2 flex-1 min-w-0 text-left cursor-pointer"
            >
              {expandToggle}
            </div>
            <div className="relative flex-shrink-0" ref={headerMenuRef}>
              <button
                type="button"
                onClick={() => setHeaderMenuOpen(v => !v)}
                title="More options"
                className="w-7 h-7 rounded-full bg-gray-50 text-gray-400 hover:bg-gray-100 flex items-center justify-center transition-colors"
              >
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="5" r="1.75" /><circle cx="12" cy="12" r="1.75" /><circle cx="12" cy="19" r="1.75" /></svg>
              </button>
              {headerMenuOpen && (
                <div className="absolute top-full right-0 mt-1 bg-white rounded-lg shadow-lg border border-gray-100 p-2 z-20 flex items-center gap-3">
                  {headerIcons}
                </div>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap pl-6">
            {badgesRow}
          </div>
        </div>
      )}

      {/* Expanded attendee rows */}
      {expanded && (
        <div className="border-t border-gray-100">
          {company.attendees.length === 0 && (
            <p className="text-xs text-gray-400 px-4 py-3">No attendees from this company at this conference.</p>
          )}
          {company.attendees.map((attendee, idx) => {
            const counts = countsFor(attendee);
            const total = counts.phone + counts.email + counts.linkedin;
            const meetingId = meetingIdFor(attendee);
            const hasMeeting = meetingId != null;

            const meetingIconBlock = (
              <div className="relative flex-shrink-0" onClick={e => e.stopPropagation()}>
                <button
                  type="button"
                  title={hasMeeting ? 'Edit scheduled meeting' : 'Schedule meeting'}
                  onClick={() => (hasMeeting ? setEditingMeetingId(meetingId) : setSchedulingAttendee(attendee))}
                  className={`w-7 h-7 rounded-lg border flex items-center justify-center transition-colors ${
                    hasMeeting
                      ? 'border-green-300 bg-green-50 text-green-600 hover:bg-green-100'
                      : 'border-gray-200 text-gray-400 hover:border-brand-secondary hover:text-brand-secondary hover:bg-brand-secondary/10'
                  }`}
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                </button>
                {hasMeeting && (
                  <span className="absolute -top-1.5 -left-1.5 w-4 h-4 rounded-full bg-green-500 text-white flex items-center justify-center">
                    <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  </span>
                )}
              </div>
            );

            const activityIconsBlock = (
              <div className="flex items-center gap-3 flex-shrink-0" onClick={e => e.stopPropagation()}>
                {(['phone', 'email', 'linkedin'] as const).map(type => {
                    const key = `${attendee.attendeeId}-${type}`;
                    const flashed = flashKey === key;
                    const hovered = hoverKey === key;
                    const pending = pendingKey === key;
                    const icon = ACTIVITY_ICONS[type];
                    const typeCount = counts[type];
                    return (
                      <div
                        key={type}
                        ref={el => { activityIconRefs.current[key] = el; }}
                        className="relative"
                        onMouseEnter={() => setHoverKey(key)}
                        onMouseLeave={() => setHoverKey(k => (k === key ? null : k))}
                      >
                        <button
                          type="button"
                          onClick={() => logActivity(attendee, type)}
                          disabled={pending}
                          title={icon.title}
                          className={`w-7 h-7 rounded-lg border flex items-center justify-center transition-colors duration-300 ${
                            flashed ? 'bg-green-100 border-green-400 text-green-600' : `border-gray-200 text-gray-400 ${icon.hoverClass}`
                          } ${pending ? 'opacity-50 cursor-wait' : ''}`}
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>{icon.path}</svg>
                        </button>
                        {typeCount > 0 && (
                          <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 px-1 rounded-full bg-brand-secondary text-white text-[9px] font-bold flex items-center justify-center leading-none z-10">
                            {typeCount}
                          </span>
                        )}
                        {typeCount > 0 && hovered && !pending && (
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); removeActivity(attendee, type); }}
                            className="absolute -top-1.5 -left-1.5 w-4 h-4 rounded-full bg-white border border-gray-300 flex items-center justify-center hover:border-red-400 hover:text-red-500 transition-colors text-gray-400 shadow-sm z-10"
                            title="Remove last"
                          >
                            <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M20 12H4" />
                            </svg>
                          </button>
                        )}
                        {hovered && !pending && (
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); setNotePopoverKey(k => (k === key ? null : key)); }}
                            className="absolute -bottom-1.5 -left-1.5 w-4 h-4 rounded-full bg-white border border-gray-300 flex items-center justify-center hover:border-brand-secondary hover:text-brand-secondary transition-colors text-gray-400 shadow-sm z-10"
                            title="Add note about this"
                          >
                            <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                          </button>
                        )}
                        {notePopoverKey === key && (
                          <ActivityNotePopover
                            anchorRef={{ current: activityIconRefs.current[key] }}
                            onClose={() => setNotePopoverKey(null)}
                            onSubmit={(body) => submitActivityNote(attendee, type, body)}
                          />
                        )}
                      </div>
                    );
                  })}
              </div>
            );

            const mobileMenuOpen = mobileAttendeeMenuKey === attendee.attendeeId;

            return (
              <div
                key={attendee.attendeeId}
                onClick={() => onOpenDrawer('timeline', {
                  id: attendee.attendeeId,
                  name: `${attendee.firstName} ${attendee.lastName}`,
                  email: attendee.email,
                  phone: attendee.phone,
                  linkedinUrl: attendee.linkedinUrl,
                })}
                className={`flex items-center gap-3 px-4 py-2.5 cursor-pointer hover:bg-blue-50/40 transition-colors ${
                  attendee.attendeeId === selectedAttendeeId ? 'bg-blue-50' : idx % 2 === 0 ? 'bg-gray-50/60' : 'bg-white'
                }`}
              >
                {isDesktop && (
                  <div
                    className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[10px] font-semibold flex-shrink-0"
                    style={{ backgroundColor: companyTypeHex }}
                  >
                    {(attendee.firstName[0] ?? '') + (attendee.lastName[0] ?? '')}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-gray-800 truncate">{attendee.firstName} {attendee.lastName}</p>
                  <div className="flex items-center gap-1.5 min-w-0">
                    {attendee.title && <p className="text-[11px] text-gray-400 truncate">{attendee.title}</p>}
                    {isDesktop && attendee.seniorityLabel && (
                      <span className={`${getBadgeClass(attendee.seniorityLabel, colorMaps.seniority || {})} flex-shrink-0`}>
                        {attendee.seniorityLabel}
                      </span>
                    )}
                    {!attendee.title && !(isDesktop && attendee.seniorityLabel) && <p className="text-[11px] text-gray-400">—</p>}
                  </div>
                </div>
                {isDesktop ? (
                  <>
                    {meetingIconBlock}
                    {activityIconsBlock}
                  </>
                ) : (
                  <div className="relative flex-shrink-0" onClick={e => e.stopPropagation()} ref={mobileMenuOpen ? mobileMenuRef : undefined}>
                    <button
                      type="button"
                      onClick={() => setMobileAttendeeMenuKey(k => (k === attendee.attendeeId ? null : attendee.attendeeId))}
                      title="More options"
                      className="w-7 h-7 rounded-full bg-gray-50 text-gray-400 hover:bg-gray-100 flex items-center justify-center transition-colors"
                    >
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="5" r="1.75" /><circle cx="12" cy="12" r="1.75" /><circle cx="12" cy="19" r="1.75" /></svg>
                    </button>
                    {mobileMenuOpen && (
                      <div className="absolute top-full right-0 mt-1 bg-white rounded-lg shadow-lg border border-gray-100 p-2 z-20 flex items-center gap-3">
                        {meetingIconBlock}
                        {activityIconsBlock}
                      </div>
                    )}
                  </div>
                )}
                {isDesktop ? (
                  <span className={`text-[11px] font-medium flex-shrink-0 w-[72px] text-right ${total > 0 ? 'text-green-600' : 'text-gray-400'}`}>
                    {total > 0 ? `${total} logged` : 'None logged'}
                  </span>
                ) : (
                  <span
                    title={total > 0 ? `${total} logged` : 'None logged'}
                    className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold ${
                      total > 0 ? 'border border-green-400 bg-green-50 text-green-600' : 'border border-gray-200 bg-gray-50 text-gray-400'
                    }`}
                  >
                    {total > 0 ? total : '-'}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}

      {schedulingAttendee && (
        <NewMeetingModal
          isOpen={true}
          onClose={() => setSchedulingAttendee(null)}
          defaultConferenceId={conferenceId}
          prefillCompanyId={company.companyId}
          prefillAttendeeId={schedulingAttendee.attendeeId}
          onSuccess={(meeting: Meeting) => {
            setLocalMeetingIds(prev => ({ ...prev, [schedulingAttendee.attendeeId]: meeting.id }));
            setSchedulingAttendee(null);
            onActivityLogged();
          }}
        />
      )}

      {editingMeetingId != null && (
        <EditOutreachMeetingModal
          meetingId={editingMeetingId}
          onClose={() => setEditingMeetingId(null)}
          onSuccess={(meeting: Meeting) => {
            setLocalMeetingIds(prev => ({ ...prev, [meeting.attendee_id]: meeting.id }));
            setEditingMeetingId(null);
            onActivityLogged();
          }}
        />
      )}
    </div>
  );
}
