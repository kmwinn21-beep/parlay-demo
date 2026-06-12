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
  selectedLineItem: string | null;
  onLineItemSelect: (label: string | null) => void;
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
  selectedLineItem,
  onLineItemSelect,
}: ProgramPlannerAnalyticsPanelProps) {
  const activeConfs = useMemo(
    () => conferences.filter(c => activeConferenceIds.includes(c.conferenceId)),
    [conferences, activeConferenceIds]
  );

  // Budget summary
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

  // Donut data
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

  // Drill-down data
  const drillData = useMemo(() => {
    if (!selectedLineItem) return [];
    return activeConfs.map(c => {
      const item = c.budgetLineItems?.find(li => li.label === selectedLineItem);
      return {
        conferenceId: c.conferenceId,
        name: c.name,
        actual: item?.actual ?? null,
        budgeted: item?.budgeted ?? null,
      };
    }).sort((a, b) => (b.actual ?? 0) - (a.actual ?? 0));
  }, [activeConfs, selectedLineItem]);

  const maxActual = drillData.reduce((m, d) => Math.max(m, d.actual ?? 0), 0);

  const getCellBg = (actual: number | null, budgeted: number | null): string => {
    if (actual === null || budgeted === null || budgeted === 0) return '#F9FAFB';
    const pct = ((actual - budgeted) / budgeted) * 100;
    if (pct < -10) return '#EAF3DE';
    if (pct < 0) return '#F3F8EC';
    if (pct === 0) return '#F9FAFB';
    if (pct <= 10) return '#FEF4F4';
    return '#FCEBEB';
  };

  const getVariancePctDisplay = (actual: number | null, budgeted: number | null) => {
    if (actual == null || budgeted == null || budgeted === 0) return null;
    return ((actual - budgeted) / budgeted) * 100;
  };

  const hasData = activeConfs.length > 0 && activeLineItems.length > 0;

  return (
    <>
      {/* Card 1: Budget summary */}
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

      {/* Card 2: Spend composition */}
      <div className={CARD}>
        <div className="p-1 border-b border-gray-100">
          <p className={EYEBROW}>Spend Composition</p>
        </div>
        <div className="px-4 py-4">
          {donutData.length === 0 ? (
            <p className="text-xs text-gray-300 text-center py-4">No spend data</p>
          ) : (
            <div className="flex items-center gap-8">
              <div style={{ width: 120, height: 120, flexShrink: 0 }}>
                <PieChart width={120} height={120}>
                  <Pie
                    data={donutData}
                    cx={56}
                    cy={56}
                    innerRadius={28}
                    outerRadius={54}
                    dataKey="total"
                    strokeWidth={0}
                  >
                    {donutData.map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Pie>
                </PieChart>
              </div>
              <div className="flex-1 min-w-0 space-y-2">
                {donutData.map(cat => {
                  const pct = donutTotal > 0 ? (cat.total / donutTotal) * 100 : 0;
                  return (
                    <div key={cat.label} className="flex items-center gap-2">
                      <span className="w-2 h-2 flex-shrink-0" style={{ backgroundColor: cat.color, borderRadius: 2 }} />
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

      {/* Card 3: Line item drill-down */}
      <div className={CARD}>
        <div className="p-1 border-b border-gray-100">
          <p className={EYEBROW}>Line Item Detail</p>
        </div>
        <div className="px-4 py-3">
          {selectedLineItem == null ? (
            <div className="py-4 text-center">
              <i className="ti ti-hand-click text-gray-200 text-2xl block mb-1" />
              <p className="text-xs text-gray-400">Click any line item row to drill in</p>
            </div>
          ) : (
            <div>
              <div className="flex items-center justify-between mb-3">
                <span className="text-[12px] font-semibold text-brand-secondary">{selectedLineItem}</span>
                <button
                  onClick={() => onLineItemSelect(null)}
                  className="text-[11px] text-gray-400 hover:text-gray-600 transition-colors ml-2"
                >
                  ×
                </button>
              </div>
              <div className="space-y-1.5">
                {drillData.map(row => {
                  const barWidth = maxActual > 0 && row.actual != null
                    ? Math.max(4, (row.actual / maxActual) * 100)
                    : 4;
                  const vPct = getVariancePctDisplay(row.actual, row.budgeted);
                  const barBg = getCellBg(row.actual, row.budgeted);
                  return (
                    <div key={row.conferenceId} className="flex items-center gap-2">
                      <span className="text-[11px] text-gray-600 truncate flex-shrink-0" style={{ width: 70 }}>
                        {row.name.replace(/\b\d{4}\b/, '').trim()}
                      </span>
                      <div className="flex-1 min-w-0">
                        {row.actual != null ? (
                          <div
                            style={{
                              width: `${barWidth}%`,
                              height: 16,
                              borderRadius: 2,
                              backgroundColor: barBg,
                              border: '1px solid rgba(0,0,0,0.06)',
                            }}
                          />
                        ) : (
                          <span className="text-[11px] text-gray-300">—</span>
                        )}
                      </div>
                      {vPct != null ? (
                        <span
                          className="text-[11px] font-medium tabular-nums flex-shrink-0"
                          style={{ color: vPct < 0 ? '#059669' : vPct > 0 ? '#dc2626' : '#6B7280' }}
                        >
                          {vPct > 0 ? '+' : ''}{vPct.toFixed(0)}%
                        </span>
                      ) : (
                        <span className="text-[11px] text-gray-300 flex-shrink-0">—</span>
                      )}
                    </div>
                  );
                })}
              </div>
              <p className="text-[10px] text-gray-400 mt-2">Budget reference line shown relative to bar width</p>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
