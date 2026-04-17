'use client';

import { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { MergeModal } from './MergeModal';
import { ParentChildModal } from './ParentChildModal';
import { OperatorCapitalModal } from './OperatorCapitalModal';
import { InternalRelationshipModal } from './InternalRelationshipsSection';
import { useConfigColors } from '@/lib/useConfigColors';
import { useConfigOptions } from '@/lib/useConfigOptions';
import { getBadgeClass, getPreset } from '@/lib/colors';
import { useUserOptions, parseRepIds, resolveRepInitials, getRepInitials } from '@/lib/useUserOptions';
import { RepMultiSelect } from './RepMultiSelect';
import { useTableColumnConfig } from '@/lib/useTableColumnConfig';

interface Company {
  id: number;
  name: string;
  website?: string;
  profit_type?: string;
  company_type?: string;
  notes?: string;
  wse?: number;
  status?: string;
  assigned_user?: string;
  parent_company_id?: number;
  parent_company_name?: string;
  entity_structure?: string;
  icp?: string;
  attendee_count: number;
  conference_count: number;
  conference_names?: string;
  attendee_summary?: string;
  pinned_notes_count?: number;
  updated_at?: string;
}

type TooltipPos = { top: number; left: number; width: number; above: boolean };

function calcTooltipPos(el: HTMLElement, maxW = 260): TooltipPos {
  const rect = el.getBoundingClientRect();
  const w = Math.min(maxW, window.innerWidth - 16);
  const left = Math.max(8, Math.min(rect.left + rect.width / 2 - w / 2, window.innerWidth - w - 8));
  const above = rect.top > 180;
  return { top: above ? rect.top - 8 : rect.bottom + 8, left, width: w, above };
}

function AttendeeTooltip({ count, summary }: { count: number; summary?: string }) {
  const [pos, setPos] = useState<TooltipPos | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const attendees = (summary || '').split('~~~').map(s => s.trim()).filter(Boolean).map(s => {
    const [name, title] = s.split('|');
    return { name: name?.trim() || '', title: title?.trim() || '' };
  });
  if (count === 0) return <span className="badge-gray">{count}</span>;
  return (
    <div ref={ref} className="relative inline-block"
      onMouseEnter={() => ref.current && setPos(calcTooltipPos(ref.current))}
      onMouseLeave={() => setPos(null)}>
      <span className="badge-gray cursor-default">{count}</span>
      {pos && attendees.length > 0 && (
        <div style={{ position: 'fixed', top: pos.top, left: pos.left, width: pos.width, zIndex: 9999, transform: pos.above ? 'translateY(-100%)' : 'translateY(0)' }}>
          <div className="bg-gray-900 text-white text-xs rounded-lg shadow-xl px-3 py-2.5">
            <p className="font-semibold mb-1.5 text-gray-300 uppercase tracking-wide text-[10px]">Attendees</p>
            <ul className="space-y-1">
              {attendees.map((a, i) => (
                <li key={i} className="flex items-start gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-yellow-400 flex-shrink-0 mt-1" />
                  <span><span className="font-medium">{a.name}</span>{a.title && <span className="text-gray-300"> · {a.title}</span>}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}

function ConferenceTooltip({ count, names }: { count: number; names?: string }) {
  const [pos, setPos] = useState<TooltipPos | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const confList = (names || '').split(',').map(s => s.trim()).filter(Boolean);
  if (count === 0) return <span className={conferenceBadgeClass(0)}>{count}</span>;
  return (
    <div ref={ref} className="relative inline-block"
      onMouseEnter={() => ref.current && setPos(calcTooltipPos(ref.current))}
      onMouseLeave={() => setPos(null)}>
      <span className={`${conferenceBadgeClass(count)} cursor-default`}>{count}</span>
      {pos && confList.length > 0 && (
        <div style={{ position: 'fixed', top: pos.top, left: pos.left, width: pos.width, zIndex: 9999, transform: pos.above ? 'translateY(-100%)' : 'translateY(0)' }}>
          <div className="bg-gray-900 text-white text-xs rounded-lg shadow-xl px-3 py-2.5">
            <p className="font-semibold mb-1.5 text-gray-300 uppercase tracking-wide text-[10px]">Conferences Attended</p>
            <ul className="space-y-1">
              {confList.map((name, i) => (
                <li key={i} className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-yellow-400 flex-shrink-0" />{name}</li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}

interface CompanyTableProps {
  companies: Company[];
  onRefresh: () => void;
}

function EntityStructureIcon({ structure }: { structure?: string }) {
  if (!structure) return null;
  if (structure === 'Parent') {
    return (
      <svg className="w-3 h-3 inline-block" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
      </svg>
    );
  }
  if (structure === 'Child') {
    return (
      <svg className="w-3 h-3 inline-block" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-4 0h4" />
      </svg>
    );
  }
  return null;
}

type SortKey = 'name' | 'company_type' | 'status' | 'attendee_count' | 'conference_count';
type SortDir = 'asc' | 'desc';

const CONF_COUNT_OPTIONS = ['1', '2', '3', '4+'];
const PAGE_SIZE = 100;

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

const DEFAULT_WIDTHS: Record<string, number> = { name: 220, type: 160, sfowner: 140, status: 140, attendees: 110, conferences: 120, actions: 110, updated_on: 110 };

function fmtDate(dateStr?: string): string {
  if (!dateStr) return '—';
  try {
    const d = new Date(dateStr.endsWith('Z') || dateStr.includes('+') ? dateStr : dateStr + 'Z');
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch { return '—'; }
}

export function CompanyTable({ companies, onRefresh }: CompanyTableProps) {
  const colorMaps = useConfigColors();
  const configOptions = useConfigOptions();
  const userOptionsFull = useUserOptions();
  const searchParams = useSearchParams();
  const { isVisible } = useTableColumnConfig('companies');

  // Local copy for optimistic updates — syncs whenever the parent re-fetches
  const [localCompanies, setLocalCompanies] = useState<Company[]>(companies);
  useEffect(() => { setLocalCompanies(companies); }, [companies]);
  const statusOptions = configOptions.status ?? [];
  const companyTypeOptions = configOptions.company_type ?? [];
  const [search, setSearch] = useState('');
  // filterSFOwner stores a user ID (as string) for filtering, or '' for all
  const [filterSFOwner, setFilterSFOwner] = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterStatus, setFilterStatus] = useState(searchParams.get('status') ?? '');
  const [filterConfCounts, setFilterConfCounts] = useState<Set<string>>(new Set());
  const [showConfFilter, setShowConfFilter] = useState(false);
  const [filterConference, setFilterConference] = useState('');
  const [filterICP, setFilterICP] = useState('');
  const icpOptions = configOptions.icp ?? [];
  const [filterUpdatedWithin, setFilterUpdatedWithin] = useState('');
  // 'parent' = no parent_company_id (standalone or explicit parent)
  // 'child'  = has parent_company_id set
  const [filterHierarchy, setFilterHierarchy] = useState('');
  const [page, setPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [showMergeModal, setShowMergeModal] = useState(false);
  const [showParentChildModal, setShowParentChildModal] = useState(false);
  const [showOperatorCapitalModal, setShowOperatorCapitalModal] = useState(false);
  const [showRepRelModal, setShowRepRelModal] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [colWidths, setColWidths] = useState<Record<string, number>>(DEFAULT_WIDTHS);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [showMassEdit, setShowMassEdit] = useState(false);
  const [massEditFields, setMassEditFields] = useState<{ status?: string; company_type?: string; assigned_user?: string }>({});
  const [isApplying, setIsApplying] = useState(false);
  const [editingRepCompanyId, setEditingRepCompanyId] = useState<number | null>(null);
  const [editingRepIds, setEditingRepIds] = useState<number[]>([]);
  const [showRepModal, setShowRepModal] = useState(false);
  const resizeRef = useRef<{ col: string; startX: number; startW: number } | null>(null);

  const [wseMin, setWseMin] = useState<number | null>(null);
  const [wseMax, setWseMax] = useState<number | null>(null);

  const wseValues = useMemo(() => localCompanies.map(c => c.wse).filter((w): w is number => w != null), [localCompanies]);
  const wseGlobalMin = useMemo(() => wseValues.length > 0 ? Math.min(...wseValues) : 0, [wseValues]);
  const wseGlobalMax = useMemo(() => wseValues.length > 0 ? Math.max(...wseValues) : 10000, [wseValues]);
  const wseGlobalRange = wseGlobalMax - wseGlobalMin;
  const effectiveWseMin = wseMin ?? wseGlobalMin;
  const effectiveWseMax = wseMax ?? wseGlobalMax;
  const wseFilterActive = wseValues.length > 0 && (effectiveWseMin > wseGlobalMin || effectiveWseMax < wseGlobalMax);
  const wseStep = Math.max(1, Math.ceil(wseGlobalRange / 500));

  useEffect(() => {
    setWseMin(prev => prev === null ? wseGlobalMin : prev);
    setWseMax(prev => prev === null ? wseGlobalMax : prev);
  }, [wseGlobalMin, wseGlobalMax]);

  useEffect(() => {
    setPage(1);
  }, [search, filterSFOwner, filterType, filterStatus, filterConfCounts, filterConference, filterICP, filterUpdatedWithin, wseMin, wseMax]);

  const allConferenceNames = useMemo(() => {
    const names = new Set<string>();
    localCompanies.forEach(c => {
      (c.conference_names || '').split(',').map(s => s.trim()).filter(Boolean).forEach(n => names.add(n));
    });
    return Array.from(names).sort();
  }, [localCompanies]);

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
    const list = localCompanies.filter(c => {
      const matchSearch = !search || c.name.toLowerCase().includes(search.toLowerCase());
      const matchSFOwner = !filterSFOwner || parseRepIds(c.assigned_user).map(String).includes(filterSFOwner);
      const matchType = !filterType || c.company_type === filterType;
      const matchStatus = !filterStatus || (c.status || '').split(',').map(s => s.trim()).some(s => s === filterStatus);
      const matchConf = confCountMatches(Number(c.conference_count));
      const matchConference = !filterConference || (c.conference_names || '').split(',').map(s => s.trim()).includes(filterConference);
      const matchICP = !filterICP || c.icp === filterICP;
      const matchWSE = !wseFilterActive || (c.wse != null && c.wse >= effectiveWseMin && c.wse <= effectiveWseMax);
      const matchUpdatedWithin = (() => {
        if (!filterUpdatedWithin) return true;
        if (!c.updated_at) return false;
        const days = filterUpdatedWithin === '1day' ? 1 : filterUpdatedWithin === '1week' ? 7 : filterUpdatedWithin === '2weeks' ? 14 : 30;
        const updAt = String(c.updated_at);
        return new Date(updAt.endsWith('Z') || updAt.includes('+') ? updAt : updAt + 'Z').getTime() >= Date.now() - days * 24 * 60 * 60 * 1000;
      })();
      const matchHierarchy = !filterHierarchy
        || (filterHierarchy === 'parent' && !c.parent_company_id)
        || (filterHierarchy === 'child' && !!c.parent_company_id);
      return matchSearch && matchSFOwner && matchType && matchStatus && matchConf && matchConference && matchICP && matchWSE && matchUpdatedWithin && matchHierarchy;
    });
    list.sort((a, b) => {
      let aVal: string | number, bVal: string | number;
      if (sortKey === 'status') { aVal = (a.status || '').toLowerCase(); bVal = (b.status || '').toLowerCase(); }
      else { aVal = a[sortKey] ?? ''; bVal = b[sortKey] ?? ''; if (typeof aVal === 'string') aVal = aVal.toLowerCase(); if (typeof bVal === 'string') bVal = bVal.toLowerCase(); }
      if (aVal < bVal) return sortDir === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
    return list;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [localCompanies, search, filterSFOwner, filterType, filterStatus, filterConfCounts, filterConference, filterICP, filterUpdatedWithin, filterHierarchy, wseFilterActive, effectiveWseMin, effectiveWseMax, sortKey, sortDir]);

  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const toggleSelect = (id: number) => setSelectedIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const selectedCompanies = localCompanies.filter(c => selectedIds.has(c.id));

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

  const handleParentChild = async (parentId: number, childIds: number[]) => {
    const res = await fetch('/api/companies/parent-child', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ parent_id: parentId, child_ids: childIds }) });
    if (!res.ok) { const err = await res.json(); throw new Error(err.error || 'Failed to create relationship'); }
    toast.success('Parent/Child relationship created!'); setSelectedIds(new Set()); onRefresh();
  };

  const handleOperatorCapital = async (companyIds: number[]) => {
    const res = await fetch('/api/companies/relationships/bulk', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ company_ids: companyIds }) });
    if (!res.ok) { const err = await res.json(); throw new Error(err.error || 'Failed to create relationships'); }
    toast.success('Operator/Capital relationships created!'); setSelectedIds(new Set()); onRefresh();
  };

  const handleMassEdit = async () => {
    const fields: Record<string, string | null> = {};
    if (massEditFields.status) fields.status = massEditFields.status;
    if (massEditFields.company_type) fields.company_type = massEditFields.company_type;
    if (massEditFields.assigned_user !== undefined) fields.assigned_user = massEditFields.assigned_user || null;
    if (Object.keys(fields).length === 0) { toast.error('Select at least one field to change.'); return; }
    setIsApplying(true);
    try {
      const res = await fetch('/api/companies/bulk', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids: Array.from(selectedIds), fields }) });
      if (!res.ok) throw new Error();
      toast.success(`Updated ${selectedIds.size} company/companies.`);
      setShowMassEdit(false); setMassEditFields({}); onRefresh();
    } catch { toast.error('Failed to apply changes.'); } finally { setIsApplying(false); }
  };

  const handleRepSave = async (companyId: number, ids: number[]) => {
    setEditingRepCompanyId(null);
    const assigned_user = ids.length > 0 ? ids.join(',') : null;
    // Optimistic update — reflect change immediately without waiting for the API
    setLocalCompanies(prev => prev.map(c =>
      c.id === companyId ? { ...c, assigned_user: assigned_user ?? undefined } : c
    ));
    try {
      const res = await fetch('/api/companies/bulk', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: [companyId], fields: { assigned_user } }),
      });
      if (!res.ok) throw new Error();
    } catch {
      toast.error('Failed to update rep.');
      // Revert to server state on failure
      onRefresh();
    }
  };

  const startEditRep = (company: Company) => {
    setEditingRepCompanyId(company.id);
    setEditingRepIds(parseRepIds(company.assigned_user));
  };

  const startEditRepModal = (company: Company) => {
    setEditingRepCompanyId(company.id);
    setEditingRepIds(parseRepIds(company.assigned_user));
    setShowRepModal(true);
  };

  const closeRepModal = (save: boolean) => {
    setShowRepModal(false);
    if (save && editingRepCompanyId !== null) {
      handleRepSave(editingRepCompanyId, editingRepIds);
    } else {
      setEditingRepCompanyId(null);
    }
  };

  const thCls = 'px-3 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider cursor-pointer select-none hover:text-procare-dark-blue whitespace-nowrap relative';

  const ResizeHandle = ({ col }: { col: string }) => (
    <div onMouseDown={e => startResize(e, col)} style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: 4, cursor: 'col-resize', userSelect: 'none', zIndex: 10 }} className="hover:bg-procare-bright-blue opacity-0 hover:opacity-30" />
  );

  const activeFilterCount = (filterSFOwner ? 1 : 0) + (filterType ? 1 : 0) + (filterStatus ? 1 : 0) + (filterConfCounts.size > 0 ? 1 : 0) + (filterConference ? 1 : 0) + (filterICP ? 1 : 0) + (wseFilterActive ? 1 : 0) + (filterUpdatedWithin ? 1 : 0) + (filterHierarchy ? 1 : 0);

  return (
    <div>
      {/* Toolbar */}
      <div className="flex flex-wrap gap-3 mb-4">
        <div className="flex-1 min-w-[200px] relative">
          <svg className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search companies..." className="input-field pl-9" />
        </div>
        <button
          type="button"
          onClick={() => setFiltersOpen(o => !o)}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm font-medium transition-colors ${activeFilterCount > 0 ? 'border-procare-bright-blue text-procare-bright-blue bg-blue-50' : 'border-gray-200 text-gray-600 hover:border-gray-400'}`}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
          </svg>
          Filters
          {activeFilterCount > 0 && (
            <span className="bg-procare-bright-blue text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center leading-none">
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
          </>
        )}
        {selectedIds.size >= 2 && (
          <>
          <button onClick={() => setShowMergeModal(true)} className="btn-gold flex items-center gap-2 text-sm">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" /></svg>
            Merge ({selectedIds.size})
          </button>
          <button onClick={() => setShowParentChildModal(true)} className="btn-secondary flex items-center gap-2 text-sm">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg>
            Create Parent/Child Relationship
          </button>
          <button onClick={() => setShowOperatorCapitalModal(true)} className="btn-secondary flex items-center gap-2 text-sm">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" /></svg>
            Create Operator/Capital Relationship
          </button>
          </>
        )}
      </div>

      {/* Collapsible filter pane */}
      {filtersOpen && (
        <div className="mb-4 px-6 py-4 bg-gray-50 border border-gray-200 rounded-xl">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">SF Owner</p>
              <select value={filterSFOwner} onChange={e => setFilterSFOwner(e.target.value)} className="input-field w-full text-sm">
                <option value="">All SF Owners</option>
                {userOptionsFull.map(u => <option key={u.id} value={String(u.id)}>{u.value}</option>)}
              </select>
            </div>
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Type</p>
              <select value={filterType} onChange={e => setFilterType(e.target.value)} className="input-field w-full text-sm">
                <option value="">All Types</option>
                {companyTypeOptions.map(t => <option key={t} value={t}>{t}</option>)}
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
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">ICP</p>
              <select value={filterICP} onChange={e => setFilterICP(e.target.value)} className="input-field w-full text-sm">
                <option value="">All ICP</option>
                {icpOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
              </select>
            </div>
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Parent / Child</p>
              <select value={filterHierarchy} onChange={e => setFilterHierarchy(e.target.value)} className="input-field w-full text-sm">
                <option value="">All Companies</option>
                <option value="parent">Parent / Standalone</option>
                <option value="child">Child</option>
              </select>
            </div>
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5"># Conferences</p>
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowConfFilter(v => !v)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-left flex items-center justify-between gap-2 hover:border-procare-bright-blue transition-colors bg-white"
                >
                  <span>{filterConfCounts.size > 0 ? `${filterConfCounts.size} selected` : 'All counts...'}</span>
                  <svg className={`w-3 h-3 text-gray-400 flex-shrink-0 transition-transform ${showConfFilter ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                </button>
                {showConfFilter && (
                  <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-30 p-2 min-w-[140px]">
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
            </div>
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Conference</p>
              <select value={filterConference} onChange={e => setFilterConference(e.target.value)} className="input-field w-full text-sm">
                <option value="">All Conferences</option>
                {allConferenceNames.map(n => <option key={n} value={n}>{n}</option>)}
              </select>
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

          {/* WSE Range Slider */}
          {wseValues.length > 0 && (
            <>
              <style>{`
                .wse-range-thumb::-webkit-slider-thumb { -webkit-appearance: none; appearance: none; width: 16px; height: 16px; border-radius: 50%; background: white; border: 2px solid #1B76BC; box-shadow: 0 1px 3px rgba(0,0,0,0.2); cursor: pointer; pointer-events: all; }
                .wse-range-thumb::-moz-range-thumb { width: 16px; height: 16px; border-radius: 50%; background: white; border: 2px solid #1B76BC; box-shadow: 0 1px 3px rgba(0,0,0,0.2); cursor: pointer; pointer-events: all; border: none; }
                .wse-range-thumb::-webkit-slider-runnable-track { background: transparent; }
                .wse-range-thumb::-moz-range-track { background: transparent; }
              `}</style>
              <div className="mt-4 pt-4 border-t border-gray-200">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">WSE Range</p>
                  <div className="flex items-center gap-1.5 text-xs text-gray-600">
                    <span className="px-2 py-0.5 bg-white border border-gray-200 rounded font-medium">{effectiveWseMin.toLocaleString()}</span>
                    <span className="text-gray-400">–</span>
                    <span className="px-2 py-0.5 bg-white border border-gray-200 rounded font-medium">{effectiveWseMax.toLocaleString()}</span>
                    {wseFilterActive && (
                      <button type="button" onClick={() => { setWseMin(wseGlobalMin); setWseMax(wseGlobalMax); }} className="ml-1 text-gray-400 hover:text-red-500 transition-colors">
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                      </button>
                    )}
                  </div>
                </div>
                <div className="relative h-5 flex items-center">
                  <div className="absolute inset-x-0 h-1.5 bg-gray-200 rounded-full" />
                  <div
                    className="absolute h-1.5 bg-procare-bright-blue rounded-full pointer-events-none"
                    style={{
                      left: `${wseGlobalRange === 0 ? 0 : ((effectiveWseMin - wseGlobalMin) / wseGlobalRange) * 100}%`,
                      right: `${wseGlobalRange === 0 ? 0 : ((wseGlobalMax - effectiveWseMax) / wseGlobalRange) * 100}%`,
                    }}
                  />
                  <input
                    type="range"
                    min={wseGlobalMin} max={wseGlobalMax} step={wseStep}
                    value={effectiveWseMin}
                    onChange={e => setWseMin(Math.min(Number(e.target.value), effectiveWseMax))}
                    className="wse-range-thumb absolute inset-0 w-full appearance-none bg-transparent cursor-pointer pointer-events-none"
                    style={{ zIndex: effectiveWseMin >= effectiveWseMax - wseStep ? 5 : 3 }}
                  />
                  <input
                    type="range"
                    min={wseGlobalMin} max={wseGlobalMax} step={wseStep}
                    value={effectiveWseMax}
                    onChange={e => setWseMax(Math.max(Number(e.target.value), effectiveWseMin))}
                    className="wse-range-thumb absolute inset-0 w-full appearance-none bg-transparent cursor-pointer pointer-events-none"
                    style={{ zIndex: 4 }}
                  />
                </div>
                <div className="flex justify-between text-[10px] text-gray-400 mt-1">
                  <span>{wseGlobalMin.toLocaleString()}</span>
                  <span>{wseGlobalMax.toLocaleString()}</span>
                </div>
              </div>
            </>
          )}

          {activeFilterCount > 0 && (
            <div className="mt-3 flex justify-end">
              <button
                type="button"
                onClick={() => { setFilterSFOwner(''); setFilterType(''); setFilterStatus(''); setFilterICP(''); setFilterConfCounts(new Set()); setFilterConference(''); setFilterUpdatedWithin(''); setFilterHierarchy(''); setWseMin(wseGlobalMin); setWseMax(wseGlobalMax); }}
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
        <div className="mb-4 p-4 bg-blue-50 border border-procare-bright-blue rounded-xl">
          <p className="text-sm font-semibold text-procare-dark-blue mb-3">Edit fields for {selectedIds.size} selected company/companies:</p>
          <div className="flex flex-wrap gap-3 items-end">
            <div>
              <label className="label text-xs">Status</label>
              <select value={massEditFields.status || ''} onChange={e => setMassEditFields(p => ({ ...p, status: e.target.value }))} className="input-field w-40 text-sm">
                <option value="">— no change —</option>
                {statusOptions.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="label text-xs">Company Type</label>
              <select value={massEditFields.company_type || ''} onChange={e => setMassEditFields(p => ({ ...p, company_type: e.target.value }))} className="input-field w-48 text-sm">
                <option value="">— no change —</option>
                {companyTypeOptions.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="label text-xs">SF Owner(s)</label>
              <RepMultiSelect
                options={userOptionsFull}
                selectedIds={parseRepIds(massEditFields.assigned_user)}
                onChange={(ids) => setMassEditFields(p => ({ ...p, assigned_user: ids.join(',') }))}
                triggerClass="input-field w-48 text-sm flex items-center justify-between gap-2"
                placeholder="— no change —"
              />
            </div>
            <button onClick={handleMassEdit} disabled={isApplying} className="btn-primary text-sm">{isApplying ? 'Applying...' : `Apply to ${selectedIds.size}`}</button>
            <button onClick={() => setShowMassEdit(false)} className="btn-secondary text-sm">Cancel</button>
          </div>
        </div>
      )}

      <p className="text-xs text-gray-500 mb-3">Showing {filtered.length} of {localCompanies.length} companies{selectedIds.size > 0 && ` · ${selectedIds.size} selected`}</p>

      <div className="rounded-xl border border-gray-200 overflow-hidden">
        {/* Mobile card layout */}
        <div className="block lg:hidden divide-y divide-gray-100 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 18rem)' }}>
          {filtered.length === 0 ? (
            <div className="px-4 py-8 text-center text-gray-400 text-sm">No companies found.</div>
          ) : paginated.map(company => (
            <div key={company.id} className={`p-4 ${selectedIds.has(company.id) ? 'bg-blue-50' : 'bg-white'}`}>
              {/* Top row: name (left) | rep pills (upper-right) */}
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <input type="checkbox" checked={selectedIds.has(company.id)} onChange={() => toggleSelect(company.id)} className="accent-procare-bright-blue flex-shrink-0" />
                  <Link href={`/companies/${company.id}`} className="font-semibold text-procare-bright-blue hover:underline text-xs break-words whitespace-normal leading-snug">
                    {company.name}
                  </Link>
                  {company.parent_company_name && (
                    <span className="text-[10px] text-gray-400 ml-1">
                      (<Link href={`/companies/${company.parent_company_id}`} className="hover:text-procare-bright-blue">{company.parent_company_name}</Link>)
                    </span>
                  )}
                  {Number(company.pinned_notes_count) > 0 && (
                    <span title="Has pinned note" className="flex-shrink-0 inline-flex items-center justify-center w-4 h-4 rounded-full bg-amber-400 text-white">
                      <svg className="w-2.5 h-2.5" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M16 12V4h1V2H7v2h1v8l-2 2v2h5.2v6h1.6v-6H18v-2l-2-2z"/>
                      </svg>
                    </span>
                  )}
                </div>
                {/* Rep pills — upper right, tap to edit */}
                <button
                  type="button"
                  onClick={() => startEditRepModal(company)}
                  title="Tap to assign rep"
                  className="flex-shrink-0 inline-flex flex-wrap justify-end gap-1 hover:opacity-70 transition-opacity"
                >
                  {parseRepIds(company.assigned_user ?? '').map(id => userOptionsFull.find(u => u.id === id)).filter(Boolean).map((user, i) => (
                    <span key={i} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap ${getPreset(colorMaps.user?.[user!.value]).badgeClass}`}>
                      <svg className="w-3 h-3 opacity-70" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                      </svg>
                      {getRepInitials(user!.value)}
                    </span>
                  ))}
                  {!company.assigned_user && (
                    <span className="text-[10px] text-gray-300">+ Rep</span>
                  )}
                </button>
              </div>
              <div className="mt-2 ml-6 flex items-center flex-wrap gap-2">
                <span className="flex flex-wrap gap-1">{(company.status || '').split(',').map(s => s.trim()).filter(Boolean).map(s => <span key={s} className={getBadgeClass(s, colorMaps.status || {})}>{s}</span>)}</span>
                {company.company_type && <span className={`${getBadgeClass(company.company_type, colorMaps.company_type || {})} inline-flex items-center gap-1`}><EntityStructureIcon structure={company.entity_structure} />{company.company_type}</span>}
              </div>
              {/* Bottom row: stats (left) | WSE (bottom-right) */}
              <div className="mt-2 ml-6 flex items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-1.5 text-xs text-gray-500">
                    <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                    <AttendeeTooltip count={Number(company.attendee_count)} summary={company.attendee_summary} />
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-gray-500">
                    <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                    <ConferenceTooltip count={Number(company.conference_count)} names={company.conference_names} />
                  </div>
                </div>
                {/* WSE — bottom right */}
                {company.wse != null && (
                  <span className="flex-shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-yellow-50 text-yellow-700 border border-yellow-200">
                    <svg className="w-3 h-3 text-yellow-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M2 18h20M4 18v-3a8 8 0 0116 0v3M12 3v2M4.93 7.93l1.41 1.41M19.07 7.93l-1.41 1.41" /></svg>
                    {Number(company.wse).toLocaleString()}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Mobile rep selection bottom sheet */}
        {showRepModal && editingRepCompanyId !== null && (
          <div
            className="fixed inset-0 z-50 flex items-end lg:hidden"
            style={{ background: 'rgba(0,0,0,0.4)' }}
            onClick={() => closeRepModal(true)}
          >
            <div
              className="bg-white rounded-t-2xl shadow-2xl w-full flex flex-col"
              style={{ maxHeight: '70vh' }}
              onClick={e => e.stopPropagation()}
            >
              {/* Sheet header */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
                <h3 className="font-semibold text-sm text-procare-dark-blue">Assign Reps</h3>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => closeRepModal(false)}
                    className="text-xs text-gray-500 px-3 py-1.5 rounded-lg border border-gray-200"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => closeRepModal(true)}
                    className="text-xs font-semibold text-white bg-procare-bright-blue px-3 py-1.5 rounded-lg"
                  >
                    Done
                  </button>
                </div>
              </div>
              {/* Options list */}
              <div className="overflow-y-auto">
                <button
                  type="button"
                  onClick={() => setEditingRepIds([])}
                  className="w-full text-left px-4 py-3 text-sm text-gray-400 border-b border-gray-100 hover:bg-gray-50"
                >
                  — Clear all —
                </button>
                {userOptionsFull.map(u => (
                  <label
                    key={u.id}
                    className="flex items-center gap-3 px-4 py-3 border-b border-gray-100 cursor-pointer hover:bg-gray-50 active:bg-gray-100"
                  >
                    <input
                      type="checkbox"
                      checked={editingRepIds.includes(u.id)}
                      onChange={() => setEditingRepIds(prev =>
                        prev.includes(u.id) ? prev.filter(x => x !== u.id) : [...prev, u.id]
                      )}
                      className="w-5 h-5 accent-procare-bright-blue flex-shrink-0"
                    />
                    <span className="text-sm text-gray-700">{u.value}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Desktop table layout */}
        <div className="hidden lg:block overflow-auto" style={{ maxHeight: 'calc(100vh - 18rem)' }}>
          <table className="w-full text-sm" style={{ tableLayout: 'fixed' }}>
            <thead className="sticky top-0 z-10">
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="px-3 py-3 text-left w-10">
                  <input type="checkbox" checked={selectedIds.size === filtered.length && filtered.length > 0} onChange={e => { if (e.target.checked) setSelectedIds(new Set(filtered.map(c => c.id))); else setSelectedIds(new Set()); }} className="accent-procare-bright-blue" />
                </th>
                {isVisible('name') && <th className={thCls} style={{ width: colWidths.name }} onClick={() => handleSort('name')}>Company Name <SortIcon col="name" sortKey={sortKey} sortDir={sortDir} /><ResizeHandle col="name" /></th>}
                {isVisible('type') && <th className={thCls} style={{ width: colWidths.type }} onClick={() => handleSort('company_type')}>Type <SortIcon col="company_type" sortKey={sortKey} sortDir={sortDir} /><ResizeHandle col="type" /></th>}
                {isVisible('sfowner') && <th className="px-3 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider select-none relative" style={{ width: colWidths.sfowner }}>SF Owner<ResizeHandle col="sfowner" /></th>}
                {isVisible('status') && <th className={thCls} style={{ width: colWidths.status }} onClick={() => handleSort('status')}>Status <SortIcon col="status" sortKey={sortKey} sortDir={sortDir} /><ResizeHandle col="status" /></th>}
                {isVisible('attendees') && <th className={thCls} style={{ width: colWidths.attendees }} onClick={() => handleSort('attendee_count')}>Attendees <SortIcon col="attendee_count" sortKey={sortKey} sortDir={sortDir} /><ResizeHandle col="attendees" /></th>}
                {isVisible('conferences') && <th className={thCls} style={{ width: colWidths.conferences }} onClick={() => handleSort('conference_count')}>Conferences <SortIcon col="conference_count" sortKey={sortKey} sortDir={sortDir} /><ResizeHandle col="conferences" /></th>}
                {isVisible('wse') && <th className="px-3 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider" style={{ width: colWidths.actions }}>WSE&apos;s</th>}
                {isVisible('updated_on') && <th className="px-3 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider whitespace-nowrap relative" style={{ width: colWidths.updated_on }}>Updated On<ResizeHandle col="updated_on" /></th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.length === 0 ? (
                <tr><td colSpan={9} className="px-4 py-8 text-center text-gray-400 text-sm">No companies found.</td></tr>
              ) : paginated.map(company => (
                <tr key={company.id} className={`hover:bg-gray-50 transition-colors ${selectedIds.has(company.id) ? 'bg-blue-50' : ''}`}>
                  <td className="px-3 py-3"><input type="checkbox" checked={selectedIds.has(company.id)} onChange={() => toggleSelect(company.id)} className="accent-procare-bright-blue" /></td>
                  {isVisible('name') && <td className="px-3 py-3" style={{ maxWidth: colWidths.name }}>
                    <Link href={`/companies/${company.id}`} className="font-medium text-procare-bright-blue hover:underline text-sm break-words whitespace-normal leading-snug">
                      {company.name}
                    </Link>
                    {company.parent_company_name && (
                      <p className="text-[10px] text-gray-400 mt-0.5">
                        <Link href={`/companies/${company.parent_company_id}`} className="hover:text-procare-bright-blue">
                          {company.parent_company_name}
                        </Link>
                      </p>
                    )}
                  </td>}
                  {isVisible('type') && <td className="px-3 py-3">{company.company_type ? <span className={`${getBadgeClass(company.company_type, colorMaps.company_type || {})} inline-flex items-center gap-1`}><EntityStructureIcon structure={company.entity_structure} />{company.company_type}</span> : <span className="text-gray-300">—</span>}</td>}
                  {isVisible('sfowner') && <td className="px-3 py-3">
                    {editingRepCompanyId === company.id && !showRepModal ? (
                      <div className="flex items-start gap-1">
                        <div className="flex-1 min-w-0">
                          <RepMultiSelect
                            options={userOptionsFull}
                            selectedIds={editingRepIds}
                            onChange={setEditingRepIds}
                            onClose={(ids) => handleRepSave(company.id, ids)}
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => setEditingRepCompanyId(null)}
                          className="flex-shrink-0 p-1 text-gray-400 hover:text-gray-600 rounded transition-colors"
                          title="Cancel"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => startEditRep(company)}
                        title="Click to assign rep"
                        className="inline-flex flex-wrap gap-1 hover:opacity-70 transition-opacity text-left w-full"
                      >
                        {parseRepIds(company.assigned_user ?? '').map(id => userOptionsFull.find(u => u.id === id)).filter(Boolean).map((user, i) => (
                          <span key={i} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium whitespace-nowrap ${getPreset(colorMaps.user?.[user!.value]).badgeClass}`}>
                            <svg className="w-3 h-3 opacity-70" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                            </svg>
                            {getRepInitials(user!.value)}
                          </span>
                        ))}
                        {!company.assigned_user && (
                          <span className="text-[10px] text-gray-300 hover:text-gray-400 transition-colors">+ Rep</span>
                        )}
                      </button>
                    )}
                  </td>}
                  {isVisible('status') && <td className="px-3 py-3"><span className="flex flex-wrap gap-1">{(company.status || '').split(',').map(s => s.trim()).filter(Boolean).map(s => <span key={s} className={getBadgeClass(s, colorMaps.status || {})}>{s}</span>)}{!(company.status || '').trim() && <span className="text-gray-300">—</span>}</span></td>}
                  {isVisible('attendees') && <td className="px-3 py-3"><AttendeeTooltip count={Number(company.attendee_count)} summary={company.attendee_summary} /></td>}
                  {isVisible('conferences') && <td className="px-3 py-3"><ConferenceTooltip count={Number(company.conference_count)} names={company.conference_names} /></td>}
                  {isVisible('wse') && <td className="px-3 py-3">
                    {company.wse != null ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-yellow-50 text-yellow-700 border border-yellow-200">
                        <svg className="w-3 h-3 text-yellow-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M2 18h20M4 18v-3a8 8 0 0116 0v3M12 3v2M4.93 7.93l1.41 1.41M19.07 7.93l-1.41 1.41" /></svg>
                        {Number(company.wse).toLocaleString()}
                      </span>
                    ) : <span className="text-gray-300">—</span>}
                  </td>}
                  {isVisible('updated_on') && <td className="px-3 py-3 text-xs text-gray-500 whitespace-nowrap">{fmtDate(company.updated_at)}</td>}
                </tr>
              ))}
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
        items={selectedCompanies.map(c => ({ id: c.id, label: c.name, sublabel: [c.company_type, c.profit_type ? `(${c.profit_type})` : ''].filter(Boolean).join(' ') }))}
        title="Merge Companies" description="Select the master record. All attendees from duplicates will be reassigned to master. Duplicates will be deleted." />

      <ParentChildModal
        isOpen={showParentChildModal}
        onClose={() => setShowParentChildModal(false)}
        onSubmit={handleParentChild}
        items={selectedCompanies.map(c => ({ id: c.id, label: c.name, sublabel: [c.company_type, c.profit_type ? `(${c.profit_type})` : ''].filter(Boolean).join(' ') }))}
      />

      <OperatorCapitalModal
        isOpen={showOperatorCapitalModal}
        onClose={() => setShowOperatorCapitalModal(false)}
        onSubmit={handleOperatorCapital}
        items={selectedCompanies.map(c => ({ id: c.id, label: c.name, sublabel: [c.company_type, c.profit_type ? `(${c.profit_type})` : ''].filter(Boolean).join(' ') }))}
      />

      <InternalRelationshipModal
        isOpen={showRepRelModal}
        onClose={() => setShowRepRelModal(false)}
        onSuccess={() => { setSelectedIds(new Set()); onRefresh(); }}
        entityType="company"
        entityIds={Array.from(selectedIds)}
        entityNames={new Map(selectedCompanies.map(c => [c.id, c.name]))}
      />
    </div>
  );
}
