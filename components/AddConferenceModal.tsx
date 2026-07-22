'use client';

import { useState } from 'react';
import toast from 'react-hot-toast';
import { SeriesSeasonCombobox, type SeriesOption } from './SeriesSeasonCombobox';

interface AddConferenceModalProps {
  planYear: number;
  onClose: () => void;
  onCreated: () => void;
}

// Uses an obviously-out-of-range placeholder date rather than one derived from
// planYear — a placeholder dated within any real selectable year would later collide
// with that year's own date-range query once the user navigates to it, making the
// conference incorrectly appear to belong to the wrong year's plan.
const PLACEHOLDER_DATE = '1900-01-01';

// Minimal add flow: name only. Always lands in the "New — never attended
// (Evaluating)" section (decision='new') — everything else (dates, strategy, type,
// sponsorship, booth, location, budget, reps) is filled in via inline editing in the
// Plan table afterward.
export function AddConferenceModal({ planYear, onClose, onCreated }: AddConferenceModalProps) {
  const [name, setName] = useState('');
  const [selectedSeries, setSelectedSeries] = useState<SeriesOption | null>(null);
  const [selectedSeasonId, setSelectedSeasonId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const onSubmit = async () => {
    const trimmed = name.trim();
    if (!trimmed) { toast.error('Conference name is required'); return; }
    if (!selectedSeries) { toast.error('Select or create a series'); return; }
    setIsSubmitting(true);
    try {
      const strategyRes = await fetch('/api/config?category=conference_strategy_type&form=conference_form');
      const strategyOptions = strategyRes.ok ? await strategyRes.json() as { id: number }[] : [];
      if (!strategyOptions.length) {
        toast.error('Configure a Conference Strategy option in Admin Settings before adding a conference.');
        setIsSubmitting(false);
        return;
      }

      const formData = new FormData();
      formData.append('name', trimmed);
      formData.append('start_date', PLACEHOLDER_DATE);
      formData.append('end_date', PLACEHOLDER_DATE);
      formData.append('location', 'TBD');
      formData.append('is_historical', '0');
      formData.append('conference_strategy_type_id', String(strategyOptions[0].id));
      formData.append('series_id', selectedSeries.id);
      if (selectedSeasonId) formData.append('season_id', selectedSeasonId);

      const res = await fetch('/api/conferences', { method: 'POST', body: formData });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        let errMsg = 'Failed to create conference';
        try { errMsg = JSON.parse(text)?.error ?? errMsg; } catch { /* plain-text */ }
        throw new Error(errMsg);
      }
      const result = await res.json();
      const newConferenceId = Number(result.id);

      const decisionRes = await fetch(`/api/program-planner/conferences/${newConferenceId}/decision`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ year: planYear, decision: 'new' }),
      });
      if (!decisionRes.ok) throw new Error('Conference was created but could not be added to the plan.');

      toast.success('Added to the plan.');
      onCreated();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create conference');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4"
      style={{ background: 'rgba(0,0,0,0.5)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white w-full sm:max-w-sm flex flex-col rounded-t-2xl sm:rounded-2xl shadow-2xl">
        <div className="px-5 py-4 border-b border-gray-200">
          <h2 className="text-base font-bold text-brand-primary font-serif">Add to Plan</h2>
          <p className="text-xs text-gray-500 mt-0.5">FY{planYear} · New — never attended (Evaluating)</p>
        </div>

        <div className="px-5 py-4 space-y-4">
          <div>
            <label className="label">Conference Name *</label>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') onSubmit(); }}
              className="input-field"
              placeholder="e.g., HIMSS 2027"
              autoFocus
            />
          </div>
          <SeriesSeasonCombobox
            seriesId={selectedSeries?.id ?? null}
            seasonId={selectedSeasonId}
            onSeriesChange={setSelectedSeries}
            onSeasonChange={setSelectedSeasonId}
          />
        </div>

        <div className="flex items-center justify-end gap-3 px-5 py-4 border-t border-gray-200">
          <button type="button" onClick={onClose} className="btn-secondary text-sm" disabled={isSubmitting}>Cancel</button>
          <button type="button" onClick={onSubmit} disabled={isSubmitting} className="btn-primary text-sm">
            {isSubmitting ? 'Adding…' : 'Add to Plan'}
          </button>
        </div>
      </div>
    </div>
  );
}
