'use client';

import { useState } from 'react';
import { useConfigWithIds } from '@/lib/useUserOptions';

interface ActualLineItem { label: string; budgeted: number | null; actual: number | null }
interface PlannedLineItem { label: string; budgeted: number }
interface CategoryAverage { label: string; avgActual: number }

interface ConferencePlanBudgetModalProps {
  conferenceId: number;
  conferenceName: string;
  year: number;
  actualLineItems: ActualLineItem[] | null;
  plannedLineItems: PlannedLineItem[];
  categoryAverages: CategoryAverage[];
  onClose: () => void;
  onSaved: (plannedBudget: number, lineItems: PlannedLineItem[]) => void;
}

function fmtCurrency(v: number | null | undefined): string {
  if (v == null) return '—';
  return '$' + Math.round(v).toLocaleString();
}

export function ConferencePlanBudgetModal({
  conferenceId, conferenceName, year, actualLineItems, plannedLineItems, categoryAverages, onClose, onSaved,
}: ConferencePlanBudgetModalProps) {
  const costTypes = useConfigWithIds('cost_type');
  const [isSaving, setIsSaving] = useState(false);
  const [values, setValues] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    for (const li of plannedLineItems) initial[li.label] = li.budgeted > 0 ? String(li.budgeted) : '';
    return initial;
  });

  const hasActualData = actualLineItems != null && actualLineItems.some(li => (li.budgeted ?? 0) > 0 || (li.actual ?? 0) > 0);

  const labels = costTypes.length > 0
    ? costTypes.map(c => c.value)
    : Array.from(new Set([...plannedLineItems.map(li => li.label), ...categoryAverages.map(c => c.label)]));

  const setValue = (label: string, raw: string) => {
    const cleaned = raw.replace(/[^0-9.]/g, '').replace(/(\..*)\./g, '$1');
    setValues(prev => ({ ...prev, [label]: cleaned }));
  };

  const total = Object.values(values).reduce((sum, v) => sum + (parseFloat(v) || 0), 0);

  const handleSave = async () => {
    const lineItems: PlannedLineItem[] = labels
      .map(label => ({ label, budgeted: parseFloat(values[label] ?? '') || 0 }))
      .filter(li => li.budgeted > 0);
    setIsSaving(true);
    try {
      const res = await fetch(`/api/program-planner/conferences/${conferenceId}/budget?year=${year}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lineItems }),
      });
      if (!res.ok) throw new Error('save failed');
      const data = await res.json();
      onSaved(data.plannedBudget, data.lineItems);
      onClose();
    } catch {
      setIsSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4"
      style={{ background: 'rgba(0,0,0,0.5)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white w-full sm:max-w-3xl flex flex-col rounded-t-2xl sm:rounded-2xl shadow-2xl" style={{ maxHeight: '92vh' }}>
        {/* Header */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-3 sm:py-4 border-b border-gray-200 flex-shrink-0">
          <div className="min-w-0">
            <h2 className="text-base sm:text-lg font-bold text-brand-primary font-serif truncate">Set Budget</h2>
            <p className="text-xs text-gray-500 truncate">{conferenceName} · FY{year}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors flex-shrink-0"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body: two panels */}
        <div className="flex-1 overflow-y-auto grid grid-cols-1 sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-gray-100">
          {/* Left: reference */}
          <div className="px-4 sm:px-6 py-4">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
              {hasActualData ? 'Budget breakdown' : `Category averages (FY${year})`}
            </p>
            {hasActualData ? (
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left text-[10px] font-semibold uppercase tracking-wider text-gray-400 pb-2 pr-2">Item</th>
                    <th className="text-right text-[10px] font-semibold uppercase tracking-wider text-gray-400 pb-2 px-2">Budget</th>
                    <th className="text-right text-[10px] font-semibold uppercase tracking-wider text-gray-400 pb-2 pl-2">Actual</th>
                  </tr>
                </thead>
                <tbody>
                  {actualLineItems!.filter(li => (li.budgeted ?? 0) > 0 || (li.actual ?? 0) > 0).map((li, i) => (
                    <tr key={li.label} className={i % 2 === 1 ? 'bg-gray-50' : ''}>
                      <td className="py-1.5 pr-2 text-[12px] text-gray-700">{li.label}</td>
                      <td className="py-1.5 px-2 text-right text-[12px] text-gray-600 tabular-nums">{fmtCurrency(li.budgeted)}</td>
                      <td className="py-1.5 pl-2 text-right text-[12px] text-gray-600 tabular-nums">{fmtCurrency(li.actual)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : categoryAverages.length === 0 ? (
              <p className="text-[12px] text-gray-400 italic">No historical data available for {year} yet.</p>
            ) : (
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left text-[10px] font-semibold uppercase tracking-wider text-gray-400 pb-2 pr-2">Item</th>
                    <th className="text-right text-[10px] font-semibold uppercase tracking-wider text-gray-400 pb-2 pl-2">Avg. actual</th>
                  </tr>
                </thead>
                <tbody>
                  {categoryAverages.map((c, i) => (
                    <tr key={c.label} className={i % 2 === 1 ? 'bg-gray-50' : ''}>
                      <td className="py-1.5 pr-2 text-[12px] text-gray-700">{c.label}</td>
                      <td className="py-1.5 pl-2 text-right text-[12px] text-gray-600 tabular-nums">{fmtCurrency(c.avgActual)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Right: editable planned budget */}
          <div className="px-4 sm:px-6 py-4">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Planned budget</p>
            <div className="space-y-2">
              {labels.map(label => (
                <div key={label} className="grid grid-cols-[1fr_120px] gap-2 items-center">
                  <span className="text-[12px] text-gray-700 truncate">{label}</span>
                  <div className="relative">
                    <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-xs pointer-events-none">$</span>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={values[label] ?? ''}
                      onChange={e => setValue(label, e.target.value)}
                      placeholder="0"
                      className="input-field text-xs pl-5 w-full"
                    />
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-4 pt-3 border-t border-gray-200 flex items-center justify-between">
              <span className="text-sm font-semibold text-gray-700">Total</span>
              <span className="text-sm font-bold text-brand-primary tabular-nums">{fmtCurrency(total)}</span>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-4 sm:px-6 py-4 border-t border-gray-200 flex-shrink-0">
          <button type="button" onClick={onClose} className="btn-secondary text-sm">Cancel</button>
          <button type="button" onClick={handleSave} disabled={isSaving} className="btn-primary text-sm">
            {isSaving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
