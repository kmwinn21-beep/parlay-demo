'use client';

import { useState } from 'react';
import { SYSTEM_FIELD_LABELS, FIELD_ORDER, type ColumnMapping, type SystemFieldKey } from '@/lib/columnMapping';

interface Props {
  fileName: string;
  totalRows: number;
  headers: string[];
  suggestions: ColumnMapping;
  sampleRows: Record<string, string>[];
  onConfirm: (mapping: ColumnMapping) => void;
  onCancel: () => void;
}

export function ColumnMappingModal({
  fileName,
  totalRows,
  headers,
  suggestions,
  sampleRows,
  onConfirm,
  onCancel,
}: Props) {
  const [mapping, setMapping] = useState<ColumnMapping>({ ...suggestions });

  const hasName = !!(mapping.first_name || mapping.last_name || mapping.full_name);

  const setField = (key: SystemFieldKey, value: string) => {
    setMapping(prev => ({ ...prev, [key]: value || null }));
  };

  const getSample = (col: string | null): string => {
    if (!col) return '';
    return sampleRows
      .map(r => r[col]?.trim())
      .filter(Boolean)
      .slice(0, 2)
      .join(', ');
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={e => { if (e.target === e.currentTarget) onCancel(); }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">

        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 flex items-start justify-between flex-shrink-0">
          <div>
            <h2 className="text-lg font-semibold text-procare-dark-blue font-serif">Map Columns</h2>
            <p className="text-sm text-gray-500 mt-0.5 truncate max-w-sm">{fileName} &middot; {totalRows.toLocaleString()} rows</p>
          </div>
          <button type="button" onClick={onCancel} className="text-gray-400 hover:text-gray-600 p-1 ml-4 flex-shrink-0">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 px-6 py-4">
          <p className="text-sm text-gray-500 mb-5">
            Match each system field to a column in your file. Column names were auto-detected — adjust any that are wrong or leave optional fields as <em>(not mapped)</em>.
          </p>
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr>
                <th className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wide pb-2 pr-4 w-44">System Field</th>
                <th className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wide pb-2 pr-4">Your Column</th>
                <th className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wide pb-2">Sample Data</th>
              </tr>
            </thead>
            <tbody>
              {FIELD_ORDER.map((key, i) => {
                const meta = SYSTEM_FIELD_LABELS[key];
                const selected = mapping[key];
                const sample = getSample(selected);
                return (
                  <tr key={key} className={i % 2 === 0 ? 'bg-gray-50/60' : ''}>
                    <td className="py-2 pr-4 align-top">
                      <div className="font-medium text-gray-800 leading-tight">
                        {meta.label}
                        {meta.required && <span className="text-red-400 ml-0.5 text-xs">*</span>}
                      </div>
                      <div className="text-xs text-gray-400 mt-0.5 leading-snug">{meta.description}</div>
                    </td>
                    <td className="py-2 pr-4 align-top">
                      <select
                        value={selected ?? ''}
                        onChange={e => setField(key, e.target.value)}
                        className="w-full text-sm border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-procare-bright-blue bg-white"
                      >
                        <option value="">(not mapped)</option>
                        {headers.map(h => (
                          <option key={h} value={h}>{h}</option>
                        ))}
                      </select>
                    </td>
                    <td className="py-2 align-top">
                      <span className="text-xs text-gray-500 block max-w-[180px] truncate" title={sample}>
                        {sample || <span className="text-gray-300">—</span>}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 flex-shrink-0">
          {!hasName && (
            <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-3">
              Map at least <strong>First Name</strong> or <strong>Full Name</strong> to continue.
            </p>
          )}
          <div className="flex items-center justify-end gap-3">
            <button type="button" onClick={onCancel} className="btn-secondary text-sm">
              Cancel
            </button>
            <button
              type="button"
              onClick={() => onConfirm(mapping)}
              disabled={!hasName}
              className="btn-primary text-sm"
            >
              Confirm &amp; Upload
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
