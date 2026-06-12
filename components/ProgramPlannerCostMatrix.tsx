'use client';

import React, { useState, useMemo, useEffect } from 'react';

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
  activeConferenceIds: number[];
  onActiveConferenceIdsChange: (ids: number[]) => void;
  activeLineItems: string[];
  onActiveLineItemsChange: (items: string[]) => void;
  selectedLineItem: string | null;
  onLineItemSelect: (label: string | null) => void;
};

// ── Constants ─────────────────────────────────────────────────────────────────

const ALL_LINE_ITEMS = [
  'Registration', 'Sponsorship', 'Swag', 'Booth', 'Booth Setup',
  'Travel', 'Lodging', 'Entertainment', 'Meals', 'Other',
];

// Cyclic color palette for % pills (6 colors, repeated per conference column)
const PCT_PILL_COLORS = [
  { bg: '#EBF2FC', color: '#185FA5', border: '#C8DCF5' },
  { bg: '#ECFDF5', color: '#059669', border: '#A7F3D0' },
  { bg: '#F3F2FD', color: '#6D62D4', border: '#DDD9FB' },
  { bg: '#FFFBEB', color: '#B45309', border: '#FDE68A' },
  { bg: '#FEF2EE', color: '#C4441F', border: '#FBD0C4' },
  { bg: '#F0F7EC', color: '#3B6D11', border: '#B8D9A7' },
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

// ── Animated sliding toggle ───────────────────────────────────────────────────

function AnimatedToggle({
  options, value, onChange, activeBg, className = '',
}: {
  options: { id: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
  activeBg: string;
  className?: string;
}) {
  const n = options.length;
  const activeIdx = Math.max(0, options.findIndex(o => o.id === value));
  return (
    <div className={`relative flex bg-white rounded-xl border border-gray-200 p-1 ${className}`}>
      <div
        className={`absolute top-1 bottom-1 rounded-lg pointer-events-none ${activeBg}`}
        style={{
          width: `calc((100% - 8px) / ${n})`,
          left: `calc(4px + ${activeIdx} * (100% - 8px) / ${n})`,
          transition: 'left 0.2s cubic-bezier(0.4,0,0.2,1), background-color 0.2s ease',
        }}
      />
      {options.map(opt => (
        <button
          key={opt.id}
          onClick={() => onChange(opt.id)}
          className={`relative z-10 flex-1 text-center px-3 py-1.5 text-xs font-medium transition-colors duration-150 ${
            opt.id === value ? 'text-white' : 'text-gray-600 hover:text-gray-800'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

// ── Vertical toggle ───────────────────────────────────────────────────────────

function VerticalToggle({
  allActive, noneActive, onAll, onNone, accentClass = 'bg-brand-accent',
}: {
  allActive: boolean; noneActive: boolean;
  onAll: () => void; onNone: () => void;
  accentClass?: string;
}) {
  return (
    <div className="flex flex-col gap-0.5 bg-white rounded-xl border border-gray-200 p-0.5 w-fit">
      <button
        onClick={onAll}
        className={`px-2 py-1 rounded-lg text-[10px] font-semibold transition-colors whitespace-nowrap ${
          allActive ? `${accentClass} text-white` : 'text-gray-500 hover:bg-gray-100'
        }`}
      >All</button>
      <button
        onClick={onNone}
        className={`px-2 py-1 rounded-lg text-[10px] font-semibold transition-colors whitespace-nowrap ${
          noneActive ? `${accentClass} text-white` : 'text-gray-500 hover:bg-gray-100'
        }`}
      >None</button>
    </div>
  );
}

// ── Animation duration ────────────────────────────────────────────────────────

const ANIM_MS = 300;
const INNER_TRANSITION = `max-height ${ANIM_MS}ms ease, padding-top ${ANIM_MS}ms ease, padding-bottom ${ANIM_MS}ms ease, opacity 0.22s ease`;

function innerStyle(collapsed: boolean, px: number): React.CSSProperties {
  return {
    overflow: 'hidden',
    maxHeight: collapsed ? '0px' : '40px',
    paddingTop: collapsed ? '0px' : '6px',
    paddingBottom: collapsed ? '0px' : '6px',
    paddingLeft: px,
    paddingRight: px,
    opacity: collapsed ? 0 : 1,
    transition: INNER_TRANSITION,
  };
}

// ── Component ─────────────────────────────────────────────────────────────────

export function ProgramPlannerCostMatrix({
  conferences,
  year,
  activeConferenceIds,
  onActiveConferenceIdsChange,
  activeLineItems,
  onActiveLineItemsChange,
  selectedLineItem,
  onLineItemSelect,
}: ProgramPlannerCostMatrixProps) {
  const [subView, setSubView] = useState<'actuals' | 'variance'>('actuals');

  // Line item remove/add — start with nothing removed
  const [removedLineItems, setRemovedLineItems] = useState<string[]>([]);
  const [animatingOutRows, setAnimatingOutRows] = useState<string[]>([]);
  const [animatingIntoPanel, setAnimatingIntoPanel] = useState<string[]>([]);
  const [animatingInRows, setAnimatingInRows] = useState<string[]>([]);

  // Column (conference) remove/add animation state
  const [animatingOutCols, setAnimatingOutCols] = useState<number[]>([]);
  const [animatingInCols, setAnimatingInCols] = useState<number[]>([]);
  const [animatingIntoConfPanel, setAnimatingIntoConfPanel] = useState<number[]>([]);

  // On mount: initialize parent state with all conference IDs and all line items
  useEffect(() => {
    onActiveConferenceIdsChange(conferences.map(c => c.conferenceId));
    onActiveLineItemsChange(ALL_LINE_ITEMS.slice());
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // intentionally only on mount

  // Internal activeLineItems derived from removedLineItems (for matrix rendering and computation)
  const internalActiveLineItems = useMemo(
    () => ALL_LINE_ITEMS.filter(li => !removedLineItems.includes(li)),
    [removedLineItems]
  );

  // Active conferences subset, preserving order
  const activeConferences = useMemo(
    () => conferences.filter(c => activeConferenceIds.includes(c.conferenceId)),
    [conferences, activeConferenceIds]
  );

  // Removed conferences (not in activeConferenceIds)
  const removedConferences = useMemo(
    () => conferences.filter(c => !activeConferenceIds.includes(c.conferenceId)),
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
        for (const label of internalActiveLineItems) {
          const entry = inner?.get(label);
          if (entry?.actual != null) { totalActual += entry.actual; hasAny = true; }
          if (entry?.budgeted != null) totalBudgeted += entry.budgeted;
        }
        return [conf.conferenceId, { actual: hasAny ? totalActual : null, budgeted: totalBudgeted || null }];
      })
    );
  }, [activeConferences, lineItemByConf, internalActiveLineItems]);

  // Program grand total
  const programTotal = useMemo(() => {
    let total = 0;
    activeConferences.forEach(conf => {
      const v = confTotals.get(conf.conferenceId);
      if (v?.actual != null) total += v.actual;
    });
    return total;
  }, [confTotals, activeConferences]);

  // ── Conference column remove / add ────────────────────────────────────────

  const removeConference = (confId: number) => {
    setAnimatingOutCols(prev => prev.includes(confId) ? prev : [...prev, confId]);
    setTimeout(() => {
      setAnimatingOutCols(prev => prev.filter(id => id !== confId));
      onActiveConferenceIdsChange(activeConferenceIds.filter(id => id !== confId));
      setAnimatingIntoConfPanel(prev => [...prev, confId]);
      setTimeout(() => setAnimatingIntoConfPanel(prev => prev.filter(id => id !== confId)), 300);
    }, ANIM_MS);
  };

  const addConference = (confId: number) => {
    onActiveConferenceIdsChange([...activeConferenceIds, confId]);
    setAnimatingInCols(prev => [...prev, confId]);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setAnimatingInCols(prev => prev.filter(id => id !== confId));
      });
    });
  };

  // ── Line item remove / add ────────────────────────────────────────────────

  const removeLineItem = (label: string) => {
    setAnimatingOutRows(prev => prev.includes(label) ? prev : [...prev, label]);
    setTimeout(() => {
      setAnimatingOutRows(prev => prev.filter(l => l !== label));
      setRemovedLineItems(prev => {
        const next = [...prev, label];
        onActiveLineItemsChange(ALL_LINE_ITEMS.filter(li => !next.includes(li)));
        return next;
      });
      setAnimatingIntoPanel(prev => prev.includes(label) ? prev : [...prev, label]);
      setTimeout(() => {
        setAnimatingIntoPanel(prev => prev.filter(l => l !== label));
      }, 300);
    }, ANIM_MS);
  };

  const addLineItem = (label: string) => {
    setAnimatingInRows(prev => [...prev, label]);
    setRemovedLineItems(prev => {
      const next = prev.filter(l => l !== label);
      onActiveLineItemsChange(ALL_LINE_ITEMS.filter(li => !next.includes(li)));
      return next;
    });
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setAnimatingInRows(prev => prev.filter(l => l !== label));
      });
    });
  };

  const removeAllLineItems = () => {
    const toRemove = ALL_LINE_ITEMS.filter(li => !removedLineItems.includes(li));
    if (toRemove.length === 0) return;
    setAnimatingOutRows(toRemove);
    setTimeout(() => {
      setAnimatingOutRows([]);
      setRemovedLineItems(ALL_LINE_ITEMS.slice());
      onActiveLineItemsChange([]);
      setAnimatingIntoPanel(toRemove);
      setTimeout(() => setAnimatingIntoPanel([]), 300);
    }, ANIM_MS);
  };

  const addAllLineItems = () => {
    const toAdd = [...removedLineItems];
    if (toAdd.length === 0) return;
    setAnimatingInRows(toAdd);
    setRemovedLineItems([]);
    onActiveLineItemsChange(ALL_LINE_ITEMS.slice());
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setAnimatingInRows([]);
      });
    });
  };

  // Derived toggle states
  const allLineItemsActive = removedLineItems.length === 0;
  const noLineItemsActive = removedLineItems.length === ALL_LINE_ITEMS.length;

  return (
    <div className="card p-0 overflow-hidden">
      {/* ── Filter strip ────────────────────────────────────────────────── */}
      <div className="px-4 pt-3 pb-2 border-b border-gray-100">
        {/* Sub-view toggle */}
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold text-gray-800">FY{year} cost matrix</span>
          <AnimatedToggle
            options={[{ id: 'actuals', label: 'Actuals' }, { id: 'variance', label: 'Variance' }]}
            value={subView}
            onChange={v => setSubView(v as 'actuals' | 'variance')}
            activeBg="bg-brand-accent"
            className="w-[180px]"
          />
        </div>
      </div>

      {/* ── Matrix area ─────────────────────────────────────────────────── */}
      <div className="flex">
        {/* Add panel — slides in from left; always in DOM for animation */}
        <div
          className="flex-shrink-0 overflow-hidden bg-gray-50"
          style={{
            maxWidth: (removedConferences.length > 0 || removedLineItems.length > 0) ? '180px' : '0px',
            transition: 'max-width 0.3s ease',
          }}
        >
          <div className="border-r border-gray-200 h-full" style={{ width: 180 }}>
            {/* +/- Conference(s) section */}
            {removedConferences.length > 0 && (
              <div className="border-b border-gray-200">
                <div className="px-3 py-2 border-b border-gray-100">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                    +/- Conference(s)
                  </p>
                </div>
                <div className="py-1.5 space-y-0.5">
                  {removedConferences.map(conf => (
                    <div
                      key={conf.conferenceId}
                      className="mx-2 flex items-center justify-between px-3 py-1.5 rounded text-[12px] font-medium text-gray-700 bg-white border border-gray-200"
                      style={{
                        transition: 'opacity 0.25s ease, transform 0.25s ease',
                        opacity: animatingIntoConfPanel.includes(conf.conferenceId) ? 0 : 1,
                        transform: animatingIntoConfPanel.includes(conf.conferenceId) ? 'translateX(-10px)' : 'translateX(0)',
                      }}
                    >
                      <span className="truncate text-[11px]">{conf.name.replace(/\b\d{4}\b/, '').trim()}</span>
                      <button
                        onClick={() => addConference(conf.conferenceId)}
                        title={`Add ${conf.name} back`}
                        className="ml-2 w-4 h-4 flex items-center justify-center rounded-full bg-gray-100 hover:bg-brand-accent hover:text-white text-gray-500 transition-colors text-xs font-bold leading-none flex-shrink-0"
                      >+</button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* +/- Line Item(s) section */}
            {removedLineItems.length > 0 && (
              <div>
                <div className="px-3 py-2 border-b border-gray-100">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                    +/- Line Item(s)
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
                        className="ml-2 w-4 h-4 flex items-center justify-center rounded-full bg-gray-100 hover:bg-brand-accent hover:text-white text-gray-500 transition-colors text-xs font-bold leading-none flex-shrink-0"
                      >+</button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

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
                {/* First column header: line items All/None toggle */}
                <th
                  className="px-2 py-2 text-left"
                  style={{ position: 'sticky', left: 0, zIndex: 2, backgroundColor: 'var(--color-background-primary, white)' }}
                >
                  <VerticalToggle
                    allActive={allLineItemsActive}
                    noneActive={noLineItemsActive}
                    onAll={addAllLineItems}
                    onNone={removeAllLineItems}
                    accentClass="bg-brand-accent"
                  />
                </th>
                {activeConferences.map(conf => {
                  const isAnimatingOut = animatingOutCols.includes(conf.conferenceId);
                  const isAnimatingIn = animatingInCols.includes(conf.conferenceId);
                  return (
                    <th
                      key={conf.conferenceId}
                      className="px-2 py-2 text-center text-[12px] font-semibold text-gray-700 leading-tight"
                      style={{
                        opacity: isAnimatingOut || isAnimatingIn ? 0 : 1,
                        transform: isAnimatingOut ? 'translateY(-6px)' : isAnimatingIn ? 'translateY(6px)' : 'none',
                        transition: `opacity ${ANIM_MS}ms ease, transform ${ANIM_MS}ms ease`,
                      }}
                    >
                      <div className="flex flex-col items-center gap-0.5">
                        <span>{abbrevConfName(conf.name)}</span>
                        <button
                          onClick={() => removeConference(conf.conferenceId)}
                          title={`Remove ${conf.name}`}
                          className="w-4 h-4 flex items-center justify-center rounded-full bg-gray-100 hover:bg-red-100 hover:text-red-500 text-gray-400 transition-colors text-xs font-bold leading-none flex-shrink-0"
                        >−</button>
                      </div>
                    </th>
                  );
                })}
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
                  const isAnimatingIn = animatingInRows.includes(label);
                  const collapsed = isAnimatingOut || isAnimatingIn;

                  // Row total across active conferences
                  let rowTotal = 0;
                  let rowBudgeted = 0;
                  let rowHasData = false;
                  for (const conf of activeConferences) {
                    const entry = lineItemByConf.get(conf.conferenceId)?.get(label);
                    if (entry?.actual != null) { rowTotal += entry.actual; rowHasData = true; }
                    if (entry?.budgeted != null) rowBudgeted += entry.budgeted;
                  }

                  const labelInner = innerStyle(collapsed, 12);
                  const confInner = innerStyle(collapsed, 8);
                  const totalInner = innerStyle(collapsed, 8);

                  return (
                    <tr
                      key={label}
                      style={{
                        transition: 'opacity 0.22s ease, transform 0.22s ease',
                        opacity: collapsed ? 0 : 1,
                        transform: isAnimatingOut ? 'translateX(-6px)' : isAnimatingIn ? 'translateX(6px)' : 'translateX(0)',
                      }}
                    >
                      {/* Label cell — padding moved into wrapper for height animation */}
                      <td
                        className="p-0 border-b border-gray-50 overflow-hidden"
                        style={{
                          position: 'sticky', left: 0, zIndex: 2, backgroundColor: rowBg,
                          borderLeft: selectedLineItem === label ? '3px solid var(--color-brand-secondary, #1B76BC)' : '3px solid transparent',
                        }}
                      >
                        <div style={labelInner}>
                          <div className="flex items-center justify-between gap-1">
                            <button
                              onClick={() => onLineItemSelect(selectedLineItem === label ? null : label)}
                              className={`text-[12px] font-medium text-left transition-colors ${
                                selectedLineItem === label
                                  ? 'text-brand-secondary font-semibold'
                                  : 'text-gray-700 hover:text-brand-secondary'
                              }`}
                            >
                              {label}
                            </button>
                            <button
                              onClick={() => removeLineItem(label)}
                              title={`Remove ${label}`}
                              className="w-4 h-4 flex items-center justify-center rounded-full bg-gray-100 hover:bg-red-100 hover:text-red-500 text-gray-400 transition-colors text-xs font-bold leading-none flex-shrink-0"
                            >−</button>
                          </div>
                        </div>
                      </td>

                      {/* Conference cells */}
                      {activeConferences.map(conf => {
                        const entry = lineItemByConf.get(conf.conferenceId)?.get(label);
                        const actual = entry?.actual ?? null;
                        const budgeted = entry?.budgeted ?? null;
                        const isColAnimatingOut = animatingOutCols.includes(conf.conferenceId);
                        const isColAnimatingIn = animatingInCols.includes(conf.conferenceId);
                        const colFadeStyle: React.CSSProperties = {
                          opacity: isColAnimatingOut || isColAnimatingIn ? 0 : 1,
                          transition: `opacity ${ANIM_MS}ms ease`,
                        };

                        if (actual === null && budgeted === null) {
                          return (
                            <td
                              key={conf.conferenceId}
                              className="p-0 border-b border-gray-50 overflow-hidden"
                              style={{ backgroundColor: 'var(--color-background-secondary, #F9FAFB)', ...colFadeStyle }}
                            >
                              <div style={{ ...confInner, display: 'flex', alignItems: 'center', justifyContent: 'center' }} className="text-gray-300">—</div>
                            </td>
                          );
                        }

                        const cellBg = getCellBackground(actual, budgeted);
                        const cellColor = getCellTextColor(actual, budgeted);

                        if (subView === 'actuals') {
                          return (
                            <td key={conf.conferenceId} className="p-0 border-b border-gray-50 overflow-hidden" style={{ backgroundColor: cellBg, ...colFadeStyle }}>
                              <div style={{ ...confInner, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', justifyContent: 'center' }}>
                                <span className="text-[12px] font-medium" style={{ color: cellColor }}>
                                  {fmtCurrency(actual)}
                                </span>
                              </div>
                            </td>
                          );
                        }

                        const variance = actual != null && budgeted != null ? actual - budgeted : null;
                        const variancePct =
                          variance != null && budgeted != null && budgeted !== 0
                            ? (variance / budgeted) * 100 : null;

                        return (
                          <td key={conf.conferenceId} className="p-0 border-b border-gray-50 overflow-hidden" style={{ backgroundColor: cellBg, ...colFadeStyle }}>
                            <div style={{ ...confInner, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', justifyContent: 'center' }}>
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
                        className="p-0 border-b border-gray-50 overflow-hidden"
                        style={{ backgroundColor: 'var(--color-background-secondary, #F9FAFB)' }}
                      >
                        <div style={{ ...totalInner, display: 'flex', justifyContent: 'flex-end', alignItems: 'center' }}>
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
                        </div>
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
                  const isColAnimatingOut = animatingOutCols.includes(conf.conferenceId);
                  const isColAnimatingIn = animatingInCols.includes(conf.conferenceId);
                  const colFadeStyle: React.CSSProperties = {
                    opacity: isColAnimatingOut || isColAnimatingIn ? 0 : 1,
                    transition: `opacity ${ANIM_MS}ms ease`,
                  };

                  if (subView === 'actuals') {
                    return (
                      <td key={conf.conferenceId} className="border-b border-gray-50" style={{ backgroundColor: cellBg, ...colFadeStyle }}>
                        <div className="flex flex-col items-end justify-center px-2 py-2">
                          <span className="text-[12px] font-bold" style={{ color: cellColor }}>{fmtCurrency(actual)}</span>
                        </div>
                      </td>
                    );
                  }

                  const variance = actual != null && budgeted != null ? actual - budgeted : null;
                  return (
                    <td key={conf.conferenceId} className="border-b border-gray-50" style={{ backgroundColor: getCellBackground(actual, budgeted), ...colFadeStyle }}>
                      <div className="flex flex-col items-end justify-center px-2 py-2">
                        <span className="text-[12px] font-bold" style={{ color: getCellTextColor(actual, budgeted) }}>
                          {variance != null ? `${variance > 0 ? '+' : ''}${fmtCurrency(variance)}` : '—'}
                        </span>
                      </div>
                    </td>
                  );
                })}
                <td className="px-2 py-2 text-right" style={{ backgroundColor: 'var(--color-background-secondary, #F9FAFB)' }}>
                  <span className="text-[12px] font-bold text-gray-800">{fmtCurrency(programTotal)}</span>
                </td>
              </tr>

              {/* % of program / % variance row */}
              <tr>
                <td
                  className="px-3 py-2 text-[12px] font-bold text-gray-600"
                  style={{ position: 'sticky', left: 0, zIndex: 2, backgroundColor: 'var(--color-background-secondary, #F9FAFB)' }}
                >
                  {subView === 'actuals' ? '% of program' : '% variance'}
                </td>
                {activeConferences.map((conf, colIdx) => {
                  const totals = confTotals.get(conf.conferenceId);
                  const actual = totals?.actual ?? null;
                  const budgeted = totals?.budgeted ?? null;
                  const pillColor = PCT_PILL_COLORS[colIdx % PCT_PILL_COLORS.length];
                  const isColAnimatingOut = animatingOutCols.includes(conf.conferenceId);
                  const isColAnimatingIn = animatingInCols.includes(conf.conferenceId);
                  const colFadeStyle: React.CSSProperties = {
                    opacity: isColAnimatingOut || isColAnimatingIn ? 0 : 1,
                    transition: `opacity ${ANIM_MS}ms ease`,
                  };

                  if (subView === 'actuals') {
                    const pct = programTotal > 0 && actual != null ? (actual / programTotal) * 100 : null;
                    return (
                      <td key={conf.conferenceId} className="px-2 py-2 text-center" style={{ backgroundColor: 'var(--color-background-secondary, #F9FAFB)', ...colFadeStyle }}>
                        {pct != null ? (
                          <span
                            className="inline-block px-1.5 py-0.5 rounded text-[12px] font-bold border"
                            style={{ backgroundColor: pillColor.bg, color: pillColor.color, borderColor: pillColor.border }}
                          >
                            {pct.toFixed(1)}%
                          </span>
                        ) : <span className="text-gray-400 text-[12px]">—</span>}
                      </td>
                    );
                  }

                  const variancePct = actual != null && budgeted != null && budgeted > 0
                    ? ((actual - budgeted) / budgeted) * 100 : null;
                  return (
                    <td key={conf.conferenceId} className="px-2 py-2 text-center" style={{ backgroundColor: 'var(--color-background-secondary, #F9FAFB)', ...colFadeStyle }}>
                      {variancePct != null ? (
                        <span
                          className="inline-block px-1.5 py-0.5 rounded text-[12px] font-bold border"
                          style={{ backgroundColor: pillColor.bg, color: pillColor.color, borderColor: pillColor.border }}
                        >
                          {variancePct > 0 ? '+' : ''}{variancePct.toFixed(1)}%
                        </span>
                      ) : <span className="text-gray-400 text-[12px]">—</span>}
                    </td>
                  );
                })}
                <td className="px-2 py-2" style={{ backgroundColor: 'var(--color-background-secondary, #F9FAFB)' }} />
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
            <span className="w-3 h-3 rounded-sm border border-gray-200 flex-shrink-0" style={{ backgroundColor: bg }} />
            <span className="text-[12px]" style={{ color }}>{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
