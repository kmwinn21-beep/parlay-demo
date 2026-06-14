'use client';

import React, { useMemo } from 'react';
import { PieChart, Pie, Cell } from 'recharts';

interface BudgetLineItem {
  label: string;
  budgeted: number | null;
  actual: number | null;
}

interface ConferenceRow {
  conferenceId: number;
  name: string;
  ces: number | null;
  actualSpend: number | null;
  budgetTotal: number | null;
  budgetLineItems: BudgetLineItem[] | null;
}

type ProgramPlannerAnalyticsPanelProps = {
  conferences: ConferenceRow[];
  activeConferenceIds: number[];
  activeLineItems: string[];
};

function fmtCurrency(v: number | null | undefined): string {
  if (v == null) return '—';
  return '$' + Math.round(v).toLocaleString();
}

const SPEND_CATEGORIES = [
  { label: 'Reg + Sponsorship', items: ['Registration', 'Sponsorship'], color: '#185FA5' },
  { label: 'Booth + Setup',     items: ['Booth Setup', 'Booth'],        color: '#7F77DD' },
  { label: 'People costs',      items: ['Travel', 'Lodging'],           color: '#1D9E75' },
  { label: 'Ent + Meals',       items: ['Entertainment', 'Meals', 'Swag', 'Other'], color: '#EF9F27' },
];

const EYEBROW = 'text-[10px] font-semibold uppercase tracking-wider text-gray-900';
const CARD = 'card overflow-hidden !p-3';

export function ProgramPlannerAnalyticsPanel({
  conferences,
  activeConferenceIds,
  activeLineItems,
}: ProgramPlannerAnalyticsPanelProps) {
  const activeConfs = useMemo(
    () => conferences.filter(c => activeConferenceIds.includes(c.conferenceId)),
    [conferences, activeConferenceIds]
  );

  // Aggregate budget summary across all active line items
  const { totalBudgeted, totalActual, variance, variancePct } = useMemo(() => {
    const totalBudgeted = activeConfs.reduce((sum, c) => {
      const items = c.budgetLineItems?.filter(li => activeLineItems.includes(li.label)) ?? [];
      return sum + items.reduce((s, li) => s + (li.budgeted ?? 0), 0);
    }, 0);
    const totalActual = activeConfs.reduce((sum, c) => {
      const items = c.budgetLineItems?.filter(li => activeLineItems.includes(li.label)) ?? [];
      return sum + items.reduce((s, li) => s + (li.actual ?? 0), 0);
    }, 0);
    const variance = totalActual - totalBudgeted;
    const variancePct = totalBudgeted > 0 ? (variance / totalBudgeted) * 100 : 0;
    return { totalBudgeted, totalActual, variance, variancePct };
  }, [activeConfs, activeLineItems]);

  // Category donut
  const donutData = useMemo(() => {
    return SPEND_CATEGORIES.map(cat => {
      const relevantItems = cat.items.filter(item => activeLineItems.includes(item));
      const total = activeConfs.reduce((sum, c) => {
        const items = c.budgetLineItems?.filter(li => relevantItems.includes(li.label)) ?? [];
        return sum + items.reduce((s, li) => s + (li.actual ?? 0), 0);
      }, 0);
      return { ...cat, total };
    }).filter(cat => cat.total > 0);
  }, [activeConfs, activeLineItems]);

  const donutTotal = donutData.reduce((s, d) => s + d.total, 0);
  const hasData = activeConfs.length > 0 && activeLineItems.length > 0;

  return (
    <>
      {/* Budget summary */}
      <div className={CARD}>
        <div className="p-1 border-b border-gray-100">
          <p className={EYEBROW}>Budget Summary</p>
        </div>
        <div className="px-4 py-3 space-y-1.5">
          {!hasData ? (
            <p className="text-xs text-gray-300 text-center py-2">No data selected</p>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <span className="text-[12px] text-gray-500">Budgeted</span>
                <span className="text-[12px] font-semibold text-gray-700 tabular-nums">{fmtCurrency(totalBudgeted)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[12px] text-gray-500">Actual</span>
                <span className="text-[12px] font-semibold text-gray-700 tabular-nums">{fmtCurrency(totalActual)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[12px] text-gray-500">Variance</span>
                <span
                  className="text-[12px] font-semibold tabular-nums"
                  style={{ color: variance < 0 ? '#059669' : variance > 0 ? '#dc2626' : '#6B7280' }}
                >
                  {variance !== 0 && (variance > 0 ? '+' : '')}{fmtCurrency(variance)}
                  {totalBudgeted > 0 && (
                    <span className="text-[10px] ml-1 opacity-75">({variancePct > 0 ? '+' : ''}{variancePct.toFixed(1)}%)</span>
                  )}
                </span>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Spend composition */}
      <div className={CARD}>
        <div className="p-1 border-b border-gray-100">
          <p className={EYEBROW}>Spend Composition</p>
        </div>
        <div className="px-4 py-4">
          {donutData.length === 0 ? (
            <p className="text-xs text-gray-300 text-center py-4">No spend data</p>
          ) : (
            <div className="flex items-center gap-6">
              <div style={{ width: 140, height: 140, flexShrink: 0 }}>
                <PieChart width={140} height={140}>
                  <Pie
                    data={donutData}
                    cx={66}
                    cy={66}
                    innerRadius={30}
                    outerRadius={64}
                    dataKey="total"
                    strokeWidth={0}
                  >
                    {donutData.map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Pie>
                </PieChart>
              </div>
              <div className="flex-1 min-w-0 space-y-1.5 overflow-y-auto" style={{ maxHeight: 140 }}>
                {donutData.map(cat => {
                  const pct = donutTotal > 0 ? (cat.total / donutTotal) * 100 : 0;
                  return (
                    <div key={cat.label} className="flex items-center gap-2">
                      <span className="w-2 h-2 flex-shrink-0 rounded-sm" style={{ backgroundColor: cat.color }} />
                      <span className="text-[11px] text-gray-600 flex-1 truncate">{cat.label}</span>
                      <span className="text-[11px] font-semibold text-gray-700 tabular-nums">{pct.toFixed(0)}%</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
