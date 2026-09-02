'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { ImageCropModal, readImageFromClipboard } from '@/components/AttendeePhoto';

/**
 * A conference's logo, supplied the same three ways an attendee photo is:
 * picked from disk, dropped on the field, or pasted. Every route feeds the
 * same crop step, so what is stored is always a square the person approved.
 *
 * The field serves two different moments. On an existing conference it saves
 * as soon as the crop is confirmed, like the attendee photo does — there is a
 * record to attach to and nothing to lose. On the add form there is no
 * conference yet, so the cropped image is held and handed back for the caller
 * to upload once the record exists; until then the preview is a local object
 * URL. Either way the person sees the same field.
 */

/** First image file on a clipboard or drag payload, if there is one. */
export function imageFromTransfer(dt: DataTransfer | null): File | null {
  if (!dt) return null;
  const direct = Array.from(dt.files ?? []).find(f => f.type.startsWith('image/'));
  if (direct) return direct;
  // Screenshots and "Copy image" often arrive as items rather than files.
  for (const item of Array.from(dt.items ?? [])) {
    if (item.kind === 'file' && item.type.startsWith('image/')) {
      const f = item.getAsFile();
      if (f) return f;
    }
  }
  return null;
}

export function ConferenceLogoField({ conferenceId, logoUrl, onSaved, onPending, label = 'Logo' }: {
  /** Omitted on the add form, where the conference does not exist yet. */
  conferenceId?: number | null;
  /** The stored logo, when there is one. */
  logoUrl?: string | null;
  /** Called with the new URL after a save against an existing conference. */
  onSaved?: (url: string | null) => void;
  /** Called with the cropped image when there is no conference to save to. */
  onPending?: (blob: Blob | null) => void;
  label?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [cropFile, setCropFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [dragging, setDragging] = useState(false);
  // Preview for a logo that has not been uploaded yet.
  const [pendingUrl, setPendingUrl] = useState<string | null>(null);

  useEffect(() => () => { if (pendingUrl) URL.revokeObjectURL(pendingUrl); }, [pendingUrl]);

  const shown = pendingUrl ?? logoUrl ?? null;

  const pick = useCallback((file: File | null | undefined) => {
    if (!file) return;
    if (!/^image\/(png|jpeg|jpg|webp)$/.test(file.type)) {
      toast.error('Use a PNG, JPEG or WebP image.');
      return;
    }
    setCropFile(file);
  }, []);

  const pasteFromButton = useCallback(async () => {
    try {
      pick(await readImageFromClipboard());
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not read the clipboard.');
    }
  }, [pick]);

  // Pasting anywhere in the form sets the logo, but only when the clipboard
  // actually carries an image — pasting text into the other fields must still
  // behave normally.
  useEffect(() => {
    if (cropFile) return;
    const onPaste = (e: ClipboardEvent) => {
      const file = imageFromTransfer(e.clipboardData);
      if (!file) return;
      e.preventDefault();
      pick(file);
    };
    document.addEventListener('paste', onPaste);
    return () => document.removeEventListener('paste', onPaste);
  }, [cropFile, pick]);

  const handleConfirm = async (blob: Blob) => {
    setCropFile(null);
    if (inputRef.current) inputRef.current.value = '';

    if (conferenceId == null) {
      if (pendingUrl) URL.revokeObjectURL(pendingUrl);
      setPendingUrl(URL.createObjectURL(blob));
      onPending?.(blob);
      return;
    }

    setSaving(true);
    try {
      const form = new FormData();
      form.append('file', new File([blob], 'logo.jpg', { type: 'image/jpeg' }));
      const res = await fetch(`/api/conferences/${conferenceId}/logo`, { method: 'POST', body: form });
      const text = await res.text();
      if (!res.ok) {
        let msg = 'Failed to save logo.';
        try { msg = (JSON.parse(text) as { error?: string }).error || msg; } catch { /* non-JSON */ }
        throw new Error(msg);
      }
      const data = JSON.parse(text) as { logo_url: string };
      toast.success('Logo saved.');
      onSaved?.(data.logo_url);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save logo.');
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async () => {
    if (conferenceId == null) {
      if (pendingUrl) URL.revokeObjectURL(pendingUrl);
      setPendingUrl(null);
      onPending?.(null);
      return;
    }
    if (!confirm('Remove this logo?')) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/conferences/${conferenceId}/logo`, { method: 'DELETE' });
      if (!res.ok) throw new Error();
      toast.success('Logo removed.');
      onSaved?.(null);
    } catch { toast.error('Failed to remove logo.'); }
    finally { setSaving(false); }
  };

  return (
    <div>
      <label className="label">{label}</label>
      <div
        onDragOver={e => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); setDragging(true); } }}
        onDragLeave={() => setDragging(false)}
        onDrop={e => {
          const file = imageFromTransfer(e.dataTransfer);
          if (!file) return;
          e.preventDefault();
          setDragging(false);
          pick(file);
        }}
        className={`flex items-center gap-4 rounded-xl border-2 border-dashed p-3 transition-colors ${
          dragging ? 'border-brand-secondary bg-brand-secondary/5' : 'border-transparent'
        }`}
      >
        <div className="w-16 h-16 rounded-lg bg-gray-100 border border-gray-200 flex items-center justify-center flex-shrink-0 overflow-hidden">
          {shown
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={shown} alt="" className="w-full h-full object-contain" />
            : (
              <svg className="w-6 h-6 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => inputRef.current?.click()} disabled={saving} className="btn-secondary text-sm">
            {saving ? 'Saving…' : shown ? 'Replace logo' : 'Upload logo'}
          </button>
          <button type="button" onClick={pasteFromButton} disabled={saving} className="btn-secondary text-sm">
            Paste logo
          </button>
          {shown && (
            <button type="button" onClick={handleRemove} disabled={saving} className="text-sm text-red-500 hover:text-red-600 transition-colors">
              Remove
            </button>
          )}
          <p className="w-full text-xs text-gray-400">
            {dragging
              ? 'Drop the image to crop it.'
              : 'PNG, JPEG or WebP — upload, drag one here, or paste with ⌘/Ctrl+V. You can crop it before saving.'}
          </p>
        </div>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={e => pick(e.target.files?.[0])}
      />
      {cropFile && (
        <ImageCropModal
          file={cropFile}
          shape="square"
          title="Crop logo"
          confirmLabel="Save logo"
          onCancel={() => {
            setCropFile(null);
            if (inputRef.current) inputRef.current.value = '';
          }}
          onConfirm={handleConfirm}
        />
      )}
    </div>
  );
}
