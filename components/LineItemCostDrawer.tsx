'use client';

import React, { useMemo, useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
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
  headcount?: number | null;
  seriesId?: string | null;
}

interface Props {
  conferences: ConferenceRow[];
  activeConferenceIds: number[];
  activeLineItems: string[];
  selectedLineItem: string;
  year: number;
  onClose: () => void;
}

const HEADER_BG = 'rgb(var(--brand-secondary-rgb))';

const CONF_COLORS = [
  '#185FA5','#7F77DD','#1D9E75','#EF9F27',
  '#E57373','#42A5F5','#66BB6A','#FF7043',
  '#AB47BC','#26C6DA','#FF8A65','#A1887F',
];

function fmtCurrency(v: number | null | undefined): string {
  if (v == null) return '—';
  return '$' + Math.round(v).toLocaleString();
}

const EYEBROW = 'text-[10px] font-semibold uppercase tracking-wider text-gray-900';

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2.5">
      <div className="text-[9px] font-bold uppercase tracking-widest text-gray-400 mb-1">{label}</div>
      <div className="text-[15px] font-bold text-gray-800 leading-tight tabular-nums">{value}</div>
    </div>
  );
}

export function LineItemCostDrawer({
  conferences,
  activeConferenceIds,
  activeLineItems: _activeLineItems,
  selectedLineItem,
  year,
  onClose,
}: Props) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  const activeConfs = useMemo(
    () => conferences.filter(c => activeConferenceIds.includes(c.conferenceId)),
    [conferences, activeConferenceIds]
  );

  // Budget figures filtered to this line item
  const { totalBudgeted, totalActual, variance, variancePct } = useMemo(() => {
    const totalBudgeted = activeConfs.reduce((sum, c) => {
      const item = c.budgetLineItems?.find(li => li.label === selectedLineItem);
      return sum + (item?.budgeted ?? 0);
    }, 0);
    const totalActual = activeConfs.reduce((sum, c) => {
      const item = c.budgetLineItems?.find(li => li.label === selectedLineItem);
      return sum + (item?.actual ?? 0);
    }, 0);
    const variance = totalActual - totalBudgeted;
    const variancePct = totalBudgeted > 0 ? (variance / totalBudgeted) * 100 : 0;
    return { totalBudgeted, totalActual, variance, variancePct };
  }, [activeConfs, selectedLineItem]);

  // Global cost metrics
  const metrics = useMemo(() => {
    const confsWithData = activeConfs.filter(c =>
      c.budgetLineItems?.some(li => li.label === selectedLineItem && li.actual != null)
    );

    const lineItemTotal = confsWithData.reduce((s, c) => {
      return s + (c.budgetLineItems?.find(li => li.label === selectedLineItem)?.actual ?? 0);
    }, 0);

    const avgPerConf = confsWithData.length > 0 ? lineItemTotal / confsWithData.length : null;

    const totalHeadcount = confsWithData.reduce((s, c) => s + (c.headcount ?? 0), 0);
    const avgPerAttendee = totalHeadcount > 0 ? lineItemTotal / totalHeadcount : null;

    const totalProgramActual = activeConfs.reduce((s, c) => s + (c.actualSpend ?? 0), 0);
    const pctOfTotal = totalProgramActual > 0 ? (lineItemTotal / totalProgramActual) * 100 : null;

    const budgetConfs = confsWithData.filter(c => {
      const li = c.budgetLineItems?.find(l => l.label === selectedLineItem);
      return li?.budgeted != null && li.budgeted > 0;
    });
    const avgAbsErr = budgetConfs.length > 0
      ? budgetConfs.reduce((s, c) => {
          const li = c.budgetLineItems!.find(l => l.label === selectedLineItem)!;
          return s + Math.abs((li.actual ?? 0) - li.budgeted!) / li.budgeted! * 100;
        }, 0) / budgetConfs.length
      : null;
    const budgetAccuracy = avgAbsErr != null ? Math.max(0, 100 - avgAbsErr) : null;

    return { avgPerConf, avgPerAttendee, pctOfTotal, budgetAccuracy };
  }, [activeConfs, selectedLineItem]);

  // Per-conference donut data
  const donutData = useMemo(() => {
    return activeConfs
      .map((c, i) => {
        const item = c.budgetLineItems?.find(li => li.label === selectedLineItem);
        return { label: c.name, total: item?.actual ?? 0, color: CONF_COLORS[i % CONF_COLORS.length] };
      })
      .filter(d => d.total > 0);
  }, [activeConfs, selectedLineItem]);

  const donutTotal = donutData.reduce((s, d) => s + d.total, 0);

  // Suppress unused-var warning while keeping year available for future Y-o-Y work
  void year;

  if (!mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end sm:items-stretch sm:justify-end">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />

      <div className="drawer-mobile-responsive relative flex flex-col bg-white w-full sm:w-[380px] h-[90vh] sm:h-full shadow-2xl rounded-t-2xl sm:rounded-tl-2xl sm:rounded-bl-2xl sm:rounded-tr-none sm:rounded-br-none overflow-hidden">

        {/* Header */}
        <div className="flex-shrink-0 px-4 py-3" style={{ backgroundColor: HEADER_BG }}>
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-[9px] font-bold uppercase tracking-widest text-white/60 mb-0.5">Budget Summary</p>
              <p className="text-[15px] font-bold text-white leading-tight">{selectedLineItem}</p>
            </div>
            <button
              onClick={onClose}
              className="text-white/60 hover:text-white text-xl leading-none mt-0.5 flex-shrink-0"
              aria-label="Close"
            >×</button>
          </div>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto scrollbar-hide">

          {/* Budget figures */}
          <div className="px-4 py-3 space-y-1.5 border-b border-gray-100">
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
          </div>

          {/* Global cost metrics */}
          <div className="px-4 pt-3 pb-3 border-b border-gray-100">
            <p className={`${EYEBROW} mb-2`}>Global {selectedLineItem} Cost Metrics</p>
            <div className="grid grid-cols-2 gap-2">
              <MetricCard
                label="Avg Cost / Conference"
                value={fmtCurrency(metrics.avgPerConf)}
              />
              <MetricCard
                label="Avg Cost / Attendee"
                value={fmtCurrency(metrics.avgPerAttendee)}
              />
              <MetricCard
                label="Budget Accuracy"
                value={metrics.budgetAccuracy != null ? `${metrics.budgetAccuracy.toFixed(1)}%` : '—'}
              />
              <MetricCard
                label="% of Program Spend"
                value={metrics.pctOfTotal != null ? `${metrics.pctOfTotal.toFixed(1)}%` : '—'}
              />
            </div>
          </div>

          {/* Placeholder for line-item-specific metrics */}
          <div className="px-4 pt-3 pb-3 border-b border-gray-100">
            <p className={`${EYEBROW} mb-2`}>{selectedLineItem} Specific Cost Metrics</p>
            <p className="text-[11px] text-gray-400 italic">More metrics coming soon.</p>
          </div>

          {/* Spend composition by conference */}
          <div className="px-4 pt-3 pb-5">
            <p className={`${EYEBROW} mb-3`}>{selectedLineItem} Spend by Conference</p>
            {donutData.length === 0 ? (
              <p className="text-xs text-gray-300 text-center py-4">No spend data</p>
            ) : (
              <div className="flex items-center gap-4">
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
                <div className="flex-1 min-w-0 space-y-1.5 overflow-y-auto scrollbar-hide" style={{ maxHeight: 130 }}>
                  {donutData.map(item => {
                    const pct = donutTotal > 0 ? (item.total / donutTotal) * 100 : 0;
                    const label = item.label.replace(/\b\d{4}\b/, '').trim();
                    return (
                      <div key={item.label} className="flex items-center gap-2">
                        <span className="w-2 h-2 flex-shrink-0 rounded-sm" style={{ backgroundColor: item.color }} />
                        <span className="text-[11px] text-gray-600 flex-1 truncate">{label}</span>
                        <span className="text-[11px] font-semibold text-gray-700 tabular-nums">{pct.toFixed(0)}%</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

        </div>
      </div>
    </div>,
    document.body
  );
}
