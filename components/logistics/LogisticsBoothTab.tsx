'use client';

import { useEffect, useRef, useState } from 'react';
import { type LogisticsPlan, type LogisticsDeadline, addDays } from './types';
import { AutoSaveField, patchPlanField, SavedCheckmark, ChecklistSection } from './shared';

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
  boothPresent: boolean;
  boothWidth: number | null;
  boothLength: number | null;
  boothHall: string | null;
  onBoothUpdated?: (booth: { boothPresent: boolean; boothWidth: number | null; boothLength: number | null; boothNumber: string | null; boothHall: string | null }) => void;
}

export function LogisticsBoothTab({
  conferenceId, planYear, plan, deadlines, startDate, onDeadlinesChange,
  boothPresent, boothWidth, boothLength, boothHall, onBoothUpdated,
}: Props) {
  const [boothType, setBoothType] = useState(plan.boothType ?? '');
  const [boothTypeSaved, setBoothTypeSaved] = useState(false);
  const [boothNumber, setBoothNumber] = useState(plan.boothNumber ?? '');
  const [boothNumberSaved, setBoothNumberSaved] = useState(false);
  const createdRef = useRef(false);

  useEffect(() => {
    if (createdRef.current) return;
    if (deadlines.filter(d => d.category === 'booth').length === 0) {
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
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const saveBoothType = async (value: string) => {
    setBoothType(value);
    const ok = await patchPlanField(conferenceId, planYear, 'boothType', value || null);
    if (ok) { setBoothTypeSaved(true); setTimeout(() => setBoothTypeSaved(false), 1500); }
  };

  // Booth number is also surfaced as its own column in the Plan table (Booth
  // popover), so saving it here needs to push the same value over there too —
  // optimistically via onBoothUpdated, then persisted via the conferences.booth
  // route, merging in the other booth fields (width/length/hall) already set
  // from the table so this save doesn't clobber them.
  const saveBoothNumber = async () => {
    const ok = await patchPlanField(conferenceId, planYear, 'boothNumber', boothNumber || null);
    if (ok) { setBoothNumberSaved(true); setTimeout(() => setBoothNumberSaved(false), 1500); }
    const booth = {
      boothPresent: true,
      boothWidth, boothLength, boothHall,
      boothNumber: boothNumber || null,
    };
    onBoothUpdated?.(booth);
    fetch(`/api/conferences/${conferenceId}/booth`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(booth),
    }).catch(() => {});
  };

  return (
    <div className="space-y-4">
      <div>
        <label className="label flex items-center">Booth number<SavedCheckmark show={boothNumberSaved} /></label>
        <input
          className="input-field"
          value={boothNumber}
          onChange={e => setBoothNumber(e.target.value)}
          onBlur={saveBoothNumber}
        />
      </div>
      <AutoSaveField conferenceId={conferenceId} planYear={planYear} field="boothSize" label="Booth size" initialValue={plan.boothSize ?? ''} placeholder="10×20" />

      <div>
        <label className="label flex items-center">Booth type<SavedCheckmark show={boothTypeSaved} /></label>
        <select value={boothType} onChange={e => saveBoothType(e.target.value)} className="input-field">
          <option value="">Select...</option>
          {BOOTH_TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>

      <AutoSaveField conferenceId={conferenceId} planYear={planYear} field="boothContractSigned" label="Contract signed date" type="date" initialValue={plan.boothContractSigned ?? ''} />

      <ChecklistSection
        conferenceId={conferenceId} planYear={planYear} category="booth"
        deadlines={deadlines} onDeadlinesChange={onDeadlinesChange}
      />
    </div>
  );
}
