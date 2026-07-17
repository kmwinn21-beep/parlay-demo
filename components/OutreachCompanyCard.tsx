'use client';

import { useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { getBadgeClass, getHex } from '@/lib/colors';
import { useConfigColors } from '@/lib/useConfigColors';
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
  activityCount: number;
  activityCounts: { phone: number; email: number; linkedin: number };
  meetingId: number | null;
}

export type OutreachStatus = 'not_started' | 'in_progress' | 'completed' | 'overdue';

export interface OutreachCompany {
  companyId: number;
  companyName: string;
  companyType: string | null;
  icp: string | null;
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

function AssigneeStack({ assignees, max = 3 }: { assignees: OutreachAssignee[]; max?: number }) {
  if (assignees.length === 0) {
    return <span className="text-xs text-gray-400 italic">Unassigned</span>;
  }
  const shown = assignees.slice(0, max);
  const overflow = assignees.length - shown.length;
  // Leftmost avatar stacks on top (descending z-index), each subsequent one
  // overlapping by -6px with a 1.5px border to show separation against the card.
  return (
    <div className="flex items-center">
      {shown.map((a, i) => (
        <div
          key={a.userId}
          title={a.displayName}
          style={{ marginLeft: i === 0 ? 0 : -6, zIndex: shown.length - i, border: '1.5px solid white' }}
          className="w-6 h-6 rounded-full bg-brand-secondary text-white text-[10px] font-semibold flex items-center justify-center flex-shrink-0 relative"
        >
          {a.initials}
        </div>
      ))}
      {overflow > 0 && (
        <div
          style={{ marginLeft: -6, zIndex: 0, border: '1.5px solid white' }}
          className="w-6 h-6 rounded-full bg-gray-200 text-gray-600 text-[10px] font-semibold flex items-center justify-center flex-shrink-0 relative"
        >
          +{overflow}
        </div>
      )}
    </div>
  );
}

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
  onActivityLogged,
  onOpenDrawer,
  onOpenAssign,
}: {
  company: OutreachCompany;
  conferenceId: number;
  /** This company's target tier key ('1'|'2'|'3'|'unassigned'), if it's on the targets board. */
  targetTier?: string | null;
  onActivityLogged: () => void;
  onOpenDrawer: (tab: 'timeline' | 'notes', attendee?: { id: number; name: string }) => void;
  onOpenAssign: () => void;
}) {
  const colorMaps = useConfigColors();
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

  const statusStyle = STATUS_STYLES[localStatus] ?? STATUS_STYLES.not_started;
  const tierStyle = targetTier ? TIER_STYLES[targetTier] : null;
  const companyTypeHex = company.companyType ? getHex(company.companyType, colorMaps.company_type || {}) : '#6b7280';

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

  return (
    <div className="border border-gray-200 rounded-xl bg-white overflow-hidden hover:border-gray-300 transition-colors">
      {/* Collapsed row */}
      <div className="flex items-center gap-3 px-4 py-3">
        <button
          type="button"
          onClick={() => setExpanded(v => !v)}
          className="flex items-center gap-3 flex-1 min-w-0 text-left"
        >
          <svg className={`w-4 h-4 text-gray-400 flex-shrink-0 transition-transform ${expanded ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
          <span className="text-sm font-bold text-gray-800 truncate">{company.companyName}</span>
          {company.companyType && (
            <span className={getBadgeClass(company.companyType, colorMaps.company_type || {})}>{company.companyType}</span>
          )}
          {company.icp === 'Yes' && <span className="badge-green text-xs px-2 py-0.5 flex-shrink-0">ICP</span>}
          {tierStyle && (
            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium flex-shrink-0 ${tierStyle.className}`}>
              {tierStyle.label}
            </span>
          )}
          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium flex-shrink-0 ${statusStyle.className}`}>
            {statusStyle.label}
          </span>
          <span className="text-xs text-gray-400 flex-shrink-0 hidden sm:inline">
            {attendeeCount} {attendeeCount === 1 ? 'attendee' : 'attendees'}
          </span>
        </button>

        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            type="button"
            onClick={company.assignees.length === 0 ? onOpenAssign : undefined}
            title={company.assignees.length === 0 ? 'Assign reps' : company.assignees.map(a => a.displayName).join(', ')}
            className={company.assignees.length === 0 ? 'cursor-pointer' : ''}
          >
            <AssigneeStack assignees={company.assignees} />
          </button>
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
        </div>
      </div>

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
            return (
              <div
                key={attendee.attendeeId}
                onClick={() => onOpenDrawer('timeline', { id: attendee.attendeeId, name: `${attendee.firstName} ${attendee.lastName}` })}
                className={`flex items-center gap-3 px-4 py-2.5 cursor-pointer hover:bg-blue-50/40 transition-colors ${idx % 2 === 0 ? 'bg-gray-50/60' : 'bg-white'}`}
              >
                <div
                  className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[10px] font-semibold flex-shrink-0"
                  style={{ backgroundColor: companyTypeHex }}
                >
                  {(attendee.firstName[0] ?? '') + (attendee.lastName[0] ?? '')}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-gray-800 truncate">{attendee.firstName} {attendee.lastName}</p>
                  <p className="text-[11px] text-gray-400 truncate">
                    {[attendee.title, attendee.seniorityLabel].filter(Boolean).join(' · ') || '—'}
                  </p>
                </div>
                <span onClick={e => e.stopPropagation()}>
                  <AssigneeStack assignees={company.assignees} />
                </span>
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
                <div className="flex items-center gap-1.5 flex-shrink-0" onClick={e => e.stopPropagation()}>
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
                <span className={`text-[11px] font-medium flex-shrink-0 ${total > 0 ? 'text-green-600' : 'text-gray-400'}`}>
                  {total > 0 ? `${total} logged` : 'None logged'}
                </span>
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
