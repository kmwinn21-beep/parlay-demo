'use client';

import React, { useMemo } from 'react';
import { PieChart, Pie, Cell, ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

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

  // Section 1: Budget summary
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

  // Section 2: Donut data
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

  // Section 3: Scatter data
  const scatterData = useMemo(() => {
    return activeConfs
      .map(c => {
        const spend = c.budgetLineItems
          ?.filter(li => activeLineItems.includes(li.label))
          .reduce((s, li) => s + (li.actual ?? 0), 0) ?? 0;
        return { x: spend, y: c.ces, label: c.name, conferenceId: c.conferenceId };
      })
      .filter(d => d.y != null && d.x > 0) as { x: number; y: number; label: string; conferenceId: number }[];
  }, [activeConfs, activeLineItems]);

  const cesPointColor = (ces: number) => {
    if (ces >= 75) return '#3B6D11';
    if (ces >= 60) return '#EF9F27';
    return '#A32D2D';
  };

  // Section 4: Drill-down data
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
    <div className="divide-y divide-gray-100">
      {/* Section 1: Budget summary */}
      <div className="px-4 py-3 space-y-1.5">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-2">Budget summary</p>
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

      {/* Section 2: Spend composition donut */}
      <div className="px-4 py-3">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-2">Spend composition</p>
        {donutData.length === 0 ? (
          <p className="text-xs text-gray-300 text-center py-2">No spend data</p>
        ) : (
          <div className="flex items-center gap-3">
            <div style={{ width: 72, height: 72, flexShrink: 0 }}>
              <PieChart width={72} height={72}>
                <Pie
                  data={donutData}
                  cx={32}
                  cy={32}
                  innerRadius={24}
                  outerRadius={34}
                  dataKey="total"
                  strokeWidth={0}
                >
                  {donutData.map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Pie>
              </PieChart>
            </div>
            <div className="flex-1 min-w-0 space-y-1">
              {donutData.map(cat => {
                const pct = donutTotal > 0 ? (cat.total / donutTotal) * 100 : 0;
                return (
                  <div key={cat.label} className="flex items-center gap-1.5">
                    <span className="w-2 h-2 flex-shrink-0 rounded-sm" style={{ backgroundColor: cat.color, borderRadius: 2 }} />
                    <span className="text-[11px] text-gray-600 flex-1 truncate">{cat.label}</span>
                    <span className="text-[11px] font-medium text-gray-700 tabular-nums">{pct.toFixed(0)}%</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Section 3: Scatter plot */}
      <div className="px-4 py-3">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-2">Cost efficiency</p>
        {scatterData.length < 2 ? (
          <p className="text-[11px] text-gray-300 text-center py-3 leading-relaxed">
            Not enough data to plot. Score more conferences to see efficiency trends.
          </p>
        ) : (
          <>
            <div style={{ width: '100%', height: 130 }}>
              <ResponsiveContainer width="100%" height={130}>
                <ScatterChart margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.12)" />
                  <XAxis
                    type="number"
                    dataKey="x"
                    domain={[0, 'auto']}
                    name="Spend"
                    tickFormatter={(v: number) => '$' + Math.round(v / 1000) + 'K'}
                    tick={{ fontSize: 9, fill: '#94A3B8' }}
                    axisLine={false}
                    tickLine={false}
                    label={{ value: 'Spend', position: 'insideBottom', offset: -2, fontSize: 9, fill: '#94A3B8' }}
                  />
                  <YAxis
                    type="number"
                    dataKey="y"
                    domain={[0, 100]}
                    name="CES"
                    tick={{ fontSize: 9, fill: '#94A3B8' }}
                    axisLine={false}
                    tickLine={false}
                    label={{ value: 'CES', angle: -90, position: 'insideLeft', fontSize: 9, fill: '#94A3B8' }}
                  />
                  <Tooltip
                    cursor={{ strokeDasharray: '3 3' }}
                    content={({ payload }) => {
                      if (!payload?.length) return null;
                      const d = payload[0].payload as { label: string; x: number; y: number };
                      return (
                        <div className="bg-white border border-gray-200 rounded px-2 py-1 text-[11px] shadow-sm">
                          <p className="font-medium text-gray-700">{d.label}</p>
                          <p className="text-gray-500">${Math.round(d.x / 1000)}K · CES {d.y}</p>
                        </div>
                      );
                    }}
                  />
                  {scatterData.map(d => (
                    <Scatter
                      key={d.conferenceId}
                      data={[d]}
                      fill={cesPointColor(d.y)}
                    />
                  ))}
                </ScatterChart>
              </ResponsiveContainer>
            </div>
            <div className="flex items-center gap-3 mt-1">
              {[
                { color: '#3B6D11', label: 'CES ≥75' },
                { color: '#EF9F27', label: 'CES 60–74' },
                { color: '#A32D2D', label: 'CES <60' },
              ].map(({ color, label }) => (
                <div key={label} className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
                  <span className="text-[10px] text-gray-400">{label}</span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Section 4: Line item drill-down */}
      <div className="px-4 py-3">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-2">Line item detail</p>
        {selectedLineItem == null ? (
          <div className="py-4 text-center">
            <i className="ti ti-hand-click text-gray-200 text-2xl block mb-1" />
            <p className="text-xs text-gray-400">Click any line item row to drill in</p>
          </div>
        ) : (
          <div>
            <div className="flex items-center justify-between mb-2">
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
  );
}
