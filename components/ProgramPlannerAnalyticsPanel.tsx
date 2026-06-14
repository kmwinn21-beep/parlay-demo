'use client';

import React, { useMemo, useState, useEffect } from 'react';
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

type ProgramPlannerAnalyticsPanelProps = {
  conferences: ConferenceRow[];
  activeConferenceIds: number[];
  activeLineItems: string[];
  selectedLineItem: string | null;
  onLineItemSelect: (label: string | null) => void;
  year: number;
};

function fmtCurrency(v: number | null | undefined): string {
  if (v == null) return '—';
  return '$' + Math.round(v).toLocaleString();
}

function fmtPct(v: number | null | undefined, signed = false): string {
  if (v == null) return '—';
  const s = signed && v > 0 ? '+' : '';
  return `${s}${v.toFixed(1)}%`;
}

const SPEND_CATEGORIES = [
  { label: 'Reg + Sponsorship', items: ['Registration', 'Sponsorship'], color: '#185FA5' },
  { label: 'Booth + Setup',     items: ['Booth Setup', 'Booth'],        color: '#7F77DD' },
  { label: 'People costs',      items: ['Travel', 'Lodging'],           color: '#1D9E75' },
  { label: 'Ent + Meals',       items: ['Entertainment', 'Meals', 'Swag', 'Other'], color: '#EF9F27' },
];

const CONF_COLORS = ['#185FA5','#7F77DD','#1D9E75','#EF9F27','#E57373','#42A5F5','#66BB6A','#FF7043','#AB47BC','#26C6DA','#FF8A65','#A1887F'];

const SELECTION_COLOR = 'rgb(var(--brand-secondary-rgb))';
const EYEBROW = 'text-[10px] font-semibold uppercase tracking-wider text-gray-900';
const CARD = 'card overflow-hidden !p-3';

function MetricCard({ label, value, sub, subColor }: { label: string; value: string; sub?: string; subColor?: string }) {
  return (
    <div className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2.5">
      <div className="text-[9px] font-bold uppercase tracking-widest text-gray-400 mb-1">{label}</div>
      <div className="text-[15px] font-bold text-gray-800 leading-tight tabular-nums">{value}</div>
      {sub && (
        <div className="text-[11px] font-medium mt-0.5 tabular-nums" style={{ color: subColor ?? '#6B7280' }}>{sub}</div>
      )}
    </div>
  );
}

export function ProgramPlannerAnalyticsPanel({
  conferences,
  activeConferenceIds,
  activeLineItems,
  selectedLineItem,
  onLineItemSelect,
  year,
}: ProgramPlannerAnalyticsPanelProps) {
  const [priorYearConfs, setPriorYearConfs] = useState<ConferenceRow[]>([]);

  // Fetch prior year data when a line item is selected
  useEffect(() => {
    if (!selectedLineItem) { setPriorYearConfs([]); return; }
    let cancelled = false;
    fetch(`/api/program-planner/conferences?year=${year - 1}`)
      .then(r => r.ok ? r.json() : { conferences: [] })
      .then(data => { if (!cancelled) setPriorYearConfs(data.conferences ?? []); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [selectedLineItem, year]);

  const activeConfs = useMemo(
    () => conferences.filter(c => activeConferenceIds.includes(c.conferenceId)),
    [conferences, activeConferenceIds]
  );

  // ── Budget summary (respects selectedLineItem) ────────────────────────────
  const { totalBudgeted, totalActual, variance, variancePct } = useMemo(() => {
    const labels = selectedLineItem ? [selectedLineItem] : activeLineItems;
    const totalBudgeted = activeConfs.reduce((sum, c) => {
      const items = c.budgetLineItems?.filter(li => labels.includes(li.label)) ?? [];
      return sum + items.reduce((s, li) => s + (li.budgeted ?? 0), 0);
    }, 0);
    const totalActual = activeConfs.reduce((sum, c) => {
      const items = c.budgetLineItems?.filter(li => labels.includes(li.label)) ?? [];
      return sum + items.reduce((s, li) => s + (li.actual ?? 0), 0);
    }, 0);
    const variance = totalActual - totalBudgeted;
    const variancePct = totalBudgeted > 0 ? (variance / totalBudgeted) * 100 : 0;
    return { totalBudgeted, totalActual, variance, variancePct };
  }, [activeConfs, activeLineItems, selectedLineItem]);

  // ── Donut data ─────────────────────────────────────────────────────────────
  // When line item selected: per-conference breakdown; otherwise: by category
  const donutData = useMemo(() => {
    if (selectedLineItem) {
      return activeConfs
        .map((c, i) => {
          const item = c.budgetLineItems?.find(li => li.label === selectedLineItem);
          return { label: c.name, total: item?.actual ?? 0, color: CONF_COLORS[i % CONF_COLORS.length] };
        })
        .filter(d => d.total > 0);
    }
    return SPEND_CATEGORIES.map(cat => {
      const relevantItems = cat.items.filter(item => activeLineItems.includes(item));
      const total = activeConfs.reduce((sum, c) => {
        const items = c.budgetLineItems?.filter(li => relevantItems.includes(li.label)) ?? [];
        return sum + items.reduce((s, li) => s + (li.actual ?? 0), 0);
      }, 0);
      return { ...cat, total };
    }).filter(cat => cat.total > 0);
  }, [activeConfs, activeLineItems, selectedLineItem]);

  const donutTotal = donutData.reduce((s, d) => s + d.total, 0);

  // ── Global line item metrics ───────────────────────────────────────────────
  const globalMetrics = useMemo(() => {
    if (!selectedLineItem) return null;

    const confsWithData = activeConfs.filter(c =>
      c.budgetLineItems?.some(li => li.label === selectedLineItem && li.actual != null)
    );

    // Avg cost / conference
    const lineItemTotal = confsWithData.reduce((s, c) => {
      return s + (c.budgetLineItems?.find(li => li.label === selectedLineItem)?.actual ?? 0);
    }, 0);
    const avgPerConf = confsWithData.length > 0 ? lineItemTotal / confsWithData.length : null;

    // Avg cost / internal attendee
    const totalHeadcount = confsWithData.reduce((s, c) => s + (c.headcount ?? 0), 0);
    const avgPerAttendee = totalHeadcount > 0 ? lineItemTotal / totalHeadcount : null;

    // % of total program spend
    const totalProgramActual = activeConfs.reduce((s, c) => s + (c.actualSpend ?? 0), 0);
    const pctOfTotal = totalProgramActual > 0 ? (lineItemTotal / totalProgramActual) * 100 : null;

    // Budget accuracy: 100 - avg(|actual - budgeted| / budgeted * 100) for confs where budgeted > 0
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

    // Y-o-Y variance
    let yoyDelta: number | null = null;
    let yoyPct: number | null = null;
    if (priorYearConfs.length > 0) {
      let currSum = 0;
      let priorSum = 0;
      let matched = 0;
      for (const curr of activeConfs) {
        const currItem = curr.budgetLineItems?.find(li => li.label === selectedLineItem);
        if (currItem?.actual == null) continue;

        // Match by seriesId first, then by name (strip year)
        let prior: ConferenceRow | undefined;
        if (curr.seriesId) {
          prior = priorYearConfs.find(p => p.seriesId === curr.seriesId);
        }
        if (!prior) {
          const nameKey = curr.name.replace(/\b\d{4}\b/, '').trim().toLowerCase();
          prior = priorYearConfs.find(p =>
            p.name.replace(/\b\d{4}\b/, '').trim().toLowerCase() === nameKey
          );
        }
        if (!prior) continue;
        const priorItem = prior.budgetLineItems?.find(li => li.label === selectedLineItem);
        if (priorItem?.actual == null) continue;

        currSum += currItem.actual;
        priorSum += priorItem.actual;
        matched++;
      }
      if (matched > 0 && priorSum > 0) {
        yoyDelta = currSum - priorSum;
        yoyPct = (yoyDelta / priorSum) * 100;
      }
    }

    return { avgPerConf, avgPerAttendee, pctOfTotal, budgetAccuracy, yoyDelta, yoyPct };
  }, [activeConfs, selectedLineItem, priorYearConfs]);

  const hasData = activeConfs.length > 0 && activeLineItems.length > 0;
  const cardBorder = selectedLineItem ? `1.5px solid ${SELECTION_COLOR}` : undefined;

  return (
    <>
      {/* Card 1: Budget summary */}
      <div className={CARD} style={cardBorder ? { border: cardBorder } : undefined}>
        <div className="p-1 border-b border-gray-100 flex items-center justify-between">
          <p className={EYEBROW}>
            {selectedLineItem ? `Budget Summary — ${selectedLineItem}` : 'Budget Summary'}
          </p>
          {selectedLineItem && (
            <button
              onClick={() => onLineItemSelect(null)}
              className="text-gray-400 hover:text-gray-600 text-sm leading-none ml-2 flex-shrink-0"
              aria-label="Clear selection"
            >×</button>
          )}
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

        {/* Animated expansion: global metrics */}
        <div
          style={{
            maxHeight: selectedLineItem && globalMetrics ? 600 : 0,
            overflow: 'hidden',
            transition: 'max-height 0.35s ease',
          }}
        >
          <div className="border-t border-gray-100 px-4 pt-3 pb-2">
            <p className={`${EYEBROW} mb-2`}>Global {selectedLineItem} Cost Metrics</p>
            <div className="grid grid-cols-2 gap-2">
              <MetricCard
                label="Avg Cost / Conference"
                value={fmtCurrency(globalMetrics?.avgPerConf)}
              />
              <MetricCard
                label="Avg Cost / Attendee"
                value={fmtCurrency(globalMetrics?.avgPerAttendee)}
              />
              <MetricCard
                label="Y-o-Y Variance"
                value={globalMetrics?.yoyDelta != null ? `${globalMetrics.yoyDelta >= 0 ? '+' : ''}${fmtCurrency(globalMetrics.yoyDelta)}` : '—'}
                sub={globalMetrics?.yoyPct != null ? fmtPct(globalMetrics.yoyPct, true) : undefined}
                subColor={globalMetrics?.yoyPct != null ? (globalMetrics.yoyPct > 0 ? '#dc2626' : '#059669') : undefined}
              />
              <MetricCard
                label="% of Program Spend"
                value={globalMetrics?.pctOfTotal != null ? `${globalMetrics.pctOfTotal.toFixed(1)}%` : '—'}
              />
              <MetricCard
                label="Budget Accuracy"
                value={globalMetrics?.budgetAccuracy != null ? `${globalMetrics.budgetAccuracy.toFixed(1)}%` : '—'}
              />
            </div>
          </div>

          {/* Placeholder section */}
          <div className="border-t border-gray-100 px-4 pt-3 pb-3">
            <p className={`${EYEBROW} mb-2`}>{selectedLineItem} Specific Cost Metrics</p>
            <p className="text-[11px] text-gray-400 italic">More metrics coming soon.</p>
          </div>
        </div>
      </div>

      {/* Card 2: Spend composition */}
      <div className={CARD} style={cardBorder ? { border: cardBorder } : undefined}>
        <div className="p-1 border-b border-gray-100">
          <p className={EYEBROW}>
            {selectedLineItem ? `Spend Composition — ${selectedLineItem}` : 'Spend Composition'}
          </p>
        </div>
        <div className="px-4 py-4">
          {donutData.length === 0 ? (
            <p className="text-xs text-gray-300 text-center py-4">No spend data</p>
          ) : (
            <div className="flex items-center gap-6">
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
              <div className="flex-1 min-w-0 space-y-1.5 overflow-y-auto" style={{ maxHeight: 140 }}>
                {donutData.map(cat => {
                  const pct = donutTotal > 0 ? (cat.total / donutTotal) * 100 : 0;
                  const label = selectedLineItem
                    ? cat.label.replace(/\b\d{4}\b/, '').trim()
                    : cat.label;
                  return (
                    <div key={cat.label} className="flex items-center gap-2">
                      <span className="w-2 h-2 flex-shrink-0 rounded-sm" style={{ backgroundColor: cat.color }} />
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
    </>
  );
}
