'use client';

import { useState } from 'react';
import Link from 'next/link';
import { TargetBtn } from './TargetBtn';
import type { TargetEntry } from '../PreConferenceReview';

const TIERS = [
  { key: '1', label: 'Tier 1', color: '#7c3aed', bg: 'bg-purple-50', border: 'border-purple-200' },
  { key: '2', label: 'Tier 2', color: '#1B76BC', bg: 'bg-blue-50', border: 'border-blue-200' },
  { key: '3', label: 'Tier 3', color: '#059669', bg: 'bg-emerald-50', border: 'border-emerald-200' },
  { key: 'unassigned', label: 'Unassigned', color: '#6b7280', bg: 'bg-gray-50', border: 'border-gray-200' },
] as const;

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
  onDragStart,
  onToggleTarget,
}: {
  entry: TargetEntry;
  hasMeeting: boolean;
  isDragging: boolean;
  onDragStart: () => void;
  onToggleTarget: (entry: Omit<TargetEntry, 'tier'>) => Promise<void>;
}) {
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
            assignedUserNames: entry.assignedUserNames,
          })}
        />
      </div>
      <div className="flex flex-wrap gap-1 mt-1">
        {entry.seniority && <SeniorityPill seniority={entry.seniority} />}
        {entry.assignedUserNames[0] && <UserPill name={entry.assignedUserNames[0]} />}
        {hasMeeting && (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
            Meeting Scheduled
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
}: {
  conferenceName: string;
  targetMap: Map<number, TargetEntry>;
  meetingAttendeeIds: Set<number>;
  onToggleTarget: (entry: Omit<TargetEntry, 'tier'>) => Promise<void>;
  onSetTier: (attendeeId: number, tier: string) => Promise<void>;
}) {
  const [draggingId, setDraggingId] = useState<number | null>(null);
  const [dragOverTier, setDragOverTier] = useState<string | null>(null);

  const targets = Array.from(targetMap.values());

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
        <h3 className="text-sm font-semibold text-gray-700 mb-4">{conferenceName} Targets</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {TIERS.map(tier => {
            const tierCards = targets.filter(t => t.tier === tier.key);
            const isOver = dragOverTier === tier.key;
            return (
              <div
                key={tier.key}
                className={`rounded-xl border-2 p-3 min-h-[120px] transition-colors ${tier.border} ${tier.bg}`}
                style={isOver ? { outline: `2px solid ${tier.color}`, outlineOffset: '2px' } : {}}
                onDragOver={e => { e.preventDefault(); setDragOverTier(tier.key); }}
                onDragLeave={() => setDragOverTier(null)}
                onDrop={() => handleDrop(tier.key)}
              >
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-bold uppercase tracking-wider" style={{ color: tier.color }}>{tier.label}</span>
                  <span className="text-xs font-semibold text-gray-400">{tierCards.length}</span>
                </div>
                <div className="space-y-2">
                  {tierCards.map(entry => (
                    <TargetCard
                      key={entry.attendeeId}
                      entry={entry}
                      hasMeeting={meetingAttendeeIds.has(entry.attendeeId)}
                      isDragging={draggingId === entry.attendeeId}
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
