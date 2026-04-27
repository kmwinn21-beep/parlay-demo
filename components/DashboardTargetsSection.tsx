'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import type { DashboardConference } from './RecentSection';

interface TargetEntry {
  attendeeId: number;
  firstName: string;
  lastName: string;
  title: string | null;
  seniority: string | null;
  companyName: string | null;
  companyId: number | null;
  assignedUserNames: string[];
  tier: string;
}

const TIER_ORDER = ['1', '2', '3', 'unassigned'];

const TIER_CONFIG = [
  {
    key: '1',
    label: 'Tier 1',
    activeBg: 'bg-red-50',
    activeBorder: 'border-red-200',
    activeText: 'text-red-600',
    pillBg: 'bg-red-100',
    pillText: 'text-red-700',
    pillBorder: 'border-red-200',
  },
  {
    key: '2',
    label: 'Tier 2',
    activeBg: 'bg-brand-primary/10',
    activeBorder: 'border-brand-primary/40',
    activeText: 'text-brand-primary',
    pillBg: 'bg-brand-primary/10',
    pillText: 'text-brand-primary',
    pillBorder: 'border-brand-primary/40',
  },
  {
    key: '3',
    label: 'Tier 3',
    activeBg: 'bg-brand-highlight/10',
    activeBorder: 'border-brand-highlight/40',
    activeText: 'text-brand-highlight',
    pillBg: 'bg-brand-highlight/10',
    pillText: 'text-brand-highlight',
    pillBorder: 'border-brand-highlight/40',
  },
  {
    key: 'unassigned',
    label: 'Unassigned',
    activeBg: 'bg-gray-50',
    activeBorder: 'border-gray-200',
    activeText: 'text-gray-500',
    pillBg: 'bg-gray-100',
    pillText: 'text-gray-600',
    pillBorder: 'border-gray-300',
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
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border"
      style={{ color, borderColor: `${color}60`, backgroundColor: `${color}14` }}
    >
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

function TierPill({ tier }: { tier: string }) {
  const config = TIER_CONFIG.find(t => t.key === tier);
  if (!config) return null;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border flex-shrink-0 ${config.pillBg} ${config.pillText} ${config.pillBorder}`}>
      {config.label}
    </span>
  );
}

function DashboardTargetCard({ entry }: { entry: TargetEntry }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-3 hover:shadow-sm transition-all">
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="min-w-0 flex-1">
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
        <TierPill tier={entry.tier} />
      </div>
      <div className="flex flex-wrap gap-1">
        {entry.seniority && <SeniorityPill seniority={entry.seniority} />}
        {entry.assignedUserNames[0] && <UserPill name={entry.assignedUserNames[0]} />}
      </div>
    </div>
  );
}

function sortConferencesForDropdown(conferences: DashboardConference[]): DashboardConference[] {
  const inProgress = conferences.filter(c => c.status === 'in_progress');
  const upcoming = conferences
    .filter(c => c.status === 'upcoming')
    .sort((a, b) => a.start_date.localeCompare(b.start_date));
  const past = conferences
    .filter(c => c.status === 'past')
    .sort((a, b) => b.start_date.localeCompare(a.start_date));
  return [...inProgress, ...upcoming, ...past];
}

export function DashboardTargetsSection({ allConferences }: { allConferences: DashboardConference[] }) {
  const sortedConferences = sortConferencesForDropdown(allConferences);
  const defaultConf = sortedConferences[0] ?? null;

  const [selectedConfId, setSelectedConfId] = useState<number | null>(defaultConf?.id ?? null);
  const [targets, setTargets] = useState<TargetEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedTiers, setSelectedTiers] = useState<Set<string>>(new Set(['1']));

  const fetchTargets = useCallback(async (confId: number) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/conferences/${confId}/targets`);
      if (res.ok) {
        const data = await res.json() as TargetEntry[];
        setTargets(data);
      }
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedConfId != null) {
      fetchTargets(selectedConfId);
    }
  }, [selectedConfId, fetchTargets]);

  const tierCounts: Record<string, number> = {
    '1': targets.filter(t => t.tier === '1').length,
    '2': targets.filter(t => t.tier === '2').length,
    '3': targets.filter(t => t.tier === '3').length,
    'unassigned': targets.filter(t => t.tier === 'unassigned').length,
  };

  function toggleTier(key: string) {
    setSelectedTiers(prev => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }

  const filteredTargets = targets
    .filter(t => selectedTiers.has(t.tier))
    .sort((a, b) => TIER_ORDER.indexOf(a.tier) - TIER_ORDER.indexOf(b.tier));

  return (
    <div className="flex flex-col gap-4">
      {/* Header row: title + conference dropdown */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h2 className="text-lg font-semibold text-brand-primary font-serif flex items-center gap-2">
          Targets
          <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-red-100">
            <svg
              className="w-5 h-5 text-red-500"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="10" />
              <circle cx="12" cy="12" r="4" />
              <line x1="12" y1="2" x2="12" y2="6" />
              <line x1="12" y1="18" x2="12" y2="22" />
              <line x1="2" y1="12" x2="6" y2="12" />
              <line x1="18" y1="12" x2="22" y2="12" />
            </svg>
          </span>
        </h2>
        {sortedConferences.length > 0 && (
          <select
            value={selectedConfId ?? ''}
            onChange={e => {
              setSelectedConfId(Number(e.target.value));
              setSelectedTiers(new Set(['1']));
            }}
            className="input-field text-sm min-w-0"
          >
            {sortedConferences.map(conf => (
              <option key={conf.id} value={conf.id}>
                {conf.status === 'in_progress' ? '● ' : ''}{conf.name}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Tier filter cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {TIER_CONFIG.map(tier => {
          const isSelected = selectedTiers.has(tier.key);
          const count = tierCounts[tier.key] ?? 0;
          return (
            <button
              key={tier.key}
              onClick={() => toggleTier(tier.key)}
              className={`rounded-xl border-2 p-3 text-center transition-all cursor-pointer ${
                isSelected
                  ? `${tier.activeBg} ${tier.activeBorder}`
                  : 'bg-gray-100 border-gray-200'
              }`}
            >
              <div className={`text-2xl font-bold leading-tight ${isSelected ? tier.activeText : 'text-gray-400'}`}>
                {count}
              </div>
              <div className={`text-xs font-semibold mt-0.5 ${isSelected ? tier.activeText : 'text-gray-400'}`}>
                {tier.label}
              </div>
            </button>
          );
        })}
      </div>

      {/* Target cards */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="h-20 bg-gray-100 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : filteredTargets.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-6">
          {targets.length === 0
            ? 'No targets set for this conference.'
            : 'No targets match the selected filters.'}
        </p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {filteredTargets.map(entry => (
            <DashboardTargetCard key={entry.attendeeId} entry={entry} />
          ))}
        </div>
      )}
    </div>
  );
}
