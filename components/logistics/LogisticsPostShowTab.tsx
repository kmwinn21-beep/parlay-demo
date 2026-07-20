'use client';

import { useEffect, useRef } from 'react';
import { type LogisticsDeadline, addDays } from './types';
import { ChecklistSection } from './shared';

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
  const createdRef = useRef(false);

  useEffect(() => {
    if (createdRef.current) return;
    if (deadlines.filter(d => d.category === 'post_show').length === 0) {
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
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <ChecklistSection
      conferenceId={conferenceId} planYear={planYear} category="post_show"
      deadlines={deadlines} onDeadlinesChange={onDeadlinesChange} title="Post-show checklist"
    />
  );
}
