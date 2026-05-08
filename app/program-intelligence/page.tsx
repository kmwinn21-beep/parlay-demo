'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
  ResponsiveContainer,
} from 'recharts';
import { useCapabilities } from '@/lib/useCapabilities';

// ── Types ─────────────────────────────────────────────────────────────────────

type DatePreset = 'this_year' | 'last_year' | 'last_12' | 'last_24' | 'custom';
type SortMode = 'date' | 'score';
type TabId = 'performance' | 'budget' | 'pipeline' | 'reps' | 'trends';

interface CESComponents {
  dim1_icp_target: number | null;
  dim2_meeting_exec: number | null;
  dim3_pipeline_index: number | null;
  dim4_breadth: number | null;
  dim5_followup: number | null;
  dim6_net_new: number | null;
  dim7_cost_efficiency: number | null;
}

interface SalesExecComponents {
  meeting_execution: number | null;
  followup_execution: number | null;
  pipeline_influence: number | null;
  target_account: number | null;
}

interface AudienceComponents {
  icp_engagement: number | null;
  target_account_rate: number | null;
}

interface CostEffComponents {
  pipeline_per_1k: number | null;
  cost_per_company: number | null;
  cost_per_meeting: number | null;
}

interface ConferenceSummary {
  conference_id: number;
  conference_name: string;
  conference_date: string;
  conference_strategy: string | null;
  ces_score: number | null;
  ces_components: CESComponents;
  sales_execution_score: number | null;
  sales_execution_components: SalesExecComponents;
  audience_messaging_score: number | null;
  audience_components: AudienceComponents;
  cost_efficiency_score: number | null;
  cost_efficiency_components: CostEffComponents;
  pipeline_influenced: number;
  required_pipeline: number | null;
  total_spend: number | null;
  total_activities: number;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const TABS: { id: TabId; label: string }[] = [
  { id: 'performance', label: 'Performance Overview' },
  { id: 'budget', label: 'Budget & Spend' },
  { id: 'pipeline', label: 'Pipeline Attribution' },
  { id: 'reps', label: 'Rep Performance' },
  { id: 'trends', label: 'Conference Trends' },
];

// Matches DIM_COLORS order from SummaryTab.tsx
const DIM_KEYS = [
  'dim1_icp_target',
  'dim2_meeting_exec',
  'dim3_pipeline_index',
  'dim4_breadth',
  'dim7_cost_efficiency',
  'dim5_followup',
  'dim6_net_new',
] as const;

const DIM_COLORS: Record<string, string> = {
  dim1_icp_target: '#1B76BC',
  dim2_meeting_exec: '#10b981',
  dim3_pipeline_index: '#8b5cf6',
  dim4_breadth: '#0891b2',
  dim7_cost_efficiency: '#f97316',
  dim5_followup: '#d97706',
  dim6_net_new: '#14b8a6',
};

const DIM_LABELS: Record<string, string> = {
  dim1_icp_target: 'ICP & Target Quality',
  dim2_meeting_exec: 'Meeting Execution',
  dim3_pipeline_index: 'Pipeline Influence',
  dim4_breadth: 'Engagement Breadth',
  dim7_cost_efficiency: 'Cost Efficiency',
  dim5_followup: 'Follow-up Execution',
  dim6_net_new: 'Net-New Engaged',
};

const DIM_WEIGHTS: Record<string, number> = {
  dim1_icp_target: 0.20,
  dim2_meeting_exec: 0.20,
  dim3_pipeline_index: 0.30,
  dim4_breadth: 0.05,
  dim7_cost_efficiency: 0.10,
  dim5_followup: 0.10,
  dim6_net_new: 0.05,
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function getDateRange(preset: DatePreset): { startDate: string; endDate: string } {
  const now = new Date();
  const year = now.getFullYear();

  if (preset === 'this_year') {
    return { startDate: `${year}-01-01`, endDate: `${year}-12-31` };
  }
  if (preset === 'last_year') {
    return { startDate: `${year - 1}-01-01`, endDate: `${year - 1}-12-31` };
  }
  if (preset === 'last_12') {
    const d = new Date(now);
    d.setFullYear(d.getFullYear() - 1);
    return {
      startDate: d.toISOString().slice(0, 10),
      endDate: now.toISOString().slice(0, 10),
    };
  }
  if (preset === 'last_24') {
    const d = new Date(now);
    d.setFullYear(d.getFullYear() - 2);
    return {
      startDate: d.toISOString().slice(0, 10),
      endDate: now.toISOString().slice(0, 10),
    };
  }
  return { startDate: `${year}-01-01`, endDate: `${year}-12-31` };
}

function cesTierLabel(score: number): string {
  if (score >= 90) return 'Exceptional';
  if (score >= 75) return 'Strong';
  if (score >= 60) return 'Acceptable';
  if (score >= 50) return 'Weak';
  return 'Inefficient';
}

function avgNonNull(vals: (number | null)[]): number | null {
  const valid = vals.filter((v): v is number => v != null);
  return valid.length ? Math.round(valid.reduce((s, v) => s + v, 0) / valid.length) : null;
}

function cesScoreColor(score: number): string {
  if (score >= 70) return '#059669';
  if (score >= 50) return '#1B76BC';
  if (score >= 40) return '#d97706';
  if (score >= 25) return '#f97316';
  return '#dc2626';
}

function formatCurrency(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(0)}K`;
  return `$${Math.round(value).toLocaleString()}`;
}

function truncate(str: string, max: number): string {
  return str.length > max ? str.slice(0, max - 1) + '…' : str;
}

function topDimLabel(components: CESComponents): string {
  let best = '';
  let bestScore = -1;
  for (const key of DIM_KEYS) {
    const score = components[key as keyof CESComponents] ?? 0;
    if (score > bestScore) {
      bestScore = score;
      best = key;
    }
  }
  return DIM_LABELS[best] ?? 'unknown component';
}

function weakestDimLabel(components: CESComponents): string {
  let worst = '';
  let worstScore = 101;
  for (const key of DIM_KEYS) {
    const score = components[key as keyof CESComponents];
    if (score == null) continue;
    if (score < worstScore) {
      worstScore = score;
      worst = key;
    }
  }
  return DIM_LABELS[worst] ?? 'unknown component';
}

// ── Custom Tooltip ────────────────────────────────────────────────────────────

function CESTooltip({ active, payload, label }: {
  active?: boolean;
  payload?: Array<{ name: string; value: number; dataKey: string; payload: Record<string, unknown> }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;

  // Find the raw conference data from payload
  const entry = payload[0]?.payload;
  if (!entry) return null;

  const cesScore = Number(entry.ces_total ?? 0);
  const strategy = entry.strategy as string | null;
  const fullName = entry.fullName as string;

  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-lg p-3 max-w-xs text-xs">
      <p className="font-semibold text-gray-900 mb-0.5 text-sm">{fullName}</p>
      {strategy && <p className="text-gray-500 mb-2">{strategy}</p>}
      <div className="flex items-center gap-2 mb-2 pb-2 border-b border-gray-100">
        <span className="font-bold text-base" style={{ color: cesScoreColor(cesScore) }}>
          {cesScore}
        </span>
        <span className="text-gray-500">/ 100 —</span>
        <span className="font-medium" style={{ color: cesScoreColor(cesScore) }}>
          {cesTierLabel(cesScore)}
        </span>
      </div>
      <div className="space-y-1">
        {DIM_KEYS.map((key) => {
          const val = entry[key] as number | null | undefined;
          if (val == null) return null;
          return (
            <div key={key} className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-1.5 text-gray-600 min-w-0">
                <span
                  className="w-2 h-2 rounded-sm flex-shrink-0"
                  style={{ backgroundColor: DIM_COLORS[key] }}
                />
                {DIM_LABELS[key]}
              </span>
              <span className="font-medium text-gray-900 tabular-nums">{Math.round(val)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Collapsible score card ────────────────────────────────────────────────────

function ScoreCard({
  title,
  score,
  components,
}: {
  title: string;
  score: number | null;
  components: { label: string; value: number | null }[];
}) {
  const [expanded, setExpanded] = useState(false);
  const color = score != null ? cesScoreColor(score) : '#9ca3af';
  const tier = score != null ? cesTierLabel(score) : '—';

  return (
    <div
      className="rounded-xl overflow-hidden transition-all"
      style={{ backgroundColor: color + '15', borderLeft: `4px solid ${color}` }}
    >
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full text-left p-4 flex items-start justify-between gap-2"
      >
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-wide text-gray-500 mb-1">{title}</p>
          <div className="flex items-end gap-1">
            <span className="text-4xl font-bold leading-tight" style={{ color }}>
              {score ?? '—'}
            </span>
            {score != null && (
              <span className="text-sm font-normal text-gray-400 mb-0.5">/100</span>
            )}
          </div>
          <p className="text-xs font-semibold mt-0.5" style={{ color }}>{tier}</p>
        </div>
        <svg
          className="w-4 h-4 flex-shrink-0 mt-1 transition-transform text-gray-400"
          style={{ transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)' }}
          fill="none" stroke="currentColor" viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {expanded && (
        <div className="px-4 pb-4 pt-0 space-y-1.5 border-t" style={{ borderColor: color + '30' }}>
          {components.map((c) => (
            <div key={c.label} className="flex items-center justify-between text-xs">
              <span className="text-gray-500">{c.label}</span>
              <span
                className="font-semibold tabular-nums"
                style={{ color: c.value != null ? cesScoreColor(c.value) : '#9ca3af' }}
              >
                {c.value ?? '—'}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function ProgramIntelligencePage() {
  const router = useRouter();
  const capabilities = useCapabilities();

  const [activeTab, setActiveTab] = useState<TabId>('performance');
  const [preset, setPreset] = useState<DatePreset>('this_year');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [sortMode, setSortMode] = useState<SortMode>('date');
  const [loading, setLoading] = useState(true);
  const [conferences, setConferences] = useState<ConferenceSummary[]>([]);
  const [error, setError] = useState<string | null>(null);

  const { startDate, endDate } = useMemo(() => {
    if (preset === 'custom' && customStart && customEnd) {
      return { startDate: customStart, endDate: customEnd };
    }
    return getDateRange(preset);
  }, [preset, customStart, customEnd]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/program-intelligence/performance?startDate=${startDate}&endDate=${endDate}`,
        { cache: 'no-store' },
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      const data = await res.json() as { conferences: ConferenceSummary[] };
      setConferences(data.conferences ?? []);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate]);

  useEffect(() => { void fetchData(); }, [fetchData]);

  // All derived state computed before any conditional returns (rules of hooks)

  // All conferences with a valid CES (used for chart — show everything)
  const scoredConferences = useMemo(
    () => conferences.filter((c) => c.ces_score != null),
    [conferences],
  );

  // "Active" conferences: CES > 0 AND at least one activity recorded.
  // Conferences with 0 activities indicate the team didn't attend or the
  // conference is only used as a list container — exclude from summary stats.
  const activeConferences = useMemo(
    () => scoredConferences.filter((c) => (c.ces_score ?? 0) > 0 && c.total_activities > 0),
    [scoredConferences],
  );

  const sortedConferences = useMemo(() => {
    const list = [...activeConferences];
    if (sortMode === 'score') {
      list.sort((a, b) => (b.ces_score ?? 0) - (a.ces_score ?? 0));
    }
    return list;
  }, [activeConferences, sortMode]);

  const chartData = useMemo(() =>
    sortedConferences.map((c) => {
      const comps = c.ces_components;
      const available = DIM_KEYS.filter((k) => comps[k as keyof CESComponents] != null);
      const totalW = available.reduce((s, k) => s + DIM_WEIGHTS[k], 0);
      const row: Record<string, unknown> = {
        name: truncate(c.conference_name, 18),
        fullName: c.conference_name,
        strategy: c.conference_strategy,
        conference_id: c.conference_id,
        ces_total: c.ces_score ?? 0,
      };
      for (const key of DIM_KEYS) {
        const dimScore = comps[key as keyof CESComponents];
        if (dimScore == null) {
          row[key] = null;
        } else {
          const effectiveW = DIM_WEIGHTS[key] / (totalW || 1);
          row[key] = Math.round(dimScore * effectiveW * 10) / 10;
        }
      }
      return row;
    }),
  [sortedConferences]);

  // Summary card values — use activeConferences (CES > 0, activities > 0) to
  // exclude placeholder / not-attended conferences from aggregate stats.
  const avgCES = activeConferences.length
    ? Math.round(activeConferences.reduce((s, c) => s + (c.ces_score ?? 0), 0) / activeConferences.length)
    : null;

  const totalPipeline = activeConferences.reduce((s, c) => s + c.pipeline_influenced, 0);

  const topPerformer = activeConferences.length
    ? activeConferences.reduce((best, c) =>
        (c.ces_score ?? 0) > (best.ces_score ?? 0) ? c : best,
      )
    : null;

  // Interpretation panel values
  const highestConf = topPerformer;
  const lowestConf = activeConferences.length
    ? activeConferences.reduce((worst, c) =>
        (c.ces_score ?? 101) < (worst.ces_score ?? 101) ? c : worst,
      )
    : null;

  const costLaggerConf = activeConferences.find(
    (c) => (c.ces_score ?? 0) > 75 && (c.ces_components.dim7_cost_efficiency ?? 100) < 60,
  ) ?? null;

  const interpretationReady = activeConferences.length >= 2;

  // Permission gate — after all hooks
  if (!capabilities) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-6 h-6 border-2 border-brand-secondary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!capabilities.capabilities.view_effectiveness) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3 text-center px-6">
        <svg className="w-10 h-10 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
        </svg>
        <p className="text-sm text-gray-500">You don&apos;t have access to Program Intelligence.</p>
      </div>
    );
  }

  const manyConferences = sortedConferences.length > 6;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Page header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-7xl mx-auto">
          <h1 className="text-xl font-bold text-brand-primary font-serif">
            Program Intelligence{' '}
            <span className="text-sm font-normal text-gray-400">(In Active Development)</span>
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Aggregate performance across all conferences in your program
          </p>
        </div>
      </div>

      {/* Tab nav */}
      <div className="bg-white border-b border-gray-200 px-6">
        <div className="max-w-7xl mx-auto">
          <nav className="flex gap-1 -mb-px">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                  activeTab === tab.id
                    ? 'border-brand-secondary text-brand-secondary'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </div>
      </div>

      {/* Tab content */}
      <div className="max-w-7xl mx-auto px-6 py-6">
        {activeTab !== 'performance' && (
          <div className="card flex items-center justify-center h-48">
            <p className="text-sm text-gray-400">Coming soon.</p>
          </div>
        )}

        {activeTab === 'performance' && (
          <div className="space-y-6">
            {/* Date range controls */}
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex rounded-lg border border-gray-200 overflow-hidden text-sm">
                {(
                  [
                    { id: 'this_year', label: 'This Year' },
                    { id: 'last_year', label: 'Last Year' },
                    { id: 'last_12', label: 'Last 12 Mo' },
                    { id: 'last_24', label: 'Last 24 Mo' },
                    { id: 'custom', label: 'Custom' },
                  ] as { id: DatePreset; label: string }[]
                ).map((p) => (
                  <button
                    key={p.id}
                    onClick={() => setPreset(p.id)}
                    className={`px-3 py-1.5 transition-colors ${
                      preset === p.id
                        ? 'bg-brand-secondary text-white font-medium'
                        : 'bg-white text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>

              {preset === 'custom' && (
                <div className="flex items-center gap-2 text-sm">
                  <input
                    type="date"
                    value={customStart}
                    onChange={(e) => setCustomStart(e.target.value)}
                    className="input-field text-sm py-1.5"
                  />
                  <span className="text-gray-400">to</span>
                  <input
                    type="date"
                    value={customEnd}
                    onChange={(e) => setCustomEnd(e.target.value)}
                    className="input-field text-sm py-1.5"
                  />
                </div>
              )}

              {!loading && (
                <span className="text-xs text-gray-400 ml-auto">
                  {activeConferences.length} active conference{activeConferences.length !== 1 ? 's' : ''} in range
                  {conferences.length > activeConferences.length &&
                    ` · ${conferences.length} total`}
                </span>
              )}
            </div>

            {/* Loading state */}
            {loading && (
              <div className="flex items-center justify-center h-64">
                <div className="w-6 h-6 border-2 border-brand-secondary border-t-transparent rounded-full animate-spin" />
              </div>
            )}

            {/* Error state */}
            {!loading && error && (
              <div className="card text-center py-10">
                <p className="text-sm text-red-600">{error}</p>
                <button onClick={fetchData} className="btn-secondary text-sm mt-3">
                  Retry
                </button>
              </div>
            )}

            {/* Empty state */}
            {!loading && !error && activeConferences.length === 0 && (
              <div className="card flex flex-col items-center justify-center py-16 gap-4 text-center">
                <svg className="w-12 h-12 text-gray-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
                <div>
                  <p className="font-medium text-gray-700">No scored conferences in this period</p>
                  <p className="text-sm text-gray-400 mt-1">
                    Effectiveness scores appear once meetings, pipeline, and engagement data are recorded.
                  </p>
                </div>
                <button
                  onClick={() => router.push('/conferences')}
                  className="btn-secondary text-sm mt-1"
                >
                  Go to Conferences
                </button>
              </div>
            )}

            {/* Data view */}
            {!loading && !error && activeConferences.length > 0 && (
              <>
                {/* Score breakdown cards row */}
                {(() => {
                  const avgSales = avgNonNull(activeConferences.map((c) => c.sales_execution_score));
                  const avgAudience = avgNonNull(activeConferences.map((c) => c.audience_messaging_score));
                  const avgCostEff = avgNonNull(activeConferences.map((c) => c.cost_efficiency_score));
                  return (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                      <ScoreCard
                        title="Conference Effectiveness Score"
                        score={avgCES}
                        components={[
                          { label: 'ICP & Target Quality (20%)', value: avgNonNull(activeConferences.map((c) => c.ces_components.dim1_icp_target)) },
                          { label: 'Meeting Execution (20%)', value: avgNonNull(activeConferences.map((c) => c.ces_components.dim2_meeting_exec)) },
                          { label: 'Pipeline Influence (30%)', value: avgNonNull(activeConferences.map((c) => c.ces_components.dim3_pipeline_index)) },
                          { label: 'Engagement Breadth (5%)', value: avgNonNull(activeConferences.map((c) => c.ces_components.dim4_breadth)) },
                          { label: 'Cost Efficiency (10%)', value: avgNonNull(activeConferences.map((c) => c.ces_components.dim7_cost_efficiency)) },
                          { label: 'Follow-up Execution (10%)', value: avgNonNull(activeConferences.map((c) => c.ces_components.dim5_followup)) },
                        ]}
                      />
                      <ScoreCard
                        title="Sales Effectiveness Score"
                        score={avgSales}
                        components={[
                          { label: 'Meeting Execution', value: avgNonNull(activeConferences.map((c) => c.sales_execution_components.meeting_execution)) },
                          { label: 'Follow-up Execution', value: avgNonNull(activeConferences.map((c) => c.sales_execution_components.followup_execution)) },
                          { label: 'Pipeline Influence', value: avgNonNull(activeConferences.map((c) => c.sales_execution_components.pipeline_influence)) },
                          { label: 'Target Account', value: avgNonNull(activeConferences.map((c) => c.sales_execution_components.target_account)) },
                        ]}
                      />
                      <ScoreCard
                        title="Audience & Messaging Score"
                        score={avgAudience}
                        components={[
                          { label: 'ICP Engagement Rate', value: avgNonNull(activeConferences.map((c) => c.audience_components.icp_engagement)) },
                          { label: 'Target Account Rate', value: avgNonNull(activeConferences.map((c) => c.audience_components.target_account_rate)) },
                        ]}
                      />
                      <ScoreCard
                        title="Cost Efficiency Score"
                        score={avgCostEff}
                        components={[
                          { label: 'Pipeline per $1K Spend', value: avgNonNull(activeConferences.map((c) => c.cost_efficiency_components.pipeline_per_1k)) },
                          { label: 'Cost per Company', value: avgNonNull(activeConferences.map((c) => c.cost_efficiency_components.cost_per_company)) },
                          { label: 'Cost per Meeting', value: avgNonNull(activeConferences.map((c) => c.cost_efficiency_components.cost_per_meeting)) },
                        ]}
                      />
                    </div>
                  );
                })()}

                {/* Summary cards — Conferences Tracked | Pipeline (2-col) | Top Performer */}
                {(() => {
                  const totalRequired = activeConferences.reduce((s, c) => s + (c.required_pipeline ?? 0), 0);
                  const pipelinePct = totalRequired > 0 ? Math.min((totalPipeline / totalRequired) * 100, 100) : null;
                  return (
                    <div className="grid grid-cols-4 gap-4">
                      {/* Conferences Tracked */}
                      <div className="card py-4 col-span-1">
                        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">
                          Conferences Tracked
                        </p>
                        <p className="text-3xl font-bold text-brand-primary">{activeConferences.length}</p>
                        {conferences.length > activeConferences.length && (
                          <p className="text-xs text-gray-400 mt-0.5">
                            {conferences.length - activeConferences.length} without activity data
                          </p>
                        )}
                      </div>

                      {/* Total Pipeline Influenced — spans 2 cols */}
                      <div className="card py-4 col-span-2">
                        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">
                          Total Pipeline Influenced
                        </p>
                        <p className="text-3xl font-bold text-brand-primary">
                          {totalPipeline > 0 ? formatCurrency(totalPipeline) : '—'}
                        </p>
                        {activeConferences.length > 1 && totalPipeline > 0 && (
                          <p className="text-xs text-gray-400 mt-0.5">
                            {formatCurrency(totalPipeline / activeConferences.length)} avg per event
                          </p>
                        )}
                        {totalRequired > 0 && (
                          <div className="mt-3 pt-3 border-t border-gray-100">
                            <div className="flex items-center justify-between text-xs text-gray-500 mb-1.5">
                              <span>Required Pipeline</span>
                              <span className="tabular-nums font-medium">{formatCurrency(totalRequired)}</span>
                            </div>
                            <div className="w-full h-2.5 rounded-full bg-gray-100 overflow-hidden">
                              <div
                                className="h-full rounded-full transition-all"
                                style={{
                                  width: `${pipelinePct ?? 0}%`,
                                  backgroundColor: pipelinePct != null && pipelinePct >= 100 ? '#059669' : '#d97706',
                                }}
                              />
                            </div>
                            <p className="text-xs mt-1" style={{ color: pipelinePct != null && pipelinePct >= 100 ? '#059669' : '#d97706' }}>
                              {totalPipeline > 0 ? formatCurrency(totalPipeline) : '$0'}{' '}
                              <span className="font-semibold">({Math.round(pipelinePct ?? 0)}%)</span>
                            </p>
                          </div>
                        )}
                      </div>

                      {/* Top Performer */}
                      <div className="card py-4 col-span-1">
                        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">
                          Top Performer
                        </p>
                        {topPerformer ? (
                          <>
                            <p className="font-semibold text-gray-900 text-sm leading-tight line-clamp-2">
                              {topPerformer.conference_name}
                            </p>
                            <p
                              className="text-xs font-medium mt-1"
                              style={{ color: cesScoreColor(topPerformer.ces_score ?? 0) }}
                            >
                              {topPerformer.ces_score}/100 · {cesTierLabel(topPerformer.ces_score ?? 0)}
                            </p>
                          </>
                        ) : (
                          <p className="text-2xl font-bold text-gray-300">—</p>
                        )}
                      </div>
                    </div>
                  );
                })()}

                {/* Chart */}
                <div className="card">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h2 className="text-base font-semibold text-brand-primary font-serif">
                        Conference Performance Matrix
                      </h2>
                      <p className="text-xs text-gray-400 mt-0.5">
                        CES by component · bar height = composite score
                      </p>
                    </div>
                    <div className="flex rounded-lg border border-gray-200 overflow-hidden text-xs">
                      <button
                        onClick={() => setSortMode('date')}
                        className={`px-3 py-1.5 transition-colors ${
                          sortMode === 'date'
                            ? 'bg-brand-secondary text-white font-medium'
                            : 'bg-white text-gray-600 hover:bg-gray-50'
                        }`}
                      >
                        By Date
                      </button>
                      <button
                        onClick={() => setSortMode('score')}
                        className={`px-3 py-1.5 transition-colors ${
                          sortMode === 'score'
                            ? 'bg-brand-secondary text-white font-medium'
                            : 'bg-white text-gray-600 hover:bg-gray-50'
                        }`}
                      >
                        By Score
                      </button>
                    </div>
                  </div>

                  <ResponsiveContainer width="100%" height={480}>
                    <BarChart
                      data={chartData}
                      margin={{ top: 10, right: 16, left: 0, bottom: manyConferences ? 70 : 30 }}
                      onClick={(data) => {
                        if (data?.activePayload?.[0]?.payload?.conference_id) {
                          router.push(
                            `/conferences/${String(data.activePayload[0].payload.conference_id)}`,
                          );
                        }
                      }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                      <XAxis
                        dataKey="name"
                        tick={{ fontSize: 11, fill: '#6b7280' }}
                        angle={manyConferences ? -40 : 0}
                        textAnchor={manyConferences ? 'end' : 'middle'}
                        interval={0}
                        height={manyConferences ? 70 : 30}
                      />
                      <YAxis
                        domain={[0, 100]}
                        tick={{ fontSize: 11, fill: '#6b7280' }}
                        width={30}
                      />
                      <Tooltip content={<CESTooltip />} cursor={{ fill: 'rgba(0,0,0,0.04)' }} />
                      <Legend
                        wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
                        formatter={(value: string) => DIM_LABELS[value] ?? value}
                      />
                      <ReferenceLine
                        y={75}
                        stroke="#10b981"
                        strokeDasharray="4 3"
                        strokeOpacity={0.6}
                        label={{ value: 'Strong', position: 'insideTopRight', fontSize: 10, fill: '#10b981' }}
                      />
                      <ReferenceLine
                        y={60}
                        stroke="#d97706"
                        strokeDasharray="4 3"
                        strokeOpacity={0.6}
                        label={{ value: 'Acceptable', position: 'insideTopRight', fontSize: 10, fill: '#d97706' }}
                      />

                      {DIM_KEYS.map((key) => (
                        <Bar
                          key={key}
                          dataKey={key}
                          name={key}
                          stackId="ces"
                          fill={DIM_COLORS[key]}
                          radius={key === 'dim6_net_new' ? [3, 3, 0, 0] : [0, 0, 0, 0]}
                          style={{ cursor: 'pointer' }}
                        />
                      ))}
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                {/* Interpretation panel */}
                {interpretationReady ? (
                  <div className="card">
                    <h2 className="text-base font-semibold text-brand-primary font-serif mb-3">
                      What the data shows
                    </h2>
                    <div className="space-y-3">
                      {highestConf && (
                        <div className="flex gap-3">
                          <div
                            className="w-1 flex-shrink-0 rounded-full mt-0.5"
                            style={{ backgroundColor: cesScoreColor(highestConf.ces_score ?? 0) }}
                          />
                          <div>
                            <span className="text-xs font-semibold uppercase tracking-wide text-gray-400 block mb-0.5">
                              Strongest conference
                            </span>
                            <p className="text-sm text-gray-700">
                              <span className="font-semibold text-gray-900">
                                {highestConf.conference_name}
                              </span>{' '}
                              delivered the strongest performance this period (
                              <span className="font-semibold" style={{ color: cesScoreColor(highestConf.ces_score ?? 0) }}>
                                {highestConf.ces_score}/100
                              </span>
                              ), driven by{' '}
                              <span className="font-medium">{topDimLabel(highestConf.ces_components)}</span>.
                            </p>
                          </div>
                        </div>
                      )}

                      {lowestConf && lowestConf.conference_id !== highestConf?.conference_id && (
                        <div className="flex gap-3">
                          <div className="w-1 flex-shrink-0 rounded-full bg-amber-400 mt-0.5" />
                          <div>
                            <span className="text-xs font-semibold uppercase tracking-wide text-gray-400 block mb-0.5">
                              Biggest opportunity
                            </span>
                            <p className="text-sm text-gray-700">
                              <span className="font-semibold text-gray-900">
                                {lowestConf.conference_name}
                              </span>{' '}
                              scored{' '}
                              <span
                                className="font-semibold"
                                style={{ color: cesScoreColor(lowestConf.ces_score ?? 0) }}
                              >
                                {lowestConf.ces_score}/100
                              </span>{' '}
                              —{' '}
                              <span className="font-medium">
                                {weakestDimLabel(lowestConf.ces_components)}
                              </span>{' '}
                              was the primary drag on an otherwise{' '}
                              {cesTierLabel(lowestConf.ces_score ?? 0).toLowerCase()} result.
                            </p>
                          </div>
                        </div>
                      )}

                      {costLaggerConf ? (
                        <div className="flex gap-3">
                          <div className="w-1 flex-shrink-0 rounded-full bg-orange-400 mt-0.5" />
                          <div>
                            <span className="text-xs font-semibold uppercase tracking-wide text-gray-400 block mb-0.5">
                              Consistency signal
                            </span>
                            <p className="text-sm text-gray-700">
                              <span className="font-semibold text-gray-900">
                                {costLaggerConf.conference_name}
                              </span>{' '}
                              performed well overall but cost efficiency lagged — pipeline return
                              relative to spend warrants a closer look.
                            </p>
                          </div>
                        </div>
                      ) : (
                        <div className="flex gap-3">
                          <div className="w-1 flex-shrink-0 rounded-full bg-green-400 mt-0.5" />
                          <div>
                            <span className="text-xs font-semibold uppercase tracking-wide text-gray-400 block mb-0.5">
                              Consistency signal
                            </span>
                            <p className="text-sm text-gray-700">
                              No conferences show a significant gap between overall performance and
                              cost efficiency — a good sign for program ROI consistency.
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="card text-center py-6">
                    <p className="text-sm text-gray-400">
                      Insights will appear once you have effectiveness scores for at least two conferences.
                    </p>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
