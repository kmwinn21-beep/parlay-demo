'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import toast from 'react-hot-toast';
import { TargetBtn } from './TargetBtn';
import { useRecordDrawer } from './RecordDrawerContext';
import type { TargetEntry } from '../PreConferenceReview';
import type { CompanyIntelRow, IntelData } from '@/app/api/conferences/[id]/intel/route';

const MAX_REFRESHES = 25;

const TIER_CONFIG: Record<string, { label: string; color: string; border: string; bg: string; defaultExpanded: boolean }> = {
  'Must Target': {
    label: 'Must Target',
    color: 'text-red-600',
    border: 'border-red-200',
    bg: 'bg-red-50',
    defaultExpanded: false,
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
  intel,
  targetMap,
  onToggleTarget,
  conferenceId,
}: {
  intel: CompanyIntelRow;
  targetMap: Map<number, TargetEntry>;
  onToggleTarget: (entry: Omit<TargetEntry, 'tier'>) => Promise<void>;
  conferenceId: number;
}) {
  const openRecord = useRecordDrawer();
  const [expanded, setExpanded] = useState(false);
  const [generatingSingle, setGeneratingSingle] = useState(false);
  const tierConf = TIER_CONFIG[intel.tier] ?? TIER_CONFIG['Monitor'];
  const dotColor = tierConf.color;

  const handleRefreshSingle = async () => {
    setGeneratingSingle(true);
    try {
      const res = await fetch(`/api/conferences/${conferenceId}/intel/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ company_id: intel.company_id }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string };
        toast.error(err.error ?? 'Failed to refresh intel');
        return;
      }
      toast.success(`Intel refreshed for ${intel.company_name}`);
      // Parent will need to refetch — signal via event or just show stale data
      window.dispatchEvent(new CustomEvent('intel-single-updated', { detail: { company_id: intel.company_id } }));
    } catch {
      toast.error('Failed to refresh intel');
    } finally {
      setGeneratingSingle(false);
    }
  };

  return (
    <div className={`border ${tierConf.border} rounded-xl overflow-hidden bg-white`}>
      {/* Card header */}
      <div className="p-4 flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            {intel.company_id ? (
              <button
                type="button"
                onClick={() => openRecord('company', intel.company_id)}
                className="font-semibold text-gray-900 hover:text-brand-secondary transition-colors text-sm text-left"
              >
                {intel.company_name}
              </button>
            ) : (
              <span className="font-semibold text-gray-900 text-sm">{intel.company_name}</span>
            )}
            {intel.used_icp_fallback && (
              <span className="text-xs bg-amber-50 text-amber-600 border border-amber-200 rounded-full px-2 py-0.5">
                ICP fallback used
              </span>
            )}
          </div>
          {intel.summary && (
            <p className="text-xs text-gray-500 mt-1 leading-relaxed line-clamp-2">{intel.summary}</p>
          )}
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            onClick={handleRefreshSingle}
            disabled={generatingSingle}
            className="text-gray-300 hover:text-gray-500 transition-colors"
            title="Refresh intel for this company"
          >
            {generatingSingle ? (
              <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
            ) : (
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            )}
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
      </div>

      {/* Expanded content */}
      {expanded && (
        <div className="border-t border-gray-100 p-4 space-y-3">
          {intel.summary && (
            <p className="text-xs text-gray-600 leading-relaxed">{intel.summary}</p>
          )}
          <IntelSection title="Pain Point Signals" items={intel.pain_point_signals} color={dotColor} icon="⚡" />
          <IntelSection title="Trigger Events" items={intel.trigger_events} color={dotColor} icon="📡" />
          <IntelSection title="Buying Signals" items={intel.buying_signals} color={dotColor} icon="💡" />
          <IntelSection title="Opening Angles" items={intel.opening_angles} color={dotColor} icon="🎯" />

          {/* Rep assignments */}
          {intel.rep_names.length > 0 && (
            <div className="flex flex-wrap gap-1 pt-1">
              {intel.rep_names.map(name => (
                <span key={name} className="px-2 py-0.5 rounded-full bg-blue-50 text-brand-secondary text-xs border border-blue-200">
                  {name}
                </span>
              ))}
            </div>
          )}

          {/* Attendees at conference */}
          {intel.attendees.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">At This Conference</p>
              <div className="space-y-1">
                {intel.attendees.map(a => {
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
                          companyName: intel.company_name,
                          companyId: intel.company_id,
                          companyWse: null,
                          assignedUserNames: intel.rep_names,
                        })}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {intel.generated_at && (
            <p className="text-xs text-gray-300">
              Generated {new Date(intel.generated_at).toLocaleString()}
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
  targetMap,
  onToggleTarget,
  conferenceId,
  initialLimit,
}: {
  tier: string;
  companies: CompanyIntelRow[];
  targetMap: Map<number, TargetEntry>;
  onToggleTarget: (entry: Omit<TargetEntry, 'tier'>) => Promise<void>;
  conferenceId: number;
  initialLimit: number | null;
}) {
  const config = TIER_CONFIG[tier] ?? TIER_CONFIG['Monitor'];
  const [showAll, setShowAll] = useState(initialLimit === null);
  const [sectionExpanded, setSectionExpanded] = useState(config.defaultExpanded);
  const visible = showAll || initialLimit === null ? companies : companies.slice(0, initialLimit);

  if (companies.length === 0) return null;

  return (
    <div>
      {/* Tier header — clickable to collapse/expand */}
      <button
        onClick={() => setSectionExpanded(e => !e)}
        className="w-full flex items-center gap-2 mb-3 group"
      >
        <h3 className={`text-xs font-bold uppercase tracking-wide ${config.color}`}>
          {config.label} · {companies.length}
        </h3>
        <svg
          className={`w-3.5 h-3.5 ${config.color} transition-transform ${sectionExpanded ? '' : '-rotate-90'}`}
          fill="none" stroke="currentColor" viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {sectionExpanded && (
        <div className="space-y-3">
          {visible.map(intel => (
            <CompanyIntelCard
              key={intel.company_id}
              intel={intel}
              targetMap={targetMap}
              onToggleTarget={onToggleTarget}
              conferenceId={conferenceId}
            />
          ))}
          {!showAll && initialLimit !== null && companies.length > initialLimit && (
            <button
              onClick={() => setShowAll(true)}
              className="w-full text-xs text-gray-400 hover:text-gray-600 py-2 border border-dashed border-gray-200 rounded-lg transition-colors"
            >
              Show {companies.length - initialLimit} more
            </button>
          )}
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
  const [data, setData] = useState<IntelData | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [progressState, setProgressState] = useState<{ status: string; completed: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollCountRef = useRef(0);

  const fetchIntel = useCallback(async () => {
    const res = await fetch(`/api/conferences/${conferenceId}/intel`).catch(() => null);
    if (res?.ok) {
      const json = await res.json() as IntelData;
      setData(json);
    }
  }, [conferenceId]);

  const stopPolling = useCallback((wasSuccessful: boolean) => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    setGenerating(false);
    setProgressState(null);
    if (wasSuccessful) toast.success('Target intel generated!');
  }, []);

  const startPolling = useCallback(() => {
    if (pollRef.current) return;
    pollCountRef.current = 0;
    pollRef.current = setInterval(async () => {
      const res = await fetch(`/api/conferences/${conferenceId}/intel/progress`).catch(() => null);
      if (!res?.ok) return;
      const state = await res.json() as { status?: string; completed?: number; total?: number };

      const completed = state.completed ?? 0;
      const total = state.total ?? 0;
      const status = state.status ?? 'idle';

      if (status === 'running') {
        setGenerating(true);
        setProgressState({ status, completed, total });
      }

      // Fetch partial results every 5 polls (~10s) so completed batches appear
      pollCountRef.current++;
      if (pollCountRef.current % 5 === 0) {
        fetchIntel();
      }

      if (status === 'done') {
        await fetchIntel();
        stopPolling(true);
      } else if (status === 'error') {
        setError('Intel generation encountered an error.');
        stopPolling(false);
      } else if (status === 'idle') {
        // Job finished or worker recycled — fetch latest and stop
        await fetchIntel();
        stopPolling(false);
      }
    }, 2000);
  }, [conferenceId, fetchIntel, stopPolling]);

  // On mount: load whatever intel has been saved so far
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/conferences/${conferenceId}/intel`)
      .then(r => r.json())
      .then((json: IntelData) => { if (!cancelled) setData(json); })
      .catch(() => { if (!cancelled) setError('Failed to load intel.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => {
      cancelled = true;
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conferenceId]);

  // Listen for single-company refreshes
  useEffect(() => {
    const handler = () => fetchIntel();
    window.addEventListener('intel-single-updated', handler);
    return () => window.removeEventListener('intel-single-updated', handler);
  }, [fetchIntel]);

  const generateAll = async () => {
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch(`/api/conferences/${conferenceId}/intel/generate-all`, { method: 'POST' });
      const json = await res.json().catch(() => ({})) as { total?: number; error?: string; state?: { status: string; completed: number; total: number } };

      if (res.status === 429) {
        setError(json.error ?? `Maximum of ${MAX_REFRESHES} bulk refreshes reached.`);
        setGenerating(false);
        return;
      }
      if (res.status === 400) {
        setError(json.error ?? 'No target companies found.');
        setGenerating(false);
        return;
      }
      if (res.status === 409) {
        // Already running — attach to the existing job
        const s = json.state;
        setProgressState({ status: 'running', completed: s?.completed ?? 0, total: s?.total ?? 0 });
        startPolling();
        return;
      }
      if (!res.ok) {
        setError(json.error ?? 'Failed to start generation.');
        setGenerating(false);
        return;
      }
      setProgressState({ status: 'running', completed: 0, total: json.total ?? 0 });
      startPolling();
    } catch {
      setError('Failed to start generation.');
      setGenerating(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin w-8 h-8 border-4 border-brand-secondary border-t-transparent rounded-full" />
      </div>
    );
  }

  const intel = data?.intel ?? [];
  const refreshCount = data?.refresh_count ?? 0;
  const lastRefreshAt = data?.last_refresh_at;
  const canRefresh = refreshCount < MAX_REFRESHES;

  if (intel.length === 0) {
    if (generating || progressState) {
      const completed = progressState?.completed ?? 0;
      const total = progressState?.total ?? null;
      const progressLabel = total
        ? `${Math.min(completed, total)} of ${total} companies compiled`
        : 'Preparing company batches…';
      return (
        <div className="text-center py-16">
          <div className="w-10 h-10 rounded-full border-2 border-brand-secondary/20 border-t-brand-secondary animate-spin mx-auto mb-3" />
          <p className="text-gray-500 text-sm font-medium">Generating target intel…</p>
          <p className="text-gray-400 text-xs mt-1">{progressLabel}</p>
          <p className="text-gray-400 text-xs mt-2">You can leave this tab while intel compiles. We&apos;ll notify you when it&apos;s ready.</p>
        </div>
      );
    }
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4 text-center">
        <div>
          <p className="text-gray-800 font-semibold mb-1">No intel generated yet</p>
          <p className="text-sm text-gray-500 max-w-md">
            Generate web-sourced intelligence on your target accounts attending this conference. Results are organized by the tiers assigned in Target Recommendations.
          </p>
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          onClick={generateAll}
          disabled={generating}
          className="btn-primary text-sm flex items-center gap-2"
        >
          Generate Target Intel
        </button>
      </div>
    );
  }

  // Group by tier
  const byTier = new Map<string, CompanyIntelRow[]>();
  for (const row of intel) {
    const t = row.tier;
    if (!byTier.has(t)) byTier.set(t, []);
    byTier.get(t)!.push(row);
  }

  const tierLimits: Record<string, number | null> = {
    'Must Target': null,
    'High Priority': 3,
    'Worth Engaging': 2,
    'Monitor': null,
  };

  return (
    <div className="space-y-6">
      {/* Header controls */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          {canRefresh ? (
            <button
              onClick={generateAll}
              disabled={generating}
              className="flex items-center gap-1.5 text-sm font-medium text-gray-500 hover:text-brand-secondary transition-colors disabled:opacity-50"
            >
              {generating ? (
                <div className="w-4 h-4 border-2 border-brand-secondary border-t-transparent rounded-full animate-spin" />
              ) : (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              )}
              {generating
                ? progressState?.total
                  ? `${progressState.completed} of ${progressState.total} compiled…`
                  : 'Starting…'
                : 'Refresh All Intel'}
            </button>
          ) : null}
          <span className="text-xs text-gray-400">
            {refreshCount} of {MAX_REFRESHES} bulk refreshes used
          </span>
        </div>
        {lastRefreshAt && (
          <span className="text-xs text-gray-400">
            Last refreshed {new Date(lastRefreshAt).toLocaleString()}
          </span>
        )}
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {/* Tier sections */}
      <div className="space-y-8">
        {TIER_ORDER.map(tier => {
          const companies = byTier.get(tier) ?? [];
          return (
            <TierSection
              key={tier}
              tier={tier}
              companies={companies}
              targetMap={targetMap}
              onToggleTarget={onToggleTarget}
              conferenceId={conferenceId}
              initialLimit={tierLimits[tier] ?? null}
            />
          );
        })}
      </div>
    </div>
  );
}
