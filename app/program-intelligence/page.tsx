'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
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
import { useOnboarding } from '@/lib/OnboardingContext';
import { evaluateBudgetCompleteness } from '@/lib/budgetCompleteness';
import type { BudgetCompletionStatus } from '@/lib/budgetCompleteness';
import { BudgetVsActualModal } from '@/components/BudgetVsActualModal';
import { useConfigColors } from '@/lib/useConfigColors';
import { getBadgeClass } from '@/lib/colors';
import { AssignFollowUpModal } from '@/components/AssignFollowUpModal';

// ── Types ─────────────────────────────────────────────────────────────────────

type DatePreset = 'this_year' | 'last_year' | 'last_12' | 'last_24' | 'custom';
type SortMode = 'date' | 'score';
type TabId = 'performance' | 'budget' | 'pipeline' | 'reps' | 'trends' | 'snapshots';

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


interface CalendarConferenceRow {
  conferenceId: number;
  conferenceName: string;
  conferenceYear: number;
  conferenceType: 'historical' | 'active';
  attendeeCount: number;
  totalCompanies: number;
  icpCompanies: number;
  icpDensityPct: number;
  calendarRecommendationScore: number | null;
  componentScores?: {
    audienceFit: number | null;
    targetOpportunity: number | null;
    engagementCapture: number | null;
    commercialPotential: number | null;
    costJustification: number | null;
    strategicValue: number | null;
  };
  confidenceMultiplier?: number;
  availableComponentCount?: number;
  totalComponentCount?: number;
  maxPossibleScore?: number;
  recommendationTier: string;
  confidenceLevel: 'high' | 'medium' | 'low';
  dataAge: number;
  recommendationReason?: string[];
  confidenceFactors?: string[];
  tierProbabilityFactors?: { must: number; high: number; worth: number };
  targetingScored?: boolean;
  diagnostics?: {
    targetingEngine?: {
      mustTargetCount: number;
      highPriorityCount: number;
      worthEngagingCount: number;
      monitorCount: number;
      lowPriorityCount: number;
      needsTitleReviewCount: number;
      totalScoredCompanies: number;
      avgTargetPriorityScore: number;
      avgBuyerAccessScore: number;
      avgRelationshipLeverageScore: number;
      actionableCount: number;
      isLargeConference: boolean;
    } | null;
    engagementMeetings?: { total_meetings?: number } | null;
    engagementFollowUps?: { total_followups?: number; completed_followups?: number } | null;
    budget?: { line_items?: unknown; return_on_cost?: string | null; required_pipeline_amount?: number; required_pipeline_multiple?: number } | null;
    commercialPotential?: { projected_pipeline?: number; must_wse?: number; high_wse?: number; worth_wse?: number; avg_cost_per_unit?: number } | null;
  };
}

interface RepConferenceScore {
  sesScore: number | null;
  cesScore: number | null;
  costEffScore: number | null;
  approxPipeline: number;
  pipelineGoalShare: number;
  components: {
    meeting_execution: number | null;
    followup_execution: number | null;
    pipeline_influence: number | null;
    target_account_execution: number | null;
    rep_productivity: number | null;
  };
  ces_components: {
    meeting_execution: number | null;
    engagement_breadth: number | null;
    followup_execution: number | null;
  };
  cost_components: {
    cpm_score: number | null;
    cpc_score: number | null;
  };
}

interface RepRow {
  repId: string;
  repName: string;
  role: string | null;
  conferences: Record<number, RepConferenceScore>;
}

interface RepPerfConference {
  id: number;
  name: string;
  date: string;
}

interface RepPerfData {
  conferences: RepPerfConference[];
  reps: RepRow[];
  priorAvg: Record<string, number>;
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

// ── Conference Trends types ────────────────────────────────────────────────────

interface SaturationConferenceEntry {
  conference_id: number;
  conference_name: string;
  start_date: string;
  season_id: string | null;
  snapshot_date: string;
  saturation_score: number;
  contacts_ever_touched: number;
  contacts_touched_this_conf: number;
  contacts_net_new: number;
  contacts_returning: number;
  contacts_droppable: number;
  contacts_high_health: number;
  contacts_mid_health: number;
  contacts_low_health: number;
  companies_ever_touched: number;
  companies_net_new: number;
  companies_returning: number;
  meetings_held: number;
  meetings_with_outcome: number;
  new_contact_rate: number;
  droppable_rate: number;
}

interface SaturationSeriesGroup {
  series_id: string;
  series_name: string;
  conferences: SaturationConferenceEntry[];
}

interface SaturationPortfolioData {
  seriesGroups: SaturationSeriesGroup[];
  avg_saturation_score: number;
  high_saturation_count: number;
}

interface SaturationDetail {
  conference_id: number;
  conference_name: string;
  start_date: string;
  series_name: string;
  series_id: string;
  snapshot_date: string;
  saturation_score: number;
  contacts_ever_touched: number;
  contacts_touched_this_conf: number;
  contacts_net_new: number;
  contacts_returning: number;
  contacts_droppable: number;
  contacts_high_health: number;
  contacts_mid_health: number;
  contacts_low_health: number;
  companies_ever_touched: number;
  companies_net_new: number;
  companies_returning: number;
  meetings_held: number;
  meetings_with_outcome: number;
  new_contact_rate: number;
  droppable_rate: number;
  droppable_contacts: {
    attendee_id: number;
    first_name: string;
    last_name: string;
    title: string;
    company_name: string;
    health_score: number;
    interaction_count: number;
    cumulative_meetings: number;
    last_meeting_outcome: string | null;
  }[];
}

interface TrendsConferenceItem {
  id: number;
  name: string;
  start_date: string;
  total_attendees: number;
  total_companies: number;
  icp_companies: number;
  icp_density_pct: number;
}

interface TrendsPortfolioData {
  conferences: TrendsConferenceItem[];
  avgIcpDensity: number;
  totalConferences: number;
  primaryCompanyType: string | null;
  companyOverlap: { id: number; name: string; icp: string; conf_count: number }[];
  seniorityMix: { seniority: string; count: number }[];
}

interface TrendsConferenceData {
  totalAttendees: number;
  totalCompanies: number;
  icpCompanies: number;
  icpDensityPct: number;
  meetingsTotal: number;
  seniorityBreakdown: { seniority: string; count: number }[];
  titleKeywords: { word: string; count: number }[];
  primaryCompanyType: string | null;
  crossConfPresence: { id: number; name: string; icp: string; company_type: string | null; total_confs: number; conference_names: string[] }[];
}

// ── Constants ─────────────────────────────────────────────────────────────────

const TABS: { id: TabId; label: string }[] = [
  { id: 'performance', label: 'Performance Overview' },
  { id: 'budget', label: 'Budget & Spend' },
  { id: 'pipeline', label: 'Pipeline Attribution' },
  { id: 'reps', label: 'Rep Performance' },
  { id: 'trends', label: 'Conference Trends' },
  { id: 'snapshots', label: 'Series Snapshots' },
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
  dim4_breadth: 'Audience Coverage',
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

function cesTierShort(score: number): string {
  if (score >= 90) return 'Excl.';
  if (score >= 75) return 'Strong';
  if (score >= 60) return 'Accept.';
  if (score >= 50) return 'Weak';
  return 'Ineff.';
}

function formatCurrencyFull(value: number): string {
  return '$' + Math.round(value).toLocaleString();
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



function calendarScoreColor(score: number | null): string {
  if (score == null) return '#9ca3af';
  if (score >= 85) return '#059669';
  if (score >= 70) return '#0d9488';
  if (score >= 55) return '#d97706';
  if (score >= 40) return '#f97316';
  return '#dc2626';
}

const CALENDAR_TIER_INFO: Record<string, { label: string; classes: string }> = {
  attend_invest_more:      { label: 'Attend & Invest',         classes: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  attend_maintain:         { label: 'Attend & Maintain',       classes: 'bg-emerald-50 text-emerald-600 border-emerald-100' },
  attend_reconsider_format:{ label: 'Reconsider Format',       classes: 'bg-amber-50 text-amber-700 border-amber-200' },
  evaluate_before_committing:{ label: 'Evaluate First',        classes: 'bg-amber-50 text-amber-700 border-amber-200' },
  remove_from_calendar:    { label: 'Remove from Calendar',    classes: 'bg-red-50 text-red-700 border-red-200' },
  do_not_prioritize:       { label: 'Do Not Prioritize',       classes: 'bg-red-50 text-red-600 border-red-100' },
};

function calendarTierInfo(tier: string): { label: string; classes: string } {
  return CALENDAR_TIER_INFO[tier] ?? { label: tierLabel(tier), classes: 'bg-gray-50 text-gray-600 border-gray-200' };
}

function confidencePillClasses(level: string): string {
  if (level === 'high') return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  if (level === 'medium') return 'bg-amber-50 text-amber-700 border-amber-200';
  return 'bg-red-50 text-red-700 border-red-200';
}

function formatDataAge(dataAge: number): string {
  if (dataAge < 1) return '< 1 year';
  const years = Math.round(dataAge);
  return years === 1 ? '1 year' : `${years} years`;
}

function dataAgeColorClass(dataAge: number): string {
  if (dataAge > 4) return 'text-red-600';
  if (dataAge > 2) return 'text-amber-600';
  return '';
}

function icpDensityPillClasses(pct: number): string {
  if (pct >= 30) return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  if (pct >= 15) return 'bg-amber-50 text-amber-700 border-amber-200';
  return 'bg-red-50 text-red-700 border-red-200';
}

function tierLabel(tier: string): string {
  return tier.replaceAll('_', ' ').replace(/\b\w/g, (m) => m.toUpperCase());
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

// ── Rep Performance helpers ───────────────────────────────────────────────────

function sesScoreColor(score: number | null): string {
  if (score == null) return '#9ca3af';
  if (score >= 90) return '#059669';
  if (score >= 75) return '#10b981';
  if (score >= 60) return '#374151';
  if (score >= 50) return '#d97706';
  return '#dc2626';
}

function sesCellClasses(score: number | null): string {
  if (score == null) return 'bg-gray-50 text-gray-400';
  if (score >= 90) return 'bg-emerald-100 text-emerald-700';
  if (score >= 75) return 'bg-emerald-50 text-emerald-700';
  if (score >= 60) return 'bg-white text-gray-700';
  if (score >= 50) return 'bg-amber-50 text-amber-700';
  return 'bg-red-50 text-red-700';
}

function sesTierLabel(score: number | null): string {
  if (score == null) return '—';
  if (score >= 90) return 'Exceptional';
  if (score >= 75) return 'Strong';
  if (score >= 60) return 'Acceptable';
  if (score >= 50) return 'Needs Work';
  return 'Weak';
}

function stddev(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  return Math.sqrt(values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length);
}

function getLowestComponent(comps: RepConferenceScore['components']): { key: string; label: string; score: number } {
  const map: [string, string, number | null][] = [
    ['meeting_execution', 'Meeting Execution', comps.meeting_execution],
    ['followup_execution', 'Follow-up Execution', comps.followup_execution],
    ['pipeline_influence', 'Pipeline Influence', comps.pipeline_influence],
    ['target_account_execution', 'Target Account Execution', comps.target_account_execution],
    ['rep_productivity', 'Rep Productivity', comps.rep_productivity],
  ];
  const available = map.filter(([, , v]) => v != null) as [string, string, number][];
  if (!available.length) return { key: '', label: '—', score: 0 };
  return available.sort((a, b) => a[2] - b[2]).map(([key, label, score]) => ({ key, label, score }))[0];
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

// ── Custom chart legend (2-per-row on portrait) ───────────────────────────────

function ChartLegend({ payload, isPortrait }: {
  payload?: Array<{ value: string; color: string }>;
  isPortrait: boolean;
}) {
  if (!payload?.length) return null;
  return (
    <div className={`mt-2 ${isPortrait ? 'grid grid-cols-2 gap-x-3 gap-y-1' : 'flex flex-wrap justify-center gap-x-4 gap-y-1'}`}>
      {payload.map((entry) => (
        <span key={entry.value} className="flex items-center gap-1 text-[11px] text-gray-600 min-w-0">
          <span className="w-2 h-2 rounded-sm flex-shrink-0" style={{ backgroundColor: entry.color }} />
          <span className="truncate">{DIM_LABELS[entry.value] ?? entry.value}</span>
        </span>
      ))}
    </div>
  );
}

// ── Collapsible score card ────────────────────────────────────────────────────

function ScoreCard({
  title,
  score,
  components,
  showTier = false,
}: {
  title: string;
  score: number | null;
  components: { label: string; value: number | null }[];
  showTier?: boolean;
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
        <div className="px-4 pb-4 pt-3 space-y-1.5 border-t" style={{ borderColor: color + '30' }}>
          {components.map((c) => {
            const compColor = c.value != null ? cesScoreColor(c.value) : '#9ca3af';
            return (
              <div key={c.label} className="grid text-xs" style={{ gridTemplateColumns: 'minmax(0,1fr) 6rem' }}>
                <span className="text-gray-500 min-w-0 truncate">{c.label}</span>
                <span className="flex items-center gap-1.5 flex-shrink-0 font-semibold tabular-nums" style={{ color: compColor }}>
                  {c.value ?? '—'}
                  {showTier && c.value != null && (
                    <span className="font-normal text-[10px]" style={{ color: compColor }}>
                      · {cesTierShort(c.value)}
                    </span>
                  )}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Calendar Intelligence module-level store ──────────────────────────────────
// Survives component unmount/remount so scoring continues during navigation.
// Pattern matches TargetRecommendationsTab compilationStore.

type CalendarScoringStatus = 'idle' | 'loading_basic' | 'scoring' | 'ready';

type CalendarStore = {
  status: CalendarScoringStatus;
  rows: CalendarConferenceRow[];
  scoringProgress: { completed: number; total: number } | null;
};

let _calendarStore: CalendarStore = { status: 'idle', rows: [], scoringProgress: null };
const _calendarListeners = new Set<() => void>();

function getCalendarStore(): CalendarStore { return _calendarStore; }

function setCalendarStore(update: Partial<CalendarStore>) {
  _calendarStore = { ..._calendarStore, ...update };
  _calendarListeners.forEach(l => l());
}

function subscribeCalendarStore(listener: () => void): () => void {
  _calendarListeners.add(listener);
  return () => _calendarListeners.delete(listener);
}

let _calendarScoringPromise: Promise<void> | null = null;

function startCalendarScoring(force = false) {
  const status = _calendarStore.status;
  if (!force && (status === 'loading_basic' || status === 'scoring' || status === 'ready')) return;
  if (_calendarScoringPromise && !force) return;

  _calendarScoringPromise = (async () => {
    setCalendarStore({ status: 'loading_basic', rows: [], scoringProgress: null });
    try {
      const res = await fetch('/api/program-intelligence/calendar-intelligence', { cache: 'no-store' });
      if (!res.ok) { setCalendarStore({ status: 'idle' }); return; }
      const data = await res.json() as { conferences: CalendarConferenceRow[] };
      const basicRows = data.conferences ?? [];
      setCalendarStore({ rows: basicRows });
      if (basicRows.length === 0) { setCalendarStore({ status: 'ready' }); return; }

      setCalendarStore({ status: 'scoring', scoringProgress: { completed: 0, total: basicRows.length } });
      let completed = 0;
      for (const row of basicRows) {
        try {
          const r = await fetch(
            `/api/program-intelligence/calendar-intelligence/${row.conferenceId}`,
            { cache: 'no-store' },
          );
          if (r.ok) {
            const scored = ((await r.json()) as { conference: CalendarConferenceRow }).conference;
            setCalendarStore({ rows: _calendarStore.rows.map(x => x.conferenceId === scored.conferenceId ? scored : x) });
          }
        } catch { /* skip this conference, keep going */ }
        completed++;
        setCalendarStore({ scoringProgress: { completed, total: basicRows.length } });
      }
      setCalendarStore({ status: 'ready', scoringProgress: null });
    } catch {
      setCalendarStore({ status: 'idle' });
    }
  })().finally(() => { _calendarScoringPromise = null; });
}

async function refreshConferenceScore(conferenceId: number) {
  try {
    const r = await fetch(`/api/program-intelligence/calendar-intelligence/${conferenceId}`, { cache: 'no-store' });
    if (r.ok) {
      const scored = ((await r.json()) as { conference: CalendarConferenceRow }).conference;
      setCalendarStore({ rows: _calendarStore.rows.map(x => x.conferenceId === scored.conferenceId ? scored : x) });
    }
  } catch { /* non-fatal */ }
}

// ── Budget Status Cell ────────────────────────────────────────────────────────

function BudgetStatusCell({ row, onOpenModal }: { row: CalendarConferenceRow; onOpenModal: () => void }) {
  const [open, setOpen] = useState(false);
  const pillRef = React.useRef<HTMLButtonElement>(null);
  const panelRef = React.useRef<HTMLDivElement>(null);
  const [panelPos, setPanelPos] = useState<{ top: number; left: number; above: boolean } | null>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (pillRef.current?.contains(e.target as Node)) return;
      if (panelRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    }
    function handleEsc(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleEsc);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleEsc);
    };
  }, [open]);

  if (row.conferenceType === 'historical') {
    return <span className="text-gray-300 text-xs">—</span>;
  }

  const bud = row.diagnostics?.budget;
  const status: BudgetCompletionStatus = evaluateBudgetCompleteness({
    lineItems: bud?.line_items as Array<{ budget?: string | number | null; actual?: string | number | null }> | null,
    returnOnCost: bud?.return_on_cost,
    requiredPipelineAmount: bud?.required_pipeline_amount,
  });

  if (status.status === 'complete') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-800 border border-green-200">
        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7"/>
        </svg>
        Complete
      </span>
    );
  }

  const isPartial = status.status === 'partial';
  const pillCls = isPartial
    ? 'bg-amber-100 text-amber-800 border-amber-200 hover:bg-amber-200'
    : 'bg-red-100 text-red-800 border-red-200 hover:bg-red-200';

  function handleToggle() {
    if (!open && pillRef.current) {
      const rect = pillRef.current.getBoundingClientRect();
      const panelW = 280;
      const left = Math.max(8, Math.min(rect.left, window.innerWidth - panelW - 8));
      const above = rect.top > 300;
      setPanelPos({ top: above ? rect.top - 8 : rect.bottom + 8, left, above });
    }
    setOpen(v => !v);
  }

  return (
    <div className="relative inline-block">
      <button
        ref={pillRef}
        type="button"
        onClick={handleToggle}
        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold border transition-colors ${pillCls}`}
      >
        <svg className="w-3 h-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86l-8.58 14.86A1 1 0 0 0 3.58 20h16.84a1 1 0 0 0 .87-1.5L13.71 3.86a1 1 0 0 0-1.42 0z"/>
        </svg>
        {isPartial ? 'Partial' : 'No Budget'}
      </button>
      {open && panelPos && (
        <div
          ref={panelRef}
          style={{
            position: 'fixed',
            top: panelPos.above ? panelPos.top : panelPos.top,
            left: panelPos.left,
            width: 280,
            zIndex: 10000,
            transform: panelPos.above ? 'translateY(-100%)' : 'translateY(0)',
          }}
          className="bg-white border border-gray-200 rounded-xl shadow-xl p-4 text-left"
        >
          <p className="text-sm font-semibold text-gray-900 mb-1">
            {isPartial ? 'Budget data incomplete' : 'No budget data entered'}
          </p>
          {isPartial ? (
            <p className="text-xs text-gray-500 mb-3">Missing budget fields are limiting the accuracy of your Cost Justification and Commercial Potential scores.</p>
          ) : (
            <p className="text-xs text-gray-500 mb-3">Without budget data, Parlay cannot calculate Cost Justification or Commercial Potential scores. These two components represent 30% of the Calendar Recommendation Score — missing this data significantly reduces accuracy and lowers the maximum possible score. Current maximum possible score: <strong>70/100</strong>. With complete budget data, maximum possible score: <strong>100/100</strong>.</p>
          )}
          <div className="space-y-1 mb-3">
            {status.missingFields.map(f => (
              <div key={f} className="flex items-center gap-1.5 text-xs text-red-600">
                <svg className="w-3 h-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12"/>
                </svg>
                {f}
              </div>
            ))}
            {status.presentFields.map(f => (
              <div key={f} className="flex items-center gap-1.5 text-xs text-green-600">
                <svg className="w-3 h-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7"/>
                </svg>
                {f}
              </div>
            ))}
          </div>
          {isPartial ? (
            <button
              type="button"
              onClick={() => { setOpen(false); onOpenModal(); }}
              className="text-xs text-brand-secondary hover:underline font-medium"
            >
              Add budget data →
            </button>
          ) : (
            <button
              type="button"
              onClick={() => { setOpen(false); onOpenModal(); }}
              className="btn-primary text-xs w-full"
            >
              Add Budget Data
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function ProgramIntelligencePage() {
  const router = useRouter();
  const capabilities = useCapabilities();
  const { onboardingTrack, onboardingProgress, markStepComplete } = useOnboarding();
  const configColors = useConfigColors();

  const [activeTab, setActiveTab] = useState<TabId>('performance');
  const [preset, setPreset] = useState<DatePreset>('this_year');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [sortMode, setSortMode] = useState<SortMode>('date');
  const [loading, setLoading] = useState(true);
  const [conferences, setConferences] = useState<ConferenceSummary[]>([]);
  const [calendarState, setCalendarStateLocal] = useState<CalendarStore>(getCalendarStore);
  const [error, setError] = useState<string | null>(null);
  const [calendarSort, setCalendarSort] = useState<keyof CalendarConferenceRow | 'score'>('score');
  const [calendarRecommendationFilter, setCalendarRecommendationFilter] = useState('all');
  const [calendarTypeFilter, setCalendarTypeFilter] = useState<'all'|'historical'|'active'>('all');
  const [calendarConfidenceFilter, setCalendarConfidenceFilter] = useState<'all'|'high'|'medium'|'low'>('all');
  const [calendarBudgetFilter, setCalendarBudgetFilter] = useState<'all'|'complete'|'partial'|'missing'|'needs_attention'>('all');
  const [calendarFiltersOpen, setCalendarFiltersOpen] = useState(false);
  const [budgetModalConf, setBudgetModalConf] = useState<{ id: number; name: string } | null>(null);
  const [selectedCalendarRow, setSelectedCalendarRow] = useState<CalendarConferenceRow | null>(null);
  const [isPortrait, setIsPortrait] = useState(true);

  // Rep Performance state
  const [repData, setRepData] = useState<RepPerfData | null>(null);
  const [repLoading, setRepLoading] = useState(false);
  const [repError, setRepError] = useState<string | null>(null);
  const [repMinConferences, setRepMinConferences] = useState(0);
  const [repTierFilter, setRepTierFilter] = useState('all');
  const [repSort, setRepSort] = useState('avg_desc');
  const [showComponents, setShowComponents] = useState(false);
  const [selectedRep, setSelectedRep] = useState<RepRow | null>(null);
  const [repPage, setRepPage] = useState(1);
  const [repScoreView, setRepScoreView] = useState<'ses' | 'ces' | 'cost'>('ses');
  const [drawerScoreView, setDrawerScoreView] = useState<'ses' | 'ces' | 'cost'>('ses');
  const REP_PAGE_SIZE = 30;

  // Conference Trends state
  const [trendsData, setTrendsData] = useState<TrendsPortfolioData | null>(null);
  const [trendsLoading, setTrendsLoading] = useState(false);
  const [trendsConfId, setTrendsConfId] = useState<number | null>(null);
  const [trendsConfData, setTrendsConfData] = useState<TrendsConferenceData | null>(null);
  const [trendsConfLoading, setTrendsConfLoading] = useState(false);
  const [trendsTableFilter, setTrendsTableFilter] = useState<'icp' | 'primary' | 'other' | 'all'>('icp');
  const [trendsDrawerCompanyId, setTrendsDrawerCompanyId] = useState<number | null>(null);
  const [trendsDrawerCompanyName, setTrendsDrawerCompanyName] = useState('');
  const [trendsPopoverId, setTrendsPopoverId] = useState<number | null>(null);
  const [trendsPopoverPos, setTrendsPopoverPos] = useState<{ top: number; right: number } | null>(null);

  // Saturation state
  const [satData, setSatData] = useState<SaturationPortfolioData | null>(null);
  const [satLoading, setSatLoading] = useState(false);
  const [satDetailId, setSatDetailId] = useState<number | null>(null);
  const [satDetail, setSatDetail] = useState<SaturationDetail | null>(null);
  const [satDetailLoading, setSatDetailLoading] = useState(false);
  const [satFollowUpAttendeeId, setSatFollowUpAttendeeId] = useState<number | null>(null);

  // Series Snapshots tab state
  const isAdmin = capabilities.role === 'administrator';
  const [snapshotSeries, setSnapshotSeries] = useState<Array<{ id: string; display_name: string }>>([]);
  const [snapshotSeriesLoading, setSnapshotSeriesLoading] = useState(false);
  const [selectedSeriesId, setSelectedSeriesId] = useState('');
  const [snapshotYoY, setSnapshotYoY] = useState<import('@/lib/get-series-yoy-data').SeriesYoYData | null>(null);
  const [snapshotYoYLoading, setSnapshotYoYLoading] = useState(false);
  const [computing, setComputing] = useState<number | null>(null);
  const [computingAll, setComputingAll] = useState(false);
  const [computeProgress, setComputeProgress] = useState({ done: 0, total: 0 });
  const [snapshotOverrides, setSnapshotOverrides] = useState<Record<number, { hasSnapshot: boolean; snapshotTakenAt: string | null; completenessPercent: number; justComputed?: boolean }>>({});
  const [snapshotErrors, setSnapshotErrors] = useState<Record<number, string>>({});
  const [batchSummary, setBatchSummary] = useState<{ done: number; failed: number } | null>(null);

  useEffect(() => {
    const mql = window.matchMedia('(orientation: portrait)');
    setIsPortrait(mql.matches);
    const handler = (e: MediaQueryListEvent) => setIsPortrait(e.matches);
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, []);

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

  // Subscribe to the module-level calendar store — survives navigation
  useEffect(() => {
    setCalendarStateLocal(getCalendarStore());
    return subscribeCalendarStore(() => setCalendarStateLocal(getCalendarStore()));
  }, []);

  // Trigger scoring when the calendar tab is first opened
  useEffect(() => {
    if ((activeTab as string) === 'calendar' && _calendarStore.status === 'idle') {
      startCalendarScoring();
    }
  }, [activeTab]);

  useEffect(() => { void fetchData(); }, [fetchData]);

  // Rep Performance data fetch
  useEffect(() => {
    if (activeTab !== 'reps') return;
    let cancelled = false;
    setRepLoading(true);
    setRepError(null);
    fetch(`/api/program-intelligence/rep-performance?startDate=${startDate}&endDate=${endDate}`, { cache: 'no-store' })
      .then(r => r.ok ? r.json() : r.json().then((b: { error?: string }) => { throw new Error(b.error ?? `HTTP ${r.status}`); }))
      .then((data: RepPerfData) => { if (!cancelled) { setRepData(data); setRepPage(1); } })
      .catch(e => { if (!cancelled) setRepError(String(e)); })
      .finally(() => { if (!cancelled) setRepLoading(false); });
    return () => { cancelled = true; };
  }, [activeTab, startDate, endDate]);

  // Close trends popover on outside click
  useEffect(() => {
    if (trendsPopoverId === null) return;
    const close = () => { setTrendsPopoverId(null); setTrendsPopoverPos(null); };
    const id = window.setTimeout(() => document.addEventListener('click', close), 0);
    return () => { window.clearTimeout(id); document.removeEventListener('click', close); };
  }, [trendsPopoverId]);

  // Close trends popover on Escape
  useEffect(() => {
    if (trendsPopoverId === null) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') { setTrendsPopoverId(null); setTrendsPopoverPos(null); } };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [trendsPopoverId]);

  // Conference Trends fetch
  useEffect(() => {
    if (activeTab !== 'trends') return;
    if (trendsData) return; // already loaded
    setTrendsLoading(true);
    fetch('/api/program-intelligence/trends', { cache: 'no-store' })
      .then(r => r.ok ? r.json() : Promise.reject(r))
      .then((data: TrendsPortfolioData) => {
        setTrendsData(data);
        if (data.conferences.length > 0) setTrendsConfId(data.conferences[0].id);
      })
      .catch(() => {})
      .finally(() => setTrendsLoading(false));
  }, [activeTab, trendsData]);

  // Per-conference drill-down fetch
  useEffect(() => {
    if (!trendsConfId) return;
    setTrendsConfLoading(true);
    setTrendsConfData(null);
    fetch(`/api/program-intelligence/trends/${trendsConfId}`, { cache: 'no-store' })
      .then(r => r.ok ? r.json() : Promise.reject(r))
      .then((data: TrendsConferenceData) => setTrendsConfData(data))
      .catch(() => {})
      .finally(() => setTrendsConfLoading(false));
  }, [trendsConfId]);

  // Saturation portfolio fetch
  useEffect(() => {
    if (activeTab !== 'trends') return;
    if (satData) return;
    setSatLoading(true);
    fetch('/api/program-intelligence/saturation', { cache: 'no-store' })
      .then(r => r.ok ? r.json() : Promise.reject(r))
      .then((data: SaturationPortfolioData) => setSatData(data))
      .catch(() => {})
      .finally(() => setSatLoading(false));
  }, [activeTab, satData]);

  // Saturation detail fetch (droppable contacts)
  useEffect(() => {
    if (!satDetailId) { setSatDetail(null); return; }
    setSatDetailLoading(true);
    setSatDetail(null);
    fetch(`/api/program-intelligence/saturation/${satDetailId}`, { cache: 'no-store' })
      .then(r => r.ok ? r.json() : Promise.reject(r))
      .then((data: SaturationDetail) => setSatDetail(data))
      .catch(() => {})
      .finally(() => setSatDetailLoading(false));
  }, [satDetailId]);

  // Track B onboarding: mark step complete when user visits calendar or performance tabs
  useEffect(() => {
    if (onboardingTrack !== 'track_b' || !onboardingProgress) return;
    if ((activeTab as string) === 'calendar' && !onboardingProgress.completed_steps.includes('calendar_intel_visited')) {
      markStepComplete('calendar_intel_visited');
    }
    if ((activeTab === 'performance' || activeTab === 'budget' || activeTab === 'pipeline') &&
        !onboardingProgress.completed_steps.includes('performance_visited')) {
      markStepComplete('performance_visited');
    }
  }, [activeTab, onboardingTrack, onboardingProgress, markStepComplete]);

  // Load series list when snapshots tab is opened
  useEffect(() => {
    if (activeTab !== 'snapshots' || !isAdmin) return;
    if (snapshotSeries.length > 0) return;
    setSnapshotSeriesLoading(true);
    fetch('/api/conference-series')
      .then(r => r.json() as Promise<Array<{ id: string; display_name: string }>>)
      .then(data => setSnapshotSeries(Array.isArray(data) ? data : []))
      .catch(() => {})
      .finally(() => setSnapshotSeriesLoading(false));
  }, [activeTab, isAdmin, snapshotSeries.length]);

  // Load YoY data when series is selected
  useEffect(() => {
    if (!selectedSeriesId) { setSnapshotYoY(null); return; }
    setSnapshotYoYLoading(true);
    setSnapshotOverrides({});
    setSnapshotErrors({});
    setBatchSummary(null);
    fetch(`/api/conferences/series/${selectedSeriesId}/yoy`)
      .then(r => r.json() as Promise<import('@/lib/get-series-yoy-data').SeriesYoYData>)
      .then(data => setSnapshotYoY(data))
      .catch(() => {})
      .finally(() => setSnapshotYoYLoading(false));
  }, [selectedSeriesId]);

  // All derived state computed before any conditional returns (rules of hooks)

  // Derived from module-level store — template uses these names unchanged
  const calendarRows = calendarState.rows;
  const calendarLoading = calendarState.status === 'loading_basic';
  const calendarScoringProgress = calendarState.scoringProgress;

  // Keep open drawer in sync when its conference gets scored
  useEffect(() => {
    if (!selectedCalendarRow) return;
    const updated = calendarRows.find(r => r.conferenceId === selectedCalendarRow.conferenceId);
    if (updated && updated !== selectedCalendarRow) setSelectedCalendarRow(updated);
  }, [calendarRows, selectedCalendarRow]);

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


  const calendarRowsFiltered = useMemo(() => {
    let rows = [...calendarRows];
    if (calendarRecommendationFilter !== 'all') {
      const m: Record<string, string[]> = {
        attend_invest: ['attend_invest_more'],
        attend_maintain: ['attend_maintain'],
        reconsider: ['attend_reconsider_format'],
        evaluate: ['evaluate_before_committing'],
        cut_avoid: ['remove_from_calendar', 'do_not_prioritize'],
      };
      rows = rows.filter(r => m[calendarRecommendationFilter]?.includes(r.recommendationTier));
    }
    if (calendarTypeFilter !== 'all') rows = rows.filter(r => r.conferenceType === calendarTypeFilter);
    if (calendarConfidenceFilter !== 'all') rows = rows.filter(r => r.confidenceLevel === calendarConfidenceFilter);
    if (calendarBudgetFilter !== 'all') {
      rows = rows.filter(r => {
        if (r.conferenceType === 'historical') return false;
        const bud = r.diagnostics?.budget;
        const s = evaluateBudgetCompleteness({
          lineItems: bud?.line_items as Array<{ budget?: string | number | null; actual?: string | number | null }> | null,
          returnOnCost: bud?.return_on_cost,
          requiredPipelineAmount: bud?.required_pipeline_amount,
        });
        if (calendarBudgetFilter === 'needs_attention') return s.status === 'partial' || s.status === 'missing';
        return s.status === calendarBudgetFilter;
      });
    }
    rows.sort((a, b) => {
      if (calendarSort === 'score') return (b.calendarRecommendationScore ?? -1) - (a.calendarRecommendationScore ?? -1);
      const av = a[calendarSort as keyof CalendarConferenceRow] as unknown;
      const bv = b[calendarSort as keyof CalendarConferenceRow] as unknown;
      if (typeof av === 'number' && typeof bv === 'number') return bv - av;
      return String(av ?? '').localeCompare(String(bv ?? ''));
    });
    return rows;
  }, [calendarRows, calendarRecommendationFilter, calendarTypeFilter, calendarConfidenceFilter, calendarBudgetFilter, calendarSort]);

  // Rep Performance derived data
  const repDerivedData = useMemo(() => {
    if (!repData) return null;
    const { conferences, reps, priorAvg } = repData;

    const withStats = reps.map(rep => {
      const scores = Object.values(rep.conferences).map(c => c.sesScore).filter((s): s is number => s != null);
      const confCount = Object.keys(rep.conferences).length;
      const avgSES = scores.length ? Math.round(scores.reduce((s, v) => s + v, 0) / scores.length) : null;
      const sd = stddev(scores);
      const minScore = scores.length ? Math.min(...scores) : null;
      const maxScore = scores.length ? Math.max(...scores) : null;
      const avgCompSum = {
        meeting_execution: [] as number[],
        followup_execution: [] as number[],
        pipeline_influence: [] as number[],
        target_account_execution: [] as number[],
        rep_productivity: [] as number[],
      };
      const avgCESCompSum = {
        meeting_execution: [] as number[],
        engagement_breadth: [] as number[],
        followup_execution: [] as number[],
      };
      const avgCostCompSum = {
        cpm_score: [] as number[],
        cpc_score: [] as number[],
      };
      let totalApproxPipeline = 0;
      let totalPipelineGoal = 0;
      for (const c of Object.values(rep.conferences)) {
        if (c.components.meeting_execution != null) avgCompSum.meeting_execution.push(c.components.meeting_execution);
        if (c.components.followup_execution != null) avgCompSum.followup_execution.push(c.components.followup_execution);
        if (c.components.pipeline_influence != null) avgCompSum.pipeline_influence.push(c.components.pipeline_influence);
        if (c.components.target_account_execution != null) avgCompSum.target_account_execution.push(c.components.target_account_execution);
        if (c.components.rep_productivity != null) avgCompSum.rep_productivity.push(c.components.rep_productivity);
        if (c.ces_components.meeting_execution != null) avgCESCompSum.meeting_execution.push(c.ces_components.meeting_execution);
        if (c.ces_components.engagement_breadth != null) avgCESCompSum.engagement_breadth.push(c.ces_components.engagement_breadth);
        if (c.ces_components.followup_execution != null) avgCESCompSum.followup_execution.push(c.ces_components.followup_execution);
        if (c.cost_components.cpm_score != null) avgCostCompSum.cpm_score.push(c.cost_components.cpm_score);
        if (c.cost_components.cpc_score != null) avgCostCompSum.cpc_score.push(c.cost_components.cpc_score);
        totalApproxPipeline += c.approxPipeline ?? 0;
        totalPipelineGoal += c.pipelineGoalShare ?? 0;
      }
      const avg = (arr: number[]) => arr.length ? Math.round(arr.reduce((s, v) => s + v, 0) / arr.length) : null;
      const componentAverages = {
        meeting_execution: avg(avgCompSum.meeting_execution),
        followup_execution: avg(avgCompSum.followup_execution),
        pipeline_influence: avg(avgCompSum.pipeline_influence),
        target_account_execution: avg(avgCompSum.target_account_execution),
        rep_productivity: avg(avgCompSum.rep_productivity),
      };
      const cesComponentAverages = {
        meeting_execution: avg(avgCESCompSum.meeting_execution),
        engagement_breadth: avg(avgCESCompSum.engagement_breadth),
        followup_execution: avg(avgCESCompSum.followup_execution),
      };
      const costComponentAverages = {
        cpm_score: avg(avgCostCompSum.cpm_score),
        cpc_score: avg(avgCostCompSum.cpc_score),
      };
      const priorAvgSES = priorAvg[rep.repId] ?? null;
      const trend = avgSES != null && priorAvgSES != null
        ? (avgSES - priorAvgSES > 3 ? 'up' : avgSES - priorAvgSES < -3 ? 'down' : 'stable')
        : null;
      return { ...rep, avgSES, confCount, sd, minScore, maxScore, componentAverages, cesComponentAverages, costComponentAverages, totalApproxPipeline, totalPipelineGoal, trend };
    });

    const minConfFiltered = withStats.filter(r => r.confCount >= repMinConferences);

    const tierFiltered = minConfFiltered.filter(r => {
      if (repTierFilter === 'all') return true;
      if (r.avgSES == null) return false;
      if (repTierFilter === 'strong_above') return r.avgSES >= 75;
      if (repTierFilter === 'acceptable_above') return r.avgSES >= 60;
      if (repTierFilter === 'needs_work_below') return r.avgSES < 60;
      if (repTierFilter === 'weak_only') return r.avgSES < 50;
      return true;
    });

    const sorted = [...tierFiltered].sort((a, b) => {
      if (repSort === 'avg_desc') return (b.avgSES ?? -1) - (a.avgSES ?? -1);
      if (repSort === 'avg_asc') return (a.avgSES ?? 101) - (b.avgSES ?? 101);
      if (repSort === 'name_asc') return a.repName.localeCompare(b.repName);
      if (repSort === 'most_consistent') return a.sd - b.sd;
      if (repSort === 'most_variable') return b.sd - a.sd;
      return 0;
    });

    const filteredForCards = minConfFiltered;
    const validCards = filteredForCards.filter(r => r.avgSES != null);
    const cardAvgSES = validCards.length
      ? Math.round(validCards.reduce((s, r) => s + (r.avgSES ?? 0), 0) / validCards.length)
      : null;
    const topPerformer = [...filteredForCards].sort((a, b) => (b.avgSES ?? -1) - (a.avgSES ?? -1))[0] ?? null;
    const mostConsistent = filteredForCards.filter(r => r.confCount >= 2).sort((a, b) => a.sd - b.sd)[0] ?? null;

    // Only show conference columns that have at least one rep with data in the heatmap
    const confsWithData = conferences.filter(conf =>
      withStats.some(rep => rep.conferences[conf.id] != null),
    );

    return { sorted, conferences: confsWithData, cardAvgSES, topPerformer, mostConsistent, filteredForCards };
  }, [repData, repMinConferences, repTierFilter, repSort]);

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
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto">
          <nav className="flex gap-1 -mb-px overflow-x-auto hide-scrollbar px-6">
            {TABS.filter(t => t.id !== 'snapshots' || isAdmin).map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex-shrink-0 px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
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
        {/* ── Conference Trends tab ─────────────────────────────────────────── */}
        {activeTab === 'trends' && (() => {
          const SENIORITY_COLORS: Record<string, string> = {
            'C-Suite': '#7c3aed',
            'VP/SVP': '#1B76BC',
            'Director': '#059669',
            'Manager': '#f59e0b',
            'Unknown': '#6b7280',
          };
          const seniorityColor = (s: string) => SENIORITY_COLORS[s] ?? '#6b7280';

          // Conferences sorted ASC for the bar chart (most recent 12)
          const chartConfs = trendsData
            ? [...trendsData.conferences].sort((a, b) => a.start_date.localeCompare(b.start_date)).slice(-12)
            : [];

          // Top ICP company in overlap list
          const topIcpOverlap = trendsData?.companyOverlap.find(c => c.icp === 'Yes');

          // Seniority mix totals
          const seniorityTotal = (trendsData?.seniorityMix ?? []).reduce((s, r) => s + r.count, 0);

          // Drill-down seniority total
          const ddSeniorityTotal = (trendsConfData?.seniorityBreakdown ?? []).reduce((s, r) => s + r.count, 0);

          // Title keywords: normalize font size 10–18px
          const keywords = trendsConfData?.titleKeywords ?? [];
          const maxKw = keywords[0]?.count ?? 1;
          const minKw = keywords[keywords.length - 1]?.count ?? 1;
          const kwFontSize = (count: number) => {
            if (maxKw === minKw) return 14;
            return Math.round(10 + ((count - minKw) / (maxKw - minKw)) * 8);
          };

          const selectedConf = trendsData?.conferences.find(c => c.id === trendsConfId);

          return (
            <div className="space-y-6">
              {/* ── Section A: Portfolio Overview ── */}
              {trendsLoading ? (
                <div className="card space-y-4 animate-pulse">
                  <div className="h-4 bg-gray-200 rounded w-1/3" />
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    {[0,1,2,3].map(i => <div key={i} className="h-20 bg-gray-100 rounded-lg" />)}
                  </div>
                  <div className="h-48 bg-gray-100 rounded-lg" />
                </div>
              ) : trendsData ? (
                <>
                  {/* KPI tiles */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    <div className="card text-center">
                      <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Conferences Tracked</p>
                      <p className="text-3xl font-bold text-brand-primary">{trendsData.totalConferences}</p>
                    </div>
                    <div className="card text-center">
                      <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Avg ICP Density</p>
                      <p className="text-3xl font-bold text-brand-primary">{trendsData.avgIcpDensity}%</p>
                    </div>
                    <div className="card text-center">
                      <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Recurring ICP Companies</p>
                      <p className="text-3xl font-bold text-brand-primary">{trendsData.companyOverlap.length}</p>
                      <p className="text-xs text-gray-400 mt-0.5">at 2+ conferences</p>
                    </div>
                    <div className="card text-center">
                      <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Top ICP Overlap</p>
                      {topIcpOverlap ? (
                        <>
                          <p className="text-sm font-semibold text-brand-primary leading-tight mt-1 truncate" title={topIcpOverlap.name}>{topIcpOverlap.name}</p>
                          <p className="text-xs text-gray-400 mt-0.5">{topIcpOverlap.conf_count} conferences</p>
                        </>
                      ) : (
                        <p className="text-sm text-gray-400 mt-2">—</p>
                      )}
                    </div>
                  </div>

                  {/* ICP Density bar chart */}
                  <div className="card">
                    <h3 className="text-sm font-semibold text-brand-primary mb-0.5">ICP Density by Conference</h3>
                    <p className="text-xs text-gray-400 mb-4">% ICP companies in attendance list — avg line shown</p>
                    {chartConfs.length === 0 ? (
                      <p className="text-sm text-gray-400 py-6 text-center">No conference data available.</p>
                    ) : (
                      <div className="space-y-2">
                        {chartConfs.map(conf => {
                          const pct = conf.icp_density_pct;
                          const aboveAvg = pct > trendsData.avgIcpDensity;
                          return (
                            <div key={conf.id} className="flex items-center gap-3">
                              <span className="text-xs text-gray-500 w-32 shrink-0 truncate text-right" title={conf.name}>{conf.name}</span>
                              <div className="relative flex-1 h-5 bg-gray-100 rounded overflow-visible">
                                {/* bar */}
                                <div
                                  className="absolute left-0 top-0 h-full rounded transition-all duration-300"
                                  style={{
                                    width: `${pct}%`,
                                    backgroundColor: aboveAvg ? '#059669' : '#1B76BC',
                                  }}
                                />
                                {/* avg line */}
                                <div
                                  className="absolute top-0 h-full w-px bg-gray-400 z-10"
                                  style={{ left: `${trendsData.avgIcpDensity}%` }}
                                  title={`Avg: ${trendsData.avgIcpDensity}%`}
                                />
                              </div>
                              <span className="text-xs font-medium text-gray-600 w-8 shrink-0">{pct}%</span>
                            </div>
                          );
                        })}
                        <p className="text-xs text-gray-400 mt-2 text-right">
                          <span className="inline-block w-2 h-2 rounded-full mr-1" style={{ backgroundColor: '#059669' }} />above avg
                          <span className="inline-block w-2 h-2 rounded-full ml-3 mr-1" style={{ backgroundColor: '#1B76BC' }} />at/below avg
                          <span className="ml-3">avg line = {trendsData.avgIcpDensity}%</span>
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Recurring companies + Seniority mix */}
                  <div className="grid sm:grid-cols-2 gap-4">
                    {/* Recurring ICP Companies */}
                    <div className="card">
                      <h3 className="text-sm font-semibold text-brand-primary mb-3">Recurring ICP Companies</h3>
                      {trendsData.companyOverlap.length === 0 ? (
                        <p className="text-sm text-gray-400">No ICP companies found at multiple conferences.</p>
                      ) : (
                        <div className="space-y-1.5">
                          {trendsData.companyOverlap.slice(0, 10).map((co, i) => (
                            <div key={co.id} className="flex items-center gap-2">
                              <span className="text-xs text-gray-400 w-4 shrink-0 text-right">{i + 1}.</span>
                              <span className="text-sm text-gray-800 flex-1 truncate" title={co.name}>{co.name}</span>
                              <span className="px-2 py-0.5 text-xs font-semibold bg-brand-primary/10 text-brand-primary rounded-full shrink-0">
                                {co.conf_count}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Portfolio Seniority Mix */}
                    <div className="card">
                      <h3 className="text-sm font-semibold text-brand-primary mb-3">Portfolio Seniority Mix</h3>
                      {trendsData.seniorityMix.length === 0 ? (
                        <p className="text-sm text-gray-400">No seniority data available.</p>
                      ) : (
                        <div className="space-y-2">
                          {trendsData.seniorityMix.map(row => {
                            const pct = seniorityTotal > 0 ? Math.round(row.count / seniorityTotal * 100) : 0;
                            return (
                              <div key={row.seniority} className="flex items-center gap-2">
                                <span className="text-xs text-gray-600 w-20 shrink-0">{row.seniority}</span>
                                <div className="flex-1 h-4 bg-gray-100 rounded overflow-hidden">
                                  <div
                                    className="h-full rounded transition-all duration-300"
                                    style={{ width: `${pct}%`, backgroundColor: seniorityColor(row.seniority) }}
                                  />
                                </div>
                                <span className="text-xs text-gray-500 w-16 shrink-0 text-right">{row.count.toLocaleString()} ({pct}%)</span>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                </>
              ) : null}

              {/* ── Section B: Conference Drill-Down ── */}
              {trendsData && (
                <div className="card space-y-4">
                  <div className="flex items-center justify-between gap-4 flex-wrap">
                    <h3 className="text-sm font-semibold text-brand-primary">Conference Detail</h3>
                    <select
                      className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-brand-secondary/40"
                      value={trendsConfId ?? ''}
                      onChange={e => setTrendsConfId(Number(e.target.value))}
                    >
                      {[...trendsData.conferences]
                        .sort((a, b) => b.start_date.localeCompare(a.start_date))
                        .map(c => (
                          <option key={c.id} value={c.id}>
                            {c.name} ({c.start_date.slice(0, 4)})
                          </option>
                        ))}
                    </select>
                  </div>

                  {selectedConf && (
                    <p className="text-xs text-gray-400">
                      {selectedConf.start_date} · {selectedConf.total_attendees} attendees · {selectedConf.total_companies} companies
                    </p>
                  )}

                  {trendsConfLoading ? (
                    <div className="space-y-3 animate-pulse">
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        {[0,1,2,3].map(i => <div key={i} className="h-16 bg-gray-100 rounded-lg" />)}
                      </div>
                      <div className="grid sm:grid-cols-2 gap-3">
                        <div className="h-40 bg-gray-100 rounded-lg" />
                        <div className="h-40 bg-gray-100 rounded-lg" />
                      </div>
                    </div>
                  ) : trendsConfData ? (
                    <div className="space-y-4">
                      {/* KPI tiles */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        <div className="bg-gray-50 rounded-lg p-3 text-center">
                          <p className="text-xs text-gray-400 mb-1">Attendees</p>
                          <p className="text-2xl font-bold text-brand-primary">{trendsConfData.totalAttendees.toLocaleString()}</p>
                        </div>
                        <div className="bg-gray-50 rounded-lg p-3 text-center">
                          <p className="text-xs text-gray-400 mb-1">Companies</p>
                          <p className="text-2xl font-bold text-brand-primary">{trendsConfData.totalCompanies.toLocaleString()}</p>
                        </div>
                        <div className="bg-gray-50 rounded-lg p-3 text-center">
                          <p className="text-xs text-gray-400 mb-1">ICP Companies</p>
                          <p className="text-2xl font-bold text-green-600">{trendsConfData.icpCompanies.toLocaleString()}</p>
                          <p className="text-xs text-gray-400">{trendsConfData.icpDensityPct}% of total</p>
                        </div>
                        <div className="bg-gray-50 rounded-lg p-3 text-center">
                          <p className="text-xs text-gray-400 mb-1">Meetings</p>
                          <p className="text-2xl font-bold text-brand-primary">{trendsConfData.meetingsTotal.toLocaleString()}</p>
                        </div>
                      </div>

                      {/* Seniority breakdown + Title keywords */}
                      <div className="grid sm:grid-cols-2 gap-4">
                        {/* Seniority breakdown */}
                        <div>
                          <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Seniority Breakdown</h4>
                          {trendsConfData.seniorityBreakdown.length === 0 ? (
                            <p className="text-sm text-gray-400">No data.</p>
                          ) : (
                            <div className="space-y-2">
                              {trendsConfData.seniorityBreakdown.map(row => {
                                const pct = ddSeniorityTotal > 0 ? Math.round(row.count / ddSeniorityTotal * 100) : 0;
                                return (
                                  <div key={row.seniority} className="flex items-center gap-2">
                                    <div
                                      className="w-2 h-2 rounded-full shrink-0"
                                      style={{ backgroundColor: seniorityColor(row.seniority) }}
                                    />
                                    <span className="text-xs text-gray-600 w-20 shrink-0">{row.seniority}</span>
                                    <div className="flex-1 h-4 bg-gray-100 rounded overflow-hidden">
                                      <div
                                        className="h-full rounded"
                                        style={{ width: `${pct}%`, backgroundColor: seniorityColor(row.seniority) }}
                                      />
                                    </div>
                                    <span className="text-xs text-gray-500 w-20 shrink-0 text-right">{row.count} ({pct}%)</span>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>

                        {/* Title Keywords */}
                        <div>
                          <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Title Keywords</h4>
                          {keywords.length === 0 ? (
                            <p className="text-sm text-gray-400">No title data.</p>
                          ) : (
                            <div className="flex flex-wrap gap-1.5">
                              {keywords.map(kw => (
                                <span
                                  key={kw.word}
                                  className="px-2 py-0.5 rounded-full font-medium capitalize"
                                  style={{ fontSize: `${kwFontSize(kw.count)}px`, background: '#EEEDFE', border: '1px solid #534AB7', color: '#3C3489', fontWeight: 500 }}
                                  title={`${kw.word}: ${kw.count}`}
                                >
                                  {kw.word}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Cross-Conference Company Presence */}
                      {(() => {
                        const primaryType = trendsConfData.primaryCompanyType;
                        const companyTypeColors = configColors['company_type'] ?? {};
                        const confCountStyle = (n: number): React.CSSProperties => {
                          if (n <= 2) return { background: '#F1EFE8', border: '1px solid #D3D1C7', color: '#5F5E5A' };
                          if (n <= 4) return { background: '#E6F1FB', border: '1px solid #85B7EB', color: '#0C447C' };
                          if (n <= 6) return { background: '#EEEDFE', border: '1px solid #AFA9EC', color: '#3C3489' };
                          if (n <= 8) return { background: '#E1F5EE', border: '1px solid #5DCAA5', color: '#085041' };
                          return { background: '#EAF3DE', border: '1px solid #97C459', color: '#27500A' };
                        };
                        const allRows = trendsConfData.crossConfPresence;
                        const filteredRows = (() => {
                          let rows = allRows;
                          if (trendsTableFilter === 'icp') rows = allRows.filter(c => c.icp === 'Yes');
                          else if (trendsTableFilter === 'primary' && primaryType) rows = allRows.filter(c => c.company_type === primaryType);
                          else if (trendsTableFilter === 'other') rows = allRows.filter(c => c.icp !== 'Yes' && c.company_type !== primaryType);
                          return rows.slice(0, 20);
                        })();
                        return (
                          <div>
                            <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
                              <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Cross-Conference Company Presence</h4>
                              <div className="inline-flex items-center bg-gray-100 rounded-lg p-0.5">
                                {(['icp', ...(primaryType ? ['primary'] : []), 'other', 'all'] as const).map(f => (
                                  <button
                                    key={f}
                                    onClick={() => setTrendsTableFilter(f as typeof trendsTableFilter)}
                                    className={`px-3 py-1 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${
                                      trendsTableFilter === f
                                        ? 'bg-white text-gray-900 shadow-sm'
                                        : 'text-gray-500 hover:text-gray-700'
                                    }`}
                                  >
                                    {f === 'icp' ? 'ICP' : f === 'primary' ? primaryType! : f === 'other' ? 'Other' : 'All'}
                                  </button>
                                ))}
                              </div>
                            </div>
                            {filteredRows.length === 0 ? (
                              <p className="text-sm text-gray-400">No companies match this filter.</p>
                            ) : (
                              <div className="overflow-x-auto relative">
                                <table className="w-full text-sm">
                                  <thead>
                                    <tr className="border-b border-gray-100">
                                      <th className="text-left text-xs font-medium text-gray-400 py-2 pr-4">Company</th>
                                      <th className="text-left text-xs font-medium text-gray-400 py-2 pr-4">Type</th>
                                      <th className="text-right text-xs font-medium text-gray-400 py-2">Conferences</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {filteredRows.map(co => (
                                      <tr key={co.id} className="border-b border-gray-50 hover:bg-gray-50/50 relative">
                                        <td className="py-1.5 pr-4">
                                          <button
                                            type="button"
                                            className="text-sm font-medium text-brand-primary hover:underline text-left"
                                            onClick={() => { setTrendsDrawerCompanyId(co.id); setTrendsDrawerCompanyName(co.name); }}
                                          >
                                            {co.name}
                                          </button>
                                        </td>
                                        <td className="py-1.5 pr-4">
                                          {co.company_type ? (
                                            <span className={getBadgeClass(co.company_type, companyTypeColors)} style={{ fontSize: '10px', padding: '1px 6px' }}>
                                              {co.company_type}
                                            </span>
                                          ) : (
                                            <span className="text-xs text-gray-300">—</span>
                                          )}
                                        </td>
                                        <td className="py-1.5 text-right">
                                          <button
                                            type="button"
                                            className="px-2 py-0.5 text-xs font-semibold rounded-full cursor-pointer"
                                            style={confCountStyle(co.total_confs)}
                                            onClick={(e) => {
                                              if (trendsPopoverId === co.id) {
                                                setTrendsPopoverId(null);
                                                setTrendsPopoverPos(null);
                                              } else {
                                                const rect = (e.currentTarget as HTMLButtonElement).getBoundingClientRect();
                                                setTrendsPopoverId(co.id);
                                                setTrendsPopoverPos({ top: rect.bottom + 4, right: window.innerWidth - rect.right });
                                              }
                                            }}
                                          >
                                            {co.total_confs}
                                          </button>
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            )}
                          </div>
                        );
                      })()}
                    </div>
                  ) : !trendsConfId ? (
                    <p className="text-sm text-gray-400 py-4 text-center">Select a conference above.</p>
                  ) : null}
                </div>
              )}

              {/* ── Section C: Conference Saturation ── */}
              {(() => {
                const satScoreColor = (score: number) => {
                  if (score <= 30) return '#97C459';
                  if (score <= 60) return '#EF9F27';
                  if (score <= 80) return '#E24B4A';
                  return '#A32D2D';
                };
                const satLabel = (score: number) => {
                  if (score <= 30) return 'Fresh';
                  if (score <= 60) return 'Moderate';
                  if (score <= 80) return 'High';
                  return 'Critical';
                };
                const satBg = (score: number) => {
                  if (score <= 30) return '#f0fdf4';
                  if (score <= 60) return '#fffbeb';
                  if (score <= 80) return '#fff7ed';
                  return '#fef2f2';
                };
                const recommendationText = (entry: SaturationConferenceEntry): string => {
                  const score = entry.saturation_score;
                  const pctNew = entry.contacts_touched_this_conf > 0
                    ? Math.round(entry.contacts_net_new / entry.contacts_touched_this_conf * 100)
                    : 0;
                  if (score <= 30) return `Strong audience renewal — ${pctNew}% net-new contacts. Continue current outreach strategy.`;
                  if (score <= 60) return `Moderate saturation. Consider targeted prospecting to expand net-new contacts before next cycle.`;
                  if (score <= 80) return `High saturation — ${entry.contacts_droppable} contacts (health ≥ 50) may no longer need active coverage. Prioritize fresh prospect sourcing.`;
                  return `Critical saturation — audience is heavily recycled with ${entry.contacts_droppable} droppable contacts. Evaluate conference ROI and explore list diversification.`;
                };

                const allConferences = satData?.seriesGroups.flatMap(s => s.conferences) ?? [];
                return (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-semibold text-brand-primary">Saturation Index</h3>
                      {satData && (
                        <span className="text-xs text-gray-400">{allConferences.length} conferences with saturation data</span>
                      )}
                    </div>

                    {satLoading ? (
                      <div className="grid grid-cols-2 gap-4 animate-pulse">
                        <div className="h-20 bg-gray-100 rounded-lg" />
                        <div className="h-20 bg-gray-100 rounded-lg" />
                      </div>
                    ) : satData ? (
                      <>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="card text-center">
                            <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Avg Saturation Score</p>
                            <p className="text-3xl font-bold" style={{ color: satScoreColor(satData.avg_saturation_score) }}>
                              {satData.avg_saturation_score}
                            </p>
                            <p className="text-xs mt-0.5" style={{ color: satScoreColor(satData.avg_saturation_score) }}>
                              {satLabel(satData.avg_saturation_score)}
                            </p>
                          </div>
                          <div className="card text-center">
                            <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">High Saturation Alerts</p>
                            <p className={`text-3xl font-bold ${satData.high_saturation_count > 0 ? 'text-red-600' : 'text-brand-primary'}`}>
                              {satData.high_saturation_count}
                            </p>
                            <p className="text-xs text-gray-400 mt-0.5">score &gt; 60</p>
                          </div>
                        </div>

                        {/* Saturation trend dots per series */}
                        {satData.seriesGroups.map(series => (
                          <div key={series.series_id} className="card">
                            <h4 className="text-xs font-semibold uppercase tracking-wide mb-3">
                              <Link
                                href={`/conference-series/${series.series_id}`}
                                className="text-brand-secondary hover:underline cursor-pointer"
                              >
                                {series.series_name}
                              </Link>
                            </h4>
                            <div className="flex items-end gap-3 flex-wrap">
                              {[...series.conferences]
                                .sort((a, b) => a.start_date.localeCompare(b.start_date))
                                .map(conf => (
                                  <button
                                    key={conf.conference_id}
                                    type="button"
                                    onClick={() => setSatDetailId(
                                      satDetailId === conf.conference_id ? null : conf.conference_id,
                                    )}
                                    className={`flex flex-col items-center gap-1 group transition-opacity ${satDetailId && satDetailId !== conf.conference_id ? 'opacity-40' : ''}`}
                                    title={`${conf.conference_name} — score ${conf.saturation_score}`}
                                  >
                                    <span className="text-xs font-bold tabular-nums" style={{ color: satScoreColor(conf.saturation_score) }}>
                                      {conf.saturation_score}
                                    </span>
                                    <div
                                      className="w-4 h-4 rounded-full border-2 border-white shadow transition-transform group-hover:scale-125"
                                      style={{
                                        backgroundColor: satScoreColor(conf.saturation_score),
                                        boxShadow: satDetailId === conf.conference_id ? '0 0 0 2px #1B76BC' : undefined,
                                      }}
                                    />
                                    <span className="text-[10px] text-gray-400 max-w-[56px] text-center leading-tight">
                                      {conf.start_date.slice(0, 7)}
                                    </span>
                                  </button>
                                ))}
                            </div>

                            {/* Detail panel for selected conference */}
                            {satDetailId && series.conferences.some(c => c.conference_id === satDetailId) && (() => {
                              const conf = series.conferences.find(c => c.conference_id === satDetailId)!;
                              const totalBar = conf.contacts_touched_this_conf || 1;
                              const netNewPct = Math.round(conf.contacts_net_new / totalBar * 100);
                              const returningPct = 100 - netNewPct;
                              return (
                                <div className="mt-4 space-y-4 border-t border-gray-100 pt-4">
                                  {/* Recommendation banner */}
                                  <div
                                    className="rounded-lg px-4 py-3 text-sm"
                                    style={{
                                      background: satBg(conf.saturation_score),
                                      borderLeft: `4px solid ${satScoreColor(conf.saturation_score)}`,
                                    }}
                                  >
                                    <p className="font-semibold mb-0.5" style={{ color: satScoreColor(conf.saturation_score) }}>
                                      {satLabel(conf.saturation_score)} Saturation
                                    </p>
                                    <p className="text-gray-700 text-xs">{recommendationText(conf)}</p>
                                  </div>

                                  {/* New vs Returning bar */}
                                  <div>
                                    <div className="flex items-center justify-between mb-1">
                                      <span className="text-xs font-medium text-gray-600">New vs. Known Contacts</span>
                                      <span className="text-xs text-gray-400">{conf.contacts_touched_this_conf} at this conference</span>
                                    </div>
                                    <div className="flex h-6 rounded overflow-hidden text-xs font-semibold">
                                      <div
                                        className="flex items-center justify-center text-white"
                                        style={{ width: `${netNewPct}%`, background: '#97C459', minWidth: netNewPct > 0 ? 24 : 0 }}
                                      >
                                        {netNewPct > 8 && `${netNewPct}%`}
                                      </div>
                                      <div
                                        className="flex items-center justify-center text-white"
                                        style={{ width: `${returningPct}%`, background: satScoreColor(conf.saturation_score), minWidth: returningPct > 0 ? 24 : 0 }}
                                      >
                                        {returningPct > 8 && `${returningPct}%`}
                                      </div>
                                    </div>
                                    <div className="flex items-center gap-4 mt-1.5">
                                      <span className="flex items-center gap-1 text-xs text-gray-500">
                                        <span className="w-2 h-2 rounded-full inline-block" style={{ background: '#97C459' }} />
                                        Net new ({conf.contacts_net_new})
                                      </span>
                                      <span className="flex items-center gap-1 text-xs text-gray-500">
                                        <span className="w-2 h-2 rounded-full inline-block" style={{ background: satScoreColor(conf.saturation_score) }} />
                                        Returning ({conf.contacts_returning})
                                      </span>
                                      {conf.contacts_droppable > 0 && (
                                        <span className="flex items-center gap-1 text-xs text-gray-400">
                                          · {conf.contacts_droppable} droppable
                                        </span>
                                      )}
                                    </div>
                                  </div>

                                  {/* Health breakdown */}
                                  <div className="grid grid-cols-3 gap-2 text-center">
                                    {[
                                      { label: 'Strong', count: conf.contacts_high_health, color: '#059669', bg: '#f0fdf4' },
                                      { label: 'Developing', count: conf.contacts_mid_health, color: '#d97706', bg: '#fffbeb' },
                                      { label: 'At Risk', count: conf.contacts_low_health, color: '#dc2626', bg: '#fef2f2' },
                                    ].map(({ label, count, color, bg }) => (
                                      <div key={label} className="rounded-lg p-2" style={{ background: bg }}>
                                        <p className="text-lg font-bold" style={{ color }}>{count}</p>
                                        <p className="text-[10px] text-gray-500">{label}</p>
                                      </div>
                                    ))}
                                  </div>

                                  {/* Droppable contacts table */}
                                  {conf.contacts_droppable > 0 && (
                                    <div>
                                      <div className="flex items-center justify-between mb-2">
                                        <h5 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                                          Droppable Contacts
                                        </h5>
                                        {satDetailLoading && <span className="text-xs text-gray-400">Loading…</span>}
                                      </div>
                                      {satDetail && satDetail.conference_id === satDetailId ? (
                                        satDetail.droppable_contacts.length === 0 ? (
                                          <p className="text-xs text-gray-400">No droppable contacts found.</p>
                                        ) : (
                                          <div className="overflow-x-auto">
                                            <table className="w-full text-xs">
                                              <thead>
                                                <tr className="border-b border-gray-100">
                                                  <th className="text-left font-medium text-gray-400 py-1.5 pr-3">Name</th>
                                                  <th className="text-left font-medium text-gray-400 py-1.5 pr-3">Company</th>
                                                  <th className="text-center font-medium text-gray-400 py-1.5 pr-3">Interactions</th>
                                                  <th className="text-center font-medium text-gray-400 py-1.5 pr-3">Meetings</th>
                                                  <th className="text-center font-medium text-gray-400 py-1.5 pr-3">Health</th>
                                                  <th className="py-1.5" />
                                                </tr>
                                              </thead>
                                              <tbody>
                                                {satDetail.droppable_contacts.map(c => {
                                                  const displayHealth = Math.min(c.health_score, 100);
                                                  const hColor = c.health_score >= 70 ? '#059669' : c.health_score >= 40 ? '#d97706' : '#dc2626';
                                                  const r = 11; const cx2 = 14; const circ = 2 * Math.PI * r;
                                                  const offset = circ * (1 - displayHealth / 100);
                                                  const fullName = [c.first_name, c.last_name].filter(Boolean).join(' ') || '—';
                                                  return (
                                                    <tr key={c.attendee_id} className="border-b border-gray-50 hover:bg-gray-50/50">
                                                      <td className="py-1.5 pr-3">
                                                        <p className="font-medium text-gray-800 truncate max-w-[140px]">{fullName}</p>
                                                        {c.title && <p className="text-gray-400 truncate max-w-[140px]">{c.title}</p>}
                                                      </td>
                                                      <td className="py-1.5 pr-3 text-gray-600 truncate max-w-[100px]">{c.company_name || '—'}</td>
                                                      <td className="py-1.5 pr-3 text-center">
                                                        <span className="px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-brand-primary/10 text-brand-primary">
                                                          {c.interaction_count}×
                                                        </span>
                                                      </td>
                                                      <td className="py-1.5 pr-3 text-center text-gray-600">
                                                        {c.cumulative_meetings > 0 ? (
                                                          <span title={c.last_meeting_outcome ?? undefined}>{c.cumulative_meetings}</span>
                                                        ) : '—'}
                                                      </td>
                                                      <td className="py-1.5 pr-3">
                                                        <div className="flex justify-center">
                                                          <svg width={28} height={28} viewBox="0 0 28 28" className="flex-shrink-0">
                                                            <circle cx={cx2} cy={cx2} r={r} fill="none" stroke="rgba(34,58,94,0.08)" strokeWidth={3} />
                                                            <circle cx={cx2} cy={cx2} r={r} fill="none" stroke={hColor} strokeWidth={3}
                                                              strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round"
                                                              transform={`rotate(-90 ${cx2} ${cx2})`} />
                                                            <text x={cx2} y={cx2} textAnchor="middle" dominantBaseline="middle"
                                                              style={{ fontSize: 7, fill: '#223A5E', fontWeight: 700, fontFamily: 'inherit' }}>
                                                              {displayHealth}
                                                            </text>
                                                          </svg>
                                                        </div>
                                                      </td>
                                                      <td className="py-1.5 text-right">
                                                        <button
                                                          type="button"
                                                          onClick={() => setSatFollowUpAttendeeId(c.attendee_id)}
                                                          className="text-xs text-brand-secondary hover:underline font-medium whitespace-nowrap"
                                                        >
                                                          Outreach →
                                                        </button>
                                                      </td>
                                                    </tr>
                                                  );
                                                })}
                                              </tbody>
                                            </table>
                                          </div>
                                        )
                                      ) : null}
                                    </div>
                                  )}
                                </div>
                              );
                            })()}
                          </div>
                        ))}
                      </>
                    ) : !satLoading ? (
                      <div className="card text-center py-8">
                        <p className="text-sm text-gray-500 font-medium mb-1">No saturation data yet</p>
                        <p className="text-xs text-gray-400">Assign conferences to a series and run a saturation compute to see data here.</p>
                      </div>
                    ) : null}
                  </div>
                );
              })()}

              {/* Follow-up modal for substitutable contacts */}
              {satFollowUpAttendeeId !== null && (
                <AssignFollowUpModal
                  isOpen
                  onClose={() => setSatFollowUpAttendeeId(null)}
                  onSuccess={() => setSatFollowUpAttendeeId(null)}
                  defaultAttendeeId={satFollowUpAttendeeId}
                />
              )}

              {/* Conference names popover (fixed to viewport) */}
              {trendsPopoverId !== null && trendsPopoverPos !== null && (() => {
                const popoverCompany = trendsConfData?.crossConfPresence.find(c => c.id === trendsPopoverId);
                if (!popoverCompany || popoverCompany.conference_names.length === 0) return null;
                return (
                  <div
                    className="fixed z-[200] bg-white border border-gray-200 rounded-lg shadow-xl text-left"
                    style={{ top: trendsPopoverPos.top, right: trendsPopoverPos.right, minWidth: 200, maxHeight: 200, overflowY: 'auto' }}
                    onClick={e => e.stopPropagation()}
                  >
                    <div className="px-3 py-2">
                      {popoverCompany.conference_names.map((cn, i) => (
                        <p key={i} className="text-xs text-gray-700 py-0.5 border-b border-gray-50 last:border-0">{cn}</p>
                      ))}
                    </div>
                  </div>
                );
              })()}

              {/* Company record iframe drawer */}
              {trendsDrawerCompanyId !== null && (
                <>
                  <style>{`@keyframes slideInRight { from { transform: translateX(100%); } to { transform: translateX(0); } }`}</style>
                  <div
                    className="fixed inset-0 z-40 bg-black/30"
                    onClick={() => { setTrendsDrawerCompanyId(null); setTrendsDrawerCompanyName(''); setTrendsPopoverId(null); }}
                  />
                  <div
                    className="fixed inset-y-0 right-0 z-50 w-full sm:w-[600px] bg-white shadow-2xl flex flex-col"
                    style={{ animation: 'slideInRight 0.25s ease-out' }}
                  >
                    <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 flex-shrink-0">
                      <div>
                        <h3 className="text-sm font-semibold text-gray-800">{trendsDrawerCompanyName}</h3>
                        <p className="text-xs text-gray-500">Company Record</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => { setTrendsDrawerCompanyId(null); setTrendsDrawerCompanyName(''); setTrendsPopoverId(null); }}
                        className="p-1.5 rounded hover:bg-gray-100 text-gray-500"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                    <iframe
                      src={`/companies/${trendsDrawerCompanyId}?embed=true`}
                      className="flex-1 w-full border-0"
                      title={trendsDrawerCompanyName}
                    />
                  </div>
                </>
              )}
            </div>
          );
        })()}

        {activeTab !== 'performance' && (activeTab as string) !== 'calendar' && activeTab !== 'reps' && activeTab !== 'trends' && activeTab !== 'snapshots' && (
          <div className="card flex items-center justify-center h-48">
            <p className="text-sm text-gray-400">Coming soon.</p>
          </div>
        )}



        {activeTab === 'reps' && (
          <div className="space-y-4">
            {repLoading ? (
              <div className="text-center py-16">
                <div className="w-10 h-10 rounded-full border-2 border-brand-secondary/20 border-t-brand-secondary animate-spin mx-auto mb-3" />
                <p className="text-gray-500 text-sm font-medium">Loading rep performance data…</p>
              </div>
            ) : repError ? (
              <div className="card text-center py-10">
                <p className="font-medium text-gray-700">Failed to load rep performance</p>
                <p className="text-sm text-gray-400 mt-1">{repError}</p>
              </div>
            ) : !repDerivedData || repDerivedData.sorted.length === 0 ? (
              <div className="card flex flex-col items-center justify-center py-16 gap-4 text-center">
                <svg className="w-12 h-12 text-gray-200" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                <div>
                  <p className="font-medium text-gray-700">No rep performance data for this period</p>
                  <p className="text-sm text-gray-400 mt-1">Sales Execution Scores will appear here once conferences have been scored with rep-level meeting and follow-up data.</p>
                </div>
              </div>
            ) : (
              <>
                {/* Summary stat cards */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                  <div className="card border-l-4 border-brand-secondary py-4">
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Reps Tracked</p>
                    <p className="text-3xl font-bold text-brand-primary">{repDerivedData.filteredForCards.length}</p>
                    <p className="text-xs text-gray-400 mt-0.5">with SES data in period</p>
                  </div>
                  <div className="card border-l-4 py-4" style={{ borderLeftColor: sesScoreColor(repDerivedData.cardAvgSES) }}>
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Team Avg SES</p>
                    <p className="text-3xl font-bold" style={{ color: sesScoreColor(repDerivedData.cardAvgSES) }}>{repDerivedData.cardAvgSES ?? '—'}</p>
                    <p className="text-xs font-semibold mt-0.5" style={{ color: sesScoreColor(repDerivedData.cardAvgSES) }}>{sesTierLabel(repDerivedData.cardAvgSES)}</p>
                  </div>
                  <div className="card border-l-4 border-emerald-500 py-4">
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Top Performer</p>
                    {repDerivedData.topPerformer ? (
                      <>
                        <p className="text-base font-bold text-gray-900 mt-1 truncate">{repDerivedData.topPerformer.repName}</p>
                        <p className="text-xs text-gray-400 mt-0.5">avg <span className="font-semibold" style={{ color: sesScoreColor(repDerivedData.topPerformer.avgSES) }}>{repDerivedData.topPerformer.avgSES}</span></p>
                      </>
                    ) : <p className="text-2xl font-bold text-gray-300">—</p>}
                  </div>
                  <div className="card border-l-4 border-blue-400 py-4">
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Most Consistent</p>
                    {repDerivedData.mostConsistent ? (
                      <>
                        <p className="text-base font-bold text-gray-900 mt-1 truncate">{repDerivedData.mostConsistent.repName}</p>
                        <p className="text-xs text-gray-400 mt-0.5">range <span className="font-semibold text-gray-600">{repDerivedData.mostConsistent.minScore}–{repDerivedData.mostConsistent.maxScore}</span></p>
                      </>
                    ) : <p className="text-2xl font-bold text-gray-300">—</p>}
                  </div>
                </div>

                {/* Filter bar */}
                <div className="card space-y-3">
                  {/* Score view toggle */}
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide flex-shrink-0">Score view</span>
                    <div className="flex rounded-lg border border-gray-200 overflow-hidden text-sm">
                      {([['ses', 'Sales Execution'], ['ces', 'Conf. Effectiveness'], ['cost', 'Cost Efficiency']] as const).map(([view, label]) => (
                        <button
                          key={view}
                          onClick={() => { setRepScoreView(view); setRepPage(1); }}
                          className={`px-3 py-1.5 transition-colors whitespace-nowrap ${repScoreView === view ? 'bg-brand-secondary text-white font-medium' : 'text-gray-500 hover:text-gray-700'}`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                    {repScoreView === 'ces' && <span className="text-xs text-gray-400">Each rep&apos;s individual effectiveness at each conference</span>}
                  </div>
                  <div className="flex flex-wrap gap-2 items-center">
                    <select className="input-field text-sm py-1.5" value={repMinConferences} onChange={e => { setRepMinConferences(Number(e.target.value)); setRepPage(1); }}>
                      <option value={0}>All reps</option>
                      <option value={2}>2+ conferences</option>
                      <option value={3}>3+ conferences</option>
                      <option value={5}>5+ conferences</option>
                    </select>
                    <select className="input-field text-sm py-1.5" value={repTierFilter} onChange={e => { setRepTierFilter(e.target.value); setRepPage(1); }}>
                      <option value="all">All tiers</option>
                      <option value="strong_above">Strong &amp; above</option>
                      <option value="acceptable_above">Acceptable &amp; above</option>
                      <option value="needs_work_below">Needs Work &amp; below</option>
                      <option value="weak_only">Weak only</option>
                    </select>
                    <select className="input-field text-sm py-1.5" value={repSort} onChange={e => { setRepSort(e.target.value); setRepPage(1); }}>
                      <option value="avg_desc">Average score (high to low)</option>
                      <option value="avg_asc">Average score (low to high)</option>
                      <option value="name_asc">Name (A–Z)</option>
                      <option value="most_consistent">Most consistent</option>
                      <option value="most_variable">Most variable</option>
                    </select>
                    <label className="flex items-center gap-2 ml-auto cursor-pointer select-none">
                      <span className="text-sm text-gray-600">Show component breakdown</span>
                      <button
                        role="switch"
                        aria-checked={showComponents}
                        onClick={() => setShowComponents(v => !v)}
                        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${showComponents ? 'bg-brand-secondary' : 'bg-gray-200'}`}
                      >
                        <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${showComponents ? 'translate-x-4' : 'translate-x-0.5'}`} />
                      </button>
                    </label>
                  </div>
                </div>

                {/* Heatmap table */}
                <div className="card p-0 overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="text-sm border-collapse" style={{ minWidth: `${160 + repDerivedData.conferences.length * 72 + 96}px` }}>
                      <thead>
                        <tr className="bg-gray-50 border-b border-gray-200">
                          <th className="text-left p-3 font-semibold text-gray-500 text-xs uppercase tracking-wide sticky left-0 bg-gray-50 z-10" style={{ minWidth: 160, width: 160 }}>Rep</th>
                          {repDerivedData.conferences.map(conf => (
                            <th key={conf.id} className="p-2 text-center font-semibold text-gray-500 text-xs" style={{ minWidth: 72, width: 72 }}>
                              <div className="truncate max-w-[68px]" title={conf.name}>{conf.name.length > 12 ? conf.name.slice(0, 11) + '…' : conf.name}</div>
                              <div className="text-[10px] font-normal text-gray-400">{new Date(conf.date).getUTCFullYear()}</div>
                            </th>
                          ))}
                          <th className="text-right p-3 font-semibold text-gray-500 text-xs uppercase tracking-wide sticky right-0 bg-gray-50 z-10" style={{ minWidth: 96, width: 96 }}>Avg</th>
                        </tr>
                      </thead>
                      <tbody>
                        {repDerivedData.sorted.slice((repPage - 1) * REP_PAGE_SIZE, repPage * REP_PAGE_SIZE).map(rep => {
                          const totalConfs = repDerivedData.conferences.length;
                          const attendedConfs = rep.confCount;
                          const sparse = attendedConfs < totalConfs / 2;
                          // Compute avg for the selected score view
                          const viewScores = repDerivedData.conferences.map(c => {
                            const cell = rep.conferences[c.id];
                            if (!cell) return null;
                            if (repScoreView === 'ces') return cell.cesScore;
                            return repScoreView === 'cost' ? cell.costEffScore : cell.sesScore;
                          }).filter((s): s is number => s != null);
                          const viewAvg = viewScores.length ? Math.round(viewScores.reduce((a, b) => a + b, 0) / viewScores.length) : null;
                          return (
                            <React.Fragment key={rep.repId}>
                              <tr
                                className="border-b border-gray-100 hover:bg-gray-50 transition-colors cursor-pointer group"
                                onClick={() => { setSelectedRep(rep); setDrawerScoreView('ses'); }}
                              >
                                <td className="p-3 sticky left-0 bg-white z-10 group-hover:bg-gray-50 transition-colors border-r border-gray-100" style={{ minWidth: 160, width: 160 }}>
                                  <p className="font-medium text-brand-secondary">{rep.repName}</p>
                                  {rep.role && <p className="text-xs text-gray-400 mt-0.5 capitalize">{rep.role.replace(/_/g, ' ')}</p>}
                                </td>
                                {repDerivedData.conferences.map(conf => {
                                  const cell = rep.conferences[conf.id];
                                  const score = !cell
                                    ? null
                                    : repScoreView === 'ces'
                                      ? cell.cesScore
                                      : repScoreView === 'cost'
                                        ? cell.costEffScore
                                        : cell.sesScore;
                                  const notAttended = !cell;
                                  return (
                                    <td key={conf.id} className={`p-2 text-center font-semibold tabular-nums ${notAttended ? 'bg-gray-50 text-gray-300' : sesCellClasses(score)}`} style={{ minWidth: 72, width: 72 }}>
                                      {score != null ? score : <span className="font-normal text-xs">—</span>}
                                    </td>
                                  );
                                })}
                                <td className="p-3 sticky right-0 bg-white z-10 group-hover:bg-gray-50 transition-colors border-l border-gray-100 text-right" style={{ minWidth: 96, width: 96 }}>
                                  <div className="font-bold text-base tabular-nums" style={{ color: sesScoreColor(viewAvg) }}>{viewAvg ?? '—'}</div>
                                  {repScoreView === 'ses' && rep.trend && (
                                    <div className={`text-xs ${rep.trend === 'up' ? 'text-emerald-500' : rep.trend === 'down' ? 'text-red-500' : 'text-gray-400'}`}>
                                      {rep.trend === 'up' ? '↑' : rep.trend === 'down' ? '↓' : '→'}
                                    </div>
                                  )}
                                  <div className="text-xs text-gray-400">{rep.minScore}–{rep.maxScore}</div>
                                  {sparse && <div className="text-[10px] text-gray-400">{attendedConfs} of {totalConfs}</div>}
                                </td>
                              </tr>
                              {showComponents && (
                                <tr className="border-b border-gray-50 bg-gray-25">
                                  <td className="px-3 py-1.5 sticky left-0 bg-gray-50 z-10 border-r border-gray-100" style={{ minWidth: 160, width: 160 }}>
                                    <span className="text-xs text-gray-400 italic">Components</span>
                                  </td>
                                  {repDerivedData.conferences.map(conf => {
                                    const cell = rep.conferences[conf.id];
                                    if (!cell) return <td key={conf.id} className="p-2 bg-gray-50 text-center" style={{ minWidth: 72 }}><span className="text-[10px] text-gray-300">—</span></td>;
                                    const c = cell.components;
                                    return (
                                      <td key={conf.id} className="p-1.5 bg-gray-50" style={{ minWidth: 72, width: 72 }}>
                                        <div className="space-y-0.5 text-[10px]">
                                          {([
                                            ['Mtg', c.meeting_execution],
                                            ['FU', c.followup_execution],
                                            ['PI', c.pipeline_influence],
                                            ['Tgt', c.target_account_execution],
                                            ['Prod', c.rep_productivity],
                                          ] as [string, number | null][]).map(([label, val]) => (
                                            <div key={label} className="flex justify-between gap-1">
                                              <span className="text-gray-400">{label}</span>
                                              <span className={`font-medium tabular-nums ${sesCellClasses(val).replace(/bg-\S+ /, '')}`}>{val ?? '—'}</span>
                                            </div>
                                          ))}
                                        </div>
                                      </td>
                                    );
                                  })}
                                  <td className="px-3 py-1.5 sticky right-0 bg-gray-50 z-10 border-l border-gray-100" style={{ minWidth: 96, width: 96 }}>
                                    <div className="space-y-0.5 text-[10px] text-right">
                                      {([
                                        ['Mtg', rep.componentAverages.meeting_execution],
                                        ['FU', rep.componentAverages.followup_execution],
                                        ['PI', rep.componentAverages.pipeline_influence],
                                        ['Tgt', rep.componentAverages.target_account_execution],
                                        ['Prod', rep.componentAverages.rep_productivity],
                                      ] as [string, number | null][]).map(([label, val]) => (
                                        <div key={label} className="flex justify-end gap-1">
                                          <span className="text-gray-400">{label}</span>
                                          <span className={`font-medium tabular-nums ${sesCellClasses(val).replace(/bg-\S+ /, '')}`}>{val ?? '—'}</span>
                                        </div>
                                      ))}
                                    </div>
                                  </td>
                                </tr>
                              )}
                            </React.Fragment>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  {repDerivedData.sorted.length > REP_PAGE_SIZE && (
                    <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
                      <span className="text-xs text-gray-500">Showing {(repPage - 1) * REP_PAGE_SIZE + 1}–{Math.min(repPage * REP_PAGE_SIZE, repDerivedData.sorted.length)} of {repDerivedData.sorted.length} reps</span>
                      <div className="flex gap-2">
                        <button disabled={repPage === 1} onClick={() => setRepPage(p => p - 1)} className="btn-secondary text-xs px-3 py-1 disabled:opacity-40">← Prev</button>
                        <button disabled={repPage * REP_PAGE_SIZE >= repDerivedData.sorted.length} onClick={() => setRepPage(p => p + 1)} className="btn-secondary text-xs px-3 py-1 disabled:opacity-40">Next →</button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Interpretation panel */}
                {repDerivedData.filteredForCards.length >= 2 && (() => {
                  const reps = repDerivedData.filteredForCards;
                  const topPerformers = reps.filter(r => r.avgSES != null && r.avgSES >= 75);
                  const underperformers = reps.filter(r => r.avgSES != null && r.avgSES < 60 && r.confCount >= 2);
                  const highVarianceRep = [...reps].filter(r => r.confCount >= 3).sort((a, b) => b.sd - a.sd)[0];
                  const coachingCandidates = underperformers;
                  const insights: { label: string; color: string; text: string }[] = [];

                  if (topPerformers.length > 0) {
                    const names = topPerformers.map(r => r.repName).join(', ');
                    insights.push({
                      label: 'Top Performers',
                      color: '#059669',
                      text: `${names} maintained Strong or better execution across all conferences this period. Consider using their pre-conference preparation and floor execution approach as the team standard.`,
                    });
                  }

                  if (underperformers.length > 0) {
                    const worst = [...underperformers].sort((a, b) => (a.avgSES ?? 0) - (b.avgSES ?? 0))[0];
                    const weakComp = getLowestComponent(worst.componentAverages);
                    const belowCount = repDerivedData.conferences.filter(c => {
                      const cell = worst.conferences[c.id];
                      return cell?.sesScore != null && cell.sesScore < 60;
                    }).length;
                    insights.push({
                      label: 'Underperformer Flag',
                      color: '#dc2626',
                      text: `${worst.repName} scored below Acceptable at ${belowCount} of ${worst.confCount} conferences — the lowest cross-conference average on the team at ${worst.avgSES}/100. ${weakComp.label} is the primary drag on their score (${weakComp.score}/100).`,
                    });
                  }

                  if (highVarianceRep && highVarianceRep.sd > 15) {
                    insights.push({
                      label: 'Variance Signal',
                      color: '#d97706',
                      text: `${highVarianceRep.repName} shows the highest performance variance this period — ranging from ${highVarianceRep.minScore} to ${highVarianceRep.maxScore} across conferences. This pattern suggests conference-dependent performance rather than a consistent execution issue. Review which conferences drove the highest and lowest scores.`,
                    });
                  }

                  if (coachingCandidates.length > 0) {
                    const count = coachingCandidates.length;
                    insights.push({
                      label: 'Coaching Trigger',
                      color: '#7c3aed',
                      text: `${count} ${count === 1 ? 'rep' : 'reps'} scored below Acceptable on average this period. Open the rep detail view for specific coaching signals by component.`,
                    });
                  }

                  if (insights.length === 0) return null;
                  return (
                    <div className="card">
                      <h2 className="text-base font-semibold text-brand-primary font-serif mb-3">What the data shows</h2>
                      <div className="space-y-3">
                        {insights.map(insight => (
                          <div key={insight.label} className="flex gap-3">
                            <div className="w-1 flex-shrink-0 rounded-full mt-0.5" style={{ backgroundColor: insight.color }} />
                            <div>
                              <span className="text-xs font-semibold uppercase tracking-wide text-gray-400 block mb-0.5">{insight.label}</span>
                              <p className="text-sm text-gray-700">{insight.text}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })()}
              </>
            )}
          </div>
        )}

        {activeTab === 'snapshots' && isAdmin && (() => {
          const closedConferences = snapshotYoY?.instances.filter(i => i.effectiveStage === 'closed') ?? [];

          const handleComputeSnapshot = async (conferenceId: number) => {
            setComputing(conferenceId);
            setSnapshotErrors(prev => { const n = { ...prev }; delete n[conferenceId]; return n; });
            try {
              const res = await fetch(`/api/conferences/${conferenceId}/compute-snapshot`, { method: 'POST' });
              const json = await res.json() as { success: boolean; completenessPercent?: number; snapshotTakenAt?: string; error?: string };
              if (!res.ok || !json.success) throw new Error(json.error ?? `HTTP ${res.status}`);
              setSnapshotOverrides(prev => ({
                ...prev,
                [conferenceId]: {
                  hasSnapshot: true,
                  snapshotTakenAt: json.snapshotTakenAt ?? new Date().toISOString(),
                  completenessPercent: json.completenessPercent ?? 0,
                  justComputed: true,
                },
              }));
              setTimeout(() => {
                setSnapshotOverrides(prev => {
                  const updated = prev[conferenceId];
                  if (!updated) return prev;
                  return { ...prev, [conferenceId]: { ...updated, justComputed: false } };
                });
              }, 3000);
            } catch (err) {
              setSnapshotErrors(prev => ({ ...prev, [conferenceId]: err instanceof Error ? err.message : String(err) }));
            } finally {
              setComputing(null);
            }
          };

          const handleComputeAll = async () => {
            if (!closedConferences.length) return;
            setComputingAll(true);
            setBatchSummary(null);
            setComputeProgress({ done: 0, total: closedConferences.length });
            let done = 0; let failed = 0;
            for (const instance of closedConferences) {
              setComputing(instance.conferenceId);
              try {
                const res = await fetch(`/api/conferences/${instance.conferenceId}/compute-snapshot`, { method: 'POST' });
                const json = await res.json() as { success: boolean; completenessPercent?: number; snapshotTakenAt?: string; error?: string };
                if (!res.ok || !json.success) throw new Error(json.error ?? `HTTP ${res.status}`);
                setSnapshotOverrides(prev => ({
                  ...prev,
                  [instance.conferenceId]: {
                    hasSnapshot: true,
                    snapshotTakenAt: json.snapshotTakenAt ?? new Date().toISOString(),
                    completenessPercent: json.completenessPercent ?? 0,
                    justComputed: true,
                  },
                }));
                setTimeout(() => {
                  setSnapshotOverrides(prev => {
                    const updated = prev[instance.conferenceId];
                    if (!updated) return prev;
                    return { ...prev, [instance.conferenceId]: { ...updated, justComputed: false } };
                  });
                }, 3000);
                done++;
              } catch (err) {
                setSnapshotErrors(prev => ({ ...prev, [instance.conferenceId]: err instanceof Error ? err.message : String(err) }));
                failed++;
              }
              setComputeProgress(prev => ({ ...prev, done: done + failed }));
            }
            setComputing(null);
            setComputingAll(false);
            setBatchSummary({ done, failed });
          };

          return (
            <div>
              {/* Explanation block */}
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 mb-6">
                <div className="flex items-start gap-3">
                  <i className="ti ti-info-circle text-gray-400 text-base flex-shrink-0 mt-0.5" aria-hidden="true" />
                  <div>
                    <p className="text-sm font-medium text-gray-700 mb-1">About conference snapshots</p>
                    <p className="text-sm text-gray-500 leading-relaxed">
                      Snapshots are point-in-time computations stored when a conference closes. They power the
                      Year-over-year analysis and Executive Brief for each series. Snapshots are computed
                      automatically when a conference moves to Closed status. Use this tab to manually compute
                      or recompute snapshots for any closed conference, and to identify conferences with missing
                      snapshot data.
                    </p>
                  </div>
                </div>
              </div>

              {/* Series selector */}
              <div className="flex items-center gap-3 mb-5">
                <label className="text-sm font-medium text-gray-600 flex-shrink-0">Series</label>
                {snapshotSeriesLoading ? (
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 border-2 border-brand-secondary border-t-transparent rounded-full animate-spin" />
                    <span className="text-sm text-gray-400">Loading series...</span>
                  </div>
                ) : (
                  <select
                    value={selectedSeriesId}
                    onChange={e => setSelectedSeriesId(e.target.value)}
                    className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-brand-secondary bg-white"
                  >
                    <option value="">Select a series...</option>
                    {snapshotSeries.map(s => (
                      <option key={s.id} value={s.id}>{s.display_name}</option>
                    ))}
                  </select>
                )}
                {selectedSeriesId && (
                  <button
                    onClick={handleComputeAll}
                    disabled={computingAll || !closedConferences.length}
                    className="ml-auto flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-brand-primary text-white rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {computingAll
                      ? <><i className="ti ti-loader-2 text-xs animate-spin" aria-hidden="true" />Computing... {computeProgress.done} of {computeProgress.total}</>
                      : <><i className="ti ti-refresh text-xs" aria-hidden="true" />Compute all snapshots</>
                    }
                  </button>
                )}
              </div>

              {/* Batch summary */}
              {batchSummary && (
                <div className="mb-4 text-sm text-gray-600">
                  <span className="text-green-700 font-medium">✓ {batchSummary.done} snapshot{batchSummary.done !== 1 ? 's' : ''} computed</span>
                  {batchSummary.failed > 0 && <span className="text-red-600 ml-2">· {batchSummary.failed} failed</span>}
                </div>
              )}

              {/* YoY loading / table placeholder (Section 2 will fill in the table) */}
              {snapshotYoYLoading && (
                <div className="flex items-center gap-2 text-sm text-gray-400 py-8">
                  <div className="w-4 h-4 border-2 border-brand-secondary border-t-transparent rounded-full animate-spin" />
                  Loading conferences...
                </div>
              )}

              {!snapshotYoYLoading && selectedSeriesId && !snapshotYoY && (
                <p className="text-sm text-gray-400 py-4">No data found for this series.</p>
              )}

              {!snapshotYoYLoading && snapshotYoY && snapshotYoY.instances.length === 0 && (
                <p className="text-sm text-gray-400 py-4">No conferences found in this series.</p>
              )}

              {!snapshotYoYLoading && snapshotYoY && snapshotYoY.instances.length > 0 && (() => {
                const SNAPSHOT_FIELDS = [
                  'cesScore', 'costEfficiencyScore', 'totalCost', 'pipelineInfluenced',
                  'pipelineNetNew', 'pipelineContinuedEngagement', 'pipelinePerK',
                  'costPerCompany', 'costPerMeeting', 'icpCompaniesTotal',
                  'icpCompaniesEngaged', 'icpEngagementRate', 'buyingCommitteeCoverageRate',
                  'decisionMakersEngaged', 'meetingHoldRate', 'followupSchedulingRate',
                  'followupCompletionRate', 'avgHealthScoreEngaged', 'returningAttendeeRate',
                  'companies3PlusInstances', 'strategyName', 'sponsorshipLevel',
                  'boothPresent', 'boothWidth', 'boothLength', 'boothNumber', 'boothHall',
                  'budgetTotal', 'actualTotal', 'budgetVariance', 'budgetLineItems',
                  'requiredPipelineMultiple', 'requiredPipelineAmount', 'expectedReturnAmount',
                  'costPerInternalAttendee',
                  'pipelinePerMeeting', 'pipelinePerCompany',
                  'pipelineInfluenceExecutionScore', 'meetingExecutionScore',
                  'followupExecutionScore', 'targetAccountExecutionScore',
                  'repProductivityScore', 'salesEffectivenessScore',
                ] as const;

                function relativeDate(iso: string | null): string {
                  if (!iso) return '—';
                  const d = new Date(iso);
                  const diffDays = Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24));
                  if (diffDays <= 0) return 'Today';
                  if (diffDays === 1) return 'Yesterday';
                  if (diffDays < 30) return `${diffDays} days ago`;
                  if (diffDays < 60) return 'Last month';
                  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
                }

                function stageLabel(s: string | null): { label: string; cls: string } {
                  switch (s) {
                    case 'closed': return { label: 'Closed', cls: 'bg-gray-100 text-gray-600 border border-gray-200' };
                    case 'in_progress': return { label: 'In progress', cls: 'bg-blue-50 text-blue-700 border border-blue-200' };
                    case 'planning': return { label: 'Planning', cls: 'bg-white text-gray-500 border border-gray-200' };
                    case 'post_conference': return { label: 'Post-conference', cls: 'bg-purple-50 text-purple-700 border border-purple-200' };
                    default: return { label: s ?? 'Unknown', cls: 'bg-gray-50 text-gray-500 border border-gray-200' };
                  }
                }

                const instances = [...snapshotYoY.instances].sort((a, b) => a.startDate.localeCompare(b.startDate));

                return (
                  <div className="border border-gray-200 rounded-lg overflow-hidden">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-gray-50 border-b border-gray-200">
                          <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Conference</th>
                          <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                          <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Snapshot</th>
                          <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Snapshot taken</th>
                          <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Data completeness</th>
                          <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {instances.map(instance => {
                          const override = snapshotOverrides[instance.conferenceId];
                          const hasSnapshot = override?.hasSnapshot ?? instance.hasSnapshot;
                          const snapshotTakenAt = override?.snapshotTakenAt ?? instance.snapshotTakenAt;
                          const isClosed = instance.effectiveStage === 'closed';
                          const isComputing = computing === instance.conferenceId;
                          const err = snapshotErrors[instance.conferenceId];
                          const justComputed = override?.justComputed === true;

                          let completeness = 0;
                          if (override) {
                            completeness = override.completenessPercent;
                          } else if (hasSnapshot) {
                            const nonNull = SNAPSHOT_FIELDS.filter(f => instance[f as keyof typeof instance] != null).length;
                            completeness = Math.round((nonNull / SNAPSHOT_FIELDS.length) * 100);
                          }

                          const dateRange = [instance.startDate, instance.endDate].filter(Boolean).join(' – ');
                          const { label: sLabel, cls: sCls } = stageLabel(instance.effectiveStage);

                          return (
                            <tr key={instance.conferenceId} className="hover:bg-gray-50 transition-colors">
                              {/* Conference */}
                              <td className="px-4 py-3">
                                <p className="font-medium text-gray-800">{instance.conferenceName}</p>
                                {dateRange && <p className="text-xs text-gray-400 mt-0.5">{dateRange}</p>}
                              </td>

                              {/* Stage */}
                              <td className="px-4 py-3">
                                <span className={`inline-flex items-center text-xs font-medium rounded-full px-2 py-0.5 ${sCls}`}>
                                  {sLabel}
                                </span>
                              </td>

                              {/* Snapshot badge */}
                              <td className="px-4 py-3">
                                {hasSnapshot ? (
                                  <span className="inline-flex items-center gap-1 text-xs font-medium bg-green-50 text-green-700 border border-green-200 rounded-full px-2 py-0.5">
                                    <i className="ti ti-circle-check text-xs" aria-hidden="true" />Current
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 text-xs font-medium bg-gray-100 text-gray-500 border border-gray-200 rounded-full px-2 py-0.5">
                                    <i className="ti ti-circle-dashed text-xs" aria-hidden="true" />Missing
                                  </span>
                                )}
                              </td>

                              {/* Snapshot taken */}
                              <td className="px-4 py-3 text-xs text-gray-500">
                                {justComputed ? (
                                  <span className="text-green-600 font-medium">✓ Snapshot computed</span>
                                ) : (
                                  relativeDate(snapshotTakenAt)
                                )}
                              </td>

                              {/* Completeness */}
                              <td className="px-4 py-3">
                                {hasSnapshot ? (
                                  <div title={completeness < 40 ? 'Limited data — budget or activity may not be recorded for this conference.' : undefined}>
                                    <div className="flex items-center gap-2">
                                      <div className="w-16 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                        <div
                                          className="h-full rounded-full bg-brand-secondary"
                                          style={{ width: `${completeness}%` }}
                                        />
                                      </div>
                                      <span className="text-xs text-gray-500">{completeness}%</span>
                                    </div>
                                  </div>
                                ) : (
                                  <span className="text-xs text-gray-400">—</span>
                                )}
                              </td>

                              {/* Actions */}
                              <td className="px-4 py-3">
                                {isClosed ? (
                                  <div>
                                    <button
                                      onClick={() => handleComputeSnapshot(instance.conferenceId)}
                                      disabled={isComputing || computingAll}
                                      className="flex items-center gap-1 text-xs font-medium text-brand-secondary hover:underline disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                      {isComputing
                                        ? <><i className="ti ti-loader-2 text-xs animate-spin" aria-hidden="true" />Computing...</>
                                        : hasSnapshot
                                          ? <><i className="ti ti-refresh text-xs" aria-hidden="true" />Recompute</>
                                          : <><i className="ti ti-bolt text-xs" aria-hidden="true" />Compute</>
                                      }
                                    </button>
                                    {err && <p className="text-xs text-red-500 mt-1">{err}</p>}
                                  </div>
                                ) : (
                                  <span className="text-xs text-gray-400">Not yet closed</span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                );
              })()}
            </div>
          );
        })()}

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
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 items-start">
                      <ScoreCard
                        title="Conference Effectiveness Score"
                        score={avgCES}
                        showTier
                        components={[
                          { label: 'ICP & Target Quality (20%)', value: avgNonNull(activeConferences.map((c) => c.ces_components.dim1_icp_target)) },
                          { label: 'Meeting Execution (20%)', value: avgNonNull(activeConferences.map((c) => c.ces_components.dim2_meeting_exec)) },
                          { label: 'Pipeline Influence (30%)', value: avgNonNull(activeConferences.map((c) => c.ces_components.dim3_pipeline_index)) },
                          { label: 'Audience Coverage (5%)', value: avgNonNull(activeConferences.map((c) => c.ces_components.dim4_breadth)) },
                          { label: 'Cost Efficiency (10%)', value: avgNonNull(activeConferences.map((c) => c.ces_components.dim7_cost_efficiency)) },
                          { label: 'Follow-up Execution (10%)', value: avgNonNull(activeConferences.map((c) => c.ces_components.dim5_followup)) },
                        ]}
                      />
                      <ScoreCard
                        title="Sales Effectiveness Score"
                        score={avgSales}
                        showTier
                        components={[
                          { label: 'Meeting Execution', value: avgNonNull(activeConferences.map((c) => c.sales_execution_components.meeting_execution)) },
                          { label: 'Follow-up Execution', value: avgNonNull(activeConferences.map((c) => c.sales_execution_components.followup_execution)) },
                          { label: 'Pipeline Influence', value: avgNonNull(activeConferences.map((c) => c.sales_execution_components.pipeline_influence)) },
                          { label: 'Target Account', value: avgNonNull(activeConferences.map((c) => c.sales_execution_components.target_account)) },
                        ]}
                      />
                      <ScoreCard
                        title="Marketing Coverage Score"
                        score={avgAudience}
                        showTier
                        components={[
                          { label: 'ICP Engagement Rate', value: avgNonNull(activeConferences.map((c) => c.audience_components.icp_engagement)) },
                          { label: 'Target Account Rate', value: avgNonNull(activeConferences.map((c) => c.audience_components.target_account_rate)) },
                        ]}
                      />
                      <ScoreCard
                        title="Cost Efficiency Score"
                        score={avgCostEff}
                        showTier
                        components={[
                          { label: 'Pipeline per $1K Spend', value: avgNonNull(activeConferences.map((c) => c.cost_efficiency_components.pipeline_per_1k)) },
                          { label: 'Cost per Company', value: avgNonNull(activeConferences.map((c) => c.cost_efficiency_components.cost_per_company)) },
                          { label: 'Cost per Meeting', value: avgNonNull(activeConferences.map((c) => c.cost_efficiency_components.cost_per_meeting)) },
                        ]}
                      />
                    </div>
                  );
                })()}

                {/* Summary row — Top Performer + Tracked (1-col combined) | Pipeline (3-col) */}
                {(() => {
                  const totalRequired = activeConferences.reduce((s, c) => s + (c.required_pipeline ?? 0), 0);
                  const pipelinePct = totalRequired > 0 ? Math.min((totalPipeline / totalRequired) * 100, 100) : null;
                  const barColor = pipelinePct != null && pipelinePct >= 100 ? '#059669' : '#d97706';
                  return (
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">

                      {/* Combined Top Performer + Conferences Tracked — 1 col on md+ */}
                      <div className="card md:col-span-1 py-4 flex flex-col gap-0">
                        <div>
                          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">
                            Top Performer
                          </p>
                          {topPerformer ? (
                            <>
                              <p className="font-semibold text-gray-900 text-sm leading-tight line-clamp-2">
                                {topPerformer.conference_name}
                              </p>
                              <p className="text-xs font-medium mt-1" style={{ color: cesScoreColor(topPerformer.ces_score ?? 0) }}>
                                {topPerformer.ces_score}/100 · {cesTierLabel(topPerformer.ces_score ?? 0)}
                              </p>
                            </>
                          ) : (
                            <p className="text-2xl font-bold text-gray-300">—</p>
                          )}
                        </div>

                        <div className="border-t border-gray-100 mt-4 pt-4">
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
                      </div>

                      {/* Total Pipeline Influenced — spans 3 cols on md+ */}
                      <div className="card py-4 md:col-span-3">
                        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">
                          Total Pipeline Influenced
                        </p>
                        <p className="text-3xl font-bold text-brand-primary">
                          {totalPipeline > 0 ? formatCurrencyFull(totalPipeline) : '—'}
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
                              <span className="tabular-nums font-medium">{formatCurrencyFull(totalRequired)}</span>
                            </div>
                            <div className="w-full h-3 rounded-full bg-gray-100 overflow-hidden">
                              <div
                                className="h-full rounded-full transition-all"
                                style={{ width: `${pipelinePct ?? 0}%`, backgroundColor: barColor }}
                              />
                            </div>
                            <p className="text-xs mt-1.5" style={{ color: barColor }}>
                              {totalPipeline > 0 ? formatCurrencyFull(totalPipeline) : '$0'}{' '}
                              <span className="font-semibold">({Math.round(pipelinePct ?? 0)}%)</span>
                            </p>
                          </div>
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
                    <div className="flex flex-col rounded-lg border border-gray-200 overflow-hidden text-xs flex-shrink-0">
                      <button
                        onClick={() => setSortMode('date')}
                        className={`px-3 py-2 transition-colors border-b border-gray-200 ${
                          sortMode === 'date'
                            ? 'bg-brand-secondary text-white font-medium'
                            : 'bg-white text-gray-600 hover:bg-gray-50'
                        }`}
                      >
                        By Date
                      </button>
                      <button
                        onClick={() => setSortMode('score')}
                        className={`px-3 py-2 transition-colors ${
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
                      margin={{
                        top: 10, right: 16, left: 0,
                        bottom: isPortrait
                          ? (manyConferences ? 10 : 8)
                          : (manyConferences ? 70 : 30),
                      }}
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
                        dataKey={isPortrait ? 'conference_id' : 'name'}
                        tick={{ fontSize: isPortrait ? 10 : 11, fill: '#6b7280' }}
                        tickFormatter={isPortrait ? (v: number) => `#${v}` : undefined}
                        angle={(!isPortrait && manyConferences) ? -40 : 0}
                        textAnchor={(!isPortrait && manyConferences) ? 'end' : 'middle'}
                        interval={0}
                        height={isPortrait ? 20 : (manyConferences ? 70 : 30)}
                      />
                      <YAxis
                        domain={[0, 100]}
                        tick={{ fontSize: 11, fill: '#6b7280' }}
                        width={30}
                      />
                      <Tooltip content={<CESTooltip />} cursor={{ fill: 'rgba(0,0,0,0.04)' }} />
                      <Legend content={(props) => (
                        <ChartLegend
                          payload={props.payload as Array<{ value: string; color: string }> | undefined}
                          isPortrait={isPortrait}
                        />
                      )} />
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

      {selectedRep && repDerivedData && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/30" onClick={() => setSelectedRep(null)}>
          <div
            className="h-full w-full max-w-[560px] bg-white p-5 overflow-y-auto"
            style={{ animation: 'slideInFromRight 200ms ease-out' }}
            onClick={e => e.stopPropagation()}
          >
            <style>{`@keyframes slideInFromRight { from { transform: translateX(100%); } to { transform: translateX(0); } }`}</style>
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-xl font-bold text-gray-900">{selectedRep.repName}</h3>
                {selectedRep.role && <p className="text-xs text-gray-500 mt-0.5 capitalize">{selectedRep.role.replace(/_/g, ' ')}</p>}
              </div>
              <button onClick={() => setSelectedRep(null)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">✕</button>
            </div>
            {(() => {
              const stats = repDerivedData.filteredForCards.find(r => r.repId === selectedRep.repId) ?? repDerivedData.sorted.find(r => r.repId === selectedRep.repId);
              if (!stats) return null;
              const avgSES = stats.avgSES;
              const componentAverages = stats.componentAverages;
              const cesComponentAverages = stats.cesComponentAverages;
              const costComponentAverages = stats.costComponentAverages;
              const totalApproxPipeline = stats.totalApproxPipeline ?? 0;
              const totalPipelineGoal = stats.totalPipelineGoal ?? 0;
              const isBelow70 = avgSES != null && avgSES < 70;

              const signals: string[] = [];
              if (componentAverages.meeting_execution != null && componentAverages.meeting_execution < 60)
                signals.push('Meeting hold rate is below acceptable threshold across conferences. Review pre-conference scheduling discipline and same-day confirmation practices.');
              if (componentAverages.followup_execution != null && componentAverages.followup_execution < 60)
                signals.push('Follow-up completion is consistently low. This rep may need a structured post-conference follow-up workflow or accountability check-in.');
              if (componentAverages.target_account_execution != null && componentAverages.target_account_execution < 50)
                signals.push('Target account engagement rate is weak. This rep may not be prioritizing their target list on the floor. Review pre-conference briefing process.');
              if (componentAverages.pipeline_influence != null && componentAverages.pipeline_influence < 50)
                signals.push('Pipeline influence is low relative to meeting activity. Meetings are being held but not converting to pipeline. Review conversation quality and follow-through.');
              if (componentAverages.rep_productivity != null && componentAverages.rep_productivity < 50)
                signals.push('Company engagement breadth is below benchmark. This rep may be spending disproportionate time with a small number of contacts rather than working the full target list.');

              // All conferences this rep attended, sorted chronologically
              const allConfEntries = repDerivedData.conferences
                .map(c => ({ conf: c, cell: selectedRep.conferences[c.id] ?? null }))
                .filter(x => x.cell != null)
                .sort((a, b) => new Date(a.conf.date).getTime() - new Date(b.conf.date).getTime());

              const sesScores = allConfEntries.map(x => x.cell!.sesScore).filter((s): s is number => s != null);
              const bestSES = sesScores.length ? allConfEntries.filter(x => x.cell!.sesScore != null).reduce((b, x) => x.cell!.sesScore! > b.cell!.sesScore! ? x : b) : null;
              const worstSES = sesScores.length ? allConfEntries.filter(x => x.cell!.sesScore != null).reduce((w, x) => x.cell!.sesScore! < w.cell!.sesScore! ? x : w) : null;
              const sd2 = stddev(sesScores);
              const consistencyLabel = sd2 < 8 ? 'High' : sd2 < 15 ? 'Medium' : 'Low';
              const mostCommonTier = (() => {
                const counts: Record<string, number> = {};
                for (const s of sesScores) { const t = sesTierLabel(s); counts[t] = (counts[t] ?? 0) + 1; }
                return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? '—';
              })();

              // Cost efficiency averages
              const costScores = allConfEntries.map(x => x.cell!.costEffScore).filter((s): s is number => s != null);
              const avgCost = costScores.length ? Math.round(costScores.reduce((a, b) => a + b, 0) / costScores.length) : null;
              // CES averages (per-rep)
              const cesScores = allConfEntries.map(x => x.cell!.cesScore).filter((s): s is number => s != null);
              const avgCES = cesScores.length ? Math.round(cesScores.reduce((a, b) => a + b, 0) / cesScores.length) : null;

              // Score to show in header based on drawer view
              const drawerAvg = drawerScoreView === 'ses' ? avgSES : drawerScoreView === 'ces' ? avgCES : avgCost;
              const drawerLabel = drawerScoreView === 'ses' ? 'avg SES' : drawerScoreView === 'ces' ? 'avg Conf. Effectiveness' : 'avg Cost Efficiency';
              const drawerColor = drawerScoreView === 'ces' ? cesScoreColor(drawerAvg ?? 0) : sesScoreColor(drawerAvg);
              const drawerTierLabel = drawerScoreView === 'ces' ? cesTierLabel(drawerAvg ?? 0) : sesTierLabel(drawerAvg);
              const drawerScoreLabel = drawerScoreView === 'ses' ? 'Sales Execution Score' : drawerScoreView === 'ces' ? 'Conference Effectiveness Score' : 'Cost Efficiency Score';

              return (
                <>
                  {/* Drawer score view toggle */}
                  <div className="mt-3 flex rounded-lg border border-gray-200 overflow-hidden text-xs w-fit">
                    {([['ses', 'Sales Exec'], ['ces', 'Conf. Eff.'], ['cost', 'Cost Eff.']] as const).map(([view, label]) => (
                      <button
                        key={view}
                        onClick={() => setDrawerScoreView(view)}
                        className={`px-3 py-1.5 transition-colors ${drawerScoreView === view ? 'bg-brand-secondary text-white font-medium' : 'text-gray-500 hover:text-gray-700'}`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>

                  <div
                    className="mt-3 rounded-xl p-4"
                    style={{ backgroundColor: drawerColor + '15', borderLeft: `4px solid ${drawerColor}` }}
                  >
                    <div className="text-xs font-bold uppercase tracking-wide text-gray-500 mb-2">{drawerScoreLabel}</div>
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="flex items-end gap-1">
                          <div className="text-4xl font-bold leading-tight" style={{ color: drawerColor }}>{drawerAvg ?? '—'}</div>
                          {drawerAvg != null && <div className="text-sm font-normal text-gray-400 mb-0.5">/100</div>}
                        </div>
                        <div className="text-xs font-semibold mt-0.5" style={{ color: drawerColor }}>{drawerTierLabel}</div>
                        <div className="text-xs text-gray-400 mt-1">{drawerLabel} · {stats.confCount} conference{stats.confCount !== 1 ? 's' : ''}</div>
                      </div>
                      {drawerScoreView === 'ses' && stats.trend && (
                        <div className={`text-lg font-bold ${stats.trend === 'up' ? 'text-emerald-500' : stats.trend === 'down' ? 'text-red-500' : 'text-gray-400'}`}>
                          {stats.trend === 'up' ? '↑' : stats.trend === 'down' ? '↓' : '→'}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* All three scores as mini summary row */}
                  <div className="mt-3 flex gap-3">
                    {([
                      ['SES', avgSES, 'Sales Exec'],
                      ['CES', avgCES, 'Conf. Eff.'],
                      ['Cost', avgCost, 'Cost Eff.'],
                    ] as [string, number | null, string][]).map(([abbr, val, title]) => (
                      <div key={abbr} className="flex-1 rounded-lg border border-gray-100 px-3 py-2 text-center">
                        <div className="text-[10px] text-gray-400 uppercase tracking-wide">{title}</div>
                        <div className="text-lg font-bold tabular-nums" style={{ color: sesScoreColor(val) }}>{val ?? '—'}</div>
                        <div className="text-[10px] font-medium" style={{ color: sesScoreColor(val) }}>{sesTierLabel(val)}</div>
                      </div>
                    ))}
                  </div>

                  {/* Pipeline influence bar — rep's total vs proportionate goal */}
                  {totalPipelineGoal > 0 && (
                    <div className="mt-4 rounded-lg border border-gray-100 px-4 py-3">
                      <div className="flex items-center justify-between text-xs mb-1.5">
                        <span className="font-semibold text-gray-600 uppercase tracking-wide text-[10px]">Pipeline Influenced vs Goal</span>
                        <span className="text-gray-400 text-[10px]">Proportionate share of required pipeline</span>
                      </div>
                      <div className="flex items-end justify-between mb-1">
                        <span className="text-xl font-bold tabular-nums" style={{ color: sesScoreColor(totalPipelineGoal > 0 ? Math.min(Math.round((totalApproxPipeline / totalPipelineGoal) * 100), 100) : null) }}>
                          ${totalApproxPipeline >= 1000000
                            ? `${(totalApproxPipeline / 1000000).toFixed(1)}M`
                            : totalApproxPipeline >= 1000
                              ? `${Math.round(totalApproxPipeline / 1000)}K`
                              : Math.round(totalApproxPipeline).toLocaleString()}
                        </span>
                        <span className="text-xs text-gray-400">
                          Goal: ${totalPipelineGoal >= 1000000
                            ? `${(totalPipelineGoal / 1000000).toFixed(1)}M`
                            : totalPipelineGoal >= 1000
                              ? `${Math.round(totalPipelineGoal / 1000)}K`
                              : Math.round(totalPipelineGoal).toLocaleString()}
                        </span>
                      </div>
                      <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
                        {(() => {
                          const pct = totalPipelineGoal > 0 ? Math.min((totalApproxPipeline / totalPipelineGoal) * 100, 100) : 0;
                          const score = Math.round(pct);
                          return <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: sesScoreColor(score) }} />;
                        })()}
                      </div>
                      <div className="mt-1 text-[10px] text-gray-400">
                        {totalPipelineGoal > 0
                          ? `${Math.round((totalApproxPipeline / totalPipelineGoal) * 100)}% of proportionate goal across ${allConfEntries.length} conference${allConfEntries.length !== 1 ? 's' : ''}`
                          : 'No pipeline target set for attended conferences'}
                      </div>
                    </div>
                  )}

                  <div className="mt-5">
                    <h4 className="text-sm font-semibold text-gray-700 uppercase tracking-wide text-xs">Performance Summary</h4>
                    <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">SES Range</div>
                        <div className="font-semibold text-gray-700 mt-0.5">{stats.minScore}–{stats.maxScore}</div>
                      </div>
                      <div>
                        <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Consistency</div>
                        <div className="font-semibold text-gray-700 mt-0.5">{consistencyLabel}</div>
                      </div>
                      <div>
                        <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Best (SES)</div>
                        <div className="font-semibold text-gray-700 mt-0.5 truncate">{bestSES?.conf.name ?? '—'} ({bestSES?.cell?.sesScore ?? '—'})</div>
                      </div>
                      <div>
                        <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Worst (SES)</div>
                        <div className="font-semibold text-gray-700 mt-0.5 truncate">{worstSES?.conf.name ?? '—'} ({worstSES?.cell?.sesScore ?? '—'})</div>
                      </div>
                      <div>
                        <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Most Common Tier</div>
                        <div className="font-semibold text-gray-700 mt-0.5">{mostCommonTier}</div>
                      </div>
                    </div>
                  </div>

                  <div className="mt-5">
                    <h4 className="text-sm font-semibold text-gray-700 uppercase tracking-wide text-xs mb-3">Conference Breakdown</h4>
                    <div className="space-y-3">
                      {allConfEntries.map(({ conf, cell }) => {
                        const activeScore = drawerScoreView === 'ses' ? cell!.sesScore : drawerScoreView === 'ces' ? cell!.cesScore : cell!.costEffScore;
                        const scoreLabel = drawerScoreView === 'ses' ? 'SES' : drawerScoreView === 'ces' ? 'CES' : 'Cost';
                        return (
                          <div key={conf.id} className="border border-gray-100 rounded-lg p-3">
                            <div className="flex items-center justify-between">
                              <div>
                                <p className="font-medium text-gray-800 text-sm">{conf.name}</p>
                                <p className="text-xs text-gray-400">{new Date(conf.date).getUTCFullYear()}</p>
                              </div>
                              <div className="text-right">
                                <div className="text-xl font-bold tabular-nums" style={{ color: sesScoreColor(activeScore) }}>{activeScore ?? '—'}</div>
                                <div className="text-[10px] text-gray-400">{scoreLabel} · {sesTierLabel(activeScore)}</div>
                              </div>
                            </div>
                            <div className="mt-2">
                              <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden">
                                <div className="h-full rounded-full" style={{ width: `${activeScore ?? 0}%`, backgroundColor: sesScoreColor(activeScore) }} />
                              </div>
                            </div>
                            {/* Always show SES components */}
                            <div className="mt-2 grid grid-cols-5 gap-1 text-[10px]">
                              {([
                                ['Mtg', cell!.components.meeting_execution],
                                ['FU', cell!.components.followup_execution],
                                ['PI', cell!.components.pipeline_influence],
                                ['Tgt', cell!.components.target_account_execution],
                                ['Prod', cell!.components.rep_productivity],
                              ] as [string, number | null][]).map(([label, val]) => (
                                <div key={label} className="text-center">
                                  <div className="text-gray-400">{label}</div>
                                  <div className="font-semibold" style={{ color: sesScoreColor(val) }}>{val ?? '—'}</div>
                                </div>
                              ))}
                            </div>
                            {/* Show other scores when not in SES view */}
                            {(cell!.cesScore != null || cell!.costEffScore != null) && (
                              <div className="mt-2 flex gap-3 text-[10px]">
                                {cell!.cesScore != null && <span className="text-gray-400">CES <span className="font-semibold" style={{ color: sesScoreColor(cell!.cesScore) }}>{cell!.cesScore}</span></span>}
                                {cell!.costEffScore != null && <span className="text-gray-400">Cost Eff. <span className="font-semibold" style={{ color: sesScoreColor(cell!.costEffScore) }}>{cell!.costEffScore}</span></span>}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div className="mt-5">
                    <h4 className="text-sm font-semibold text-gray-700 uppercase tracking-wide text-xs mb-2">
                      {drawerScoreView === 'ses' ? 'SES' : drawerScoreView === 'ces' ? 'CES' : 'Cost Eff.'} Component Averages
                    </h4>
                    <div className="space-y-2">
                      {(drawerScoreView === 'ces'
                        ? ([
                            ['Meeting Execution', cesComponentAverages.meeting_execution],
                            ['Audience Coverage', cesComponentAverages.engagement_breadth],
                            ['Follow-up Execution', cesComponentAverages.followup_execution],
                          ] as [string, number | null][])
                        : drawerScoreView === 'cost'
                          ? ([
                              ['Cost per Meeting', costComponentAverages.cpm_score],
                              ['Cost per Company', costComponentAverages.cpc_score],
                            ] as [string, number | null][])
                          : ([
                              ['Meeting Execution', componentAverages.meeting_execution],
                              ['Follow-up Execution', componentAverages.followup_execution],
                              ['Pipeline Influence', componentAverages.pipeline_influence],
                              ['Target Account Execution', componentAverages.target_account_execution],
                              ['Rep Productivity', componentAverages.rep_productivity],
                            ] as [string, number | null][])
                      ).map(([label, val]) => (
                        <div key={label}>
                          <div className="flex justify-between text-xs mb-0.5">
                            <span className="text-gray-500">{label}</span>
                            <span className="font-semibold" style={{ color: sesScoreColor(val) }}>{val ?? '—'}</span>
                          </div>
                          <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden">
                            <div className="h-full rounded-full" style={{ width: `${val ?? 0}%`, backgroundColor: sesScoreColor(val) }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {isBelow70 && (
                    <div className="mt-5">
                      <h4 className="text-sm font-semibold text-gray-700 uppercase tracking-wide text-xs mb-2">Coaching Signals</h4>
                      {signals.length > 0 ? (
                        <ul className="space-y-2">
                          {signals.map((s, i) => (
                            <li key={i} className="flex gap-2 text-sm text-gray-700">
                              <span className="text-amber-500 flex-shrink-0 mt-0.5">•</span>
                              <span>{s}</span>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-sm text-gray-500 italic">No coaching signals — this rep is performing at or above threshold across all components.</p>
                      )}
                    </div>
                  )}
                </>
              );
            })()}
          </div>
        </div>
      )}

      {budgetModalConf && (
        <BudgetVsActualModal
          conferenceId={budgetModalConf.id}
          conferenceName={budgetModalConf.name}
          onClose={() => setBudgetModalConf(null)}
          onSaved={(budgetData) => {
            const id = budgetModalConf.id;
            setCalendarStore({
              rows: _calendarStore.rows.map(r =>
                r.conferenceId === id
                  ? { ...r, diagnostics: { ...r.diagnostics, budget: budgetData as CalendarConferenceRow['diagnostics'] extends { budget?: infer B } ? NonNullable<B> : never } }
                  : r
              ),
            });
            setBudgetModalConf(null);
            void refreshConferenceScore(id);
          }}
        />
      )}
    </div>
  );
}
