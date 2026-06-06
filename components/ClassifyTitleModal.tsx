'use client';

import { useState } from 'react';
import toast from 'react-hot-toast';
import { BUYER_ROLE_OPTIONS, type BuyerRoleKey, type TitleMatchConfidence, type TitleMatchMetadata } from '@/lib/titleNormalization';

interface ClassifyTitleModalProps {
  rawTitle: string;
  meta: TitleMatchMetadata | null | undefined;
  functionOptions: Array<{ id: number; value: string }>;
  seniorityOptions: Array<{ id: number; value: string }>;
  onClose: () => void;
  onSaved: (meta: TitleMatchMetadata) => void;
}

export function ClassifyTitleModal({ rawTitle, meta, functionOptions, seniorityOptions, onClose, onSaved }: ClassifyTitleModalProps) {
  const [form, setForm] = useState({
    normalized_title: meta?.normalized_title || meta?.suggested_match || '',
    function_id: meta?.function_id ? String(meta.function_id) : '',
    seniority_id: meta?.seniority_id ? String(meta.seniority_id) : '',
    buyer_role: (meta?.buyer_role || 'target_title') as BuyerRoleKey,
    confidence: (meta?.match_confidence || 'high') as TitleMatchConfidence,
    notes: '',
    apply_all_exact: true,
  });
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!form.normalized_title || !form.function_id || !form.seniority_id) return;
    setSaving(true);
    try {
      const res = await fetch('/api/title-normalization-rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          raw_title: rawTitle,
          normalized_title: form.normalized_title,
          function_id: Number(form.function_id),
          seniority_id: Number(form.seniority_id),
          buyer_role: form.buyer_role,
          confidence: form.confidence,
          notes: form.notes,
          apply_all_exact: form.apply_all_exact,
        }),
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      toast.success('Title classification saved.');
      onSaved(data.metadata);
      onClose();
    } catch {
      toast.error('Failed to save classification.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-3 sm:p-4">
      <div className="w-full max-w-lg rounded-xl bg-white shadow-xl max-h-[calc(100dvh-1.5rem)] sm:max-h-[92vh] flex flex-col">
        <div className="flex items-start justify-between border-b border-gray-100 px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold text-brand-primary font-serif">Classify Attendee Title</h2>
            <p className="mt-1 text-xs text-gray-500">Apply to all attendees with this exact title.</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600" aria-label="Close">
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        <div className="space-y-4 px-5 py-4 overflow-y-auto">
          <div className="rounded-lg bg-gray-50 p-3 text-sm">
            <p><span className="font-medium text-gray-700">Original Title:</span> {rawTitle}</p>
            <p className="mt-1"><span className="font-medium text-gray-700">Suggested Match:</span> {meta?.suggested_match || meta?.normalized_title || 'No suggestion available'}</p>
            <p className="mt-1 text-xs text-gray-500">Match: {meta?.match_type || 'none'} · Confidence: {meta?.match_confidence || 'low'}</p>
          </div>
          <div>
            <label className="label">Normalized Title</label>
            <input value={form.normalized_title} onChange={e => setForm(p => ({ ...p, normalized_title: e.target.value }))} className="input-field" placeholder="e.g. CHRO" />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="label">Function</label>
              <select value={form.function_id} onChange={e => setForm(p => ({ ...p, function_id: e.target.value }))} className="input-field">
                <option value="">Select function</option>
                {functionOptions.map(o => <option key={o.id} value={String(o.id)}>{o.value}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Seniority</label>
              <select value={form.seniority_id} onChange={e => setForm(p => ({ ...p, seniority_id: e.target.value }))} className="input-field">
                <option value="">Select seniority</option>
                {seniorityOptions.map(o => <option key={o.id} value={String(o.id)}>{o.value}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="label">Buyer Role</label>
              <select value={form.buyer_role} onChange={e => setForm(p => ({ ...p, buyer_role: e.target.value as BuyerRoleKey }))} className="input-field">
                {BUYER_ROLE_OPTIONS.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Confidence</label>
              <select value={form.confidence} onChange={e => setForm(p => ({ ...p, confidence: e.target.value as TitleMatchConfidence }))} className="input-field">
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
            </div>
          </div>
          <div>
            <label className="label">Notes</label>
            <textarea value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} className="input-field min-h-[72px]" placeholder="Optional context for your team" />
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" checked={form.apply_all_exact} onChange={e => setForm(p => ({ ...p, apply_all_exact: e.target.checked }))} />
            Apply to all attendees with this exact title
          </label>
        </div>
        <div className="flex justify-end gap-2 border-t border-gray-100 px-5 py-4 flex-shrink-0">
          <button onClick={onClose} className="btn-secondary">Cancel</button>
          <button onClick={handleSave} disabled={saving || !form.normalized_title || !form.function_id || !form.seniority_id} className="btn-primary">
            {saving ? 'Saving…' : 'Save Classification'}
          </button>
        </div>
      </div>
    </div>
  );
}
