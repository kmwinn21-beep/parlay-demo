'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import toast from 'react-hot-toast';

interface LineItem {
  id: string;
  label: string;
  budget: string;
  actual: string;
}

interface BudgetVsActualModalProps {
  conferenceId: number;
  conferenceName: string;
  onClose: () => void;
}

function genId() {
  return Math.random().toString(36).slice(2, 10);
}

function parseDollar(val: string): number | null {
  const n = parseFloat(val.replace(/[^0-9.]/g, ''));
  return isNaN(n) ? null : n;
}

function calcVariance(budget: string, actual: string): number | null {
  const b = parseDollar(budget);
  const a = parseDollar(actual);
  if (b == null || a == null || b === 0) return null;
  return ((a / b) * 100) - 100;
}

function fmtDollars(n: number): string {
  return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function VariancePill({ variance }: { variance: number | null }) {
  if (variance == null) return <span className="text-gray-300 text-xs">—</span>;
  const positive = variance >= 0;
  const label = `${positive ? '+' : ''}${variance.toFixed(1)}%`;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold whitespace-nowrap ${positive ? 'bg-red-100 text-red-700 border border-red-300' : 'bg-green-100 text-green-700 border border-green-300'}`}>
      {label}
    </span>
  );
}

export function BudgetVsActualModal({ conferenceId, conferenceName, onClose }: BudgetVsActualModalProps) {
  const [items, setItems] = useState<LineItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  // Expected return on cost (per-conference override, falls back to global default)
  const [returnOnCost, setReturnOnCost] = useState('');
  const [globalDefaultReturn, setGlobalDefaultReturn] = useState('');

  // For "Other" custom label editing
  const [editingLabelId, setEditingLabelId] = useState<string | null>(null);
  const [labelDraft, setLabelDraft] = useState('');
  const labelInputRef = useRef<HTMLInputElement>(null);

  // Available cost types for "Add line item" dropdown
  const [availableCostTypes, setAvailableCostTypes] = useState<string[]>([]);
  const [showAddDropdown, setShowAddDropdown] = useState(false);
  const addDropdownRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const [effRes, budgetRes] = await Promise.all([
        fetch('/api/admin/effectiveness', { credentials: 'include' }),
        fetch(`/api/conferences/${conferenceId}/budget`, { credentials: 'include' }),
      ]);
      const effData: Record<string, string> = effRes.ok ? await effRes.json() : {};
      const budgetData: { line_items: LineItem[]; return_on_cost: string | null } = budgetRes.ok
        ? await budgetRes.json()
        : { line_items: [], return_on_cost: null };

      const defaultTypes: string[] = effData.conference_cost_types
        ? JSON.parse(effData.conference_cost_types)
        : [];
      const globalReturn = effData.expected_return_on_event_cost ?? '';

      setAvailableCostTypes(defaultTypes);
      setGlobalDefaultReturn(globalReturn);

      // Per-conference return overrides global default if set
      setReturnOnCost(budgetData.return_on_cost ?? globalReturn);

      if (budgetData.line_items && budgetData.line_items.length > 0) {
        setItems(budgetData.line_items);
      } else {
        setItems(defaultTypes.map(label => ({ id: genId(), label, budget: '', actual: '' })));
      }
    } catch {
      toast.error('Failed to load budget data.');
    } finally {
      setIsLoading(false);
    }
  }, [conferenceId]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (editingLabelId && labelInputRef.current) {
      labelInputRef.current.focus();
      labelInputRef.current.select();
    }
  }, [editingLabelId]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (addDropdownRef.current && !addDropdownRef.current.contains(e.target as Node)) {
        setShowAddDropdown(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const updateItem = (id: string, field: 'budget' | 'actual', value: string) => {
    const cleaned = value.replace(/[^0-9.]/g, '').replace(/(\..*)\./g, '$1');
    setItems(prev => prev.map(it => it.id === id ? { ...it, [field]: cleaned } : it));
  };

  const removeItem = (id: string) => {
    setItems(prev => prev.filter(it => it.id !== id));
  };

  const addItem = (label: string) => {
    setShowAddDropdown(false);
    if (label === 'Other') {
      const newId = genId();
      setItems(prev => [...prev, { id: newId, label: 'Other', budget: '', actual: '' }]);
      setEditingLabelId(newId);
      setLabelDraft('');
    } else {
      setItems(prev => [...prev, { id: genId(), label, budget: '', actual: '' }]);
    }
  };

  const commitLabelEdit = (id: string) => {
    const trimmed = labelDraft.trim();
    if (trimmed) {
      setItems(prev => prev.map(it => it.id === id ? { ...it, label: trimmed } : it));
    } else {
      setItems(prev => prev.filter(it => it.id !== id));
    }
    setEditingLabelId(null);
    setLabelDraft('');
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const res = await fetch(`/api/conferences/${conferenceId}/budget`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          line_items: items,
          return_on_cost: returnOnCost.trim() || null,
        }),
      });
      if (!res.ok) throw new Error();
      toast.success('Budget saved successfully.');
      onClose();
    } catch {
      toast.error('Failed to save budget.');
    } finally {
      setIsSaving(false);
    }
  };

  // Totals
  const totalBudget = items.reduce((sum, it) => sum + (parseDollar(it.budget) ?? 0), 0);
  const totalActual = items.reduce((sum, it) => sum + (parseDollar(it.actual) ?? 0), 0);
  const hasBudgetTotals = items.some(it => parseDollar(it.budget) != null);
  const hasActualTotals = items.some(it => parseDollar(it.actual) != null);
  const totalVariance = hasBudgetTotals && hasActualTotals && totalBudget > 0
    ? ((totalActual / totalBudget) * 100) - 100
    : null;

  // Expected return calculation
  const returnMultiplier = parseDollar(returnOnCost);
  const expectedReturnValue = hasBudgetTotals && returnMultiplier != null && returnMultiplier > 0
    ? totalBudget * returnMultiplier
    : null;

  // Dropdown options
  const existingLabels = new Set(items.map(it => it.label));
  const dropdownOptions = [
    ...availableCostTypes.filter(t => !existingLabels.has(t)),
    ...(!existingLabels.has('Other') ? ['Other'] : []),
    ...(existingLabels.has('Other') ? ['Other (new)'] : []),
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.5)' }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl flex flex-col" style={{ maxHeight: '90vh' }}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 flex-shrink-0">
          <h2 className="text-lg font-bold text-brand-primary font-serif">Budget vs. Actual</h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-16">
              <div className="animate-spin w-8 h-8 border-4 border-brand-secondary border-t-transparent rounded-full" />
            </div>
          ) : (
            <>
              {/* Column headers */}
              <div className="grid grid-cols-[1fr_140px_140px_110px_36px] gap-2 mb-2 px-1">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Item</p>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Budget</p>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Actual</p>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Variance</p>
                <span />
              </div>

              {/* Line items */}
              <div className="space-y-2">
                {items.map(item => (
                  <div key={item.id} className="grid grid-cols-[1fr_140px_140px_110px_36px] gap-2 items-center">
                    <div className="min-w-0">
                      {editingLabelId === item.id ? (
                        <input
                          ref={labelInputRef}
                          value={labelDraft}
                          onChange={e => setLabelDraft(e.target.value)}
                          onBlur={() => commitLabelEdit(item.id)}
                          onKeyDown={e => {
                            if (e.key === 'Enter') commitLabelEdit(item.id);
                            if (e.key === 'Escape') { setEditingLabelId(null); removeItem(item.id); }
                          }}
                          placeholder="Enter description…"
                          className="input-field text-sm w-full"
                        />
                      ) : (
                        <span className="text-sm text-gray-700 truncate block" title={item.label}>{item.label}</span>
                      )}
                    </div>
                    <div className="relative">
                      <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-sm pointer-events-none">$</span>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={item.budget}
                        onChange={e => updateItem(item.id, 'budget', e.target.value)}
                        placeholder="0"
                        className="input-field text-sm pl-6 w-full"
                      />
                    </div>
                    <div className="relative">
                      <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-sm pointer-events-none">$</span>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={item.actual}
                        onChange={e => updateItem(item.id, 'actual', e.target.value)}
                        placeholder="0"
                        className="input-field text-sm pl-6 w-full"
                      />
                    </div>
                    <div className="flex items-center justify-center">
                      <VariancePill variance={calcVariance(item.budget, item.actual)} />
                    </div>
                    <button
                      type="button"
                      onClick={() => removeItem(item.id)}
                      className="flex items-center justify-center w-8 h-8 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors flex-shrink-0"
                      title="Remove line item"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>

              {/* Add line item */}
              <div className="mt-3" ref={addDropdownRef}>
                <div className="relative inline-block">
                  <button
                    type="button"
                    onClick={() => setShowAddDropdown(v => !v)}
                    className="flex items-center gap-1.5 text-sm text-brand-secondary hover:text-brand-primary font-medium transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    Add line item
                  </button>
                  {showAddDropdown && (
                    <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg z-20 min-w-[180px] py-1">
                      {dropdownOptions.length === 0 ? (
                        <p className="px-3 py-2 text-xs text-gray-400">No more options</p>
                      ) : dropdownOptions.map(opt => (
                        <button
                          key={opt}
                          type="button"
                          onClick={() => addItem(opt === 'Other (new)' ? 'Other' : opt)}
                          className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                        >
                          {opt}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Totals row */}
              {items.length > 0 && (
                <div className="mt-4 pt-4 border-t border-gray-200 space-y-3">
                  <div className="grid grid-cols-[1fr_140px_140px_110px_36px] gap-2 items-center">
                    <p className="text-sm font-semibold text-gray-700">Totals</p>
                    <p className="text-sm font-semibold text-gray-700 pl-2">
                      {hasBudgetTotals ? fmtDollars(totalBudget) : '—'}
                    </p>
                    <p className="text-sm font-semibold text-gray-700 pl-2">
                      {hasActualTotals ? fmtDollars(totalActual) : '—'}
                    </p>
                    <div className="flex items-center justify-center">
                      <VariancePill variance={totalVariance} />
                    </div>
                    <span />
                  </div>

                  {/* Expected Return row */}
                  <div className="grid grid-cols-[1fr_140px_290px_36px] gap-2 items-center pt-3 border-t border-gray-100">
                    <p className="text-sm font-semibold text-gray-700 leading-snug">
                      Expected Return on {conferenceName} Cost
                    </p>
                    {/* Multiplier input */}
                    <div className="relative">
                      <input
                        type="text"
                        inputMode="decimal"
                        value={returnOnCost}
                        onChange={e => {
                          const cleaned = e.target.value.replace(/[^0-9.]/g, '').replace(/(\..*)\./g, '$1');
                          setReturnOnCost(cleaned);
                        }}
                        placeholder={globalDefaultReturn || '0'}
                        className="input-field text-sm w-full"
                        title="Return multiplier (e.g. 2.5 = 250% of total budget)"
                      />
                    </div>
                    {/* Calculated value spanning Actual + Variance columns */}
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-400 whitespace-nowrap">Total budget × return =</span>
                      <span className={`text-sm font-semibold ${expectedReturnValue != null ? 'text-green-700' : 'text-gray-300'}`}>
                        {expectedReturnValue != null ? fmtDollars(expectedReturnValue) : '—'}
                      </span>
                    </div>
                    <span />
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200 flex-shrink-0">
          <button type="button" onClick={onClose} className="btn-secondary text-sm">
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving || isLoading}
            className="btn-primary text-sm"
          >
            {isSaving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
