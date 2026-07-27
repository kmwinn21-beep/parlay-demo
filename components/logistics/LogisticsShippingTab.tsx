'use client';

import { useEffect, useRef } from 'react';
import { type LogisticsPlan, type LogisticsDeadline, type PlanNote, type PlanNoteSection } from './types';
import { AutoSaveField, ChecklistSection, TwoColFieldGrid } from './shared';
import { PlanSectionNotes } from './PlanSectionNotes';

const SHIPPING_CHECKLIST_LABELS = ['Packing list confirmed', 'Return shipment arranged'];

interface Props {
  conferenceId: number;
  planYear: number;
  plan: LogisticsPlan;
  deadlines: LogisticsDeadline[];
  onDeadlinesChange: (deadlines: LogisticsDeadline[]) => void;
  notes: PlanNote[];
  onNoteCreated: (note: PlanNote) => void;
  onShowAllNotes: (section: PlanNoteSection) => void;
}

export function LogisticsShippingTab({ conferenceId, planYear, plan, deadlines, onDeadlinesChange, notes, onNoteCreated, onShowAllNotes }: Props) {
  const createdRef = useRef(false);

  useEffect(() => {
    if (createdRef.current) return;
    if (deadlines.filter(d => d.category === 'shipping').length === 0) {
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
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-4">
      <AutoSaveField conferenceId={conferenceId} planYear={planYear} field="advanceWarehouseAddress" label="Advance warehouse address" type="textarea" initialValue={plan.advanceWarehouseAddress ?? ''} />
      <TwoColFieldGrid>
        <AutoSaveField conferenceId={conferenceId} planYear={planYear} field="shipDate" label="Ship date" type="date" initialValue={plan.shipDate ?? ''} />
        <AutoSaveField conferenceId={conferenceId} planYear={planYear} field="trackingNumber" label="Tracking number" initialValue={plan.trackingNumber ?? ''} />
      </TwoColFieldGrid>
      <ChecklistSection
        conferenceId={conferenceId} planYear={planYear} category="shipping"
        deadlines={deadlines} onDeadlinesChange={onDeadlinesChange}
      />

      <PlanSectionNotes conferenceId={conferenceId} planYear={planYear} section="shipping" notes={notes} onNoteCreated={onNoteCreated} onShowAll={onShowAllNotes} />
    </div>
  );
}
