'use client';

import React, { useState } from 'react';
import type { EffectivenessData } from '../ConferenceEffectivenessModal';
import { StrategyWeightNotice } from './StrategyWeightNotice';
import { ConferenceRankingsModal } from './ConferenceRankingsModal';

// ── Formatters ────────────────────────────────────────────────────────────────

function fmt$(n: unknown) {
  const v = n == null ? null : Number(n);
  if (v == null || isNaN(v)) return '—';
  return '$' + Math.round(v).toLocaleString();
}

function fmtNum(n: unknown) {
  const v = n == null ? null : Number(n);
  if (v == null || isNaN(v)) return '—';
  return Math.round(v).toLocaleString();
}

// ── Color helpers ─────────────────────────────────────────────────────────────

// CES card color (3-band) — matches ConferenceEffectivenessModal.scoreColor
function cesCardColor(score: number | null | undefined): string {
  if (score == null) return '#9ca3af';
  return score >= 70 ? '#059669' : score >= 40 ? '#d97706' : '#dc2626';
}

// Component sub-score color (5-band) — existing system kept for breakdown rows
function subScoreColor(score: number | null | undefined): string {
  if (score == null) return '#9ca3af';
  if (score >= 90) return '#059669';
  if (score >= 75) return '#1B76BC';
  if (score >= 60) return '#d97706';
  if (score >= 50) return '#f97316';
  return '#dc2626';
}

// Tier label color (≥75 green, ≥50 amber, <50 red) for rep table sub-scores
function repTierColor(score: number | null | undefined): string {
  if (score == null) return '#9ca3af';
  return score >= 75 ? '#059669' : score >= 50 ? '#d97706' : '#dc2626';
}

// ── Rep color palette ─────────────────────────────────────────────────────────
const REP_COLORS = [
  '#1B76BC', '#059669', '#8b5cf6', '#f97316', '#0891b2',
  '#d97706', '#14b8a6', '#dc2626', '#7c3aed', '#0d9488',
];

// ── Budget category keyword matcher ───────────────────────────────────────────

const BUDGET_CATEGORIES = [
  {
    key: 'booth',
    label: 'Booth / exhibit space',
    color: '#185FA5',
    keywords: ['booth', 'exhibit', 'space', 'floor', 'stand', 'display'],
  },
  {
    key: 'travel',
    label: 'Travel & accommodation',
    color: '#534AB7',
    keywords: ['travel', 'hotel', 'accommodation', 'flight', 'lodging', 'airfare', 'transport', 'uber', 'lyft'],
  },
  {
    key: 'sponsor',
    label: 'Sponsorships & events',
    color: '#EF9F27',
    keywords: ['sponsor', 'event', 'social', 'hospitality', 'dinner', 'reception', 'party', 'happy hour'],
  },
  {
    key: 'marketing',
    label: 'Marketing materials',
    color: '#1D9E75',
    keywords: ['marketing', 'material', 'print', 'collateral', 'swag', 'merch', 'branded', 'banner', 'brochure', 'giveaway'],
  },
];

interface BudgetCategory {
  key: string;
  label: string;
  color: string;
  effective: number;
  budget: number;
  actual: number;
}

interface BudgetBreakdown {
  categories: BudgetCategory[];
  totalBudget: number;
  totalActual: number;
  totalEffective: number;
}

function categorizeBudget(lineItems: Record<string, unknown>[]): BudgetBreakdown {
  const cats: Record<string, BudgetCategory> = {};
  for (const c of BUDGET_CATEGORIES) {
    cats[c.key] = { key: c.key, label: c.label, color: c.color, effective: 0, budget: 0, actual: 0 };
  }
  cats['other'] = { key: 'other', label: 'Other', color: '#888780', effective: 0, budget: 0, actual: 0 };

  let totalBudget = 0;
  let totalActual = 0;
  let totalEffective = 0;

  for (const item of lineItems) {
    const label = String(item.label ?? '').toLowerCase();
    const effective = Number(item.effective ?? 0);
    const budget = Number(item.budget ?? 0);
    const actual = Number(item.actual ?? 0);
    totalBudget += budget;
    totalActual += actual;
    totalEffective += effective;

    let matched = false;
    for (const cat of BUDGET_CATEGORIES) {
      if (cat.keywords.some(kw => label.includes(kw))) {
        cats[cat.key].effective += effective;
        cats[cat.key].budget += budget;
        cats[cat.key].actual += actual;
        matched = true;
        break;
      }
    }
    if (!matched) {
      cats['other'].effective += effective;
      cats['other'].budget += budget;
      cats['other'].actual += actual;
    }
  }

  const categories = [...BUDGET_CATEGORIES.map(c => cats[c.key]), cats['other']].filter(c => c.effective > 0 || c.budget > 0);
  return { categories, totalBudget, totalActual, totalEffective };
}

// ── Rep metric cell ───────────────────────────────────────────────────────────

function RepMetricCell({ value, score, tier }: { value: unknown; score: unknown; tier: unknown }) {
  const v = value == null ? null : Number(value);
  const s = score == null ? null : Number(score);
  const t = tier == null ? '' : String(tier);
  if (v == null || isNaN(v)) return <span className="text-gray-300">—</span>;
  return (
    <span className="font-medium text-gray-700">
      {fmt$(v)}
      {s != null && (
        <span className="ml-1 text-xs font-normal">
          <span className="font-semibold" style={{ color: repTierColor(s) }}>{s}</span>
          {t && <span className="text-gray-400"> · {t}</span>}
        </span>
      )}
    </span>
  );
}

// ── Scatter plot ──────────────────────────────────────────────────────────────

function ScatterPlot({
  reps,
  repColors,
}: {
  reps: Array<{ name: string; initials: string; meetings: number; pipeline: number; color: string }>;
  repColors: Record<string, string>;
}) {
  const maxMeetings = Math.max(...reps.map(r => r.meetings), 1);
  const maxPipeline = Math.max(...reps.map(r => r.pipeline), 1);

  const PAD_L = 48; const PAD_R = 16; const PAD_T = 16; const PAD_B = 36;
  const W = 600; const H = 200;
  const plotW = W - PAD_L - PAD_R;
  const plotH = H - PAD_T - PAD_B;

  function cx(meetings: number) { return PAD_L + (meetings / maxMeetings) * plotW; }
  function cy(pipeline: number) { return PAD_T + plotH - (pipeline / maxPipeline) * plotH; }

  const midX = cx(maxMeetings / 2);
  const midY = cy(maxPipeline / 2);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 200 }}>
      {/* Quadrant lines */}
      <line x1={midX} y1={PAD_T} x2={midX} y2={PAD_T + plotH} stroke="#9ca3af" strokeWidth={1} strokeDasharray="4 4" />
      <line x1={PAD_L} y1={midY} x2={PAD_L + plotW} y2={midY} stroke="#9ca3af" strokeWidth={1} strokeDasharray="4 4" />

      {/* Quadrant labels */}
      <text x={midX + 4} y={PAD_T + 10} fontSize={7} fill="#6b7280" fontFamily="sans-serif">High activity · High pipeline</text>
      <text x={PAD_L + 4} y={PAD_T + 10} fontSize={7} fill="#6b7280" fontFamily="sans-serif">Low activity · High pipeline</text>
      <text x={midX + 4} y={PAD_T + plotH - 4} fontSize={7} fill="#6b7280" fontFamily="sans-serif">High activity · Low pipeline</text>
      <text x={PAD_L + 4} y={PAD_T + plotH - 4} fontSize={7} fill="#6b7280" fontFamily="sans-serif">Low activity · Low pipeline</text>

      {/* Axes */}
      <line x1={PAD_L} y1={PAD_T} x2={PAD_L} y2={PAD_T + plotH} stroke="#9ca3af" strokeWidth={1} />
      <line x1={PAD_L} y1={PAD_T + plotH} x2={PAD_L + plotW} y2={PAD_T + plotH} stroke="#9ca3af" strokeWidth={1} />

      {/* Axis labels */}
      <text x={PAD_L - 4} y={H - 2} fontSize={8} fill="#4b5563" textAnchor="middle" fontFamily="sans-serif">Meetings held</text>
      <text x={8} y={H / 2} fontSize={8} fill="#4b5563" textAnchor="middle" fontFamily="sans-serif"
        transform={`rotate(-90, 8, ${H / 2})`}>Pipeline ($)</text>

      {/* Y-axis tick */}
      <text x={PAD_L - 4} y={PAD_T + 4} fontSize={7} fill="#6b7280" textAnchor="end" fontFamily="sans-serif">
        ${Math.round(maxPipeline / 1000)}k
      </text>

      {/* Rep dots */}
      {reps.map(rep => {
        const x = cx(rep.meetings);
        const y = cy(rep.pipeline);
        const color = repColors[rep.name] ?? '#1B76BC';
        return (
          <g key={rep.name}>
            <circle cx={x} cy={y} r={14} fill={color} opacity={0.9} />
            <text x={x} y={y + 4} fontSize={8} fill="white" textAnchor="middle" fontWeight="bold" fontFamily="sans-serif">
              {rep.initials}
            </text>
            <title>{rep.name}: {rep.meetings} meetings · ${Math.round(rep.pipeline / 1000)}k pipeline</title>
          </g>
        );
      })}
    </svg>
  );
}

// ── Benchmark KPI tile ────────────────────────────────────────────────────────

function BenchmarkTile({
  label,
  value,
  secondaryText,
  benchmarkMin,
  benchmarkMax,
  lowerIsBetter = true,
}: {
  label: string;
  value: number | null;
  secondaryText: string;
  benchmarkMin?: number;
  benchmarkMax?: number;
  lowerIsBetter?: boolean;
}) {
  const numericFmt = value == null ? '—' : fmt$(value);

  let benchmarkStatus: 'good' | 'bad' | 'neutral' = 'neutral';
  let benchmarkLabel = '';

  if (value != null && benchmarkMin != null && benchmarkMax != null) {
    if (lowerIsBetter) {
      if (value <= benchmarkMin) { benchmarkStatus = 'good'; benchmarkLabel = 'Below benchmark'; }
      else if (value <= benchmarkMax) { benchmarkStatus = 'neutral'; benchmarkLabel = 'Within range'; }
      else { benchmarkStatus = 'bad'; benchmarkLabel = 'Above benchmark'; }
    } else {
      if (value >= benchmarkMax) { benchmarkStatus = 'good'; benchmarkLabel = 'Above benchmark'; }
      else if (value >= benchmarkMin) { benchmarkStatus = 'neutral'; benchmarkLabel = 'Within range'; }
      else { benchmarkStatus = 'bad'; benchmarkLabel = 'Below benchmark'; }
    }
  }

  const statusColor = benchmarkStatus === 'good' ? '#059669' : benchmarkStatus === 'bad' ? '#dc2626' : '#9ca3af';
  const valueColor = !lowerIsBetter && benchmarkStatus === 'good' ? '#059669' : '#1B76BC';

  return (
    <div className="rounded-lg bg-gray-50 p-3">
      <div className="text-xs text-gray-500 mb-1">{label}</div>
      <div className="text-lg font-bold" style={{ color: valueColor }}>{numericFmt}</div>
      <div className="text-xs text-gray-400 mt-0.5">{secondaryText}</div>
      {benchmarkLabel && (
        <div className="text-xs font-medium mt-1" style={{ color: statusColor }}>{benchmarkLabel}</div>
      )}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export function OperationalROITab({ data }: { data: EffectivenessData }) {
  const { operational } = data;
  const strategyLabel = (data as any).conference_strategy?.display_name || 'Not set';
  const costs = operational.cost_efficiency as Record<string, unknown>;
  const repRows = (operational.rep_cost_efficiency ?? []) as Record<string, unknown>[];
  const repAllocatedCost = Number(operational.rep_allocated_cost ?? 0);
  const currentConferenceId = Number((data as any).conference?.id ?? 0);
  const lineItems = (operational.line_items ?? []) as Record<string, unknown>[];

  const cesScore = Number(costs.cost_efficiency_score ?? 0);
  const cardColor = cesCardColor(cesScore);
  const [rank] = useState<number | null>((operational as any)?.conf_efficiency_rank ?? null);
  const [total] = useState<number | null>((operational as any)?.conf_efficiency_total ?? null);
  const [showRankings, setShowRankings] = useState(false);

  const rawScore = Number(costs.cost_efficiency_score_raw ?? cesScore);
  const modifier = Number(costs.cost_efficiency_modifier ?? 0);
  const eventType = String(costs.event_type ?? 'other');
  const modifierReason = String(costs.cost_efficiency_modifier_reason ?? '');
  const companyScore = costs.company_engaged_score != null ? Number(costs.company_engaged_score) : null;
  const companyTier = String(costs.company_engaged_tier ?? '');
  const meetingScore = costs.meeting_held_score != null ? Number(costs.meeting_held_score) : null;
  const meetingTier = String(costs.meeting_held_tier ?? '');
  const pipelineScore = costs.pipeline_influence_score != null ? Number(costs.pipeline_influence_score) : null;
  const pipelineTier = String(costs.pipeline_influence_tier ?? '');
  const confidence = String(costs.calculation_confidence ?? 'full');
  const totalSpend = Number(costs.total_spend ?? 0);

  // Pipeline multiple (client-side)
  const totalPI = Number((data.pipeline as any)?.total_pipeline_influence ?? 0);
  const pipelineMultiple = totalSpend > 0 && totalPI > 0 ? totalPI / totalSpend : null;

  // Net-new counts from marketing_audience
  const netNewCompaniesTotal = Number((data as any).marketing_audience?.net_new_companies?.total ?? 0);
  const netNewContactsTotal = Number((data as any).marketing_audience?.net_new_contacts?.total ?? 0);

  // Follow-ups completed from sales_execution
  const followupsCompleted = Number((data as any).sales_execution?.followup_summary?.completed_followups ?? 0);

  // Derived KPI metrics
  const costPerNetNewCompany = totalSpend > 0 && netNewCompaniesTotal > 0 ? Math.round(totalSpend / netNewCompaniesTotal) : null;
  const costPerNetNewContact = totalSpend > 0 && netNewContactsTotal > 0 ? Math.round(totalSpend / netNewContactsTotal) : null;
  const costPerCompletedFollowup = totalSpend > 0 && followupsCompleted > 0 ? Math.round(totalSpend / followupsCompleted) : null;
  const costPerIcp = costs.cost_per_icp_interaction != null ? Number(costs.cost_per_icp_interaction) : null;
  const costPerMeeting = costs.cost_per_meeting_held != null ? Number(costs.cost_per_meeting_held) : null;
  const pipelinePer1k = costs.pipeline_influence_per_1k_spent != null ? Number(costs.pipeline_influence_per_1k_spent) : null;

  // Budget breakdown
  const budget = lineItems.length > 0 ? categorizeBudget(lineItems) : null;
  const budgetVariance = budget ? budget.totalBudget - budget.totalActual : 0;

  // Rep colors (stable per-rep)
  const repNames = repRows.map(r => String(r.rep ?? ''));
  const repColorMap: Record<string, string> = {};
  repNames.forEach((name, i) => { repColorMap[name] = REP_COLORS[i % REP_COLORS.length]; });

  // Rep scatter data
  const scatterReps = repRows
    .filter(r => Number(r.meetings_held_by_rep ?? 0) > 0 || Number(r.rep_pipeline_influenced_amount ?? 0) > 0)
    .map(r => {
      const name = String(r.rep ?? '');
      const initials = name.split(' ').map(w => w[0] ?? '').join('').toUpperCase().slice(0, 2);
      return {
        name,
        initials,
        meetings: Number(r.meetings_held_by_rep ?? 0),
        pipeline: Number(r.rep_pipeline_influenced_amount ?? 0),
        color: repColorMap[name],
      };
    });

  return (
    <div className="p-6 space-y-6">

      {/* ── Top row: 4 columns ─────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', gap: '12px' }}>

        {/* Col 1: Cost Efficiency Score card */}
        <div className="rounded-xl p-4" style={{ backgroundColor: cardColor + '15', borderLeft: `4px solid ${cardColor}` }}>
          <div className="flex items-start justify-between mb-1">
            <div className="text-xs font-bold uppercase tracking-wide text-gray-500">Cost Efficiency Score</div>
            <div className="text-[11px] text-gray-400 text-right">Conference Strategy: {strategyLabel}</div>
          </div>
          <div className="flex items-end gap-1 mb-0.5">
            <div className="text-4xl font-bold" style={{ color: cardColor }}>{cesScore}</div>
            <div className="text-sm text-gray-400 mb-0.5">/100</div>
          </div>
          <div className="text-xs font-semibold mb-2" style={{ color: cardColor }}>
            {String(costs.cost_efficiency_interpretation ?? costs.cost_efficiency_tier ?? '—')}
          </div>
          <StrategyWeightNotice applied={(data as any).operational?.cost_efficiency?.strategy_modifier_applied} strategyLabel={strategyLabel} />

          <div className="mt-3 pt-3 space-y-1.5" style={{ borderTop: `1px solid ${cardColor}40` }}>
            {pipelineScore != null && (
              <div className="flex justify-between text-xs">
                <span className="text-gray-500">Pipeline Influence per $1k <span className="text-gray-300">(50%)</span></span>
                <span className="font-semibold" style={{ color: subScoreColor(pipelineScore) }}>{pipelineScore} <span className="text-gray-400">· {pipelineTier}</span></span>
              </div>
            )}
            {companyScore != null && (
              <div className="flex justify-between text-xs">
                <span className="text-gray-500">Cost per Company <span className="text-gray-300">(30%)</span></span>
                <span className="font-semibold" style={{ color: subScoreColor(companyScore) }}>{companyScore} <span className="text-gray-400">· {companyTier}</span></span>
              </div>
            )}
            {meetingScore != null && (
              <div className="flex justify-between text-xs">
                <span className="text-gray-500">Cost per Meeting <span className="text-gray-300">(20%)</span></span>
                <span className="font-semibold" style={{ color: subScoreColor(meetingScore) }}>{meetingScore} <span className="text-gray-400">· {meetingTier}</span></span>
              </div>
            )}
          </div>
          {modifier !== 0 && (
            <div className="mt-2 pt-2 text-xs text-gray-400" style={{ borderTop: `1px solid ${cardColor}20` }}>
              Raw: {rawScore} · Modifier: {modifier > 0 ? '+' : ''}{modifier} · {eventType.replace(/_/g, ' ')}
              {modifierReason && <span className="block text-gray-400">{modifierReason}</span>}
            </div>
          )}
          {confidence !== 'full' && (
            <div className="mt-1 text-xs text-amber-600">⚠ Partial data ({confidence} confidence)</div>
          )}
        </div>

        {/* Col 2: Efficiency Rank */}
        <button
          type="button"
          onClick={() => setShowRankings(true)}
          className="rounded-xl border border-gray-200 bg-gray-50 p-4 flex flex-col items-center justify-center text-center hover:border-brand-secondary hover:bg-blue-50 transition-colors group"
          title="View full rankings"
        >
          <div className="text-xs text-gray-500 font-medium mb-1 group-hover:text-brand-secondary transition-colors">Efficiency Rank</div>
          {rank
            ? <><div className="text-3xl font-bold text-brand-secondary leading-tight">#{rank}</div><div className="text-xs text-gray-400 mt-0.5">of {total} conferences</div></>
            : <><div className="text-sm font-semibold text-gray-500">Not ranked</div><div className="text-xs text-gray-400 leading-tight">Needs 2+ conferences</div></>
          }
          <div className="text-xs text-gray-400 mt-2 group-hover:text-brand-secondary transition-colors">View all →</div>
        </button>

        {/* Col 3: Pipeline Multiple */}
        <div className="rounded-xl p-3" style={{ border: '1.5px solid #1D9E75', background: '#E1F5EE' }}>
          <div className="text-xs font-semibold mb-1" style={{ color: '#1D9E75' }}>Pipeline multiple</div>
          <div className="text-3xl font-bold" style={{ color: '#1D9E75' }}>
            {pipelineMultiple != null ? `${pipelineMultiple.toFixed(1)}×` : '—'}
          </div>
          <div className="text-xs text-gray-500 mt-0.5">return on conference spend</div>
          {totalSpend > 0 && (
            <div className="mt-2 pt-2 text-xs text-gray-500 space-y-0.5" style={{ borderTop: '1px solid #A7F3D0' }}>
              <div>{fmt$(totalPI)} influenced ÷</div>
              <div>{fmt$(totalSpend)} total spend</div>
            </div>
          )}
        </div>

        {/* Col 4: Budget Breakdown */}
        <div className="rounded-xl border border-gray-200 bg-white p-3">
          <div className="text-xs font-bold uppercase tracking-wide text-gray-400 mb-2">Budget breakdown</div>
          {!budget || budget.categories.length === 0 ? (
            <div className="text-xs text-gray-400 italic leading-relaxed">
              No budget data entered. Add budget details in the Budget vs. Actual tab.
            </div>
          ) : (
            <>
              <div className="text-xs font-semibold text-gray-700 text-right mb-2">
                Total: {fmt$(budget.totalEffective)}
              </div>
              <div className="space-y-1.5 mb-3">
                {budget.categories.map(cat => {
                  const pct = budget.totalEffective > 0 ? (cat.effective / budget.totalEffective) * 100 : 0;
                  return (
                    <div key={cat.key}>
                      <div className="flex justify-between text-xs mb-0.5">
                        <span className="text-gray-600 truncate">{cat.label}</span>
                        <span className="text-gray-500 ml-1 flex-shrink-0">{fmt$(cat.effective)} · {Math.round(pct)}%</span>
                      </div>
                      <div className="w-full bg-gray-100 rounded-full h-1.5 overflow-hidden">
                        <div className="h-1.5 rounded-full" style={{ width: `${pct}%`, backgroundColor: cat.color }} />
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="pt-2 space-y-0.5" style={{ borderTop: '1px solid #f3f4f6' }}>
                <div className="flex justify-between text-xs">
                  <span className="text-gray-400">Budgeted</span>
                  <span className="text-gray-600">{fmt$(budget.totalBudget)}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-gray-400">Actual</span>
                  <span className="text-gray-600">{budget.totalActual > 0 ? fmt$(budget.totalActual) : '—'}</span>
                </div>
                {budget.totalActual > 0 && (
                  <div className="flex justify-between text-xs">
                    <span className="text-gray-400">Variance</span>
                    <span className="font-semibold" style={{ color: budgetVariance >= 0 ? '#059669' : '#dc2626' }}>
                      {budgetVariance >= 0 ? '+' : ''}{fmt$(Math.abs(budgetVariance))} {budgetVariance >= 0 ? 'under' : 'over'}
                    </span>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── KPI tiles — 2 rows of 3 ──────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        <BenchmarkTile
          label="Cost per ICP company engaged"
          value={costPerIcp}
          secondaryText="Benchmark: $800–$1,200"
          benchmarkMin={800}
          benchmarkMax={1200}
          lowerIsBetter={true}
        />
        <BenchmarkTile
          label="Cost per meeting held"
          value={costPerMeeting}
          secondaryText="Benchmark: $1,500–$2,000"
          benchmarkMin={1500}
          benchmarkMax={2000}
          lowerIsBetter={true}
        />
        <BenchmarkTile
          label="Pipeline per $1k spent"
          value={pipelinePer1k}
          secondaryText="Benchmark: $5,000–$8,000"
          benchmarkMin={5000}
          benchmarkMax={8000}
          lowerIsBetter={false}
        />
        <BenchmarkTile
          label="Cost per net-new company"
          value={costPerNetNewCompany}
          secondaryText={netNewCompaniesTotal > 0 ? `${fmtNum(netNewCompaniesTotal)} net-new companies engaged` : 'No net-new companies'}
        />
        <BenchmarkTile
          label="Cost per net-new contact"
          value={costPerNetNewContact}
          secondaryText={netNewContactsTotal > 0 ? `${fmtNum(netNewContactsTotal)} net-new contacts engaged` : 'No net-new contacts'}
        />
        <BenchmarkTile
          label="Cost per completed follow-up"
          value={costPerCompletedFollowup}
          secondaryText={followupsCompleted > 0 ? `${fmtNum(followupsCompleted)} completed tasks` : 'No completed follow-ups'}
        />
      </div>

      {/* ── Rep efficiency — 5-col grid ──────────────────────────────────── */}
      {repRows.length === 0 ? (
        <div className="rounded-xl border border-gray-100 bg-white p-4">
          <p className="text-xs text-gray-400 italic">No rep engagement data yet.</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '12px' }}>

          {/* Table card — spans 3 columns */}
          <div className="rounded-xl border border-gray-100 bg-white overflow-hidden" style={{ gridColumn: 'span 3' }}>
            <div className="px-4 pt-4 pb-2 flex items-center justify-between">
              <div>
                <div className="text-sm font-semibold text-brand-primary uppercase tracking-wide">Rep efficiency</div>
                <div className="text-xs text-gray-400 mt-0.5">Activity vs pipeline influenced</div>
              </div>
              {repAllocatedCost > 0 && (
                <span className="text-xs text-gray-400 flex-shrink-0 ml-4">
                  Allocated cost/rep: <span className="font-semibold text-gray-600">{fmt$(repAllocatedCost)}</span>
                </span>
              )}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-gray-50 border-t border-gray-100">
                    <th className="text-left px-4 py-2 font-semibold text-gray-500 whitespace-nowrap">Rep</th>
                    <th className="text-right px-3 py-2 font-semibold text-gray-500 whitespace-nowrap">Pipeline / $1k</th>
                    <th className="text-right px-3 py-2 font-semibold text-gray-500 whitespace-nowrap">Cost / Company</th>
                    <th className="text-right px-3 py-2 font-semibold text-gray-500 whitespace-nowrap">Cost / Meeting</th>
                    <th className="text-right px-3 py-2 font-semibold text-gray-500 whitespace-nowrap">Cost / Net-new Co.</th>
                    <th className="text-right px-3 py-2 font-semibold text-gray-500 whitespace-nowrap">Score</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {repRows.map((r, i) => {
                    const repName = String(r.rep ?? '—');
                    const color = repColorMap[repName] ?? '#9ca3af';
                    const overallScore = r.rep_cost_efficiency_score_raw != null ? Number(r.rep_cost_efficiency_score_raw) : null;
                    const repNetNewCostVal = r.rep_cost_per_net_new_company != null ? Number(r.rep_cost_per_net_new_company) : null;
                    return (
                      <tr key={i} className="hover:bg-gray-50">
                        <td className="px-4 py-2 whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
                            <span className="font-medium text-gray-800">{repName}</span>
                          </div>
                        </td>
                        <td className="px-3 py-2 text-right whitespace-nowrap">
                          <RepMetricCell value={r.rep_pipeline_influence_per_1000} score={r.rep_pipeline_score} tier={r.rep_pipeline_score_tier} />
                        </td>
                        <td className="px-3 py-2 text-right whitespace-nowrap">
                          <RepMetricCell value={r.rep_cost_per_company_engaged} score={r.rep_company_score} tier={r.rep_company_score_tier} />
                        </td>
                        <td className="px-3 py-2 text-right whitespace-nowrap">
                          <RepMetricCell value={r.rep_cost_per_meeting_held} score={r.rep_meeting_score} tier={r.rep_meeting_score_tier} />
                        </td>
                        <td className="px-3 py-2 text-right whitespace-nowrap font-medium text-gray-700">
                          {repNetNewCostVal != null ? fmt$(repNetNewCostVal) : <span className="text-gray-300">—</span>}
                        </td>
                        <td className="px-3 py-2 text-right whitespace-nowrap">
                          {overallScore != null ? (
                            <span className="font-bold" style={{ color: repTierColor(overallScore) }}>
                              {overallScore}
                              <span className="text-xs font-normal text-gray-400 ml-1">· {String(r.rep_cost_efficiency_tier ?? '')}</span>
                            </span>
                          ) : <span className="text-gray-300">—</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Scatter plot card — spans 2 columns */}
          <div className="rounded-xl border border-gray-100 bg-white p-4 flex flex-col" style={{ gridColumn: 'span 2' }}>
            <div className="text-sm font-semibold text-brand-primary uppercase tracking-wide mb-0.5">Activity vs Pipeline</div>
            <div className="text-xs text-gray-400 mb-3">Reps in top right are most efficient</div>
            {scatterReps.length > 0 ? (
              <div className="flex-1 flex items-center">
                <ScatterPlot reps={scatterReps} repColors={repColorMap} />
              </div>
            ) : (
              <p className="text-xs text-gray-400 italic">Not enough data to plot.</p>
            )}
          </div>

        </div>
      )}

      {showRankings && (
        <ConferenceRankingsModal
          title="Cost Efficiency Rankings"
          currentConferenceId={currentConferenceId}
          metric="cost_efficiency"
          onClose={() => setShowRankings(false)}
        />
      )}
    </div>
  );
}
