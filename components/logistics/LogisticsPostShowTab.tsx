'use client';

import { useEffect, useRef } from 'react';
import toast from 'react-hot-toast';
import { type LogisticsDeadline, addDays } from './types';

const POST_SHOW_ITEMS = [
  { label: 'Lead list downloaded', offset: 1 },
  { label: 'Thank you emails sent', offset: 2 },
  { label: 'Lead list imported to CRM', offset: 3 },
  { label: 'Post-show debrief scheduled', offset: 5 },
  { label: 'Expense reports submitted', offset: 7 },
];

interface Props {
  conferenceId: number;
  planYear: number;
  deadlines: LogisticsDeadline[];
  startDate: string | null;
  endDate: string | null;
  onDeadlinesChange: (deadlines: LogisticsDeadline[]) => void;
}

export function LogisticsPostShowTab({ conferenceId, planYear, deadlines, startDate, endDate, onDeadlinesChange }: Props) {
  const postShowDeadlines = deadlines.filter(d => d.category === 'post_show');
  const createdRef = useRef(false);

  useEffect(() => {
    if (createdRef.current || postShowDeadlines.length > 0) return;
    createdRef.current = true;
    const base = endDate || startDate;
    (async () => {
      const created: LogisticsDeadline[] = [];
      for (const item of POST_SHOW_ITEMS) {
        try {
          const res = await fetch(`/api/program-planner/conferences/${conferenceId}/logistics/deadlines?year=${planYear}`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ label: item.label, dueDate: addDays(base, item.offset), category: 'post_show' }),
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

  if (postShowDeadlines.length === 0) {
    return <p className="text-xs text-gray-400 italic text-center py-8">Setting up checklist…</p>;
  }

  return (
    <div className="space-y-2">
      {postShowDeadlines.map(d => (
        <label key={d.id} className="flex items-center gap-2 text-xs text-gray-700 cursor-pointer py-1">
          <input type="checkbox" checked={d.completed} onChange={() => toggleItem(d)} className="accent-brand-secondary w-4 h-4" />
          <span className={d.completed ? 'line-through text-gray-400' : ''}>{d.label}</span>
        </label>
      ))}
    </div>
  );
}
