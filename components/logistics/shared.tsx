'use client';

import { useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { colorForName, fmtFileSize, type LogisticsFile } from './types';

// Small fading checkmark shown next to a field for ~1.5s after a successful
// auto-save — the fallback pattern confirmed for this codebase (no dedicated
// inline "saved" indicator existed; react-hot-toast exists but is reserved here
// for hard failures, not routine per-field saves).
export function SavedCheckmark({ show }: { show: boolean }) {
  return (
    <i
      className="ti ti-check"
      aria-hidden="true"
      style={{
        fontSize: 11,
        color: 'var(--text-success, #059669)',
        marginLeft: 6,
        opacity: show ? 1 : 0,
        transition: 'opacity 0.3s ease',
      }}
    />
  );
}

export function AvatarCircle({ name, initials, size = 28 }: { name: string; initials: string; size?: number }) {
  return (
    <div
      className="rounded-full flex items-center justify-center text-white flex-shrink-0"
      style={{ width: size, height: size, backgroundColor: colorForName(name), fontSize: size * 0.36, fontWeight: 500 }}
      title={name}
    >
      {initials}
    </div>
  );
}

export async function patchPlanField(conferenceId: number, planYear: number, field: string, value: unknown): Promise<boolean> {
  try {
    const res = await fetch(`/api/program-planner/conferences/${conferenceId}/logistics/plan?year=${planYear}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [field]: value }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// Text/date/textarea field that auto-saves a single conference_plans logistics
// column on blur, with a fading checkmark confirming the save.
export function AutoSaveField({
  conferenceId, planYear, field, initialValue, label, type = 'text', placeholder,
}: {
  conferenceId: number;
  planYear: number;
  field: string;
  initialValue: string;
  label: string;
  type?: 'text' | 'date' | 'textarea';
  placeholder?: string;
}) {
  const [value, setValue] = useState(initialValue);
  const [saved, setSaved] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleBlur = async () => {
    const ok = await patchPlanField(conferenceId, planYear, field, value || null);
    if (ok) {
      setSaved(true);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setSaved(false), 1500);
    }
  };

  return (
    <div>
      <label className="label flex items-center">{label}<SavedCheckmark show={saved} /></label>
      {type === 'textarea' ? (
        <textarea
          className="input-field resize-none" rows={3}
          value={value} onChange={e => setValue(e.target.value)} onBlur={handleBlur} placeholder={placeholder}
        />
      ) : (
        <input
          type={type} className="input-field"
          value={value} onChange={e => setValue(e.target.value)} onBlur={handleBlur} placeholder={placeholder}
        />
      )}
    </div>
  );
}

export function AutoSaveCheckbox({
  conferenceId, planYear, field, initialChecked, label, onSaved,
}: {
  conferenceId: number;
  planYear: number;
  field: string;
  initialChecked: boolean;
  label: string;
  onSaved?: (checked: boolean) => void;
}) {
  const [checked, setChecked] = useState(initialChecked);
  const toggle = async () => {
    const next = !checked;
    setChecked(next);
    const ok = await patchPlanField(conferenceId, planYear, field, next);
    if (ok) onSaved?.(next);
    else setChecked(!next);
  };
  return (
    <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
      <input type="checkbox" checked={checked} onChange={toggle} className="accent-brand-secondary w-4 h-4" />
      {label}
    </label>
  );
}

export function Spinner({ size = 24 }: { size?: number }) {
  return (
    <svg className="animate-spin text-brand-secondary" style={{ width: size, height: size }} fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

function fileTypeIconColor(fileType: string | null, fileName: string): { icon: string; color: string } {
  const ext = (fileName.split('.').pop() || '').toLowerCase();
  if (fileType?.includes('pdf') || ext === 'pdf') return { icon: 'ti-file-type-pdf', color: 'text-red-600' };
  if (fileType?.includes('sheet') || ['xlsx', 'xls', 'csv'].includes(ext)) return { icon: 'ti-file-spreadsheet', color: 'text-green-600' };
  if (fileType?.includes('word') || ['docx', 'doc'].includes(ext)) return { icon: 'ti-file-text', color: 'text-blue-600' };
  return { icon: 'ti-file', color: 'text-gray-500' };
}

export function FileRow({ conferenceId, file, onDeleted }: { conferenceId: number; file: LogisticsFile; onDeleted: (id: number) => void }) {
  const [deleting, setDeleting] = useState(false);
  const { icon, color } = fileTypeIconColor(file.fileType, file.fileName);

  const handleDelete = async () => {
    setDeleting(true);
    try {
      const res = await fetch(`/api/program-planner/conferences/${conferenceId}/logistics/files/${file.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error();
      onDeleted(file.id);
    } catch {
      toast.error('Failed to delete file.');
      setDeleting(false);
    }
  };

  return (
    <div className="flex items-center gap-2.5 py-2 border-b border-gray-100 last:border-0">
      <i className={`ti ${icon} ${color} text-lg flex-shrink-0`} aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-gray-800 truncate">{file.fileName}</p>
        <p className="text-[10px] text-gray-400">
          {fmtFileSize(file.fileSize)}{file.uploadedByName ? ` · ${file.uploadedByName}` : ''}
        </p>
      </div>
      <a
        href={file.fileUrl}
        target="_blank"
        rel="noopener noreferrer"
        download={file.fileName}
        className="p-1.5 rounded-lg text-gray-400 hover:text-brand-secondary hover:bg-gray-50 transition-colors flex-shrink-0"
        title="Download"
      >
        <i className="ti ti-download text-sm" aria-hidden="true" />
      </a>
      <button
        type="button"
        onClick={handleDelete}
        disabled={deleting}
        className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors flex-shrink-0 disabled:opacity-50"
        title="Delete"
      >
        <i className="ti ti-trash text-sm" aria-hidden="true" />
      </button>
    </div>
  );
}

export function FileUploadZone({
  conferenceId, planYear, onUploaded,
}: {
  conferenceId: number;
  planYear: number;
  onUploaded: (file: LogisticsFile) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const upload = async (file: File) => {
    setUploading(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('year', String(planYear));
      const res = await fetch(`/api/program-planner/conferences/${conferenceId}/logistics/files`, { method: 'POST', body: fd });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Upload failed');
      }
      const created = await res.json() as LogisticsFile;
      onUploaded(created);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div
      onDragOver={e => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={e => {
        e.preventDefault();
        setDragOver(false);
        const file = e.dataTransfer.files[0];
        if (file) void upload(file);
      }}
      onClick={() => inputRef.current?.click()}
      className={`border-2 border-dashed rounded-xl p-4 text-center cursor-pointer transition-colors ${
        dragOver ? 'border-brand-secondary bg-blue-50' : 'border-gray-300 hover:border-gray-400'
      }`}
    >
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) void upload(f); e.target.value = ''; }}
      />
      {uploading ? (
        <div className="flex items-center justify-center gap-2 text-xs text-gray-500"><Spinner size={16} />Uploading…</div>
      ) : (
        <p className="text-xs text-gray-500">
          <span className="text-brand-secondary font-medium">Click to upload</span> or drag and drop
        </p>
      )}
      {error && <p className="text-[11px] text-red-500 mt-1">{error}</p>}
    </div>
  );
}
