'use client';

import { useEffect, useRef } from 'react';
import toast from 'react-hot-toast';
import { type LogisticsPlan, type LogisticsDeadline } from './types';
import { AutoSaveField } from './shared';

const SHIPPING_CHECKLIST_LABELS = ['Packing list confirmed', 'Return shipment arranged'];

interface Props {
  conferenceId: number;
  planYear: number;
  plan: LogisticsPlan;
  deadlines: LogisticsDeadline[];
  onDeadlinesChange: (deadlines: LogisticsDeadline[]) => void;
}

export function LogisticsShippingTab({ conferenceId, planYear, plan, deadlines, onDeadlinesChange }: Props) {
  const shippingDeadlines = deadlines.filter(d => d.category === 'shipping');
  const createdRef = useRef(false);

  useEffect(() => {
    if (createdRef.current || shippingDeadlines.length > 0) return;
    createdRef.current = true;
    const dueDate = plan.shipDate || new Date().toISOString().slice(0, 10);
    (async () => {
      const created: LogisticsDeadline[] = [];
      for (const label of SHIPPING_CHECKLIST_LABELS) {
        try {
          const res = await fetch(`/api/program-planner/conferences/${conferenceId}/logistics/deadlines?year=${planYear}`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ label, dueDate, category: 'shipping' }),
          });
          if (res.ok) created.push(await res.json());
        } catch { /* best-effort */ }
      }
      if (created.length > 0) onDeadlinesChange([...deadlines, ...created]);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleItem = async (d: LogisticsDeadline) => {
    const prev = deadlines;
    onDeadlinesChange(deadlines.map(x => x.id === d.id ? { ...x, completed: !x.completed } : x));
    const res = await fetch(`/api/program-planner/conferences/${conferenceId}/logistics/deadlines/${d.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ completed: !d.completed }),
    }).catch(() => null);
    if (!res || !res.ok) { onDeadlinesChange(prev); toast.error('Failed to update.'); }
  };

  return (
    <div className="space-y-4">
      <AutoSaveField conferenceId={conferenceId} planYear={planYear} field="advanceWarehouseAddress" label="Advance warehouse address" type="textarea" initialValue={plan.advanceWarehouseAddress ?? ''} />
      <AutoSaveField conferenceId={conferenceId} planYear={planYear} field="shipDate" label="Ship date" type="date" initialValue={plan.shipDate ?? ''} />
      <AutoSaveField conferenceId={conferenceId} planYear={planYear} field="trackingNumber" label="Tracking number" initialValue={plan.trackingNumber ?? ''} />
      <AutoSaveField conferenceId={conferenceId} planYear={planYear} field="logisticsNotes" label="Notes" type="textarea" initialValue={plan.logisticsNotes ?? ''} />

      <div className="pt-2 border-t border-gray-100">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Checklist</p>
        {shippingDeadlines.length === 0 ? (
          <p className="text-xs text-gray-400 italic">Setting up checklist…</p>
        ) : (
          <div className="space-y-1.5">
            {shippingDeadlines.map(d => (
              <label key={d.id} className="flex items-center gap-2 text-xs text-gray-700 cursor-pointer">
                <input type="checkbox" checked={d.completed} onChange={() => toggleItem(d)} className="accent-brand-secondary w-4 h-4" />
                <span className={d.completed ? 'line-through text-gray-400' : ''}>{d.label}</span>
              </label>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
