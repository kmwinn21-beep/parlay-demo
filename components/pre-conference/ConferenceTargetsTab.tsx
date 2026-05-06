'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { TargetBtn } from './TargetBtn';
import type { TargetEntry } from '../PreConferenceReview';
import { useAvgCostPerUnit } from '@/lib/useAvgCostPerUnit';

export interface AddableAttendee {
  id: number;
  firstName: string;
  lastName: string;
  title: string | null;
  seniority: string | null;
  companyName: string | null;
  companyId: number | null;
}

export interface AddableGroup {
  label: string;
  attendees: AddableAttendee[];
}

const TIERS = [
  {
    key: '1' as const,
    label: 'Must Target',
    labelClass: 'text-red-600',
    bg: 'bg-red-50',
    border: 'border-red-200',
    dragOutline: '2px solid #dc2626',
  },
  {
    key: '2' as const,
    label: 'High Priority',
    labelClass: 'text-brand-primary',
    bg: 'bg-brand-primary/10',
    border: 'border-brand-primary/40',
    dragOutline: '2px solid rgb(var(--brand-primary-rgb))',
  },
  {
    key: '3' as const,
    label: 'Worth Engaging',
    labelClass: 'text-brand-highlight',
    bg: 'bg-brand-highlight/10',
    border: 'border-brand-highlight/40',
    dragOutline: '2px solid rgb(var(--brand-highlight-rgb))',
  },
  {
    key: 'unassigned' as const,
    label: 'Monitor',
    labelClass: 'text-gray-500',
    bg: 'bg-gray-50',
    border: 'border-gray-200',
    dragOutline: '2px solid #9ca3af',
  },
];

const SENIORITY_COLORS: Record<string, string> = {
  'C-Suite': '#7c3aed',
  'VP/SVP': '#1B76BC',
  'Director': '#059669',
  'Manager': '#f59e0b',
  'Other': '#6b7280',
};

function getSeniorityColor(s: string | null): string {
  if (!s) return '#6b7280';
  return SENIORITY_COLORS[s] ?? '#6b7280';
}

function SeniorityPill({ seniority }: { seniority: string | null }) {
  if (!seniority) return null;
  const color = getSeniorityColor(seniority);
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border"
      style={{ color, borderColor: `${color}60`, backgroundColor: `${color}14` }}>
      {seniority}
    </span>
  );
}

function UserPill({ name }: { name: string }) {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 border border-blue-300 whitespace-nowrap">
      <svg className="w-3 h-3 opacity-70 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
      </svg>
      {name}
    </span>
  );
}

function TargetCard({
  entry,
  hasMeeting,
  isDragging,
  avgCostPerUnit,
  onDragStart,
  onToggleTarget,
}: {
  entry: TargetEntry;
  hasMeeting: boolean;
  isDragging: boolean;
  avgCostPerUnit: number;
  onDragStart: () => void;
  onToggleTarget: (entry: Omit<TargetEntry, 'tier'>) => Promise<void>;
}) {
  const valuePill = (entry.companyWse != null && avgCostPerUnit > 0)
    ? '$' + Math.round(entry.companyWse * avgCostPerUnit).toLocaleString('en-US')
    : null;

  return (
    <div
      draggable
      onDragStart={onDragStart}
      className={`bg-white border border-gray-200 rounded-xl p-3 cursor-grab active:cursor-grabbing hover:shadow-sm transition-all ${
        isDragging ? 'opacity-40 ring-2 ring-brand-secondary' : ''
      }`}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="min-w-0 flex-1">
          <Link href={`/attendees/${entry.attendeeId}`}
            className="text-sm font-semibold text-brand-primary hover:text-brand-secondary leading-tight block truncate"
            onClick={e => e.stopPropagation()}>
            {entry.firstName} {entry.lastName}
            {entry.title && (
              <span className="font-normal text-xs text-gray-500">, {entry.title}</span>
            )}
          </Link>
          {entry.companyName && (
            <p className="text-xs text-gray-400 truncate mt-0.5">{entry.companyName}</p>
          )}
        </div>
        <TargetBtn
          isTarget={true}
          size="sm"
          onClick={() => onToggleTarget({
            attendeeId: entry.attendeeId,
            firstName: entry.firstName,
            lastName: entry.lastName,
            title: entry.title,
            seniority: entry.seniority,
            companyName: entry.companyName,
            companyId: entry.companyId,
            companyWse: entry.companyWse,
            assignedUserNames: entry.assignedUserNames,
          })}
        />
      </div>
      <div className="flex flex-wrap items-center gap-1 mt-1">
        {entry.seniority && <SeniorityPill seniority={entry.seniority} />}
        {entry.assignedUserNames[0] && <UserPill name={entry.assignedUserNames[0]} />}
        {hasMeeting && (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
            Meeting Scheduled
          </span>
        )}
        {valuePill && (
          <span className="ml-auto inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-700 border border-green-300 whitespace-nowrap">
            {valuePill}
          </span>
        )}
      </div>
    </div>
  );
}

export function ConferenceTargetsTab({
  conferenceName,
  targetMap,
  meetingAttendeeIds,
  onToggleTarget,
  onSetTier,
  addableGroups,
  onAddTargets,
  loadingAddAttendees,
}: {
  conferenceName: string;
  targetMap: Map<number, TargetEntry>;
  meetingAttendeeIds: Set<number>;
  onToggleTarget: (entry: Omit<TargetEntry, 'tier'>) => Promise<void>;
  onSetTier: (attendeeId: number, tier: string) => Promise<void>;
  addableGroups?: AddableGroup[];
  onAddTargets?: (entries: Array<Omit<TargetEntry, 'tier'>>) => Promise<void>;
  loadingAddAttendees?: boolean;
}) {
  const avgCostPerUnit = useAvgCostPerUnit();
  const [draggingId, setDraggingId] = useState<number | null>(null);
  const [dragOverTier, setDragOverTier] = useState<string | null>(null);

  // Add-target dropdown state
  const [showAdd, setShowAdd] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [addPending, setAddPending] = useState(false);
  const addDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showAdd) return;
    const handler = (e: MouseEvent) => {
      if (addDropdownRef.current && !addDropdownRef.current.contains(e.target as Node)) {
        setShowAdd(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showAdd]);

  const handleAddConfirm = useCallback(async () => {
    if (!onAddTargets || selectedIds.size === 0) return;
    setAddPending(true);
    const entries = (addableGroups ?? [])
      .flatMap(g => g.attendees)
      .filter(a => selectedIds.has(a.id))
      .map(a => ({
        attendeeId: a.id,
        firstName: a.firstName,
        lastName: a.lastName,
        title: a.title,
        seniority: a.seniority,
        companyName: a.companyName,
        companyId: a.companyId,
        companyWse: null,
        assignedUserNames: [] as string[],
      }));
    await onAddTargets(entries);
    setSelectedIds(new Set());
    setShowAdd(false);
    setAddPending(false);
  }, [onAddTargets, selectedIds, addableGroups]);

  const targets = Array.from(targetMap.values());

  // Distinct-company value sums per tier.
  // Each company is attributed only to the highest tier any of its attendees belongs to,
  // so the same company value is never double-counted across tiers.
  const TIER_PRIORITY: Record<string, number> = { '1': 0, '2': 1, '3': 2, 'unassigned': 3 };
  const companyBestTier = new Map<number, { tier: string; wse: number }>();
  for (const t of targets) {
    if (t.companyId == null || t.companyWse == null) continue;
    const existing = companyBestTier.get(t.companyId);
    if (!existing || (TIER_PRIORITY[t.tier] ?? 99) < (TIER_PRIORITY[existing.tier] ?? 99)) {
      companyBestTier.set(t.companyId, { tier: t.tier, wse: t.companyWse });
    }
  }
  const tierValueSum: Record<string, number> = {};
  for (const { tier, wse } of Array.from(companyBestTier.values())) {
    tierValueSum[tier] = (tierValueSum[tier] ?? 0) + Math.round(wse * avgCostPerUnit);
  }
  const hasValues = avgCostPerUnit > 0 && companyBestTier.size > 0;

  // Seniority breakdown from targets
  const senCount: Record<string, number> = {};
  for (const t of targets) {
    const s = t.seniority ?? 'Unknown';
    senCount[s] = (senCount[s] ?? 0) + 1;
  }
  const senBreakdown = Object.entries(senCount).sort((a, b) => b[1] - a[1]);
  const maxSen = Math.max(1, ...Object.values(senCount));

  async function handleDrop(tier: string) {
    if (draggingId === null) return;
    setDraggingId(null);
    setDragOverTier(null);
    await onSetTier(draggingId, tier);
  }

  if (targets.length === 0) {
    return (
      <div className="space-y-6">
        <div className="text-center py-16">
          <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-3">
            <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="4" />
              <line x1="12" y1="2" x2="12" y2="6" /><line x1="12" y1="18" x2="12" y2="22" />
              <line x1="2" y1="12" x2="6" y2="12" /><line x1="18" y1="12" x2="22" y2="12" />
            </svg>
          </div>
          <p className="text-gray-500 text-sm font-medium">No targets set</p>
          <p className="text-gray-400 text-xs mt-1">Click the target icon on any attendee card to add them here.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header row: count card + seniority chart */}
      <div className="flex flex-wrap gap-4 items-start">
        <div className="rounded-xl border-2 border-brand-accent bg-white p-4 flex flex-col items-center min-w-[100px]">
          <span className="text-3xl font-bold text-brand-primary leading-tight">{targets.length}</span>
          <span className="text-xs font-semibold text-gray-500 mt-0.5 text-center">Target{targets.length !== 1 ? 's' : ''}</span>
        </div>

        {senBreakdown.length > 0 && (
          <div className="flex-1 min-w-[200px] rounded-xl border border-gray-200 bg-white p-4">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Seniority Breakdown</p>
            <div className="space-y-2">
              {senBreakdown.map(([label, count]) => (
                <div key={label} className="flex items-center gap-3">
                  <span className="text-xs text-gray-600 w-24 flex-shrink-0 truncate">{label}</span>
                  <div className="flex-1 bg-gray-100 rounded-full h-2 overflow-hidden">
                    <div className="h-2 rounded-full" style={{ width: `${Math.round((count / maxSen) * 100)}%`, backgroundColor: getSeniorityColor(label) }} />
                  </div>
                  <span className="text-xs text-gray-500 w-5 text-right flex-shrink-0">{count}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Kanban */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-gray-700">{conferenceName} Targets</h3>

          {onAddTargets && (
            <div className="relative" ref={addDropdownRef}>
              <button
                type="button"
                onClick={() => { setShowAdd(prev => !prev); setSelectedIds(new Set()); }}
                disabled={loadingAddAttendees || addPending}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg bg-brand-primary text-white hover:bg-brand-primary/90 transition-colors disabled:opacity-50 disabled:cursor-wait"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
                </svg>
                Target
              </button>

              {showAdd && (
                <div className="absolute right-0 top-full mt-1 w-80 max-w-[calc(100vw-2rem)] bg-white border border-gray-200 rounded-xl shadow-xl z-30 flex flex-col max-h-[480px]">
                  {/* Dropdown header */}
                  <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between flex-shrink-0">
                    <span className="text-sm font-semibold text-gray-800">Add Targets</span>
                    <span className="text-xs text-gray-400">{selectedIds.size} selected</span>
                  </div>

                  {/* Attendee list */}
                  {(addableGroups ?? []).length === 0 ? (
                    <p className="px-4 py-8 text-center text-xs text-gray-400">
                      All conference attendees are already targets.
                    </p>
                  ) : (
                    <div className="overflow-y-auto flex-1">
                      {(addableGroups ?? []).map(group => (
                        <div key={group.label}>
                          <div className="px-4 py-2 bg-gray-50 border-b border-gray-100 sticky top-0 z-10">
                            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{group.label}</span>
                          </div>
                          {group.attendees.map(a => (
                            <label key={a.id} className="flex items-start gap-3 px-4 py-2.5 hover:bg-gray-50 cursor-pointer select-none">
                              <input
                                type="checkbox"
                                checked={selectedIds.has(a.id)}
                                onChange={() => setSelectedIds(prev => {
                                  const next = new Set(prev);
                                  if (next.has(a.id)) next.delete(a.id); else next.add(a.id);
                                  return next;
                                })}
                                className="mt-0.5 flex-shrink-0 accent-brand-primary"
                              />
                              <div className="min-w-0">
                                <p className="text-sm font-medium text-gray-800 leading-tight">
                                  {a.firstName} {a.lastName}
                                  {a.title && <span className="font-normal text-gray-500">, {a.title}</span>}
                                </p>
                                {a.companyName && <p className="text-xs text-gray-400 truncate">{a.companyName}</p>}
                              </div>
                            </label>
                          ))}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Dropdown footer */}
                  <div className="px-4 py-3 border-t border-gray-100 flex items-center justify-between gap-2 flex-shrink-0">
                    <button
                      type="button"
                      onClick={() => { setShowAdd(false); setSelectedIds(new Set()); }}
                      className="text-sm text-gray-500 hover:text-gray-700 transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleAddConfirm()}
                      disabled={selectedIds.size === 0 || addPending}
                      className="btn-primary text-sm px-4 py-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {addPending
                        ? 'Adding…'
                        : `Add${selectedIds.size > 0 ? ` ${selectedIds.size}` : ''} Target${selectedIds.size !== 1 ? 's' : ''}`}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {TIERS.map(tier => {
            const tierCards = targets.filter(t => t.tier === tier.key);
            const isOver = dragOverTier === tier.key;
            return (
              <div
                key={tier.key}
                className={`rounded-xl border-2 p-3 min-h-[120px] transition-colors ${tier.border} ${tier.bg}`}
                style={isOver ? { outline: tier.dragOutline, outlineOffset: '2px' } : {}}
                onDragOver={e => { e.preventDefault(); setDragOverTier(tier.key); }}
                onDragLeave={() => setDragOverTier(null)}
                onDrop={() => handleDrop(tier.key)}
              >
                <div className="flex items-center justify-between mb-3">
                  <span className={`text-lg font-bold uppercase tracking-wider ${tier.labelClass}`}>{tier.label}</span>
                  {hasValues ? (
                    <span className="text-sm font-semibold text-gray-500">
                      {tierValueSum[tier.key]
                        ? '$' + tierValueSum[tier.key].toLocaleString('en-US')
                        : '$0'}
                    </span>
                  ) : (
                    <span className="text-lg font-bold text-gray-400">{tierCards.length}</span>
                  )}
                </div>
                <div className="space-y-2">
                  {tierCards.map(entry => (
                    <TargetCard
                      key={entry.attendeeId}
                      entry={entry}
                      hasMeeting={meetingAttendeeIds.has(entry.attendeeId)}
                      isDragging={draggingId === entry.attendeeId}
                      avgCostPerUnit={avgCostPerUnit}
                      onDragStart={() => setDraggingId(entry.attendeeId)}
                      onToggleTarget={onToggleTarget}
                    />
                  ))}
                  {tierCards.length === 0 && (
                    <p className="text-xs text-gray-400 text-center py-4">Drop here</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
