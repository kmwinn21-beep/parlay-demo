'use client';

import { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import { TargetBtn } from './TargetBtn';
import { useRecordDrawer } from './RecordDrawerContext';
import type { TargetEntry } from '../PreConferenceReview';
import type { CompanyIntelRow } from '@/app/api/conferences/[id]/intel/route';

const TIER_CONFIG: Record<string, { label: string; color: string; border: string; bg: string; defaultExpanded: boolean }> = {
  'Must Target': {
    label: 'Must Target',
    color: 'text-red-600',
    border: 'border-red-200',
    bg: 'bg-red-50',
    defaultExpanded: true,
  },
  'High Priority': {
    label: 'High Priority',
    color: 'text-amber-600',
    border: 'border-amber-200',
    bg: 'bg-amber-50',
    defaultExpanded: true,
  },
  'Worth Engaging': {
    label: 'Worth Engaging',
    color: 'text-blue-600',
    border: 'border-blue-200',
    bg: 'bg-blue-50',
    defaultExpanded: true,
  },
  'Monitor': {
    label: 'Monitor',
    color: 'text-gray-500',
    border: 'border-gray-200',
    bg: 'bg-gray-50',
    defaultExpanded: false,
  },
};

const TIER_ORDER = ['Must Target', 'High Priority', 'Worth Engaging', 'Monitor'];

const VALID_TIER_KEYS = new Set(['must_target', 'high_priority', 'worth_engaging', 'monitor']);

function tierKeyToLabel(key: string): string {
  switch (key) {
    case 'must_target':    return 'Must Target';
    case 'high_priority':  return 'High Priority';
    case 'worth_engaging': return 'Worth Engaging';
    case 'monitor':        return 'Monitor';
    default:               return key;
  }
}

type ScoredCompany = {
  company_id: number;
  company_name: string;
  tier: string;
};

function IntelBullets({ items, color }: { items: string[]; color: string }) {
  if (items.length === 0) return null;
  return (
    <ul className="space-y-1">
      {items.map((item, i) => (
        <li key={i} className="text-xs text-gray-600 flex gap-1.5 items-start">
          <span className={`${color} mt-0.5 flex-shrink-0`}>·</span>
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

function IntelSection({ title, items, color, icon }: { title: string; items: string[]; color: string; icon: string }) {
  if (items.length === 0) return null;
  return (
    <div>
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1 flex items-center gap-1">
        <span>{icon}</span> {title}
      </p>
      <IntelBullets items={items} color={color} />
    </div>
  );
}

function CompanyIntelCard({
  company,
  intel,
  targetMap,
  onToggleTarget,
  conferenceId,
  onRefreshed,
}: {
  company: ScoredCompany;
  intel: CompanyIntelRow | null;
  targetMap: Map<number, TargetEntry>;
  onToggleTarget: (entry: Omit<TargetEntry, 'tier'>) => Promise<void>;
  conferenceId: number;
  onRefreshed: () => void;
}) {
  const openRecord = useRecordDrawer();
  const [expanded, setExpanded] = useState(false);
  const [generating, setGenerating] = useState(false);
  const tierConf = TIER_CONFIG[company.tier] ?? TIER_CONFIG['Monitor'];
  const dotColor = tierConf.color;

  const hasRealIntel = intel && intel.summary !== null && intel.summary !== 'Generating…';
  const isGenerating = generating || intel?.summary === 'Generating…';


  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const res = await fetch(`/api/conferences/${conferenceId}/intel/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ company_id: company.company_id }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string };
        toast.error(err.error ?? 'Failed to generate intel');
        return;
      }
      // Endpoint returns immediately after writing stub — refresh to show spinner
      onRefreshed();
    } catch {
      toast.error('Failed to generate intel');
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className={`border ${tierConf.border} rounded-xl overflow-hidden bg-white flex flex-col`}>
      {/* Card header */}
      <div className="p-4 flex-1">
        <div className="flex items-start gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              {company.company_id ? (
                <button
                  type="button"
                  onClick={() => openRecord('company', company.company_id)}
                  className="font-semibold text-gray-900 hover:text-brand-secondary transition-colors text-sm text-left"
                >
                  {company.company_name}
                </button>
              ) : (
                <span className="font-semibold text-gray-900 text-sm">{company.company_name}</span>
              )}
              {intel?.used_icp_fallback && (
                <span className="text-xs bg-amber-50 text-amber-600 border border-amber-200 rounded-full px-2 py-0.5">
                  ICP fallback
                </span>
              )}
            </div>

            {/* Summary preview */}
            {isGenerating ? (
              <p className="text-xs text-gray-400 mt-1 flex items-center gap-1.5">
                <span className="w-3 h-3 border border-gray-300 border-t-gray-500 rounded-full animate-spin inline-block flex-shrink-0" />
                Researching…
              </p>
            ) : hasRealIntel ? (
              <p className="text-xs text-gray-500 mt-1 leading-relaxed line-clamp-2">{intel!.summary}</p>
            ) : null}
          </div>

          {/* Expand / refresh buttons — only when intel exists */}
          {hasRealIntel && (
            <div className="flex items-center gap-1 flex-shrink-0">
              <button
                onClick={handleGenerate}
                disabled={generating}
                className="text-gray-300 hover:text-gray-500 transition-colors disabled:opacity-40"
                title="Refresh intel"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              </button>
              <button
                onClick={() => setExpanded(e => !e)}
                className="text-gray-300 hover:text-gray-500 transition-colors"
              >
                <svg className={`w-4 h-4 transition-transform ${expanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
            </div>
          )}
        </div>

        {/* Generate Intel button — shown when no intel yet and not currently generating */}
        {!hasRealIntel && !isGenerating && (
          <button
            onClick={handleGenerate}
            disabled={generating}
            className={`mt-3 w-full text-xs font-medium py-1.5 px-3 rounded-lg border ${tierConf.border} ${tierConf.color} hover:${tierConf.bg} transition-colors disabled:opacity-40`}
          >
            Generate Intel
          </button>
        )}
      </div>

      {/* Expanded intel content */}
      {expanded && hasRealIntel && (
        <div className="border-t border-gray-100 p-4 space-y-3">
          <p className="text-xs text-gray-600 leading-relaxed">{intel!.summary}</p>
          <IntelSection title="Pain Point Signals" items={intel!.pain_point_signals} color={dotColor} icon="⚡" />
          <IntelSection title="Trigger Events" items={intel!.trigger_events} color={dotColor} icon="📡" />
          <IntelSection title="Buying Signals" items={intel!.buying_signals} color={dotColor} icon="💡" />
          <IntelSection title="Opening Angles" items={intel!.opening_angles} color={dotColor} icon="🎯" />

          {/* Rep assignments */}
          {intel!.rep_names.length > 0 && (
            <div className="flex flex-wrap gap-1 pt-1">
              {intel!.rep_names.map(name => (
                <span key={name} className="px-2 py-0.5 rounded-full bg-blue-50 text-brand-secondary text-xs border border-blue-200">
                  {name}
                </span>
              ))}
            </div>
          )}

          {/* Attendees */}
          {intel!.attendees.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">At This Conference</p>
              <div className="space-y-1">
                {intel!.attendees.map(a => {
                  const isTarget = targetMap.has(a.id);
                  return (
                    <div key={a.id} className="flex items-center gap-2 text-xs">
                      <button
                        type="button"
                        onClick={() => openRecord('attendee', a.id)}
                        className="text-gray-700 truncate flex-1 hover:text-brand-secondary transition-colors text-left"
                      >
                        {a.first_name} {a.last_name}{a.title ? ` · ${a.title}` : ''}
                      </button>
                      <TargetBtn
                        isTarget={isTarget}
                        onClick={() => onToggleTarget({
                          attendeeId: a.id,
                          firstName: a.first_name,
                          lastName: a.last_name,
                          title: a.title,
                          seniority: a.seniority,
                          companyName: company.company_name,
                          companyId: company.company_id,
                          companyWse: null,
                          assignedUserNames: intel!.rep_names,
                        })}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {intel!.generated_at && (
            <p className="text-xs text-gray-300">
              Generated {new Date(intel!.generated_at).toLocaleString()}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function TierSection({
  tier,
  companies,
  intelMap,
  targetMap,
  onToggleTarget,
  conferenceId,
  onRefreshed,
}: {
  tier: string;
  companies: ScoredCompany[];
  intelMap: Map<number, CompanyIntelRow>;
  targetMap: Map<number, TargetEntry>;
  onToggleTarget: (entry: Omit<TargetEntry, 'tier'>) => Promise<void>;
  conferenceId: number;
  onRefreshed: () => void;
}) {
  const config = TIER_CONFIG[tier] ?? TIER_CONFIG['Monitor'];
  const [sectionExpanded, setSectionExpanded] = useState(config.defaultExpanded);

  if (companies.length === 0) return null;

  const generatedCount = companies.filter(c => {
    const intel = intelMap.get(c.company_id);
    return intel && intel.summary !== null && intel.summary !== 'Generating…';
  }).length;

  return (
    <div>
      <button
        onClick={() => setSectionExpanded(e => !e)}
        className="w-full flex items-center gap-2 mb-3 group"
      >
        <h3 className={`text-xs font-bold uppercase tracking-wide ${config.color}`}>
          {config.label} · {companies.length}
        </h3>
        {generatedCount > 0 && generatedCount < companies.length && (
          <span className="text-xs text-gray-400">{generatedCount} generated</span>
        )}
        <svg
          className={`w-3.5 h-3.5 ${config.color} transition-transform ${sectionExpanded ? '' : '-rotate-90'}`}
          fill="none" stroke="currentColor" viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {sectionExpanded && (
        <div className="grid grid-cols-2 gap-3">
          {companies.map(company => (
            <CompanyIntelCard
              key={company.company_id}
              company={company}
              intel={intelMap.get(company.company_id) ?? null}
              targetMap={targetMap}
              onToggleTarget={onToggleTarget}
              conferenceId={conferenceId}
              onRefreshed={onRefreshed}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function TargetIntelTab({
  conferenceId,
  targetMap,
  onToggleTarget,
}: {
  conferenceId: number;
  targetMap: Map<number, TargetEntry>;
  onToggleTarget: (entry: Omit<TargetEntry, 'tier'>) => Promise<void>;
}) {
  const [scoredCompanies, setScoredCompanies] = useState<ScoredCompany[]>([]);
  const [intelMap, setIntelMap] = useState<Map<number, CompanyIntelRow>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetches both scored companies and intel — used on initial load only.
  // Targeting is expensive (per-attendee DB calls); never fetch it during polling.
  const loadData = useCallback(async () => {
    const [targetingRes, intelRes] = await Promise.all([
      fetch(`/api/conferences/${conferenceId}/targeting`).catch(() => null),
      fetch(`/api/conferences/${conferenceId}/intel`).catch(() => null),
    ]);

    const [targetingData, intelData] = await Promise.all([
      targetingRes?.ok ? (targetingRes.json() as Promise<{ companies?: Array<{ company_id: number; company_name: string; target_priority_tier_key: string }> }>) : Promise.resolve(null),
      intelRes?.ok ? (intelRes.json() as Promise<{ intel?: CompanyIntelRow[] }>) : Promise.resolve(null),
    ]);

    if (targetingData) {
      const companies = (targetingData.companies ?? [])
        .filter(c => VALID_TIER_KEYS.has(c.target_priority_tier_key))
        .map(c => ({
          company_id: c.company_id,
          company_name: c.company_name,
          tier: tierKeyToLabel(c.target_priority_tier_key),
        }));
      setScoredCompanies(companies);
    }
    if (intelData) {
      const map = new Map<number, CompanyIntelRow>();
      for (const row of intelData.intel ?? []) map.set(row.company_id, row);
      setIntelMap(map);
    }
  }, [conferenceId]);

  // Fetches only intel — used during the poll loop. Scored companies are stable
  // while generation is running so there is no need to hit /targeting every tick.
  const pollIntel = useCallback(async () => {
    const res = await fetch(`/api/conferences/${conferenceId}/intel`).catch(() => null);
    if (!res?.ok) return;
    const data = await res.json() as { intel?: CompanyIntelRow[] };
    const map = new Map<number, CompanyIntelRow>();
    for (const row of data.intel ?? []) map.set(row.company_id, row);
    setIntelMap(map);
  }, [conferenceId]);

  useEffect(() => {
    loadData()
      .catch(() => setError('Failed to load intel data.'))
      .finally(() => setLoading(false));
  }, [loadData]);

  // Single parent-level poll — fires only when at least one card is generating.
  // Only fetches /intel (not /targeting) to avoid expensive per-attendee DB queries.
  const anyGenerating = Array.from(intelMap.values()).some(r => r.summary === 'Generating…');
  useEffect(() => {
    if (!anyGenerating) return;
    const interval = setInterval(pollIntel, 4000);
    return () => clearInterval(interval);
  }, [anyGenerating, pollIntel]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin w-8 h-8 border-4 border-brand-secondary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-sm text-red-600">{error}</p>
      </div>
    );
  }

  if (scoredCompanies.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3 text-center">
        <p className="text-gray-800 font-semibold">No scored companies found</p>
        <p className="text-sm text-gray-500 max-w-md">
          Run Target Recommendations first to score and tier your attending companies, then return here to generate intel.
        </p>
      </div>
    );
  }

  // Group by tier
  const byTier = new Map<string, ScoredCompany[]>();
  for (const c of scoredCompanies) {
    if (!byTier.has(c.tier)) byTier.set(c.tier, []);
    byTier.get(c.tier)!.push(c);
  }

  return (
    <div className="space-y-8">
      {TIER_ORDER.map(tier => {
        const companies = byTier.get(tier) ?? [];
        return (
          <TierSection
            key={tier}
            tier={tier}
            companies={companies}
            intelMap={intelMap}
            targetMap={targetMap}
            onToggleTarget={onToggleTarget}
            conferenceId={conferenceId}
            onRefreshed={loadData}
          />
        );
      })}
    </div>
  );
}
