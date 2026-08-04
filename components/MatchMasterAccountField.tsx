'use client';

import { useEffect, useRef, useState } from 'react';
import type { UserOption } from '@/lib/useUserOptions';
import { resolveRepNames } from '@/lib/useUserOptions';

interface MasterAccountRecord {
  id: number;
  companyName: string;
  website: string | null;
  assignedRepId: number | null;
  assignedRepName: string | null;
  hqState: string | null;
  territoryId: number | null;
  territoryName: string | null;
  entityStructure: string | null;
  services: string | null;
  wse: number | null;
}

export interface MasterAccountApplyPatch {
  website?: string;
  assigned_user?: string;
  hq_state?: string;
  territory_id?: number | null;
  entity_structure?: string;
  services?: string[];
  wse?: number;
}

interface CurrentValues {
  website: string | null | undefined;
  assigned_user: string | null | undefined;
  hq_state: string | null | undefined;
  territory_id: number | null | undefined;
  entity_structure: string | null | undefined;
  services: string[] | undefined;
  wse: number | null | undefined;
}

interface FieldRow {
  key: keyof MasterAccountApplyPatch;
  label: string;
  masterDisplay: string;
  currentDisplay: string;
  patch: MasterAccountApplyPatch | null; // null = no master value to apply
}

function buildFieldRows(
  record: MasterAccountRecord,
  current: CurrentValues,
  userOptions: UserOption[],
  territoryOptions: { id: number; name: string }[],
  unitTypeLabel: string
): FieldRow[] {
  const currentTerritoryName = territoryOptions.find(t => t.id === current.territory_id)?.name ?? '';
  const currentServices = (current.services ?? []).join(', ');
  const masterServicesList = record.services ? record.services.split(',').map(s => s.trim()).filter(Boolean) : [];

  return [
    {
      key: 'website',
      label: 'Website',
      masterDisplay: record.website ?? '—',
      currentDisplay: current.website || '—',
      patch: record.website ? { website: record.website } : null,
    },
    {
      key: 'assigned_user',
      label: 'Assigned Rep',
      masterDisplay: record.assignedRepName ?? '—',
      currentDisplay: resolveRepNames(current.assigned_user, userOptions) || '—',
      patch: record.assignedRepId != null ? { assigned_user: String(record.assignedRepId) } : null,
    },
    {
      key: 'hq_state',
      label: 'HQ State',
      masterDisplay: record.hqState ?? '—',
      currentDisplay: current.hq_state || '—',
      patch: record.hqState ? { hq_state: record.hqState } : null,
    },
    {
      key: 'territory_id',
      label: 'Territory',
      masterDisplay: record.territoryName ?? '—',
      currentDisplay: currentTerritoryName || '—',
      patch: record.territoryId != null ? { territory_id: record.territoryId } : null,
    },
    {
      key: 'entity_structure',
      label: 'Entity Structure',
      masterDisplay: record.entityStructure ?? '—',
      currentDisplay: current.entity_structure || '—',
      patch: record.entityStructure ? { entity_structure: record.entityStructure } : null,
    },
    {
      key: 'services',
      label: 'Services',
      masterDisplay: masterServicesList.length > 0 ? masterServicesList.join(', ') : '—',
      currentDisplay: currentServices || '—',
      patch: masterServicesList.length > 0 ? { services: masterServicesList } : null,
    },
    {
      key: 'wse',
      label: unitTypeLabel,
      masterDisplay: record.wse != null ? String(record.wse) : '—',
      currentDisplay: current.wse != null ? String(current.wse) : '—',
      patch: record.wse != null ? { wse: record.wse } : null,
    },
  ];
}

function MatchModal({
  record,
  current,
  userOptions,
  territoryOptions,
  unitTypeLabel,
  onApply,
  onClose,
}: {
  record: MasterAccountRecord;
  current: CurrentValues;
  userOptions: UserOption[];
  territoryOptions: { id: number; name: string }[];
  unitTypeLabel: string;
  onApply: (patch: MasterAccountApplyPatch) => void;
  onClose: () => void;
}) {
  const rows = buildFieldRows(record, current, userOptions, territoryOptions, unitTypeLabel);
  const [appliedKeys, setAppliedKeys] = useState<Set<string>>(new Set());

  const applyRow = (row: FieldRow) => {
    if (!row.patch) return;
    onApply(row.patch);
    setAppliedKeys(prev => new Set(prev).add(row.key));
  };

  const applyAll = () => {
    const patch: MasterAccountApplyPatch = {};
    const applied = new Set<string>();
    for (const row of rows) {
      if (!row.patch) continue;
      Object.assign(patch, row.patch);
      applied.add(row.key);
    }
    onApply(patch);
    setAppliedKeys(applied);
  };

  const anyApplicable = rows.some(r => r.patch != null);

  return (
    <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center sm:p-4" style={{ background: 'rgba(0,0,0,0.5)' }}>
      <div className="bg-white w-full sm:max-w-2xl flex flex-col rounded-t-2xl sm:rounded-2xl shadow-2xl" style={{ maxHeight: '90vh' }}>
        <div className="flex items-start justify-between px-4 sm:px-6 py-3 sm:py-4 border-b border-gray-200 flex-shrink-0">
          <div>
            <h2 className="text-base sm:text-lg font-bold text-brand-primary font-serif">Match Master Account</h2>
            <p className="text-sm text-gray-500 mt-0.5 truncate">{record.companyName}</p>
          </div>
          <button type="button" onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 ml-4 flex-shrink-0">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="px-4 sm:px-6 py-2.5 border-b border-gray-100 bg-gray-50 flex items-center justify-between flex-shrink-0">
          <span className="text-xs text-gray-400">{appliedKeys.size}/{rows.filter(r => r.patch).length} applied</span>
          <button
            type="button"
            onClick={applyAll}
            disabled={!anyApplicable}
            className="text-xs font-semibold text-brand-secondary hover:text-brand-primary px-2 py-1 rounded hover:bg-blue-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Apply All
          </button>
        </div>

        {/* Desktop column headers */}
        <div className="hidden sm:grid grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_minmax(0,1.2fr)_110px] gap-4 px-6 py-2 border-b border-gray-100 flex-shrink-0">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Field Name</p>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Master Acct. Value</p>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Current Value</p>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Update</p>
        </div>

        <div className="flex-1 overflow-y-auto divide-y divide-gray-100">
          {rows.map((row, i) => {
            const applied = appliedKeys.has(row.key);
            return (
              <div key={row.key} className={`px-4 sm:px-6 py-3 ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}`}>
                {/* Desktop row */}
                <div className="hidden sm:grid grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_minmax(0,1.2fr)_110px] gap-4 items-center">
                  <p className="text-sm font-medium text-gray-800 truncate">{row.label}</p>
                  <p className="text-sm text-gray-600 truncate" title={row.masterDisplay}>{row.masterDisplay}</p>
                  <p className="text-sm text-gray-400 truncate" title={row.currentDisplay}>{row.currentDisplay}</p>
                  <button
                    type="button"
                    onClick={() => applyRow(row)}
                    disabled={!row.patch}
                    className={`text-xs font-medium px-2.5 py-1.5 rounded-lg border transition-colors flex-shrink-0 ${
                      applied
                        ? 'bg-green-100 text-green-700 border-green-300'
                        : 'bg-white text-gray-600 border-gray-200 hover:border-brand-secondary hover:text-brand-secondary'
                    } disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:border-gray-200 disabled:hover:text-gray-600`}
                  >
                    {applied ? 'Updated ✓' : 'Update'}
                  </button>
                </div>

                {/* Mobile card */}
                <div className="sm:hidden space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium text-gray-800">{row.label}</p>
                    <button
                      type="button"
                      onClick={() => applyRow(row)}
                      disabled={!row.patch}
                      className={`text-xs font-medium px-2.5 py-1 rounded-lg border transition-colors flex-shrink-0 ${
                        applied
                          ? 'bg-green-100 text-green-700 border-green-300'
                          : 'bg-white text-gray-600 border-gray-200'
                      } disabled:opacity-40`}
                    >
                      {applied ? 'Updated ✓' : 'Update'}
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="bg-white border border-gray-200 rounded-lg p-2">
                      <p className="text-gray-400 mb-0.5">Master Acct.</p>
                      <p className="text-gray-700 break-words">{row.masterDisplay}</p>
                    </div>
                    <div className="bg-white border border-gray-200 rounded-lg p-2">
                      <p className="text-gray-400 mb-0.5">Current</p>
                      <p className="text-gray-500 break-words">{row.currentDisplay}</p>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex items-center justify-end gap-3 px-4 sm:px-6 py-4 border-t border-gray-200 flex-shrink-0">
          <button type="button" onClick={onClose} className="btn-secondary text-sm">Done</button>
        </div>
      </div>
    </div>
  );
}

export function MatchMasterAccountField({
  currentValues,
  userOptions,
  territoryOptions,
  unitTypeLabel,
  onApply,
}: {
  currentValues: CurrentValues;
  userOptions: UserOption[];
  territoryOptions: { id: number; name: string }[];
  unitTypeLabel: string;
  onApply: (patch: MasterAccountApplyPatch) => void;
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<MasterAccountRecord[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [open, setOpen] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState<MasterAccountRecord | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (query.trim().length < 2) {
      setResults([]);
      setIsSearching(false);
      return;
    }
    setIsSearching(true);
    debounceRef.current = setTimeout(() => {
      fetch(`/api/master-accounts/search?q=${encodeURIComponent(query.trim())}`)
        .then(r => r.ok ? r.json() : { records: [] })
        .then((data: { records: MasterAccountRecord[] }) => setResults(data.records ?? []))
        .catch(() => setResults([]))
        .finally(() => setIsSearching(false));
    }, 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query]);

  const selectRecord = (record: MasterAccountRecord) => {
    setOpen(false);
    setQuery('');
    setResults([]);
    setSelectedRecord(record);
  };

  return (
    <div>
      <label className="label">Match Master Account</label>
      <div ref={ref} className="relative">
        <input
          value={query}
          onChange={e => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          className="input-field"
          placeholder="Search master account list…"
        />
        {open && query.trim().length >= 2 && (
          <div className="absolute z-30 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-56 overflow-y-auto">
            {isSearching ? (
              <div className="px-3 py-2 text-sm text-gray-400">Searching…</div>
            ) : results.length === 0 ? (
              <div className="px-3 py-2 text-sm text-gray-400">No master accounts match &quot;{query.trim()}&quot;.</div>
            ) : (
              results.map(record => (
                <button
                  key={record.id}
                  type="button"
                  onClick={() => selectRecord(record)}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 flex items-center justify-between gap-2"
                >
                  <span className="truncate font-medium text-gray-800">{record.companyName}</span>
                  {record.hqState && <span className="text-xs text-gray-400 flex-shrink-0">{record.hqState}</span>}
                </button>
              ))
            )}
          </div>
        )}
      </div>

      {selectedRecord && (
        <MatchModal
          record={selectedRecord}
          current={currentValues}
          userOptions={userOptions}
          territoryOptions={territoryOptions}
          unitTypeLabel={unitTypeLabel}
          onApply={onApply}
          onClose={() => setSelectedRecord(null)}
        />
      )}
    </div>
  );
}
