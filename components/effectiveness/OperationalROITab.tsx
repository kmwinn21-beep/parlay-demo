'use client';

import React, { useState } from 'react';
import type { EffectivenessData } from '../ConferenceEffectivenessModal';

function fmt$(n: unknown) {
  const v = n == null ? null : Number(n);
  if (v == null || isNaN(v)) return '—';
  return '$' + Math.round(v).toLocaleString();
}

function ProgressBar({ value, max = 100, color = '#1B76BC' }: { value: number; max?: number; color?: string }) {
  const pct = Math.min(Math.round((value / Math.max(max, 1)) * 100), 100);
  return (
    <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
      <div className="h-2 rounded-full" style={{ width: `${pct}%`, backgroundColor: color }} />
    </div>
  );
}

function scoreColor(score: number) {
  if (score >= 80) return '#059669'; // green
  if (score >= 60) return '#1B76BC'; // blue
  if (score >= 40) return '#d97706'; // amber
  if (score >= 20) return '#f97316'; // orange
  return '#dc2626'; // red
}

function scoreGrade(score: number) {
  if (score >= 80) return 'Excellent';
  if (score >= 60) return 'Good';
  if (score >= 40) return 'Fair';
  if (score >= 20) return 'Poor';
  return 'Critical';
}

const INTERPRETATION_ROWS = [
  { range: '80–100', rating: 'Excellent', meaning: 'Delivered at or above expected return on investment' },
  { range: '60–79',  rating: 'Good',      meaning: 'Strong cost efficiency; near or at target ROI' },
  { range: '40–59',  rating: 'Fair',      meaning: 'Below target efficiency; review cost allocation' },
  { range: '20–39',  rating: 'Poor',      meaning: 'Significant underperformance relative to spend' },
  { range: '0–19',   rating: 'Critical',  meaning: 'Minimal measurable return relative to investment' },
];

export function OperationalROITab({ data }: { data: EffectivenessData }) {
  const { operational, ces } = data;
  const costs = operational.cost_efficiency;
  const lineItems = (operational.line_items ?? []) as Record<string, unknown>[];
  const totalSpend = Number(costs.total_spend ?? 0);
  const annualBudget = operational.annual_budget;
  const annualBudgetYear = operational.annual_budget_year;

  const cesScore = Number(costs.cost_efficiency_score ?? 0);
  const rank = operational.conf_efficiency_rank ?? 1;
  const total = operational.conf_efficiency_total ?? 1;

  const [showInterpretation, setShowInterpretation] = useState(false);

  const filteredItems = lineItems.filter(li => Number(li.effective ?? li.actual ?? 0) > 0 || Number(li.budget ?? 0) > 0);

  return (
    <div className="p-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Left column: Cost Efficiency */}
        <div>
          {/* Section header */}
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-brand-primary text-sm uppercase tracking-wide">Cost Efficiency</h3>
          </div>

          {/* Top row: Cost Efficiency Score (2/3) + Rank (1/3) */}
          <div className="grid grid-cols-3 gap-3 mb-3">
            {/* Cost Efficiency Score card — 2/3 width */}
            <div
              className="col-span-2 rounded-xl p-4"
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
            </div>

            {/* Efficiency Rank card — 1/3 width */}
            <div className="col-span-1 rounded-xl border border-gray-200 bg-gray-50 p-4 flex flex-col items-center justify-center text-center">
              <div className="text-xs text-gray-500 font-medium mb-1">Efficiency Rank</div>
              <div className="text-3xl font-bold text-brand-secondary leading-tight">#{rank}</div>
              <div className="text-xs text-gray-400 mt-0.5">of {total} conferences</div>
            </div>
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

        {/* Right column: Conference Costs */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-brand-primary text-sm uppercase tracking-wide">Conference Costs</h3>
            <span className="text-sm font-bold text-gray-700">Total: {fmt$(totalSpend)}</span>
          </div>
          <div className="card p-4">
            {filteredItems.length === 0 ? (
              <p className="text-xs text-gray-400 italic">No cost data entered yet. Add costs via the Budget &amp; Actuals section on the conference page.</p>
            ) : (
              <div className="space-y-3">
                {filteredItems.map((li, i) => {
                  const actual = Number(li.actual ?? 0);
                  const budget = Number(li.budget ?? 0);
                  const effective = Number(li.effective ?? (actual > 0 ? actual : budget));
                  const barMax = budget > 0 ? budget : effective;
                  const barPct = barMax > 0 ? Math.round(effective / barMax * 100) : 0;
                  const shareOfTotal = totalSpend > 0 ? Math.round(effective / totalSpend * 100) : 0;
                  const overBudget = budget > 0 && actual > budget;
                  return (
                    <div key={i}>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-gray-600 font-medium">{String(li.label ?? '—')}</span>
                        <span className={overBudget ? 'text-red-500 font-semibold' : 'text-gray-600'}>
                          {actual > 0 ? (
                            <>
                              <span className="font-bold">{fmt$(actual)}</span>
                              {budget > 0 && actual !== budget && (
                                <span className="text-gray-400 ml-1">/ {fmt$(budget)} budget</span>
                              )}
                            </>
                          ) : (
                            <span className="text-gray-500">{fmt$(budget)}</span>
                          )}
                          <span className="text-gray-300 ml-1">({shareOfTotal}%)</span>
                        </span>
                      </div>
                      <ProgressBar value={barPct} max={100} color={overBudget ? '#dc2626' : '#1B76BC'} />
                    </div>
                  );
                })}
              </div>
            )}
            {annualBudget != null && (
              <div className="mt-4 pt-3 border-t border-gray-100 text-xs text-gray-500">
                Annual conference budget ({annualBudgetYear}): <span className="font-semibold text-gray-700">{fmt$(annualBudget)}</span>
                {totalSpend > 0 && annualBudget > 0 && (
                  <span className="ml-2 text-gray-400">({Math.round(totalSpend / annualBudget * 100)}% of annual budget)</span>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* CES score also shown for context — subtle reference */}
      <div className="mt-4 text-xs text-gray-400 text-right">
        Conference Effectiveness Score: <span className="font-semibold" style={{ color: ces.score >= 70 ? '#059669' : ces.score >= 40 ? '#d97706' : '#dc2626' }}>{ces.score}/100</span> — see Summary tab for full breakdown
      </div>

      {/* Interpretation popup overlay */}
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
                    <td className="py-1.5 pr-2 font-semibold" style={{ color: scoreColor(row.range === '80–100' ? 80 : row.range === '60–79' ? 60 : row.range === '40–59' ? 40 : row.range === '20–39' ? 20 : 0) }}>{row.rating}</td>
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
