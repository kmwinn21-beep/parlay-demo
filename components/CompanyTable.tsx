'use client';

import React, { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { MergeModal } from './MergeModal';
import { ParentChildModal } from './ParentChildModal';
import { InternalRelationshipModal } from './InternalRelationshipsSection';
import { CompanyRelationshipsPopup } from './CompanyRelationshipsPopup';
import { useDrawerResize } from '@/lib/useDrawerResize';
import { ScrollRow } from '@/components/ScrollRow';
import { AddToConferenceModal } from './AddToConferenceModal';
import { useConfigColors } from '@/lib/useConfigColors';
import { useConfigOptions } from '@/lib/useConfigOptions';
import { resolveEntityDesignation } from '@/lib/entityStructureLabels';
import { getBadgeClass, getPreset, formatStatusLabel} from '@/lib/colors';
import { useUserOptions, parseRepIds, resolveRepInitials, getRepInitials } from '@/lib/useUserOptions';
import { INLINE_EDIT_FIELD_CLASS, InlineEditCancelButton, InlineEditRow, InlineEditPlaceholder } from '@/components/InlineEditField';
import { RepMultiSelect } from './RepMultiSelect';
import { MultiSelectDropdown } from './MultiSelectDropdown';
import { useTableColumnConfig, useCustomColumns } from '@/lib/useTableColumnConfig';
import { applyGroupingToHierarchyFilter, buildCompanyFamilies, compareCompanies, entriesToCompanies, type Family } from '@/lib/companyFamilies';
import { CustomColumnCell } from './CustomColumnCell';
import { useUnitTypeLabel } from '@/lib/useUnitTypeLabel';
import { MobileCard, MobileCardList } from '@/components/MobileCardList';
import { AttendeeTooltip, ConferenceTooltip } from '@/components/CountPills';
import { EntityStructureIcon } from '@/components/EntityStructureIcon';
import { CARD_TABLE, CARD_TABLE_HEAD, CARD_TABLE_SCROLL_X, CARD_TABLE_WRAP, cardEmphasisClass, cardGroupRowClass, cardRowClass, selectionColumnWidth, useCardFocus } from '@/components/tableCards';
import { useAvgCostPerUnit, formatValuePill } from '@/lib/useAvgCostPerUnit';
import { useUser } from './UserContext';
import { CompanyAttendeesDrawer, type CompanyAttendeeLite } from './CompanyAttendeesDrawer';
import { BulkAssignOutreachModal } from './BulkAssignOutreachModal';
import { BulkVendorRelationshipModal } from './BulkVendorRelationshipModal';
import { RowActionsKebab } from './RowActionsKebab';
import { useSectionConfig } from '@/lib/useSectionConfig';

interface Company {
  id: number;
  name: string;
  website?: string;
  profit_type?: string;
  company_type?: string;
  competitor_type?: string;
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
  relationship_count?: number;
  my_user_status_ids?: number[];
}

const COMPETITOR_TYPE_DEFS: Record<string, string> = {
  'Direct': 'Offers the same core product or service to the same buyer profile.',
  'Adjacent': 'Overlaps in one area but does not offer the full solution.',
  'Market alternative': 'Competes for the same buyer budget or decision-making attention.',
  'Emerging': 'A newer entrant moving into your space. Lower threat weight today but worth tracking.',
  'Unknown': 'Competitor type undetermined. Treated as Direct for scoring purposes.',
};

function CompetitorTypePill({ competitorType, badgeClass, children }: { competitorType?: string; badgeClass: string; children: React.ReactNode }) {
  const [pos, setPos] = useState<TooltipPos | null>(null);
  const ref = useRef<HTMLSpanElement>(null);
  const type = competitorType || 'Unknown';
  const def = COMPETITOR_TYPE_DEFS[type] ?? COMPETITOR_TYPE_DEFS['Unknown'];
  return (
    <span
      ref={ref}
      className={`${badgeClass} inline-flex items-center gap-1 cursor-default`}
      onMouseEnter={() => { if (ref.current) setPos(calcTooltipPos(ref.current)); }}
      onMouseLeave={() => setPos(null)}
    >
      {children}
      {pos && typeof window !== 'undefined' && (
        <span
          className="fixed z-50 bg-gray-900 text-white text-xs rounded-lg px-2.5 py-2 pointer-events-none shadow-lg"
          style={{ top: pos.above ? pos.top - 56 : pos.top, left: pos.left, width: pos.width, transform: pos.above ? 'translateY(-100%)' : undefined }}
        >
          <span className="block font-semibold">{type}</span>
          <span className="block text-gray-300 mt-0.5">{def}</span>
        </span>
      )}
    </span>
  );
}

type TooltipPos = { top: number; left: number; width: number; above: boolean };

function calcTooltipPos(el: HTMLElement, maxW = 260): TooltipPos {
  const rect = el.getBoundingClientRect();
  const w = Math.min(maxW, window.innerWidth - 16);
  const left = Math.max(8, Math.min(rect.left + rect.width / 2 - w / 2, window.innerWidth - w - 8));
  const above = rect.top > 180;
  return { top: above ? rect.top - 8 : rect.bottom + 8, left, width: w, above };
}

interface CompanyTableProps {
  companies: Company[];
  onRefresh: () => void;
  tableName?: string;
  rowAction?: (company: Company) => React.ReactNode;
  onDecoupleSelected?: (ids: Set<number>) => void;
  // When provided (Conference Details' Companies tab), the attendee-count pill
  // becomes clickable, opening a drawer of that company's attendees at this conference.
  conferenceAttendees?: CompanyAttendeeLite[];
  // e.g. "ModExpo 2026" — shown in the attendees drawer's header title.
  conferenceLabel?: string;
  // When provided (also Conference Details' Companies tab), enables the bulk
  // "Assign Outreach" action, scoped to this conference.
  conferenceId?: number;
}

/** Bulk-action button — a thin outline, no fill; colour is what varies. */
const BULK_BTN_BASE = 'flex-shrink-0 whitespace-nowrap flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-sm font-medium transition-colors hover:bg-gray-50';
const BULK_BTN = `${BULK_BTN_BASE} border-gray-200 text-gray-600 hover:text-brand-secondary hover:border-gray-300`;

type SortKey = 'name' | 'company_type' | 'status' | 'attendee_count' | 'conference_count';
type SortDir = 'asc' | 'desc';

const CONF_COUNT_OPTIONS = ['1', '2', '3', '4+'];
const PAGE_SIZE = 100;

/**
 * Whether the reader wants companies gathered into families. Global rather than
 * per-conference: it is a way of reading a list, not a fact about one
 * conference, and re-choosing it on every conference would be the annoyance.
 */
const GROUPED_STORAGE_KEY = 'parlay-conference-companies-grouped';

function SortIcon({ col, sortKey, sortDir }: { col: SortKey; sortKey: SortKey; sortDir: SortDir }) {
  if (col !== sortKey) return <svg className="w-3 h-3 ml-1 text-gray-300 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" /></svg>;
  return sortDir === 'asc'
    ? <svg className="w-3 h-3 ml-1 text-brand-secondary inline" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" /></svg>
    : <svg className="w-3 h-3 ml-1 text-brand-secondary inline" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>;
}

const DEFAULT_WIDTHS: Record<string, number> = { name: 220, type: 160, sfowner: 140, status: 140, attendees: 110, conferences: 120, actions: 110, updated_on: 110, value: 120 };

function fmtDate(dateStr?: string): string {
  if (!dateStr) return '—';
  try {
    const d = new Date(dateStr.endsWith('Z') || dateStr.includes('+') ? dateStr : dateStr + 'Z');
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch { return '—'; }
}

export function CompanyTable({ companies, onRefresh, tableName = 'companies', rowAction, onDecoupleSelected, conferenceAttendees, conferenceLabel, conferenceId }: CompanyTableProps) {
  const colorMaps = useConfigColors();
  const configOptions = useConfigOptions('company_table');
  /**
   * Entity Structure is registered against the company detail form, not this
   * table's, so it is read from the unscoped set. Used to name the two halves
   * of a family's attendee count in whatever words the account uses.
   */
  const entityStructureOptions = useConfigOptions().entity_structure;
  const parentLabel = resolveEntityDesignation(entityStructureOptions, 'Parent');
  const childLabel = resolveEntityDesignation(entityStructureOptions, 'Child');
  const unitTypeLabel = useUnitTypeLabel();
  const avgCostPerUnit = useAvgCostPerUnit();
  const userOptionsFull = useUserOptions();
  const { isVisible, orderedColumns } = useTableColumnConfig(tableName);
  const customColumns = useCustomColumns(tableName);

  const { panelStyle: qvPanelStyle, handleResizeStart: qvResizeStart } = useDrawerResize(480);

  // Local copy for optimistic updates — syncs whenever the parent re-fetches
  const [localCompanies, setLocalCompanies] = useState<Company[]>(companies);
  useEffect(() => { setLocalCompanies(companies); }, [companies]);

  // Map of status option id → value for all user-scoped status options
  const [userScopedStatusMap, setUserScopedStatusMap] = useState<Map<number, string>>(new Map());
  useEffect(() => {
    fetch('/api/config?category=status')
      .then(r => r.json())
      .then((opts: { id: number; value: string; scope: string | null }[]) => {
        const map = new Map<number, string>();
        opts.filter(o => o.scope === 'user').forEach(o => map.set(o.id, o.value));
        setUserScopedStatusMap(map);
      })
      .catch(() => {});
  }, []);

  const statusOptions = configOptions.status ?? [];
  const companyTypeOptions = configOptions.company_type ?? [];
  const servicesOptions = configOptions.services ?? [];
  const [search, setSearch] = useState('');
  // filterSFOwner stores a user ID (as string) for filtering, or '' for all
  const [filterSFOwner, setFilterSFOwner] = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  // Read initial ?status= filter from URL after mount (avoids useSearchParams hydration issue)
  useEffect(() => {
    const status = new URLSearchParams(window.location.search).get('status');
    if (status) setFilterStatus(status);
  }, []);
  const [filterConfCounts, setFilterConfCounts] = useState<Set<string>>(new Set());
  const [showConfFilter, setShowConfFilter] = useState(false);
  const [filterConference, setFilterConference] = useState('');
  const [filterICP, setFilterICP] = useState('');
  const icpOptions = configOptions.icp ?? [];

  // Quick-filter badges (between search bar and Filters button) — separate
  // from the advanced Filters pane's single-select dropdowns since these
  // support multi-select toggling.
  const [quickFilterIcp, setQuickFilterIcp] = useState(false);
  const [quickFilterTypes, setQuickFilterTypes] = useState<Set<string>>(new Set());
  const [icpCompanyTypeOptions, setIcpCompanyTypeOptions] = useState<string[]>([]);
  useEffect(() => {
    fetch('/api/admin/icp-rules', { cache: 'no-store' })
      .then(r => (r.ok ? r.json() : null))
      .then((data: { rules?: { category: string; conditions: { option_value: string }[] }[] } | null) => {
        const rule = data?.rules?.find(r => r.category === 'company_type');
        if (rule) setIcpCompanyTypeOptions(rule.conditions.map(c => c.option_value));
      })
      .catch(() => {});
  }, []);
  const quickFilterTypeButtons = useMemo(() => {
    const dynamicTypes = icpCompanyTypeOptions.filter(t => t !== 'Customer' && t !== 'Competitor');
    return [...dynamicTypes, 'Customer', 'Competitor'];
  }, [icpCompanyTypeOptions]);
  const toggleQuickFilterType = (type: string) => {
    setQuickFilterTypes(prev => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type); else next.add(type);
      return next;
    });
  };
  const { user: currentUser } = useUser();
  // The bulk button carries whatever this section is called in Section
  // Management, so the two never disagree about what's being added.
  const { getLabel: getCompanySectionLabel } = useSectionConfig('company');
  const vendorSectionLabel = getCompanySectionLabel('operator_capital');
  /**
   * Where the frozen Company Name column starts: the checkbox column plus any
   * visible columns ordered ahead of it. Columns are reorderable, so this is
   * derived rather than assumed — one with no configured width contributes its
   * rendered default.
   */
  const [quickFilterMyAccounts, setQuickFilterMyAccounts] = useState(false);
  const [filterUpdatedWithin, setFilterUpdatedWithin] = useState('');
  // 'parent' = no parent_company_id (standalone or explicit parent)
  // 'child'  = has parent_company_id set
  const [filterHierarchy, setFilterHierarchy] = useState('');
  /**
   * Gather the rows into the families they belong to.
   *
   * Conference-scoped only: on the standalone companies page a family is not
   * the unit anyone is reading, and the roll-ups would be account-wide rather
   * than "at this conference", which is the only reading that makes them mean
   * anything.
   */
  const [groupByParent, setGroupByParent] = useState(false);
  /**
   * What Parent/Child was set to before grouping took it away, so switching
   * back restores the reader's filter rather than silently dropping it.
   */
  const [stashedHierarchy, setStashedHierarchy] = useState<string | null>(null);
  /**
   * Families the reader has opened.
   *
   * Held as what is open rather than what is shut, so the default falls out of
   * an empty set: arriving in the grouped view you see the families, one line
   * each, and open the one you came for. Tracking the closed ones instead would
   * mean seeding the set with every key on the way in, and again whenever a
   * filter brought a new family into view.
   */
  const [expandedFamilies, setExpandedFamilies] = useState<Set<number>>(new Set());
  const [page, setPage] = useState(1);
  const [attendeesDrawerCompany, setAttendeesDrawerCompany] = useState<Company | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [showMergeModal, setShowMergeModal] = useState(false);
  const [quickViewId, setQuickViewId] = useState<number | null>(null);
  /**
   * The child whose row the reader came from, when the drawer was opened by
   * following a parent link. It only labels the header — the record itself is
   * the same one the full page shows.
   */
  const [quickViewParentOf, setQuickViewParentOf] = useState<string | null>(null);
  const openQuickView = useCallback((id: number, parentOf?: string) => {
    setQuickViewId(id);
    setQuickViewParentOf(parentOf ?? null);
  }, []);
  const [showParentChildModal, setShowParentChildModal] = useState(false);
  const [showRepRelModal, setShowRepRelModal] = useState(false);
  const [showBulkVendorRel, setShowBulkVendorRel] = useState(false);
  // The company row whose actions menu is open — the others recede so it's
  // obvious which record the menu is about.
  const [actionsCompanyId, setActionsCompanyId] = useState<number | null>(null);
  // The card the reader has picked out; every other one recedes behind it,
  // until it is clicked again or something outside the table is pressed.
  const { focusedId: focusedCompanyId, regionRef: companyTableRef, onCardClick: onCompanyCardClick } = useCardFocus();
  const [relPopupCompany, setRelPopupCompany] = useState<{ id: number; name: string } | null>(null);
  const [showAddToConf, setShowAddToConf] = useState(false);
  const [showBulkAssignOutreach, setShowBulkAssignOutreach] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [colWidths, setColWidths] = useState<Record<string, number>>(DEFAULT_WIDTHS);
  const COL_DEFAULT_WIDTH = 120;
  // Selection is a primary action on this table, so the checkboxes are always
  // there rather than appearing on hover.
  const selWidth = selectionColumnWidth(true);

  const companyNameStickyLeft = (() => {
    let left = selWidth;
    for (const col of orderedColumns) {
      if (col.key === 'name') break;
      if (!isVisible(col.key)) continue;
      left += colWidths[col.key] ?? COL_DEFAULT_WIDTH;
    }
    return left;
  })();
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [showMassEdit, setShowMassEdit] = useState(false);
  const [massEditFields, setMassEditFields] = useState<{ status?: string; company_type?: string; assigned_user?: string; services?: string[] }>({});
  const [isApplying, setIsApplying] = useState(false);
  const [editingRepCompanyId, setEditingRepCompanyId] = useState<number | null>(null);
  const [editingRepIds, setEditingRepIds] = useState<number[]>([]);
  const [showRepModal, setShowRepModal] = useState(false);
  const [editingCell, setEditingCell] = useState<{ companyId: number; field: 'company_type' | 'status' | 'wse' } | null>(null);
  const [cellDraft, setCellDraft] = useState<string>('');
  const [isSavingCell, setIsSavingCell] = useState(false);
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
  }, [search, filterSFOwner, filterType, filterStatus, filterConfCounts, filterConference, filterICP, filterUpdatedWithin, wseMin, wseMax, quickFilterIcp, quickFilterTypes, quickFilterMyAccounts, groupByParent]);

  // Read once on mount rather than in a lazy initialiser: this renders on the
  // server too, where localStorage does not exist.
  useEffect(() => {
    try {
      if (localStorage.getItem(GROUPED_STORAGE_KEY) === 'true') setGroupByParent(true);
    } catch { /* site data blocked */ }
  }, []);

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
      const matchStatus = !filterStatus || (() => {
        // Check if filterStatus is a user-scoped option — if so, match against my_user_status_ids
        const userScopedEntry = Array.from(userScopedStatusMap.entries()).find(([, v]) => v === filterStatus);
        if (userScopedEntry) {
          return (c.my_user_status_ids || []).includes(userScopedEntry[0]);
        }
        return (c.status || '').split(',').map(s => s.trim()).some(s => s === filterStatus);
      })();
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
      const matchQuickIcp = !quickFilterIcp || c.icp === 'Yes';
      const matchQuickTypes = quickFilterTypes.size === 0 || quickFilterTypes.has(c.company_type || '');
      const matchQuickMyAccounts = !quickFilterMyAccounts || (currentUser?.configId != null && parseRepIds(c.assigned_user).includes(currentUser.configId));
      return matchSearch && matchSFOwner && matchType && matchStatus && matchConf && matchConference && matchICP && matchWSE && matchUpdatedWithin && matchHierarchy && matchQuickIcp && matchQuickTypes && matchQuickMyAccounts;
    });
    // Same comparator the grouped view orders families and their members with,
    // so the two views agree about what "sorted by name" means.
    list.sort((a, b) => compareCompanies(a, b, sortKey, sortDir));
    return list;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [localCompanies, search, filterSFOwner, filterType, filterStatus, filterConfCounts, filterConference, filterICP, filterUpdatedWithin, filterHierarchy, wseFilterActive, effectiveWseMin, effectiveWseMax, sortKey, sortDir, userScopedStatusMap, quickFilterIcp, quickFilterTypes, quickFilterMyAccounts]);

  /**
   * Grouping is offered on a conference only. `grouped` is the one flag the
   * render reads — the stored preference is global, so a reader who turned it
   * on for one conference does not have to turn it on for the next.
   */
  const groupingOffered = conferenceId != null;
  const grouped = groupingOffered && groupByParent;

  const families = useMemo(
    () => buildCompanyFamilies(filtered, { sortKey, sortDir, parseRepIds }),
    [filtered, sortKey, sortDir],
  );

  /**
   * A page is 100 top-level entries rather than 100 companies, so a family
   * cannot be cut in half by a page boundary: you cannot split a list whose
   * elements are whole families. A page can therefore carry more than 100 rows,
   * which costs nothing at the sizes a conference actually reaches.
   */
  const pageUnitCount = grouped ? families.entries.length : filtered.length;
  const pagedEntries = useMemo(
    () => families.entries.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [families, page],
  );

  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  /** The companies this page shows, in the order it shows them. */
  const rowsToRender = grouped ? entriesToCompanies(pagedEntries) : paginated;

  const isFamilyCollapsed = (key: number) => !expandedFamilies.has(key);
  const toggleFamily = (key: number) => setExpandedFamilies(prev => {
    const next = new Set(prev);
    next.has(key) ? next.delete(key) : next.add(key);
    return next;
  });

  /**
   * Turning grouping on takes the Parent/Child filter away — the two answer the
   * same question, and every combination of them draws a family with its parent
   * or its children filtered out of it. The filter is put back on the way out.
   */
  const setGrouped = useCallback((next: boolean) => {
    setGroupByParent(next);
    try { localStorage.setItem(GROUPED_STORAGE_KEY, next ? 'true' : 'false'); } catch { /* site data blocked */ }
    // Every arrival in the grouped view starts from the families themselves,
    // not from wherever the last visit was left open.
    if (next) setExpandedFamilies(new Set());
    const hierarchy = applyGroupingToHierarchyFilter(next, { filterHierarchy, stashedHierarchy });
    setFilterHierarchy(hierarchy.filterHierarchy);
    setStashedHierarchy(hierarchy.stashedHierarchy);
  }, [filterHierarchy, stashedHierarchy]);

  const toggleSelect = (id: number) => setSelectedIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const selectedCompanies = localCompanies.filter(c => selectedIds.has(c.id));

  /**
   * The mobile card's contents, read-only, for the merge and parent/child
   * pickers. Two records worth merging often carry the very same name, so the
   * choice has to be made on everything else about them — rep, type, status,
   * counts, units.
   */
  const companySummary = (company: Company) => (
    <div className="min-w-0 flex-1">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-gray-800 leading-snug">{company.name}</p>
          {company.parent_company_name && (
            <p className="text-[10px] text-gray-400 mt-0.5">{company.parent_company_name}</p>
          )}
          {company.website && (
            <p className="text-[10px] text-gray-400 mt-0.5 truncate">{company.website}</p>
          )}
        </div>
        <span className="flex-shrink-0 inline-flex flex-wrap justify-end gap-1">
          {parseRepIds(company.assigned_user ?? '').map(id => userOptionsFull.find(u => u.id === id)).filter(Boolean).map((user, i) => (
            <span key={i} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap ${getPreset(colorMaps.user?.[user!.value]).badgeClass}`}>
              <svg className="w-3 h-3 opacity-70" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
              {getRepInitials(user!.value)}
            </span>
          ))}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-1.5 mt-2">
        {company.company_type && (
          <span className={`${getBadgeClass(company.company_type, colorMaps.company_type || {})} inline-flex items-center gap-1`}>
            <EntityStructureIcon structure={company.entity_structure} />{company.company_type}
          </span>
        )}
        {(company.status || '').split(',').map(s => s.trim()).filter(s => s && s !== 'Unknown').map(s => (
          <span key={s} className={getBadgeClass(s, colorMaps.status || {})}>{formatStatusLabel(s)}</span>
        ))}
        {(company.my_user_status_ids || []).map(optId => {
          const label = userScopedStatusMap.get(optId);
          return label ? <span key={optId} className={getBadgeClass(label, colorMaps.status || {})}>{formatStatusLabel(label)}</span> : null;
        })}
        <span className="inline-flex items-center gap-1 text-xs text-gray-500 whitespace-nowrap">
          <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
          {Number(company.attendee_count)}
        </span>
        <span className="inline-flex items-center gap-1 text-xs text-gray-500 whitespace-nowrap">
          <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
          {Number(company.conference_count)}
        </span>
        {Number(company.relationship_count) > 0 && (
          <span className="inline-flex items-center px-2 py-0.5 rounded-lg text-xs font-semibold bg-green-100 text-green-700">
            {Number(company.relationship_count)}
          </span>
        )}
        {company.wse != null && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-yellow-50 text-yellow-700 border border-yellow-200 whitespace-nowrap">
            <svg className="w-3 h-3 text-yellow-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M2 18h20M4 18v-3a8 8 0 0116 0v3M12 3v2M4.93 7.93l1.41 1.41M19.07 7.93l-1.41 1.41" /></svg>
            {Number(company.wse).toLocaleString()}
          </span>
        )}
        {(() => {
          const pill = formatValuePill(company.wse, avgCostPerUnit);
          return pill ? (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-700 border border-green-300 whitespace-nowrap">
              {pill}
            </span>
          ) : null;
        })()}
      </div>
      {company.conference_names && (
        <p className="text-[10px] text-gray-400 mt-1.5 truncate" title={company.conference_names}>{company.conference_names}</p>
      )}
    </div>
  );

  const mergePickerItems = selectedCompanies.map(c => ({
    id: c.id,
    label: c.name,
    sublabel: [c.company_type, c.profit_type ? `(${c.profit_type})` : ''].filter(Boolean).join(' '),
    detail: companySummary(c),
  }));

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
    const dupSet = new Set(duplicateIds);
    const snapshot = localCompanies;
    setLocalCompanies((cs) => cs.filter((c) => !dupSet.has(c.id)));
    try {
      const res = await fetch('/api/companies/merge', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ master_id: masterId, duplicate_ids: duplicateIds }) });
      if (!res.ok) { const err = await res.json(); throw new Error(err.error || 'Merge failed'); }
      toast.success('Companies merged!'); setSelectedIds(new Set()); onRefresh();
    } catch (e) {
      setLocalCompanies(snapshot);
      throw e;
    }
  };

  const handleParentChild = async (parentId: number, childIds: number[]) => {
    const res = await fetch('/api/companies/parent-child', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ parent_id: parentId, child_ids: childIds }) });
    if (!res.ok) { const err = await res.json(); throw new Error(err.error || 'Failed to create relationship'); }
    toast.success('Parent/Child relationship created!'); setSelectedIds(new Set()); onRefresh();
  };

  const handleMassEdit = async () => {
    const fields: Record<string, string | null> = {};
    if (massEditFields.status) fields.status = massEditFields.status;
    if (massEditFields.company_type) fields.company_type = massEditFields.company_type;
    if (massEditFields.assigned_user !== undefined) fields.assigned_user = massEditFields.assigned_user || null;
    if (massEditFields.services && massEditFields.services.length > 0) fields.services = massEditFields.services.join(',');
    if (Object.keys(fields).length === 0) { toast.error('Select at least one field to change.'); return; }
    setIsApplying(true);
    // Optimistic update — reflect changes immediately
    const snapshot = localCompanies;
    setLocalCompanies(prev => prev.map(c =>
      selectedIds.has(c.id) ? { ...c, ...fields } : c
    ));
    setShowMassEdit(false); setMassEditFields({});
    try {
      const res = await fetch('/api/companies/bulk', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids: Array.from(selectedIds), fields }) });
      if (!res.ok) throw new Error();
      toast.success(`Updated ${selectedIds.size} company/companies.`);
      onRefresh();
    } catch {
      toast.error('Failed to apply changes.');
      setLocalCompanies(snapshot);
    } finally { setIsApplying(false); }
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

  const startInlineEdit = (company: Company, field: 'company_type' | 'status' | 'wse') => {
    setEditingCell({ companyId: company.id, field });
    if (field === 'wse') {
      setCellDraft(company.wse != null ? String(company.wse) : '');
      return;
    }
    if (field === 'company_type') setCellDraft(company.company_type || '');
    else if (field === 'status') setCellDraft(company.status || '');
  };

  const saveInlineEdit = async (company: Company, field: 'company_type' | 'status' | 'wse') => {
    if (isSavingCell) return;
    const payload: Record<string, string | number | null> = {};
    if (field === 'wse') {
      const trimmed = cellDraft.trim();
      const parsed = trimmed === '' ? null : Number(trimmed);
      if (parsed != null && (!Number.isFinite(parsed) || parsed < 0)) { toast.error(`${unitTypeLabel} must be a non-negative number.`); return; }
      if ((company.wse ?? null) === (parsed == null ? null : Math.round(parsed))) { setEditingCell(null); return; }
      payload.wse = parsed == null ? null : Math.round(parsed);
    } else {
      const nextValue = cellDraft.trim();
      const currentValue =
        field === 'company_type' ? (company.company_type || '')
        : (company.status || '');
      if (nextValue === currentValue) { setEditingCell(null); return; }
      payload[field] = nextValue || null;
    }
    setIsSavingCell(true);
    try {
      const res = await fetch(`/api/companies/${company.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error();
      setLocalCompanies(prev => prev.map(c => {
        if (c.id !== company.id) return c;
        const updated: Company = { ...c };
        if (field === 'wse') updated.wse = payload.wse == null ? undefined : Number(payload.wse);
        else if (field === 'company_type') updated.company_type = payload[field] == null ? undefined : String(payload[field]);
        else if (field === 'status') updated.status = payload[field] == null ? undefined : String(payload[field]);
        return updated;
      }));
      setEditingCell(null);
      toast.success('Updated.');
    } catch {
      toast.error('Failed to update company.');
    } finally {
      setIsSavingCell(false);
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

  /**
   * Columns the desktop table renders. Kept as one expression so the empty-state
   * row and the section divider always span the same width.
   *
   * Note it omits 'value' — that is the expression as it already stood, left
   * alone rather than corrected here.
   */
  const tableColSpan = 1
    + (['name','type','sfowner','status','attendees','conferences','wse','updated_on','relationships'] as const).filter(k => isVisible(k)).length
    + customColumns.filter(c => c.visible).length
    + (rowAction ? 1 : 0)
    + (conferenceId != null ? 1 : 0);

  const thCls = 'px-3 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider cursor-pointer select-none hover:text-brand-primary whitespace-nowrap relative';

  const ResizeHandle = ({ col }: { col: string }) => (
    <div onMouseDown={e => startResize(e, col)} style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: 4, cursor: 'col-resize', userSelect: 'none', zIndex: 10 }} className="hover:bg-brand-secondary opacity-0 hover:opacity-30" />
  );

  const activeFilterCount = (filterSFOwner ? 1 : 0) + (filterType ? 1 : 0) + (filterStatus ? 1 : 0) + (filterConfCounts.size > 0 ? 1 : 0) + (filterConference ? 1 : 0) + (filterICP ? 1 : 0) + (wseFilterActive ? 1 : 0) + (filterUpdatedWithin ? 1 : 0) + (filterHierarchy ? 1 : 0);

  // With a filter on, the others recede so the active one reads at a glance.
  const anyQuickFilter = quickFilterIcp || quickFilterTypes.size > 0 || quickFilterMyAccounts;
  const quickDim = (active: boolean) => (anyQuickFilter && !active ? ' opacity-40 grayscale' : '');

  // Quick filters + the Filters toggle. Mobile keeps them on one
  // horizontally scrolling line; desktop lays them out inline.
  const filterButtons = (
    <>
      {/* Quick-filter badges — common one-click filters, multi-select */}
      {/* Mine first, in the Worth Engaging palette */}
      {currentUser && (
        <button
          type="button"
          onClick={() => setQuickFilterMyAccounts(v => !v)}
          className={`flex-shrink-0 whitespace-nowrap px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors border-brand-secondary bg-brand-secondary/10 text-brand-secondary${quickDim(quickFilterMyAccounts)}`}
        >
          My Accounts
        </button>
      )}
      <button
        type="button"
        onClick={() => setQuickFilterIcp(v => !v)}
        className={`flex-shrink-0 whitespace-nowrap px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
          quickFilterIcp
            ? 'border-brand-accent bg-brand-accent/20 text-brand-primary'
            : 'border-gray-200 bg-gray-50 text-gray-600 hover:border-gray-300'
        }${quickDim(quickFilterIcp)}`}
      >
        ICP
      </button>
      {quickFilterTypeButtons.map(type => (
        <button
          key={type}
          type="button"
          onClick={() => toggleQuickFilterType(type)}
          className={`flex-shrink-0 whitespace-nowrap px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
            quickFilterTypes.has(type)
              ? 'border-brand-accent bg-brand-accent/20 text-brand-primary'
              : 'border-gray-200 bg-gray-50 text-gray-600 hover:border-gray-300'
          }${quickDim(quickFilterTypes.has(type))}`}
        >
          {type === 'Customer' ? 'Customers' : type === 'Competitor' ? 'Competitors' : type}
        </button>
      ))}
      <button
        type="button"
        onClick={() => setFiltersOpen(o => !o)}
        className={`flex-shrink-0 whitespace-nowrap flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm font-medium transition-colors ${activeFilterCount > 0 ? 'border-brand-secondary text-brand-secondary bg-blue-50' : 'border-gray-200 text-gray-600 hover:border-gray-400'}`}
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
    </>
  );

  /**
   * One company, as a card row.
   *
   * Called directly when the table is flat and from inside a family when it
   * is grouped — the row itself is the same either way. `inFamily` only
   * suppresses what the group row above it already says: the parent name,
   * and the parent/child glyph in the type pill.
   */
  const renderCompanyRow = (company: Company, opts?: { inFamily?: boolean; isFamilyParent?: boolean }) => {
    const inFamily = !!opts?.inFamily;
    const isFamilyParent = !!opts?.isFamilyParent;
    const rowSelected = selectedIds.has(company.id);
    // Frozen cells need a background of their own — the row's
    // paints behind them, not through them — so the selected and
    // hover treatments are repeated here.
    // The card fill now comes from the row's cell styling, which
    // the frozen columns need as much as any other cell — they
    // paint over what scrolls beneath them.
    const frozenBg = '';
    const dimmed = actionsCompanyId != null && actionsCompanyId !== company.id;
    const focused = focusedCompanyId === company.id;
    return (
    <tr
      key={company.id}
      onClick={onCompanyCardClick(company.id)}
      /* Inside a family the rows draw in: half the vertical padding, so a run
         of them reads as belonging to the row above rather than as more rows
         beside it. The child selector outranks the py-3 on each cell without
         needing to shout about it. */
      className={`group ${cardRowClass(rowSelected, focused)} ${cardEmphasisClass({ focused, otherFocused: focusedCompanyId != null && !focused, dimmed })} ${inFamily ? '[&>td]:py-1.5' : ''}`}
      /* Only the rows inside a family, and only as they arrive: a family's rows
         exist just while it is open, so this runs on the open and not again
         while it stays open. */
      style={inFamily ? { animation: 'groupRowIn 200ms ease-out' } : undefined}
    >
      <td className="py-3 sticky left-0 z-10" style={{ width: selWidth }}><input type="checkbox" checked={selectedIds.has(company.id)} onChange={() => toggleSelect(company.id)} className="accent-brand-secondary ml-3" /></td>
      {orderedColumns.map(col => {
        if (!isVisible(col.key)) return null;
        switch (col.key) {
          case 'name': return <td key="name" className={`px-3 py-3 sticky z-10 ${frozenBg}`} style={{ maxWidth: colWidths.name, left: companyNameStickyLeft }}>
            {/* Under a family the name steps in behind an elbow, so the run
                reads as belonging to the row above it. */}
            <div className={inFamily ? 'relative pl-[22px]' : ''}>
            {inFamily && (
              <span
                aria-hidden="true"
                className="absolute left-[7px] top-0 h-[11px] w-[9px] border-l border-b border-gray-300 rounded-bl-[4px]"
              />
            )}
            {/* The name opens the details drawer, the way the
                phone's card already does — which leaves the eye
                icon that used to do it saying the same thing. */}
            <div className="flex items-center gap-1 text-left">
              <button
                type="button"
                onClick={() => openQuickView(company.id)}
                /* One step down from the parent's own row, which is itself a
                   step down from the family heading — three sizes for three
                   levels, so the run can be read without the elbows. */
                className={`font-medium text-brand-secondary hover:underline break-words whitespace-normal leading-snug text-left ${
                  inFamily && !isFamilyParent ? 'text-[13px]' : 'text-sm'
                }`}
              >
                {company.name}
              </button>
            </div>
            {/* The group row above already names the parent; repeating it on
                every child of that parent is noise. */}
            {!inFamily && company.parent_company_name && company.parent_company_id != null && (
              <p className="text-[10px] text-gray-400 mt-0.5">
                {/* Opens the parent in the same drawer rather than
                    leaving the table: the reader is comparing rows,
                    and a full page navigation loses their place. */}
                <button
                  type="button"
                  onClick={() => openQuickView(company.parent_company_id!, company.name)}
                  className="hover:text-brand-secondary hover:underline text-left"
                >
                  {company.parent_company_name}
                </button>
              </p>
            )}
            {/* The one exception to hiding the subtitle under a family: the
                parent's own row sits directly beneath a header of the same
                name, which without this reads as the same row drawn twice. */}
            {isFamilyParent && (
              <p className="mt-1">
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-gray-100 text-gray-600 border border-gray-300 whitespace-nowrap">
                  <EntityStructureIcon structure="Parent" />
                  Parent
                </span>
              </p>
            )}
            </div>
          </td>;
          case 'type': return <td key="type" className="px-3 py-3">
            {editingCell?.companyId === company.id && editingCell.field === 'company_type' ? (
              <InlineEditRow onCancel={() => setEditingCell(null)}>
                  <select
                    className={INLINE_EDIT_FIELD_CLASS}
                    value={cellDraft}
                    onChange={(e) => setCellDraft(e.target.value)}
                    onBlur={() => saveInlineEdit(company, 'company_type')}
                    onKeyDown={(e) => { if (e.key === 'Escape') setEditingCell(null); }}
                    autoFocus
                  >
                    <option value="">—</option>
                    {companyTypeOptions.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
              </InlineEditRow>
            ) : (
              <button type="button" onClick={() => startInlineEdit(company, 'company_type')} title="Click to set type">
                {company.company_type
                  ? <span className={`${getBadgeClass(company.company_type, colorMaps.company_type || {})} inline-flex items-center gap-1`}>
                      {/* The glyph says "this one is a child"; under a family
                          header that is the one thing already beyond doubt. */}
                      {!inFamily && <EntityStructureIcon structure={company.entity_structure} />}
                      {company.company_type}
                    </span>
                  : <InlineEditPlaceholder label="Type" />}
              </button>
            )}
          </td>;
          case 'sfowner': return <td key="sfowner" className="px-3 py-3">
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
                <InlineEditCancelButton onCancel={() => setEditingRepCompanyId(null)} />
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
          </td>;
          case 'status': return <td key="status" className="px-3 py-3">
            {editingCell?.companyId === company.id && editingCell.field === 'status' ? (
              <InlineEditRow onCancel={() => setEditingCell(null)}>
                  <select
                    className={INLINE_EDIT_FIELD_CLASS}
                    value={cellDraft}
                    onChange={(e) => setCellDraft(e.target.value)}
                    onBlur={() => saveInlineEdit(company, 'status')}
                    onKeyDown={(e) => { if (e.key === 'Escape') setEditingCell(null); }}
                    autoFocus
                  >
                    <option value="">—</option>
                    {statusOptions.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
              </InlineEditRow>
            ) : (
              <button type="button" onClick={() => startInlineEdit(company, 'status')} title="Click to set status">
                <span className="flex flex-wrap gap-1">
                  {(company.status || '').split(',').map(s => s.trim()).filter(s => s && s !== 'Unknown').map(s => <span key={s} className={getBadgeClass(s, colorMaps.status || {})}>{formatStatusLabel(s)}</span>)}
                  {(company.my_user_status_ids || []).map(optId => {
                    const label = userScopedStatusMap.get(optId);
                    return label ? <span key={optId} className={getBadgeClass(label, colorMaps.status || {})}>{formatStatusLabel(label)}</span> : null;
                  })}
                  {(company.status || '').split(',').map(s => s.trim()).filter(s => s && s !== 'Unknown').length === 0 && (company.my_user_status_ids || []).length === 0 && <InlineEditPlaceholder label="Status" />}
                </span>
              </button>
            )}
          </td>;
          case 'attendees': return <td key="attendees" className="px-3 py-3"><AttendeeTooltip count={Number(company.attendee_count)} summary={company.attendee_summary} onClick={conferenceAttendees ? () => setAttendeesDrawerCompany(company) : undefined} /></td>;
          case 'conferences': return <td key="conferences" className="px-3 py-3"><ConferenceTooltip count={Number(company.conference_count)} names={company.conference_names} /></td>;
          case 'wse': return <td key="wse" className="px-3 py-3">
            {editingCell?.companyId === company.id && editingCell.field === 'wse' ? (
              <InlineEditRow onCancel={() => setEditingCell(null)}>
                  <input
                    className={INLINE_EDIT_FIELD_CLASS}
                    value={cellDraft}
                    onChange={(e) => setCellDraft(e.target.value)}
                    onBlur={() => saveInlineEdit(company, 'wse')}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') saveInlineEdit(company, 'wse');
                      if (e.key === 'Escape') setEditingCell(null);
                    }}
                    autoFocus
                  />
              </InlineEditRow>
            ) : (
              <button type="button" onClick={() => startInlineEdit(company, 'wse')} title={`Click to set ${unitTypeLabel}`}>
                {company.wse != null ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-yellow-50 text-yellow-700 border border-yellow-200">
                    <svg className="w-3 h-3 text-yellow-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M2 18h20M4 18v-3a8 8 0 0116 0v3M12 3v2M4.93 7.93l1.41 1.41M19.07 7.93l-1.41 1.41" /></svg>
                    {Number(company.wse).toLocaleString()}
                  </span>
                ) : <InlineEditPlaceholder label={unitTypeLabel} />}
              </button>
            )}
          </td>;
          case 'value': return (
            <td key="value" className="px-3 py-3 overflow-hidden" style={{ maxWidth: colWidths.value }}>
              {(() => {
                const pill = formatValuePill(company.wse, avgCostPerUnit);
                return pill ? (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-700 border border-green-300 whitespace-nowrap">
                    {pill}
                  </span>
                ) : <span className="text-gray-300">—</span>;
              })()}
            </td>
          );
          case 'updated_on': return <td key="updated_on" className="px-3 py-3 text-xs text-gray-500 whitespace-nowrap">{fmtDate(company.updated_at)}</td>;
          case 'relationships': return (
            <td key="relationships" className="px-3 py-3">
              {Number(company.relationship_count) > 0 && (
                <button
                  type="button"
                  onClick={e => { e.preventDefault(); e.stopPropagation(); setRelPopupCompany({ id: company.id, name: company.name }); }}
                  title="View relationships"
                  className="inline-flex items-center px-2 py-0.5 rounded-lg text-xs font-semibold bg-green-100 text-green-700 hover:bg-green-200 transition-colors"
                >
                  {Number(company.relationship_count)}
                </button>
              )}
            </td>
          );
          default: return null;
        }
      })}
      {customColumns.filter(c => c.visible).map(col => (
        <td key={`custom_${col.id}`} className="px-3 py-3">
          <CustomColumnCell column={col} value={(company as unknown as Record<string, unknown>)[col.data_key]} />
        </td>
      ))}
      {rowAction && <td className="px-3 py-3">{rowAction(company)}</td>}
      {conferenceId != null && (
        <td className={`px-2 py-3 sticky right-0 z-10 ${frozenBg}`} style={{ width: 48 }}>
          <RowActionsKebab
            entityType="company"
            conferenceId={conferenceId}
            companyId={company.id}
            companyName={company.name}
            onDone={onRefresh}
            onOpenChange={open => setActionsCompanyId(open ? company.id : null)}
          />
        </td>
      )}
    </tr>
    );
  };

  /**
   * A family's own row: the parent, and what its companies at this conference
   * add up to.
   *
   * Deliberately no onClick — the pick-a-card behaviour belongs to companies,
   * and a group row that could be picked would both steal the pick from the
   * rows it heads and collide with them, since a family is keyed by a company
   * id. The chevron is a real button so it is reachable by keyboard.
   */
  const renderGroupRow = (family: Family<Company>) => {
    const collapsed = isFamilyCollapsed(family.key);
    const ids = family.all.map(c => c.id);
    const selectedCount = ids.filter(id => selectedIds.has(id)).length;
    const allSelected = selectedCount === ids.length && ids.length > 0;
    const someSelected = selectedCount > 0 && !allSelected;
    const reps = family.rollup.repIds
      .map(id => userOptionsFull.find(u => u.id === id))
      .filter(Boolean) as typeof userOptionsFull;
    const valuePill = formatValuePill(family.rollup.units, avgCostPerUnit);

    const toggleWholeFamily = () => setSelectedIds(prev => {
      const next = new Set(prev);
      if (allSelected) ids.forEach(id => next.delete(id));
      else ids.forEach(id => next.add(id));
      return next;
    });

    return (
      <tr key={`family-${family.key}`} className={cardGroupRowClass()}>
        <td className="py-3 sticky left-0 z-10" style={{ width: selWidth }}>
          <input
            type="checkbox"
            checked={allSelected}
            /* indeterminate is a DOM property with no attribute to set it
               from JSX, so it is written on the node itself. */
            ref={el => { if (el) el.indeterminate = someSelected; }}
            onChange={toggleWholeFamily}
            aria-label={`Select every company under ${family.parentName}`}
            className="accent-brand-secondary ml-3"
          />
        </td>
        {orderedColumns.map(col => {
          if (!isVisible(col.key)) return null;
          switch (col.key) {
            case 'name': return (
              <td key="name" className="px-3 py-3 sticky z-10" style={{ maxWidth: colWidths.name, left: companyNameStickyLeft }}>
                <div className="flex items-start gap-1.5">
                  <button
                    type="button"
                    onClick={() => toggleFamily(family.key)}
                    aria-expanded={!collapsed}
                    aria-label={`${collapsed ? 'Expand' : 'Collapse'} ${family.parentName}`}
                    className="flex-shrink-0 mt-0.5 p-0.5 -ml-0.5 rounded text-gray-400 hover:text-brand-primary transition-colors"
                  >
                    <svg className={`w-3.5 h-3.5 transition-transform ${collapsed ? '-rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                  <div className="min-w-0">
                    <p className="font-serif font-bold text-brand-primary text-[15px] leading-snug break-words">
                      {family.parentName}
                    </p>
                    {/* Where the people here came from, not how many company
                        records the family has. One figure could not say whether
                        anyone from the parent came at all. */}
                    <p className="text-[10px] font-semibold text-gray-500 mt-0.5">
                      {family.rollup.parentAttendees} {parentLabel} · {family.rollup.childAttendees} {childLabel} Attendees
                    </p>
                  </div>
                </div>
              </td>
            );
            case 'type': return (
              <td key="type" className="px-3 py-3">
                {family.parent?.company_type ? (
                  <span className={`${getBadgeClass(family.parent.company_type, colorMaps.company_type || {})} inline-flex items-center gap-1`}>
                    <EntityStructureIcon structure={family.parent.entity_structure} />
                    {family.parent.company_type}
                  </span>
                ) : !family.parent ? (
                  /* The family is real — its children point at this parent —
                     but the parent itself has nobody here, so it has no row of
                     its own and nothing to act on. */
                  <span className="inline-flex items-center px-2 py-0.5 rounded-lg border border-dashed border-gray-300 text-[10px] text-gray-400 whitespace-nowrap">
                    Not attending
                  </span>
                ) : null}
              </td>
            );
            case 'sfowner': return (
              <td key="sfowner" className="px-3 py-3">
                <span className="inline-flex flex-wrap gap-1">
                  {reps.slice(0, 2).map((user, i) => (
                    <span key={i} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium whitespace-nowrap ${getPreset(colorMaps.user?.[user.value]).badgeClass}`}>
                      <svg className="w-3 h-3 opacity-70" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                      </svg>
                      {getRepInitials(user.value)}
                    </span>
                  ))}
                  {reps.length > 2 && (
                    <span
                      title={reps.slice(2).map(u => u.value).join(', ')}
                      className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium whitespace-nowrap bg-gray-100 text-gray-600 border border-gray-300"
                    >
                      +{reps.length - 2}
                    </span>
                  )}
                </span>
              </td>
            );
            /* Status has nothing to roll up: a family does not have one. */
            case 'status': return <td key="status" className="px-3 py-3" />;
            case 'attendees': return (
              <td key="attendees" className="px-3 py-3">
                {/* The attendee badge at the family's weight. Written out
                    rather than reusing .badge-gray, whose font-medium would
                    otherwise have to be fought with !important. */}
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-gray-100 text-gray-700">
                  {family.rollup.attendees}
                </span>
              </td>
            );
            /* Conferences does not roll up either — each company has been to
               its own, and a sum of them would be a number of nothing. */
            case 'conferences': return <td key="conferences" className="px-3 py-3" />;
            case 'wse': return (
              <td key="wse" className="px-3 py-3">
                {family.rollup.units != null && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-yellow-50 text-yellow-700 border border-yellow-200">
                    <svg className="w-3 h-3 text-yellow-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M2 18h20M4 18v-3a8 8 0 0116 0v3M12 3v2M4.93 7.93l1.41 1.41M19.07 7.93l-1.41 1.41" /></svg>
                    {family.rollup.units.toLocaleString()}
                  </span>
                )}
              </td>
            );
            case 'value': return (
              <td key="value" className="px-3 py-3 overflow-hidden" style={{ maxWidth: colWidths.value }}>
                {/* Recomputed from the summed units — adding up the children's
                    formatted values would be adding up rounded strings. */}
                {valuePill && (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-green-100 text-green-700 border border-green-300 whitespace-nowrap">
                    {valuePill}
                  </span>
                )}
              </td>
            );
            /* One date for several companies would be a date for none. */
            case 'updated_on': return <td key="updated_on" className="px-3 py-3" />;
            case 'relationships': return (
              <td key="relationships" className="px-3 py-3">
                {family.rollup.relationships > 0 && family.parent && (
                  <button
                    type="button"
                    onClick={e => { e.preventDefault(); e.stopPropagation(); setRelPopupCompany({ id: family.parent!.id, name: family.parent!.name }); }}
                    title="View relationships"
                    className="inline-flex items-center px-2 py-0.5 rounded-lg text-xs font-bold bg-green-100 text-green-700 hover:bg-green-200 transition-colors"
                  >
                    {family.rollup.relationships}
                  </button>
                )}
              </td>
            );
            default: return null;
          }
        })}
        {customColumns.filter(c => c.visible).map(col => (
          <td key={`custom_${col.id}`} className="px-3 py-3" />
        ))}
        {rowAction && <td className="px-3 py-3" />}
        {conferenceId != null && (
          <td className="px-2 py-3 sticky right-0 z-10" style={{ width: 48 }}>
            {/* Every action behind the kebab is about a company record. With no
                parent row here there is no record to open one against. */}
            {family.parent && (
              <RowActionsKebab
                entityType="company"
                conferenceId={conferenceId}
                companyId={family.parent.id}
                companyName={family.parent.name}
                onDone={onRefresh}
                onOpenChange={open => setActionsCompanyId(open ? family.parent!.id : null)}
              />
            )}
          </td>
        )}
      </tr>
    );
  };

  /**
   * The page's rows when grouped: each family followed by its companies, then
   * everything that belongs to no family under a divider naming the section.
   */
  const renderGroupedRows = () => {
    const looseTotal = families.entries.length - families.familyCount;
    let dividerDrawn = false;
    return pagedEntries.map(entry => {
      if (entry.kind === 'family') {
        return (
          <React.Fragment key={`family-${entry.key}`}>
            {renderGroupRow(entry)}
            {!isFamilyCollapsed(entry.key) && entry.all.map(c => renderCompanyRow(c, {
              inFamily: true,
              isFamilyParent: c.id === entry.parent?.id,
            }))}
          </React.Fragment>
        );
      }
      const first = !dividerDrawn;
      dividerDrawn = true;
      return (
        <React.Fragment key={`loose-${entry.key}`}>
          {first && (
            <tr>
              <td colSpan={tableColSpan} className="pt-4 pb-1">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                  No parent company · {looseTotal}
                </span>
              </td>
            </tr>
          )}
          {renderCompanyRow(entry.company)}
        </React.Fragment>
      );
    });
  };

  /**
   * One company, as a card on a phone.
   *
   * The mobile twin of renderCompanyRow, and it takes the same two
   * suppressions for the same reason. Left as its own render rather than
   * merged with the desktop one: a card and a row share their pills and
   * nothing else.
   */
  const renderCompanyCard = (company: Company, opts?: { inFamily?: boolean; isFamilyParent?: boolean }) => {
    const inFamily = !!opts?.inFamily;
    const isFamilyParent = !!opts?.isFamilyParent;
    return (
    /* Under a family the card steps in and takes a rule down its left edge.
       An indent alone is easy to miss at this width — a card and a slightly
       narrower card are nearly the same object; the rule says the run belongs
       to the header above it. */
    <MobileCard
      key={company.id}
      className={inFamily ? 'ml-4 border-l-[3px] border-l-brand-primary/20' : ''}
      style={inFamily ? { animation: 'groupRowIn 200ms ease-out' } : undefined}
    >
    <div
      className={`px-4 py-4 transition-opacity ${selectedIds.has(company.id) ? 'bg-blue-50' : 'bg-white'} ${
        actionsCompanyId != null && actionsCompanyId !== company.id ? 'opacity-40' : ''
      }`}
    >
      {/* Row 1: name (left) | rep pills (upper-right) */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <input type="checkbox" checked={selectedIds.has(company.id)} onChange={() => toggleSelect(company.id)} className="accent-brand-secondary flex-shrink-0" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 flex-wrap">
              {/* The name opens the quick-view drawer; the icon that
                  used to do that is redundant on a phone. */}
              <button
                type="button"
                onClick={() => openQuickView(company.id)}
                className="font-semibold text-brand-secondary hover:underline text-sm leading-snug text-left"
              >
                {company.name}
              </button>
              {Number(company.pinned_notes_count) > 0 && (
                <span title="Has pinned note" className="flex-shrink-0 inline-flex items-center justify-center w-4 h-4 rounded-full bg-amber-400 text-white">
                  <svg className="w-2.5 h-2.5" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M16 12V4h1V2H7v2h1v8l-2 2v2h5.2v6h1.6v-6H18v-2l-2-2z"/>
                  </svg>
                </span>
              )}
            </div>
            {/* The header card above already names the parent. */}
            {!inFamily && company.parent_company_name && company.parent_company_id != null && (
              <p className="text-[10px] text-gray-400 mt-0.5">
                <button
                  type="button"
                  onClick={() => openQuickView(company.parent_company_id!, company.name)}
                  className="hover:text-brand-secondary hover:underline text-left"
                >
                  {company.parent_company_name}
                </button>
              </p>
            )}
            {/* Except on the parent's own card, which without this reads as
                the header card drawn twice. */}
            {isFamilyParent && (
              <p className="mt-1">
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-gray-100 text-gray-600 border border-gray-300 whitespace-nowrap">
                  <EntityStructureIcon structure="Parent" />
                  Parent
                </span>
              </p>
            )}
          </div>
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
      {/* Rows 2-4 ride one scrolling line, company type first. The
          actions menu sits at the end of that line and stays put — the
          pills pass behind it rather than pushing it off the edge. */}
      <div className="mt-2 ml-6 flex items-center gap-2">
      <ScrollRow className="flex-1 min-w-0" gapClass="gap-2">
        {company.company_type && (
          <span className="flex-shrink-0 whitespace-nowrap">
            {/* The glyph says "this one is a child" — under a family header
                that is the one thing already beyond doubt. */}
            {company.company_type === 'Competitor'
              ? <CompetitorTypePill competitorType={company.competitor_type} badgeClass={getBadgeClass(company.company_type, colorMaps.company_type || {})}>{!inFamily && <EntityStructureIcon structure={company.entity_structure} />}{company.company_type}</CompetitorTypePill>
              : <span className={`${getBadgeClass(company.company_type, colorMaps.company_type || {})} inline-flex items-center gap-1`}>{!inFamily && <EntityStructureIcon structure={company.entity_structure} />}{company.company_type}</span>
            }
          </span>
        )}
        {(company.status || '').split(',').map(s => s.trim()).filter(s => s && s !== 'Unknown').map(s => (
          <span key={s} className={`${getBadgeClass(s, colorMaps.status || {})} flex-shrink-0 whitespace-nowrap`}>{formatStatusLabel(s)}</span>
        ))}
        {(company.my_user_status_ids || []).map(optId => {
          const label = userScopedStatusMap.get(optId);
          return label ? <span key={optId} className={`${getBadgeClass(label, colorMaps.status || {})} flex-shrink-0 whitespace-nowrap`}>{formatStatusLabel(label)}</span> : null;
        })}
        <span className="inline-flex items-center gap-1 text-xs text-gray-500 flex-shrink-0 whitespace-nowrap">
          <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
          <AttendeeTooltip count={Number(company.attendee_count)} summary={company.attendee_summary} onClick={conferenceAttendees ? () => setAttendeesDrawerCompany(company) : undefined} disableTooltip />
        </span>
        <span className="inline-flex items-center gap-1 text-xs text-gray-500 flex-shrink-0 whitespace-nowrap">
          <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
          <ConferenceTooltip count={Number(company.conference_count)} names={company.conference_names} />
        </span>
        {Number(company.relationship_count) > 0 && (
          <button
            type="button"
            onClick={e => { e.preventDefault(); e.stopPropagation(); setRelPopupCompany({ id: company.id, name: company.name }); }}
            title="View relationships"
            className="flex-shrink-0 inline-flex items-center px-2 py-0.5 rounded-lg text-xs font-semibold bg-green-100 text-green-700 hover:bg-green-200 transition-colors"
          >
            {Number(company.relationship_count)}
          </button>
        )}
        {company.wse != null && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-yellow-50 text-yellow-700 border border-yellow-200 flex-shrink-0 whitespace-nowrap">
            <svg className="w-3 h-3 text-yellow-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M2 18h20M4 18v-3a8 8 0 0116 0v3M12 3v2M4.93 7.93l1.41 1.41M19.07 7.93l-1.41 1.41" /></svg>
            {Number(company.wse).toLocaleString()}
          </span>
        )}
        {(() => {
          const pill = formatValuePill(company.wse, avgCostPerUnit);
          return pill ? (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-700 border border-green-300 whitespace-nowrap flex-shrink-0">
              {pill}
            </span>
          ) : null;
        })()}
      </ScrollRow>
      {conferenceId != null && (
        <div className="flex-shrink-0">
          <RowActionsKebab
            entityType="company"
            conferenceId={conferenceId}
            companyId={company.id}
            companyName={company.name}
            onDone={onRefresh}
            onOpenChange={open => setActionsCompanyId(open ? company.id : null)}
          />
        </div>
      )}
      </div>
    </div>
    </MobileCard>
    );
  };

  /**
   * A family's header card on a phone.
   *
   * The whole card is the collapse control — at this width a chevron alone is a
   * small target, and there is nothing else on the card to tap. The chevron
   * stays as the thing that says which way it will go.
   */
  const renderGroupCard = (family: Family<Company>) => {
    const collapsed = isFamilyCollapsed(family.key);
    const ids = family.all.map(c => c.id);
    const selectedCount = ids.filter(id => selectedIds.has(id)).length;
    const allSelected = selectedCount === ids.length && ids.length > 0;
    const someSelected = selectedCount > 0 && !allSelected;
    const valuePill = formatValuePill(family.rollup.units, avgCostPerUnit);

    return (
      <MobileCard key={`family-${family.key}`} className="border-gray-300">
        <div className="px-4 py-3 bg-brand-primary/[0.055]">
          <div className="flex items-start gap-2">
            <input
              type="checkbox"
              checked={allSelected}
              ref={el => { if (el) el.indeterminate = someSelected; }}
              onChange={() => setSelectedIds(prev => {
                const next = new Set(prev);
                if (allSelected) ids.forEach(id => next.delete(id));
                else ids.forEach(id => next.add(id));
                return next;
              })}
              onClick={e => e.stopPropagation()}
              aria-label={`Select every company under ${family.parentName}`}
              className="accent-brand-secondary flex-shrink-0 mt-1"
            />
            <button
              type="button"
              onClick={() => toggleFamily(family.key)}
              aria-expanded={!collapsed}
              className="flex items-start gap-2 min-w-0 flex-1 text-left"
            >
              <svg className={`w-3.5 h-3.5 flex-shrink-0 mt-1 text-gray-400 transition-transform ${collapsed ? '-rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
              <span className="min-w-0">
                <span className="block font-serif font-bold text-brand-primary text-[15px] leading-snug break-words">
                  {family.parentName}
                </span>
                <span className="block text-[10px] font-semibold text-gray-500 mt-0.5">
                  {family.rollup.parentAttendees} {parentLabel} · {family.rollup.childAttendees} {childLabel} Attendees
                </span>
              </span>
            </button>
          </div>

          {/* The roll-ups, on the line the cards use for their own pills.
              The attendee total is not among them: the line above already
              gives it, split by who it came from, and an unlabelled number
              beside a type pill said less than the sentence does. Skipped
              entirely when nothing is left to put on it. */}
          {(family.parent?.company_type || !family.parent || family.rollup.units != null || valuePill) && (
          <div className="mt-2 ml-6 flex items-center gap-2 flex-wrap">
            {family.parent?.company_type ? (
              <span className={`${getBadgeClass(family.parent.company_type, colorMaps.company_type || {})} inline-flex items-center gap-1 flex-shrink-0`}>
                <EntityStructureIcon structure={family.parent.entity_structure} />
                {family.parent.company_type}
              </span>
            ) : !family.parent ? (
              <span className="inline-flex items-center px-2 py-0.5 rounded-lg border border-dashed border-gray-300 text-[10px] text-gray-400 whitespace-nowrap flex-shrink-0">
                Not attending
              </span>
            ) : null}
            {family.rollup.units != null && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-yellow-50 text-yellow-700 border border-yellow-200 flex-shrink-0">
                <svg className="w-3 h-3 text-yellow-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M2 18h20M4 18v-3a8 8 0 0116 0v3M12 3v2M4.93 7.93l1.41 1.41M19.07 7.93l-1.41 1.41" /></svg>
                {family.rollup.units.toLocaleString()}
              </span>
            )}
            {valuePill && (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-green-100 text-green-700 border border-green-300 whitespace-nowrap flex-shrink-0">
                {valuePill}
              </span>
            )}
          </div>
          )}
        </div>
      </MobileCard>
    );
  };

  /** The phone's list when grouped: each family, its cards, then the rest. */
  const renderGroupedCards = () => {
    const looseTotal = families.entries.length - families.familyCount;
    let dividerDrawn = false;
    return pagedEntries.map(entry => {
      if (entry.kind === 'family') {
        return (
          <React.Fragment key={`family-${entry.key}`}>
            {renderGroupCard(entry)}
            {!isFamilyCollapsed(entry.key) && entry.all.map(c => renderCompanyCard(c, {
              inFamily: true,
              isFamilyParent: c.id === entry.parent?.id,
            }))}
          </React.Fragment>
        );
      }
      const first = !dividerDrawn;
      dividerDrawn = true;
      return (
        <React.Fragment key={`loose-${entry.key}`}>
          {first && (
            <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 pt-3 pb-1 px-1">
              No parent company · {looseTotal}
            </p>
          )}
          {renderCompanyCard(entry.company)}
        </React.Fragment>
      );
    });
  };

  return (
    <div>
      {/* Toolbar */}
      <div className="flex flex-wrap gap-3 mb-4">
        <div className="flex-1 min-w-[200px] relative">
          <svg className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search companies..." className="input-field pl-9" />
        </div>

        {/* Mobile: one scrolling line. Desktop: inline in the toolbar. */}
        <ScrollRow className="w-full lg:hidden" gapClass="gap-2">{filterButtons}</ScrollRow>
        <div className="hidden lg:contents">{filterButtons}</div>

      </div>

      {/* Bulk actions — one line under the toolbar, chevrons rather than a
          scrollbar. Borderless so nine actions read as a menu of verbs
          instead of nine competing buttons; colour still carries the two
          destructive ones. */}
      {selectedIds.size >= 1 && (
        <div className="mb-4">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Bulk Actions</p>
          <ScrollRow gapClass="gap-1" step={200}>
            <button onClick={() => { setShowMassEdit(v => !v); setMassEditFields({}); }} className={BULK_BTN}>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
              Edit Fields ({selectedIds.size})
            </button>
            <button onClick={() => setShowMergeModal(true)} className={BULK_BTN}>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" /></svg>
              Merge ({selectedIds.size})
            </button>
            {conferenceId != null && (
              <button onClick={() => setShowBulkAssignOutreach(true)} className={BULK_BTN}>
                + Assign Outreach ({selectedIds.size})
              </button>
            )}
            <button onClick={() => setShowRepRelModal(true)} className={BULK_BTN}>
              + Rep Relationship
            </button>
            {selectedIds.size >= 2 && (
              <button onClick={() => setShowParentChildModal(true)} className={BULK_BTN}>
                + Parent/Child Relationship
              </button>
            )}
            <button onClick={() => setShowAddToConf(true)} className={BULK_BTN}>
              + to Conference
            </button>
            <button onClick={() => setShowBulkVendorRel(true)} className={BULK_BTN}>
              + {vendorSectionLabel}
            </button>
            {onDecoupleSelected && (
              <button
                onClick={() => { onDecoupleSelected(selectedIds); setSelectedIds(new Set()); }}
                className={`${BULK_BTN_BASE} border-amber-200 text-amber-700 hover:text-amber-800 hover:border-amber-300`}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                </svg>
                Decouple ({selectedIds.size})
              </button>
            )}
            <button onClick={handleDeleteSelected} className={`${BULK_BTN_BASE} border-red-200 text-red-600 hover:text-red-700 hover:border-red-300`}>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
              Delete ({selectedIds.size})
            </button>
          </ScrollRow>
        </div>
      )}

      {/* Collapsible filter pane */}
      {filtersOpen && (
        <div className="mb-4 px-6 py-4 bg-gray-50 border border-gray-200 rounded-xl">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
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
            {/* Grouping answers this question already, and any setting of it
                would draw a family with its own parent or its own children
                filtered out. Hidden rather than disabled: a disabled select
                still reading "Child" looks like a filter that is applied. The
                value is put back when the reader returns to the flat view. */}
            {!grouped && (
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Parent / Child</p>
              <select value={filterHierarchy} onChange={e => setFilterHierarchy(e.target.value)} className="input-field w-full text-sm">
                <option value="">All Companies</option>
                <option value="parent">Parent / Standalone</option>
                <option value="child">Child</option>
              </select>
            </div>
            )}
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
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{unitTypeLabel} Range</p>
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
                    className="absolute h-1.5 bg-brand-secondary rounded-full pointer-events-none"
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
        <div className="mb-4 p-4 bg-blue-50 border border-brand-secondary rounded-xl">
          <p className="text-sm font-semibold text-brand-primary mb-3">Edit fields for {selectedIds.size} selected company/companies:</p>
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
            <div className="w-56">
              <MultiSelectDropdown
                label="Services"
                options={servicesOptions}
                values={massEditFields.services ?? []}
                onChange={(values) => setMassEditFields(p => ({ ...p, services: values }))}
                placeholder="— no change —"
                emptyMessage="No services configured. Add options in the Admin panel."
              />
            </div>
            <button onClick={handleMassEdit} disabled={isApplying} className="btn-primary text-sm">{isApplying ? 'Applying...' : `Apply to ${selectedIds.size}`}</button>
            <button onClick={() => setShowMassEdit(false)} className="btn-secondary text-sm">Cancel</button>
          </div>
        </div>
      )}

      {/* The count and the control that changes it, on one line. */}
      <div className="flex items-center justify-between gap-3 mb-3">
        {/* Companies stay the unit here — it is what anyone counting is
            counting. The pager below counts entries, so the family count is
            named alongside rather than left to be inferred from two numbers
            that disagree. On a phone the sentence drops to its figures: the
            column it heads says what is being counted. */}
        <p className="text-xs text-gray-500 min-w-0">
          <span className="hidden sm:inline">Showing </span>
          {filtered.length} of {localCompanies.length}
          <span className="hidden sm:inline"> companies</span>
          {grouped && families.familyCount > 0 && ` · ${families.familyCount} ${families.familyCount === 1 ? 'family' : 'families'}`}
          {selectedIds.size > 0 && ` · ${selectedIds.size} selected`}
        </p>

        {/* Offered only where it would do something: a conference whose
            companies form no family has nothing to group. Kept on screen while
            grouped even if a filter leaves no family standing, so the way back
            to the single view cannot disappear from under the reader. */}
        {groupingOffered && (families.familyCount > 0 || grouped) && (
          <div className="inline-flex flex-shrink-0 rounded-lg border border-gray-200 overflow-hidden">
            {([
              { key: 'flat' as const, label: 'Single', path: 'M4 6h16M4 12h16M4 18h16' },
              { key: 'grouped' as const, label: 'Grouped', path: 'M3 7h18M7 12h14M11 17h10' },
            ]).map((opt, i) => (
              <button
                key={opt.key}
                type="button"
                onClick={() => setGrouped(opt.key === 'grouped')}
                title={opt.key === 'grouped' ? 'Group companies by parent company' : 'One row per company'}
                aria-pressed={grouped === (opt.key === 'grouped')}
                className={`flex-shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium whitespace-nowrap transition-colors ${i > 0 ? 'border-l border-gray-200' : ''} ${
                  grouped === (opt.key === 'grouped') ? 'bg-brand-secondary text-white' : 'bg-white text-gray-500 hover:bg-gray-50'
                }`}
              >
                <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={opt.path} />
                </svg>
                {opt.label}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="lg:rounded-xl lg:border lg:border-gray-200 lg:overflow-hidden">
        {/* Mobile card layout */}
        {/* Bled to the card's edge so the margin either side of a card is the
            same 8px that sits between them. */}
        <div className="block lg:hidden -mx-6">
          {filtered.length === 0 ? (
            <div className="px-4 py-8 text-center text-gray-400 text-sm">No companies found.</div>
          ) : <MobileCardList>{grouped ? renderGroupedCards() : rowsToRender.map(company => renderCompanyCard(company))}</MobileCardList>}
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
                <h3 className="font-semibold text-sm text-brand-primary">Assign Reps</h3>
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
                    className="text-xs font-semibold text-white bg-brand-secondary px-3 py-1.5 rounded-lg"
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
                      className="w-5 h-5 accent-brand-secondary flex-shrink-0"
                    />
                    <span className="text-sm text-gray-700">{u.value}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Desktop table layout */}
        <div ref={companyTableRef} className={`hidden lg:block ${CARD_TABLE_WRAP}`}>
        {/* Grows with the page instead of scrolling inside a capped height, so
            there is no scrollbar down the side of the table. The header row
            goes with it: there is no longer an inner viewport for it to stick
            within, and sticking it to the page would collide with the tab bar
            that is already pinned there. */}
        <div className={CARD_TABLE_SCROLL_X}>
          <table className={`w-full text-sm ${CARD_TABLE}`} style={{ tableLayout: 'fixed' }}>
            <thead className={CARD_TABLE_HEAD}>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="py-3 text-left sticky left-0 z-30 bg-gray-50" style={{ width: selWidth }}>
                  <input type="checkbox" checked={selectedIds.size === filtered.length && filtered.length > 0} onChange={e => { if (e.target.checked) setSelectedIds(new Set(filtered.map(c => c.id))); else setSelectedIds(new Set()); }} className="accent-brand-secondary ml-3" />
                </th>
                {orderedColumns.map(col => {
                  if (!isVisible(col.key)) return null;
                  switch (col.key) {
                    case 'name': return <th key="name" className={`${thCls} sticky z-30 bg-gray-50`} style={{ width: colWidths.name, left: companyNameStickyLeft }} onClick={() => handleSort('name')}>Company Name <SortIcon col="name" sortKey={sortKey} sortDir={sortDir} /><ResizeHandle col="name" /></th>;
                    case 'type': return <th key="type" className={thCls} style={{ width: colWidths.type }} onClick={() => handleSort('company_type')}>Type <SortIcon col="company_type" sortKey={sortKey} sortDir={sortDir} /><ResizeHandle col="type" /></th>;
                    case 'sfowner': return <th key="sfowner" className="px-3 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider select-none relative" style={{ width: colWidths.sfowner }}>SF Owner<ResizeHandle col="sfowner" /></th>;
                    case 'status': return <th key="status" className={thCls} style={{ width: colWidths.status }} onClick={() => handleSort('status')}>Status <SortIcon col="status" sortKey={sortKey} sortDir={sortDir} /><ResizeHandle col="status" /></th>;
                    case 'attendees': return <th key="attendees" className={thCls} style={{ width: colWidths.attendees }} onClick={() => handleSort('attendee_count')}>Attendees <SortIcon col="attendee_count" sortKey={sortKey} sortDir={sortDir} /><ResizeHandle col="attendees" /></th>;
                    case 'conferences': return <th key="conferences" className={thCls} style={{ width: colWidths.conferences }} onClick={() => handleSort('conference_count')}>Conferences <SortIcon col="conference_count" sortKey={sortKey} sortDir={sortDir} /><ResizeHandle col="conferences" /></th>;
                    case 'wse': return <th key="wse" className="px-3 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider" style={{ width: colWidths.actions }}>{unitTypeLabel}&apos;s</th>;
                    case 'value': return <th key="value" className="px-3 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider whitespace-nowrap relative" style={{ width: colWidths.value }}>Value<ResizeHandle col="value" /></th>;
                    case 'updated_on': return <th key="updated_on" className="px-3 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider whitespace-nowrap relative" style={{ width: colWidths.updated_on }}>Updated On<ResizeHandle col="updated_on" /></th>;
                    case 'relationships': return <th key="relationships" className="px-3 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider w-24">Relationships</th>;
                    default: return null;
                  }
                })}
                {customColumns.filter(c => c.visible).map(col => (
                  <th key={`custom_${col.id}`} className="px-3 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider whitespace-nowrap" style={{ minWidth: 120 }}>
                    {col.label}
                  </th>
                ))}
                {rowAction && <th className="px-3 py-3 w-20" />}
                {/* Actions pin to the right edge: the menu is reachable at any
                    scroll position, and the columns pass under it. */}
                {conferenceId != null && <th className="px-2 py-3 sticky right-0 z-30 bg-gray-50" style={{ width: 48 }} aria-label="Actions" />}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={tableColSpan} className="px-4 py-8 text-center text-gray-400 text-sm">No companies found.</td></tr>
              ) : grouped ? renderGroupedRows() : rowsToRender.map(company => renderCompanyRow(company))}
            </tbody>
          </table>
        </div>
        </div>
      </div>

      {/* Paged in whatever the current view's top-level unit is: companies when
          flat, families-and-leftovers when grouped. */}
      {pageUnitCount > PAGE_SIZE && (
        <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-100">
          <span className="text-xs text-gray-500">
            Page {page} of {Math.ceil(pageUnitCount / PAGE_SIZE)} · {pageUnitCount} total
          </span>
          <div className="flex items-center gap-2">
            <button disabled={page === 1} onClick={() => setPage(p => p - 1)} className="px-3 py-1 text-xs rounded border border-gray-200 disabled:opacity-40 hover:bg-gray-50">Previous</button>
            <button disabled={page >= Math.ceil(pageUnitCount / PAGE_SIZE)} onClick={() => setPage(p => p + 1)} className="px-3 py-1 text-xs rounded border border-gray-200 disabled:opacity-40 hover:bg-gray-50">Next</button>
          </div>
        </div>
      )}

      <MergeModal isOpen={showMergeModal} onClose={() => setShowMergeModal(false)} onMerge={handleMerge}
        items={mergePickerItems}
        title="Merge Companies" description="Select the master record. All attendees from duplicates will be reassigned to master. Duplicates will be deleted."
        searchType="company" />

      <ParentChildModal
        isOpen={showParentChildModal}
        onClose={() => setShowParentChildModal(false)}
        onSubmit={handleParentChild}
        items={mergePickerItems}
      />

      <BulkVendorRelationshipModal
        isOpen={showBulkVendorRel}
        onClose={() => setShowBulkVendorRel(false)}
        onSuccess={() => { setSelectedIds(new Set()); onRefresh(); }}
        companyIds={Array.from(selectedIds)}
        title={vendorSectionLabel}
        userOptions={userOptionsFull}
        currentUserConfigId={currentUser?.configId ?? null}
      />

      <InternalRelationshipModal
        isOpen={showRepRelModal}
        onClose={() => setShowRepRelModal(false)}
        onSuccess={() => { setSelectedIds(new Set()); onRefresh(); }}
        entityType="company"
        entityIds={Array.from(selectedIds)}
        entityNames={new Map(selectedCompanies.map(c => [c.id, c.name]))}
      />

      {relPopupCompany && (
        <CompanyRelationshipsPopup
          companyId={relPopupCompany.id}
          companyName={relPopupCompany.name}
          onClose={() => setRelPopupCompany(null)}
        />
      )}

      {showAddToConf && (
        <AddToConferenceModal
          entityType="company"
          selectedIds={selectedIds}
          onClose={() => setShowAddToConf(false)}
          onSuccess={() => { setSelectedIds(new Set()); onRefresh(); }}
        />
      )}

      {showBulkAssignOutreach && conferenceId != null && (
        <BulkAssignOutreachModal
          conferenceId={conferenceId}
          companyIds={Array.from(selectedIds)}
          companyNames={companies.filter(c => selectedIds.has(c.id)).map(c => c.name)}
          onClose={() => setShowBulkAssignOutreach(false)}
          onAssigned={() => { setSelectedIds(new Set()); onRefresh(); }}
        />
      )}

      {/* Quick View iframe drawer */}
      {quickViewId !== null && (
        <>
          <style>{`@keyframes slideInRight { from { transform: translateX(100%); } to { transform: translateX(0); } }`}</style>
          <div className="fixed inset-0 z-40 bg-black/30" onClick={() => { setQuickViewId(null); setQuickViewParentOf(null); }} />
          <div
            className="drawer-mobile-responsive fixed bottom-0 left-0 right-0 sm:inset-y-0 sm:left-auto sm:right-0 h-[90vh] sm:h-auto w-full sm:w-[480px] bg-white shadow-2xl flex flex-col rounded-t-2xl sm:rounded-tl-2xl sm:rounded-tr-none z-50"
            style={qvPanelStyle}
          >
            <div className="hidden sm:block absolute left-0 inset-y-0 w-1 cursor-col-resize z-10 group/rh" onMouseDown={qvResizeStart}>
              <div className="absolute inset-y-0 left-0 w-0.5 bg-brand-secondary/0 group-hover/rh:bg-brand-secondary/40 transition-colors" />
            </div>
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 flex-shrink-0">
              <a
                href={`/companies/${quickViewId}`}
                className="text-xs text-brand-secondary hover:underline font-medium"
              >
                Go to Company Record →
              </a>
              <button
                type="button"
                onClick={() => { setQuickViewId(null); setQuickViewParentOf(null); }}
                className="p-1.5 rounded hover:bg-gray-100 text-gray-500"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <iframe
              src={`/companies/${quickViewId}?embed=true${quickViewParentOf ? `&parent_of=${encodeURIComponent(quickViewParentOf)}` : ''}`}
              className="flex-1 w-full border-0"
              title="Quick View"
            />
          </div>
        </>
      )}

      {attendeesDrawerCompany && (
        <CompanyAttendeesDrawer
          companyId={attendeesDrawerCompany.id}
          companyName={attendeesDrawerCompany.name}
          conferenceLabel={conferenceLabel}
          conferenceId={conferenceId}
          attendees={(conferenceAttendees ?? []).filter(a => a.company_id === attendeesDrawerCompany.id)}
          onClose={() => setAttendeesDrawerCompany(null)}
        />
      )}
    </div>
  );
}
