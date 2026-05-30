'use client';

import { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import { TargetBtn } from './TargetBtn';
import { useAvgCostPerUnit, formatValuePill } from '@/lib/useAvgCostPerUnit';
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
  icp_fit_score: number;
  buyer_access_score: number;
  relationship_leverage_score: number;
  conference_opportunity_score: number;
  confidence_level: string;
  wse: number | null;
};

function CompanyAvatar({ name }: { name: string }) {
  const initials = name.trim().split(/\s+/).slice(0, 2).map(w => w[0]?.toUpperCase() ?? '').join('');
  const colors = [
    { bg: '#dbeafe', text: '#1e40af' },
    { bg: '#dcfce7', text: '#166534' },
    { bg: '#fce7f3', text: '#9d174d' },
    { bg: '#fef9c3', text: '#854d0e' },
    { bg: '#ede9fe', text: '#5b21b6' },
    { bg: '#ffedd5', text: '#9a3412' },
  ];
  const idx = name.split('').reduce((s, c) => s + c.charCodeAt(0), 0) % colors.length;
  const { bg, text } = colors[idx];
  return (
    <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 text-xs font-bold" style={{ backgroundColor: bg, color: text }}>
      {initials || '?'}
    </div>
  );
}

function ScorePill({ label, value }: { label: string; value: number }) {
  const color = value >= 75 ? '#059669' : value >= 50 ? '#f59e0b' : value >= 25 ? '#f97316' : '#ef4444';
  return (
    <div className="flex flex-col items-center gap-0.5">
      <span className="text-[10px] text-gray-400 uppercase tracking-wide font-medium">{label}</span>
      <span className="text-sm font-bold tabular-nums" style={{ color }}>{Math.round(value)}</span>
    </div>
  );
}

function ConfidencePill({ level }: { level: string }) {
  const cls =
    level === 'High' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
    level === 'Medium' ? 'bg-amber-50 text-amber-700 border-amber-200' :
    'bg-gray-100 text-gray-500 border-gray-200';
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${cls}`}>
      {level}
    </span>
  );
}

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
  avgCostPerUnit,
  onOpenRecord,
}: {
  company: ScoredCompany;
  intel: CompanyIntelRow | null;
  targetMap: Map<number, TargetEntry>;
  onToggleTarget: (entry: Omit<TargetEntry, 'tier'>) => Promise<void>;
  conferenceId: number;
  onRefreshed: () => void;
  avgCostPerUnit: number;
  onOpenRecord: (type: 'attendee' | 'company', id: number) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [generating, setGenerating] = useState(false);
  const tierConf = TIER_CONFIG[company.tier] ?? TIER_CONFIG['Monitor'];
  const dotColor = tierConf.color;

  const hasRealIntel = intel && intel.summary !== null && intel.summary !== 'Generating…';
  const isGenerating = generating || intel?.summary === 'Generating…';
  const pipelineValue = formatValuePill(company.wse, avgCostPerUnit);

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
      onRefreshed();
    } catch {
      toast.error('Failed to generate intel');
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className={`border ${tierConf.border} rounded-xl overflow-hidden bg-white flex flex-col`}>
      {/* ── Header ── */}
      <div className="p-4">
        <div className="flex items-start gap-3">
          <CompanyAvatar name={company.company_name} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              {company.company_id ? (
                <button
                  type="button"
                  onClick={() => onOpenRecord('company', company.company_id)}
                  className="font-semibold text-gray-900 hover:text-brand-secondary transition-colors text-sm text-left truncate"
                >
                  {company.company_name}
                </button>
              ) : (
                <span className="font-semibold text-gray-900 text-sm truncate">{company.company_name}</span>
              )}
              {/* Refresh / expand controls */}
              {hasRealIntel && (
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button onClick={handleGenerate} disabled={generating} className="text-gray-300 hover:text-gray-500 transition-colors disabled:opacity-40" title="Refresh intel">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                  </button>
                  <button onClick={() => setExpanded(e => !e)} className="text-gray-300 hover:text-gray-500 transition-colors">
                    <svg className={`w-4 h-4 transition-transform ${expanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Score row ── */}
        <div className="mt-3 flex items-end justify-between gap-2">
          <div className="flex items-end gap-4">
            <ScorePill label="ICP" value={company.icp_fit_score} />
            <ScorePill label="Buyer" value={company.buyer_access_score} />
            <ScorePill label="Relation" value={company.relationship_leverage_score} />
            <ScorePill label="Opp" value={company.conference_opportunity_score} />
          </div>
          <ConfidencePill level={company.confidence_level} />
        </div>

        {/* ── Pipeline value ── */}
        {pipelineValue && (
          <div className="mt-3 flex items-center justify-between border-t border-gray-100 pt-3">
            <span className="text-xs text-gray-400 font-medium">Pipeline influence</span>
            <span className="text-sm font-bold text-brand-secondary">{pipelineValue}</span>
          </div>
        )}

        {/* ── Intel state ── */}
        {isGenerating ? (
          <p className="text-xs text-gray-400 mt-3 flex items-center gap-1.5">
            <span className="w-3 h-3 border border-gray-300 border-t-gray-500 rounded-full animate-spin inline-block flex-shrink-0" />
            Researching…
          </p>
        ) : hasRealIntel ? (
          <p className="text-xs text-gray-500 mt-3 leading-relaxed line-clamp-2">{intel!.summary}</p>
        ) : (
          <button
            onClick={handleGenerate}
            disabled={generating}
            className={`mt-3 w-full text-xs font-medium py-1.5 px-3 rounded-lg border ${tierConf.border} ${tierConf.color} transition-colors disabled:opacity-40`}
          >
            Generate Intel
          </button>
        )}
      </div>

      {/* ── Expanded intel content ── */}
      {expanded && hasRealIntel && (
        <div className="border-t border-gray-100 p-4 space-y-3">
          <p className="text-xs text-gray-600 leading-relaxed">{intel!.summary}</p>
          <IntelSection title="Pain Point Signals" items={intel!.pain_point_signals} color={dotColor} icon="⚡" />
          <IntelSection title="Trigger Events" items={intel!.trigger_events} color={dotColor} icon="📡" />
          <IntelSection title="Buying Signals" items={intel!.buying_signals} color={dotColor} icon="💡" />
          <IntelSection title="Opening Angles" items={intel!.opening_angles} color={dotColor} icon="🎯" />

          {intel!.rep_names.length > 0 && (
            <div className="flex flex-wrap gap-1 pt-1">
              {intel!.rep_names.map(name => (
                <span key={name} className="px-2 py-0.5 rounded-full bg-blue-50 text-brand-secondary text-xs border border-blue-200">
                  {name}
                </span>
              ))}
            </div>
          )}

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
                        onClick={() => onOpenRecord('attendee', a.id)}
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
  avgCostPerUnit,
  onOpenRecord,
}: {
  tier: string;
  companies: ScoredCompany[];
  intelMap: Map<number, CompanyIntelRow>;
  targetMap: Map<number, TargetEntry>;
  onToggleTarget: (entry: Omit<TargetEntry, 'tier'>) => Promise<void>;
  conferenceId: number;
  onRefreshed: () => void;
  avgCostPerUnit: number;
  onOpenRecord: (type: 'attendee' | 'company', id: number) => void;
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
        <div className="flex flex-col sm:flex-row gap-3">
          {/* Left column — odd-indexed companies */}
          <div className="flex-1 flex flex-col gap-3">
            {companies.filter((_, i) => i % 2 === 0).map(company => (
              <CompanyIntelCard
                key={company.company_id}
                company={company}
                intel={intelMap.get(company.company_id) ?? null}
                targetMap={targetMap}
                onToggleTarget={onToggleTarget}
                conferenceId={conferenceId}
                onRefreshed={onRefreshed}
                avgCostPerUnit={avgCostPerUnit}
                onOpenRecord={onOpenRecord}
              />
            ))}
          </div>
          {/* Right column — even-indexed companies */}
          <div className="flex-1 flex flex-col gap-3">
            {companies.filter((_, i) => i % 2 === 1).map(company => (
              <CompanyIntelCard
                key={company.company_id}
                company={company}
                intel={intelMap.get(company.company_id) ?? null}
                targetMap={targetMap}
                onToggleTarget={onToggleTarget}
                conferenceId={conferenceId}
                onRefreshed={onRefreshed}
                avgCostPerUnit={avgCostPerUnit}
                onOpenRecord={onOpenRecord}
              />
            ))}
          </div>
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
  const avgCostPerUnit = useAvgCostPerUnit();
  const [recordDrawer, setRecordDrawer] = useState<{ type: 'attendee' | 'company'; id: number } | null>(null);
  const openRecord = useCallback((type: 'attendee' | 'company', id: number) => setRecordDrawer({ type, id }), []);
  const closeRecord = useCallback(() => setRecordDrawer(null), []);
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
      targetingRes?.ok ? (targetingRes.json() as Promise<{ companies?: Array<{ company_id: number; company_name: string; target_priority_tier_key: string; icp_fit_score: number; buyer_access_score: number; relationship_leverage_score: number; conference_opportunity_score: number; confidence_level: string; wse: number | null }> }>) : Promise.resolve(null),
      intelRes?.ok ? (intelRes.json() as Promise<{ intel?: CompanyIntelRow[] }>) : Promise.resolve(null),
    ]);

    if (targetingData) {
      const companies = (targetingData.companies ?? [])
        .filter(c => VALID_TIER_KEYS.has(c.target_priority_tier_key))
        .map(c => ({
          company_id: c.company_id,
          company_name: c.company_name,
          tier: tierKeyToLabel(c.target_priority_tier_key),
          icp_fit_score: c.icp_fit_score ?? 0,
          buyer_access_score: c.buyer_access_score ?? 0,
          relationship_leverage_score: c.relationship_leverage_score ?? 0,
          conference_opportunity_score: c.conference_opportunity_score ?? 0,
          confidence_level: c.confidence_level ?? 'Low',
          wse: c.wse ?? null,
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
    <>
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
              avgCostPerUnit={avgCostPerUnit}
              onOpenRecord={openRecord}
            />
          );
        })}
      </div>

      {/* Record drawer — slides in from right, same pattern as MyDebriefDrawer */}
      {recordDrawer != null && (
        <div className="sm:hidden fixed inset-0 z-[69] bg-black/30" onClick={closeRecord} />
      )}
      <div
        className={`fixed top-0 right-0 h-screen bg-white border-l border-gray-200 shadow-2xl z-[70] flex flex-col overflow-hidden transition-all ease-out ${
          recordDrawer != null ? 'w-full sm:w-[420px]' : 'w-0'
        }`}
        style={{ transitionDuration: '200ms' }}
        onClick={e => e.stopPropagation()}
      >
        {recordDrawer != null && (
          <>
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 flex-shrink-0 bg-white">
              <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
                {recordDrawer.type === 'company' ? 'Company' : 'Attendee'}
              </span>
              <button type="button" onClick={closeRecord} className="text-gray-400 hover:text-gray-600 transition-colors">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <iframe
              key={`${recordDrawer.type}-${recordDrawer.id}`}
              src={`/${recordDrawer.type === 'attendee' ? 'attendees' : 'companies'}/${recordDrawer.id}?embed=true`}
              className="flex-1 border-0 w-full"
              title={`${recordDrawer.type} record`}
            />
          </>
        )}
      </div>
    </>
  );
}
