'use client';

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import toast from 'react-hot-toast';
import { useDrawerResize } from '@/lib/useDrawerResize';

type PlanDecision = 'attend' | 'reduce' | 'new' | 'evaluating' | 'cut';

interface AddConferenceDrawerProps {
  planYear: number;
  onClose: () => void;
  onCreated: () => void;
}

const SECTION_OPTIONS: { id: PlanDecision; label: string; activeBg: string }[] = [
  { id: 'attend', label: 'Attending', activeBg: 'bg-green-600' },
  { id: 'reduce', label: 'Attending (reduced)', activeBg: 'bg-amber-500' },
  { id: 'new', label: 'New — never attended', activeBg: 'bg-purple-600' },
  { id: 'evaluating', label: 'Evaluating', activeBg: 'bg-gray-500' },
  { id: 'cut', label: 'Not attending', activeBg: 'bg-red-600' },
];

// This only creates a line item on the plan for `planYear` — everything else
// (dates, strategy, type, sponsorship, booth, location, budget, reps) is left blank
// and filled in via inline editing directly in the Plan table afterward. A real
// conferences row still gets created (with placeholder date/location, since those
// columns are NOT NULL) so it behaves like any other conference once populated —
// it's just editable from the table instead of a big upfront form.
export function AddConferenceDrawer({ planYear, onClose, onCreated }: AddConferenceDrawerProps) {
  const [mounted, setMounted] = useState(false);
  const { panelStyle, handleResizeStart } = useDrawerResize(420, 360, 640);
  useEffect(() => { setMounted(true); }, []);

  const [name, setName] = useState('');
  const [section, setSection] = useState<PlanDecision>('attend');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const onSubmit = async () => {
    const trimmed = name.trim();
    if (!trimmed) { toast.error('Conference name is required'); return; }
    setIsSubmitting(true);
    try {
      const strategyRes = await fetch('/api/config?category=conference_strategy_type&form=conference_form');
      const strategyOptions = strategyRes.ok ? await strategyRes.json() as { id: number }[] : [];
      if (!strategyOptions.length) {
        toast.error('Configure a Conference Strategy option in Admin Settings before adding a conference.');
        setIsSubmitting(false);
        return;
      }

      const placeholderDate = `${planYear}-01-01`;
      const formData = new FormData();
      formData.append('name', trimmed);
      formData.append('start_date', placeholderDate);
      formData.append('end_date', placeholderDate);
      formData.append('location', 'TBD');
      formData.append('is_historical', '0');
      formData.append('conference_strategy_type_id', String(strategyOptions[0].id));

      const res = await fetch('/api/conferences', { method: 'POST', body: formData });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        let errMsg = 'Failed to create conference';
        try { errMsg = JSON.parse(text)?.error ?? errMsg; } catch { /* plain-text */ }
        throw new Error(errMsg);
      }
      const result = await res.json();
      const newConferenceId = Number(result.id);

      await fetch(`/api/program-planner/conferences/${newConferenceId}/decision`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ year: planYear, decision: section }),
      }).catch(() => {});

      toast.success('Added to the plan.');
      onCreated();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create conference');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end sm:items-stretch sm:justify-end">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />

      <div
        className="drawer-mobile-responsive relative flex flex-col bg-white w-full sm:w-[420px] h-auto sm:h-full shadow-2xl rounded-t-2xl sm:rounded-tl-2xl sm:rounded-bl-2xl sm:rounded-tr-none sm:rounded-br-none overflow-hidden"
        style={panelStyle}
      >
        <div className="hidden sm:block absolute left-0 inset-y-0 w-1 cursor-col-resize z-10 group/rh" onMouseDown={handleResizeStart}>
          <div className="absolute inset-y-0 left-0 w-0.5 bg-brand-secondary/0 group-hover/rh:bg-brand-secondary/40 transition-colors" />
        </div>

        <div className="flex-shrink-0 px-5 py-4 border-b border-gray-200 flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[15px] font-bold text-brand-primary font-serif leading-tight">Add to Plan</p>
            <p className="text-[11px] text-gray-500 mt-0.5">FY{planYear}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none flex-shrink-0" aria-label="Close">×</button>
        </div>

        <div className="flex-1 overflow-y-auto scrollbar-hide px-5 py-4 space-y-5">
          <div>
            <label className="label">Conference Name *</label>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              className="input-field"
              placeholder="e.g., HIMSS 2027"
              autoFocus
            />
          </div>

          <div>
            <label className="label">Section</label>
            <div className="flex flex-col gap-1.5">
              {SECTION_OPTIONS.map(opt => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setSection(opt.id)}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-left border transition-colors ${
                    section === opt.id ? `${opt.activeBg} text-white border-transparent` : 'bg-white text-gray-700 border-gray-300 hover:border-gray-400'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <p className="text-xs text-gray-500 mt-1.5">Which Plan tab section this conference starts in. Drag it to a different section anytime.</p>
          </div>

          <p className="text-xs text-gray-400">
            Dates, strategy, type, sponsorship, booth, location, budget, and reps are all blank to start — set them inline from the Plan table after creating.
          </p>
        </div>

        <div className="flex-shrink-0 flex gap-3 justify-end px-5 py-4 border-t border-gray-200">
          <button type="button" onClick={onClose} className="btn-secondary" disabled={isSubmitting}>Cancel</button>
          <button type="button" onClick={onSubmit} disabled={isSubmitting} className="btn-primary">
            {isSubmitting ? 'Adding…' : 'Add to Plan'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
