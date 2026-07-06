'use client';

import { useState, Fragment } from 'react';
import Link from 'next/link';
import { QuickViewDrawer, QuickViewIcon, type QuickViewTarget } from '@/components/QuickViewDrawer';
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
  onBulkToggle,
  tableName = 'follow_ups',
  groupBy = 'none',
}: {
  followUps: FollowUp[];
  onToggle: (id: number, completed: boolean) => void;
  onDelete?: (id: number) => void;
  userOptions?: UserOption[];
  onRepChange?: (id: number, rep: string | null) => void;
  onNextStepsChange?: (id: number, nextSteps: string) => void;
  onBulkToggle?: (ids: number[]) => Promise<void>;
  tableName?: string;
  groupBy?: 'conference' | 'conference-attendee' | 'none';
}) {
  const nextStepsOpts = useConfigWithIds('next_steps');
  const { isVisible, orderedColumns } = useTableColumnConfig(tableName);
  const customColumns = useCustomColumns(tableName);
  const [editingRepKey, setEditingRepKey] = useState<number | null>(null);
  const [editingNextStepsKey, setEditingNextStepsKey] = useState<number | null>(null);
  const [quickView, setQuickView] = useState<QuickViewTarget | null>(null);
  const [editingRepIds, setEditingRepIds] = useState<number[]>([]);
  const [expandedTaskIds, setExpandedTaskIds] = useState<Set<number>>(new Set());
  const [bulkLoadingKeys, setBulkLoadingKeys] = useState<Set<string>>(new Set());
  const [bulkErrorKeys, setBulkErrorKeys] = useState<Set<string>>(new Set());

  function parseTaskLines(notes: string | null): string[] {
    if (!notes) return [];
    const lines = notes.split('\n').map(l => l.trim()).filter(l => l.startsWith('- '));
    return lines.map(l => l.slice(2));
  }

  const canEditRep = !!onRepChange && userOptions.length > 0;
  const canEditNextSteps = !!onNextStepsChange && nextStepsOpts.length > 0;

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
              <div className="flex items-center gap-1 group">
                <QuickViewIcon onClick={() => setQuickView({ type: 'attendee', id: fu.attendee_id, name: `${fu.first_name} ${fu.last_name}` })} />
                <Link href={`/attendees/${fu.attendee_id}`} className="text-sm font-semibold text-brand-secondary hover:underline">
                  {fu.first_name} {fu.last_name}
                </Link>
              </div>
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
              <div className="flex items-center gap-1 group">
                <QuickViewIcon onClick={() => setQuickView({ type: 'company', id: fu.company_id!, name: fu.company_name! })} />
                <Link href={`/companies/${fu.company_id}`} className="text-xs text-brand-secondary hover:underline">{fu.company_name}</Link>
              </div>
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
            {onDelete && (
              <button type="button" onClick={() => onDelete(fu.id)} className="text-red-400 hover:text-red-600 p-1 rounded transition-colors" title="Delete follow-up">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            )}
          </div>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
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
              className={`inline-flex px-2 py-0.5 rounded-lg text-xs font-medium ${fu.completed ? 'bg-green-100 text-green-700' : 'bg-brand-primary text-white'} ${canEditNextSteps ? 'cursor-pointer hover:opacity-75 transition-opacity' : ''}`}
              title={canEditNextSteps ? 'Click to change' : undefined}
            >
              {resolveConfigValue(fu.next_steps, nextStepsOpts)}
            </span>
          )}
          {(() => {
            const taskLines = parseTaskLines(fu.next_steps_notes);
            if (taskLines.length > 1) {
              const isExpanded = expandedTaskIds.has(fu.id);
              const visibleLines = isExpanded ? taskLines : taskLines.slice(0, 1);
              return (
                <div className="mt-0.5 w-full">
                  {visibleLines.map((line, i) => (
                    <p key={i} className={`text-xs text-gray-500 leading-snug${i > 0 ? ' mt-3' : ''}`}>- {line}</p>
                  ))}
                  {!isExpanded && <div className="border-t border-gray-100 mt-1 pt-1" />}
                  <button
                    type="button"
                    onClick={() => setExpandedTaskIds(prev => { const n = new Set(prev); if (n.has(fu.id)) n.delete(fu.id); else n.add(fu.id); return n; })}
                    className="text-[10px] text-brand-secondary hover:underline mt-0.5"
                  >
                    {isExpanded ? 'Show less' : `Show All (${taskLines.length})`}
                  </button>
                </div>
              );
            }
            if (fu.next_steps_notes) {
              const lines = fu.next_steps_notes.split('\n').map(l => l.trim()).filter(Boolean);
              return (
                <div className="w-full">
                  {lines.map((line, i) => (
                    <p key={i} className={`text-xs text-gray-500 leading-snug${i > 0 ? ' mt-2.5' : ''}`}>{line}</p>
                  ))}
                </div>
              );
            }
            return null;
          })()}
        </div>
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
                <QuickViewIcon onClick={() => setQuickView({ type: 'attendee', id: fu.attendee_id, name: `${fu.first_name} ${fu.last_name}` })} />
                <Link href={`/attendees/${fu.attendee_id}`} className="text-brand-secondary hover:underline leading-snug block truncate" title={`${fu.first_name} ${fu.last_name}`}>
                  {fu.first_name} {fu.last_name}
                </Link>
              </div>
            </td>;
            case 'title': return <td key="title" className="px-3 py-2 text-gray-600 leading-snug">{fu.title || <span className="text-gray-300">—</span>}</td>;
            case 'company': return <td key="company" className="px-3 py-2 text-gray-600 leading-snug">
              {fu.company_name && fu.company_id ? (
                <div className="flex items-center gap-1 group">
                  <QuickViewIcon onClick={() => setQuickView({ type: 'company', id: fu.company_id!, name: fu.company_name! })} />
                  <Link href={`/companies/${fu.company_id}`} className="text-xs text-brand-secondary hover:underline break-words whitespace-normal leading-snug">{fu.company_name}</Link>
                </div>
              ) : <span className="text-gray-300">—</span>}
            </td>;
            case 'next_step': return <td key="next_step" className="px-3 py-2">
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
                  className={`inline-flex px-2 py-0.5 rounded-lg font-medium leading-snug ${fu.completed ? 'bg-green-100 text-green-700' : 'bg-brand-primary text-white'} ${canEditNextSteps ? 'cursor-pointer hover:opacity-75 transition-opacity' : ''}`}
                  title={canEditNextSteps ? 'Click to change' : undefined}
                >
                  {resolveConfigValue(fu.next_steps, nextStepsOpts)}
                </span>
              )}
              {(() => {
                const taskLines = parseTaskLines(fu.next_steps_notes);
                if (taskLines.length > 1) {
                  const isExpanded = expandedTaskIds.has(fu.id);
                  const visibleLines = isExpanded ? taskLines : taskLines.slice(0, 1);
                  return (
                    <div className="mt-2">
                      {visibleLines.map((line, i) => (
                        <p key={i} className={`text-gray-500 leading-snug${i > 0 ? ' mt-3' : ''}`}>- {line}</p>
                      ))}
                      {!isExpanded && <div className="border-t border-gray-100 mt-1 pt-1" />}
                      <button
                        type="button"
                        onClick={() => setExpandedTaskIds(prev => { const n = new Set(prev); if (n.has(fu.id)) n.delete(fu.id); else n.add(fu.id); return n; })}
                        className="text-[10px] text-brand-secondary hover:underline mt-0.5"
                      >
                        {isExpanded ? 'Show less' : `Show All (${taskLines.length})`}
                      </button>
                    </div>
                  );
                }
                if (fu.next_steps_notes) {
                  const lines = fu.next_steps_notes.split('\n').map(l => l.trim()).filter(Boolean);
                  return (
                    <div className="mt-0.5">
                      {lines.map((line, i) => (
                        <p key={i} className={`text-gray-500 leading-snug${i > 0 ? ' mt-2.5' : ''}`}>{line}</p>
                      ))}
                    </div>
                  );
                }
                return null;
              })()}
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
        {onDelete && (
          <td className="px-3 py-2">
            <button type="button" onClick={() => onDelete(fu.id)} className="text-red-400 hover:text-red-600 text-xs font-medium transition-colors">Delete</button>
          </td>
        )}
      </tr>
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
                    case 'next_step': return <th key="next_step" className={thCls}>Next Step</th>;
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
                {onDelete && <th className="px-3 py-2"></th>}
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
                    case 'next_step': return <th key="next_step" className={thCls}>Next Step</th>;
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
                {onDelete && <th className="px-3 py-2"></th>}
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

  // ── Conference + attendee grouped mode (company page) ────────────────────────

  const confAttGroups = buildConferenceAttendeeGroups(followUps);

  return (
    <>
      {/* Mobile */}
      <div className="block lg:hidden">
        {confAttGroups.map((cg, cgi) => (
          <div key={cg.conference_id} className={cgi > 0 ? 'mt-4' : ''}>
            {/* Conference header — no bulk button at this level */}
            <div className="px-4 py-2 bg-gray-50 border-y border-gray-100">
              <span className="text-xs font-semibold text-gray-700">{cg.conference_name}</span>
              <span className="text-xs text-gray-400 ml-2">{formatDate(cg.start_date)}</span>
            </div>
            {/* Attendee subgroups */}
            {cg.attendees.map(ag => {
              const incompleteIds = ag.tasks.filter(t => !t.completed).map(t => t.id);
              const subKey = `${cg.conference_id}-${ag.attendee_id}`;
              return (
                <div key={ag.attendee_id}>
                  <div className="px-4 py-1.5 flex items-center justify-between border-b border-gray-100 bg-white">
                    <span className="text-[11px] font-medium text-gray-500 pl-1">
                      {ag.first_name} {ag.last_name}
                    </span>
                    {renderMarkAllDoneButton(subKey, incompleteIds)}
                  </div>
                  <div className="divide-y divide-gray-100">
                    {ag.tasks.map(fu => renderMobileCard(fu))}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
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
                  case 'next_step': return <th key="next_step" className={thCls}>Next Step</th>;
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
              {onDelete && <th className="px-3 py-2"></th>}
            </tr>
          </thead>
          <tbody>
            {confAttGroups.map((cg, cgi) => (
              <Fragment key={cg.conference_id}>
                {cgi > 0 && (
                  <tr>
                    <td colSpan={100} className="h-3 bg-white p-0 border-0" />
                  </tr>
                )}
                {/* Conference header row */}
                <tr className="bg-gray-50 border-y border-gray-200">
                  <td colSpan={100} className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-gray-700">{cg.conference_name}</span>
                      <span className="text-xs text-gray-400">{formatDate(cg.start_date)}</span>
                    </div>
                  </td>
                </tr>
                {/* Attendee subgroups */}
                {cg.attendees.map(ag => {
                  const incompleteIds = ag.tasks.filter(t => !t.completed).map(t => t.id);
                  const subKey = `${cg.conference_id}-${ag.attendee_id}`;
                  return (
                    <Fragment key={ag.attendee_id}>
                      {/* Attendee subgroup header row */}
                      <tr className="border-b border-gray-100">
                        <td colSpan={100} className="px-3 py-1.5 pl-6">
                          <div className="flex items-center justify-between">
                            <span className="text-[11px] font-medium text-gray-500">
                              {ag.first_name} {ag.last_name}
                            </span>
                            {renderMarkAllDoneButton(subKey, incompleteIds)}
                          </div>
                        </td>
                      </tr>
                      {/* Task rows */}
                      {ag.tasks.map(fu => renderDesktopRow(fu))}
                    </Fragment>
                  );
                })}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
      {quickView && (
        <QuickViewDrawer target={quickView} onClose={() => setQuickView(null)} />
      )}
    </>
  );
}
