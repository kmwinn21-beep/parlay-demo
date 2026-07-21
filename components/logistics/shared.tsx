'use client';

import { useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { colorForName, fmtFileSize, fmtDate, type LogisticsFile, type LogisticsDeadline } from './types';

// No Tabler icon font is loaded anywhere in this app, so `ti ti-*` classes render
// nothing — these inline SVGs (same pattern as BudgetVsActualModal.tsx /
// QuickNotesSection.tsx) are the actually-working icon approach.
export function TrashIcon({ className = 'w-3.5 h-3.5' }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
    </svg>
  );
}

export function DownloadIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5 5-5M12 15V3" />
    </svg>
  );
}

export function ChevronLeftIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
    </svg>
  );
}

export function ChevronRightIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
    </svg>
  );
}

export function EyeIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  );
}

export function CloseIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}

export function FileIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 2v6h6" />
    </svg>
  );
}

export function EmptyState({ icon, headline, subtext }: { icon: string; headline: string; subtext: string }) {
  return (
    <div style={{ textAlign: 'center', padding: '2rem 1rem' }}>
      <i className={`ti ${icon}`} style={{ fontSize: 28, color: 'var(--text-muted, #9CA3AF)', display: 'block', marginBottom: 8 }} aria-hidden="true" />
      <p style={{ fontSize: 13, color: 'var(--text-secondary, #6B7280)', margin: '0 0 4px' }}>{headline}</p>
      <p style={{ fontSize: 12, color: 'var(--text-muted, #9CA3AF)', margin: 0 }}>{subtext}</p>
    </div>
  );
}

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

// Fixed width (rather than shrink-to-content) so this pill's varying text
// ("Overdue" vs "12 days" vs "Complete") doesn't change how much space is left
// for the flex-1 label to its left — which would otherwise shift the date
// column out of alignment row to row.
const STATUS_PILL_CLASS = 'w-[74px] px-2 text-center py-0.5 rounded-full text-[10px] font-medium whitespace-nowrap flex-shrink-0';

export function DeadlineStatusPill({ deadline }: { deadline: LogisticsDeadline }) {
  if (deadline.completed) {
    return <span className={`${STATUS_PILL_CLASS} bg-green-100 text-green-700`}>Complete</span>;
  }
  if (deadline.daysUntil < 0) {
    return <span className={`${STATUS_PILL_CLASS} bg-red-100 text-red-700`}>Overdue</span>;
  }
  if (deadline.daysUntil <= 14) {
    return <span className={`${STATUS_PILL_CLASS} bg-amber-100 text-amber-700`}>{deadline.daysUntil} day{deadline.daysUntil !== 1 ? 's' : ''}</span>;
  }
  return <span className={`${STATUS_PILL_CLASS} bg-gray-100 text-gray-500`}>{deadline.daysUntil} days</span>;
}

// Generic, editable checklist backed by conference_plan_deadlines rows scoped to a
// single `category` — shared by every tab's checklist (Booth/Shipping/Post-show's
// auto-created defaults, plus Registration/Sponsorship/Speaking/Travel's
// user-built-from-scratch lists). Each row's label and due date are directly
// editable (blur to save), and rows can be added or removed at any time.
export function ChecklistSection({
  conferenceId, planYear, category, deadlines, onDeadlinesChange, title = 'Checklist',
}: {
  conferenceId: number;
  planYear: number;
  category: string;
  deadlines: LogisticsDeadline[];
  onDeadlinesChange: (deadlines: LogisticsDeadline[]) => void;
  title?: string;
}) {
  const [newLabel, setNewLabel] = useState('');
  const [newDueDate, setNewDueDate] = useState('');
  const [adding, setAdding] = useState(false);

  const items = deadlines.filter(d => d.category === category);

  const patchItem = async (id: number, body: Partial<{ label: string; dueDate: string; completed: boolean }>) => {
    const res = await fetch(`/api/program-planner/conferences/${conferenceId}/logistics/deadlines/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    }).catch(() => null);
    if (!res || !res.ok) toast.error('Failed to update checklist item.');
  };

  const toggleComplete = (item: LogisticsDeadline) => {
    onDeadlinesChange(deadlines.map(d => d.id === item.id ? { ...d, completed: !d.completed } : d));
    patchItem(item.id, { completed: !item.completed });
  };

  const saveLabel = (item: LogisticsDeadline, label: string) => {
    if (!label.trim() || label === item.label) return;
    onDeadlinesChange(deadlines.map(d => d.id === item.id ? { ...d, label } : d));
    patchItem(item.id, { label });
  };

  const saveDueDate = (item: LogisticsDeadline, dueDate: string) => {
    if (!dueDate || dueDate === item.dueDate) return;
    const daysUntil = Math.ceil((new Date(dueDate).getTime() - Date.now()) / 86400000);
    onDeadlinesChange(deadlines.map(d => d.id === item.id ? { ...d, dueDate, daysUntil } : d));
    patchItem(item.id, { dueDate });
  };

  const deleteItem = async (id: number) => {
    try {
      const res = await fetch(`/api/program-planner/conferences/${conferenceId}/logistics/deadlines/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error();
      onDeadlinesChange(deadlines.filter(d => d.id !== id));
    } catch {
      toast.error('Failed to delete checklist item.');
    }
  };

  const addItem = async () => {
    if (!newLabel.trim() || !newDueDate) return;
    setAdding(true);
    try {
      const res = await fetch(`/api/program-planner/conferences/${conferenceId}/logistics/deadlines?year=${planYear}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label: newLabel.trim(), dueDate: newDueDate, category }),
      });
      if (!res.ok) throw new Error();
      const created = await res.json() as LogisticsDeadline;
      onDeadlinesChange([...deadlines, created]);
      setNewLabel(''); setNewDueDate('');
    } catch {
      toast.error('Failed to add checklist item.');
    } finally {
      setAdding(false);
    }
  };

  return (
    <div className="pt-2 border-t border-gray-100">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">{title}</p>
      {items.length === 0 ? (
        <p className="text-xs text-gray-400 italic mb-2">No items yet.</p>
      ) : (
        <div className="space-y-1 mb-2">
          {items.map(item => (
            <div
              key={item.id}
              className="flex items-center gap-1.5 rounded-md px-1.5 py-1 border border-dashed border-transparent focus-within:border-gray-400"
            >
              <button
                type="button"
                onClick={() => deleteItem(item.id)}
                className="text-red-500 hover:text-red-600 flex-shrink-0"
                title="Delete item"
              >
                <TrashIcon />
              </button>
              <input
                type="checkbox"
                checked={item.completed}
                onChange={() => toggleComplete(item)}
                className="accent-brand-secondary w-3.5 h-3.5 flex-shrink-0"
              />
              <input
                defaultValue={item.label}
                onBlur={e => saveLabel(item, e.target.value)}
                className={`flex-1 min-w-0 text-xs bg-transparent border-0 focus:ring-0 focus:outline-none px-0 ${item.completed ? 'text-gray-400 line-through' : 'text-gray-700'}`}
              />
              <div className="flex-shrink-0"><DeadlineStatusPill deadline={item} /></div>
              <input
                type="date"
                defaultValue={item.dueDate}
                onBlur={e => saveDueDate(item, e.target.value)}
                className="text-xs text-gray-400 bg-transparent border-0 focus:ring-0 focus:outline-none w-[104px] flex-shrink-0"
              />
            </div>
          ))}
        </div>
      )}
      <div className="flex items-center gap-1.5">
        <input value={newLabel} onChange={e => setNewLabel(e.target.value)} placeholder="Add item..." className="input-field text-xs flex-1" />
        <input type="date" value={newDueDate} onChange={e => setNewDueDate(e.target.value)} className="input-field text-xs w-32" />
        <button type="button" onClick={addItem} disabled={adding || !newLabel.trim() || !newDueDate} className="btn-secondary text-xs px-2.5 py-1.5 disabled:opacity-50 flex-shrink-0">
          + Add
        </button>
      </div>
    </div>
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

function fileTypeColor(fileType: string | null, fileName: string): string {
  const ext = (fileName.split('.').pop() || '').toLowerCase();
  if (fileType?.includes('pdf') || ext === 'pdf') return 'text-red-600';
  if (fileType?.includes('sheet') || ['xlsx', 'xls', 'csv'].includes(ext)) return 'text-green-600';
  if (fileType?.includes('word') || ['docx', 'doc'].includes(ext)) return 'text-blue-600';
  return 'text-gray-500';
}

type PreviewKind = 'image' | 'pdf' | null;

function previewKind(fileType: string | null, fileName: string): PreviewKind {
  const ext = (fileName.split('.').pop() || '').toLowerCase();
  if (fileType?.startsWith('image/') || ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(ext)) return 'image';
  if (fileType?.includes('pdf') || ext === 'pdf') return 'pdf';
  return null;
}

// In-drawer preview so a user can look at an uploaded file without downloading
// it or leaving the planning drawer for another tab. Only images and PDFs can
// render inline in the browser; anything else falls back to a download prompt.
export function FilePreviewModal({ file, onClose }: { file: LogisticsFile; onClose: () => void }) {
  const kind = previewKind(file.fileType, file.fileName);
  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.6)' }}
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-2xl flex flex-col w-full max-w-3xl"
        style={{ maxHeight: '85vh' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center gap-2.5 px-4 py-3 border-b border-gray-100 flex-shrink-0">
          <p className="text-sm font-medium text-gray-800 truncate flex-1">{file.fileName}</p>
          <a
            href={file.fileUrl}
            target="_blank"
            rel="noopener noreferrer"
            download={file.fileName}
            className="p-1.5 rounded-lg text-gray-400 hover:text-brand-secondary hover:bg-gray-50 transition-colors flex-shrink-0"
            title="Download"
          >
            <DownloadIcon className="w-4 h-4" />
          </a>
          <button type="button" onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-50 transition-colors flex-shrink-0" title="Close">
            <CloseIcon className="w-4 h-4" />
          </button>
        </div>
        <div className="flex-1 overflow-auto bg-gray-50 flex items-center justify-center min-h-[300px]">
          {kind === 'image' ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={file.fileUrl} alt={file.fileName} className="max-w-full max-h-full object-contain" />
          ) : kind === 'pdf' ? (
            <iframe src={file.fileUrl} title={file.fileName} className="w-full h-full border-0" style={{ minHeight: '70vh' }} />
          ) : (
            <div className="text-center py-12 px-6">
              <FileIcon className="w-8 h-8 text-gray-300 mx-auto mb-2" />
              <p className="text-sm text-gray-500 mb-1">Preview not available for this file type</p>
              <p className="text-xs text-gray-400">Download it to view the contents.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function FileRow({ conferenceId, file, onDeleted }: { conferenceId: number; file: LogisticsFile; onDeleted: (id: number) => void }) {
  const [deleting, setDeleting] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const color = fileTypeColor(file.fileType, file.fileName);

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
      <FileIcon className={`w-4 h-4 flex-shrink-0 ${color}`} />
      <button type="button" onClick={() => setPreviewOpen(true)} className="min-w-0 flex-1 text-left">
        <p className="text-xs font-medium text-gray-800 truncate hover:text-brand-secondary transition-colors">{file.fileName}</p>
        <p className="text-[10px] text-gray-400">
          {fmtFileSize(file.fileSize)}{file.uploadedByName ? ` · ${file.uploadedByName}` : ''}
        </p>
      </button>
      <button
        type="button"
        onClick={() => setPreviewOpen(true)}
        className="p-1.5 rounded-lg text-gray-400 hover:text-brand-secondary hover:bg-gray-50 transition-colors flex-shrink-0"
        title="Preview"
      >
        <EyeIcon className="w-4 h-4" />
      </button>
      <a
        href={file.fileUrl}
        target="_blank"
        rel="noopener noreferrer"
        download={file.fileName}
        className="p-1.5 rounded-lg text-gray-400 hover:text-brand-secondary hover:bg-gray-50 transition-colors flex-shrink-0"
        title="Download"
      >
        <DownloadIcon className="w-4 h-4" />
      </a>
      <button
        type="button"
        onClick={handleDelete}
        disabled={deleting}
        className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors flex-shrink-0 disabled:opacity-50"
        title="Delete"
      >
        <TrashIcon className="w-4 h-4" />
      </button>
      {previewOpen && <FilePreviewModal file={file} onClose={() => setPreviewOpen(false)} />}
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
