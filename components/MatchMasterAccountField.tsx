'use client';

import { useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import type { UserOption } from '@/lib/useUserOptions';
import { resolveRepNames, useUserOptions } from '@/lib/useUserOptions';
import { useUnitTypeLabel } from '@/lib/useUnitTypeLabel';
import { masterSearchSeed } from '@/lib/masterAccountMatch';

interface MasterAccountRecord {
  id: number;
  companyName: string;
  companyNameNormalized: string;
  website: string | null;
  assignedRepId: number | null;
  assignedRepName: string | null;
  hqState: string | null;
  territoryId: number | null;
  territoryName: string | null;
  entityStructure: string | null;
  services: string | null;
  wse: number | null;
  crmLink: string | null;
  companyType: string | null;
  profitType: string | null;
}

export interface MasterAccountApplyPatch {
  website?: string;
  assigned_user?: string;
  hq_state?: string;
  territory_id?: number | null;
  entity_structure?: string;
  services?: string[];
  wse?: number;
  crm_link?: string;
  company_type?: string;
  profit_type?: string;
  /** The master row's normalized name — what the sync matches a pinned link on. */
  master_account_key?: string | null;
  master_account_name?: string | null;
}

interface CurrentValues {
  website: string | null | undefined;
  assigned_user: string | null | undefined;
  hq_state: string | null | undefined;
  territory_id: number | null | undefined;
  entity_structure: string | null | undefined;
  services: string[] | undefined;
  wse: number | null | undefined;
  crm_link: string | null | undefined;
  company_type: string | null | undefined;
  profit_type: string | null | undefined;
  master_account_key: string | null | undefined;
  master_account_name: string | null | undefined;
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
    // No entity_structure row — it is derived from a company's parent/child
    // links, so a master record can't assert it.
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
    {
      key: 'crm_link',
      label: 'CRM Link',
      masterDisplay: record.crmLink ?? '—',
      currentDisplay: current.crm_link || '—',
      patch: record.crmLink ? { crm_link: record.crmLink } : null,
    },
    {
      key: 'company_type',
      label: 'Company Type',
      masterDisplay: record.companyType ?? '—',
      currentDisplay: current.company_type || '—',
      patch: record.companyType ? { company_type: record.companyType } : null,
    },
    {
      key: 'profit_type',
      label: 'Profit Type',
      masterDisplay: record.profitType ?? '—',
      currentDisplay: current.profit_type || '—',
      patch: record.profitType ? { profit_type: record.profitType } : null,
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
  const [linked, setLinked] = useState(current.master_account_key === record.companyNameNormalized);

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

        {/* The link itself, above the field-by-field copying. Copying values
            is a one-time transfer; linking is what makes every later sync run
            use this row for this company instead of guessing from the name
            and website. */}
        <label className="flex items-start gap-2.5 px-4 sm:px-6 py-3 border-b border-gray-100 bg-blue-50/50 cursor-pointer flex-shrink-0">
          <input
            type="checkbox"
            checked={linked}
            onChange={e => {
              const on = e.target.checked;
              setLinked(on);
              onApply(on
                ? { master_account_key: record.companyNameNormalized, master_account_name: record.companyName }
                : { master_account_key: null, master_account_name: null });
            }}
            className="accent-brand-secondary mt-0.5 flex-shrink-0"
          />
          <span className="min-w-0">
            <span className="block text-sm font-medium text-brand-primary">Link this company to {record.companyName}</span>
            <span className="block text-xs text-gray-500 mt-0.5">
              Master account syncs will use this record for this company, whatever its name or website says.
            </span>
          </span>
        </label>

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
        {/* Whether this company is pinned to a master row is otherwise only
            visible inside the modal, which you'd have to re-find the record
            to open. */}
        {currentValues.master_account_key && (
          <p className="flex items-center gap-1.5 text-xs text-gray-500 mt-1.5">
            <svg className="w-3.5 h-3.5 text-brand-secondary flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
            </svg>
            <span className="truncate">
              Linked to <span className="font-medium text-gray-700">{currentValues.master_account_name || currentValues.master_account_key}</span>
            </span>
            <button
              type="button"
              onClick={() => onApply({ master_account_key: null, master_account_name: null })}
              className="text-brand-secondary hover:underline flex-shrink-0"
            >
              Unlink
            </button>
          </p>
        )}
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

/**
 * The company as the PUT route reads and writes it.
 *
 * Every field that route names, because it writes them all: a PUT carrying
 * only the patch would null out everything it left out. The company record's
 * own edit form works the same way — it loads the record, applies the patch to
 * its copy and saves the lot — and this is that, without the form.
 */
interface CompanyRecord extends CurrentValues {
  name: string;
  notes: string | null;
  icp: string | null;
  industry: string | null;
  sub_types: string[];
}

/**
 * Match a company against the master account list, from anywhere.
 *
 * The same search and the same side-by-side modal the company record's edit
 * form offers, as a dialog of its own — so a rep who spots an unmatched
 * company in a table does not have to open the record and switch it into edit
 * mode to link it.
 *
 * It saves as it goes. In the edit form, applying a field is a change to a
 * form somebody will press Save on; here there is no form and no Save, so each
 * Update and the Link checkbox write immediately. Done just closes.
 */
export function MasterAccountSearchModal({
  companyId,
  companyName,
  onClose,
  onApplied,
}: {
  companyId: number;
  companyName: string;
  onClose: () => void;
  /** Something was written — let whatever opened this refresh its row. */
  onApplied?: () => void;
}) {
  const userOptions = useUserOptions();
  const unitTypeLabel = useUnitTypeLabel();
  const [territoryOptions, setTerritoryOptions] = useState<{ id: number; name: string }[]>([]);
  const [company, setCompany] = useState<CompanyRecord | null>(null);
  const [loadError, setLoadError] = useState(false);
  // Seeded from the company's name, which is the first thing a reader would
  // have typed.
  const [query, setQuery] = useState(() => masterSearchSeed(companyName));
  const [results, setResults] = useState<MasterAccountRecord[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState<MasterAccountRecord | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let live = true;
    Promise.all([
      fetch(`/api/companies/${companyId}`, { cache: 'no-store' }).then(r => (r.ok ? r.json() : null)),
      fetch('/api/admin/territories').then(r => (r.ok ? r.json() : { territories: [] })).catch(() => ({ territories: [] })),
    ])
      .then(([data, terr]: [Record<string, unknown> | null, { territories?: { id: number; name: string }[] }]) => {
        if (!live) return;
        setTerritoryOptions((terr.territories ?? []).map(t => ({ id: t.id, name: t.name })));
        if (!data) { setLoadError(true); return; }
        setCompany({
          name: String(data.name ?? companyName),
          website: (data.website as string) ?? null,
          assigned_user: (data.assigned_user as string) ?? null,
          hq_state: (data.hq_state as string) ?? null,
          territory_id: (data.territory_id as number) ?? null,
          entity_structure: (data.entity_structure as string) ?? null,
          services: Array.isArray(data.services) ? (data.services as string[]) : [],
          wse: (data.wse as number) ?? null,
          crm_link: (data.crm_link as string) ?? null,
          company_type: (data.company_type as string) ?? null,
          profit_type: (data.profit_type as string) ?? null,
          master_account_key: (data.master_account_key as string) ?? null,
          master_account_name: (data.master_account_name as string) ?? null,
          notes: (data.notes as string) ?? null,
          icp: (data.icp as string) ?? null,
          industry: (data.industry as string) ?? null,
          sub_types: Array.isArray(data.sub_types) ? (data.sub_types as string[]) : [],
        });
      })
      .catch(() => { if (live) setLoadError(true); });
    return () => { live = false; };
  }, [companyId, companyName]);

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
        .then(r => (r.ok ? r.json() : { records: [] }))
        .then((data: { records: MasterAccountRecord[] }) => setResults(data.records ?? []))
        .catch(() => setResults([]))
        .finally(() => setIsSearching(false));
    }, 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query]);

  /**
   * Write the patch straight to the company.
   *
   * The whole record, merged — see CompanyRecord. The local copy is updated
   * first so the modal's "Current" column and its Link checkbox read back what
   * was just applied without a reload.
   */
  const applyPatch = async (patch: MasterAccountApplyPatch) => {
    if (!company) return;
    const next: CompanyRecord = { ...company, ...patch };
    setCompany(next);
    setIsSaving(true);
    try {
      const res = await fetch(`/api/companies/${companyId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: next.name,
          website: next.website,
          profit_type: next.profit_type,
          company_type: next.company_type,
          notes: next.notes,
          assigned_user: next.assigned_user,
          wse: next.wse,
          services: next.services,
          icp: next.icp,
          industry: next.industry,
          territory_id: next.territory_id,
          hq_state: next.hq_state,
          crm_link: next.crm_link,
          master_account_key: next.master_account_key,
          master_account_name: next.master_account_name,
          sub_types: next.sub_types,
        }),
      });
      if (!res.ok) throw new Error('save failed');
      onApplied?.();
    } catch {
      // Put the copy back, so the modal does not show a value the record does
      // not have.
      setCompany(company);
      toast.error('Could not save that change.');
    } finally {
      setIsSaving(false);
    }
  };

  // The match modal is the same one the edit form opens, over this one.
  if (selectedRecord && company) {
    return (
      <MatchModal
        record={selectedRecord}
        current={company}
        userOptions={userOptions}
        territoryOptions={territoryOptions}
        unitTypeLabel={unitTypeLabel}
        onApply={patch => { void applyPatch(patch); }}
        onClose={() => setSelectedRecord(null)}
      />
    );
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center sm:p-4" style={{ background: 'rgba(0,0,0,0.5)' }}>
      <div className="bg-white w-full sm:max-w-lg flex flex-col rounded-t-2xl sm:rounded-2xl shadow-2xl" style={{ maxHeight: '85vh' }}>
        <div className="flex items-start justify-between px-4 sm:px-6 py-3 sm:py-4 border-b border-gray-200 flex-shrink-0">
          <div className="min-w-0">
            <h2 className="text-base sm:text-lg font-bold text-brand-primary font-serif">Search Master</h2>
            <p className="text-sm text-gray-500 mt-0.5 truncate">{companyName}</p>
          </div>
          <button type="button" onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 ml-4 flex-shrink-0">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="px-4 sm:px-6 py-3 flex-shrink-0">
          <input
            value={query}
            autoFocus
            onChange={e => setQuery(e.target.value)}
            className="input-field"
            placeholder="Search master account list…"
          />
          {/* Already pinned, and to what. Without this the only way to find
              out is to re-find the record and open the match modal. */}
          {company?.master_account_key && (
            <p className="flex items-center gap-1.5 text-xs text-gray-500 mt-2">
              <svg className="w-3.5 h-3.5 text-brand-secondary flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
              </svg>
              <span className="truncate">
                Linked to <span className="font-medium text-gray-700">{company.master_account_name || company.master_account_key}</span>
              </span>
              <button
                type="button"
                onClick={() => void applyPatch({ master_account_key: null, master_account_name: null })}
                className="text-brand-secondary hover:underline flex-shrink-0"
              >
                Unlink
              </button>
            </p>
          )}
        </div>

        <div className="flex-1 overflow-y-auto px-4 sm:px-6 pb-3 min-h-0">
          {loadError ? (
            <p className="text-sm text-gray-400 py-4 text-center">Could not load this company.</p>
          ) : query.trim().length < 2 ? (
            <p className="text-sm text-gray-400 py-4 text-center">Type at least two characters.</p>
          ) : isSearching ? (
            <p className="text-sm text-gray-400 py-4 text-center">Searching…</p>
          ) : results.length === 0 ? (
            <p className="text-sm text-gray-400 py-4 text-center">No master accounts match &quot;{query.trim()}&quot;.</p>
          ) : (
            <div className="divide-y divide-gray-100">
              {results.map(record => (
                <button
                  key={record.id}
                  type="button"
                  // Nothing to match against until the company has loaded —
                  // the modal's Current column would read as all blanks.
                  disabled={!company}
                  onClick={() => setSelectedRecord(record)}
                  className="w-full text-left py-2.5 text-sm hover:bg-gray-50 flex items-center justify-between gap-2 disabled:opacity-40"
                >
                  <span className="truncate font-medium text-gray-800">{record.companyName}</span>
                  {record.hqState && <span className="text-xs text-gray-400 flex-shrink-0">{record.hqState}</span>}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 px-4 sm:px-6 py-4 border-t border-gray-200 flex-shrink-0">
          <span className="text-xs text-gray-400">{isSaving ? 'Saving…' : ''}</span>
          <button type="button" onClick={onClose} className="btn-secondary text-sm">Done</button>
        </div>
      </div>
    </div>
  );
}
