'use client';

import { useState, useMemo, useRef, useCallback } from 'react';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { MergeModal } from './MergeModal';

interface Company {
  id: number;
  name: string;
  website?: string;
  profit_type?: string;
  company_type?: string;
  notes?: string;
  status?: string;
  attendee_count: number;
  conference_count: number;
  conference_names?: string;
}

interface CompanyTableProps {
  companies: Company[];
  onRefresh: () => void;
}

type SortKey = 'name' | 'company_type' | 'status' | 'attendee_count' | 'conference_count';
type SortDir = 'asc' | 'desc';

const PAGE_SIZE = 100;
const STATUS_OPTIONS = ['Client', 'Hot Prospect', 'Interested', 'Not Interested', 'Unknown'];
const COMPANY_TYPES = ['3rd Party Operator', 'Owner/Operator', 'Capital Partner', 'Vendor', 'Partner', 'Other'];
const CONF_COUNT_OPTIONS = ['1', '2', '3', '4+'];

function statusBadgeClass(status: string | undefined) {
  switch (status) {
    case 'Client':         return 'inline-flex px-2 py-0.5 rounded-full text-xs font-semibold bg-yellow-100 text-yellow-800 border border-yellow-300';
    case 'Hot Prospect':   return 'inline-flex px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-700 border border-red-300';
    case 'Interested':     return 'inline-flex px-2 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-700 border border-green-300';
    case 'Not Interested': return 'inline-flex px-2 py-0.5 rounded-full text-xs font-semibold bg-gray-800 text-white';
    default:               return 'inline-flex px-2 py-0.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-500';
  }
}

function conferenceBadgeClass(count: number) {
  if (count >= 4) return 'inline-flex items-center justify-center min-w-[1.5rem] px-2 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-700';
  if (count === 3) return 'inline-flex items-center justify-center min-w-[1.5rem] px-2 py-0.5 rounded-full text-xs font-semibold bg-yellow-100 text-yellow-700';
  if (count === 2) return 'inline-flex items-center justify-center min-w-[1.5rem] px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-700';
  return 'inline-flex items-center justify-center min-w-[1.5rem] px-2 py-0.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-600';
}

function SortIcon({ col, sortKey, sortDir }: { col: SortKey; sortKey: SortKey; sortDir: SortDir }) {
  if (col !== sortKey) return <svg className="w-3 h-3 ml-1 text-gray-300 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" /></svg>;
  return sortDir === 'asc'
    ? <svg className="w-3 h-3 ml-1 text-procare-bright-blue inline" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" /></svg>
    : <svg className="w-3 h-3 ml-1 text-procare-bright-blue inline" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>;
}

const DEFAULT_WIDTHS: Record<string, number> = { name: 220, type: 160, status: 140, attendees: 110, conferences: 120, actions: 110 };

export function CompanyTable({ companies, onRefresh }: CompanyTableProps) {
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterConfCounts, setFilterConfCounts] = useState<Set<string>>(new Set());
  const [showConfFilter, setShowConfFilter] = useState(false);
  const [filterConference, setFilterConference] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [showMergeModal, setShowMergeModal] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [colWidths, setColWidths] = useState<Record<string, number>>(DEFAULT_WIDTHS);
  const [showMassEdit, setShowMassEdit] = useState(false);
  const [massEditFields, setMassEditFields] = useState<{ status?: string; company_type?: string; profit_type?: string }>({});
  const [isApplying, setIsApplying] = useState(false);
  const [page, setPage] = useState(1);
  const resizeRef = useRef<{ col: string; startX: number; startW: number } | null>(null);

  const startResize = useCallback((e: React.MouseEvent, col: string) => {
    e.preventDefault();
    resizeRef.current = { col, startX: e.clientX, startW: colWidths[col] };
    const onMove = (ev: MouseEvent) => {
      if (!resizeRef.current) return;
      const delta = ev.clientX - resizeRef.current.startX;
      setColWidths(prev => ({ ...prev, [resizeRef.current!.col]: Math.max(60, resizeRef.current!.startW + delta) }));
    };
    const onUp = () => { resizeRef.current = null; document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, [colWidths]);

  const handleSort = (col: SortKey) => {
    if (col === sortKey) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(col); setSortDir('asc'); }
  };

  const toggleConfFilter = (val: string) => {
    setFilterConfCounts(prev => { const n = new Set(prev); n.has(val) ? n.delete(val) : n.add(val); return n; });
  };

  const confCountMatches = (count: number): boolean => {
    if (filterConfCounts.size === 0) return true;
    if (filterConfCounts.has('4+') && count >= 4) return true;
    if (filterConfCounts.has(String(count)) && count < 4) return true;
    return false;
  };

  // All unique conference names across companies
  const allConferenceNames = useMemo(() => {
    const names = new Set<string>();
    companies.forEach(c => {
      (c.conference_names || '').split(',').map(s => s.trim()).filter(Boolean).forEach(n => names.add(n));
    });
    return Array.from(names).sort();
  }, [companies]);

  const filtered = useMemo(() => {
    const list = companies.filter(c => {
      const matchSearch = !search || c.name.toLowerCase().includes(search.toLowerCase());
      const matchType = !filterType || c.company_type === filterType;
      const matchStatus = !filterStatus || (c.status || 'Unknown') === filterStatus;
      const matchConf = confCountMatches(Number(c.conference_count));
      const matchConference = !filterConference || (c.conference_names || '').split(',').map(s => s.trim()).includes(filterConference);
      return matchSearch && matchType && matchStatus && matchConf && matchConference;
    });
    list.sort((a, b) => {
      let aVal: string | number, bVal: string | number;
      if (sortKey === 'status') { aVal = (a.status || 'Unknown').toLowerCase(); bVal = (b.status || 'Unknown').toLowerCase(); }
      else { aVal = a[sortKey] ?? ''; bVal = b[sortKey] ?? ''; if (typeof aVal === 'string') aVal = aVal.toLowerCase(); if (typeof bVal === 'string') bVal = bVal.toLowerCase(); }
      if (aVal < bVal) return sortDir === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
    return list;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companies, search, filterType, filterStatus, filterConfCounts, filterConference, sortKey, sortDir]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const toggleSelect = (id: number) => setSelectedIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const selectedCompanies = companies.filter(c => selectedIds.has(c.id));

  const handleDeleteOne = async (id: number, name: string) => {
    if (!confirm(`Delete "${name}"? Attendees will be unlinked. Cannot be undone.`)) return;
    try { await fetch(`/api/companies/${id}`, { method: 'DELETE' }); toast.success(`"${name}" deleted.`); onRefresh(); }
    catch { toast.error('Failed to delete.'); }
  };

  const handleDeleteSelected = async () => {
    if (!confirm(`Delete ${selectedIds.size} company/companies? Attendees will be unlinked. Cannot be undone.`)) return;
    try {
      await Promise.all(Array.from(selectedIds).map(id => fetch(`/api/companies/${id}`, { method: 'DELETE' }).then(r => { if (!r.ok) throw new Error(); })));
      toast.success(`${selectedIds.size} company/companies deleted.`); setSelectedIds(new Set()); onRefresh();
    } catch { toast.error('Failed to delete some companies.'); onRefresh(); }
  };

  const handleMerge = async (masterId: number, duplicateIds: number[]) => {
    const res = await fetch('/api/companies/merge', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ master_id: masterId, duplicate_ids: duplicateIds }) });
    if (!res.ok) { const err = await res.json(); throw new Error(err.error || 'Merge failed'); }
    toast.success('Companies merged!'); setSelectedIds(new Set()); onRefresh();
  };

  const handleMassEdit = async () => {
    const fields: Record<string, string | null> = {};
    if (massEditFields.status) fields.status = massEditFields.status;
    if (massEditFields.company_type) fields.company_type = massEditFields.company_type;
    if (massEditFields.profit_type) fields.profit_type = massEditFields.profit_type;
    if (Object.keys(fields).length === 0) { toast.error('Select at least one field to change.'); return; }
    setIsApplying(true);
    try {
      const res = await fetch('/api/companies/bulk', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids: Array.from(selectedIds), fields }) });
      if (!res.ok) throw new Error();
      toast.success(`Updated ${selectedIds.size} company/companies.`);
      setShowMassEdit(false); setMassEditFields({}); onRefresh();
    } catch { toast.error('Failed to apply changes.'); } finally { setIsApplying(false); }
  };

  const thCls = 'px-3 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider cursor-pointer select-none hover:text-procare-dark-blue whitespace-nowrap relative';

  const ResizeHandle = ({ col }: { col: string }) => (
    <div onMouseDown={e => startResize(e, col)} style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: 4, cursor: 'col-resize', userSelect: 'none', zIndex: 10 }} className="hover:bg-procare-bright-blue opacity-0 hover:opacity-30" />
  );

  return (
    <div>
      {/* Toolbar */}
      <div className="flex flex-wrap gap-3 mb-4">
        <div className="flex-1 min-w-[200px] relative">
          <svg className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search companies..." className="input-field pl-9" />
        </div>
        <select value={filterType} onChange={e => setFilterType(e.target.value)} className="input-field w-auto">
          <option value="">All Types</option>
          {COMPANY_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="input-field w-auto">
          <option value="">All Statuses</option>
          {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
        </select>

        {/* Conference name filter */}
        {allConferenceNames.length > 0 && (
          <select value={filterConference} onChange={e => { setFilterConference(e.target.value); setPage(1); }} className={`input-field w-auto ${filterConference ? 'border-procare-bright-blue text-procare-bright-blue' : ''}`}>
            <option value="">All Conferences</option>
            {allConferenceNames.map(n => <option key={n} value={n}>{n}</option>)}
          </select>
        )}

        {/* # Attended multiselect */}
        <div className="relative">
          <button onClick={() => setShowConfFilter(v => !v)} className={`input-field w-auto flex items-center gap-2 text-sm ${filterConfCounts.size > 0 ? 'border-procare-bright-blue text-procare-bright-blue' : ''}`}>
            # Conferences {filterConfCounts.size > 0 ? `(${filterConfCounts.size})` : ''}
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
          </button>
          {showConfFilter && (
            <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-20 p-2 min-w-[120px]">
              {CONF_COUNT_OPTIONS.map(opt => (
                <label key={opt} className="flex items-center gap-2 px-2 py-1.5 hover:bg-gray-50 rounded cursor-pointer text-sm">
                  <input type="checkbox" checked={filterConfCounts.has(opt)} onChange={() => toggleConfFilter(opt)} className="accent-procare-bright-blue" />
                  {opt} conference{opt === '1' ? '' : 's'}
                </label>
              ))}
              {filterConfCounts.size > 0 && <button onClick={() => setFilterConfCounts(new Set())} className="text-xs text-red-500 hover:underline px-2 mt-1">Clear</button>}
            </div>
          )}
        </div>

        {selectedIds.size >= 1 && (
          <>
            <button onClick={() => { setShowMassEdit(v => !v); setMassEditFields({}); }} className="btn-secondary flex items-center gap-2 text-sm">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
              Edit Fields ({selectedIds.size})
            </button>
            <button onClick={handleDeleteSelected} className="btn-danger flex items-center gap-2 text-sm">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
              Delete ({selectedIds.size})
            </button>
          </>
        )}
        {selectedIds.size >= 2 && (
          <button onClick={() => setShowMergeModal(true)} className="btn-gold flex items-center gap-2 text-sm">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" /></svg>
            Merge ({selectedIds.size})
          </button>
        )}
      </div>

      {/* Mass Edit Panel */}
      {showMassEdit && (
        <div className="mb-4 p-4 bg-blue-50 border border-procare-bright-blue rounded-xl">
          <p className="text-sm font-semibold text-procare-dark-blue mb-3">Edit fields for {selectedIds.size} selected company/companies:</p>
          <div className="flex flex-wrap gap-3 items-end">
            <div>
              <label className="label text-xs">Status</label>
              <select value={massEditFields.status || ''} onChange={e => setMassEditFields(p => ({ ...p, status: e.target.value }))} className="input-field w-40 text-sm">
                <option value="">— no change —</option>
                {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="label text-xs">Company Type</label>
              <select value={massEditFields.company_type || ''} onChange={e => setMassEditFields(p => ({ ...p, company_type: e.target.value }))} className="input-field w-48 text-sm">
                <option value="">— no change —</option>
                {COMPANY_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="label text-xs">Profit Type</label>
              <select value={massEditFields.profit_type || ''} onChange={e => setMassEditFields(p => ({ ...p, profit_type: e.target.value }))} className="input-field w-36 text-sm">
                <option value="">— no change —</option>
                <option value="for-profit">For-Profit</option>
                <option value="non-profit">Non-Profit</option>
              </select>
            </div>
            <button onClick={handleMassEdit} disabled={isApplying} className="btn-primary text-sm">{isApplying ? 'Applying...' : `Apply to ${selectedIds.size}`}</button>
            <button onClick={() => setShowMassEdit(false)} className="btn-secondary text-sm">Cancel</button>
          </div>
        </div>
      )}

      <p className="text-xs text-gray-500 mb-3">Showing {filtered.length} of {companies.length} companies{selectedIds.size > 0 && ` · ${selectedIds.size} selected`}</p>

      <div className="overflow-auto rounded-xl border border-gray-200" style={{ maxHeight: 'calc(100vh - 18rem)' }}>
        <table className="w-full text-sm" style={{ tableLayout: 'fixed' }}>
          <thead className="sticky top-0 z-10">
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="px-3 py-3 text-left w-10">
                <input type="checkbox" checked={selectedIds.size === paginated.length && paginated.length > 0} onChange={e => { if (e.target.checked) setSelectedIds(new Set(paginated.map(c => c.id))); else setSelectedIds(new Set()); }} className="accent-procare-bright-blue" />
              </th>
              <th className={thCls} style={{ width: colWidths.name }} onClick={() => handleSort('name')}>Company Name <SortIcon col="name" sortKey={sortKey} sortDir={sortDir} /><ResizeHandle col="name" /></th>
              <th className={thCls} style={{ width: colWidths.type }} onClick={() => handleSort('company_type')}>Type <SortIcon col="company_type" sortKey={sortKey} sortDir={sortDir} /><ResizeHandle col="type" /></th>
              <th className={thCls} style={{ width: colWidths.status }} onClick={() => handleSort('status')}>Status <SortIcon col="status" sortKey={sortKey} sortDir={sortDir} /><ResizeHandle col="status" /></th>
              <th className={thCls} style={{ width: colWidths.attendees }} onClick={() => handleSort('attendee_count')}>Attendees <SortIcon col="attendee_count" sortKey={sortKey} sortDir={sortDir} /><ResizeHandle col="attendees" /></th>
              <th className={thCls} style={{ width: colWidths.conferences }} onClick={() => handleSort('conference_count')}>Conferences <SortIcon col="conference_count" sortKey={sortKey} sortDir={sortDir} /><ResizeHandle col="conferences" /></th>
              <th className="px-3 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider" style={{ width: colWidths.actions }}>Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {paginated.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400 text-sm">No companies found.</td></tr>
            ) : paginated.map(company => (
              <tr key={company.id} className={`hover:bg-gray-50 transition-colors ${selectedIds.has(company.id) ? 'bg-blue-50' : ''}`}>
                <td className="px-3 py-3"><input type="checkbox" checked={selectedIds.has(company.id)} onChange={() => toggleSelect(company.id)} className="accent-procare-bright-blue" /></td>
                <td className="px-3 py-3">
                  <Link href={`/companies/${company.id}`} className="font-medium text-procare-bright-blue hover:underline truncate block">{company.name}</Link>
                </td>
                <td className="px-3 py-3">{company.company_type ? <span className="badge-blue">{company.company_type}</span> : <span className="text-gray-300">—</span>}</td>
                <td className="px-3 py-3"><span className={statusBadgeClass(company.status || 'Unknown')}>{company.status || 'Unknown'}</span></td>
                <td className="px-3 py-3"><span className="badge-gray">{company.attendee_count}</span></td>
                <td className="px-3 py-3"><span className={conferenceBadgeClass(Number(company.conference_count))}>{company.conference_count}</span></td>
                <td className="px-3 py-3">
                  <div className="flex items-center gap-3">
                    <Link href={`/companies/${company.id}`} className="text-procare-bright-blue hover:underline text-xs font-medium">View</Link>
                    <button onClick={() => handleDeleteOne(company.id, company.name)} className="text-red-400 hover:text-red-600 text-xs font-medium transition-colors">Delete</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-100">
          <span className="text-xs text-gray-500">Page {page} of {totalPages} · {filtered.length} total</span>
          <div className="flex items-center gap-2">
            <button disabled={page === 1} onClick={() => setPage(p => p - 1)} className="px-3 py-1 text-xs rounded border border-gray-200 disabled:opacity-40 hover:bg-gray-50">Previous</button>
            <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)} className="px-3 py-1 text-xs rounded border border-gray-200 disabled:opacity-40 hover:bg-gray-50">Next</button>
          </div>
        </div>
      )}

      <MergeModal isOpen={showMergeModal} onClose={() => setShowMergeModal(false)} onMerge={handleMerge}
        items={selectedCompanies.map(c => ({ id: c.id, label: c.name, sublabel: [c.company_type, c.profit_type ? `(${c.profit_type})` : ''].filter(Boolean).join(' ') }))}
        title="Merge Companies" description="Select the master record. All attendees from duplicates will be reassigned to master. Duplicates will be deleted." />
    </div>
  );
}
