'use client';

import { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { MergeModal } from './MergeModal';
import { InternalRelationshipModal } from './InternalRelationshipsSection';
import { AddToConferenceModal } from './AddToConferenceModal';
import { effectiveSeniority } from '@/lib/parsers';
import { NotesPopover } from './NotesPopover';
import { useConfigColors } from '@/lib/useConfigColors';
import { useConfigOptions } from '@/lib/useConfigOptions';
import { getBadgeClass } from '@/lib/colors';
import { useTableColumnConfig, useCustomColumns } from '@/lib/useTableColumnConfig';
import { CustomColumnCell } from './CustomColumnCell';

interface Attendee {
  id: number;
  first_name: string;
  last_name: string;
  title?: string;
  company_name?: string;
  company_type?: string;
  company_id?: number;
  company_wse?: number;
  company_icp?: string;
  company_services?: string;
  company_profit_type?: string;
  company_entity_structure?: string;
  company_assigned_user?: string;
  company_website?: string;
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
  pinned_notes_count?: number;
  updated_at?: string;
  created_at?: string;
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
    ? <svg className="w-3 h-3 ml-1 text-brand-secondary inline" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" /></svg>
    : <svg className="w-3 h-3 ml-1 text-brand-secondary inline" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>;
}

const DEFAULT_WIDTHS: Record<string, number> = { name: 220, title: 150, company: 160, company_type: 110, status: 130, seniority: 120, conferences: 100, notes: 70, updated_on: 110, date_added: 110 };

function fmtDate(dateStr?: string): string {
  if (!dateStr) return '—';
  try {
    const d = new Date(dateStr.endsWith('Z') || dateStr.includes('+') ? dateStr : dateStr + 'Z');
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch { return '—'; }
}

export function AttendeeTable({ attendees, onRefresh }: AttendeeTableProps) {
  const { isVisible, orderedColumns } = useTableColumnConfig('attendees');
  const customColumns = useCustomColumns('attendees');
  const colorMaps = useConfigColors();
  const configOptions = useConfigOptions('attendee_table');
  const statusOptions = configOptions.status ?? [];
  const seniorityConfigOptions = useMemo(() => configOptions.seniority ?? [], [configOptions.seniority]);
  const companyTypeOptions = useMemo(() => configOptions.company_type ?? [], [configOptions.company_type]);
  const [localAttendees, setLocalAttendees] = useState<Attendee[]>(attendees);
  useEffect(() => { setLocalAttendees(attendees); }, [attendees]);
  const [search, setSearch] = useState('');
  const [filterCompanyType, setFilterCompanyType] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterSeniority, setFilterSeniority] = useState('');
  const [filterConfCounts, setFilterConfCounts] = useState<Set<string>>(new Set());
  const [showConfFilter, setShowConfFilter] = useState(false);
  const [filterUpdatedWithin, setFilterUpdatedWithin] = useState('');
  const [page, setPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [showMergeModal, setShowMergeModal] = useState(false);
  const [showRepRelModal, setShowRepRelModal] = useState(false);
  const [showAddToConf, setShowAddToConf] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>('last_name');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [colWidths, setColWidths] = useState<Record<string, number>>(DEFAULT_WIDTHS);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [showMassEdit, setShowMassEdit] = useState(false);
  const [massEditFields, setMassEditFields] = useState<{ status?: string; seniority?: string; company_id?: string }>({});
  const [companies, setCompanies] = useState<Company[]>([]);
  const [isApplying, setIsApplying] = useState(false);
  const [editingCell, setEditingCell] = useState<{ attendeeId: number; field: 'title' | 'company_type' | 'status' | 'seniority' | 'company_wse' } | null>(null);
  const [cellDraft, setCellDraft] = useState<string>('');
  const [isSavingCell, setIsSavingCell] = useState(false);
  const resizeRef = useRef<{ col: string; startX: number; startW: number } | null>(null);

  useEffect(() => {
    if (showMassEdit && companies.length === 0) {
      fetch('/api/companies').then(r => r.json()).then(setCompanies).catch(() => {});
    }
  }, [showMassEdit, companies.length]);

  useEffect(() => {
    setPage(1);
  }, [search, filterCompanyType, filterStatus, filterSeniority, filterConfCounts, filterUpdatedWithin]);

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
    const list = localAttendees.filter(a => {
      const fullName = `${a.first_name} ${a.last_name}`.toLowerCase();
      const matchSearch = !search || fullName.includes(search.toLowerCase()) || a.company_name?.toLowerCase().includes(search.toLowerCase()) || a.email?.toLowerCase().includes(search.toLowerCase()) || a.title?.toLowerCase().includes(search.toLowerCase());
      const matchType = !filterCompanyType || a.company_type === filterCompanyType;
      const matchStatus = !filterStatus || (a.status || '').split(',').map(s => s.trim()).some(s => s === filterStatus);
      const matchSeniority = !filterSeniority || effectiveSeniority(a.seniority, a.title) === filterSeniority;
      const matchConf = confCountMatches(Number(a.conference_count));
      const matchUpdatedWithin = (() => {
        if (!filterUpdatedWithin) return true;
        if (!a.updated_at) return false;
        const days = filterUpdatedWithin === '1day' ? 1 : filterUpdatedWithin === '1week' ? 7 : filterUpdatedWithin === '2weeks' ? 14 : 30;
        const updAt = String(a.updated_at);
        return new Date(updAt.endsWith('Z') || updAt.includes('+') ? updAt : updAt + 'Z').getTime() >= Date.now() - days * 24 * 60 * 60 * 1000;
      })();
      return matchSearch && matchType && matchStatus && matchSeniority && matchConf && matchUpdatedWithin;
    });
    list.sort((a, b) => {
      let aVal: string | number, bVal: string | number;
      if (sortKey === 'last_name') { aVal = `${a.last_name} ${a.first_name}`.toLowerCase(); bVal = `${b.last_name} ${b.first_name}`.toLowerCase(); }
      else if (sortKey === 'first_name') { aVal = `${a.first_name} ${a.last_name}`.toLowerCase(); bVal = `${b.first_name} ${b.last_name}`.toLowerCase(); }
      else if (sortKey === 'status') { aVal = (a.status || '').toLowerCase(); bVal = (b.status || '').toLowerCase(); }
      else { aVal = (a[sortKey] ?? ''); bVal = (b[sortKey] ?? ''); if (typeof aVal === 'string') aVal = aVal.toLowerCase(); if (typeof bVal === 'string') bVal = bVal.toLowerCase(); }
      if (aVal < bVal) return sortDir === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
    return list;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [localAttendees, search, filterCompanyType, filterStatus, filterSeniority, filterConfCounts, filterUpdatedWithin, sortKey, sortDir]);

  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const toggleSelect = (id: number) => setSelectedIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const selectedAttendees = localAttendees.filter(a => selectedIds.has(a.id));
  const companyTypes = Array.from(new Set(localAttendees.map(a => a.company_type).filter(Boolean))) as string[];

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
    const dupSet = new Set(duplicateIds);
    const snapshot = localAttendees;
    setLocalAttendees((as) => as.filter((a) => !dupSet.has(a.id)));
    try {
      const res = await fetch('/api/attendees/merge', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ master_id: masterId, duplicate_ids: duplicateIds }) });
      if (!res.ok) { const err = await res.json(); throw new Error(err.error || 'Merge failed'); }
      toast.success('Attendees merged!'); setSelectedIds(new Set()); onRefresh();
    } catch (e) {
      setLocalAttendees(snapshot);
      throw e;
    }
  };

  const handleMassEdit = async () => {
    const fields: Record<string, string | number | null> = {};
    if (massEditFields.status) fields.status = massEditFields.status;
    if (massEditFields.seniority) fields.seniority = massEditFields.seniority;
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

  const startInlineEdit = (attendee: Attendee, field: 'title' | 'company_type' | 'status' | 'seniority' | 'company_wse') => {
    setEditingCell({ attendeeId: attendee.id, field });
    if (field === 'company_wse') {
      setCellDraft(attendee.company_wse != null ? String(attendee.company_wse) : '');
      return;
    }
    if (field === 'title') setCellDraft(attendee.title || '');
    else if (field === 'company_type') setCellDraft(attendee.company_type || '');
    else if (field === 'status') setCellDraft(attendee.status || '');
    else if (field === 'seniority') setCellDraft(attendee.seniority || '');
  };

  const saveInlineEdit = async (attendee: Attendee, field: 'title' | 'company_type' | 'status' | 'seniority' | 'company_wse') => {
    if (isSavingCell) return;
    const payload: Record<string, string | number | null> = {};
    if (field === 'company_wse') {
      const trimmed = cellDraft.trim();
      const parsed = trimmed === '' ? null : Number(trimmed);
      if (parsed != null && (!Number.isFinite(parsed) || parsed < 0)) { toast.error('WSE must be a non-negative number.'); return; }
      if ((attendee.company_wse ?? null) === (parsed == null ? null : Math.round(parsed))) { setEditingCell(null); return; }
      payload.company_wse = parsed == null ? null : Math.round(parsed);
    } else {
      const nextValue = cellDraft.trim();
      const currentValue =
        field === 'title' ? (attendee.title || '')
        : field === 'company_type' ? (attendee.company_type || '')
        : field === 'status' ? (attendee.status || '')
        : (attendee.seniority || '');
      if (nextValue === currentValue) { setEditingCell(null); return; }
      payload[field] = nextValue || null;
    }
    setIsSavingCell(true);
    try {
      const res = await fetch(`/api/attendees/${attendee.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error();
      setLocalAttendees(prev => prev.map(a => {
        if (a.id !== attendee.id) return a;
        const updated: Attendee = { ...a };
        if (field === 'company_wse') {
          updated.company_wse = payload.company_wse == null ? undefined : Number(payload.company_wse);
        } else {
          if (field === 'title') updated.title = payload[field] == null ? undefined : String(payload[field]);
          if (field === 'company_type') updated.company_type = payload[field] == null ? undefined : String(payload[field]);
          if (field === 'status') updated.status = payload[field] == null ? undefined : String(payload[field]);
          if (field === 'seniority') updated.seniority = payload[field] == null ? undefined : String(payload[field]);
        }
        return updated;
      }));
      setEditingCell(null);
      toast.success('Updated.');
      onRefresh();
    } catch {
      toast.error('Failed to update attendee.');
    } finally {
      setIsSavingCell(false);
    }
  };

  const thCls = 'px-3 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider cursor-pointer select-none hover:text-brand-primary whitespace-nowrap relative';

  const ResizeHandle = ({ col }: { col: string }) => (
    <div onMouseDown={e => startResize(e, col)} style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: 4, cursor: 'col-resize', userSelect: 'none', zIndex: 10 }} className="hover:bg-brand-secondary opacity-0 hover:opacity-30" />
  );

  const activeFilterCount = (filterCompanyType ? 1 : 0) + (filterStatus ? 1 : 0) + (filterSeniority ? 1 : 0) + (filterConfCounts.size > 0 ? 1 : 0) + (filterUpdatedWithin ? 1 : 0);

  return (
    <div>
      {/* Toolbar */}
      <div className="flex flex-wrap gap-3 mb-4">
        <div className="flex-1 min-w-[200px] relative">
          <svg className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name, company, email, title..." className="input-field pl-9" />
        </div>
        <button
          type="button"
          onClick={() => setFiltersOpen(o => !o)}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm font-medium transition-colors ${activeFilterCount > 0 ? 'border-brand-secondary text-brand-secondary bg-blue-50' : 'border-gray-200 text-gray-600 hover:border-gray-400'}`}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
          </svg>
          Filters
          {activeFilterCount > 0 && (
            <span className="bg-brand-secondary text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center leading-none">
              {activeFilterCount}
            </span>
          )}
          <svg className={`w-3.5 h-3.5 text-gray-400 transition-transform ${filtersOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
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
            <button onClick={() => setShowRepRelModal(true)} className="btn-secondary flex items-center gap-2 text-sm">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
              + Rep Relationship
            </button>
            <button onClick={() => setShowAddToConf(true)} className="btn-secondary flex items-center gap-2 text-sm">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
              Add to Conference
            </button>
          </>
        )}
        {selectedIds.size >= 1 && (
          <button onClick={() => setShowMergeModal(true)} className="btn-gold flex items-center gap-2 text-sm">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" /></svg>
            Merge ({selectedIds.size})
          </button>
        )}
      </div>

      {/* Collapsible filter pane */}
      {filtersOpen && (
        <div className="mb-4 px-6 py-4 bg-gray-50 border border-gray-200 rounded-xl">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Company Type</p>
              <select value={filterCompanyType} onChange={e => setFilterCompanyType(e.target.value)} className="input-field w-full text-sm">
                <option value="">All Company Types</option>
                {companyTypes.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Status</p>
              <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="input-field w-full text-sm">
                <option value="">All Statuses</option>
                {statusOptions.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Seniority</p>
              <select value={filterSeniority} onChange={e => setFilterSeniority(e.target.value)} className="input-field w-full text-sm">
                <option value="">All Seniorities</option>
                {seniorityFilterOptions.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5"># Conferences</p>
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowConfFilter(v => !v)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-left flex items-center justify-between gap-2 hover:border-brand-secondary transition-colors bg-white"
                >
                  <span>{filterConfCounts.size > 0 ? `${filterConfCounts.size} selected` : 'All counts...'}</span>
                  <svg className={`w-3 h-3 text-gray-400 flex-shrink-0 transition-transform ${showConfFilter ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                </button>
                {showConfFilter && (
                  <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-30 p-2 min-w-[140px]">
                    {CONF_COUNT_OPTIONS.map(opt => (
                      <label key={opt} className="flex items-center gap-2 px-2 py-1.5 hover:bg-gray-50 rounded cursor-pointer text-sm">
                        <input type="checkbox" checked={filterConfCounts.has(opt)} onChange={() => toggleConfFilter(opt)} className="accent-brand-secondary" />
                        {opt} conference{opt === '1' ? '' : 's'}
                      </label>
                    ))}
                    {filterConfCounts.size > 0 && <button onClick={() => setFilterConfCounts(new Set())} className="text-xs text-red-500 hover:underline px-2 mt-1">Clear</button>}
                  </div>
                )}
              </div>
            </div>
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Updated On</p>
              <select value={filterUpdatedWithin} onChange={e => setFilterUpdatedWithin(e.target.value)} className="input-field w-full text-sm">
                <option value="">Updated within the...</option>
                <option value="1day">Last Day</option>
                <option value="1week">Last Week</option>
                <option value="2weeks">Last 2 Weeks</option>
                <option value="30days">Last 30 Days</option>
              </select>
            </div>
          </div>
          {activeFilterCount > 0 && (
            <div className="mt-3 flex justify-end">
              <button
                type="button"
                onClick={() => { setFilterCompanyType(''); setFilterStatus(''); setFilterSeniority(''); setFilterConfCounts(new Set()); setFilterUpdatedWithin(''); }}
                className="text-xs text-gray-500 hover:text-red-500 transition-colors"
              >
                Clear all filters
              </button>
            </div>
          )}
        </div>
      )}

      {/* Mass Edit Panel */}
      {showMassEdit && (
        <div className="mb-4 p-4 bg-blue-50 border border-brand-secondary rounded-xl">
          <p className="text-sm font-semibold text-brand-primary mb-3">Edit fields for {selectedIds.size} selected attendee(s):</p>
          <div className="flex flex-wrap gap-3 items-end">
            <div>
              <label className="label text-xs">Status</label>
              <select value={massEditFields.status || ''} onChange={e => setMassEditFields(p => ({ ...p, status: e.target.value }))} className="input-field w-40 text-sm">
                <option value="">— no change —</option>
                {statusOptions.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="label text-xs">Seniority</label>
              <select value={massEditFields.seniority || ''} onChange={e => setMassEditFields(p => ({ ...p, seniority: e.target.value }))} className="input-field w-48 text-sm">
                <option value="">— no change —</option>
                {seniorityConfigOptions.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
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

      <p className="text-xs text-gray-500 mb-3">Showing {filtered.length} of {localAttendees.length} attendees{selectedIds.size > 0 && ` · ${selectedIds.size} selected`}</p>

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
                    <input type="checkbox" checked={selectedIds.has(attendee.id)} onChange={() => toggleSelect(attendee.id)} className="accent-brand-secondary flex-shrink-0" />
                    <Link href={`/attendees/${attendee.id}`} className="font-semibold text-brand-secondary hover:underline text-sm truncate">
                      {attendee.first_name} {attendee.last_name}
                    </Link>
                    {Number(attendee.notes_count) > 0 && (
                      <NotesPopover attendeeId={attendee.id} notesCount={Number(attendee.notes_count)} />
                    )}
                    {Number(attendee.pinned_notes_count) > 0 && (
                      <span title="Has pinned note" className="flex-shrink-0 inline-flex items-center justify-center w-4 h-4 rounded-full bg-amber-400 text-white">
                        <svg className="w-2.5 h-2.5" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M16 12V4h1V2H7v2h1v8l-2 2v2h5.2v6h1.6v-6H18v-2l-2-2z"/>
                        </svg>
                      </span>
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
                      <Link href={`/companies/${attendee.company_id}`} className="text-xs text-gray-700 hover:text-brand-secondary hover:underline">{attendee.company_name}</Link>
                    ) : (
                      <span className="text-xs text-gray-700">{attendee.company_name}</span>
                    )}
                    {attendee.company_type && <span className={`${getBadgeClass(attendee.company_type, colorMaps.company_type || {})} text-xs`}>{attendee.company_type}</span>}
                  </div>
                )}
                <div className="mt-2 ml-6 flex items-center flex-wrap gap-2">
                  <span className="flex flex-wrap gap-1">{(attendee.status || '').split(',').map(s => s.trim()).filter(s => s && s !== 'Unknown').map(s => <span key={s} className={getBadgeClass(s, colorMaps.status || {})}>{s}</span>)}{(attendee.status || '').split(',').map(s => s.trim()).filter(s => s && s !== 'Unknown').length === 0 && <span className="text-gray-400">—</span>}</span>
                  <span className={`${getBadgeClass(seniority, colorMaps.seniority || {})} inline-flex items-center gap-1`}>
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                    {seniority}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <svg className="w-3 h-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                    <ConferenceTooltip count={Number(attendee.conference_count)} names={attendee.conference_names} />
                  </span>
                  {attendee.company_wse != null && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-yellow-50 text-yellow-700 border border-yellow-200">
                      <svg className="w-3 h-3 text-yellow-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M2 18h20M4 18v-3a8 8 0 0116 0v3M12 3v2M4.93 7.93l1.41 1.41M19.07 7.93l-1.41 1.41" /></svg>
                      {Number(attendee.company_wse).toLocaleString()}
                    </span>
                  )}
                </div>
                {attendee.created_at && (
                  <p className="text-[11px] text-gray-400 mt-1 ml-6">Added {fmtDate(attendee.created_at)}</p>
                )}
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
                  <input type="checkbox" checked={selectedIds.size === filtered.length && filtered.length > 0} onChange={e => { if (e.target.checked) setSelectedIds(new Set(filtered.map(a => a.id))); else setSelectedIds(new Set()); }} className="accent-brand-secondary" />
                </th>
                {orderedColumns.map(({ key }) => {
                  if (!isVisible(key)) return null;
                  switch (key) {
                    case 'name': return <th key="name" className={thCls} style={{ width: colWidths.name }} onClick={() => handleSort('last_name')}>Name <SortIcon col="last_name" sortKey={sortKey} sortDir={sortDir} /><ResizeHandle col="name" /></th>;
                    case 'title': return <th key="title" className={thCls} style={{ width: colWidths.title }} onClick={() => handleSort('title')}>Title <SortIcon col="title" sortKey={sortKey} sortDir={sortDir} /><ResizeHandle col="title" /></th>;
                    case 'company': return <th key="company" className={thCls} style={{ width: colWidths.company }} onClick={() => handleSort('company_name')}>Company <SortIcon col="company_name" sortKey={sortKey} sortDir={sortDir} /><ResizeHandle col="company" /></th>;
                    case 'company_type': return <th key="company_type" className={thCls} style={{ width: colWidths.company_type }}>Type<ResizeHandle col="company_type" /></th>;
                    case 'status': return <th key="status" className={thCls} style={{ width: colWidths.status }} onClick={() => handleSort('status')}>Status <SortIcon col="status" sortKey={sortKey} sortDir={sortDir} /><ResizeHandle col="status" /></th>;
                    case 'seniority': return <th key="seniority" className={thCls} style={{ width: colWidths.seniority }}>Seniority<ResizeHandle col="seniority" /></th>;
                    case 'conferences': return <th key="conferences" className={thCls} style={{ width: colWidths.conferences }} onClick={() => handleSort('conference_count')}>Conferences <SortIcon col="conference_count" sortKey={sortKey} sortDir={sortDir} /><ResizeHandle col="conferences" /></th>;
                    case 'notes': return <th key="notes" className="px-3 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider" style={{ width: colWidths.notes }}>Notes<ResizeHandle col="notes" /></th>;
                    case 'updated_on': return <th key="updated_on" className="px-3 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider whitespace-nowrap relative" style={{ width: colWidths.updated_on }}>Updated On<ResizeHandle col="updated_on" /></th>;
                    case 'date_added': return <th key="date_added" className="px-3 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider whitespace-nowrap relative" style={{ width: colWidths.date_added }}>Date Added<ResizeHandle col="date_added" /></th>;
                    default: return null;
                  }
                })}
                {customColumns.filter(c => c.visible).map(col => (
                  <th key={`custom_${col.id}`} className="px-3 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider whitespace-nowrap" style={{ minWidth: 120 }}>
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.length === 0 ? (
                <tr><td colSpan={1 + orderedColumns.filter(c => isVisible(c.key)).length + customColumns.filter(c => c.visible).length} className="px-4 py-8 text-center text-gray-400 text-sm">No attendees found.</td></tr>
              ) : paginated.map(attendee => {
                const seniority = effectiveSeniority(attendee.seniority, attendee.title);
                return (
                  <tr key={attendee.id} className={`hover:bg-gray-50 transition-colors ${selectedIds.has(attendee.id) ? 'bg-blue-50' : ''}`}>
                    <td className="px-3 py-3"><input type="checkbox" checked={selectedIds.has(attendee.id)} onChange={() => toggleSelect(attendee.id)} className="accent-brand-secondary" /></td>
                    {orderedColumns.map(({ key }) => {
                      if (!isVisible(key)) return null;
                      switch (key) {
                        case 'name': return (
                          <td key="name" className="px-3 py-3 overflow-visible">
                            <div className="text-left">
                              <Link href={`/attendees/${attendee.id}`} className="text-sm text-brand-secondary hover:underline break-words whitespace-normal leading-snug">
                                {attendee.first_name} {attendee.last_name}
                              </Link>
                            </div>
                          </td>
                        );
                        case 'title': return (
                          <td key="title" className="px-3 py-3 text-gray-600 overflow-visible relative" style={{ maxWidth: colWidths.title }}>
                            {editingCell?.attendeeId === attendee.id && editingCell.field === 'title' ? (
                              <input
                                className="input-field bg-white text-sm py-2 min-w-[260px] w-auto relative z-30 shadow-md"
                                value={cellDraft}
                                onChange={(e) => setCellDraft(e.target.value)}
                                onBlur={() => saveInlineEdit(attendee, 'title')}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') saveInlineEdit(attendee, 'title');
                                  if (e.key === 'Escape') setEditingCell(null);
                                }}
                                autoFocus
                              />
                            ) : (
                              <button type="button" className="block text-left w-full" onClick={() => startInlineEdit(attendee, 'title')} title="Click to edit title">
                                <span className="block text-sm leading-snug break-words whitespace-normal">{attendee.title || <span className="text-gray-300">—</span>}</span>
                              </button>
                            )}
                          </td>
                        );
                        case 'company': return (
                          <td key="company" className="px-3 py-3 overflow-visible relative">
                            {attendee.company_name ? (
                              <div>
                                {attendee.company_id ? (
                                  <Link href={`/companies/${attendee.company_id}`} className="text-sm text-gray-800 hover:text-brand-secondary hover:underline break-words whitespace-normal leading-snug">
                                    {attendee.company_name}
                                  </Link>
                                ) : (
                                  <span className="text-xs text-gray-800 break-words whitespace-normal leading-snug">{attendee.company_name}</span>
                                )}
                                {attendee.company_wse != null && (
                                  editingCell?.attendeeId === attendee.id && editingCell.field === 'company_wse' ? (
                                    <input
                                      className="input-field bg-white text-sm py-2 min-w-[180px] w-auto mt-1 relative z-30 shadow-md"
                                      value={cellDraft}
                                      onChange={(e) => setCellDraft(e.target.value)}
                                      onBlur={() => saveInlineEdit(attendee, 'company_wse')}
                                      onKeyDown={(e) => {
                                        if (e.key === 'Enter') saveInlineEdit(attendee, 'company_wse');
                                        if (e.key === 'Escape') setEditingCell(null);
                                      }}
                                      autoFocus
                                    />
                                  ) : (
                                    <button type="button" className="text-[10px] text-gray-400 mt-0.5 hover:text-brand-secondary" onClick={() => startInlineEdit(attendee, 'company_wse')} title="Click to edit WSE">
                                      WSE: {Number(attendee.company_wse).toLocaleString()}
                                    </button>
                                  )
                                )}
                              </div>
                            ) : <span className="text-gray-300">—</span>}
                          </td>
                        );
                        case 'company_type': return (
                          <td key="company_type" className="px-3 py-3 overflow-visible relative">
                            {editingCell?.attendeeId === attendee.id && editingCell.field === 'company_type' ? (
                              <select
                                className="input-field bg-white text-sm py-2 min-w-[260px] w-auto relative z-30 shadow-md"
                                value={cellDraft}
                                onChange={(e) => setCellDraft(e.target.value)}
                                onBlur={() => saveInlineEdit(attendee, 'company_type')}
                                autoFocus
                              >
                                <option value="">—</option>
                                {companyTypeOptions.map(t => <option key={t} value={t}>{t}</option>)}
                              </select>
                            ) : (
                              <button type="button" onClick={() => startInlineEdit(attendee, 'company_type')}>
                                {attendee.company_type ? (
                                  <span className={`${getBadgeClass(attendee.company_type, colorMaps.company_type || {})} text-xs`}>{attendee.company_type}</span>
                                ) : (
                                  <span className="text-gray-300">—</span>
                                )}
                              </button>
                            )}
                          </td>
                        );
                        case 'status': return (
                          <td key="status" className="px-3 py-3 overflow-visible relative">
                            {editingCell?.attendeeId === attendee.id && editingCell.field === 'status' ? (
                              <select className="input-field bg-white text-sm py-2 min-w-[260px] w-auto relative z-30 shadow-md" value={cellDraft} onChange={(e) => setCellDraft(e.target.value)} onBlur={() => saveInlineEdit(attendee, 'status')} autoFocus>
                                <option value="">—</option>
                                {statusOptions.map(s => <option key={s} value={s}>{s}</option>)}
                              </select>
                            ) : (
                              <button type="button" onClick={() => startInlineEdit(attendee, 'status')}>
                                <span className="flex flex-wrap gap-1">{(attendee.status || '').split(',').map(s => s.trim()).filter(s => s && s !== 'Unknown').map(s => <span key={s} className={getBadgeClass(s, colorMaps.status || {})}>{s}</span>)}{(attendee.status || '').split(',').map(s => s.trim()).filter(s => s && s !== 'Unknown').length === 0 && <span className="text-gray-300">—</span>}</span>
                              </button>
                            )}
                          </td>
                        );
                        case 'seniority': return (
                          <td key="seniority" className="px-3 py-3 overflow-visible relative">
                            {editingCell?.attendeeId === attendee.id && editingCell.field === 'seniority' ? (
                              <select className="input-field bg-white text-sm py-2 min-w-[260px] w-auto relative z-30 shadow-md" value={cellDraft} onChange={(e) => setCellDraft(e.target.value)} onBlur={() => saveInlineEdit(attendee, 'seniority')} autoFocus>
                                <option value="">Auto-detect</option>
                                {seniorityFilterOptions.map(s => <option key={s} value={s}>{s}</option>)}
                              </select>
                            ) : (
                              <button type="button" onClick={() => startInlineEdit(attendee, 'seniority')}>
                                <span className={getBadgeClass(seniority, colorMaps.seniority || {})}>{seniority}</span>
                              </button>
                            )}
                          </td>
                        );
                        case 'conferences': return <td key="conferences" className="px-3 py-3"><ConferenceTooltip count={Number(attendee.conference_count)} names={attendee.conference_names} /></td>;
                        case 'notes': return (
                          <td key="notes" className="px-3 py-3">
                            {Number(attendee.notes_count) > 0 ? (
                              <NotesPopover attendeeId={attendee.id} notesCount={Number(attendee.notes_count)} />
                            ) : (
                              <span className="text-gray-300">—</span>
                            )}
                          </td>
                        );
                        case 'updated_on': return <td key="updated_on" className="px-3 py-3 text-xs text-gray-500 whitespace-nowrap">{fmtDate(attendee.updated_at)}</td>;
                        case 'date_added': return <td key="date_added" className="px-3 py-3 text-xs text-gray-500 whitespace-nowrap">{fmtDate(attendee.created_at)}</td>;
                        default: return null;
                      }
                    })}
                    {customColumns.filter(c => c.visible).map(col => (
                      <td key={`custom_${col.id}`} className="px-3 py-3">
                        <CustomColumnCell column={col} value={(attendee as unknown as Record<string, unknown>)[col.data_key]} />
                      </td>
                    ))}
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
        title="Merge Attendees" description="Select the master record. All conference associations will be merged into master. Duplicates will be deleted."
        searchType="attendee" />

      <InternalRelationshipModal
        isOpen={showRepRelModal}
        onClose={() => setShowRepRelModal(false)}
        onSuccess={() => { setSelectedIds(new Set()); onRefresh(); }}
        entityType="attendee"
        entityIds={Array.from(selectedIds)}
        entityNames={new Map(selectedAttendees.map(a => [a.id, `${a.first_name} ${a.last_name}`]))}
      />

      {showAddToConf && (
        <AddToConferenceModal
          entityType="attendee"
          selectedIds={selectedIds}
          onClose={() => setShowAddToConf(false)}
          onSuccess={() => { setSelectedIds(new Set()); onRefresh(); }}
        />
      )}
    </div>
  );
}
