'use client';

import type { EffectivenessData } from '../ConferenceEffectivenessModal';

function fmt$(n: number | null | undefined) {
  if (n == null) return '—';
  return '$' + Math.round(n).toLocaleString();
}

function ProgressBar({ value, max = 100, color = '#1B76BC' }: { value: number; max?: number; color?: string }) {
  const pct = Math.min(Math.round((value / Math.max(max, 1)) * 100), 100);
  return (
    <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
      <div className="h-2 rounded-full" style={{ width: `${pct}%`, backgroundColor: color }} />
    </div>
  );
}

export function OperationalROITab({ data }: { data: EffectivenessData }) {
  const { operational, ces, effectiveness_defaults } = data;
  const costs = operational.cost_efficiency;
  const lineItems = (operational.line_items ?? []) as Record<string, unknown>[];
  const totalSpend = Number(costs.total_spend ?? 0);
  const annualBudget = operational.annual_budget;
  const annualBudgetYear = operational.annual_budget_year;
  const expectedReturn = Number(effectiveness_defaults?.expected_return_on_event_cost ?? 0);
  const totalPI = Number(data.pipeline.total_pipeline_influence ?? 0);
  const actualReturn = totalSpend > 0 ? (totalPI / totalSpend) : null;
  const returnTargetPct = expectedReturn > 0 && actualReturn != null
    ? Math.min(Math.round(actualReturn / expectedReturn * 100), 150)
    : null;

  const filteredItems = lineItems.filter(li => Number(li.actual ?? 0) > 0 || Number(li.budget ?? 0) > 0);
  const maxSpend = filteredItems.reduce((m, li) => Math.max(m, Number(li.actual ?? li.budget ?? 0)), 0);

  return (
    <div className="p-6 space-y-6">
      {/* Cost Breakdown */}
      <div className="card p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-brand-primary text-sm uppercase tracking-wide">Conference Costs</h3>
          <span className="text-sm font-bold text-gray-700">Total: {fmt$(totalSpend)}</span>
        </div>
        {filteredItems.length === 0 ? (
          <p className="text-xs text-gray-400 italic">No cost data entered yet. Add costs via the Budget &amp; Actuals section on the conference page.</p>
        ) : (
          <div className="space-y-3">
            {filteredItems.map((li, i) => {
              const actual = Number(li.actual ?? 0);
              const budget = Number(li.budget ?? 0);
              const pct = totalSpend > 0 ? Math.round(actual / totalSpend * 100) : 0;
              const overBudget = budget > 0 && actual > budget;
              return (
                <div key={i}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-gray-600 font-medium">{String(li.label ?? '—')}</span>
                    <span className={overBudget ? 'text-red-500 font-semibold' : 'text-gray-600'}>
                      {fmt$(actual)} <span className="text-gray-300">({pct}%)</span>
                      {budget > 0 && <span className="text-gray-400 ml-1">/ {fmt$(budget)} budget</span>}
                    </span>
                  </div>
                  <ProgressBar value={actual} max={Math.max(maxSpend, 1)} color={overBudget ? '#dc2626' : '#1B76BC'} />
                </div>
              );
            })}
          </div>
        )}
        {annualBudget != null && (
          <div className="mt-4 pt-3 border-t border-gray-100 text-xs text-gray-500">
            Annual conference budget ({annualBudgetYear}): <span className="font-semibold text-gray-700">{fmt$(annualBudget)}</span>
            {totalSpend > 0 && (
              <span className="ml-2 text-gray-400">({Math.round(totalSpend / annualBudget * 100)}% of annual budget)</span>
            )}
          </div>
        )}
      </div>

      {/* Cost Efficiency */}
      <div className="card p-5">
        <h3 className="font-semibold text-brand-primary text-sm uppercase tracking-wide mb-4">Cost Efficiency</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: 'Cost / Company Engaged',    value: fmt$(costs.cost_per_company_engaged) },
            { label: 'Cost / Meeting Held',        value: fmt$(costs.cost_per_meeting_held) },
            { label: 'PI / $1k Spent',             value: fmt$(costs.pipeline_influence_per_1k_spent) },
            { label: 'Total Spend',                value: fmt$(totalSpend) },
          ].map(({ label, value }) => (
            <div key={label} className="rounded-xl border border-gray-100 bg-gray-50 p-3 text-center">
              <div className="text-lg font-bold text-brand-secondary leading-tight">{value}</div>
              <div className="text-xs text-gray-500 mt-0.5">{label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Return on Cost */}
      <div className="card p-5 space-y-3">
        <h3 className="font-semibold text-brand-primary text-sm uppercase tracking-wide">Return on Event Cost</h3>
        <div className="flex items-center gap-6">
          <div className="text-center">
            <div className="text-3xl font-bold text-brand-secondary">
              {actualReturn != null ? `${actualReturn.toFixed(2)}×` : '—'}
            </div>
            <div className="text-xs text-gray-500">Actual ROC</div>
          </div>
          {expectedReturn > 0 && (
            <div className="text-center">
              <div className="text-3xl font-bold text-gray-400">{expectedReturn.toFixed(2)}×</div>
              <div className="text-xs text-gray-500">Target ROC</div>
            </div>
          )}
        </div>
        {returnTargetPct != null && expectedReturn > 0 && (
          <div>
            <div className="flex justify-between text-xs mb-1">
              <span className="text-gray-500">Target achieved</span>
              <span className="font-semibold text-brand-secondary">{Math.min(returnTargetPct, 100)}%</span>
            </div>
            <ProgressBar value={Math.min(returnTargetPct, 100)} color={returnTargetPct >= 100 ? '#059669' : returnTargetPct >= 60 ? '#d97706' : '#dc2626'} />
          </div>
        )}
        {totalSpend === 0 && (
          <p className="text-xs text-gray-400 italic">Enter actual costs to calculate return on cost.</p>
        )}
      </div>

      {/* CES reference */}
      <div className="card p-5">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-brand-primary text-sm uppercase tracking-wide">Conference Effectiveness Score</h3>
            <p className="text-xs text-gray-400 mt-0.5">Composite score — see Summary tab for breakdown</p>
          </div>
          <span className="text-4xl font-bold" style={{ color: ces.score >= 70 ? '#059669' : ces.score >= 40 ? '#d97706' : '#dc2626' }}>
            {ces.score}<span className="text-lg font-normal text-gray-300">/100</span>
          </span>
        </div>
      </div>
    </div>
  );
}
