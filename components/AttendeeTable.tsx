'use client';

import { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { MergeModal } from './MergeModal';
import { effectiveSeniority } from '@/lib/parsers';
import { NotesPopover } from './NotesPopover';
import { useConfigColors } from '@/lib/useConfigColors';
import { useConfigOptions } from '@/lib/useConfigOptions';
import { getBadgeClass } from '@/lib/colors';

interface Attendee {
  id: number;
  first_name: string;
  last_name: string;
  title?: string;
  company_name?: string;
  company_type?: string;
  company_id?: number;
  email?: string;
  notes?: string;
  status?: string;
  seniority?: string;
  action?: string;
  next_steps?: string;
  conference_count: number;
  conference_names?: string;
  has_pending_follow_ups?: boolean;
  notes_count?: number;
  recent_notes_concat?: string;
}

interface Company { id: number; name: string; }

interface AttendeeTableProps {
  attendees: Attendee[];
  onRefresh: () => void;
}

type SortKey = 'last_name' | 'first_name' | 'title' | 'company_name' | 'status' | 'conference_count';
type SortDir = 'asc' | 'desc';

const CONF_COUNT_OPTIONS = ['1', '2', '3', '4+'];
const PAGE_SIZE = 100;

function conferenceBadgeClass(count: number) {
  if (count >= 4) return 'inline-flex items-center justify-center min-w-[1.5rem] px-2 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-700';
  if (count === 3) return 'inline-flex items-center justify-center min-w-[1.5rem] px-2 py-0.5 rounded-full text-xs font-semibold bg-yellow-100 text-yellow-700';
  if (count === 2) return 'inline-flex items-center justify-center min-w-[1.5rem] px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-700';
  return 'inline-flex items-center justify-center min-w-[1.5rem] px-2 py-0.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-600';
}

function ConferenceTooltip({ count, names }: { count: number; names?: string }) {
  const [pos, setPos] = useState<{ top: number; left: number; width: number; above: boolean } | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const list = names ? names.split(',').map(n => n.trim()).filter(Boolean) : [];

  const handleMouseEnter = () => {
    if (!ref.current || list.length === 0) return;
    const rect = ref.current.getBoundingClientRect();
    const w = Math.min(240, window.innerWidth - 16);
    const left = Math.max(8, Math.min(rect.left + rect.width / 2 - w / 2, window.innerWidth - w - 8));
    const above = rect.top > 180;
    setPos({ top: above ? rect.top - 8 : rect.bottom + 8, left, width: w, above });
  };

  return (
    <div ref={ref} className="relative inline-block" onMouseEnter={handleMouseEnter} onMouseLeave={() => setPos(null)}>
      <span className={conferenceBadgeClass(count)} style={{ cursor: list.length > 0 ? 'pointer' : 'default' }}>{count}</span>
      {pos && (
        <div style={{ position: 'fixed', top: pos.top, left: pos.left, width: pos.width, zIndex: 9999, transform: pos.above ? 'translateY(-100%)' : 'translateY(0)' }}>
          <div className="bg-gray-900 text-white text-xs rounded-lg shadow-xl px-3 py-2.5">
            <p className="font-semibold mb-1.5 text-gray-300 uppercase tracking-wide text-[10px]">Conferences Attended</p>
            <ul className="space-y-1">{list.map((name, i) => <li key={i} className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-yellow-400 flex-shrink-0" />{name}</li>)}</ul>
          </div>
        </div>
      )}
    </div>
  );
}


function SortIcon({ col, sortKey, sortDir }: { col: SortKey; sortKey: SortKey; sortDir: SortDir }) {
  if (col !== sortKey) return <svg className="w-3 h-3 ml-1 text-gray-300 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" /></svg>;
  return sortDir === 'asc'
    ? <svg className="w-3 h-3 ml-1 text-procare-bright-blue inline" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" /></svg>
    : <svg className="w-3 h-3 ml-1 text-procare-bright-blue inline" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>;
}

const DEFAULT_WIDTHS: Record<string, number> = { name: 180, title: 150, company: 180, status: 130, seniority: 120, conferences: 100, notes: 70, actions: 100 };

export function AttendeeTable({ attendees, onRefresh }: AttendeeTableProps) {
  const colorMaps = useConfigColors();
  const configOptions = useConfigOptions();
  const statusOptions = configOptions.status ?? [];
  const seniorityConfigOptions = configOptions.seniority ?? [];
  const [search, setSearch] = useState('');
  const [filterCompanyType, setFilterCompanyType] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterSeniority, setFilterSeniority] = useState('');
  const [filterConfCounts, setFilterConfCounts] = useState<Set<string>>(new Set());
  const [showConfFilter, setShowConfFilter] = useState(false);
  const [filterHasFollowUps, setFilterHasFollowUps] = useState(false);
  const [page, setPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [showMergeModal, setShowMergeModal] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>('last_name');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [colWidths, setColWidths] = useState<Record<string, number>>(DEFAULT_WIDTHS);
  const [showMassEdit, setShowMassEdit] = useState(false);
  const [massEditFields, setMassEditFields] = useState<{ status?: string; title?: string; company_id?: string }>({});
  const [companies, setCompanies] = useState<Company[]>([]);
  const [isApplying, setIsApplying] = useState(false);
  const resizeRef = useRef<{ col: string; startX: number; startW: number } | null>(null);

  useEffect(() => {
    if (showMassEdit && companies.length === 0) {
      fetch('/api/companies').then(r => r.json()).then(setCompanies).catch(() => {});
    }
  }, [showMassEdit, companies.length]);

  useEffect(() => {
    setPage(1);
  }, [search, filterCompanyType, filterStatus, filterSeniority, filterConfCounts, filterHasFollowUps]);

  const seniorityFilterOptions = useMemo(() => {
    if (seniorityConfigOptions.length > 0) return seniorityConfigOptions;
    const vals = new Set<string>();
    for (const a of attendees) {
      vals.add(effectiveSeniority(a.seniority, a.title));
    }
    return Array.from(vals).sort();
  }, [attendees, seniorityConfigOptions]);

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

  const filtered = useMemo(() => {
    const list = attendees.filter(a => {
      const fullName = `${a.first_name} ${a.last_name}`.toLowerCase();
      const matchSearch = !search || fullName.includes(search.toLowerCase()) || a.company_name?.toLowerCase().includes(search.toLowerCase()) || a.email?.toLowerCase().includes(search.toLowerCase()) || a.title?.toLowerCase().includes(search.toLowerCase());
      const matchType = !filterCompanyType || a.company_type === filterCompanyType;
      const matchStatus = !filterStatus || (a.status || 'Unknown') === filterStatus;
      const matchSeniority = !filterSeniority || effectiveSeniority(a.seniority, a.title) === filterSeniority;
      const matchConf = confCountMatches(Number(a.conference_count));
      const matchFollowUps = !filterHasFollowUps || a.has_pending_follow_ups === true;
      return matchSearch && matchType && matchStatus && matchSeniority && matchConf && matchFollowUps;
    });
    list.sort((a, b) => {
      let aVal: string | number, bVal: string | number;
      if (sortKey === 'last_name') { aVal = `${a.last_name} ${a.first_name}`.toLowerCase(); bVal = `${b.last_name} ${b.first_name}`.toLowerCase(); }
      else if (sortKey === 'first_name') { aVal = `${a.first_name} ${a.last_name}`.toLowerCase(); bVal = `${b.first_name} ${b.last_name}`.toLowerCase(); }
      else if (sortKey === 'status') { aVal = (a.status || 'Unknown').toLowerCase(); bVal = (b.status || 'Unknown').toLowerCase(); }
      else { aVal = (a[sortKey] ?? ''); bVal = (b[sortKey] ?? ''); if (typeof aVal === 'string') aVal = aVal.toLowerCase(); if (typeof bVal === 'string') bVal = bVal.toLowerCase(); }
      if (aVal < bVal) return sortDir === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
    return list;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attendees, search, filterCompanyType, filterStatus, filterSeniority, filterConfCounts, filterHasFollowUps, sortKey, sortDir]);

  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const toggleSelect = (id: number) => setSelectedIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const selectedAttendees = attendees.filter(a => selectedIds.has(a.id));
  const companyTypes = Array.from(new Set(attendees.map(a => a.company_type).filter(Boolean))) as string[];

  const handleDeleteOne = async (id: number, name: string) => {
    if (!confirm(`Delete ${name}? This cannot be undone.`)) return;
    try { await fetch(`/api/attendees/${id}`, { method: 'DELETE' }); toast.success(`${name} deleted.`); onRefresh(); }
    catch { toast.error('Failed to delete.'); }
  };

  const handleDeleteSelected = async () => {
    if (!confirm(`Delete ${selectedIds.size} attendee(s)? This cannot be undone.`)) return;
    try {
      await Promise.all(Array.from(selectedIds).map(id => fetch(`/api/attendees/${id}`, { method: 'DELETE' }).then(r => { if (!r.ok) throw new Error(); })));
      toast.success(`${selectedIds.size} attendee(s) deleted.`); setSelectedIds(new Set()); onRefresh();
    } catch { toast.error('Failed to delete some attendees.'); onRefresh(); }
  };

  const handleMerge = async (masterId: number, duplicateIds: number[]) => {
    const res = await fetch('/api/attendees/merge', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ master_id: masterId, duplicate_ids: duplicateIds }) });
    if (!res.ok) { const err = await res.json(); throw new Error(err.error || 'Merge failed'); }
    toast.success('Attendees merged!'); setSelectedIds(new Set()); onRefresh();
  };

  const handleMassEdit = async () => {
    const fields: Record<string, string | number | null> = {};
    if (massEditFields.status) fields.status = massEditFields.status;
    if (massEditFields.title !== undefined && massEditFields.title !== '') fields.title = massEditFields.title;
    if (massEditFields.company_id) fields.company_id = parseInt(massEditFields.company_id);
    if (Object.keys(fields).length === 0) { toast.error('Select at least one field to change.'); return; }
    setIsApplying(true);
    try {
      const res = await fetch('/api/attendees/bulk', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids: Array.from(selectedIds), fields }) });
      if (!res.ok) throw new Error();
      toast.success(`Updated ${selectedIds.size} attendee(s).`);
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
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name, company, email, title..." className="input-field pl-9" />
        </div>
        <select value={filterCompanyType} onChange={e => setFilterCompanyType(e.target.value)} className="input-field w-auto">
          <option value="">All Company Types</option>
          {companyTypes.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="input-field w-auto">
          <option value="">All Statuses</option>
          {statusOptions.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={filterSeniority} onChange={e => setFilterSeniority(e.target.value)} className="input-field w-auto">
          <option value="">All Seniorities</option>
          {seniorityFilterOptions.map(s => <option key={s} value={s}>{s}</option>)}
        </select>

        {/* # Conferences multiselect */}
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

        {/* Has Follow-Ups toggle */}
        <button
          onClick={() => setFilterHasFollowUps(v => !v)}
          className={`input-field w-auto flex items-center gap-2 text-sm ${filterHasFollowUps ? 'border-procare-bright-blue text-procare-bright-blue bg-blue-50' : ''}`}
        >
          Has Follow-Ups
        </button>

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
          <p className="text-sm font-semibold text-procare-dark-blue mb-3">Edit fields for {selectedIds.size} selected attendee(s):</p>
          <div className="flex flex-wrap gap-3 items-end">
            <div>
              <label className="label text-xs">Status</label>
              <select value={massEditFields.status || ''} onChange={e => setMassEditFields(p => ({ ...p, status: e.target.value }))} className="input-field w-40 text-sm">
                <option value="">— no change —</option>
                {statusOptions.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="label text-xs">Title / Seniority Keyword</label>
              <input value={massEditFields.title || ''} onChange={e => setMassEditFields(p => ({ ...p, title: e.target.value }))} placeholder="e.g. VP, Director, CEO" className="input-field w-48 text-sm" />
              <p className="text-xs text-gray-400 mt-0.5">Seniority auto-detects from title unless overridden</p>
            </div>
            <div>
              <label className="label text-xs">Company</label>
              <select value={massEditFields.company_id || ''} onChange={e => setMassEditFields(p => ({ ...p, company_id: e.target.value }))} className="input-field w-48 text-sm">
                <option value="">— no change —</option>
                {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <button onClick={handleMassEdit} disabled={isApplying} className="btn-primary text-sm">{isApplying ? 'Applying...' : `Apply to ${selectedIds.size}`}</button>
            <button onClick={() => setShowMassEdit(false)} className="btn-secondary text-sm">Cancel</button>
          </div>
        </div>
      )}

      <p className="text-xs text-gray-500 mb-3">Showing {filtered.length} of {attendees.length} attendees{selectedIds.size > 0 && ` · ${selectedIds.size} selected`}</p>

      <div className="rounded-xl border border-gray-200 overflow-hidden">
        {/* Mobile card layout */}
        <div className="block lg:hidden divide-y divide-gray-100 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 18rem)' }}>
          {filtered.length === 0 ? (
            <div className="px-4 py-8 text-center text-gray-400 text-sm">No attendees found.</div>
          ) : paginated.map(attendee => {
            const seniority = effectiveSeniority(attendee.seniority, attendee.title);
            return (
              <div key={attendee.id} className={`p-4 ${selectedIds.has(attendee.id) ? 'bg-blue-50' : 'bg-white'}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <input type="checkbox" checked={selectedIds.has(attendee.id)} onChange={() => toggleSelect(attendee.id)} className="accent-procare-bright-blue flex-shrink-0" />
                    <Link href={`/attendees/${attendee.id}`} className="font-semibold text-procare-bright-blue hover:underline text-sm truncate">
                      {attendee.first_name} {attendee.last_name}
                    </Link>
                    {Number(attendee.notes_count) > 0 && (
                      <NotesPopover attendeeId={attendee.id} notesCount={Number(attendee.notes_count)} />
                    )}
                  </div>
                  <button onClick={() => handleDeleteOne(attendee.id, `${attendee.first_name} ${attendee.last_name}`)} className="flex-shrink-0 text-red-400 hover:text-red-600 p-1 rounded" title="Delete">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                  </button>
                </div>
                {attendee.title && <p className="text-xs text-gray-500 mt-1 ml-6">{attendee.title}</p>}
                {attendee.company_name && (
                  <div className="mt-1 ml-6 flex items-center gap-1.5 flex-wrap">
                    {attendee.company_id ? (
                      <Link href={`/companies/${attendee.company_id}`} className="text-xs text-gray-700 hover:text-procare-bright-blue hover:underline">{attendee.company_name}</Link>
                    ) : (
                      <span className="text-xs text-gray-700">{attendee.company_name}</span>
                    )}
                    {attendee.company_type && <span className="badge-blue text-xs">{attendee.company_type}</span>}
                  </div>
                )}
                <div className="mt-2 ml-6 flex items-center flex-wrap gap-2">
                  <span className={getBadgeClass(attendee.status || 'Unknown', colorMaps.status || {})}>{attendee.status || 'Unknown'}</span>
                  <span className={getBadgeClass(seniority, colorMaps.seniority || {})}>{seniority}</span>
                  <ConferenceTooltip count={Number(attendee.conference_count)} names={attendee.conference_names} />
                </div>
              </div>
            );
          })}
        </div>

        {/* Desktop table layout */}
        <div className="hidden lg:block overflow-auto" style={{ maxHeight: 'calc(100vh - 18rem)' }}>
          <table className="w-full text-sm" style={{ tableLayout: 'fixed' }}>
            <thead className="sticky top-0 z-10">
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="px-3 py-3 text-left w-10">
                  <input type="checkbox" checked={selectedIds.size === filtered.length && filtered.length > 0} onChange={e => { if (e.target.checked) setSelectedIds(new Set(filtered.map(a => a.id))); else setSelectedIds(new Set()); }} className="accent-procare-bright-blue" />
                </th>
                <th className={thCls} style={{ width: colWidths.name }} onClick={() => handleSort('last_name')}>Name <SortIcon col="last_name" sortKey={sortKey} sortDir={sortDir} /><ResizeHandle col="name" /></th>
                <th className={thCls} style={{ width: colWidths.title }} onClick={() => handleSort('title')}>Title <SortIcon col="title" sortKey={sortKey} sortDir={sortDir} /><ResizeHandle col="title" /></th>
                <th className={thCls} style={{ width: colWidths.company }} onClick={() => handleSort('company_name')}>Company <SortIcon col="company_name" sortKey={sortKey} sortDir={sortDir} /><ResizeHandle col="company" /></th>
                <th className={thCls} style={{ width: colWidths.status }} onClick={() => handleSort('status')}>Status <SortIcon col="status" sortKey={sortKey} sortDir={sortDir} /><ResizeHandle col="status" /></th>
                <th className={thCls} style={{ width: colWidths.seniority }}>Seniority<ResizeHandle col="seniority" /></th>
                <th className={thCls} style={{ width: colWidths.conferences }} onClick={() => handleSort('conference_count')}>Conferences <SortIcon col="conference_count" sortKey={sortKey} sortDir={sortDir} /><ResizeHandle col="conferences" /></th>
                <th className="px-3 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider" style={{ width: colWidths.notes }}>Notes<ResizeHandle col="notes" /></th>
                <th className="px-3 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider" style={{ width: colWidths.actions }}>Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.length === 0 ? (
                <tr><td colSpan={9} className="px-4 py-8 text-center text-gray-400 text-sm">No attendees found.</td></tr>
              ) : paginated.map(attendee => {
                const seniority = effectiveSeniority(attendee.seniority, attendee.title);
                return (
                  <tr key={attendee.id} className={`hover:bg-gray-50 transition-colors ${selectedIds.has(attendee.id) ? 'bg-blue-50' : ''}`}>
                    <td className="px-3 py-3"><input type="checkbox" checked={selectedIds.has(attendee.id)} onChange={() => toggleSelect(attendee.id)} className="accent-procare-bright-blue" /></td>
                    <td className="px-3 py-3">
                      <Link href={`/attendees/${attendee.id}`} className="font-medium text-procare-bright-blue hover:underline truncate">
                        {attendee.first_name} {attendee.last_name}
                      </Link>
                    </td>
                    <td className="px-3 py-3 text-gray-600 truncate">{attendee.title || <span className="text-gray-300">—</span>}</td>
                    <td className="px-3 py-3">
                      {attendee.company_name ? (
                        <div className="truncate">
                          {attendee.company_id ? (
                            <Link href={`/companies/${attendee.company_id}`} className="text-gray-800 hover:text-procare-bright-blue hover:underline truncate">
                              {attendee.company_name}
                            </Link>
                          ) : (
                            <p className="text-gray-800 truncate">{attendee.company_name}</p>
                          )}
                          {attendee.company_type && <span className="badge-blue text-xs">{attendee.company_type}</span>}
                        </div>
                      ) : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-3 py-3"><span className={getBadgeClass(attendee.status || 'Unknown', colorMaps.status || {})}>{attendee.status || 'Unknown'}</span></td>
                    <td className="px-3 py-3"><span className={getBadgeClass(seniority, colorMaps.seniority || {})}>{seniority}</span></td>
                    <td className="px-3 py-3"><ConferenceTooltip count={Number(attendee.conference_count)} names={attendee.conference_names} /></td>
                    <td className="px-3 py-3">
                      {Number(attendee.notes_count) > 0 ? (
                        <NotesPopover
                          attendeeId={attendee.id}
                          notesCount={Number(attendee.notes_count)}
                        />
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-3">
                        <Link href={`/attendees/${attendee.id}`} className="text-procare-bright-blue hover:underline text-xs font-medium">View</Link>
                        <button onClick={() => handleDeleteOne(attendee.id, `${attendee.first_name} ${attendee.last_name}`)} className="text-red-400 hover:text-red-600 text-xs font-medium transition-colors">Delete</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {filtered.length > PAGE_SIZE && (
        <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-100">
          <span className="text-xs text-gray-500">
            Page {page} of {Math.ceil(filtered.length / PAGE_SIZE)} · {filtered.length} total
          </span>
          <div className="flex items-center gap-2">
            <button disabled={page === 1} onClick={() => setPage(p => p - 1)} className="px-3 py-1 text-xs rounded border border-gray-200 disabled:opacity-40 hover:bg-gray-50">Previous</button>
            <button disabled={page >= Math.ceil(filtered.length / PAGE_SIZE)} onClick={() => setPage(p => p + 1)} className="px-3 py-1 text-xs rounded border border-gray-200 disabled:opacity-40 hover:bg-gray-50">Next</button>
          </div>
        </div>
      )}

      <MergeModal isOpen={showMergeModal} onClose={() => setShowMergeModal(false)} onMerge={handleMerge}
        items={selectedAttendees.map(a => ({ id: a.id, label: `${a.first_name} ${a.last_name}`, sublabel: [a.title, a.company_name].filter(Boolean).join(' · ') }))}
        title="Merge Attendees" description="Select the master record. All conference associations will be merged into master. Duplicates will be deleted." />
    </div>
  );
}
