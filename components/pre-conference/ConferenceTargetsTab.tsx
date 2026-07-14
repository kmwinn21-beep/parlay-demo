'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { TargetBtn } from './TargetBtn';
import { useRecordDrawer } from './RecordDrawerContext';
import type { TargetEntry } from '../PreConferenceReview';
import { useAvgCostPerUnit } from '@/lib/useAvgCostPerUnit';
import { NewMeetingModal } from '@/components/NewMeetingModal';
import { type Meeting } from '@/components/MeetingsTable';

export interface AddableAttendee {
  id: number;
  firstName: string;
  lastName: string;
  title: string | null;
  seniority: string | null;
  companyName: string | null;
  companyId: number | null;
  companyWse?: number | null;
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

function SeniorityPill({ seniority }: { seniority: string | null }) {
  if (!seniority) return null;
  const COLORS: Record<string, string> = {
    'C-Suite': '#7c3aed', 'VP/SVP': '#1B76BC', 'Director': '#059669', 'Manager': '#f59e0b', 'Other': '#6b7280',
  };
  const color = COLORS[seniority] ?? '#6b7280';
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border"
      style={{ color, borderColor: `${color}60`, backgroundColor: `${color}14` }}>
      {seniority}
    </span>
  );
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return name.trim().substring(0, 2).toUpperCase();
}

function UserPill({ name }: { name: string }) {
  return (
    <span
      title={name}
      className="inline-flex items-center justify-center px-1.5 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-800 border border-blue-300 whitespace-nowrap"
    >
      <svg className="w-3 h-3 opacity-70 flex-shrink-0 mr-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
      </svg>
      {getInitials(name)}
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
  onScheduleMeeting,
  readOnly = false,
}: {
  entry: TargetEntry;
  hasMeeting: boolean;
  isDragging: boolean;
  avgCostPerUnit: number;
  onDragStart?: () => void;
  onToggleTarget: (entry: Omit<TargetEntry, 'tier'>) => Promise<void>;
  onScheduleMeeting: (entry: TargetEntry) => void;
  readOnly?: boolean;
}) {
  const openRecord = useRecordDrawer();
  const valuePill = (entry.companyWse != null && avgCostPerUnit > 0)
    ? '$' + Math.round(entry.companyWse * avgCostPerUnit).toLocaleString('en-US')
    : null;

  return (
    <div
      draggable={!readOnly && !!onDragStart}
      onDragStart={onDragStart}
      className={`bg-white border border-gray-200 rounded-xl p-3 ${readOnly ? 'cursor-default' : 'cursor-grab active:cursor-grabbing'} hover:shadow-sm transition-all ${
        isDragging ? 'opacity-40 ring-2 ring-brand-secondary' : ''
      }`}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="min-w-0 flex-1">
          <button type="button"
            onClick={e => { e.stopPropagation(); openRecord('attendee', entry.attendeeId); }}
            className="text-sm font-semibold text-brand-primary hover:text-brand-secondary leading-tight block truncate text-left w-full">
            {entry.firstName} {entry.lastName}
            {entry.title && (
              <span className="font-normal text-xs text-gray-500">, {entry.title}</span>
            )}
          </button>
          {entry.companyName && (
            <p className="text-xs text-gray-400 truncate mt-0.5">{entry.companyName}</p>
          )}
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            type="button"
            title="Schedule meeting"
            onClick={e => { e.stopPropagation(); onScheduleMeeting(entry); }}
            className="p-1 rounded text-gray-400 hover:text-brand-secondary hover:bg-brand-secondary/10 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </button>
          <TargetBtn
            isTarget={true}
            size="sm"
            disabled={readOnly}
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
      </div>
      <div className="flex flex-wrap items-center gap-1 mt-1">
        {entry.seniority && <SeniorityPill seniority={entry.seniority} />}
        {entry.assignedUserNames[0] && <UserPill name={entry.assignedUserNames[0]} />}
        {hasMeeting && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
            <svg className="w-3 h-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
            </svg>
            Scheduled
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

const TIER_BAR_COLORS: Record<string, string> = {
  '1': '#dc2626',
  '2': 'rgb(var(--brand-primary-rgb, 30 58 95))',
  '3': 'rgb(var(--brand-highlight-rgb, 5 150 105))',
  'unassigned': '#9ca3af',
};

export function ConferenceTargetsTab({
  conferenceId,
  conferenceName,
  targetMap,
  meetingAttendeeIds,
  onToggleTarget,
  onSetTier,
  addableGroups,
  onAddTargets,
  loadingAddAttendees,
  readOnly = false,
  onMeetingScheduled,
}: {
  conferenceId: number;
  conferenceName: string;
  targetMap: Map<number, TargetEntry>;
  meetingAttendeeIds: Set<number>;
  onToggleTarget: (entry: Omit<TargetEntry, 'tier'>) => Promise<void>;
  onSetTier: (attendeeId: number, tier: string) => Promise<void>;
  addableGroups?: AddableGroup[];
  onAddTargets?: (entries: Array<Omit<TargetEntry, 'tier'>>) => Promise<void>;
  loadingAddAttendees?: boolean;
  readOnly?: boolean;
  onMeetingScheduled?: (meeting: Meeting) => void;
}) {
  const avgCostPerUnit = useAvgCostPerUnit();
  const [draggingId, setDraggingId] = useState<number | null>(null);
  const [dragOverTier, setDragOverTier] = useState<string | null>(null);
  // Default: Must Target / High Priority / Worth Engaging shown, Monitor minimized to a pill.
  const [minimizedTiers, setMinimizedTiers] = useState<Set<string>>(new Set(['unassigned']));
  const minimizeTier = (key: string) => setMinimizedTiers(prev => new Set(prev).add(key));
  const restoreTier = (key: string) => setMinimizedTiers(prev => {
    const next = new Set(prev);
    next.delete(key);
    return next;
  });
  const [conversionPct, setConversionPct] = useState(60);
  const [meetingsConvPct, setMeetingsConvPct] = useState(60);
  const [requiredPipeline, setRequiredPipeline] = useState<number | null>(null);

  // Schedule meeting modal state
  const [schedulingEntry, setSchedulingEntry] = useState<TargetEntry | null>(null);
  // Optimistic meeting attendee ids — merged with the parent's meetingAttendeeIds
  const [optimisticMeetingIds, setOptimisticMeetingIds] = useState<Set<number>>(new Set());

  useEffect(() => {
    Promise.all([
      fetch(`/api/conferences/${conferenceId}/budget`).then(r => r.ok ? r.json() : null),
      fetch('/api/admin/effectiveness').then(r => r.ok ? r.json() : null),
    ]).then(([budgetData, effectivenessData]) => {
      const val = (budgetData as { required_pipeline_amount?: number | null } | null)?.required_pipeline_amount;
      if (val != null && Number(val) > 0) setRequiredPipeline(Number(val));
      const mhRate = (effectivenessData as Record<string, string> | null)?.meetings_held_conversion_rate;
      if (mhRate != null) {
        const pct = parseFloat(mhRate);
        if (!isNaN(pct) && pct > 0) setMeetingsConvPct(pct);
      }
    }).catch(() => {});
  }, [conferenceId]);

  // Add-target dropdown state
  const [showAdd, setShowAdd] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [addPending, setAddPending] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
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
  const effectiveMeetingIds = new Set([...Array.from(meetingAttendeeIds), ...Array.from(optimisticMeetingIds)]);

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

  // Pipeline coverage
  const totalTargetValue = Object.values(tierValueSum).reduce((a, b) => a + b, 0);
  const convertedValue = Math.round(totalTargetValue * conversionPct / 100);
  const coverageRatio = requiredPipeline && requiredPipeline > 0 ? convertedValue / requiredPipeline : null;
  const maxTierValue = Math.max(1, ...Object.values(tierValueSum));

  // Meetings pipeline — same dedup logic but filtered to targets with meetings scheduled
  const meetingCompanyBestTier = new Map<number, { tier: string; wse: number }>();
  for (const t of targets) {
    if (!effectiveMeetingIds.has(t.attendeeId)) continue;
    if (t.companyId == null || t.companyWse == null) continue;
    const existing = meetingCompanyBestTier.get(t.companyId);
    if (!existing || (TIER_PRIORITY[t.tier] ?? 99) < (TIER_PRIORITY[existing.tier] ?? 99)) {
      meetingCompanyBestTier.set(t.companyId, { tier: t.tier, wse: t.companyWse });
    }
  }
  const meetingTierValueSum: Record<string, number> = {};
  for (const { tier, wse } of Array.from(meetingCompanyBestTier.values())) {
    meetingTierValueSum[tier] = (meetingTierValueSum[tier] ?? 0) + Math.round(wse * avgCostPerUnit);
  }
  const totalMeetingValue = Object.values(meetingTierValueSum).reduce((a, b) => a + b, 0);
  const convertedMeetingValue = Math.round(totalMeetingValue * meetingsConvPct / 100);
  const meetingsCoverageRatio = requiredPipeline && requiredPipeline > 0 ? convertedMeetingValue / requiredPipeline : null;
  const maxMeetingTierValue = Math.max(1, ...Object.values(meetingTierValueSum));
  const hasMeetingValues = avgCostPerUnit > 0 && meetingCompanyBestTier.size > 0;

  function handleScheduleMeeting(entry: TargetEntry) {
    setSchedulingEntry(entry);
  }

  async function handleDrop(tier: string) {
    if (draggingId === null) return;
    setDraggingId(null);
    setDragOverTier(null);
    await onSetTier(draggingId, tier);
  }

  function renderTierColumn(tier: typeof TIERS[number]) {
    const tierCards = targets.filter(t => t.tier === tier.key);
    const isOver = dragOverTier === tier.key;
    return (
      <div
        className={`rounded-xl border-2 p-3 min-h-[120px] transition-colors ${tier.border} ${tier.bg}`}
        style={isOver ? { outline: tier.dragOutline, outlineOffset: '2px' } : {}}
        onDragOver={readOnly ? undefined : (e => { e.preventDefault(); setDragOverTier(tier.key); })}
        onDragLeave={readOnly ? undefined : (() => setDragOverTier(null))}
        onDrop={readOnly ? undefined : (() => handleDrop(tier.key))}
      >
        <div className="flex items-center justify-between mb-3 gap-2">
          <span className={`text-lg font-bold uppercase tracking-wider ${tier.labelClass}`}>{tier.label}</span>
          <div className="flex items-center gap-2 flex-shrink-0">
            {hasValues ? (
              <span className="text-sm font-semibold text-gray-500">
                {tierValueSum[tier.key]
                  ? '$' + tierValueSum[tier.key].toLocaleString('en-US')
                  : '$0'}
              </span>
            ) : (
              <span className="text-lg font-bold text-gray-400">{tierCards.length}</span>
            )}
            <button
              type="button"
              onClick={() => minimizeTier(tier.key)}
              title={`Hide ${tier.label}`}
              className="flex-shrink-0 w-5 h-5 flex items-center justify-center rounded-full text-gray-400 hover:text-gray-700 hover:bg-white/60 transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M18 12H6" />
              </svg>
            </button>
          </div>
        </div>
        <div className="space-y-2">
          {tierCards.map(entry => (
            <TargetCard
              key={entry.attendeeId}
              entry={entry}
              hasMeeting={effectiveMeetingIds.has(entry.attendeeId)}
              isDragging={draggingId === entry.attendeeId}
              avgCostPerUnit={avgCostPerUnit}
              onDragStart={readOnly ? undefined : () => setDraggingId(entry.attendeeId)}
              onToggleTarget={onToggleTarget}
              onScheduleMeeting={handleScheduleMeeting}
              readOnly={readOnly}
            />
          ))}
          {tierCards.length === 0 && (
            <p className="text-xs text-gray-400 text-center py-4">Drop here</p>
          )}
        </div>
      </div>
    );
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
      {/* Header row: pipeline value chart + meetings pipeline chart */}
      <div className="flex flex-wrap gap-4 items-stretch">
        {/* Targeted Pipeline Value chart */}
        <div className="flex-1 min-w-[220px] rounded-xl border border-gray-200 bg-white p-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Targeted Pipeline Value</p>
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-gray-400">Conversion:</span>
              <input
                type="number"
                min={0}
                max={100}
                value={conversionPct}
                onChange={e => {
                  const v = Math.max(0, Math.min(100, Number(e.target.value)));
                  if (!isNaN(v)) setConversionPct(v);
                }}
                className="w-12 text-xs text-center border border-gray-200 rounded px-1 py-0.5 focus:outline-none focus:border-brand-primary"
              />
              <span className="text-xs text-gray-400">%</span>
            </div>
          </div>

          {/* Required pipeline comparison bar */}
          {requiredPipeline != null && (
            <div className="mb-3 pb-3 border-b border-gray-100">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs text-gray-500 font-medium">Required Pipeline</span>
                <span className="text-xs text-gray-400">${requiredPipeline.toLocaleString('en-US')}</span>
              </div>
              <div className="bg-gray-100 rounded-full h-3 overflow-hidden">
                <div
                  className="h-3 rounded-full transition-all duration-300"
                  style={{
                    width: `${Math.min((coverageRatio ?? 0) * 100, 100)}%`,
                    backgroundColor: (coverageRatio ?? 0) >= 1 ? '#059669' : (coverageRatio ?? 0) >= 0.6 ? '#f59e0b' : '#dc2626',
                  }}
                />
              </div>
              <div className="flex items-center gap-1.5 mt-1">
                <span className="text-xs text-gray-400">
                  Projected at {conversionPct}%:{' '}
                  <span className="font-medium text-gray-600">${convertedValue.toLocaleString('en-US')}</span>
                </span>
                {coverageRatio != null && (
                  <span className={`text-xs font-medium ${(coverageRatio ?? 0) >= 1 ? 'text-emerald-600' : (coverageRatio ?? 0) >= 0.6 ? 'text-amber-600' : 'text-red-500'}`}>
                    ({Math.round((coverageRatio ?? 0) * 100)}%)
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Per-tier value bars */}
          {hasValues ? (
            <div className="space-y-2">
              {TIERS.map(tier => {
                const val = tierValueSum[tier.key] ?? 0;
                return (
                  <div key={tier.key} className="flex items-center gap-3">
                    <span className="text-xs text-gray-600 w-28 flex-shrink-0 truncate">{tier.label}</span>
                    <div className="flex-1 bg-gray-100 rounded-full h-2 overflow-hidden">
                      <div
                        className="h-2 rounded-full"
                        style={{
                          width: val > 0 ? `${Math.round((val / maxTierValue) * 100)}%` : '0%',
                          backgroundColor: TIER_BAR_COLORS[tier.key] ?? '#9ca3af',
                        }}
                      />
                    </div>
                    <span className="text-xs text-gray-500 w-20 text-right flex-shrink-0">
                      {val > 0 ? '$' + val.toLocaleString('en-US') : '—'}
                    </span>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-xs text-gray-400">Set avg. cost per unit in Admin Settings to see values.</p>
          )}
        </div>

        {/* Targeted Pipeline Value of Scheduled Meetings chart */}
        <div className="flex-1 min-w-[220px] rounded-xl border border-gray-200 bg-white p-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Targeted Pipeline Value of Scheduled Meetings</p>
            <div className="flex items-center gap-1.5 flex-shrink-0 ml-2">
              <span className="text-xs text-gray-400">Conversion:</span>
              <input
                type="number"
                min={0}
                max={100}
                value={meetingsConvPct}
                onChange={e => {
                  const v = Math.max(0, Math.min(100, Number(e.target.value)));
                  if (!isNaN(v)) setMeetingsConvPct(v);
                }}
                className="w-12 text-xs text-center border border-gray-200 rounded px-1 py-0.5 focus:outline-none focus:border-brand-primary"
              />
              <span className="text-xs text-gray-400">%</span>
            </div>
          </div>

          {/* Required pipeline comparison bar */}
          {requiredPipeline != null && (
            <div className="mb-3 pb-3 border-b border-gray-100">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs text-gray-500 font-medium">Required Pipeline</span>
                <span className="text-xs text-gray-400">${requiredPipeline.toLocaleString('en-US')}</span>
              </div>
              <div className="bg-gray-100 rounded-full h-3 overflow-hidden">
                <div
                  className="h-3 rounded-full transition-all duration-300"
                  style={{
                    width: `${Math.min((meetingsCoverageRatio ?? 0) * 100, 100)}%`,
                    backgroundColor: (meetingsCoverageRatio ?? 0) >= 1 ? '#059669' : (meetingsCoverageRatio ?? 0) >= 0.6 ? '#f59e0b' : '#dc2626',
                  }}
                />
              </div>
              <div className="flex items-center gap-1.5 mt-1">
                <span className="text-xs text-gray-400">
                  Projected at {meetingsConvPct}%:{' '}
                  <span className="font-medium text-gray-600">${convertedMeetingValue.toLocaleString('en-US')}</span>
                </span>
                {meetingsCoverageRatio != null && (
                  <span className={`text-xs font-medium ${(meetingsCoverageRatio ?? 0) >= 1 ? 'text-emerald-600' : (meetingsCoverageRatio ?? 0) >= 0.6 ? 'text-amber-600' : 'text-red-500'}`}>
                    ({Math.round((meetingsCoverageRatio ?? 0) * 100)}%)
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Per-tier value bars for companies with meetings */}
          {hasMeetingValues ? (
            <div className="space-y-2">
              {TIERS.map(tier => {
                const val = meetingTierValueSum[tier.key] ?? 0;
                return (
                  <div key={tier.key} className="flex items-center gap-3">
                    <span className="text-xs text-gray-600 w-28 flex-shrink-0 truncate">{tier.label}</span>
                    <div className="flex-1 bg-gray-100 rounded-full h-2 overflow-hidden">
                      <div
                        className="h-2 rounded-full"
                        style={{
                          width: val > 0 ? `${Math.round((val / maxMeetingTierValue) * 100)}%` : '0%',
                          backgroundColor: TIER_BAR_COLORS[tier.key] ?? '#9ca3af',
                        }}
                      />
                    </div>
                    <span className="text-xs text-gray-500 w-20 text-right flex-shrink-0">
                      {val > 0 ? '$' + val.toLocaleString('en-US') : '—'}
                    </span>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-xs text-gray-400">
              {avgCostPerUnit > 0
                ? effectiveMeetingIds.size === 0
                  ? 'No meetings scheduled yet.'
                  : 'No target companies with scheduled meetings.'
                : 'Set avg. cost per unit in Admin Settings to see values.'}
            </p>
          )}
        </div>
      </div>

      {/* Kanban */}
      <div>
        <style>{`@keyframes minimizedPillIn { from { opacity: 0; transform: scale(0.9); } to { opacity: 1; transform: scale(1); } }`}</style>
        <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-sm font-semibold text-gray-700 flex-shrink-0">{conferenceName} Targets</h3>
            {TIERS.filter(tier => minimizedTiers.has(tier.key)).map(tier => {
              const val = tierValueSum[tier.key] ?? 0;
              const count = targets.filter(t => t.tier === tier.key).length;
              return (
                <button
                  key={tier.key}
                  type="button"
                  onClick={() => restoreTier(tier.key)}
                  title={`Show ${tier.label}`}
                  style={{ animation: 'minimizedPillIn 200ms ease-out' }}
                  className={`inline-flex items-center gap-2 px-3 py-1 rounded-full border text-xs font-semibold transition-colors hover:brightness-95 ${tier.bg} ${tier.border} ${tier.labelClass}`}
                >
                  <span className="uppercase tracking-wide">{tier.label}</span>
                  <span className="opacity-80">{hasValues ? '$' + val.toLocaleString('en-US') : count}</span>
                  <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-white/70">
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                    </svg>
                  </span>
                </button>
              );
            })}
          </div>

          {onAddTargets && (
            <div className="relative" ref={addDropdownRef}>
              <button
                type="button"
                onClick={() => { setShowAdd(prev => !prev); setSelectedIds(new Set()); }}
                disabled={addPending}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg bg-brand-primary text-white hover:bg-brand-primary/90 transition-colors disabled:opacity-50 disabled:cursor-wait"
              >
                {loadingAddAttendees ? (
                  <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
                  </svg>
                )}
                Target
              </button>

              {showAdd && (
                <div className="absolute right-0 top-full mt-1 w-[32rem] max-w-[calc(100vw-2rem)] bg-white border border-gray-200 rounded-xl shadow-xl z-30 flex flex-col max-h-[480px]">
                  {/* Dropdown header */}
                  <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between flex-shrink-0">
                    <span className="text-sm font-semibold text-gray-800">Add Targets</span>
                    <div className="flex items-center gap-3">
                      {!loadingAddAttendees && (addableGroups ?? []).length > 0 && (
                        <button
                          type="button"
                          onClick={() => {
                            const allLabels = (addableGroups ?? []).map(g => g.label);
                            const allExpanded = allLabels.every(l => expandedGroups.has(l));
                            setExpandedGroups(allExpanded ? new Set() : new Set(allLabels));
                          }}
                          className="text-xs text-brand-secondary hover:text-brand-primary transition-colors font-medium"
                        >
                          {(addableGroups ?? []).every(g => expandedGroups.has(g.label)) ? 'Collapse all' : 'Expand all'}
                        </button>
                      )}
                      <span className="text-xs text-gray-400">{selectedIds.size} selected</span>
                    </div>
                  </div>

                  {/* Attendee list */}
                  {loadingAddAttendees && (addableGroups ?? []).length === 0 ? (
                    <div className="flex items-center justify-center gap-2 py-10 text-gray-400 text-xs">
                      <div className="w-4 h-4 border-2 border-gray-300 border-t-transparent rounded-full animate-spin" />
                      Loading recommendations…
                    </div>
                  ) : (addableGroups ?? []).length === 0 ? (
                    <p className="px-4 py-8 text-center text-xs text-gray-400">
                      All conference attendees are already targets.
                    </p>
                  ) : (
                    <div className="overflow-y-auto flex-1">
                      {(addableGroups ?? []).map(group => {
                        const isExpanded = expandedGroups.has(group.label);
                        const selectedInGroup = group.attendees.filter(a => selectedIds.has(a.id)).length;
                        return (
                          <div key={group.label}>
                            {/* Collapsible group header */}
                            <button
                              type="button"
                              onClick={() => setExpandedGroups(prev => {
                                const next = new Set(prev);
                                if (next.has(group.label)) next.delete(group.label); else next.add(group.label);
                                return next;
                              })}
                              className="w-full flex items-center justify-between px-4 py-2.5 bg-gray-50 border-b border-gray-100 sticky top-0 z-10 hover:bg-gray-100 transition-colors"
                            >
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-semibold text-gray-600 uppercase tracking-wider">{group.label}</span>
                                <span className="text-xs text-gray-400">({group.attendees.length})</span>
                                {selectedInGroup > 0 && (
                                  <span className="text-xs font-semibold text-brand-secondary">{selectedInGroup} selected</span>
                                )}
                              </div>
                              <svg
                                className={`w-3.5 h-3.5 text-gray-400 transition-transform flex-shrink-0 ${isExpanded ? 'rotate-180' : ''}`}
                                fill="none" stroke="currentColor" viewBox="0 0 24 24"
                              >
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                              </svg>
                            </button>
                            {/* Attendees (only when expanded) */}
                            {isExpanded && group.attendees.map(a => {
                              const companyValue = (a.companyWse != null && avgCostPerUnit > 0)
                                ? '$' + Math.round(a.companyWse * avgCostPerUnit).toLocaleString('en-US')
                                : null;
                              return (
                                <label key={a.id} className="flex items-start gap-3 px-4 py-2 hover:bg-gray-50 cursor-pointer select-none">
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
                                  <div className="min-w-0 flex-1">
                                    <p className="text-xs font-medium text-gray-800 leading-tight">
                                      {a.firstName} {a.lastName}
                                      {a.title && <span className="font-normal text-gray-500">, {a.title}</span>}
                                    </p>
                                    {a.companyName && (
                                      <div className="flex items-center justify-between gap-2 mt-0.5">
                                        <p className="text-xs text-gray-400 truncate">{a.companyName}</p>
                                        {companyValue && (
                                          <span className="text-xs font-semibold text-green-700 flex-shrink-0">{companyValue}</span>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                </label>
                              );
                            })}
                          </div>
                        );
                      })}
                      {loadingAddAttendees && (
                        <div className="flex items-center gap-2 px-4 py-3 text-gray-400 text-xs border-t border-gray-100">
                          <div className="w-3 h-3 border-2 border-gray-300 border-t-transparent rounded-full animate-spin flex-shrink-0" />
                          Loading more…
                        </div>
                      )}
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

        {/* Mobile/tablet — simple stack of visible tiers only, reflows on add/remove */}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:hidden gap-4">
          {TIERS.filter(tier => !minimizedTiers.has(tier.key)).map(tier => renderTierColumn(tier))}
        </div>

        {/* Desktop — all tiers stay mounted; column width animates via grid-template-columns */}
        <div
          className="hidden xl:grid gap-4 transition-[grid-template-columns] duration-300 ease-in-out"
          style={{ gridTemplateColumns: TIERS.map(t => minimizedTiers.has(t.key) ? '0fr' : '1fr').join(' ') }}
        >
          {TIERS.map(tier => (
            <div key={tier.key} className="overflow-hidden min-w-0">
              {renderTierColumn(tier)}
            </div>
          ))}
        </div>
      </div>

      {schedulingEntry && (
        <NewMeetingModal
          isOpen={true}
          onClose={() => setSchedulingEntry(null)}
          defaultConferenceId={conferenceId}
          prefillCompanyId={schedulingEntry.companyId ?? undefined}
          prefillAttendeeId={schedulingEntry.attendeeId}
          onSuccess={(meeting) => {
            setOptimisticMeetingIds(prev => new Set([...Array.from(prev), schedulingEntry.attendeeId]));
            onMeetingScheduled?.(meeting);
            setSchedulingEntry(null);
          }}
        />
      )}
    </div>
  );
}
