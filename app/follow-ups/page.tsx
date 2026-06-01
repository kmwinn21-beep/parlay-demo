'use client';

import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import toast from 'react-hot-toast';
import { FollowUpsTable, type FollowUp } from '@/components/FollowUpsTable';
import { MeetingsTable, type Meeting, type EditFormData } from '@/components/MeetingsTable';
import { AssignFollowUpModal } from '@/components/AssignFollowUpModal';
import { BackButton } from '@/components/BackButton';
import { useConfigColors } from '@/lib/useConfigColors';
import { type UserOption, parseRepIds, resolveRepNames } from '@/lib/useUserOptions';
import { useMeetingNotesDrawer } from '@/lib/MeetingNotesDrawerContext';
import { useUser } from '@/components/UserContext';
import { getPreset, type ColorMap } from '@/lib/colors';

// ─── Types for Needs Attention ────────────────────────────────────────────────

interface PastScheduledMeeting {
  id: number;
  meeting_date: string;
  outcome: string | null;
  conference_id: number;
  attendee_id: number;
  meeting_type: string | null;
  first_name: string;
  last_name: string;
  title: string | null;
  company_name: string | null;
  company_id: number | null;
  conference_name: string | null;
}

interface OverdueFollowup {
  id: number;
  attendee_id: number;
  conference_id: number;
  next_steps: string | null;
  assigned_rep: string | null;
  created_at: string;
  first_name: string;
  last_name: string;
  conference_name: string | null;
}

interface HeldNoNotesMeeting {
  id: number;
  meeting_date: string;
  outcome: string | null;
  conference_id: number;
  attendee_id: number;
  scheduled_by: string | null;
  first_name: string;
  last_name: string;
  title: string | null;
  company_name: string | null;
  conference_name: string | null;
}

interface ConferenceInfo {
  id: number;
  name: string;
  start_date: string;
  end_date?: string;
  location?: string;
}

// ─── Helper functions ─────────────────────────────────────────────────────────

function formatDate(d: string) {
  if (!d) return '';
  return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function daysSince(dateStr: string): number {
  if (!dateStr) return 0;
  const then = new Date(dateStr);
  const now = new Date();
  return Math.floor((now.getTime() - then.getTime()) / (1000 * 60 * 60 * 24));
}

// ─── Filter components ────────────────────────────────────────────────────────

function FilterDropdown({ label, options, selected, onToggle, onClear, fullWidth }: { label: string; options: string[]; selected: Set<string>; onToggle: (v: string) => void; onClear: () => void; fullWidth?: boolean }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className={fullWidth
          ? `w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-left flex items-center justify-between gap-2 hover:border-brand-secondary transition-colors bg-white${selected.size > 0 ? ' border-brand-secondary' : ''}`
          : `input-field w-auto flex items-center gap-2 text-sm whitespace-nowrap ${selected.size > 0 ? 'border-brand-secondary text-brand-secondary' : ''}`
        }
      >
        <span className="truncate">{label}{selected.size > 0 ? ` (${selected.size})` : ''}</span>
        <svg className={`w-3 h-3 flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-20 p-2 min-w-[180px] max-h-56 overflow-y-auto">
          {options.length === 0 ? (
            <div className="px-2 py-1.5 text-sm text-gray-400">No options</div>
          ) : options.map(opt => (
            <label key={opt} className="flex items-center gap-2 px-2 py-1.5 hover:bg-gray-50 rounded cursor-pointer text-sm">
              <input type="checkbox" checked={selected.has(opt)} onChange={() => onToggle(opt)} className="accent-brand-secondary" />
              <span className="truncate">{opt}</span>
            </label>
          ))}
          {selected.size > 0 && (
            <button onClick={onClear} className="text-xs text-red-500 hover:underline px-2 mt-1">Clear</button>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Outcome Button (minimal replica for NeedsAttentionSection) ───────────────

function MiniOutcomeButton({
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
    ? `${preset.pillClass} px-2 py-0.5 rounded-full text-[10px] font-semibold cursor-pointer whitespace-nowrap`
    : 'bg-gray-100 text-gray-500 border border-gray-300 px-2 py-0.5 rounded-full text-[10px] font-semibold cursor-pointer whitespace-nowrap';

  return (
    <div ref={ref} className="relative inline-block">
      <button ref={btnRef} type="button" className={btnClass} onClick={handleToggle}>
        {value || '— Select —'}
        <svg className="w-2.5 h-2.5 ml-0.5 inline-block" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && dropdownPos && (
        <div
          style={{
            position: 'fixed',
            top: dropdownPos.top,
            left: dropdownPos.left,
            zIndex: 9999,
            transform: dropdownPos.above ? 'translateY(-100%)' : 'translateY(0)',
          }}
          className="bg-white rounded-lg shadow-lg border border-gray-200 py-1 min-w-[160px]"
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

// ─── Needs Attention rows ─────────────────────────────────────────────────────

function ColumnHeader({ title, count }: { title: string; count: number }) {
  return (
    <div className="px-3 py-2 border-b border-gray-100 flex items-center justify-between">
      <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">{title}</span>
      {count > 0 && (
        <span className="text-[10px] font-semibold text-gray-400">{count}</span>
      )}
    </div>
  );
}

function PastScheduledRow({
  meeting,
  actionOptions,
  colorMap,
  onOutcomeChange,
  onRemove,
  onFollowUp,
}: {
  meeting: PastScheduledMeeting;
  actionOptions: string[];
  colorMap: ColorMap;
  onOutcomeChange: (id: number, outcome: string) => Promise<void>;
  onRemove: (id: number) => void;
  onFollowUp: (m: PastScheduledMeeting) => void;
}) {
  const [removing, setRemoving] = useState(false);

  const handleOutcomeChange = async (val: string) => {
    if (!val || val === 'Scheduled') return;
    setRemoving(true);
    setTimeout(() => onRemove(meeting.id), 200);
    try {
      await onOutcomeChange(meeting.id, val);
    } catch {
      setRemoving(false);
    }
  };

  return (
    <div
      className="flex items-center gap-2 px-3 py-2 border-b border-gray-200 hover:bg-gray-50"
      style={{ opacity: removing ? 0 : 1, transform: removing ? 'translateY(-4px)' : 'none', transition: 'opacity 200ms, transform 200ms' }}
    >
      <span className="w-2 h-2 rounded-full bg-amber-400 flex-shrink-0" />
      <p className="text-[12px] font-medium text-gray-800 truncate flex-1 min-w-0">{meeting.first_name} {meeting.last_name}</p>
      <div className="flex items-center gap-2 flex-shrink-0">
        <MiniOutcomeButton
          value={meeting.outcome}
          options={actionOptions}
          colorMap={colorMap}
          onChange={handleOutcomeChange}
        />
        <button
          type="button"
          className="text-[10px] font-semibold text-brand-secondary bg-transparent border border-gray-200 rounded px-1.5 py-0.5 cursor-pointer hover:border-brand-secondary whitespace-nowrap transition-colors"
          onClick={() => onFollowUp(meeting)}
        >
          + Follow up
        </button>
      </div>
    </div>
  );
}

function OverdueFollowupRow({
  followup,
  onDone,
  onRemove,
}: {
  followup: OverdueFollowup;
  onDone: (id: number) => void;
  onRemove: (id: number) => void;
}) {
  const [removing, setRemoving] = useState(false);
  const days = daysSince(followup.created_at);
  const isVeryOverdue = days > 30;

  const handleDone = async () => {
    setRemoving(true);
    setTimeout(() => onDone(followup.id), 200);
  };

  const handleDelete = async () => {
    setRemoving(true);
    setTimeout(() => onRemove(followup.id), 200);
  };

  return (
    <div
      className="flex items-center gap-2 px-3 py-2 border-b border-gray-200 hover:bg-gray-50"
      style={{ opacity: removing ? 0 : 1, transform: removing ? 'translateY(-4px)' : 'none', transition: 'opacity 200ms, transform 200ms' }}
    >
      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${isVeryOverdue ? 'bg-red-500' : 'bg-amber-400'}`} />
      <div className="flex-1 min-w-0">
        <p className="text-[12px] font-medium text-gray-800 truncate">{followup.first_name} {followup.last_name}</p>
        <p className="text-[10px] text-gray-400 truncate flex items-center gap-1.5">
          {followup.conference_name || ''}
          <span className="inline-flex items-center px-1.5 py-0.5 rounded-full bg-red-100 text-red-600 text-[9px] font-medium leading-none">{days}d overdue</span>
        </p>
      </div>
      <div className="flex items-center gap-3 flex-shrink-0">
        <button
          type="button"
          className="flex items-center gap-1 px-2 py-1 rounded-lg font-medium border-2 transition-all whitespace-nowrap bg-white text-gray-500 border-gray-300 hover:border-green-400 hover:text-green-600 text-[11px]"
          onClick={handleDone}
        >
          Done
        </button>
        <button
          type="button"
          className="p-0 border-0 bg-transparent cursor-pointer flex-shrink-0"
          title="Delete follow-up"
          onClick={handleDelete}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#E24B4A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="3 6 5 6 21 6" />
            <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" />
            <path d="M10 11v6M14 11v6" />
            <path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2" />
          </svg>
        </button>
      </div>
    </div>
  );
}

function HeldNoNotesRow({
  meeting,
  onAddNotes,
  onRemove,
}: {
  meeting: HeldNoNotesMeeting;
  onAddNotes: (id: number) => void;
  onRemove: (id: number) => void;
}) {
  const [removing, setRemoving] = useState(false);

  const handleAddNotes = () => {
    setRemoving(true);
    setTimeout(() => onRemove(meeting.id), 200);
    onAddNotes(meeting.id);
  };

  return (
    <div
      className="flex items-center gap-2 px-3 py-2 border-b border-gray-200 hover:bg-gray-50"
      style={{ opacity: removing ? 0 : 1, transform: removing ? 'translateY(-4px)' : 'none', transition: 'opacity 200ms, transform 200ms' }}
    >
      <span className="w-2 h-2 rounded-full bg-gray-300 flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-[12px] font-medium text-gray-800 truncate">{meeting.first_name} {meeting.last_name}</p>
        <p className="text-[10px] text-gray-400 truncate">{meeting.conference_name || ''}</p>
      </div>
      <button
        type="button"
        className="text-[10px] font-semibold text-brand-secondary bg-transparent border border-gray-200 rounded px-1.5 py-0.5 cursor-pointer hover:border-brand-secondary flex-shrink-0 transition-colors whitespace-nowrap"
        onClick={handleAddNotes}
      >
        + Notes
      </button>
    </div>
  );
}

// ─── NeedsAttentionSection ────────────────────────────────────────────────────

function NeedsAttentionSection({
  actionOptions,
  colorMap,
  userOptions,
  onOutcomeChange,
  onFollowUp,
  onOpenNotes,
}: {
  actionOptions: string[];
  colorMap: ColorMap;
  userOptions: UserOption[];
  onOutcomeChange: (meetingId: number, outcome: string) => Promise<void>;
  onFollowUp: (m: PastScheduledMeeting) => void;
  onOpenNotes: (meetingId: number) => void;
}) {
  const [pastScheduled, setPastScheduled] = useState<PastScheduledMeeting[]>([]);
  const [overdueFollowups, setOverdueFollowups] = useState<OverdueFollowup[]>([]);
  const [heldNoNotes, setHeldNoNotes] = useState<HeldNoNotesMeeting[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/meetings/needs-attention')
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data) {
          setPastScheduled(data.pastScheduled || []);
          setOverdueFollowups(data.overdueFollowups || []);
          setHeldNoNotes(data.heldNoNotes || []);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const totalCount = pastScheduled.length + overdueFollowups.length + heldNoNotes.length;

  const removePastScheduled = (id: number) => setPastScheduled(prev => prev.filter(m => m.id !== id));
  const removeOverdue = (id: number) => setOverdueFollowups(prev => prev.filter(f => f.id !== id));
  const removeHeldNoNotes = (id: number) => setHeldNoNotes(prev => prev.filter(m => m.id !== id));

  const handleDoneFollowup = async (id: number) => {
    removeOverdue(id);
    try {
      const res = await fetch('/api/follow-ups', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, completed: true }),
      });
      if (!res.ok) throw new Error();
      toast.success('Marked as done!');
    } catch {
      toast.error('Failed to update follow-up.');
      // re-fetch to restore
      fetch('/api/meetings/needs-attention')
        .then(r => r.ok ? r.json() : null)
        .then(data => { if (data) setOverdueFollowups(data.overdueFollowups || []); })
        .catch(() => {});
    }
  };

  const handleDeleteFollowup = async (id: number) => {
    removeOverdue(id);
    try {
      const res = await fetch('/api/follow-ups', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      if (!res.ok) throw new Error();
    } catch {
      toast.error('Failed to delete follow-up.');
      fetch('/api/meetings/needs-attention')
        .then(r => r.ok ? r.json() : null)
        .then(data => { if (data) setOverdueFollowups(data.overdueFollowups || []); })
        .catch(() => {});
    }
  };

  if (loading) return null;
  const [mobileExpanded, setMobileExpanded] = useState<Record<string, boolean>>({});
  const toggleMobile = (key: string) => setMobileExpanded(prev => ({ ...prev, [key]: !prev[key] }));

  if (totalCount === 0) return null;

  const sections = [
    {
      key: 'past',
      title: 'Past meetings — update outcome',
      count: pastScheduled.length,
      content: pastScheduled.length === 0 ? (
        <p className="px-3 py-4 text-[11px] text-gray-400">All clear</p>
      ) : pastScheduled.map(m => (
        <PastScheduledRow key={m.id} meeting={m} actionOptions={actionOptions} colorMap={colorMap} onOutcomeChange={onOutcomeChange} onRemove={removePastScheduled} onFollowUp={onFollowUp} />
      )),
    },
    {
      key: 'overdue',
      title: 'Overdue follow-ups',
      count: overdueFollowups.length,
      content: overdueFollowups.length === 0 ? (
        <p className="px-3 py-4 text-[11px] text-gray-400">All clear</p>
      ) : overdueFollowups.map(f => (
        <OverdueFollowupRow key={f.id} followup={f} onDone={handleDoneFollowup} onRemove={handleDeleteFollowup} />
      )),
    },
    {
      key: 'notes',
      title: 'Held meetings — no notes',
      count: heldNoNotes.length,
      content: heldNoNotes.length === 0 ? (
        <p className="px-3 py-4 text-[11px] text-gray-400">All clear</p>
      ) : heldNoNotes.map(m => (
        <HeldNoNotesRow key={m.id} meeting={m} onAddNotes={onOpenNotes} onRemove={removeHeldNoNotes} />
      )),
    },
  ];

  return (
    <div className="card mb-4 overflow-hidden border border-red-300">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100">
        <svg className="w-4 h-4 text-red-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
        </svg>
        <span className="text-sm font-medium text-gray-700">Needs attention</span>
        <span className="bg-red-100 text-red-700 text-xs font-semibold px-2 py-0.5 rounded-full">
          {totalCount}
        </span>
      </div>

      {/* Desktop: 3-column grid */}
      <div className="hidden sm:grid" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
        {sections.map((s, i) => (
          <div key={s.key} style={i < 2 ? { borderRight: '1px solid #e5e7eb' } : {}}>
            <ColumnHeader title={s.title} count={s.count} />
            <div style={{ height: 200, overflowY: 'auto', scrollbarWidth: 'none' }} className={`no-scroll-col${i + 1}`}>
              <style>{`.no-scroll-col${i + 1}::-webkit-scrollbar { display: none }`}</style>
              {s.content}
            </div>
          </div>
        ))}
      </div>

      {/* Mobile: stacked collapsible sections */}
      <div className="sm:hidden divide-y divide-gray-200">
        {sections.map(s => {
          const isOpen = !!mobileExpanded[s.key];
          return (
            <div key={s.key}>
              <button
                type="button"
                className="w-full flex items-center justify-between px-4 py-3 text-left"
                onClick={() => toggleMobile(s.key)}
              >
                <span className="flex items-center gap-2">
                  <span className="text-[11px] font-semibold text-gray-600 uppercase tracking-wide">{s.title}</span>
                  <span className="bg-red-100 text-red-600 text-[10px] font-semibold px-1.5 py-0.5 rounded-full leading-none">{s.count}</span>
                </span>
                <svg
                  className={`w-4 h-4 text-gray-400 transition-transform flex-shrink-0 ${isOpen ? 'rotate-180' : ''}`}
                  fill="none" stroke="currentColor" viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {isOpen && (
                <div className="border-t border-gray-100">
                  {s.content}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Conference-grouped meetings ──────────────────────────────────────────────

interface ConferenceGroup {
  conferenceId: number;
  conferenceName: string;
  startDate: string;
  location?: string;
  meetings: Meeting[];
}

function groupMeetingsByConference(meetings: Meeting[], conferences: ConferenceInfo[]): ConferenceGroup[] {
  const confMap = new Map(conferences.map(c => [c.id, c]));
  const groups = new Map<number, ConferenceGroup>();

  for (const m of meetings) {
    if (!groups.has(m.conference_id)) {
      const conf = confMap.get(m.conference_id);
      groups.set(m.conference_id, {
        conferenceId: m.conference_id,
        conferenceName: m.conference_name,
        startDate: conf?.start_date || '',
        location: conf?.location,
        meetings: [],
      });
    }
    groups.get(m.conference_id)!.meetings.push(m);
  }

  return Array.from(groups.values()).sort((a, b) => b.startDate.localeCompare(a.startDate));
}

function groupFollowUpsByConference(followUps: FollowUp[], conferences: ConferenceInfo[]): Array<{
  conferenceId: number;
  conferenceName: string;
  startDate: string;
  followUps: FollowUp[];
}> {
  const confMap = new Map(conferences.map(c => [c.id, c]));
  const groups = new Map<number, { conferenceId: number; conferenceName: string; startDate: string; followUps: FollowUp[] }>();

  for (const fu of followUps) {
    if (!groups.has(fu.conference_id)) {
      const conf = confMap.get(fu.conference_id);
      groups.set(fu.conference_id, {
        conferenceId: fu.conference_id,
        conferenceName: fu.conference_name,
        startDate: conf?.start_date || fu.start_date || '',
        followUps: [],
      });
    }
    groups.get(fu.conference_id)!.followUps.push(fu);
  }

  return Array.from(groups.values()).sort((a, b) => b.startDate.localeCompare(a.startDate));
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function FollowUpsPage() {
  const { openMeetingNotes } = useMeetingNotesDrawer();
  const { user } = useUser();
  const [followUps, setFollowUps] = useState<FollowUp[]>([]);
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [actionOptions, setActionOptions] = useState<string[]>([]);
  const [nextStepsOptions, setNextStepsOptions] = useState<string[]>([]);
  const [userOptions, setUserOptions] = useState<UserOption[]>([]);
  const [conferenceOptions, setConferenceOptions] = useState<string[]>([]);
  const [conferences, setConferences] = useState<ConferenceInfo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'pending' | 'completed'>('pending');
  const [activeTab, setActiveTab] = useState<'meetings' | 'followups'>('meetings');
  const colorMaps = useConfigColors();

  // Status chip filter for meetings tab
  const [statusFilter, setStatusFilter] = useState('All');
  // Rep filter (shared)
  const [repFilter, setRepFilter] = useState<'all' | 'mine'>('all');

  // Follow-ups status filter
  const [followupStatusFilter, setFollowupStatusFilter] = useState('all');

  // Existing filter panel states
  const [filterRep, setFilterRep] = useState('');
  const [filterConference, setFilterConference] = useState('');
  const [filterOutcome, setFilterOutcome] = useState<Set<string>>(new Set());
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');
  const [filterNextStep, setFilterNextStep] = useState<Set<string>>(new Set());
  const [meetingsFiltersOpen, setMeetingsFiltersOpen] = useState(false);
  const [followUpsFiltersOpen, setFollowUpsFiltersOpen] = useState(false);

  // Collapsible conference groups for meetings
  const [expandedMeetingConferences, setExpandedMeetingConferences] = useState<Set<number>>(new Set());
  // Collapsible conference groups for follow-ups
  const [expandedFollowupConferences, setExpandedFollowupConferences] = useState<Set<number>>(new Set());

  // Follow-up modal state
  const [followUpModalOpen, setFollowUpModalOpen] = useState(false);
  const [followUpModalDefaults, setFollowUpModalDefaults] = useState<{
    conferenceId?: number;
    companyId?: number;
    attendeeId?: number;
  }>({});

  const fetchData = useCallback(async () => {
    try {
      const [fuRes, mtgRes, actionRes, userRes, nsRes, confRes] = await Promise.all([
        fetch('/api/follow-ups'),
        fetch('/api/meetings'),
        fetch('/api/config?category=action&form=follow_ups_page'),
        fetch('/api/config?category=user&form=follow_ups_page'),
        fetch('/api/config?category=next_steps&form=follow_ups_page'),
        fetch('/api/conferences?nav=1'),
      ]);
      if (!fuRes.ok) throw new Error();
      if (!mtgRes.ok) throw new Error();
      const [fuData, mtgData] = await Promise.all([fuRes.json(), mtgRes.json()]);
      setFollowUps(fuData);
      setMeetings(mtgData);

      if (actionRes.ok) {
        const data = await actionRes.json();
        if (Array.isArray(data)) setActionOptions(data.map((o: { value: string }) => o.value));
      }
      if (userRes.ok) {
        const data = await userRes.json();
        if (Array.isArray(data)) setUserOptions(data.map((o: { id: number; value: string }) => ({ id: Number(o.id), value: String(o.value) })));
      }
      if (nsRes.ok) {
        const data = await nsRes.json();
        if (Array.isArray(data)) setNextStepsOptions(data.map((o: { value: string }) => o.value));
      }
      if (confRes.ok) {
        const confData = await confRes.json();
        if (Array.isArray(confData)) {
          setConferenceOptions(confData.map((c: { name: string }) => c.name).filter(Boolean));
          setConferences(confData.map((c: { id: number; name: string; start_date: string; end_date?: string; location?: string }) => ({
            id: Number(c.id),
            name: c.name,
            start_date: c.start_date || '',
            end_date: c.end_date,
            location: c.location,
          })));
        }
      }
    } catch {
      toast.error('Failed to load data');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Set default expanded conference (most recent) once meetings/followups load
  useEffect(() => {
    if (meetings.length > 0 && expandedMeetingConferences.size === 0) {
      const groups = groupMeetingsByConference(meetings, conferences);
      if (groups.length > 0) setExpandedMeetingConferences(new Set([groups[0].conferenceId]));
    }
  }, [meetings, conferences]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (followUps.length > 0 && expandedFollowupConferences.size === 0) {
      const groups = groupFollowUpsByConference(followUps, conferences);
      if (groups.length > 0) setExpandedFollowupConferences(new Set([groups[0].conferenceId]));
    }
  }, [followUps, conferences]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const handler = () => {
      fetch('/api/follow-ups')
        .then(r => r.ok ? r.json() : null)
        .then(data => { if (data) setFollowUps(data); })
        .catch(() => {});
    };
    window.addEventListener('meeting-tasks-confirmed', handler);
    return () => window.removeEventListener('meeting-tasks-confirmed', handler);
  }, []);

  const handleToggle = async (id: number, completed: boolean) => {
    setFollowUps((prev) => prev.map((fu) => fu.id === id ? { ...fu, completed } : fu));
    try {
      const res = await fetch('/api/follow-ups', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, completed }),
      });
      if (!res.ok) throw new Error();
      toast.success(completed ? 'Marked as completed!' : 'Marked as pending.');
    } catch {
      setFollowUps((prev) => prev.map((fu) => fu.id === id ? { ...fu, completed: !completed } : fu));
      toast.error('Failed to update.');
    }
  };

  const handleDeleteFollowUp = async (id: number) => {
    if (!confirm('Are you sure you want to delete this follow-up?')) return;
    const prev = followUps;
    setFollowUps((fus) => fus.filter((fu) => fu.id !== id));
    try {
      const res = await fetch('/api/follow-ups', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      if (!res.ok) throw new Error();
      toast.success('Follow-up deleted.');
    } catch {
      setFollowUps(prev);
      toast.error('Failed to delete follow-up.');
    }
  };

  const handleOutcomeChange = useCallback(async (meetingId: number, outcome: string): Promise<void> => {
    setMeetings((prev) => prev.map((m) => m.id === meetingId ? { ...m, outcome } : m));
    try {
      const res = await fetch('/api/meetings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: meetingId, outcome }),
      });
      if (!res.ok) throw new Error();
      toast.success('Outcome updated.');
    } catch {
      toast.error('Failed to update outcome.');
      fetchData();
    }
  }, [fetchData]);

  const handleDeleteMeeting = async (meetingId: number) => {
    if (!confirm('Are you sure you want to delete this meeting?')) return;
    const prev = meetings;
    setMeetings((ms) => ms.filter((m) => m.id !== meetingId));
    try {
      const res = await fetch(`/api/meetings/${meetingId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error();
      toast.success('Meeting deleted.');
    } catch {
      setMeetings(prev);
      toast.error('Failed to delete meeting.');
    }
  };

  const handleRepChange = async (id: number, rep: string | null) => {
    setFollowUps((prev) => prev.map((fu) => fu.id === id ? { ...fu, assigned_rep: rep } : fu));
    try {
      const res = await fetch('/api/follow-ups', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, assigned_rep: rep }),
      });
      if (!res.ok) throw new Error();
      toast.success('Rep updated.');
    } catch {
      fetchData();
      toast.error('Failed to update rep.');
    }
  };

  const toggleOutcome = (v: string) => setFilterOutcome(prev => { const n = new Set(prev); n.has(v) ? n.delete(v) : n.add(v); return n; });
  const toggleNextStep = (v: string) => setFilterNextStep(prev => { const n = new Set(prev); n.has(v) ? n.delete(v) : n.add(v); return n; });

  // Get current user's config ID for "mine" filter
  const currentUserName = user?.displayName || user?.repName || user?.firstName || null;
  const currentUserConfigId = useMemo(() => {
    if (!currentUserName) return null;
    const match = userOptions.find(u => u.value === currentUserName);
    return match ? match.id : null;
  }, [currentUserName, userOptions]);

  const filteredMeetings = useMemo(() => {
    return meetings.filter(m => {
      if (filterRep && !parseRepIds(m.scheduled_by).map(String).includes(filterRep)) return false;
      if (filterConference && m.conference_name !== filterConference) return false;
      if (filterOutcome.size > 0 && !filterOutcome.has(m.outcome || '')) return false;
      if (filterDateFrom && m.meeting_date < filterDateFrom) return false;
      if (filterDateTo && m.meeting_date > filterDateTo) return false;

      // Status chip filter
      if (statusFilter !== 'All') {
        if (statusFilter === 'Held' && m.outcome !== 'Held') return false;
        if (statusFilter === 'Scheduled' && m.outcome !== 'Scheduled') return false;
        if (statusFilter === 'Cancelled / No-show' && m.outcome !== 'Cancelled' && m.outcome !== 'No-Show') return false;
        if (statusFilter === 'Rescheduled' && m.outcome !== 'Rescheduled') return false;
      }

      // Rep filter
      if (repFilter === 'mine' && currentUserConfigId) {
        if (!parseRepIds(m.scheduled_by).includes(currentUserConfigId)) return false;
      } else if (repFilter === 'mine' && currentUserName) {
        if (!resolveRepNames(m.scheduled_by, userOptions).includes(currentUserName)) return false;
      }

      return true;
    });
  }, [meetings, filterRep, filterConference, filterOutcome, filterDateFrom, filterDateTo, statusFilter, repFilter, currentUserConfigId, currentUserName, userOptions]);

  const filteredFollowUps = useMemo(() => {
    const now = new Date();
    const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

    return followUps.filter(fu => {
      if (filterRep && !parseRepIds(fu.assigned_rep).map(String).includes(filterRep)) return false;
      if (filterConference && fu.conference_name !== filterConference) return false;
      if (filterNextStep.size > 0 && !filterNextStep.has(fu.next_steps)) return false;

      // Follow-ups status filter
      if (followupStatusFilter === 'pending' && fu.completed) return false;
      if (followupStatusFilter === 'completed' && !fu.completed) return false;
      if (followupStatusFilter === 'overdue') {
        if (fu.completed) return false;
        // No created_at on FollowUp type from the table, use start_date as proxy isn't available either
        // Filter as pending for now — overdue is handled in NeedsAttentionSection
        // We skip items that don't have created_at field in the FollowUp type
        return true;
      }

      // Legacy sub-tab filter (from existing filter state)
      if (filter === 'pending' && fu.completed) return false;
      if (filter === 'completed' && !fu.completed) return false;

      // Rep filter
      if (repFilter === 'mine' && currentUserConfigId) {
        if (!parseRepIds(fu.assigned_rep).includes(currentUserConfigId)) return false;
      } else if (repFilter === 'mine' && currentUserName) {
        if (!resolveRepNames(fu.assigned_rep, userOptions).includes(currentUserName)) return false;
      }

      return true;
    });
  }, [followUps, filter, filterRep, filterConference, filterNextStep, followupStatusFilter, repFilter, currentUserConfigId, currentUserName, userOptions]);

  const meetingsFilterCount = (filterRep ? 1 : 0) + (filterConference ? 1 : 0) + (filterOutcome.size > 0 ? 1 : 0) + (filterDateFrom || filterDateTo ? 1 : 0);
  const followUpsFilterCount = (filterRep ? 1 : 0) + (filterConference ? 1 : 0) + (filterNextStep.size > 0 ? 1 : 0);

  const pendingCount = followUps.filter((fu) => !fu.completed).length;
  const completedCount = followUps.filter((fu) => fu.completed).length;

  // Conference groups
  const meetingGroups = useMemo(() => groupMeetingsByConference(filteredMeetings, conferences), [filteredMeetings, conferences]);
  const followupGroups = useMemo(() => groupFollowUpsByConference(filteredFollowUps, conferences), [filteredFollowUps, conferences]);

  const toggleMeetingConference = (id: number) => {
    setExpandedMeetingConferences(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleFollowupConference = (id: number) => {
    setExpandedFollowupConferences(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const openFollowUpModal = (defaults: { conferenceId?: number; companyId?: number; attendeeId?: number }) => {
    setFollowUpModalDefaults(defaults);
    setFollowUpModalOpen(true);
  };

  const userName = user?.displayName || user?.firstName || 'My';

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <BackButton />
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-brand-primary font-serif">Meetings &amp; Follow Ups</h1>
        <p className="text-sm text-gray-500 mt-1">Track meetings and next steps across all conferences.</p>
      </div>

      {/* Stats */}
      {!isLoading && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="card py-4 text-center">
            <p className="text-3xl font-bold text-brand-primary font-serif">{meetings.length}</p>
            <p className="text-xs text-gray-500 mt-1">Meetings</p>
          </div>
          <div className="card py-4 text-center">
            <p className="text-3xl font-bold text-brand-primary font-serif">{followUps.length}</p>
            <p className="text-xs text-gray-500 mt-1">Follow Ups</p>
          </div>
          <div className="card py-4 text-center">
            <p className="text-3xl font-bold text-brand-secondary font-serif">{pendingCount}</p>
            <p className="text-xs text-gray-500 mt-1">Pending</p>
          </div>
          <div className="card py-4 text-center">
            <p className="text-3xl font-bold text-green-600 font-serif">{completedCount}</p>
            <p className="text-xs text-gray-500 mt-1">Completed</p>
          </div>
        </div>
      )}

      {/* Needs Attention */}
      {!isLoading && (
        <NeedsAttentionSection
          actionOptions={actionOptions}
          colorMap={colorMaps.action || {}}
          userOptions={userOptions}
          onOutcomeChange={handleOutcomeChange}
          onFollowUp={(m) => openFollowUpModal({ conferenceId: m.conference_id, companyId: m.company_id ?? undefined, attendeeId: m.attendee_id })}
          onOpenNotes={openMeetingNotes}
        />
      )}

      {/* Top-level tabs */}
      <div className="border-b border-gray-200 overflow-x-auto">
        <nav className="flex gap-6 whitespace-nowrap">
          <button
            type="button"
            onClick={() => setActiveTab('meetings')}
            className={`py-3 px-1 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'meetings'
                ? 'border-brand-secondary text-brand-secondary'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            Meetings ({meetings.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('followups')}
            className={`py-3 px-1 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'followups'
                ? 'border-brand-secondary text-brand-secondary'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            Follow Ups ({followUps.length})
          </button>
        </nav>
      </div>

      {/* Meetings Tab Content */}
      {activeTab === 'meetings' && (
        <div className="card p-0 overflow-hidden">
          {/* Card header */}
          <div className="px-4 py-3 border-b border-gray-100">
            {/* Filter bar */}
            <div className="flex items-center justify-between gap-3">
              {/* Left: status chips */}
              <div className="flex items-center gap-2 flex-wrap">
                {['All', 'Held', 'Scheduled', 'Cancelled / No-show', 'Rescheduled'].map(status => (
                  <button
                    key={status}
                    type="button"
                    onClick={() => setStatusFilter(status)}
                    className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                      statusFilter === status
                        ? 'bg-brand-primary text-white border-brand-primary'
                        : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'
                    }`}
                  >
                    {status}
                  </button>
                ))}
              </div>
              {/* Right */}
              <div className="flex items-center gap-2 flex-shrink-0">
                <button
                  type="button"
                  onClick={() => setRepFilter('mine')}
                  className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${repFilter === 'mine' ? 'bg-teal-50 text-teal-800 border-teal-300' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'}`}
                >
                  {userName}&apos;s
                </button>
                <button
                  type="button"
                  onClick={() => setRepFilter('all')}
                  className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${repFilter === 'all' ? 'bg-gray-100 text-gray-800 border-gray-300' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'}`}
                >
                  All reps
                </button>
                <button
                  type="button"
                  onClick={() => setMeetingsFiltersOpen(o => !o)}
                  className={`flex items-center gap-1.5 text-sm bg-transparent border-0 p-0 cursor-pointer transition-colors ${meetingsFilterCount > 0 ? 'text-brand-secondary' : 'text-gray-600 hover:text-gray-900'}`}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
                  </svg>
                  Filters
                  {meetingsFilterCount > 0 && (
                    <span className="bg-brand-secondary text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center leading-none">
                      {meetingsFilterCount}
                    </span>
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* Collapsible filter pane */}
          {meetingsFiltersOpen && (
            <div className="px-6 py-4 border-b border-gray-100 bg-gray-50">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Rep</p>
                  <select value={filterRep} onChange={e => setFilterRep(e.target.value)} className="input-field w-full text-sm">
                    <option value="">All Reps</option>
                    {userOptions.map(u => <option key={u.id} value={String(u.id)}>{u.value}</option>)}
                  </select>
                </div>
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Conference</p>
                  <select value={filterConference} onChange={e => setFilterConference(e.target.value)} className="input-field w-full text-sm">
                    <option value="">All Conferences</option>
                    {conferenceOptions.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Outcome</p>
                  <FilterDropdown
                    label="All outcomes..."
                    options={actionOptions}
                    selected={filterOutcome}
                    onToggle={toggleOutcome}
                    onClear={() => setFilterOutcome(new Set())}
                    fullWidth
                  />
                </div>
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Date Range</p>
                  <div className="flex items-center gap-1.5">
                    <input type="date" value={filterDateFrom} onChange={e => setFilterDateFrom(e.target.value)} className="input-field text-xs flex-1 min-w-0" title="From date" />
                    <span className="text-gray-400 text-xs flex-shrink-0">–</span>
                    <input type="date" value={filterDateTo} onChange={e => setFilterDateTo(e.target.value)} className="input-field text-xs flex-1 min-w-0" title="To date" />
                  </div>
                </div>
              </div>
              {meetingsFilterCount > 0 && (
                <div className="mt-3 flex justify-end">
                  <button
                    type="button"
                    onClick={() => { setFilterRep(''); setFilterConference(''); setFilterOutcome(new Set()); setFilterDateFrom(''); setFilterDateTo(''); }}
                    className="text-xs text-gray-500 hover:text-red-500 transition-colors"
                  >
                    Clear all filters
                  </button>
                </div>
              )}
            </div>
          )}

          {isLoading ? (
            <div className="flex items-center justify-center h-32">
              <div className="animate-spin w-8 h-8 border-4 border-brand-secondary border-t-transparent rounded-full" />
            </div>
          ) : filteredMeetings.length === 0 ? (
            <div className="text-center py-12">
              <svg className="w-10 h-10 text-gray-200 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <p className="text-gray-400 text-sm">No meetings match your filters.</p>
            </div>
          ) : (
            <div>
              {/* Sticky column headers */}
              <div className="hidden lg:grid grid-cols-6 px-4 py-1.5 border-b border-gray-100 bg-white text-xs text-gray-400 font-medium uppercase tracking-wide sticky top-0 z-10">
                <div>Contact</div>
                <div>Company</div>
                <div>Type</div>
                <div>Rep</div>
                <div>Outcome</div>
                <div>Notes</div>
              </div>
              {/* Conference groups */}
              {meetingGroups.map((group, idx) => {
                const isExpanded = expandedMeetingConferences.has(group.conferenceId);
                const heldCount = group.meetings.filter(m => m.outcome === 'Held').length;
                const scheduledCount = group.meetings.filter(m => m.outcome === 'Scheduled').length;
                const cancelledCount = group.meetings.filter(m => m.outcome === 'Cancelled').length;
                const rescheduledCount = group.meetings.filter(m => m.outcome === 'Rescheduled').length;
                const noShowCount = group.meetings.filter(m => m.outcome === 'No-Show').length;

                return (
                  <div key={group.conferenceId} className={idx > 0 ? 'border-t border-gray-100' : ''}>
                    {/* Group header */}
                    <div
                      className="flex items-center gap-3 px-4 py-2.5 bg-gray-50 cursor-pointer hover:bg-gray-100 border-b border-gray-100"
                      onClick={() => toggleMeetingConference(group.conferenceId)}
                    >
                      <svg
                        className={`w-4 h-4 text-gray-400 transition-transform flex-shrink-0 ${isExpanded ? 'rotate-0' : '-rotate-90'}`}
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                      <span className="text-sm font-medium text-gray-800">{group.conferenceName}</span>
                      {group.startDate && (
                        <span className="text-xs text-gray-400 ml-1">
                          {formatDate(group.startDate)}
                          {group.location && ` · ${group.location}`}
                        </span>
                      )}
                      <div className="ml-auto flex items-center gap-1.5 flex-wrap">
                        {heldCount > 0 && <span className="px-2 py-0.5 rounded-full text-xs bg-green-100 text-green-700">{heldCount} held</span>}
                        {scheduledCount > 0 && <span className="px-2 py-0.5 rounded-full text-xs bg-blue-100 text-blue-700">{scheduledCount} scheduled</span>}
                        {cancelledCount > 0 && <span className="px-2 py-0.5 rounded-full text-xs bg-red-100 text-red-700">{cancelledCount} cancelled</span>}
                        {rescheduledCount > 0 && <span className="px-2 py-0.5 rounded-full text-xs bg-amber-100 text-amber-700">{rescheduledCount} rescheduled</span>}
                        {noShowCount > 0 && <span className="px-2 py-0.5 rounded-full text-xs bg-red-100 text-red-700">{noShowCount} no-show</span>}
                      </div>
                    </div>
                    {/* Meetings rows */}
                    {isExpanded && (
                      <MeetingsTable
                        meetings={group.meetings}
                        actionOptions={actionOptions}
                        colorMap={colorMaps.action || {}}
                        userOptions={userOptions}
                        onOutcomeChange={handleOutcomeChange}
                        onDelete={handleDeleteMeeting}
                        onNotesClick={(id) => openMeetingNotes(id)}
                        onEdit={async (meetingId, data) => {
                          setMeetings(prev => prev.map(m => m.id === meetingId ? { ...m, ...data } : m));
                          try {
                            const res = await fetch(`/api/meetings/${meetingId}`, {
                              method: 'PUT',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify(data),
                            });
                            if (!res.ok) throw new Error();
                            toast.success('Meeting updated.');
                          } catch {
                            fetchData();
                            toast.error('Failed to update meeting.');
                          }
                        }}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Follow Ups Tab Content */}
      {activeTab === 'followups' && (
        <div className="card p-0 overflow-hidden">
          {/* Card header with filter bar */}
          <div className="px-4 py-3 border-b border-gray-100">
            <div className="flex items-center justify-between gap-3">
              {/* Left: status chips */}
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={() => { setFollowupStatusFilter('overdue'); setFilter('all'); }}
                  className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${followupStatusFilter === 'overdue' ? 'bg-red-50 text-red-700 border-red-300' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'}`}
                >
                  Overdue
                </button>
                {(['All', 'Pending', 'Completed'] as const).map(s => {
                  const key = s.toLowerCase();
                  const isActive = followupStatusFilter === key;
                  return (
                    <button
                      key={s}
                      type="button"
                      onClick={() => {
                        setFollowupStatusFilter(key);
                        if (key === 'pending') setFilter('pending');
                        else if (key === 'completed') setFilter('completed');
                        else setFilter('all');
                      }}
                      className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${isActive ? 'bg-brand-primary text-white border-brand-primary' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'}`}
                    >
                      {s}
                    </button>
                  );
                })}
              </div>
              {/* Right */}
              <div className="flex items-center gap-2 flex-shrink-0">
                <button
                  type="button"
                  onClick={() => setRepFilter('mine')}
                  className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${repFilter === 'mine' ? 'bg-teal-50 text-teal-800 border-teal-300' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'}`}
                >
                  {userName}&apos;s
                </button>
                <button
                  type="button"
                  onClick={() => setRepFilter('all')}
                  className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${repFilter === 'all' ? 'bg-gray-100 text-gray-800 border-gray-300' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'}`}
                >
                  All reps
                </button>
                <button
                  type="button"
                  onClick={() => setFollowUpsFiltersOpen(o => !o)}
                  className={`flex items-center gap-1.5 text-sm bg-transparent border-0 p-0 cursor-pointer transition-colors ${followUpsFilterCount > 0 ? 'text-brand-secondary' : 'text-gray-600 hover:text-gray-900'}`}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
                  </svg>
                  Filters
                  {followUpsFilterCount > 0 && (
                    <span className="bg-brand-secondary text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center leading-none">
                      {followUpsFilterCount}
                    </span>
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* Collapsible filter pane */}
          {followUpsFiltersOpen && (
            <div className="px-6 py-4 border-b border-gray-100 bg-gray-50">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Rep</p>
                  <select value={filterRep} onChange={e => setFilterRep(e.target.value)} className="input-field w-full text-sm">
                    <option value="">All Reps</option>
                    {userOptions.map(u => <option key={u.id} value={String(u.id)}>{u.value}</option>)}
                  </select>
                </div>
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Conference</p>
                  <select value={filterConference} onChange={e => setFilterConference(e.target.value)} className="input-field w-full text-sm">
                    <option value="">All Conferences</option>
                    {conferenceOptions.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Next Step</p>
                  <FilterDropdown
                    label="All next steps..."
                    options={nextStepsOptions}
                    selected={filterNextStep}
                    onToggle={toggleNextStep}
                    onClear={() => setFilterNextStep(new Set())}
                    fullWidth
                  />
                </div>
              </div>
              {followUpsFilterCount > 0 && (
                <div className="mt-3 flex justify-end">
                  <button
                    type="button"
                    onClick={() => { setFilterRep(''); setFilterConference(''); setFilterNextStep(new Set()); }}
                    className="text-xs text-gray-500 hover:text-red-500 transition-colors"
                  >
                    Clear all filters
                  </button>
                </div>
              )}
            </div>
          )}

          {isLoading ? (
            <div className="flex items-center justify-center h-48">
              <div className="animate-spin w-8 h-8 border-4 border-brand-secondary border-t-transparent rounded-full" />
            </div>
          ) : filteredFollowUps.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-gray-400 text-sm">No follow-ups match your filters.</p>
            </div>
          ) : (
            <div>
              {followupGroups.map((group, idx) => {
                const isExpanded = expandedFollowupConferences.has(group.conferenceId);
                const doneCount = group.followUps.filter(fu => fu.completed).length;
                const pendingGroupCount = group.followUps.filter(fu => !fu.completed).length;

                return (
                  <div key={group.conferenceId} className={idx > 0 ? 'border-t border-gray-100' : ''}>
                    {/* Group header */}
                    <div
                      className="flex items-center gap-3 px-4 py-2.5 bg-gray-50 cursor-pointer hover:bg-gray-100 border-b border-gray-100"
                      onClick={() => toggleFollowupConference(group.conferenceId)}
                    >
                      <svg
                        className={`w-4 h-4 text-gray-400 transition-transform flex-shrink-0 ${isExpanded ? 'rotate-0' : '-rotate-90'}`}
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                      <span className="text-sm font-medium text-gray-800">{group.conferenceName}</span>
                      {group.startDate && (
                        <span className="text-xs text-gray-400 ml-1">{formatDate(group.startDate)}</span>
                      )}
                      <div className="ml-auto flex items-center gap-1.5">
                        {doneCount > 0 && <span className="px-2 py-0.5 rounded-full text-xs bg-green-100 text-green-700">{doneCount} done</span>}
                        {pendingGroupCount > 0 && <span className="px-2 py-0.5 rounded-full text-xs bg-gray-100 text-gray-600">{pendingGroupCount} pending</span>}
                      </div>
                    </div>
                    {/* Follow-ups rows */}
                    {isExpanded && (
                      <FollowUpsTable
                        followUps={group.followUps}
                        onToggle={handleToggle}
                        onDelete={handleDeleteFollowUp}
                        userOptions={userOptions}
                        onRepChange={handleRepChange}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Follow-up modal */}
      <AssignFollowUpModal
        isOpen={followUpModalOpen}
        onClose={() => setFollowUpModalOpen(false)}
        onSuccess={() => {
          setFollowUpModalOpen(false);
          fetchData();
        }}
        defaultConferenceId={followUpModalDefaults.conferenceId}
        defaultCompanyId={followUpModalDefaults.companyId}
        defaultAttendeeId={followUpModalDefaults.attendeeId}
      />
    </div>
  );
}
