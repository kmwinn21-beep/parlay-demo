'use client';

import { useState, useMemo } from 'react';
import toast from 'react-hot-toast';
import { BUYER_ROLE_OPTIONS, normalizeTitleKey, type BuyerRoleKey, type TitleMatchConfidence, type TitleMatchMetadata } from '@/lib/titleNormalization';

interface AttendeeSlim {
  id: number;
  title?: string;
}

interface BulkClassifyTitlesModalProps {
  attendees: AttendeeSlim[];
  metadataMap: Record<number, TitleMatchMetadata>;
  functionOptions: Array<{ id: number; value: string }>;
  seniorityOptions: Array<{ id: number; value: string }>;
  onClose: () => void;
  onSaved: () => void;
}

export function BulkClassifyTitlesModal({ attendees, functionOptions, seniorityOptions, onClose, onSaved }: BulkClassifyTitlesModalProps) {
  const uniqueTitles = useMemo(() => {
    const byKey = new Map<string, { title: string; count: number }>();
    for (const a of attendees) {
      if (!a.title) continue;
      const key = normalizeTitleKey(a.title);
      if (!key) continue;
      if (byKey.has(key)) {
        byKey.get(key)!.count += 1;
      } else {
        byKey.set(key, { title: a.title, count: 1 });
      }
    }
    return Array.from(byKey.entries())
      .map(([key, { title, count }]) => ({ key, title, count }))
      .sort((a, b) => a.title.localeCompare(b.title));
  }, [attendees]);

  const [form, setForm] = useState({
    normalized_title: '',
    function_id: '',
    seniority_id: '',
    buyer_role: 'target_title' as BuyerRoleKey,
    confidence: 'high' as TitleMatchConfidence,
    apply_all_exact: true,
  });
  const [saving, setSaving] = useState(false);

  const canSave = Boolean(form.normalized_title && form.function_id && form.seniority_id);

  const handleApplyAll = async () => {
    if (!canSave) return;
    setSaving(true);
    let failCount = 0;
    await Promise.all(uniqueTitles.map(async ({ title }) => {
      try {
        const res = await fetch('/api/title-normalization-rules', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            raw_title: title,
            normalized_title: form.normalized_title,
            function_id: Number(form.function_id),
            seniority_id: Number(form.seniority_id),
            buyer_role: form.buyer_role,
            confidence: form.confidence,
            apply_all_exact: form.apply_all_exact,
          }),
        });
        if (!res.ok) throw new Error();
      } catch {
        failCount++;
      }
    }));
    setSaving(false);
    if (failCount === 0) {
      toast.success(`Classification applied to ${uniqueTitles.length} title${uniqueTitles.length !== 1 ? 's' : ''}.`);
      onSaved();
      onClose();
    } else {
      toast.error(`${failCount} title${failCount !== 1 ? 's' : ''} failed to save.`);
      if (failCount < uniqueTitles.length) onSaved();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-3 sm:p-4">
      <div className="w-full max-w-lg rounded-xl bg-white shadow-xl max-h-[92vh] flex flex-col">
        <div className="flex items-start justify-between border-b border-gray-100 px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold text-brand-primary font-serif">Classify Titles</h2>
            <p className="mt-1 text-xs text-gray-500">
              Apply one classification to {attendees.length} selected attendee{attendees.length !== 1 ? 's' : ''} · {uniqueTitles.length} unique title{uniqueTitles.length !== 1 ? 's' : ''}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-5">
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Titles being classified</p>
            <div className="flex flex-wrap gap-1.5">
              {uniqueTitles.map(({ key, title, count }) => (
                <span key={key} className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-gray-100 text-xs text-gray-700">
                  {title}
                  {count > 1 && <span className="text-gray-400 ml-0.5">×{count}</span>}
                </span>
              ))}
            </div>
          </div>

          <div>
            <label className="label">Normalized Title</label>
            <input
              value={form.normalized_title}
              onChange={e => setForm(p => ({ ...p, normalized_title: e.target.value }))}
              className="input-field"
              placeholder="e.g. VP of Sales"
              autoFocus
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Function</label>
              <select value={form.function_id} onChange={e => setForm(p => ({ ...p, function_id: e.target.value }))} className="input-field">
                <option value="">Select…</option>
                {functionOptions.map(o => <option key={o.id} value={String(o.id)}>{o.value}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Seniority</label>
              <select value={form.seniority_id} onChange={e => setForm(p => ({ ...p, seniority_id: e.target.value }))} className="input-field">
                <option value="">Select…</option>
                {seniorityOptions.map(o => <option key={o.id} value={String(o.id)}>{o.value}</option>)}
              </select>
            </div>
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
          <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
            <input type="checkbox" checked={form.apply_all_exact} onChange={e => setForm(p => ({ ...p, apply_all_exact: e.target.checked }))} className="accent-brand-secondary" />
            Also apply to unselected attendees with these same titles
          </label>
        </div>

        <div className="flex justify-end gap-2 border-t border-gray-100 px-5 py-4 flex-shrink-0">
          <button onClick={onClose} className="btn-secondary">Cancel</button>
          <button
            onClick={handleApplyAll}
            disabled={saving || !canSave}
            className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? 'Applying…' : `Apply to All (${attendees.length})`}
          </button>
        </div>
      </div>
    </div>
  );
}
