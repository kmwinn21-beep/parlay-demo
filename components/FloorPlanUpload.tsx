'use client';

import { useRef, useState } from 'react';

export interface FloorPlanRef { url: string | null; name: string | null }

/**
 * Choosing the conference's floor plan, from the conference's edit form.
 *
 * Saved on upload rather than on the form's Save, which is how the agenda
 * upload beside it behaves. The file has to be sent to storage the moment it
 * is chosen either way, so holding the "this is the floor plan" half back
 * until Save would mean a cancelled edit leaving an uploaded file that
 * nothing pointed at.
 *
 * Removing it only unsets it. The file stays in the conference's documents,
 * where the Logistics drawer's Files tab has its own delete — taking a file
 * away from there because somebody unset it here is more than was asked.
 */
export function FloorPlanUpload({ conferenceId, url, name, onChange }: {
  conferenceId: number;
  url: string | null;
  name: string | null;
  onChange: (next: FloorPlanRef) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const upload = async (file: File) => {
    setBusy(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch(`/api/conferences/${conferenceId}/floor-plan`, { method: 'POST', body: fd });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || 'Upload failed');
      onChange({ url: data.floor_plan_url ?? null, name: data.floor_plan_name ?? file.name });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setBusy(false);
    }
  };

  const clear = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/conferences/${conferenceId}/floor-plan`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Could not remove the floor plan');
      onChange({ url: null, name: null });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not remove the floor plan');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*,application/pdf"
        className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) void upload(f); e.target.value = ''; }}
      />
      {url ? (
        <div className="flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2">
          <svg className="w-4 h-4 text-brand-secondary flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 4h16v16H4z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 10h16M10 4v16" />
          </svg>
          <span className="text-sm text-gray-700 truncate flex-1 min-w-0" title={name ?? undefined}>{name ?? 'Floor plan'}</span>
          <button type="button" onClick={() => inputRef.current?.click()} disabled={busy}
            className="text-xs font-semibold text-brand-secondary hover:underline flex-shrink-0 disabled:opacity-50">
            Replace
          </button>
          <button type="button" onClick={clear} disabled={busy}
            className="text-xs font-semibold text-gray-400 hover:text-red-600 flex-shrink-0 disabled:opacity-50">
            Remove
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          className="w-full max-w-xs flex items-center justify-center gap-2 rounded-lg border-2 border-dashed border-gray-300 px-3 py-2.5 text-sm font-medium text-gray-600 hover:border-gray-400 hover:text-gray-800 transition-colors disabled:opacity-50"
        >
          <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          {busy ? 'Uploading…' : 'Upload Floor Plan'}
        </button>
      )}
      {/* Said here rather than in a toast: the thing that failed is on screen. */}
      {error && <p className="text-xs text-red-600 mt-1.5">{error}</p>}
      <p className="text-[11px] text-gray-400 mt-1.5">Image or PDF, up to 25 MB.</p>
    </div>
  );
}
