'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import type { DashboardConference } from './RecentSection';
import type { TargetEntry } from './PreConferenceReview';

type TierKey = '1' | '2' | '3' | 'unassigned';

const TIER_CONFIG: {
  key: TierKey;
  label: string;
  activeBg: string;
  activeBorder: string;
  activeText: string;
}[] = [
  { key: '1',          label: 'Tier 1',      activeBg: 'bg-red-50',            activeBorder: 'border-red-400',           activeText: 'text-red-600'     },
  { key: '2',          label: 'Tier 2',      activeBg: 'bg-brand-primary/10',  activeBorder: 'border-brand-primary/40',  activeText: 'text-brand-primary' },
  { key: '3',          label: 'Tier 3',      activeBg: 'bg-brand-highlight/10',activeBorder: 'border-brand-highlight/40',activeText: 'text-brand-highlight' },
  { key: 'unassigned', label: 'Unassigned',  activeBg: 'bg-gray-50',           activeBorder: 'border-gray-400',          activeText: 'text-gray-600'    },
];

const TIER_ORDER: TierKey[] = ['1', '2', '3', 'unassigned'];

const SENIORITY_COLORS: Record<string, string> = {
  'C-Suite': '#7c3aed',
  'VP/SVP': '#1B76BC',
  'Director': '#059669',
  'Manager': '#f59e0b',
  'Other': '#6b7280',
};

function getSeniorityColor(s: string | null) {
  return s ? (SENIORITY_COLORS[s] ?? '#6b7280') : '#6b7280';
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

function TargetCard({ entry }: { entry: TargetEntry }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-3 hover:shadow-sm transition-all">
      <div className="mb-2">
        <Link
          href={`/attendees/${entry.attendeeId}`}
          className="text-sm font-semibold text-brand-primary hover:text-brand-secondary leading-tight block truncate"
        >
          {entry.firstName} {entry.lastName}
          {entry.title && <span className="font-normal text-xs text-gray-500">, {entry.title}</span>}
        </Link>
        {entry.companyName && (
          <p className="text-xs text-gray-400 truncate mt-0.5">{entry.companyName}</p>
        )}
      </div>
      <div className="flex flex-wrap gap-1">
        {entry.seniority && <SeniorityPill seniority={entry.seniority} />}
        {entry.assignedUserNames[0] && <UserPill name={entry.assignedUserNames[0]} />}
      </div>
    </div>
  );
}

interface Props {
  allConferences: DashboardConference[];
}

export function DashboardTargetsSection({ allConferences }: Props) {
  const inProgress = allConferences.filter(c => c.status === 'in_progress').sort((a, b) => a.start_date.localeCompare(b.start_date));
  const upcoming   = allConferences.filter(c => c.status === 'upcoming').sort((a, b) => a.start_date.localeCompare(b.start_date));
  const past       = allConferences.filter(c => c.status === 'past').sort((a, b) => b.start_date.localeCompare(a.start_date));
  const sorted     = [...inProgress, ...upcoming, ...past];

  const [selectedId, setSelectedId]   = useState<number | null>(sorted[0]?.id ?? null);
  const [targets, setTargets]         = useState<TargetEntry[]>([]);
  const [loading, setLoading]         = useState(false);
  const [activeTiers, setActiveTiers] = useState<Set<TierKey>>(new Set<TierKey>(['1']));

  const fetchTargets = useCallback(async (confId: number) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/conferences/${confId}/targets`);
      setTargets(res.ok ? await res.json() : []);
    } catch {
      setTargets([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedId) fetchTargets(selectedId);
    else setTargets([]);
  }, [selectedId, fetchTargets]);

  function toggleTier(tier: TierKey) {
    setActiveTiers(prev => {
      const next = new Set(prev);
      next.has(tier) ? next.delete(tier) : next.add(tier);
      return next;
    });
  }

  const tierCounts = Object.fromEntries(
    TIER_CONFIG.map(t => [t.key, targets.filter(x => x.tier === t.key).length])
  ) as Record<TierKey, number>;

  const filteredTargets = TIER_ORDER
    .filter(t => activeTiers.has(t))
    .flatMap(t => targets.filter(x => x.tier === t));

  return (
    <div className="lg:col-span-2 card">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-brand-primary font-serif flex items-center gap-2">
          Targets
          <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-red-100">
            <svg className="w-5 h-5 text-red-500" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="10" />
              <circle cx="12" cy="12" r="4" />
              <line x1="12" y1="2" x2="12" y2="6" />
              <line x1="12" y1="18" x2="12" y2="22" />
              <line x1="2"  y1="12" x2="6"  y2="12" />
              <line x1="18" y1="12" x2="22" y2="12" />
            </svg>
          </span>
        </h2>

        {/* Conference selector dropdown */}
        <select
          value={selectedId ?? ''}
          onChange={e => { setSelectedId(Number(e.target.value)); setActiveTiers(new Set<TierKey>(['1'])); }}
          className="input-field text-sm max-w-[220px]"
        >
          {sorted.length === 0 && <option value="">No conferences</option>}
          {inProgress.length > 0 && (
            <optgroup label="In Progress">
              {inProgress.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </optgroup>
          )}
          {upcoming.length > 0 && (
            <optgroup label="Upcoming">
              {upcoming.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </optgroup>
          )}
          {past.length > 0 && (
            <optgroup label="Past">
              {past.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </optgroup>
          )}
        </select>
      </div>

      {/* Tier filter cards */}
      <div className="grid grid-cols-4 gap-2 mb-4">
        {TIER_CONFIG.map(tier => {
          const active = activeTiers.has(tier.key);
          return (
            <button
              key={tier.key}
              onClick={() => toggleTier(tier.key)}
              className={`rounded-xl border-2 p-3 text-center transition-all ${
                active ? `${tier.activeBg} ${tier.activeBorder}` : 'bg-gray-50 border-gray-200'
              }`}
            >
              <div className={`text-xl font-bold ${active ? tier.activeText : 'text-gray-400'}`}>
                {tierCounts[tier.key] ?? 0}
              </div>
              <div className={`text-xs font-semibold mt-0.5 ${active ? tier.activeText : 'text-gray-400'}`}>
                {tier.label}
              </div>
            </button>
          );
        })}
      </div>

      {/* Target cards */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 animate-pulse">
          {[1, 2, 3, 4].map(i => <div key={i} className="h-20 bg-gray-100 rounded-xl" />)}
        </div>
      ) : filteredTargets.length === 0 ? (
        <div className="text-center py-8">
          <p className="text-sm text-gray-400">
            {activeTiers.size === 0
              ? 'Select a tier to view targets.'
              : targets.length === 0
              ? 'No targets set for this conference.'
              : 'No targets in the selected tier(s).'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {filteredTargets.map(entry => (
            <TargetCard key={entry.attendeeId} entry={entry} />
          ))}
        </div>
      )}
    </div>
  );
}
