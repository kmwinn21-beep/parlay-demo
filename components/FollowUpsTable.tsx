'use client';

import { useState, Fragment } from 'react';
import Link from 'next/link';
import { QuickViewDrawer, QuickViewIcon, type QuickViewTarget } from '@/components/QuickViewDrawer';
import { useFollowUpActions, followUpActionLabel } from '@/lib/useFollowUpActions';
import { SlideInPanel } from '@/components/SlideInPanel';
import { getPreset } from '@/lib/colors';
import { useConfigColors } from '@/lib/useConfigColors';
import { FollowUpNotesPopover } from '@/components/FollowUpNotesPopover';
import { RepMultiSelect } from '@/components/RepMultiSelect';
import {
  type UserOption,
  parseRepIds,
  useConfigWithIds,
  resolveConfigValue,
  getRepInitials,
} from '@/lib/useUserOptions';
import { useTableColumnConfig, useCustomColumns } from '@/lib/useTableColumnConfig';
import { CustomColumnCell } from '@/components/CustomColumnCell';

export interface FollowUp {
  id: number;
  attendee_id: number;
  conference_id: number;
  next_steps: string;
  next_steps_notes: string | null;
  follow_up_action?: string | null;
  completed: boolean;
  first_name: string;
  last_name: string;
  title: string | null;
  company_id: number | null;
  company_name: string | null;
  conference_name: string;
  start_date: string;
  entity_notes_count: number;
  assigned_rep: string | null;
  /** Stored as 'YYYY-MM-DD HH:MM:SS'; orders the entries within a grouped row. */
  created_at?: string;
}

interface ConferenceGroup {
  conference_id: number;
  conference_name: string;
  start_date: string;
  tasks: FollowUp[];
}

interface AttendeeSubGroup {
  attendee_id: number;
  first_name: string;
  last_name: string;
  tasks: FollowUp[];
}

interface ConferenceAttendeeGroup {
  conference_id: number;
  conference_name: string;
  start_date: string;
  attendees: AttendeeSubGroup[];
}

function formatDate(d: string) {
  if (!d) return '';
  return new Date(d + 'T00:00:00').toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });
}

/** created_at carries a time; only its date half is shown. */
function formatTimestamp(ts: string | undefined) {
  if (!ts) return '';
  return formatDate(ts.slice(0, 10));
}

/** Oldest first, so a grouped row reads as the interaction history it is. */
/**
 * How many follow-ups an attendee has piled up at one conference, on a scale
 * that reads at a glance: green while it is a normal load, blue once it is
 * getting heavy, red past that. Full-strength text and border over a lighter
 * fill of the same hue.
 */
const FOLLOW_UP_COUNT_STYLES: Record<number, string> = {
  2: 'text-green-600 border-green-300 bg-green-50',
  3: 'text-green-700 border-green-400 bg-green-100',
  4: 'text-green-800 border-green-500 bg-green-200',
  5: 'text-blue-600 border-blue-300 bg-blue-50',
  6: 'text-blue-700 border-blue-400 bg-blue-100',
  7: 'text-blue-800 border-blue-500 bg-blue-200',
};

function FollowUpCountPill({ count }: { count: number }) {
  if (count < 2) return null;
  const style = FOLLOW_UP_COUNT_STYLES[count] ?? 'text-red-700 border-red-500 bg-red-100';
  return (
    <span
      title={`${count} follow-ups`}
      className={`inline-flex items-center justify-center w-5 h-5 rounded-full border text-[10px] font-bold flex-shrink-0 ${style}`}
    >
      {count}
    </span>
  );
}

function sortByCreatedAt(tasks: FollowUp[]): FollowUp[] {
  return [...tasks].sort((a, b) => (a.created_at ?? '').localeCompare(b.created_at ?? ''));
}

function buildConferenceGroups(fus: FollowUp[]): ConferenceGroup[] {
  const map = new Map<number, ConferenceGroup>();
  for (const fu of fus) {
    if (!map.has(fu.conference_id)) {
      map.set(fu.conference_id, {
        conference_id: fu.conference_id,
        conference_name: fu.conference_name || 'Unknown Conference',
        start_date: fu.start_date,
        tasks: [],
      });
    }
    map.get(fu.conference_id)!.tasks.push(fu);
  }
  return Array.from(map.values());
}

function buildConferenceAttendeeGroups(fus: FollowUp[]): ConferenceAttendeeGroup[] {
  const confMap = new Map<number, ConferenceAttendeeGroup>();
  for (const fu of fus) {
    if (!confMap.has(fu.conference_id)) {
      confMap.set(fu.conference_id, {
        conference_id: fu.conference_id,
        conference_name: fu.conference_name || 'Unknown Conference',
        start_date: fu.start_date,
        attendees: [],
      });
    }
    const cg = confMap.get(fu.conference_id)!;
    let ag = cg.attendees.find(a => a.attendee_id === fu.attendee_id);
    if (!ag) {
      ag = { attendee_id: fu.attendee_id, first_name: fu.first_name, last_name: fu.last_name, tasks: [] };
      cg.attendees.push(ag);
    }
    ag.tasks.push(fu);
  }
  return Array.from(confMap.values());
}

/** Render initials pills for a stored assigned_rep value (CSV of IDs or legacy name) */
function RepPills({
  assignedRep,
  userOptions,
  size = 'sm',
}: {
  assignedRep: string | null;
  userOptions: UserOption[];
  size?: 'sm' | 'xs';
}) {
  const colorMaps = useConfigColors();
  const users = parseRepIds(assignedRep).map(id => userOptions.find(u => u.id === id)).filter(Boolean);
  if (users.length === 0) return null;

  const baseClass =
    size === 'xs'
      ? 'inline-flex items-center justify-center gap-1 px-1.5 py-0.5 min-w-[48px] whitespace-nowrap rounded text-[10px] font-medium'
      : 'inline-flex items-center justify-center gap-1 px-1.5 py-0.5 min-w-[48px] whitespace-nowrap rounded text-xs font-medium';

  return (
    <span className="inline-flex flex-wrap gap-1">
      {users.map((user, i) => (
        <span key={i} className={`${baseClass} ${getPreset(colorMaps.user?.[user!.value]).badgeClass}`}>
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-2.5 h-2.5 flex-shrink-0">
            <path d="M10 8a3 3 0 100-6 3 3 0 000 6zM3.465 14.493a1.23 1.23 0 00.41 1.412A9.957 9.957 0 0010 18c2.31 0 4.438-.784 6.131-2.1.43-.333.604-.903.408-1.41a7.002 7.002 0 00-13.074.003z" />
          </svg>
          {getRepInitials(user!.value)}
        </span>
      ))}
    </span>
  );
}

/**
 * Trash that slides out from the left of a follow-up's pill on hover — the
 * same reveal the Plan tab uses for a draft conference. Phones have no hover,
 * so cards keep it visible.
 */
function EntryDeleteButton({ onClick, alwaysVisible }: { onClick: () => void; alwaysVisible?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title="Delete this follow-up"
      aria-label="Delete this follow-up"
      className={`inline-flex items-center justify-center h-5 rounded-full text-red-500 hover:text-red-600 hover:bg-red-50 transition-all flex-shrink-0 overflow-hidden ${
        alwaysVisible
          ? 'w-5 opacity-100 mr-1'
          : 'w-0 opacity-0 mr-0 group-hover/entry:w-5 group-hover/entry:opacity-100 group-hover/entry:mr-1 group-focus-within/entry:w-5 group-focus-within/entry:opacity-100 group-focus-within/entry:mr-1'
      }`}
    >
      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
      </svg>
    </button>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
    </svg>
  );
}

export function FollowUpsTable({
  followUps,
  onToggle,
  onDelete,
  userOptions = [],
  onRepChange,
  onNextStepsChange,
  onFollowUpActionChange,
  detailsInDrawer = false,
  onBulkToggle,
  tableName = 'follow_ups',
  groupBy = 'none',
  namesOpenDrawer = false,
}: {
  followUps: FollowUp[];
  onToggle: (id: number, completed: boolean) => void;
  onDelete?: (id: number) => void;
  userOptions?: UserOption[];
  onRepChange?: (id: number, rep: string | null) => void;
  onNextStepsChange?: (id: number, nextSteps: string) => void;
  /** '' clears the action back to unset. */
  onFollowUpActionChange?: (id: number, action: string) => void;
  /** Open an attendee's entries in the side panel the outreach and social
   *  notes drawers use, instead of unfolding them inside the table. */
  detailsInDrawer?: boolean;
  onBulkToggle?: (ids: number[]) => Promise<void>;
  tableName?: string;
  /**
   * 'attendee' is 'conference-attendee' minus the conference header — for
   * pages that already establish the conference around the table.
   */
  groupBy?: 'conference' | 'conference-attendee' | 'attendee' | 'none';
  /**
   * Clicking a name opens its drawer instead of navigating, and the quick-view
   * eyes drop away — one affordance rather than two.
   */
  namesOpenDrawer?: boolean;
}) {
  const nextStepsOpts = useConfigWithIds('next_steps');
  const followUpActions = useFollowUpActions();

  /**
   * The chosen action, shown by its short name and clickable to change — blank
   * until a rep picks one, and clearable back to blank.
   */
  const actionPill = (fu: FollowUp) => {
    const label = followUpActionLabel(fu.follow_up_action, followUpActions);

    if (canEditAction && editingActionKey === fu.id) {
      return (
        <select
          autoFocus
          className="text-xs border border-brand-primary rounded px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-brand-primary"
          defaultValue={fu.follow_up_action ?? ''}
          onChange={(e) => { onFollowUpActionChange!(fu.id, e.target.value); setEditingActionKey(null); }}
          onBlur={() => setEditingActionKey(null)}
        >
          <option value="">— None —</option>
          {followUpActions.map(opt => (
            <option key={opt.id} value={opt.value}>{opt.shortName}</option>
          ))}
        </select>
      );
    }

    if (!label) {
      return (
        <span
          onClick={canEditAction ? () => setEditingActionKey(fu.id) : undefined}
          className={`text-gray-300 ${canEditAction ? 'cursor-pointer hover:text-brand-secondary transition-colors' : ''}`}
          title={canEditAction ? 'Click to set' : undefined}
        >
          —
        </span>
      );
    }

    return (
      <span
        onClick={canEditAction ? () => setEditingActionKey(fu.id) : undefined}
        title={canEditAction ? 'Click to change' : (fu.follow_up_action ?? '')}
        className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-brand-secondary/10 text-brand-secondary border border-brand-secondary/30 whitespace-nowrap ${canEditAction ? 'cursor-pointer hover:opacity-75 transition-opacity' : ''}`}
      >
        {label}
      </span>
    );
  };
  const { isVisible, orderedColumns } = useTableColumnConfig(tableName);
  const customColumns = useCustomColumns(tableName);
  const [editingRepKey, setEditingRepKey] = useState<number | null>(null);
  const [editingNextStepsKey, setEditingNextStepsKey] = useState<number | null>(null);
  const [editingActionKey, setEditingActionKey] = useState<number | null>(null);
  const [drawerGroupKey, setDrawerGroupKey] = useState<string | null>(null);
  const [quickView, setQuickView] = useState<QuickViewTarget | null>(null);
  const [editingRepIds, setEditingRepIds] = useState<number[]>([]);
  const [expandedTaskIds, setExpandedTaskIds] = useState<Set<number>>(new Set());
  const [bulkLoadingKeys, setBulkLoadingKeys] = useState<Set<string>>(new Set());
  const [bulkErrorKeys, setBulkErrorKeys] = useState<Set<string>>(new Set());
  // Attendee sections start collapsed, the way the meetings table's days do.
  const [expandedGroupKeys, setExpandedGroupKeys] = useState<Set<string>>(new Set());

  const toggleGroupKey = (key: string) => {
    // Where the details live in the panel, the chevron opens it rather than
    // unfolding rows inside the table.
    if (detailsInDrawer) {
      setDrawerGroupKey(prev => (prev === key ? null : key));
      return;
    }
    setExpandedGroupKeys(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  /** Attendee name — a drawer opener or a link, depending on the surface. */
  function attendeeNameNode(fu: FollowUp, className: string) {
    const name = `${fu.first_name} ${fu.last_name}`;
    const openDrawer = () => setQuickView({ type: 'attendee', id: fu.attendee_id, name });
    if (namesOpenDrawer) {
      return (
        <button type="button" onClick={e => { e.stopPropagation(); openDrawer(); }} className={`${className} text-left`} title={name}>
          {name}
        </button>
      );
    }
    return (
      <>
        <QuickViewIcon onClick={openDrawer} />
        <Link href={`/attendees/${fu.attendee_id}`} onClick={e => e.stopPropagation()} className={className} title={name}>
          {name}
        </Link>
      </>
    );
  }

  /** Company name — same treatment. */
  function companyNameNode(fu: FollowUp, className: string) {
    if (!fu.company_name || !fu.company_id) return null;
    const openDrawer = () => setQuickView({ type: 'company', id: fu.company_id!, name: fu.company_name! });
    if (namesOpenDrawer) {
      return (
        <button type="button" onClick={e => { e.stopPropagation(); openDrawer(); }} className={`${className} text-left`}>
          {fu.company_name}
        </button>
      );
    }
    return (
      <>
        <QuickViewIcon onClick={openDrawer} />
        <Link href={`/companies/${fu.company_id}`} onClick={e => e.stopPropagation()} className={className}>
          {fu.company_name}
        </Link>
      </>
    );
  }

  function parseTaskLines(notes: string | null): string[] {
    if (!notes) return [];
    const lines = notes.split('\n').map(l => l.trim()).filter(l => l.startsWith('- '));
    return lines.map(l => l.slice(2));
  }

  const canEditRep = !!onRepChange && userOptions.length > 0;
  const canEditNextSteps = !!onNextStepsChange && nextStepsOpts.length > 0;
  const canEditAction = !!onFollowUpActionChange && followUpActions.length > 0;

  const startEditRep = (fu: FollowUp) => {
    setEditingRepKey(fu.id);
    setEditingRepIds(parseRepIds(fu.assigned_rep));
  };

  const finishEditRep = (followUpId: number, ids: number[]) => {
    const rep = ids.length > 0 ? ids.join(',') : null;
    onRepChange!(followUpId, rep);
    setEditingRepKey(null);
    setEditingRepIds([]);
  };

  async function handleMarkAllDone(groupKey: string, incompleteIds: number[]) {
    if (!onBulkToggle || incompleteIds.length === 0) return;
    setBulkLoadingKeys(prev => new Set(prev).add(groupKey));
    setBulkErrorKeys(prev => { const n = new Set(prev); n.delete(groupKey); return n; });
    try {
      await onBulkToggle(incompleteIds);
    } catch {
      setBulkErrorKeys(prev => new Set(prev).add(groupKey));
    } finally {
      setBulkLoadingKeys(prev => { const n = new Set(prev); n.delete(groupKey); return n; });
    }
  }

  if (followUps.length === 0) {
    return (
      <div className="text-center py-8">
        <svg className="w-10 h-10 text-gray-200 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
        </svg>
        <p className="text-gray-400 text-xs">No follow-ups yet.</p>
      </div>
    );
  }

  // ── Shared row renderers ─────────────────────────────────────────────────────

  function renderMobileCard(fu: FollowUp) {
    const isEditingRep = editingRepKey === fu.id;
    return (
      <div key={fu.id} className={`p-4 ${fu.completed ? 'bg-green-50' : 'bg-white'}`}>
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              {/* The name opens the quick-view drawer; the icon that used to do
                  that is redundant on a phone. */}
              <button
                type="button"
                onClick={() => setQuickView({ type: 'attendee', id: fu.attendee_id, name: `${fu.first_name} ${fu.last_name}` })}
                className="text-sm font-semibold text-brand-secondary hover:underline text-left"
              >
                {fu.first_name} {fu.last_name}
              </button>
              {canEditRep ? (
                isEditingRep ? (
                  <div className="w-40">
                    <RepMultiSelect options={userOptions} selectedIds={editingRepIds} onChange={setEditingRepIds} onClose={(ids) => finishEditRep(fu.id, ids)} placeholder="Select reps..." />
                  </div>
                ) : (
                  <button type="button" onClick={() => startEditRep(fu)} title={fu.assigned_rep ? 'Click to change reps' : 'Click to assign rep'}>
                    {fu.assigned_rep ? (
                      <RepPills assignedRep={fu.assigned_rep} userOptions={userOptions} size="xs" />
                    ) : (
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium text-gray-300 border border-dashed border-gray-200 hover:border-blue-300 hover:text-blue-400 transition-colors">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-2.5 h-2.5">
                          <path d="M10 8a3 3 0 100-6 3 3 0 000 6zM3.465 14.493a1.23 1.23 0 00.41 1.412A9.957 9.957 0 0010 18c2.31 0 4.438-.784 6.131-2.1.43-.333.604-.903.408-1.41a7.002 7.002 0 00-13.074.003z" />
                        </svg>
                        —
                      </span>
                    )}
                  </button>
                )
              ) : fu.assigned_rep ? (
                <RepPills assignedRep={fu.assigned_rep} userOptions={userOptions} size="xs" />
              ) : null}
            </div>
            {fu.title && <p className="text-xs text-gray-500 mt-0.5">{fu.title}</p>}
            {fu.company_name && fu.company_id ? (
              <button
                type="button"
                onClick={() => setQuickView({ type: 'company', id: fu.company_id!, name: fu.company_name! })}
                className="block text-xs text-brand-secondary hover:underline text-left"
              >
                {fu.company_name}
              </button>
            ) : fu.company_name ? (
              <p className="text-xs text-gray-500">{fu.company_name}</p>
            ) : null}
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              type="button"
              onClick={() => onToggle(fu.id, !fu.completed)}
              className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium border-2 transition-all ${
                fu.completed ? 'bg-green-500 text-white border-green-600' : 'bg-white text-gray-500 border-gray-300'
              }`}
            >
              {fu.completed ? (<><CheckIcon className="w-3 h-3" />Done</>) : 'Done'}
            </button>
          </div>
        </div>
        <div className="mt-2">
          {renderNextStepEntry(fu, 0, 'text-xs', 'text-xs text-gray-500', true)}
        </div>
        {/* The action has no column on a phone, so it rides under the source. */}
        <div className="mt-1.5">{actionPill(fu)}</div>
        <div className="mt-1.5 flex items-center gap-2">
          <Link href={`/conferences/${fu.conference_id}`} className="text-xs text-brand-secondary hover:underline">
            {fu.conference_name}
          </Link>
          <span className="text-xs text-gray-400">· {formatDate(fu.start_date)}</span>
          <FollowUpNotesPopover attendeeId={fu.attendee_id} notesCount={Number(fu.entity_notes_count)} conferenceName={fu.conference_name} />
        </div>
      </div>
    );
  }

  function renderDesktopRow(fu: FollowUp) {
    const isEditingRep = editingRepKey === fu.id;
    return (
      <tr key={fu.id} className={`transition-colors align-top ${fu.completed ? 'bg-green-50 hover:bg-green-50' : 'hover:bg-gray-50'}`}>
        {orderedColumns.map(col => {
          if (!isVisible(col.key)) return null;
          switch (col.key) {
            case 'name': return <td key="name" className="px-3 py-2 font-medium text-gray-800 overflow-hidden" style={{ maxWidth: 220 }}>
              <div className="flex items-center gap-1 group">
                {attendeeNameNode(fu, 'text-brand-secondary hover:underline leading-snug block truncate')}
              </div>
            </td>;
            case 'title': return <td key="title" className="px-3 py-2 text-gray-600 leading-snug">{fu.title || <span className="text-gray-300">—</span>}</td>;
            case 'company': return <td key="company" className="px-3 py-2 text-gray-600 leading-snug">
              {fu.company_name && fu.company_id ? (
                <div className="flex items-center gap-1 group">
                  {companyNameNode(fu, 'text-xs text-brand-secondary hover:underline break-words whitespace-normal leading-snug')}
                </div>
              ) : <span className="text-gray-300">—</span>}
            </td>;
            case 'next_step': return <td key="next_step" className="px-3 py-2" style={{ maxWidth: 240 }}>
              {renderNextStepEntry(fu, 0, '', 'text-gray-500')}
            </td>;
            case 'follow_up_action': return <td key="follow_up_action" className="px-3 py-2 text-xs text-gray-600 leading-snug">
              {actionPill(fu)}
            </td>;
            case 'conference': return <td key="conference" className="px-3 py-2 text-gray-600 leading-snug">
              <Link href={`/conferences/${fu.conference_id}`} className="text-brand-secondary hover:underline">{fu.conference_name}</Link>
              <p className="text-gray-400">{formatDate(fu.start_date)}</p>
            </td>;
            case 'rep': return <td key="rep" className="px-3 py-2">
              {canEditRep && isEditingRep ? (
                <div className="w-36">
                  <RepMultiSelect options={userOptions} selectedIds={editingRepIds} onChange={setEditingRepIds} onClose={(ids) => finishEditRep(fu.id, ids)} placeholder="Select reps..." />
                </div>
              ) : canEditRep ? (
                <button type="button" onClick={() => startEditRep(fu)} className="group inline-flex items-center gap-1 cursor-pointer hover:opacity-80 transition-opacity" title={fu.assigned_rep ? 'Click to change reps' : 'Click to assign rep'}>
                  {fu.assigned_rep ? (<RepPills assignedRep={fu.assigned_rep} userOptions={userOptions} />) : (<span className="text-gray-300 group-hover:text-blue-400 transition-colors">—</span>)}
                </button>
              ) : (
                fu.assigned_rep ? (<RepPills assignedRep={fu.assigned_rep} userOptions={userOptions} />) : (<span className="text-gray-300">—</span>)
              )}
            </td>;
            case 'notes': return <td key="notes" className="px-3 py-2">
              <FollowUpNotesPopover attendeeId={fu.attendee_id} notesCount={Number(fu.entity_notes_count)} conferenceName={fu.conference_name} />
            </td>;
            case 'status': return <td key="status" className="px-3 py-2">
              <button type="button" onClick={() => onToggle(fu.id, !fu.completed)} className={`flex items-center gap-1 px-2 py-1 rounded-lg font-medium border-2 transition-all whitespace-nowrap ${fu.completed ? 'bg-green-500 text-white border-green-600 hover:bg-green-600' : 'bg-white text-gray-500 border-gray-300 hover:border-green-400 hover:text-green-600'}`}>
                {fu.completed ? (<><CheckIcon className="w-3 h-3 flex-shrink-0" />Done</>) : 'Done'}
              </button>
            </td>;
            default: return null;
          }
        })}
        {customColumns.filter(c => c.visible).map(col => (
          <td key={`custom_${col.id}`} className="px-3 py-2">
            <CustomColumnCell column={col} value={(fu as unknown as Record<string, unknown>)[col.data_key]} />
          </td>
        ))}
      </tr>
    );
  }

  // ── Consolidated attendee row (one row, one entry per follow-up) ─────────────

  /** The subtext under a next-step badge, revealed by the entry's chevron. */
  function renderNextStepNotes(fu: FollowUp, textCls: string) {
    if (!fu.next_steps_notes) return null;
    const taskLines = parseTaskLines(fu.next_steps_notes);
    const lines = taskLines.length > 0
      ? taskLines.map(l => `- ${l}`)
      : fu.next_steps_notes.split('\n').map(l => l.trim()).filter(Boolean);
    return (
      <div className="mt-1">
        {lines.map((line, i) => (
          <p key={i} className={`${textCls} leading-snug${i > 0 ? ' mt-1.5' : ''}`}>{line}</p>
        ))}
      </div>
    );
  }

  /**
   * One follow-up: its badge with a hover-delete on the left and a chevron on
   * the right, the date it landed underneath, and the subtext behind the
   * chevron. Used for single rows and for each entry of a grouped row.
   */
  function renderNextStepEntry(fu: FollowUp, i: number, badgeExtraCls: string, notesCls: string, deleteAlwaysVisible = false) {
    const hasNotes = !!fu.next_steps_notes;
    const isExpanded = expandedTaskIds.has(fu.id);
    return (
      <div key={fu.id} className={`group/entry ${i > 0 ? 'pt-1.5 mt-1.5 border-t border-gray-100' : ''}`}>
        <div className="flex items-center gap-1 min-w-0">
          {onDelete && <EntryDeleteButton onClick={() => onDelete(fu.id)} alwaysVisible={deleteAlwaysVisible} />}
          {canEditNextSteps && editingNextStepsKey === fu.id ? (
            <select
              autoFocus
              className="text-xs border border-brand-primary rounded px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-brand-primary"
              defaultValue={fu.next_steps}
              onChange={(e) => { onNextStepsChange!(fu.id, e.target.value); setEditingNextStepsKey(null); }}
              onBlur={() => setEditingNextStepsKey(null)}
            >
              {nextStepsOpts.map(opt => (
                <option key={opt.id} value={String(opt.id)}>{opt.value}</option>
              ))}
            </select>
          ) : (
            <span
              onClick={canEditNextSteps ? () => setEditingNextStepsKey(fu.id) : undefined}
              className={`inline-flex px-2 py-0.5 rounded-lg font-medium leading-snug ${badgeExtraCls} ${fu.completed ? 'bg-green-100 text-green-700' : 'bg-brand-primary text-white'} ${canEditNextSteps ? 'cursor-pointer hover:opacity-75 transition-opacity' : ''}`}
              title={canEditNextSteps ? 'Click to change' : undefined}
            >
              {resolveConfigValue(fu.next_steps, nextStepsOpts)}
            </span>
          )}
          {hasNotes && (
            <button
              type="button"
              onClick={() => setExpandedTaskIds(prev => { const n = new Set(prev); if (n.has(fu.id)) n.delete(fu.id); else n.add(fu.id); return n; })}
              aria-expanded={isExpanded}
              title={isExpanded ? 'Hide details' : 'Show details'}
              className="flex-shrink-0 p-0.5 text-gray-400 hover:text-brand-secondary transition-colors"
            >
              <svg className={`w-3.5 h-3.5 transition-transform ${isExpanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
          )}
        </div>
        {fu.created_at && (
          <p className="text-gray-400 text-[10px] leading-snug mt-0.5">{formatTimestamp(fu.created_at)}</p>
        )}
        {isExpanded && renderNextStepNotes(fu, notesCls)}
      </div>
    );
  }

  /**
   * The group's rep, shown once. Editing it writes to every follow-up in the
   * group — one onRepChange per row, the same shape the bulk Done uses.
   */
  function renderGroupRepBody(rows: FollowUp[], size: 'sm' | 'xs' = 'sm') {
    const head = rows[0];
    // They almost always match; when they don't, the union is what's true.
    const unionRep = Array.from(new Set(rows.flatMap(r => parseRepIds(r.assigned_rep)))).join(',') || null;
    if (canEditRep && editingRepKey === head.id) {
      return (
        <div className="w-36">
          <RepMultiSelect
            options={userOptions}
            selectedIds={editingRepIds}
            onChange={setEditingRepIds}
            onClose={(ids) => {
              const rep = ids.length > 0 ? ids.join(',') : null;
              rows.forEach(r => onRepChange!(r.id, rep));
              setEditingRepKey(null);
              setEditingRepIds([]);
            }}
            placeholder="Select reps..."
          />
        </div>
      );
    }
    if (canEditRep) {
      return (
        <button
          type="button"
          onClick={() => { setEditingRepKey(head.id); setEditingRepIds(parseRepIds(unionRep)); }}
          className="group inline-flex items-center gap-1 cursor-pointer hover:opacity-80 transition-opacity"
          title={unionRep ? 'Click to change reps for all of this attendee\u2019s follow-ups' : 'Click to assign rep'}
        >
          {unionRep ? (<RepPills assignedRep={unionRep} userOptions={userOptions} size={size} />) : (<span className="text-gray-300 group-hover:text-blue-400 transition-colors">—</span>)}
        </button>
      );
    }
    return unionRep
      ? <RepPills assignedRep={unionRep} userOptions={userOptions} size={size} />
      : <span className="text-gray-300">—</span>;
  }

  /**
   * The group's single Done control. It fires one PATCH per underlying row
   * through the same onBulkToggle path a "Mark all done" click uses.
   */
  function renderGroupDoneButton(groupKey: string, rows: FollowUp[]) {
    const incompleteIds = rows.filter(t => !t.completed).map(t => t.id);
    const allDone = incompleteIds.length === 0;
    const isLoading = bulkLoadingKeys.has(groupKey);
    const hasError = bulkErrorKeys.has(groupKey);
    return (
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          disabled={allDone || isLoading || !onBulkToggle}
          onClick={() => handleMarkAllDone(groupKey, incompleteIds)}
          title={allDone ? 'All follow-ups complete' : `Mark ${incompleteIds.length} follow-up${incompleteIds.length === 1 ? '' : 's'} done`}
          className={`flex items-center gap-1 px-2 py-1 rounded-lg font-medium border-2 transition-all whitespace-nowrap ${
            allDone
              ? 'bg-green-500 text-white border-green-600 cursor-default'
              : 'bg-white text-gray-500 border-gray-300 hover:border-green-400 hover:text-green-600 disabled:opacity-50'
          }`}
        >
          {allDone ? (<><CheckIcon className="w-3 h-3 flex-shrink-0" />Done</>) : isLoading ? 'Saving…' : 'Done'}
        </button>
        {hasError && <span className="text-[10px] text-red-500">Failed</span>}
      </div>
    );
  }

  /**
   * Collapsed section header for one attendee: who they are, where, who owns
   * them, and a chevron on the right that opens their follow-ups.
   */
  function renderAttendeeBar(rows: FollowUp[], groupKey: string) {
    const head = rows[0];
    const expanded = detailsInDrawer ? drawerGroupKey === groupKey : expandedGroupKeys.has(groupKey);
    return (
      <div
        role="button"
        tabIndex={0}
        onClick={() => toggleGroupKey(groupKey)}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleGroupKey(groupKey); } }}
        aria-expanded={expanded}
        className="w-full flex items-start gap-2 cursor-pointer"
      >
        {/* One line from sm; stacked on a phone, where it would otherwise
            truncate every field down to a couple of characters. */}
        <div className="flex-1 min-w-0 flex flex-col gap-0.5 sm:flex-row sm:items-center sm:gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            {attendeeNameNode(head, 'text-xs font-semibold text-brand-secondary hover:underline truncate')}
          </div>
          {head.title && <span className="text-xs text-gray-500 truncate">{head.title}</span>}
          <div className="flex items-center gap-1 min-w-0">
            {head.company_name && (
              <>
                <span className="hidden sm:inline text-gray-300">·</span>
                {head.company_id
                  ? companyNameNode(head, 'text-xs text-brand-secondary hover:underline truncate')
                  : <span className="text-xs text-gray-500 truncate">{head.company_name}</span>}
              </>
            )}
            {head.conference_name && (
              <>
                <span className="text-gray-300">·</span>
                <span className="text-xs text-gray-500 truncate">{head.conference_name}</span>
              </>
            )}
          </div>
        </div>
        <span className="flex items-center gap-2 flex-shrink-0 pt-0.5 sm:pt-0">
          {renderGroupRepBody(rows, 'xs')}
          <FollowUpCountPill count={rows.length} />
          <svg
            className={`w-3.5 h-3.5 text-gray-400 flex-shrink-0 transition-transform ${expanded ? '' : '-rotate-90'}`}
            fill="none" stroke="currentColor" viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </span>
      </div>
    );
  }

  /**
   * Desktop bar: a real table row, so each field lands under its own column
   * heading instead of running together on one line.
   */
  function renderAttendeeBarRow(rows: FollowUp[], groupKey: string) {
    const head = rows[0];
    const expanded = detailsInDrawer ? drawerGroupKey === groupKey : expandedGroupKeys.has(groupKey);
    const visibleKeys = orderedColumns.filter(c => isVisible(c.key)).map(c => c.key);
    const visibleCustom = customColumns.filter(c => c.visible);
    // The chevron rides the final column, whichever that turns out to be.
    const lastKey = visibleCustom.length > 0 ? null : visibleKeys[visibleKeys.length - 1];

    const chevron = (
      <svg
        className={`w-3.5 h-3.5 text-gray-400 flex-shrink-0 transition-transform ${expanded ? '' : '-rotate-90'}`}
        fill="none" stroke="currentColor" viewBox="0 0 24 24"
      >
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
      </svg>
    );
    const cell = (key: string, body: React.ReactNode, extra = '') => (
      <td key={key} className={`px-3 py-2 align-middle ${extra}`}>
        {key === lastKey
          ? <div className="flex items-center justify-between gap-2">{body}{chevron}</div>
          : body}
      </td>
    );

    return (
      <tr
        key={groupKey}
        role="button"
        tabIndex={0}
        onClick={() => toggleGroupKey(groupKey)}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleGroupKey(groupKey); } }}
        aria-expanded={expanded}
        className="bg-gray-50 border-y border-gray-200 cursor-pointer hover:bg-gray-100 transition-colors"
      >
        {orderedColumns.map(col => {
          if (!isVisible(col.key)) return null;
          switch (col.key) {
            case 'name': return cell('name',
              <span className="flex items-center gap-1.5 min-w-0">
                {attendeeNameNode(head, 'text-xs font-semibold text-brand-secondary hover:underline truncate')}
              </span>, 'overflow-hidden');
            case 'title': return cell('title',
              <span className="text-xs text-gray-500 truncate block">{head.title || <span className="text-gray-300">—</span>}</span>);
            case 'company': return cell('company',
              head.company_name
                ? <span className="flex items-center gap-1 min-w-0">
                    {head.company_id
                      ? companyNameNode(head, 'text-xs text-brand-secondary hover:underline truncate')
                      : <span className="text-xs text-gray-500 truncate">{head.company_name}</span>}
                  </span>
                : <span className="text-gray-300">—</span>);
            case 'next_step': return cell('next_step', <span />);
            case 'follow_up_action': return cell('follow_up_action', <span />);
            case 'conference': return cell('conference',
              <span className="text-xs text-gray-500 truncate block">{head.conference_name}</span>);
            case 'rep': return cell('rep',
              <span className="flex items-center gap-2">
                {/* The reps get a fixed block so the count pill beside them
                    lands on the same x down the whole table. */}
                <span className="min-w-[3.5rem]">{renderGroupRepBody(rows, 'xs')}</span>
                <span className="w-5 flex-shrink-0 flex justify-center">
                  <FollowUpCountPill count={rows.length} />
                </span>
              </span>);
            case 'notes': return cell('notes', <span />);
            case 'status': return cell('status', <span />);
            default: return null;
          }
        })}
        {visibleCustom.map((col, i) => (
          <td key={`custom_${col.id}`} className="px-3 py-2 align-middle">
            {i === visibleCustom.length - 1 ? <div className="flex items-center justify-end">{chevron}</div> : null}
          </td>
        ))}
      </tr>
    );
  }

  /** Desktop: one table row for an attendee, entries stacked inside the cells. */
  function renderAttendeeGroupRow(rows: FollowUp[], groupKey: string) {
    const head = rows[0];
    const allDone = rows.every(r => r.completed);
    return (
      <tr key={groupKey} className={`transition-colors align-top ${allDone ? 'bg-green-50 hover:bg-green-50' : 'hover:bg-gray-50'}`}>
        {orderedColumns.map(col => {
          if (!isVisible(col.key)) return null;
          switch (col.key) {
            case 'name': return <td key="name" className="px-3 py-2 font-medium text-gray-800 overflow-hidden" style={{ maxWidth: 220 }}>
              <div className="flex items-center gap-1 group">
                {attendeeNameNode(head, 'text-brand-secondary hover:underline leading-snug block truncate')}
              </div>
            </td>;
            case 'title': return <td key="title" className="px-3 py-2 text-gray-600 leading-snug">{head.title || <span className="text-gray-300">—</span>}</td>;
            case 'company': return <td key="company" className="px-3 py-2 text-gray-600 leading-snug">
              {head.company_name && head.company_id ? (
                <div className="flex items-center gap-1 group">
                  {companyNameNode(head, 'text-xs text-brand-secondary hover:underline break-words whitespace-normal leading-snug')}
                </div>
              ) : <span className="text-gray-300">—</span>}
            </td>;
            case 'next_step': return <td key="next_step" className="px-3 py-2" style={{ maxWidth: 240 }}>
              {rows.map((row, i) => renderNextStepEntry(row, i, '', 'text-gray-500'))}
            </td>;
            case 'follow_up_action': return <td key="follow_up_action" className="px-3 py-2 text-xs text-gray-600 leading-snug">
              {rows.map(row => <div key={row.id} className="py-1.5">{actionPill(row)}</div>)}
            </td>;
            case 'conference': return <td key="conference" className="px-3 py-2 text-gray-600 leading-snug">
              <Link href={`/conferences/${head.conference_id}`} className="text-brand-secondary hover:underline">{head.conference_name}</Link>
              <p className="text-gray-400">{formatDate(head.start_date)}</p>
            </td>;
            case 'rep': return <td key="rep" className="px-3 py-2">
              {renderGroupRepBody(rows)}
            </td>;
            case 'notes': return <td key="notes" className="px-3 py-2">
              <FollowUpNotesPopover attendeeId={head.attendee_id} notesCount={Number(head.entity_notes_count)} conferenceName={head.conference_name} />
            </td>;
            case 'status': return <td key="status" className="px-3 py-2">
              {renderGroupDoneButton(groupKey, rows)}
            </td>;
            default: return null;
          }
        })}
        {customColumns.filter(c => c.visible).map(col => (
          <td key={`custom_${col.id}`} className="px-3 py-2">
            <CustomColumnCell column={col} value={(head as unknown as Record<string, unknown>)[col.data_key]} />
          </td>
        ))}
      </tr>
    );
  }

  /** Mobile twin of the row above. */
  function renderAttendeeGroupCard(rows: FollowUp[], groupKey: string) {
    const head = rows[0];
    const allDone = rows.every(r => r.completed);
    return (
      <div key={groupKey} className={`p-4 ${allDone ? 'bg-green-50' : 'bg-white'}`}>
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <button
              type="button"
              onClick={() => setQuickView({ type: 'attendee', id: head.attendee_id, name: `${head.first_name} ${head.last_name}` })}
              className="text-sm font-semibold text-brand-secondary hover:underline text-left"
            >
              {head.first_name} {head.last_name}
            </button>
            {head.title && <p className="text-xs text-gray-500 mt-0.5">{head.title}</p>}
            {head.company_name && head.company_id ? (
              <button
                type="button"
                onClick={() => setQuickView({ type: 'company', id: head.company_id!, name: head.company_name! })}
                className="block text-xs text-brand-secondary hover:underline text-left"
              >
                {head.company_name}
              </button>
            ) : head.company_name ? (
              <p className="text-xs text-gray-500">{head.company_name}</p>
            ) : null}
          </div>
          <div className="flex items-center gap-2 flex-shrink-0 text-xs">
            {renderGroupRepBody(rows, 'xs')}
            {renderGroupDoneButton(groupKey, rows)}
          </div>
        </div>
        <div className="mt-2 space-y-1.5">
          {rows.map((row, i) => (
            <div key={row.id}>
              {renderNextStepEntry(row, i, 'text-xs', 'text-xs text-gray-500', true)}
              <div className="mt-1.5">{actionPill(row)}</div>
            </div>
          ))}
        </div>
        <div className="mt-1.5 flex items-center gap-2">
          <Link href={`/conferences/${head.conference_id}`} className="text-xs text-brand-secondary hover:underline">
            {head.conference_name}
          </Link>
          <span className="text-xs text-gray-400">· {formatDate(head.start_date)}</span>
          <FollowUpNotesPopover attendeeId={head.attendee_id} notesCount={Number(head.entity_notes_count)} conferenceName={head.conference_name} />
        </div>
      </div>
    );
  }

  // ── Bulk action UI helpers ───────────────────────────────────────────────────

  function renderMarkAllDoneButton(groupKey: string, incompleteIds: number[]) {
    const isLoading = bulkLoadingKeys.has(groupKey);
    const hasError = bulkErrorKeys.has(groupKey);
    const allDone = incompleteIds.length === 0;

    return (
      <div className="flex items-center gap-2">
        {hasError && <span className="text-xs text-red-500">Failed — try again</span>}
        {allDone ? (
          <span className="flex items-center gap-1 text-xs text-green-600 font-medium">
            <CheckIcon className="w-3 h-3" />
            All done
          </span>
        ) : incompleteIds.length >= 2 && onBulkToggle ? (
          <button
            type="button"
            onClick={() => handleMarkAllDone(groupKey, incompleteIds)}
            disabled={isLoading}
            className="text-xs px-2 py-1 rounded border border-gray-300 text-gray-600 hover:border-brand-primary hover:text-brand-primary transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? 'Saving…' : 'Mark all done'}
          </button>
        ) : null}
      </div>
    );
  }

  // ── Flat list mode (default) ─────────────────────────────────────────────────

  if (groupBy === 'none') {
    return (
      <>
        {/* Mobile card layout */}
        <div className="block lg:hidden divide-y divide-gray-100">
          {followUps.map(fu => renderMobileCard(fu))}
        </div>

        {/* Desktop table layout */}
        <div className="hidden lg:block overflow-x-auto">
          <table className="w-full" style={{ fontSize: '0.7rem' }}>
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                {orderedColumns.map(col => {
                  if (!isVisible(col.key)) return null;
                  const thCls = "px-3 py-2 text-left font-semibold text-gray-500 uppercase tracking-wider";
                  switch (col.key) {
                    case 'name': return <th key="name" className={thCls}>Name</th>;
                    case 'title': return <th key="title" className={thCls}>Title</th>;
                    case 'company': return <th key="company" className={thCls}>Company</th>;
                    case 'next_step': return <th key="next_step" className={thCls}>Source</th>;
                    case 'follow_up_action': return <th key="follow_up_action" className={thCls}>Follow Up Action</th>;
                    case 'conference': return <th key="conference" className={thCls}>Conference</th>;
                    case 'rep': return <th key="rep" className={thCls}>Rep</th>;
                    case 'notes': return <th key="notes" className={thCls}>Notes</th>;
                    case 'status': return <th key="status" className={thCls}>Status</th>;
                    default: return null;
                  }
                })}
                {customColumns.filter(c => c.visible).map(col => (
                  <th key={`custom_${col.id}`} className="px-3 py-2 text-left font-semibold text-gray-500 uppercase tracking-wider">{col.label}</th>
                ))}
                </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {followUps.map(fu => renderDesktopRow(fu))}
            </tbody>
          </table>
        </div>
        {quickView && (
          <QuickViewDrawer target={quickView} onClose={() => setQuickView(null)} />
        )}
      </>
    );
  }

  // ── Conference-grouped mode (attendee page) ──────────────────────────────────

  if (groupBy === 'conference') {
    const groups = buildConferenceGroups(followUps);

    return (
      <>
        {/* Mobile */}
        <div className="block lg:hidden">
          {groups.map((group, gi) => {
            const incompleteIds = group.tasks.filter(t => !t.completed).map(t => t.id);
            const groupKey = String(group.conference_id);
            return (
              <div key={group.conference_id} className={gi > 0 ? 'mt-4' : ''}>
                {/* Conference group header */}
                <div className="px-4 py-2 bg-gray-50 border-y border-gray-100 flex items-center justify-between">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-xs font-semibold text-gray-700 truncate">{group.conference_name}</span>
                    <span className="text-xs text-gray-400 flex-shrink-0">{formatDate(group.start_date)}</span>
                  </div>
                  {renderMarkAllDoneButton(groupKey, incompleteIds)}
                </div>
                <div className="divide-y divide-gray-100">
                  {group.tasks.map(fu => renderMobileCard(fu))}
                </div>
              </div>
            );
          })}
        </div>

        {/* Desktop */}
        <div className="hidden lg:block overflow-x-auto">
          <table className="w-full" style={{ fontSize: '0.7rem' }}>
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                {orderedColumns.map(col => {
                  if (!isVisible(col.key)) return null;
                  const thCls = "px-3 py-2 text-left font-semibold text-gray-500 uppercase tracking-wider";
                  switch (col.key) {
                    case 'name': return <th key="name" className={thCls}>Name</th>;
                    case 'title': return <th key="title" className={thCls}>Title</th>;
                    case 'company': return <th key="company" className={thCls}>Company</th>;
                    case 'next_step': return <th key="next_step" className={thCls}>Source</th>;
                    case 'follow_up_action': return <th key="follow_up_action" className={thCls}>Follow Up Action</th>;
                    case 'conference': return <th key="conference" className={thCls}>Conference</th>;
                    case 'rep': return <th key="rep" className={thCls}>Rep</th>;
                    case 'notes': return <th key="notes" className={thCls}>Notes</th>;
                    case 'status': return <th key="status" className={thCls}>Status</th>;
                    default: return null;
                  }
                })}
                {customColumns.filter(c => c.visible).map(col => (
                  <th key={`custom_${col.id}`} className="px-3 py-2 text-left font-semibold text-gray-500 uppercase tracking-wider">{col.label}</th>
                ))}
                </tr>
            </thead>
            <tbody>
              {groups.map((group, gi) => {
                const incompleteIds = group.tasks.filter(t => !t.completed).map(t => t.id);
                const groupKey = String(group.conference_id);
                return (
                  <Fragment key={group.conference_id}>
                    {/* Spacer between groups */}
                    {gi > 0 && (
                      <tr>
                        <td colSpan={100} className="h-3 bg-white p-0 border-0" />
                      </tr>
                    )}
                    {/* Conference group header row */}
                    <tr className="bg-gray-50 border-y border-gray-200">
                      <td colSpan={100} className="px-3 py-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-semibold text-gray-700">{group.conference_name}</span>
                            <span className="text-xs text-gray-400">{formatDate(group.start_date)}</span>
                          </div>
                          {renderMarkAllDoneButton(groupKey, incompleteIds)}
                        </div>
                      </td>
                    </tr>
                    {/* Task rows */}
                    {group.tasks.map(fu => renderDesktopRow(fu))}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
        {quickView && (
          <QuickViewDrawer target={quickView} onClose={() => setQuickView(null)} />
        )}
      </>
    );
  }

  // ── Conference + attendee grouped mode ───────────────────────────────────────
  // One row per attendee, their follow-ups stacked inside the cells. 'attendee'
  // is the same thing without the conference header, for pages that already
  // establish the conference around the table.

  /**
   * One follow-up as the panel shows it: the date it landed and the word
   * Action as eyebrows over a single row carrying the source pill and the
   * action pill. The trash stays hidden until the entry is hovered, as it does
   * in the table.
   */
  function renderDrawerEntry(fu: FollowUp) {
    const hasNotes = !!fu.next_steps_notes;
    const isExpanded = expandedTaskIds.has(fu.id);
    return (
      <div
        key={fu.id}
        className={`group/entry rounded-lg border p-2 ${fu.completed ? 'border-green-200 bg-green-50' : 'border-gray-200 bg-white'}`}
      >
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide leading-snug mb-1">
              {fu.created_at ? formatTimestamp(fu.created_at) : '\u00A0'}
            </p>
            <div className="flex items-center gap-1 min-w-0">
              {onDelete && <EntryDeleteButton onClick={() => onDelete(fu.id)} />}
              {canEditNextSteps && editingNextStepsKey === fu.id ? (
                <select
                  autoFocus
                  className="text-xs border border-brand-primary rounded px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-brand-primary"
                  defaultValue={fu.next_steps}
                  onChange={(e) => { onNextStepsChange!(fu.id, e.target.value); setEditingNextStepsKey(null); }}
                  onBlur={() => setEditingNextStepsKey(null)}
                >
                  {nextStepsOpts.map(opt => (
                    <option key={opt.id} value={String(opt.id)}>{opt.value}</option>
                  ))}
                </select>
              ) : (
                <span
                  onClick={canEditNextSteps ? () => setEditingNextStepsKey(fu.id) : undefined}
                  className={`inline-flex px-2 py-0.5 rounded-lg text-xs font-medium leading-snug ${fu.completed ? 'bg-green-100 text-green-700' : 'bg-brand-primary text-white'} ${canEditNextSteps ? 'cursor-pointer hover:opacity-75 transition-opacity' : ''}`}
                  title={canEditNextSteps ? 'Click to change' : undefined}
                >
                  {resolveConfigValue(fu.next_steps, nextStepsOpts)}
                </span>
              )}
              {hasNotes && (
                <button
                  type="button"
                  onClick={() => setExpandedTaskIds(prev => { const n = new Set(prev); if (n.has(fu.id)) n.delete(fu.id); else n.add(fu.id); return n; })}
                  aria-expanded={isExpanded}
                  title={isExpanded ? 'Hide details' : 'Show details'}
                  className="flex-shrink-0 p-0.5 text-gray-400 hover:text-brand-secondary transition-colors"
                >
                  <svg className={`w-3.5 h-3.5 transition-transform ${isExpanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
              )}
            </div>
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide leading-snug mb-1">Action</p>
            {actionPill(fu)}
          </div>
          {/* Where the entry stands, so a finished one reads at a glance. */}
          <div className="flex-shrink-0 pt-[18px]">
            {fu.completed ? (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-green-100 text-green-700 border border-green-300 whitespace-nowrap">
                <CheckIcon className="w-3 h-3 flex-shrink-0" />
                Done
              </span>
            ) : (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-50 text-amber-700 border border-amber-300 whitespace-nowrap">
                Pending
              </span>
            )}
          </div>
        </div>
        {isExpanded && renderNextStepNotes(fu, 'text-xs text-gray-500')}
      </div>
    );
  }

  /**
   * The expanded detail, moved into the side panel. Every control is the same
   * renderer the table rows use, so the source pill, the action pill, the rep
   * picker, the notes and Done all edit exactly as they do inline.
   */
  function renderDetailsPanel(groupKey: string) {
    const group = confAttGroups
      .flatMap(cg => cg.attendees.map(ag => ({ cg, ag })))
      .find(({ cg, ag }) => `${cg.conference_id}-${ag.attendee_id}` === groupKey);
    if (!group) return null;
    const rows = sortByCreatedAt(group.ag.tasks);
    const head = rows[0];
    if (!head) return null;

    return (
      <SlideInPanel
        title={<span className="text-sm">{head.first_name} {head.last_name}</span>}
        subtitle={[head.title, head.company_name].filter(Boolean).join(' · ')}
        onClose={() => setDrawerGroupKey(null)}
        footer={
          <div className="flex items-center justify-between gap-2">
            <FollowUpNotesPopover
              attendeeId={head.attendee_id}
              notesCount={Number(head.entity_notes_count)}
              conferenceName={head.conference_name}
            />
            {renderGroupDoneButton(groupKey, rows)}
          </div>
        }
      >
        <div className="p-3 space-y-3">
          {/* Conference and rep share a line — both are context for the list. */}
          <div className="flex items-start gap-4">
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1">Conference</p>
              <Link href={`/conferences/${head.conference_id}`} className="text-xs text-brand-secondary hover:underline">
                {head.conference_name}
              </Link>
              <p className="text-[10px] text-gray-400">{formatDate(head.start_date)}</p>
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1">Rep</p>
              {renderGroupRepBody(rows)}
            </div>
          </div>

          <div>
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1">
              Follow Ups ({rows.length})
            </p>
            <div className="space-y-2">
              {rows.map(row => renderDrawerEntry(row))}
            </div>
          </div>
        </div>
      </SlideInPanel>
    );
  }

  const confAttGroups = buildConferenceAttendeeGroups(followUps);
  const showConferenceHeader = groupBy === 'conference-attendee';
  const anyGroupExpanded = expandedGroupKeys.size > 0;

  const drawer = detailsInDrawer && drawerGroupKey ? renderDetailsPanel(drawerGroupKey) : null;

  return (
    <>
      {/* Mobile */}
      <div className="block lg:hidden">
        {confAttGroups.map((cg, cgi) => (
          <div key={cg.conference_id} className={cgi > 0 && showConferenceHeader ? 'mt-4' : ''}>
            {showConferenceHeader && (
              <div className="px-4 py-2 bg-gray-50 border-y border-gray-100">
                <span className="text-xs font-semibold text-gray-700">{cg.conference_name}</span>
                <span className="text-xs text-gray-400 ml-2">{formatDate(cg.start_date)}</span>
              </div>
            )}
            <div className="divide-y divide-gray-100">
              {cg.attendees.map(ag => {
                const rows = sortByCreatedAt(ag.tasks);
                const subKey = `${cg.conference_id}-${ag.attendee_id}`;
                const expanded = expandedGroupKeys.has(subKey);
                return (
                  <div key={subKey}>
                    <div className="px-4 py-2 bg-gray-50">
                      {renderAttendeeBar(rows, subKey)}
                    </div>
                    {/* A single follow-up renders exactly as it always has. */}
                    {!detailsInDrawer && expanded && (rows.length === 1
                      ? renderMobileCard(rows[0])
                      : renderAttendeeGroupCard(rows, subKey))}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Desktop — the panel takes a column beside the table when open. The
          row itself is always mounted so the panel renders once and handles
          its own phone form (a bottom sheet) from inside. */}
      <div className="lg:flex lg:items-stretch">
      <div className="hidden lg:block flex-1 min-w-0 overflow-x-auto">
        <table className="w-full" style={{ fontSize: '0.7rem' }}>
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              {orderedColumns.map(col => {
                if (!isVisible(col.key)) return null;
                const thCls = "px-3 py-2 text-left font-semibold text-gray-500 uppercase tracking-wider";
                switch (col.key) {
                  case 'name': return <th key="name" className={thCls}>Name</th>;
                  case 'title': return <th key="title" className={thCls}>Title</th>;
                  case 'company': return <th key="company" className={thCls}>Company</th>;
                  // These three only carry values inside an open section, so
                  // their headings wait until one is open.
                  case 'next_step': return <th key="next_step" className={thCls}>{anyGroupExpanded ? 'Source' : ''}</th>;
                  case 'follow_up_action': return <th key="follow_up_action" className={thCls}>{anyGroupExpanded ? 'Follow Up Action' : ''}</th>;
                  case 'conference': return <th key="conference" className={thCls}>Conference</th>;
                  case 'rep': return <th key="rep" className={thCls}>Rep</th>;
                  case 'notes': return <th key="notes" className={thCls}>{anyGroupExpanded ? 'Notes' : ''}</th>;
                  case 'status': return <th key="status" className={thCls}>{anyGroupExpanded ? 'Status' : ''}</th>;
                  default: return null;
                }
              })}
              {customColumns.filter(c => c.visible).map(col => (
                <th key={`custom_${col.id}`} className="px-3 py-2 text-left font-semibold text-gray-500 uppercase tracking-wider">{col.label}</th>
              ))}
            </tr>
          </thead>
          <tbody className={showConferenceHeader ? '' : 'divide-y divide-gray-100'}>
            {confAttGroups.map((cg, cgi) => (
              <Fragment key={cg.conference_id}>
                {showConferenceHeader && cgi > 0 && (
                  <tr>
                    <td colSpan={100} className="h-3 bg-white p-0 border-0" />
                  </tr>
                )}
                {showConferenceHeader && (
                  <tr className="bg-gray-50 border-y border-gray-200">
                    <td colSpan={100} className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-gray-700">{cg.conference_name}</span>
                        <span className="text-xs text-gray-400">{formatDate(cg.start_date)}</span>
                      </div>
                    </td>
                  </tr>
                )}
                {cg.attendees.map(ag => {
                  const rows = sortByCreatedAt(ag.tasks);
                  const subKey = `${cg.conference_id}-${ag.attendee_id}`;
                  const expanded = expandedGroupKeys.has(subKey);
                  return (
                    <Fragment key={subKey}>
                      {renderAttendeeBarRow(rows, subKey)}
                      {!detailsInDrawer && expanded && (rows.length === 1
                        ? renderDesktopRow(rows[0])
                        : renderAttendeeGroupRow(rows, subKey))}
                    </Fragment>
                  );
                })}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
        {drawer && <div className="lg:w-96 lg:flex-shrink-0 lg:pr-3">{drawer}</div>}
      </div>
      {quickView && (
        <QuickViewDrawer target={quickView} onClose={() => setQuickView(null)} />
      )}
    </>
  );
}
