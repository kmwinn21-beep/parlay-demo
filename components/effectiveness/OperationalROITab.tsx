'use client';

import React, { useState } from 'react';
import type { EffectivenessData } from '../ConferenceEffectivenessModal';
import { StrategyWeightNotice } from './StrategyWeightNotice';
import { ConferenceRankingsModal } from './ConferenceRankingsModal';

function fmt$(n: unknown) {
  const v = n == null ? null : Number(n);
  if (v == null || isNaN(v)) return '—';
  return '$' + Math.round(v).toLocaleString();
}


function scoreColor(score: number) {
  if (score >= 90) return '#059669';  // green — Exceptional
  if (score >= 75) return '#1B76BC';  // blue — Strong
  if (score >= 60) return '#d97706';  // amber — Acceptable
  if (score >= 50) return '#f97316';  // orange — Weak
  return '#dc2626'; // red — Inefficient
}

function scoreGrade(score: number) {
  if (score >= 90) return 'Exceptional efficiency';
  if (score >= 75) return 'Strong efficiency';
  if (score >= 60) return 'Acceptable efficiency';
  if (score >= 50) return 'Weak efficiency';
  return 'Inefficient';
}

const INTERPRETATION_ROWS = [
  { range: '90–100', rating: 'Exceptional', meaning: 'Exceptional cost efficiency — strong pipeline return and low cost per engagement' },
  { range: '75–89',  rating: 'Strong',      meaning: 'Strong efficiency; near-optimal cost-to-outcome ratio' },
  { range: '60–74',  rating: 'Acceptable',  meaning: 'Acceptable efficiency; some room for improvement' },
  { range: '50–59',  rating: 'Weak',        meaning: 'Weak efficiency; review cost allocation and engagement strategy' },
  { range: '< 50',   rating: 'Inefficient', meaning: 'Significant underperformance relative to benchmarks' },
];

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
          <span className="font-semibold" style={{ color: scoreColor(s) }}>{s}</span>
          {t && <span className="text-gray-400"> · {t}</span>}
        </span>
      )}
    </span>
  );
}

export function OperationalROITab({ data }: { data: EffectivenessData }) {
  const { operational, ces } = data;
  const strategyLabel = (data as any).conference_strategy?.display_name || 'Not set';
  const costs = operational.cost_efficiency;
  const repRows = (operational.rep_cost_efficiency ?? []) as Record<string, unknown>[];
  const repAllocatedCost = Number(operational.rep_allocated_cost ?? 0);
  const currentConferenceId = Number(data.conference.id ?? 0);

  const cesScore = Number(costs.cost_efficiency_score ?? 0);
  const rank = operational.conf_efficiency_rank ?? 1;
  const total = operational.conf_efficiency_total ?? 1;

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

  const [showInterpretation, setShowInterpretation] = useState(false);
  const [showRankings, setShowRankings] = useState(false);

  return (
    <div className="p-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Left column: Cost Efficiency */}
        <div>
          {/* Section header */}
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-brand-primary text-sm uppercase tracking-wide">Cost Efficiency</h3>
          </div>

          {/* Top row: Cost Efficiency Score + Rank — stacked on mobile, side-by-side on sm+ */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
            {/* Cost Efficiency Score card — full width on mobile, 2/3 on sm+ */}
            <div
              className="sm:col-span-2 rounded-xl p-4"
              style={{ backgroundColor: scoreColor(cesScore) + '15', borderLeft: `4px solid ${scoreColor(cesScore)}` }}
            >
              <div className="flex items-start justify-between mb-2">
                <div className="text-xs font-bold uppercase tracking-wide text-gray-500">Cost Efficiency Score</div>
                <button
                  type="button"
                  onClick={() => setShowInterpretation((v: boolean) => !v)}
                  className="text-gray-400 hover:text-brand-secondary transition-colors ml-2 flex-shrink-0"
                  aria-label="Score interpretation"
                  title="Score interpretation"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </button>
              </div>
              <div className="flex items-end gap-1">
                <div className="text-4xl font-bold leading-tight" style={{ color: scoreColor(cesScore) }}>{cesScore}</div>
                <div className="text-sm font-normal text-gray-400 mb-0.5">/100</div>
              </div>
              <div className="text-xs font-semibold mt-0.5" style={{ color: scoreColor(cesScore) }}>{scoreGrade(cesScore)}</div>
              <div className="mt-2 text-[11px] text-gray-500 text-right">Conference Strategy: {strategyLabel}</div><StrategyWeightNotice applied={(data as any).sales_execution?.strategy_modifier_applied || (data as any).marketing_audience?.strategy_modifier_applied || (data as any).operational?.cost_efficiency?.strategy_modifier_applied || (data as any).ces?.strategy_modifier_applied} strategyLabel={strategyLabel} />

              {/* Component breakdown inside the score card */}
              {(companyScore != null || meetingScore != null || pipelineScore != null) && (
                <div className="mt-3 pt-3 border-t border-current border-opacity-20 space-y-1.5">
                  {pipelineScore != null && (
                    <div className="flex justify-between text-xs">
                      <span className="text-gray-500">Pipeline Influence per $1k <span className="text-gray-300">(50%)</span></span>
                      <span className="font-semibold" style={{ color: scoreColor(pipelineScore) }}>{pipelineScore} <span className="text-gray-400">· {pipelineTier}</span></span>
                    </div>
                  )}
                  {companyScore != null && (
                    <div className="flex justify-between text-xs">
                      <span className="text-gray-500">Cost per Company <span className="text-gray-300">(30%)</span></span>
                      <span className="font-semibold" style={{ color: scoreColor(companyScore) }}>{companyScore} <span className="text-gray-400">· {companyTier}</span></span>
                    </div>
                  )}
                  {meetingScore != null && (
                    <div className="flex justify-between text-xs">
                      <span className="text-gray-500">Cost per Meeting <span className="text-gray-300">(20%)</span></span>
                      <span className="font-semibold" style={{ color: scoreColor(meetingScore) }}>{meetingScore} <span className="text-gray-400">· {meetingTier}</span></span>
                    </div>
                  )}
                </div>
              )}
              {modifier !== 0 && (
                <div className="mt-2 pt-2 border-t border-current border-opacity-10 text-xs text-gray-500">
                  Raw: {rawScore} · Modifier: {modifier > 0 ? '+' : ''}{modifier} · {eventType.replace(/_/g, ' ')}
                  {modifierReason && <span className="block text-gray-400 text-xs">{modifierReason}</span>}
                </div>
              )}
              {confidence !== 'full' && (
                <div className="mt-1 text-xs text-amber-600">⚠ Partial data ({confidence} confidence)</div>
              )}
            </div>

            {/* Efficiency Rank card — full width on mobile, 1/3 on sm+ */}
            <button
              type="button"
              onClick={() => setShowRankings(true)}
              className="sm:col-span-1 rounded-xl border border-gray-200 bg-gray-50 p-4 flex flex-col items-center justify-center text-center hover:border-brand-secondary hover:bg-blue-50 transition-colors group w-full"
              title="View full rankings"
            >
              <div className="text-xs text-gray-500 font-medium mb-1 group-hover:text-brand-secondary transition-colors">Efficiency Rank</div>
              <div className="text-3xl font-bold text-brand-secondary leading-tight">#{rank}</div>
              <div className="text-xs text-gray-400 mt-0.5">of {total} conferences</div>
              <div className="text-[10px] text-gray-400 mt-1.5 group-hover:text-brand-secondary transition-colors">View all →</div>
            </button>
          </div>

          {/* Metric cards */}
          <div className="space-y-2">
            {[
              { label: 'Cost per Company Engaged',          value: fmt$(costs.cost_per_company_engaged) },
              { label: 'Cost per Meeting Held',              value: fmt$(costs.cost_per_meeting_held) },
              { label: 'Cost per ICP Interaction',           value: fmt$(costs.cost_per_icp_interaction) },
              { label: 'Pipeline Influence per $1k Spent',   value: fmt$(costs.pipeline_influence_per_1k_spent) },
            ].map(({ label, value }) => (
              <div key={label} className="rounded-lg border border-gray-100 bg-gray-50 p-3 flex justify-between items-center">
                <div className="text-xs text-gray-500">{label}</div>
                <div className="text-sm font-bold text-brand-secondary">{value}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Right column: Cost Efficiency by Rep */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-brand-primary text-sm uppercase tracking-wide">Cost Efficiency by Rep</h3>
            {repAllocatedCost > 0 && (
              <span className="text-xs text-gray-400">Allocated cost/rep: <span className="font-semibold text-gray-600">{fmt$(repAllocatedCost)}</span></span>
            )}
          </div>
          {repRows.length === 0 ? (
            <div className="card p-4">
              <p className="text-xs text-gray-400 italic">No rep engagement data yet.</p>
            </div>
          ) : (
            <>
              {/* Mobile card view */}
              <div className="sm:hidden space-y-3">
                {repRows.map((r, i) => {
                  const rawScore = r.rep_cost_efficiency_score_raw != null ? Number(r.rep_cost_efficiency_score_raw) : null;
                  return (
                    <div key={i} className="rounded-xl border border-gray-100 bg-gray-50 p-3">
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-semibold text-gray-800 text-sm">{String(r.rep ?? '—')}</span>
                        {rawScore != null ? (
                          <span className="font-bold text-sm" style={{ color: scoreColor(rawScore) }}>
                            {rawScore}
                            <span className="text-xs font-normal text-gray-400 ml-1">· {String(r.rep_cost_efficiency_tier ?? '')}</span>
                          </span>
                        ) : <span className="text-gray-300 text-sm">—</span>}
                      </div>
                      <div className="grid grid-cols-3 gap-2 text-xs">
                        <div>
                          <div className="text-gray-400 mb-0.5">Pipeline / $1k</div>
                          <RepMetricCell value={r.rep_pipeline_influence_per_1000} score={r.rep_pipeline_score} tier={r.rep_pipeline_score_tier} />
                        </div>
                        <div>
                          <div className="text-gray-400 mb-0.5">Cost / Company</div>
                          <RepMetricCell value={r.rep_cost_per_company_engaged} score={r.rep_company_score} tier={r.rep_company_score_tier} />
                        </div>
                        <div>
                          <div className="text-gray-400 mb-0.5">Cost / Meeting</div>
                          <RepMetricCell value={r.rep_cost_per_meeting_held} score={r.rep_meeting_score} tier={r.rep_meeting_score_tier} />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Desktop table view */}
              <div className="hidden sm:block overflow-x-auto rounded-xl border border-gray-100">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-100">
                      <th className="text-left px-3 py-2 font-semibold text-gray-500 whitespace-nowrap">Rep</th>
                      <th className="text-right px-3 py-2 font-semibold text-gray-500 whitespace-nowrap">Pipeline / $1k</th>
                      <th className="text-right px-3 py-2 font-semibold text-gray-500 whitespace-nowrap">Cost / Company</th>
                      <th className="text-right px-3 py-2 font-semibold text-gray-500 whitespace-nowrap">Cost / Meeting</th>
                      <th className="text-right px-3 py-2 font-semibold text-gray-500 whitespace-nowrap">Score</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {repRows.map((r, i) => (
                      <tr key={i} className="hover:bg-gray-50">
                        <td className="px-3 py-2 font-medium text-gray-800 whitespace-nowrap">{String(r.rep ?? '—')}</td>
                        <td className="px-3 py-2 text-right whitespace-nowrap">
                          <RepMetricCell value={r.rep_pipeline_influence_per_1000} score={r.rep_pipeline_score} tier={r.rep_pipeline_score_tier} />
                        </td>
                        <td className="px-3 py-2 text-right whitespace-nowrap">
                          <RepMetricCell value={r.rep_cost_per_company_engaged} score={r.rep_company_score} tier={r.rep_company_score_tier} />
                        </td>
                        <td className="px-3 py-2 text-right whitespace-nowrap">
                          <RepMetricCell value={r.rep_cost_per_meeting_held} score={r.rep_meeting_score} tier={r.rep_meeting_score_tier} />
                        </td>
                        <td className="px-3 py-2 text-right whitespace-nowrap">
                          {r.rep_cost_efficiency_score_raw != null ? (
                            <span className="font-bold text-sm" style={{ color: scoreColor(Number(r.rep_cost_efficiency_score_raw)) }}>
                              {Number(r.rep_cost_efficiency_score_raw)}
                              <span className="text-xs font-normal text-gray-400 ml-1">· {String(r.rep_cost_efficiency_tier ?? '')}</span>
                            </span>
                          ) : <span className="text-gray-300">—</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </div>

      {/* CES score also shown for context — subtle reference */}
      <div className="mt-4 text-xs text-gray-400 text-right">
        Conference Effectiveness Score: <span className="font-semibold" style={{ color: ces.score >= 70 ? '#059669' : ces.score >= 40 ? '#d97706' : '#dc2626' }}>{ces.score}/100</span> — see Summary tab for full breakdown
      </div>

      {/* Interpretation popup overlay */}
      {showRankings && (
        <ConferenceRankingsModal
          title="Cost Efficiency Rankings"
          currentConferenceId={currentConferenceId}
          onClose={() => setShowRankings(false)}
        />
      )}

      {showInterpretation && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center" onClick={() => setShowInterpretation(false)}>
          <div className="absolute inset-0 bg-black/30" />
          <div
            className="relative bg-white rounded-xl shadow-2xl p-5 max-w-sm w-full mx-4"
            onClick={(e: React.MouseEvent) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-bold text-brand-primary uppercase tracking-wide">Cost Efficiency Score</h4>
              <button onClick={() => setShowInterpretation(false)} className="text-gray-400 hover:text-gray-600 text-lg leading-none">×</button>
            </div>
            <table className="w-full text-xs">
              <thead>
                <tr className="text-gray-400 border-b border-gray-100">
                  <th className="text-left pb-1 font-semibold">Score</th>
                  <th className="text-left pb-1 font-semibold">Rating</th>
                  <th className="text-left pb-1 font-semibold">Meaning</th>
                </tr>
              </thead>
              <tbody>
                {INTERPRETATION_ROWS.map(row => (
                  <tr key={row.range} className="border-b border-gray-50">
                    <td className="py-1.5 pr-2 font-mono text-gray-600">{row.range}</td>
                    <td className="py-1.5 pr-2 font-semibold" style={{ color: scoreColor(row.range === '90–100' ? 90 : row.range === '75–89' ? 75 : row.range === '60–74' ? 60 : row.range === '50–59' ? 50 : 0) }}>{row.rating}</td>
                    <td className="py-1.5 text-gray-500 leading-tight">{row.meaning}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
