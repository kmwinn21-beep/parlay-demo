'use client';

import { useState } from 'react';
import toast from 'react-hot-toast';

export interface DownloadColumn<T> {
  key: string;
  label: string;
  /** Cell text for one row — formatting lives with the caller. */
  value: (row: T) => string;
  /** Ticked when the picker opens. Defaults to true. */
  defaultOn?: boolean;
}

function csvEscape(val: string) {
  return /[",\n]/.test(val) ? `"${val.replace(/"/g, '""')}"` : val;
}

/**
 * Pick columns and a file type, then download the rows. Shared so any table
 * can offer the same export without repeating the CSV/XLSX plumbing.
 */
export function DownloadModal<T>({ rows, columns, fileBase, title = 'Download', onClose }: {
  rows: T[];
  columns: DownloadColumn<T>[];
  /** Basename of the file; the date and extension are appended. */
  fileBase: string;
  title?: string;
  onClose: () => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(columns.filter(c => c.defaultOn !== false).map(c => c.key)),
  );
  const [format, setFormat] = useState<'csv' | 'xlsx'>('csv');
  const [busy, setBusy] = useState(false);

  const toggle = (key: string) => setSelected(prev => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });

  const handleDownload = async () => {
    const cols = columns.filter(c => selected.has(c.key));
    if (cols.length === 0) return;
    setBusy(true);
    try {
      const stamp = new Date().toISOString().slice(0, 10);
      if (format === 'csv') {
        const body = [
          cols.map(c => csvEscape(c.label)).join(','),
          ...rows.map(r => cols.map(c => csvEscape(c.value(r))).join(',')),
        ].join('\n');
        const url = URL.createObjectURL(new Blob([body], { type: 'text/csv;charset=utf-8;' }));
        const link = document.createElement('a');
        link.href = url;
        link.download = `${fileBase}-${stamp}.csv`;
        link.click();
        URL.revokeObjectURL(url);
      } else {
        // Loaded on demand — the workbook writer is far bigger than this page.
        const XLSX = await import('xlsx');
        const aoa = [cols.map(c => c.label), ...rows.map(r => cols.map(c => c.value(r)))];
        const sheet = XLSX.utils.aoa_to_sheet(aoa);
        const book = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(book, sheet, 'Export');
        XLSX.writeFile(book, `${fileBase}-${stamp}.xlsx`);
      }
      onClose();
    } catch {
      toast.error('Failed to build the file.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[200] bg-black/50 flex items-end sm:items-center justify-center sm:p-4" onClick={onClose}>
      <div
        className="modal-sheet-mobile bg-white w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl shadow-2xl max-h-[85vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <div className="px-5 pt-5 pb-3 border-b border-gray-100 flex items-start justify-between gap-3 flex-shrink-0">
          <div>
            <h3 className="text-base font-semibold text-brand-primary font-serif">{title}</h3>
            <p className="text-xs text-gray-500 mt-0.5">{rows.length} row{rows.length === 1 ? '' : 's'} in the current view</p>
          </div>
          <button type="button" onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <div className="px-5 py-4 overflow-y-auto flex-1">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Columns</p>
            <div className="flex items-center gap-3">
              <button type="button" onClick={() => setSelected(new Set(columns.map(c => c.key)))} className="text-xs text-brand-secondary hover:underline">Select all</button>
              <button type="button" onClick={() => setSelected(new Set())} className="text-xs text-gray-500 hover:underline">Clear</button>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-2 mb-5">
            {columns.map(col => (
              <label key={col.key} className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={selected.has(col.key)}
                  onChange={() => toggle(col.key)}
                  className="accent-brand-secondary flex-shrink-0"
                />
                <span className="min-w-0 truncate">{col.label}</span>
              </label>
            ))}
          </div>

          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">File type</p>
          <div className="grid grid-cols-2 gap-2">
            {([['csv', 'CSV', '.csv'], ['xlsx', 'Excel', '.xlsx']] as const).map(([value, label, ext]) => (
              <button
                key={value}
                type="button"
                onClick={() => setFormat(value)}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${
                  format === value
                    ? 'border-brand-secondary bg-brand-secondary/10 text-brand-secondary'
                    : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                }`}
              >
                <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <span className="flex-1 text-left">{label}</span>
                <span className="text-[10px] text-gray-400">{ext}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="px-5 py-4 border-t border-gray-100 flex items-center gap-2 flex-shrink-0">
          <button
            type="button"
            onClick={handleDownload}
            disabled={selected.size === 0 || rows.length === 0 || busy}
            className="btn-primary text-sm flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            {busy ? 'Preparing…' : 'Download'}
          </button>
          <button type="button" onClick={onClose} className="btn-secondary text-sm">Cancel</button>
        </div>
      </div>
    </div>
  );
}
