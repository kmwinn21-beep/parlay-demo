'use client';

import { useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { type LogisticsPlan, type LogisticsDeadline, addDays, fmtDate } from './types';
import { AutoSaveField, patchPlanField, SavedCheckmark } from './shared';

const BOOTH_CHECKLIST_LABELS = [
  'Exhibitor services order submitted',
  'Lead retrieval device ordered',
  'Booth build/breakdown schedule confirmed',
  'Electrical and furniture ordered',
];

const BOOTH_TYPE_OPTIONS = [
  { value: 'inline', label: 'Inline' },
  { value: 'corner', label: 'Corner' },
  { value: 'island', label: 'Island' },
  { value: 'peninsula', label: 'Peninsula' },
];

interface Props {
  conferenceId: number;
  planYear: number;
  plan: LogisticsPlan;
  deadlines: LogisticsDeadline[];
  startDate: string | null;
  onDeadlinesChange: (deadlines: LogisticsDeadline[]) => void;
}

export function LogisticsBoothTab({ conferenceId, planYear, plan, deadlines, startDate, onDeadlinesChange }: Props) {
  const [boothType, setBoothType] = useState(plan.boothType ?? '');
  const [boothTypeSaved, setBoothTypeSaved] = useState(false);
  const createdRef = useRef(false);

  const boothDeadlines = deadlines.filter(d => d.category === 'booth');

  useEffect(() => {
    if (createdRef.current || boothDeadlines.length > 0) return;
    createdRef.current = true;
    const dueDate = addDays(startDate, -7);
    (async () => {
      const created: LogisticsDeadline[] = [];
      for (const label of BOOTH_CHECKLIST_LABELS) {
        try {
          const res = await fetch(`/api/program-planner/conferences/${conferenceId}/logistics/deadlines?year=${planYear}`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ label, dueDate, category: 'booth' }),
          });
          if (res.ok) created.push(await res.json());
        } catch { /* best-effort */ }
      }
      if (created.length > 0) onDeadlinesChange([...deadlines, ...created]);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleChecklistItem = async (d: LogisticsDeadline) => {
    const prev = deadlines;
    onDeadlinesChange(deadlines.map(x => x.id === d.id ? { ...x, completed: !x.completed } : x));
    const res = await fetch(`/api/program-planner/conferences/${conferenceId}/logistics/deadlines/${d.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ completed: !d.completed }),
    }).catch(() => null);
    if (!res || !res.ok) { onDeadlinesChange(prev); toast.error('Failed to update.'); }
  };

  const saveBoothType = async (value: string) => {
    setBoothType(value);
    const ok = await patchPlanField(conferenceId, planYear, 'boothType', value || null);
    if (ok) { setBoothTypeSaved(true); setTimeout(() => setBoothTypeSaved(false), 1500); }
  };

  return (
    <div className="space-y-4">
      <AutoSaveField conferenceId={conferenceId} planYear={planYear} field="boothNumber" label="Booth number" initialValue={plan.boothNumber ?? ''} />
      <AutoSaveField conferenceId={conferenceId} planYear={planYear} field="boothSize" label="Booth size" initialValue={plan.boothSize ?? ''} placeholder="10×20" />

      <div>
        <label className="label flex items-center">Booth type<SavedCheckmark show={boothTypeSaved} /></label>
        <select value={boothType} onChange={e => saveBoothType(e.target.value)} className="input-field">
          <option value="">Select...</option>
          {BOOTH_TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>

      <AutoSaveField conferenceId={conferenceId} planYear={planYear} field="boothContractSigned" label="Contract signed date" type="date" initialValue={plan.boothContractSigned ?? ''} />

      <div className="pt-2 border-t border-gray-100">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Checklist</p>
        {boothDeadlines.length === 0 ? (
          <p className="text-xs text-gray-400 italic">Setting up checklist…</p>
        ) : (
          <div className="space-y-1.5">
            {boothDeadlines.map(d => (
              <label key={d.id} className="flex items-center gap-2 text-xs text-gray-700 cursor-pointer">
                <input type="checkbox" checked={d.completed} onChange={() => toggleChecklistItem(d)} className="accent-brand-secondary w-4 h-4" />
                <span className={d.completed ? 'line-through text-gray-400' : ''}>{d.label}</span>
                {!d.completed && <span className="text-[10px] text-gray-400 ml-auto flex-shrink-0">{fmtDate(d.dueDate)}</span>}
              </label>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
