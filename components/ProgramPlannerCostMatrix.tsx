'use client';

import React, { useState, useMemo } from 'react';

// ── Types ─────────────────────────────────────────────────────────────────────

interface BudgetLineItem {
  label: string;
  budgeted: number | null;
  actual: number | null;
}

interface ConferenceRow {
  conferenceId: number;
  name: string;
  startDate: string;
  budgetLineItems: BudgetLineItem[] | null;
  actualSpend: number | null;
  budgetTotal: number | null;
}

export type ProgramPlannerCostMatrixProps = {
  conferences: ConferenceRow[];
  year: number;
};

// ── Constants ─────────────────────────────────────────────────────────────────

const ALL_LINE_ITEMS = [
  'Registration', 'Sponsorship', 'Swag', 'Booth', 'Booth Setup',
  'Travel', 'Lodging', 'Entertainment', 'Meals', 'Other',
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtCurrency(v: number | null | undefined): string {
  if (v == null) return '—';
  return '$' + Math.round(v).toLocaleString();
}

function abbrevConfName(name: string): string {
  const words = name.replace(/\b\d{4}\b/, '').trim().split(/\s+/).slice(0, 2).join(' ');
  return words || name;
}

function getCellBackground(actual: number | null, budgeted: number | null): string {
  if (actual === null || budgeted === null || budgeted === 0)
    return 'var(--color-background-secondary, #F9FAFB)';
  const pct = ((actual - budgeted) / budgeted) * 100;
  if (pct < -10) return '#EAF3DE';
  if (pct < 0) return '#F3F8EC';
  if (pct === 0) return 'var(--color-background-secondary, #F9FAFB)';
  if (pct <= 10) return '#FEF4F4';
  return '#FCEBEB';
}

function getCellTextColor(actual: number | null, budgeted: number | null): string {
  if (actual === null || budgeted === null || budgeted === 0)
    return 'var(--color-text-secondary, #6B7280)';
  const pct = ((actual - budgeted) / budgeted) * 100;
  if (pct < -10) return '#27500A';
  if (pct < 0) return '#3B6D11';
  if (pct === 0) return 'var(--color-text-primary, #111827)';
  if (pct <= 10) return '#A32D2D';
  return '#791F1F';
}

// ── Component ─────────────────────────────────────────────────────────────────

export function ProgramPlannerCostMatrix({ conferences, year }: ProgramPlannerCostMatrixProps) {
  const [subView, setSubView] = useState<'actuals' | 'variance'>('actuals');

  // Line item remove/add — start with nothing removed
  const [removedLineItems, setRemovedLineItems] = useState<string[]>([]);
  const [animatingOutRows, setAnimatingOutRows] = useState<string[]>([]);
  const [animatingIntoPanel, setAnimatingIntoPanel] = useState<string[]>([]);

  const [activeConferenceIds, setActiveConferenceIds] = useState<number[]>(
    () => conferences.map(c => c.conferenceId)
  );
  const [confFilterExpanded, setConfFilterExpanded] = useState(false);

  // Active line items = all items NOT removed
  const activeLineItems = useMemo(
    () => ALL_LINE_ITEMS.filter(li => !removedLineItems.includes(li)),
    [removedLineItems]
  );

  // Active conferences subset, preserving order
  const activeConferences = useMemo(
    () => conferences.filter(c => activeConferenceIds.includes(c.conferenceId)),
    [conferences, activeConferenceIds]
  );

  // Build a lookup: confId → Map<lineItemLabel, { budgeted, actual }>
  const lineItemByConf = useMemo(() => {
    const map = new Map<number, Map<string, { budgeted: number | null; actual: number | null }>>();
    for (const conf of conferences) {
      const inner = new Map<string, { budgeted: number | null; actual: number | null }>();
      if (conf.budgetLineItems) {
        for (const li of conf.budgetLineItems) {
          inner.set(li.label, { budgeted: li.budgeted, actual: li.actual });
        }
      }
      map.set(conf.conferenceId, inner);
    }
    return map;
  }, [conferences]);

  // Per-conference total (actual and budgeted) across active line items
  const confTotals = useMemo(() => {
    return new Map(
      activeConferences.map(conf => {
        const inner = lineItemByConf.get(conf.conferenceId);
        let totalActual = 0;
        let totalBudgeted = 0;
        let hasAny = false;
        for (const label of activeLineItems) {
          const entry = inner?.get(label);
          if (entry?.actual != null) { totalActual += entry.actual; hasAny = true; }
          if (entry?.budgeted != null) totalBudgeted += entry.budgeted;
        }
        return [conf.conferenceId, { actual: hasAny ? totalActual : null, budgeted: totalBudgeted || null }];
      })
    );
  }, [activeConferences, lineItemByConf, activeLineItems]);

  // Program grand total
  const programTotal = useMemo(() => {
    let total = 0;
    activeConferences.forEach(conf => {
      const v = confTotals.get(conf.conferenceId);
      if (v?.actual != null) total += v.actual;
    });
    return total;
  }, [confTotals, activeConferences]);

  // Conference toggle helpers
  const toggleConference = (id: number) => {
    setActiveConferenceIds(prev =>
      prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id]
    );
  };

  // Remove a line item from the matrix into the panel
  const removeLineItem = (label: string) => {
    setAnimatingOutRows(prev => prev.includes(label) ? prev : [...prev, label]);
    setTimeout(() => {
      setAnimatingOutRows(prev => prev.filter(l => l !== label));
      setRemovedLineItems(prev => [...prev, label]);
      // Trigger slide-in animation for the panel item
      setAnimatingIntoPanel(prev => prev.includes(label) ? prev : [...prev, label]);
      setTimeout(() => {
        setAnimatingIntoPanel(prev => prev.filter(l => l !== label));
      }, 300);
    }, 220);
  };

  // Add a line item back from the panel into the matrix
  const addLineItem = (label: string) => {
    setRemovedLineItems(prev => prev.filter(l => l !== label));
  };

  const CONF_PILL_LIMIT = 8;
  const visibleConfs = confFilterExpanded ? conferences : conferences.slice(0, CONF_PILL_LIMIT);
  const hiddenCount = conferences.length - CONF_PILL_LIMIT;

  return (
    <div className="card p-0 overflow-hidden">
      {/* ── Filter strip — conferences only ─────────────────────────────── */}
      <div className="px-4 pt-3 pb-2 border-b border-gray-100 space-y-2.5">
        {/* Sub-view toggle */}
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold text-gray-800">FY{year} cost matrix</span>
          <div className="flex rounded-lg border border-gray-200 overflow-hidden">
            {(['actuals', 'variance'] as const).map((v, i) => (
              <button
                key={v}
                onClick={() => setSubView(v)}
                className={`px-3 py-1 text-xs font-medium transition-colors capitalize ${
                  subView === v ? 'bg-brand-primary text-white' : 'bg-white text-gray-500 hover:bg-gray-50'
                } ${i > 0 ? 'border-l border-gray-200' : ''}`}
              >
                {v.charAt(0).toUpperCase() + v.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {/* Conferences filter */}
        <div className="flex flex-wrap gap-4 items-start">
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1.5">Conferences</p>
            <div className="flex flex-wrap gap-1">
              {visibleConfs.map(conf => {
                const active = activeConferenceIds.includes(conf.conferenceId);
                return (
                  <button
                    key={conf.conferenceId}
                    onClick={() => toggleConference(conf.conferenceId)}
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[12px] font-medium transition-colors max-w-[120px] truncate ${
                      active
                        ? 'bg-blue-50 text-blue-800 border-blue-200'
                        : 'bg-gray-50 text-gray-400 border-gray-200'
                    }`}
                  >
                    {active && (
                      <svg className="w-2.5 h-2.5 flex-shrink-0 flex-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                    <span className="truncate">{conf.name.length > 14 ? conf.name.slice(0, 13) + '…' : conf.name}</span>
                  </button>
                );
              })}
              {!confFilterExpanded && hiddenCount > 0 && (
                <button
                  onClick={() => setConfFilterExpanded(true)}
                  className="px-2 py-0.5 rounded-full border border-gray-200 bg-gray-50 text-[12px] text-gray-500 hover:bg-gray-100"
                >
                  +{hiddenCount} more
                </button>
              )}
            </div>
          </div>

          {/* Select / Clear all conferences */}
          <div className="flex flex-col gap-1 flex-shrink-0 justify-start pt-4">
            <button
              onClick={() => setActiveConferenceIds(conferences.map(c => c.conferenceId))}
              className="text-[12px] text-brand-secondary hover:text-brand-primary whitespace-nowrap"
            >
              Select all
            </button>
            <button
              onClick={() => setActiveConferenceIds([])}
              className="text-[12px] text-gray-400 hover:text-gray-600 whitespace-nowrap"
            >
              Clear all
            </button>
          </div>
        </div>
      </div>

      {/* ── Matrix area ─────────────────────────────────────────────────── */}
      <div className="flex">
        {/* Add Line Items panel — only shown when items have been removed */}
        {removedLineItems.length > 0 && (
          <div
            className="flex-shrink-0 border-r border-gray-200 bg-gray-50"
            style={{ minWidth: 140 }}
          >
            <div className="px-3 py-2 border-b border-gray-100">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                Add Line Item(s)
              </p>
            </div>
            <div className="py-1.5 space-y-0.5">
              {removedLineItems.map(label => (
                <div
                  key={label}
                  className="mx-2 flex items-center justify-between px-3 py-1.5 rounded text-[12px] font-medium text-gray-700 bg-white border border-gray-200"
                  style={{
                    transition: 'opacity 0.25s ease, transform 0.25s ease',
                    opacity: animatingIntoPanel.includes(label) ? 0 : 1,
                    transform: animatingIntoPanel.includes(label) ? 'translateX(-10px)' : 'translateX(0)',
                  }}
                >
                  <span>{label}</span>
                  <button
                    onClick={() => addLineItem(label)}
                    title={`Add ${label} back`}
                    className="ml-2 w-4 h-4 flex items-center justify-center rounded-full bg-gray-100 hover:bg-brand-primary hover:text-white text-gray-500 transition-colors text-xs font-bold leading-none flex-shrink-0"
                  >
                    +
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Scrollable matrix table */}
        <div style={{ overflowX: 'auto' }} className="flex-1">
          <table
            style={{ tableLayout: 'fixed', width: 130 + activeConferences.length * 88 + 88 }}
            className="border-collapse text-xs"
          >
            <colgroup>
              <col style={{ width: 130 }} />
              {activeConferences.map(c => <col key={c.conferenceId} style={{ width: 88 }} />)}
              <col style={{ width: 88 }} />
            </colgroup>

            {/* Header */}
            <thead>
              <tr className="border-b border-gray-200">
                <th
                  className="px-3 py-2 text-left text-[12px] font-semibold text-gray-700"
                  style={{ position: 'sticky', left: 0, zIndex: 2, backgroundColor: 'var(--color-background-primary, white)' }}
                />
                {activeConferences.map(conf => (
                  <th
                    key={conf.conferenceId}
                    className="px-2 py-2 text-right text-[12px] font-semibold text-gray-700 leading-tight"
                  >
                    {abbrevConfName(conf.name)}
                  </th>
                ))}
                <th
                  className="px-2 py-2 text-right text-[12px] font-semibold text-gray-700"
                  style={{ backgroundColor: 'var(--color-background-secondary, #F9FAFB)' }}
                >
                  Total
                </th>
              </tr>
            </thead>

            <tbody>
              {/* Line item rows */}
              {ALL_LINE_ITEMS
                .filter(li => !removedLineItems.includes(li))
                .map((label, rowIdx) => {
                  const isOdd = rowIdx % 2 === 1;
                  const rowBg = isOdd ? 'var(--color-background-secondary, #F9FAFB)' : 'var(--color-background-primary, white)';
                  const isAnimatingOut = animatingOutRows.includes(label);

                  // Row total across active conferences
                  let rowTotal = 0;
                  let rowBudgeted = 0;
                  let rowHasData = false;
                  for (const conf of activeConferences) {
                    const entry = lineItemByConf.get(conf.conferenceId)?.get(label);
                    if (entry?.actual != null) { rowTotal += entry.actual; rowHasData = true; }
                    if (entry?.budgeted != null) rowBudgeted += entry.budgeted;
                  }

                  return (
                    <tr
                      key={label}
                      style={{
                        transition: 'opacity 0.22s ease, transform 0.22s ease',
                        opacity: isAnimatingOut ? 0 : 1,
                        transform: isAnimatingOut ? 'translateX(-8px)' : 'translateX(0)',
                      }}
                    >
                      {/* Label cell with minus button */}
                      <td
                        className="px-3 py-1.5 border-b border-gray-50"
                        style={{ position: 'sticky', left: 0, zIndex: 2, backgroundColor: rowBg }}
                      >
                        <div className="flex items-center justify-between gap-1">
                          <span className="text-[12px] font-medium text-gray-700">{label}</span>
                          <button
                            onClick={() => removeLineItem(label)}
                            title={`Remove ${label}`}
                            className="w-4 h-4 flex items-center justify-center rounded-full bg-gray-100 hover:bg-red-100 hover:text-red-500 text-gray-400 transition-colors text-xs font-bold leading-none flex-shrink-0"
                          >
                            −
                          </button>
                        </div>
                      </td>

                      {/* Conference cells */}
                      {activeConferences.map(conf => {
                        const entry = lineItemByConf.get(conf.conferenceId)?.get(label);
                        const actual = entry?.actual ?? null;
                        const budgeted = entry?.budgeted ?? null;

                        if (actual === null && budgeted === null) {
                          return (
                            <td
                              key={conf.conferenceId}
                              className="px-2 py-1.5 text-center text-gray-300 border-b border-gray-50"
                              style={{ backgroundColor: 'var(--color-background-secondary, #F9FAFB)' }}
                            >
                              —
                            </td>
                          );
                        }

                        const cellBg = getCellBackground(actual, budgeted);
                        const cellColor = getCellTextColor(actual, budgeted);

                        if (subView === 'actuals') {
                          return (
                            <td
                              key={conf.conferenceId}
                              className="border-b border-gray-50"
                              style={{ backgroundColor: cellBg }}
                            >
                              <div className="flex flex-col items-end justify-center px-2 py-1.5 h-full">
                                <span className="text-[12px] font-medium" style={{ color: cellColor }}>
                                  {fmtCurrency(actual)}
                                </span>
                              </div>
                            </td>
                          );
                        }

                        // Variance mode
                        const variance = actual != null && budgeted != null ? actual - budgeted : null;
                        const variancePct =
                          variance != null && budgeted != null && budgeted !== 0
                            ? (variance / budgeted) * 100
                            : null;

                        return (
                          <td
                            key={conf.conferenceId}
                            className="border-b border-gray-50"
                            style={{ backgroundColor: cellBg }}
                          >
                            <div className="flex flex-col items-end justify-center px-2 py-1.5 h-full">
                              <span className="text-[12px] font-medium" style={{ color: cellColor }}>
                                {variance != null ? `${variance > 0 ? '+' : ''}${fmtCurrency(variance)}` : '—'}
                              </span>
                              {variancePct != null && (
                                <span className="text-[9px] opacity-75" style={{ color: cellColor }}>
                                  {variancePct > 0 ? '+' : ''}{variancePct.toFixed(1)}%
                                </span>
                              )}
                            </div>
                          </td>
                        );
                      })}

                      {/* Total cell */}
                      <td
                        className="px-2 py-1.5 text-right border-b border-gray-50"
                        style={{ backgroundColor: 'var(--color-background-secondary, #F9FAFB)' }}
                      >
                        {subView === 'actuals' ? (
                          <span className="text-[12px] font-bold text-gray-700">
                            {rowHasData ? fmtCurrency(rowTotal) : '—'}
                          </span>
                        ) : (
                          <span className="text-[12px] font-bold text-gray-700">
                            {rowHasData && rowBudgeted > 0
                              ? `${rowTotal - rowBudgeted > 0 ? '+' : ''}${fmtCurrency(rowTotal - rowBudgeted)}`
                              : '—'}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}

              {/* Total row */}
              <tr className="border-t-2 border-gray-200">
                <td
                  className="px-3 py-2 text-[12px] font-bold text-gray-800"
                  style={{ position: 'sticky', left: 0, zIndex: 2, backgroundColor: 'var(--color-background-secondary, #F9FAFB)' }}
                >
                  Total
                </td>
                {activeConferences.map(conf => {
                  const totals = confTotals.get(conf.conferenceId);
                  const actual = totals?.actual ?? null;
                  const budgeted = totals?.budgeted ?? null;
                  const cellBg = getCellBackground(actual, budgeted);
                  const cellColor = getCellTextColor(actual, budgeted);

                  if (subView === 'actuals') {
                    return (
                      <td
                        key={conf.conferenceId}
                        className="border-b border-gray-50"
                        style={{ backgroundColor: cellBg }}
                      >
                        <div className="flex flex-col items-end justify-center px-2 py-2">
                          <span className="text-[12px] font-bold" style={{ color: cellColor }}>
                            {fmtCurrency(actual)}
                          </span>
                        </div>
                      </td>
                    );
                  }

                  const variance = actual != null && budgeted != null ? actual - budgeted : null;
                  const cellBgV = getCellBackground(actual, budgeted);
                  const cellColorV = getCellTextColor(actual, budgeted);
                  return (
                    <td key={conf.conferenceId} className="border-b border-gray-50" style={{ backgroundColor: cellBgV }}>
                      <div className="flex flex-col items-end justify-center px-2 py-2">
                        <span className="text-[12px] font-bold" style={{ color: cellColorV }}>
                          {variance != null ? `${variance > 0 ? '+' : ''}${fmtCurrency(variance)}` : '—'}
                        </span>
                      </div>
                    </td>
                  );
                })}
                <td
                  className="px-2 py-2 text-right"
                  style={{ backgroundColor: 'var(--color-background-secondary, #F9FAFB)' }}
                >
                  <span className="text-[12px] font-bold text-gray-800">{fmtCurrency(programTotal)}</span>
                </td>
              </tr>

              {/* % of program row (actuals) or % variance row (variance) */}
              <tr>
                <td
                  className="px-3 py-2 text-[10px] text-gray-400 italic"
                  style={{ position: 'sticky', left: 0, zIndex: 2, backgroundColor: 'var(--color-background-secondary, #F9FAFB)' }}
                >
                  {subView === 'actuals' ? '% of program' : '% variance'}
                </td>
                {activeConferences.map(conf => {
                  const totals = confTotals.get(conf.conferenceId);
                  const actual = totals?.actual ?? null;
                  const budgeted = totals?.budgeted ?? null;

                  if (subView === 'actuals') {
                    const pct = programTotal > 0 && actual != null ? (actual / programTotal) * 100 : null;
                    return (
                      <td
                        key={conf.conferenceId}
                        className="px-2 py-2 text-right"
                        style={{ backgroundColor: 'var(--color-background-secondary, #F9FAFB)' }}
                      >
                        <span className="text-[10px] text-gray-500">
                          {pct != null ? `${pct.toFixed(1)}%` : '—'}
                        </span>
                      </td>
                    );
                  }

                  // variance mode — % variance vs budget
                  const variancePct =
                    actual != null && budgeted != null && budgeted > 0
                      ? ((actual - budgeted) / budgeted) * 100
                      : null;
                  return (
                    <td
                      key={conf.conferenceId}
                      className="px-2 py-2 text-right"
                      style={{ backgroundColor: 'var(--color-background-secondary, #F9FAFB)' }}
                    >
                      <span className="text-[10px] text-gray-500">
                        {variancePct != null
                          ? `${variancePct > 0 ? '+' : ''}${variancePct.toFixed(1)}%`
                          : '—'}
                      </span>
                    </td>
                  );
                })}
                <td
                  className="px-2 py-2"
                  style={{ backgroundColor: 'var(--color-background-secondary, #F9FAFB)' }}
                />
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Heatmap legend ───────────────────────────────────────────────── */}
      <div className="px-4 py-2.5 border-t border-gray-100 flex items-center gap-3 flex-wrap">
        <span className="text-[12px] text-gray-400 font-medium mr-1">Heatmap:</span>
        {[
          { bg: '#EAF3DE', color: '#27500A', label: '>10% under' },
          { bg: '#F3F8EC', color: '#3B6D11', label: '1–10% under' },
          { bg: 'var(--color-background-secondary, #F9FAFB)', color: '#6B7280', label: 'On budget' },
          { bg: '#FEF4F4', color: '#A32D2D', label: '1–10% over' },
          { bg: '#FCEBEB', color: '#791F1F', label: '>10% over' },
        ].map(({ bg, color, label }) => (
          <div key={label} className="flex items-center gap-1.5">
            <span
              className="w-3 h-3 rounded-sm border border-gray-200 flex-shrink-0"
              style={{ backgroundColor: bg }}
            />
            <span className="text-[12px]" style={{ color }}>{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
