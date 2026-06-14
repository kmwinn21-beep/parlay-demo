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
  startDate: string;
  endDate: string;
  actualSpend: number | null;
  budgetTotal: number | null;
  budgetLineItems: BudgetLineItem[] | null;
}

interface Props {
  conference: ConferenceRow;
  onClose: () => void;
}

const HEADER_BG = 'rgb(var(--brand-primary-rgb))';

const SPEND_CATEGORIES = [
  { label: 'Reg + Sponsorship', items: ['Registration', 'Sponsorship'], color: '#185FA5' },
  { label: 'Booth + Setup',     items: ['Booth Setup', 'Booth'],        color: '#7F77DD' },
  { label: 'People costs',      items: ['Travel', 'Lodging'],           color: '#1D9E75' },
  { label: 'Ent + Meals',       items: ['Entertainment', 'Meals', 'Swag', 'Other'], color: '#EF9F27' },
];

function fmtCurrency(v: number | null | undefined): string {
  if (v == null) return '—';
  return '$' + Math.round(v).toLocaleString();
}

function fmtCurrencyFull(v: number): string {
  return '$' + Math.abs(Math.round(v)).toLocaleString();
}

function fmtDateRange(start: string, end: string): string {
  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const s = new Date(start + 'T00:00:00');
  const e = new Date(end + 'T00:00:00');
  if (isNaN(s.getTime()) || isNaN(e.getTime())) return '';
  if (s.getFullYear() === e.getFullYear() && s.getMonth() === e.getMonth()) {
    return `${MONTHS[s.getMonth()]} ${s.getDate()}–${e.getDate()}, ${s.getFullYear()}`;
  }
  if (s.getFullYear() === e.getFullYear()) {
    return `${MONTHS[s.getMonth()]} ${s.getDate()} – ${MONTHS[e.getMonth()]} ${e.getDate()}, ${s.getFullYear()}`;
  }
  return `${MONTHS[s.getMonth()]} ${s.getDate()}, ${s.getFullYear()} – ${MONTHS[e.getMonth()]} ${e.getDate()}, ${e.getFullYear()}`;
}

const EYEBROW = 'text-[10px] font-semibold uppercase tracking-wider text-gray-900';

export function ConferenceBudgetDrawer({ conference, onClose }: Props) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  const lineItems = useMemo(() => {
    return (conference.budgetLineItems ?? []).filter(
      li => (li.budgeted ?? 0) > 0 || (li.actual ?? 0) > 0
    );
  }, [conference.budgetLineItems]);

  // Category donut (same visual format as LineItemCostDrawer)
  const donutData = useMemo(() => {
    return SPEND_CATEGORIES.map(cat => {
      const total = lineItems
        .filter(li => cat.items.includes(li.label))
        .reduce((s, li) => s + (li.actual ?? 0), 0);
      return { ...cat, total };
    }).filter(d => d.total > 0);
  }, [lineItems]);

  const donutTotal = donutData.reduce((s, d) => s + d.total, 0);

  const dateRange = fmtDateRange(conference.startDate, conference.endDate);

  if (!mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end sm:items-stretch sm:justify-end">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />

      <div className="drawer-mobile-responsive relative flex flex-col bg-white w-full sm:w-[460px] h-[90vh] sm:h-full shadow-2xl rounded-t-2xl sm:rounded-tl-2xl sm:rounded-bl-2xl sm:rounded-tr-none sm:rounded-br-none overflow-hidden">

        {/* Header */}
        <div className="flex-shrink-0 px-4 py-3" style={{ backgroundColor: HEADER_BG }}>
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-[9px] font-bold uppercase tracking-widest text-white/60 mb-0.5">Cost Breakdown</p>
              <p className="text-[15px] font-bold text-white leading-tight truncate">{conference.name}</p>
              {dateRange && <p className="text-[11px] text-white/70 mt-0.5">{dateRange}</p>}
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

          {/* Spend Composition donut */}
          {donutData.length > 0 && (
            <div className="px-4 pt-4 pb-3 border-b border-gray-100">
              <p className={`${EYEBROW} mb-3`}>Spend Composition</p>
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
                <div className="flex-1 min-w-0 space-y-1.5">
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
            </div>
          )}

          {/* Budget vs Actual table */}
          <div className="px-4 pt-3 pb-5">
            <p className={`${EYEBROW} mb-2`}>Budget vs. Actual</p>
            {lineItems.length === 0 ? (
              <p className="text-[11px] text-gray-400 italic">No budget data available.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <th className="text-left text-[10px] font-semibold uppercase tracking-wider text-gray-400 pb-2 pr-3">Line Item</th>
                      <th className="text-right text-[10px] font-semibold uppercase tracking-wider text-gray-400 pb-2 px-2">Budget</th>
                      <th className="text-right text-[10px] font-semibold uppercase tracking-wider text-gray-400 pb-2 px-2">Actual</th>
                      <th className="text-right text-[10px] font-semibold uppercase tracking-wider text-gray-400 pb-2 px-2">Var ($)</th>
                      <th className="text-right text-[10px] font-semibold uppercase tracking-wider text-gray-400 pb-2 pl-2">Var (%)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lineItems.map((item, i) => {
                      const budgeted = item.budgeted ?? 0;
                      const actual = item.actual ?? 0;
                      const varDollar = actual - budgeted;
                      const varPct = budgeted > 0 ? (varDollar / budgeted) * 100 : null;
                      const over = varDollar > 0;
                      const rowBg = i % 2 === 1 ? 'bg-gray-50' : '';
                      const pillClass = over
                        ? 'inline-block px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-red-50 text-red-700'
                        : 'inline-block px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-green-50 text-green-700';
                      return (
                        <tr key={item.label} className={rowBg}>
                          <td className="py-1.5 pr-3 text-[11px] text-gray-700">{item.label}</td>
                          <td className="py-1.5 px-2 text-right text-[11px] text-gray-600 tabular-nums">
                            {budgeted > 0 ? fmtCurrency(budgeted) : '—'}
                          </td>
                          <td className="py-1.5 px-2 text-right text-[11px] text-gray-600 tabular-nums">
                            {actual > 0 ? fmtCurrency(actual) : '—'}
                          </td>
                          <td className="py-1.5 px-2 text-right">
                            {budgeted > 0 ? (
                              <span className={pillClass}>
                                {over ? '+' : '-'}{fmtCurrencyFull(varDollar)}
                              </span>
                            ) : <span className="text-[10px] text-gray-400">—</span>}
                          </td>
                          <td className="py-1.5 pl-2 text-right">
                            {varPct != null ? (
                              <span className={pillClass}>
                                {over ? '+' : ''}{varPct.toFixed(1)}%
                              </span>
                            ) : <span className="text-[10px] text-gray-400">—</span>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  {/* Totals row */}
                  {(conference.budgetTotal != null || conference.actualSpend != null) && (
                    <tfoot>
                      <tr className="border-t-2 border-gray-200">
                        <td className="pt-2 pr-3 text-[11px] font-bold text-gray-800">Total</td>
                        <td className="pt-2 px-2 text-right text-[11px] font-bold text-gray-800 tabular-nums">
                          {fmtCurrency(conference.budgetTotal)}
                        </td>
                        <td className="pt-2 px-2 text-right text-[11px] font-bold text-gray-800 tabular-nums">
                          {fmtCurrency(conference.actualSpend)}
                        </td>
                        {(() => {
                          const totalVar = (conference.actualSpend ?? 0) - (conference.budgetTotal ?? 0);
                          const totalVarPct = (conference.budgetTotal ?? 0) > 0
                            ? (totalVar / conference.budgetTotal!) * 100
                            : null;
                          const over = totalVar > 0;
                          const pillClass = over
                            ? 'inline-block px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-red-50 text-red-700'
                            : 'inline-block px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-green-50 text-green-700';
                          return (
                            <>
                              <td className="pt-2 px-2 text-right">
                                {conference.budgetTotal != null && conference.actualSpend != null ? (
                                  <span className={pillClass}>
                                    {over ? '+' : '-'}{fmtCurrencyFull(totalVar)}
                                  </span>
                                ) : <span className="text-[10px] text-gray-400">—</span>}
                              </td>
                              <td className="pt-2 pl-2 text-right">
                                {totalVarPct != null ? (
                                  <span className={pillClass}>
                                    {over ? '+' : ''}{totalVarPct.toFixed(1)}%
                                  </span>
                                ) : <span className="text-[10px] text-gray-400">—</span>}
                              </td>
                            </>
                          );
                        })()}
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            )}
          </div>

        </div>
      </div>
    </div>,
    document.body
  );
}
