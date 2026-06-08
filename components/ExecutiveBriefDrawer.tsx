'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import type { SeriesYoYData, ConferenceYoYRow } from '@/lib/get-series-yoy-data';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ConferenceSnapshot {
  id: number;
  conference_id: number;
  snapshot_taken_at: string;
  ces_score: number | null;
  cost_efficiency_score: number | null;
  total_cost: number | null;
  pipeline_influenced: number | null;
  pipeline_net_new: number | null;
  pipeline_continued_engagement: number | null;
  pipeline_per_1k: number | null;
  cost_per_company_engaged: number | null;
  cost_per_meeting_held: number | null;
  icp_companies_total: number | null;
  icp_companies_engaged: number | null;
  icp_engagement_rate: number | null;
  buying_committee_coverage_rate: number | null;
  decision_makers_engaged: number | null;
  meeting_hold_rate: number | null;
  followup_scheduling_rate: number | null;
  followup_completion_rate: number | null;
  avg_health_score_engaged: number | null;
  returning_attendee_rate: number | null;
  companies_3plus_instances: number | null;
  strategy_name: string | null;
  sponsorship_level: string | null;
  booth_present: number | null;
  booth_width: number | null;
  booth_length: number | null;
  booth_number: string | null;
  booth_hall: string | null;
  budget_total: number | null;
  actual_total: number | null;
  budget_variance: number | null;
  budget_line_items: string | null;
  required_pipeline_multiple: number | null;
  required_pipeline_amount: number | null;
  expected_return_amount: number | null;
}

interface ConferenceSummary {
  id: number;
  name: string;
  start_date: string;
  end_date: string;
  location: string;
  sponsorship_level?: string | null;
  booth_present?: number | boolean | null;
  booth_width?: number | null;
  booth_length?: number | null;
  booth_number?: string | null;
  booth_hall?: string | null;
  conference_strategy_type_display_name?: string | null;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  conference: ConferenceSummary;
  seriesYoY: SeriesYoYData | null;
  snapshot: ConferenceSnapshot | null;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmt$(n: number | null | undefined): string {
  if (n == null) return '—';
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${Math.round(n / 1_000)}K`;
  return `$${Math.round(n).toLocaleString()}`;
}

function fmtPct(n: number | null | undefined): string {
  if (n == null) return '—';
  return `${Math.round(n)}%`;
}

function fmtNum(n: number | null | undefined): string {
  if (n == null) return '—';
  return n.toLocaleString();
}

function scoreColor(score: number | null): string {
  if (score == null) return 'text-gray-400';
  if (score >= 80) return 'text-emerald-600';
  if (score >= 60) return 'text-amber-600';
  return 'text-red-500';
}

function scoreBg(score: number | null): string {
  if (score == null) return 'bg-gray-100';
  if (score >= 80) return 'bg-emerald-50 border-emerald-200';
  if (score >= 60) return 'bg-amber-50 border-amber-200';
  return 'bg-red-50 border-red-200';
}

function scoreLabel(score: number | null): string {
  if (score == null) return 'No data';
  if (score >= 80) return 'Strong';
  if (score >= 60) return 'Moderate';
  if (score >= 40) return 'Below average';
  return 'Weak';
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return iso;
  }
}

function parseBudgetLineItems(raw: string | null | undefined): Array<{ name: string; budget: number; actual: number }> {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item: unknown) => item && typeof item === 'object')
      .map((item: Record<string, unknown>) => {
        const parseDollar = (v: unknown) => Number(String(v ?? '').replace(/[^0-9.]/g, '')) || 0;
        return {
          name: String(item.label ?? item.name ?? item.category ?? 'Item'),
          budget: parseDollar(item.budget),
          actual: parseDollar(item.actual) || parseDollar(item.budget),
        };
      })
      .filter(item => item.budget > 0 || item.actual > 0);
  } catch {
    return [];
  }
}

function generateRecommendation(snapshot: ConferenceSnapshot | null, conference: ConferenceSummary): string {
  if (!snapshot) return 'Take a snapshot to generate an AI-powered recommendation.';

  const ces = snapshot.ces_score ?? 0;
  const ceff = snapshot.cost_efficiency_score ?? 0;
  // These are stored as 0-1 decimals; convert to 0-100 for threshold comparisons
  const icpRate = (snapshot.icp_engagement_rate ?? 0) * 100;
  const holdRate = (snapshot.meeting_hold_rate ?? 0) * 100;
  const followupRate = (snapshot.followup_completion_rate ?? 0) * 100;
  const pipeline = snapshot.pipeline_influenced ?? 0;
  const required = snapshot.required_pipeline_amount ?? 0;

  const strengths: string[] = [];
  const gaps: string[] = [];

  if (ces >= 75) strengths.push('strong overall conference effectiveness');
  else if (ces < 50) gaps.push('low conference effectiveness score');

  if (icpRate >= 70) strengths.push('high ICP engagement rate');
  else if (icpRate < 40) gaps.push('ICP engagement below target');

  if (holdRate >= 75) strengths.push('strong meeting hold rate');
  else if (holdRate < 50) gaps.push('meeting hold rate needs improvement');

  if (followupRate >= 70) strengths.push('solid follow-up completion');
  else if (followupRate < 40) gaps.push('follow-up completion is lagging');

  if (ceff >= 75) strengths.push('efficient cost per outcome');
  else if (ceff < 40) gaps.push('cost efficiency below benchmark');

  const roiMet = required > 0 && pipeline >= required;
  if (roiMet) strengths.push(`pipeline target met (${fmt$(pipeline)} vs. ${fmt$(required)} required)`);
  else if (required > 0) gaps.push(`pipeline gap of ${fmt$(required - pipeline)}`);

  const parts: string[] = [];

  if (strengths.length > 0) {
    parts.push(`This conference demonstrated ${strengths.join(', ')}.`);
  }

  if (gaps.length > 0) {
    parts.push(`Key areas for improvement: ${gaps.join('; ')}.`);
    if (holdRate < 50) parts.push('Consider pre-conference outreach and confirmation sequences to improve meeting hold rates.');
    if (icpRate < 40) parts.push('Review target account list quality and ensure ICP criteria are applied during attendee prioritization.');
    if (followupRate < 40) parts.push('Implement a structured 48-hour post-conference follow-up cadence.');
  }

  if (required > 0 && !roiMet) {
    parts.push(`To achieve the required ${snapshot.required_pipeline_multiple != null ? `${snapshot.required_pipeline_multiple}x` : ''} pipeline multiple, focus on accelerating open opportunities and expanding engagement with ICP accounts that attended but had no meetings.`);
  }

  if (ces >= 70 && roiMet) {
    parts.push(`${conference.name} is performing well and warrants continued investment. Consider increasing booth presence or sponsorship tier at the next instance.`);
  } else if (ces < 50 && ceff < 50) {
    parts.push(`Given both low effectiveness and cost efficiency, evaluate whether this event belongs in the core portfolio or should be deprioritized in favor of higher-performing events.`);
  }

  return parts.length > 0 ? parts.join(' ') : 'Insufficient data to generate a recommendation. Ensure a snapshot has been taken after the conference.';
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3 print:text-gray-600">
      {children}
    </h3>
  );
}

function MetricCard({ label, value, sub, scoreColor: sc }: { label: string; value: string; sub?: string; scoreColor?: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs text-gray-500">{label}</span>
      <span className={`text-xl font-bold ${sc ?? 'text-gray-800'}`}>{value}</span>
      {sub && <span className="text-xs text-gray-400">{sub}</span>}
    </div>
  );
}

function DimRow({ label, value }: { label: string; value: number | null }) {
  const pct = value ?? 0;
  const color = pct >= 75 ? 'bg-emerald-500' : pct >= 50 ? 'bg-amber-400' : 'bg-red-400';
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-gray-600 w-48 flex-shrink-0">{label}</span>
      <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.min(pct, 100)}%` }} />
      </div>
      <span className="text-xs font-medium text-gray-700 w-10 text-right">
        {value != null ? `${Math.round(value)}` : '—'}
      </span>
    </div>
  );
}

function YoYTable({ instances }: { instances: ConferenceYoYRow[] }) {
  if (instances.length === 0) return <p className="text-sm text-gray-400">No historical data available.</p>;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-gray-200">
            <th className="text-left font-medium text-gray-500 pb-2 pr-4">Year</th>
            <th className="text-right font-medium text-gray-500 pb-2 px-3">Cost</th>
            <th className="text-right font-medium text-gray-500 pb-2 px-3">CES</th>
            <th className="text-right font-medium text-gray-500 pb-2 px-3">Pipeline</th>
            <th className="text-right font-medium text-gray-500 pb-2 px-3">ICP Engaged</th>
            <th className="text-right font-medium text-gray-500 pb-2 px-3">Hold Rate</th>
            <th className="text-right font-medium text-gray-500 pb-2 pl-3">Pipeline/K</th>
          </tr>
        </thead>
        <tbody>
          {instances.map((row, i) => (
            <tr key={row.conferenceId} className={i % 2 === 0 ? 'bg-gray-50/50' : ''}>
              <td className="py-1.5 pr-4 font-medium text-gray-800">{row.year || '—'}</td>
              <td className="py-1.5 px-3 text-right text-gray-600">{fmt$(row.totalCost)}</td>
              <td className={`py-1.5 px-3 text-right font-medium ${scoreColor(row.cesScore)}`}>
                {row.cesScore != null ? row.cesScore : '—'}
              </td>
              <td className="py-1.5 px-3 text-right text-gray-600">{fmt$(row.pipelineInfluenced)}</td>
              <td className="py-1.5 px-3 text-right text-gray-600">
                {row.icpCompaniesEngaged != null ? fmtNum(row.icpCompaniesEngaged) : '—'}
              </td>
              <td className="py-1.5 px-3 text-right text-gray-600">{fmtPct(row.meetingHoldRate != null ? row.meetingHoldRate * 100 : null)}</td>
              <td className="py-1.5 pl-3 text-right text-gray-600">{fmt$(row.pipelinePerK)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function ExecutiveBriefDrawer({ isOpen, onClose, conference, seriesYoY, snapshot }: Props) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  if (!isOpen) return null;
  if (!mounted) return null;

  const lineItems = parseBudgetLineItems(snapshot?.budget_line_items);
  const recommendation = generateRecommendation(snapshot, conference);
  const yoyInstances = seriesYoY?.instances ?? [];
  const hasYoY = yoyInstances.length > 1;

  const handlePrint = () => window.print();

  const content = (
    <div className="fixed inset-0 z-50 print:relative print:inset-auto print:z-auto">
      <style>{`
        @keyframes execBriefFadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes execBriefSlideIn { from { transform: translateX(100%); } to { transform: translateX(0); } }
        @media print {
          .no-print { display: none !important; }
          .print-full { max-height: none !important; overflow: visible !important; }
          body { background: white !important; }
        }
      `}</style>

      {/* Overlay */}
      <div
        className="hidden sm:block absolute inset-0 no-print"
        style={{ backgroundColor: 'rgba(0,0,0,0.5)', animation: 'execBriefFadeIn 0.15s ease-out' }}
        onClick={onClose}
      />
      <div
        className="sm:hidden absolute inset-0 bg-black/30 no-print"
        onClick={onClose}
      />

      {/* Drawer */}
      <div className="absolute inset-0 sm:left-64 sm:flex sm:items-center sm:justify-center sm:p-5 pointer-events-none">
        <div
          className="pointer-events-auto relative w-full h-full sm:h-[90vh] sm:max-w-[1100px] flex flex-col bg-white sm:rounded-xl sm:shadow-2xl overflow-hidden print-full"
          style={{
            animation: 'execBriefSlideIn 0.25s ease-out',
          }}
        >
          {/* Header */}
          <div className="flex-shrink-0 flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-white no-print">
            <div className="flex items-center gap-3 min-w-0">
              <div className="flex items-center gap-2">
                {/* ti-presentation-analytics */}
                <svg className="w-5 h-5 text-brand-accent flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 4h18" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v10a2 2 0 0 0 2 2h12a2 2 0 0 0 2 -2v-10" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 16v4" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 20h6" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12v-4" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 12v-6" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 12v-2" />
                </svg>
                <span className="text-base font-semibold text-gray-900">Executive brief</span>
              </div>
              <span className="hidden sm:inline text-gray-300">·</span>
              <span className="hidden sm:inline text-sm text-gray-500 truncate">{conference.name}</span>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <button
                type="button"
                onClick={handlePrint}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
              >
                {/* ti-download */}
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2 -2v-2" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M7 11l5 5l5 -5" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v12" />
                </svg>
                Save to PDF
              </button>
              <button
                type="button"
                onClick={onClose}
                className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-colors"
                aria-label="Close"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          {/* Print-only title */}
          <div className="hidden print:flex items-baseline gap-3 px-8 pt-6 pb-2">
            <h1 className="text-2xl font-bold text-gray-900">Executive Brief</h1>
            <span className="text-lg text-gray-500">{conference.name}</span>
            <span className="ml-auto text-sm text-gray-400">
              {fmtDate(conference.start_date)}{conference.end_date && conference.end_date !== conference.start_date ? ` – ${fmtDate(conference.end_date)}` : ''}
            </span>
          </div>

          {/* Scrollable body */}
          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-8 print-full">

            {/* Empty state */}
            {!snapshot && (
              <div className="flex flex-col items-center justify-center py-16 gap-3">
                <svg className="w-12 h-12 text-gray-200" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5.586a1 1 0 0 1 .707.293l5.414 5.414a1 1 0 0 1 .293.707V19a2 2 0 0 1-2 2z" />
                </svg>
                <p className="text-sm font-medium text-gray-400">No snapshot available</p>
                <p className="text-xs text-gray-400 text-center max-w-xs">
                  Take a snapshot from the Analytics tab to generate the executive brief.
                </p>
              </div>
            )}

            {snapshot && (
              <>
                {/* ── Section 1: Investment ─────────────────────────── */}
                <section>
                  <SectionHeader>Investment</SectionHeader>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-6 mb-5">
                    <MetricCard
                      label="Total spend"
                      value={fmt$(snapshot.actual_total ?? snapshot.budget_total ?? snapshot.total_cost)}
                      sub={snapshot.budget_total ? `Budget: ${fmt$(snapshot.budget_total)}` : undefined}
                      scoreColor={
                        snapshot.budget_variance != null
                          ? snapshot.budget_variance <= 0
                            ? 'text-emerald-600'
                            : 'text-red-500'
                          : 'text-gray-800'
                      }
                    />
                    <MetricCard
                      label="Budget variance"
                      value={snapshot.budget_variance != null ? fmt$(snapshot.budget_variance) : '—'}
                      sub={
                        snapshot.budget_variance != null
                          ? snapshot.budget_variance > 0
                            ? 'Over budget'
                            : snapshot.budget_variance < 0
                            ? 'Under budget'
                            : 'On budget'
                          : undefined
                      }
                    />
                    <MetricCard label="Cost per company" value={fmt$(snapshot.cost_per_company_engaged)} />
                    <MetricCard label="Cost per meeting" value={fmt$(snapshot.cost_per_meeting_held)} />
                  </div>

                  {/* Sponsorship / booth */}
                  <div className="flex flex-wrap gap-x-6 gap-y-1 mb-4">
                    {(snapshot.sponsorship_level ?? conference.sponsorship_level) && (
                      <span className="text-xs text-gray-500">
                        Sponsorship: <strong className="text-gray-700">{snapshot.sponsorship_level ?? conference.sponsorship_level}</strong>
                      </span>
                    )}
                    {!!(snapshot.booth_present === 1 || conference.booth_present) && (
                      <span className="text-xs text-gray-500">
                        Booth:{' '}
                        <strong className="text-gray-700">
                          {[
                            snapshot.booth_width || conference.booth_width,
                            snapshot.booth_length || conference.booth_length,
                          ].filter(Boolean).join(' × ') || 'Present'}
                          {(snapshot.booth_number || conference.booth_number) ? ` · #${snapshot.booth_number ?? conference.booth_number}` : ''}
                          {(snapshot.booth_hall || conference.booth_hall) ? ` · ${snapshot.booth_hall ?? conference.booth_hall}` : ''}
                        </strong>
                      </span>
                    )}
                    {snapshot.strategy_name && (
                      <span className="text-xs text-gray-500">
                        Strategy: <strong className="text-gray-700">{snapshot.strategy_name}</strong>
                      </span>
                    )}
                  </div>

                  {/* Budget line items */}
                  {lineItems.length > 0 && (
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b border-gray-100">
                            <th className="text-left font-medium text-gray-500 pb-1.5 pr-4">Line item</th>
                            <th className="text-right font-medium text-gray-500 pb-1.5 px-3">Budget</th>
                            <th className="text-right font-medium text-gray-500 pb-1.5 pl-3">Actual</th>
                          </tr>
                        </thead>
                        <tbody>
                          {lineItems.map((item, i) => (
                            <tr key={i} className={i % 2 === 0 ? 'bg-gray-50/50' : ''}>
                              <td className="py-1 pr-4 text-gray-700">{item.name}</td>
                              <td className="py-1 px-3 text-right text-gray-600">{fmt$(item.budget)}</td>
                              <td className={`py-1 pl-3 text-right font-medium ${item.actual > item.budget * 1.05 ? 'text-red-500' : item.actual < item.budget * 0.95 ? 'text-emerald-600' : 'text-gray-700'}`}>
                                {fmt$(item.actual)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </section>

                {/* ── Section 2: Return ─────────────────────────────── */}
                <section>
                  <SectionHeader>Return</SectionHeader>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-6 mb-4">
                    <MetricCard
                      label="Pipeline influenced"
                      value={fmt$(snapshot.pipeline_influenced)}
                      scoreColor="text-gray-800"
                    />
                    <MetricCard
                      label="Net new pipeline"
                      value={fmt$(snapshot.pipeline_net_new)}
                    />
                    <MetricCard
                      label="Pipeline per $1K"
                      value={fmt$(snapshot.pipeline_per_1k)}
                    />
                    <div className="flex flex-col gap-0.5">
                      <span className="text-xs text-gray-500">Required pipeline</span>
                      <span className="text-xl font-bold text-gray-800">{fmt$(snapshot.required_pipeline_amount)}</span>
                      {snapshot.required_pipeline_multiple != null && (
                        <span className="text-xs text-gray-400">{snapshot.required_pipeline_multiple}x spend multiple</span>
                      )}
                    </div>
                  </div>

                  {/* ROI indicator */}
                  {snapshot.required_pipeline_amount != null && snapshot.pipeline_influenced != null && (
                    <div className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium mb-4 ${
                      snapshot.pipeline_influenced >= snapshot.required_pipeline_amount
                        ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                        : 'bg-red-50 border-red-200 text-red-600'
                    }`}>
                      {snapshot.pipeline_influenced >= snapshot.required_pipeline_amount ? (
                        <>
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                          Pipeline target met
                        </>
                      ) : (
                        <>
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                          </svg>
                          {fmt$(snapshot.required_pipeline_amount - snapshot.pipeline_influenced)} gap to target
                        </>
                      )}
                    </div>
                  )}

                  {/* CES + Cost efficiency scores */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className={`p-4 rounded-lg border ${scoreBg(snapshot.ces_score)}`}>
                      <div className="flex items-baseline justify-between mb-1">
                        <span className="text-xs font-medium text-gray-500">Conference Effectiveness</span>
                        <span className={`text-2xl font-bold ${scoreColor(snapshot.ces_score)}`}>
                          {snapshot.ces_score ?? '—'}
                        </span>
                      </div>
                      <span className={`text-xs font-medium ${scoreColor(snapshot.ces_score)}`}>
                        {scoreLabel(snapshot.ces_score)}
                      </span>
                    </div>
                    <div className={`p-4 rounded-lg border ${scoreBg(snapshot.cost_efficiency_score)}`}>
                      <div className="flex items-baseline justify-between mb-1">
                        <span className="text-xs font-medium text-gray-500">Cost Efficiency</span>
                        <span className={`text-2xl font-bold ${scoreColor(snapshot.cost_efficiency_score)}`}>
                          {snapshot.cost_efficiency_score ?? '—'}
                        </span>
                      </div>
                      <span className={`text-xs font-medium ${scoreColor(snapshot.cost_efficiency_score)}`}>
                        {scoreLabel(snapshot.cost_efficiency_score)}
                      </span>
                    </div>
                  </div>
                </section>

                {/* ── Section 3: Execution quality ─────────────────── */}
                <section>
                  <SectionHeader>Execution quality</SectionHeader>
                  <div className="space-y-3">
                    <DimRow label="ICP target quality" value={snapshot.icp_engagement_rate != null ? snapshot.icp_engagement_rate * 100 : null} />
                    <DimRow label="Meeting hold rate" value={snapshot.meeting_hold_rate != null ? snapshot.meeting_hold_rate * 100 : null} />
                    <DimRow label="Buying committee coverage" value={snapshot.buying_committee_coverage_rate != null ? snapshot.buying_committee_coverage_rate * 100 : null} />
                    <DimRow label="Follow-up scheduling rate" value={snapshot.followup_scheduling_rate != null ? snapshot.followup_scheduling_rate * 100 : null} />
                    <DimRow label="Follow-up completion rate" value={snapshot.followup_completion_rate != null ? snapshot.followup_completion_rate * 100 : null} />
                    <DimRow label="Avg. health score (engaged)" value={snapshot.avg_health_score_engaged} />
                    <DimRow label="Returning attendee rate" value={snapshot.returning_attendee_rate != null ? snapshot.returning_attendee_rate * 100 : null} />
                  </div>
                  <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-4">
                    <div className="text-center">
                      <div className="text-lg font-bold text-gray-800">{fmtNum(snapshot.decision_makers_engaged)}</div>
                      <div className="text-xs text-gray-500">Decision makers engaged</div>
                    </div>
                    <div className="text-center">
                      <div className="text-lg font-bold text-gray-800">{fmtNum(snapshot.icp_companies_engaged)}</div>
                      <div className="text-xs text-gray-500">ICP companies engaged</div>
                    </div>
                    <div className="text-center">
                      <div className="text-lg font-bold text-gray-800">{fmtNum(snapshot.icp_companies_total)}</div>
                      <div className="text-xs text-gray-500">ICP companies total</div>
                    </div>
                    <div className="text-center">
                      <div className="text-lg font-bold text-gray-800">{fmtNum(snapshot.companies_3plus_instances)}</div>
                      <div className="text-xs text-gray-500">Companies (3+ instances)</div>
                    </div>
                  </div>
                </section>

                {/* ── Section 4: Missed opportunity ────────────────── */}
                <section>
                  <SectionHeader>Missed opportunity</SectionHeader>
                  {snapshot.icp_companies_total != null && snapshot.icp_companies_engaged != null ? (
                    <div className="flex items-start gap-6">
                      <div>
                        <div className="text-3xl font-bold text-gray-800">
                          {fmtNum(snapshot.icp_companies_total - snapshot.icp_companies_engaged)}
                        </div>
                        <div className="text-xs text-gray-500 mt-0.5">ICP companies not engaged</div>
                      </div>
                      <div className="flex-1 pt-2">
                        <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
                          <span>Engaged: {fmtNum(snapshot.icp_companies_engaged)}</span>
                          <span>Total ICP: {fmtNum(snapshot.icp_companies_total)}</span>
                        </div>
                        <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full bg-brand-accent"
                            style={{
                              width: `${Math.min(
                                snapshot.icp_companies_total > 0
                                  ? (snapshot.icp_companies_engaged / snapshot.icp_companies_total) * 100
                                  : 0,
                                100
                              ).toFixed(2)}%`,
                            }}
                          />
                        </div>
                        <div className="text-xs text-gray-400 mt-1">
                          {snapshot.icp_engagement_rate != null
                            ? `${Math.round(snapshot.icp_engagement_rate * 100)}% engagement rate`
                            : ''}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-gray-400">ICP data unavailable.</p>
                  )}

                  {snapshot.pipeline_continued_engagement != null && snapshot.pipeline_continued_engagement > 0 && (
                    <div className="mt-4 p-3 rounded-lg bg-gray-50 border border-gray-200">
                      <span className="text-xs text-gray-500">Pipeline in continued engagement (not net new): </span>
                      <span className="text-sm font-semibold text-gray-800">{fmt$(snapshot.pipeline_continued_engagement)}</span>
                    </div>
                  )}
                </section>

                {/* ── Section 5: Year-over-Year ─────────────────────── */}
                {hasYoY && (
                  <section>
                    <SectionHeader>Year-over-year</SectionHeader>
                    <YoYTable instances={yoyInstances} />
                  </section>
                )}

                {/* ── Section 6: Recommendation ─────────────────────── */}
                <section>
                  <SectionHeader>Recommendation</SectionHeader>
                  <div className="p-4 rounded-lg bg-gray-50 border border-gray-200">
                    <p className="text-sm text-gray-700 leading-relaxed">{recommendation}</p>
                  </div>
                  {snapshot.snapshot_taken_at && (
                    <p className="text-xs text-gray-400 mt-2">
                      Snapshot taken {fmtDate(snapshot.snapshot_taken_at)}
                    </p>
                  )}
                </section>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(content, document.body);
}
