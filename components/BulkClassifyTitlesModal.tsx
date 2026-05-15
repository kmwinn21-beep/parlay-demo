'use client';

import { useState, useMemo } from 'react';
import toast from 'react-hot-toast';
import { BUYER_ROLE_OPTIONS, normalizeTitleKey, shouldWarnForTitleMetadata, type BuyerRoleKey, type TitleMatchMetadata } from '@/lib/titleNormalization';

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

interface TitleGroup {
  key: string;
  title: string;
  attendeeCount: number;
  meta: TitleMatchMetadata | undefined;
}

interface RowForm {
  normalized_title: string;
  function_id: string;
  seniority_id: string;
  buyer_role: BuyerRoleKey;
  confidence: string;
  apply_all_exact: boolean;
  saving: boolean;
  saved: boolean;
}

function defaultRowForm(meta: TitleMatchMetadata | undefined): RowForm {
  return {
    normalized_title: meta?.normalized_title || meta?.suggested_match || '',
    function_id: meta?.function_id ? String(meta.function_id) : '',
    seniority_id: meta?.seniority_id ? String(meta.seniority_id) : '',
    buyer_role: (meta?.buyer_role || 'target_title') as BuyerRoleKey,
    confidence: meta?.match_confidence || 'high',
    apply_all_exact: true,
    saving: false,
    saved: false,
  };
}

export function BulkClassifyTitlesModal({ attendees, metadataMap, functionOptions, seniorityOptions, onClose, onSaved }: BulkClassifyTitlesModalProps) {
  const titleGroups = useMemo((): TitleGroup[] => {
    const byKey = new Map<string, TitleGroup>();
    for (const a of attendees) {
      if (!a.title) continue;
      const key = normalizeTitleKey(a.title);
      if (!key) continue;
      // Use the first attendee's metadata for the group
      const meta = metadataMap[a.id];
      if (!shouldWarnForTitleMetadata(meta)) continue;
      if (byKey.has(key)) {
        byKey.get(key)!.attendeeCount += 1;
      } else {
        byKey.set(key, { key, title: a.title, attendeeCount: 1, meta });
      }
    }
    return Array.from(byKey.values()).sort((a, b) => a.title.localeCompare(b.title));
  }, [attendees, metadataMap]);

  const [forms, setForms] = useState<Record<string, RowForm>>(() => {
    const init: Record<string, RowForm> = {};
    for (const g of titleGroups) init[g.key] = defaultRowForm(g.meta);
    return init;
  });

  const updateForm = (key: string, updates: Partial<RowForm>) =>
    setForms(prev => ({ ...prev, [key]: { ...prev[key], ...updates } }));

  const saveRow = async (group: TitleGroup) => {
    const form = forms[group.key];
    if (!form.normalized_title || !form.function_id || !form.seniority_id) {
      toast.error('Fill in all required fields.');
      return;
    }
    updateForm(group.key, { saving: true });
    try {
      const res = await fetch('/api/title-normalization-rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          raw_title: group.title,
          normalized_title: form.normalized_title,
          function_id: Number(form.function_id),
          seniority_id: Number(form.seniority_id),
          buyer_role: form.buyer_role,
          confidence: form.confidence,
          apply_all_exact: form.apply_all_exact,
        }),
      });
      if (!res.ok) throw new Error();
      updateForm(group.key, { saving: false, saved: true });
      toast.success(`"${group.title}" classified.`);
    } catch {
      updateForm(group.key, { saving: false });
      toast.error('Failed to save classification.');
    }
  };

  const savedCount = Object.values(forms).filter(f => f.saved).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-3 sm:p-4">
      <div className="w-full max-w-2xl rounded-xl bg-white shadow-xl max-h-[92vh] flex flex-col">
        <div className="flex items-start justify-between border-b border-gray-100 px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold text-brand-primary font-serif">Classify Titles</h2>
            <p className="mt-1 text-xs text-gray-500">
              {titleGroups.length} unique title{titleGroups.length !== 1 ? 's' : ''} need review
              {savedCount > 0 && ` · ${savedCount} saved`}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        <div className="overflow-y-auto flex-1 divide-y divide-gray-100">
          {titleGroups.length === 0 && (
            <div className="px-5 py-8 text-center text-gray-400 text-sm">No titles need review in your selection.</div>
          )}
          {titleGroups.map(group => {
            const form = forms[group.key] || defaultRowForm(group.meta);
            return (
              <div key={group.key} className={`px-5 py-4 ${form.saved ? 'bg-green-50' : ''}`}>
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <p className="text-sm font-semibold text-gray-900">{group.title}</p>
                    <p className="text-xs text-gray-400">{group.attendeeCount} attendee{group.attendeeCount !== 1 ? 's' : ''}</p>
                  </div>
                  {form.saved && (
                    <span className="inline-flex items-center gap-1 text-xs text-green-700 font-medium">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                      Saved
                    </span>
                  )}
                </div>
                {!form.saved && (
                  <>
                    <div className="grid grid-cols-2 gap-3 mb-3">
                      <div className="col-span-2">
                        <label className="label text-xs">Normalized Title</label>
                        <input
                          value={form.normalized_title}
                          onChange={e => updateForm(group.key, { normalized_title: e.target.value })}
                          className="input-field text-sm"
                          placeholder="e.g. VP of Sales"
                        />
                      </div>
                      <div>
                        <label className="label text-xs">Function</label>
                        <select value={form.function_id} onChange={e => updateForm(group.key, { function_id: e.target.value })} className="input-field text-sm">
                          <option value="">Select…</option>
                          {functionOptions.map(o => <option key={o.id} value={String(o.id)}>{o.value}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="label text-xs">Seniority</label>
                        <select value={form.seniority_id} onChange={e => updateForm(group.key, { seniority_id: e.target.value })} className="input-field text-sm">
                          <option value="">Select…</option>
                          {seniorityOptions.map(o => <option key={o.id} value={String(o.id)}>{o.value}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="label text-xs">Buyer Role</label>
                        <select value={form.buyer_role} onChange={e => updateForm(group.key, { buyer_role: e.target.value as BuyerRoleKey })} className="input-field text-sm">
                          {BUYER_ROLE_OPTIONS.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="label text-xs">Confidence</label>
                        <select value={form.confidence} onChange={e => updateForm(group.key, { confidence: e.target.value })} className="input-field text-sm">
                          <option value="high">High</option>
                          <option value="medium">Medium</option>
                          <option value="low">Low</option>
                        </select>
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <label className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer">
                        <input type="checkbox" checked={form.apply_all_exact} onChange={e => updateForm(group.key, { apply_all_exact: e.target.checked })} className="accent-brand-secondary" />
                        Apply to all attendees with this exact title
                      </label>
                      <button
                        onClick={() => saveRow(group)}
                        disabled={form.saving || !form.normalized_title || !form.function_id || !form.seniority_id}
                        className="btn-primary text-xs px-3 py-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {form.saving ? 'Saving…' : 'Save'}
                      </button>
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
        <div className="flex justify-end gap-2 border-t border-gray-100 px-5 py-4 flex-shrink-0">
          <button onClick={() => { if (savedCount > 0) onSaved(); onClose(); }} className="btn-secondary">
            {savedCount > 0 ? 'Done' : 'Cancel'}
          </button>
        </div>
      </div>
    </div>
  );
}
