'use client';

import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { type LogisticsPlan, type LogisticsDeadline } from './types';
import { AutoSaveField, AutoSaveCheckbox, SavedCheckmark, patchPlanField, ChecklistSection } from './shared';

interface SponsorshipOption { id: number; value: string; color: string | null; is_system: number }

// Same fetch/create pattern as ConferenceForm.tsx's sponsorship chip picker —
// /api/config/sponsorship-levels is the shared source of truth for tier names,
// so a level added here shows up in the Add Conference form too, and vice versa.
function SponsorshipTierPicker({ conferenceId, planYear, initialValue, onSponsorshipUpdated }: {
  conferenceId: number; planYear: number; initialValue: string | null;
  onSponsorshipUpdated?: (sponsorshipLevel: string | null) => void;
}) {
  const [options, setOptions] = useState<SponsorshipOption[]>([]);
  const [selected, setSelected] = useState(initialValue ?? '');
  const [saved, setSaved] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [addValue, setAddValue] = useState('');
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    fetch('/api/config/sponsorship-levels')
      .then(r => r.json())
      .then((rows: SponsorshipOption[]) => setOptions(rows ?? []))
      .catch(() => {});
  }, []);

  const select = async (value: string) => {
    const next = selected === value ? '' : value;
    setSelected(next);
    onSponsorshipUpdated?.(next || null);
    const ok = await patchPlanField(conferenceId, planYear, 'sponsorshipTier', next || null);
    if (ok) { setSaved(true); setTimeout(() => setSaved(false), 1500); }
    fetch(`/api/conferences/${conferenceId}/sponsorship`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sponsorshipLevel: next || null }),
    }).catch(() => {});
  };

  const createLevel = async () => {
    const value = addValue.trim();
    if (!value) return;
    setAdding(true);
    try {
      const res = await fetch('/api/config/sponsorship-levels', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ value }),
      });
      if (!res.ok) throw new Error();
      const created = await res.json() as SponsorshipOption;
      setOptions(prev => [...prev.filter(o => o.id !== created.id), created]);
      setAddValue('');
      setAddOpen(false);
      await select(created.value);
    } catch {
      toast.error('Failed to add sponsorship level.');
    } finally {
      setAdding(false);
    }
  };

  return (
    <div>
      <label className="label flex items-center">Sponsorship tier<SavedCheckmark show={saved} /></label>
      <div className="flex flex-wrap items-center gap-1.5">
        {options.map(opt => {
          const isSelected = selected === opt.value;
          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => select(opt.value)}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-all ${
                isSelected ? 'border-transparent text-white' : 'border-gray-300 bg-white text-gray-700 hover:border-gray-400'
              }`}
              style={isSelected && opt.color ? { backgroundColor: opt.color } : {}}
            >
              {opt.value}
            </button>
          );
        })}
        {!addOpen ? (
          <button type="button" onClick={() => setAddOpen(true)} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs text-brand-secondary border border-dashed border-brand-secondary/50 hover:bg-blue-50 transition-colors">
            + Add custom
          </button>
        ) : (
          <div className="flex items-center gap-1">
            <input
              value={addValue}
              onChange={e => setAddValue(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); createLevel(); } if (e.key === 'Escape') { setAddOpen(false); setAddValue(''); } }}
              placeholder="Level name"
              className="input-field text-xs py-1 h-7 w-28"
              autoFocus
            />
            <button type="button" onClick={createLevel} disabled={!addValue.trim() || adding} className="btn-primary text-[11px] px-2 h-7 disabled:opacity-50">
              {adding ? '…' : 'Add'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export function LogisticsSponsorshipTab({ conferenceId, planYear, plan, deadlines, onDeadlinesChange, onSponsorshipUpdated }: {
  conferenceId: number;
  planYear: number;
  plan: LogisticsPlan;
  deadlines: LogisticsDeadline[];
  onDeadlinesChange: (deadlines: LogisticsDeadline[]) => void;
  onSponsorshipUpdated?: (sponsorshipLevel: string | null) => void;
}) {
  return (
    <div className="space-y-4">
      <SponsorshipTierPicker conferenceId={conferenceId} planYear={planYear} initialValue={plan.sponsorshipTier} onSponsorshipUpdated={onSponsorshipUpdated} />
      <AutoSaveField conferenceId={conferenceId} planYear={planYear} field="sponsorshipContractSigned" label="Contract signed date" type="date" initialValue={plan.sponsorshipContractSigned ?? ''} />
      <AutoSaveField conferenceId={conferenceId} planYear={planYear} field="sponsorshipDeliverablesDue" label="Deliverables due date" type="date" initialValue={plan.sponsorshipDeliverablesDue ?? ''} />
      <AutoSaveCheckbox conferenceId={conferenceId} planYear={planYear} field="logoSubmitted" label="Logo submitted" initialChecked={plan.logoSubmitted} />
      <AutoSaveField conferenceId={conferenceId} planYear={planYear} field="logisticsNotes" label="Notes" type="textarea" initialValue={plan.logisticsNotes ?? ''} placeholder="Sponsorship: ..." />

      <ChecklistSection
        conferenceId={conferenceId} planYear={planYear} category="sponsorship"
        deadlines={deadlines} onDeadlinesChange={onDeadlinesChange}
      />
    </div>
  );
}
