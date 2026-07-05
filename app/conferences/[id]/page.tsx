'use client';

import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { AnalyticsCharts } from '@/components/AnalyticsCharts';
import { invalidateConfsCache } from '@/components/Header';
import { FollowUpsTable, type FollowUp } from '@/components/FollowUpsTable';
import { MeetingsTable, type Meeting, type EditFormData } from '@/components/MeetingsTable';
import { NotesSection, type EntityNote } from '@/components/NotesSection';
import { PinnedNotesSection, type PinnedNote } from '@/components/PinnedNotesSection';
import { NotesPopover } from '@/components/NotesPopover';
import { CompanyTable } from '@/components/CompanyTable';
import { SocialEventsTable, type SocialEvent } from '@/components/SocialEventsTable';
import { BackButton } from '@/components/BackButton';
import { effectiveSeniority } from '@/lib/parsers';
import { useConfigColors } from '@/lib/useConfigColors';
import { useConfigOptions } from '@/lib/useConfigOptions';
import { useSectionConfig } from '@/lib/useSectionConfig';
import { useTableColumnConfig } from '@/lib/useTableColumnConfig';
import { getBadgeClass, getHex, type ColorMap } from '@/lib/colors';
import { RepMultiSelect } from '@/components/RepMultiSelect';
import { type UserOption, getRepInitials } from '@/lib/useUserOptions';
import { ColumnMappingModal } from '@/components/ColumnMappingModal';
import { type ColumnMapping } from '@/lib/columnMapping';
import { ConflictResolutionModal, type ConflictItem } from '@/components/ConflictResolutionModal';
import { NewMeetingModal } from '@/components/NewMeetingModal';
import { ConferenceFormsTab } from '@/components/ConferenceFormsTab';
import { useUser } from '@/components/UserContext';
import { useCapabilities } from '@/lib/useCapabilities';
import { useOnboarding } from '@/lib/OnboardingContext';
import { useLogoConfig } from '@/lib/useLogoConfig';
import { BatchCardScanModal } from '@/components/BatchCardScanModal';
import { CrmExportModal } from '@/components/CrmExportModal';
import { PreConferenceReview } from '@/components/PreConferenceReview';
import { PostConferenceReview } from '@/components/PostConferenceReview';
import { BudgetVsActualModal } from '@/components/BudgetVsActualModal';
import { ConferenceEffectivenessModal } from '@/components/ConferenceEffectivenessModal';
import { getCached } from '@/lib/configCache';
import { AgendaTab } from '@/components/AgendaTab';
import { ConferenceDetailsTargetsTab } from '@/components/ConferenceDetailsTargetsTab';
import { ConferenceStageBadge } from '@/components/ConferenceStageBadge';
import { computeConferenceStage, postConferenceDaysRemaining } from '@/lib/conference-stage';
import { getConferencePermissions } from '@/lib/conference-permissions';
import { shouldWarnForTitleMetadata, type TitleMatchMetadata } from '@/lib/titleNormalization';
import { ClassifyTitleModal } from '@/components/ClassifyTitleModal';
import { BulkClassifyTitlesModal } from '@/components/BulkClassifyTitlesModal';
import { MergeModal } from '@/components/MergeModal';
import { SeriesSeasonCombobox, type SeriesOption } from '@/components/SeriesSeasonCombobox';
import { MyDebriefDrawer } from '@/components/MyDebriefDrawer';
import ExecutiveBriefDrawer, { type ConferenceSnapshot } from '@/components/ExecutiveBriefDrawer';
import { ConferenceActivityMapDrawer } from '@/components/ConferenceActivityMapDrawer';
import type { SeriesYoYData } from '@/lib/get-series-yoy-data';
import { useMeetingNotesDrawer } from '@/lib/MeetingNotesDrawerContext';
import { useDrawerResize } from '@/lib/useDrawerResize';

interface Attendee {
  id: number;
  first_name: string;
  last_name: string;
  title?: string;
  company_id?: number;
  company_name?: string;
  company_type?: string;
  company_wse?: number;
  email?: string;
  status?: string;
  seniority?: string;
  function?: string;
  conference_count?: number;
  conference_names?: string;
  entity_notes_count?: number;
  created_at?: string;
  updated_at?: string;
}

function fmtDate(dateStr?: string): string {
  if (!dateStr) return '—';
  try {
    const d = new Date(dateStr.endsWith('Z') || dateStr.includes('+') ? dateStr : dateStr + 'Z');
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch { return '—'; }
}

const ATTENDEE_PAGE_SIZE = 100;

function conferenceBadgeClass(count: number) {
  if (count >= 4) return 'inline-flex items-center justify-center min-w-[1.5rem] px-2 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-700';
  if (count === 3) return 'inline-flex items-center justify-center min-w-[1.5rem] px-2 py-0.5 rounded-full text-xs font-semibold bg-yellow-100 text-yellow-700';
  if (count === 2) return 'inline-flex items-center justify-center min-w-[1.5rem] px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-700';
  return 'inline-flex items-center justify-center min-w-[1.5rem] px-2 py-0.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-600';
}

function ConferenceCountTooltip({ count, names }: { count: number; names?: string }) {
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
      {pos && list.length > 0 && (
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

interface Conference {
  id: number;
  name: string;
  start_date: string;
  end_date: string;
  location: string;
  notes?: string;
  internal_attendees?: string;
  conference_strategy_type_id?: number | null;
  conference_strategy_type_display_name?: string | null;
  is_historical?: number | boolean | null;
  post_conference_days?: number | null;
  stage_override?: string | null;
  stage_override_by?: string | null;
  stage_override_reason?: string | null;
  series_id?: string | null;
  season_id?: string | null;
  industry_focus?: string | null;
  conference_type?: string | null;
  website?: string | null;
  sponsorship_level?: string | null;
  booth_present?: number | boolean | null;
  booth_width?: number | null;
  booth_length?: number | null;
  booth_number?: string | null;
  booth_hall?: string | null;
  global_agenda_uploaded_at?: string | null;
  global_agenda_uploaded_by_name?: string | null;
  created_at: string;
  attendees: Attendee[];
}

interface ConferenceDetail {
  attendee_id: number;
  conference_id: number;
  action?: string;
  next_steps?: string;
  next_steps_notes?: string;
  notes?: string;
  assigned_rep?: string;
}

type ConferenceTabKey = 'targets' | 'attendees' | 'companies' | 'meetings' | 'follow-ups' | 'social' | 'analytics' | 'notes' | 'forms' | 'agenda';

const CONFERENCE_TAB_ORDER: ConferenceTabKey[] = ['targets', 'attendees', 'companies', 'meetings', 'follow-ups', 'social', 'analytics', 'notes', 'forms', 'agenda'];

function formatDate(dateStr: string) {
  if (!dateStr) return '';
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

function getConferenceDates(start: string, end: string): string[] {
  if (!start || !end) return [];
  const dates: string[] = [];
  const cur = new Date(start + 'T00:00:00');
  const endDate = new Date(end + 'T00:00:00');
  while (cur <= endDate) {
    dates.push(cur.toISOString().slice(0, 10));
    cur.setDate(cur.getDate() + 1);
  }
  return dates;
}

function formatDayLabel(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  const dayName = d.toLocaleDateString('en-US', { weekday: 'long' });
  const month = d.toLocaleDateString('en-US', { month: 'long' });
  const day = d.getDate();
  const sfx = (n: number) => {
    if (n >= 11 && n <= 13) return 'th';
    switch (n % 10) { case 1: return 'st'; case 2: return 'nd'; case 3: return 'rd'; default: return 'th'; }
  };
  return `${dayName} - ${month} ${day}${sfx(day)}`;
}

function MeetingMultiSelect({
  placeholder,
  options,
  selected,
  onChange,
}: {
  placeholder: string;
  options: { value: string; label: string }[];
  selected: string[];
  onChange: (v: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const toggle = (v: string) =>
    onChange(selected.includes(v) ? selected.filter(x => x !== v) : [...selected, v]);

  const displayLabel = selected.length === 0
    ? placeholder
    : selected.length === 1
      ? (options.find(o => o.value === selected[0])?.label ?? selected[0])
      : `${selected.length} selected`;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-left flex items-center justify-between gap-2 hover:border-brand-secondary transition-colors bg-white"
      >
        <span className={`truncate ${selected.length === 0 ? 'text-gray-400' : 'text-gray-800'}`}>{displayLabel}</span>
        <svg className={`w-3.5 h-3.5 text-gray-400 flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <div className="absolute z-30 top-full mt-1 left-0 w-full min-w-[200px] bg-white border border-gray-200 rounded-lg shadow-lg max-h-52 overflow-y-auto">
          <button
            type="button"
            onClick={() => onChange([])}
            className="w-full text-left px-3 py-1.5 text-xs text-gray-400 hover:bg-gray-50 border-b border-gray-100"
          >
            — Clear —
          </button>
          {options.map(opt => (
            <label key={opt.value} className="flex items-center gap-2 px-3 py-1.5 hover:bg-gray-50 cursor-pointer text-sm">
              <input
                type="checkbox"
                checked={selected.includes(opt.value)}
                onChange={() => toggle(opt.value)}
                className="accent-brand-secondary flex-shrink-0"
              />
              <span>{opt.label}</span>
            </label>
          ))}
        </div>
      )}
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-1">
          {selected.map(v => (
            <span key={v} className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200">
              {options.find(o => o.value === v)?.label ?? v}
              <button type="button" onClick={() => toggle(v)} className="hover:text-red-500 leading-none ml-0.5">
                <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export default function ConferenceDetailPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const id = params.id as string;
  const colorMaps = useConfigColors();
  const configOptions = useConfigOptions('conference_detail');
  const allConfigOptions = useConfigOptions();
  const { isVisible: isConfAttendeeColVisible, orderedColumns: confAttendeeColumns } = useTableColumnConfig('conference_attendees');
  const conferenceTabConfig = useSectionConfig('conference_details');
  const { user: currentUser } = useUser();
  const capabilities = useCapabilities();
  const logoConfig = useLogoConfig();
  const { onboardingTrack, onboardingProgress, markStepComplete } = useOnboarding();
  const isAdminUser = currentUser?.role === 'administrator';

  const [conference, setConference] = useState<Conference | null>(null);
  const [conferenceDetails, setConferenceDetails] = useState<ConferenceDetail[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [editData, setEditData] = useState<Partial<Conference>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [activeTab, setActiveTab] = useState<ConferenceTabKey>('attendees');
  const [conferenceCompanies, setConferenceCompanies] = useState<{ id: number; name: string; website?: string; profit_type?: string; company_type?: string; status?: string; icp?: string; assigned_user?: string; attendee_count: number; conference_count: number; conference_names?: string }[]>([]);
  const [isLoadingCompanies, setIsLoadingCompanies] = useState(false);
  const [companiesLoaded, setCompaniesLoaded] = useState(false);
  const [confFollowUps, setConfFollowUps] = useState<FollowUp[]>([]);
  const [followUpFilter, setFollowUpFilter] = useState<'all' | 'open' | 'completed'>(() => {
    // Read filter param from URL for iframe embedding
    if (typeof window !== 'undefined') {
      const filterParam = new URLSearchParams(window.location.search).get('filter');
      if (filterParam === 'open') return 'open';
      if (filterParam === 'completed') return 'completed';
    }
    return 'all';
  });
  const [confNotes, setConfNotes] = useState<EntityNote[]>([]);
  const [confPinnedNoteIds, setConfPinnedNoteIds] = useState<Set<number>>(new Set());
  const [confPinnedNotes, setConfPinnedNotes] = useState<PinnedNote[]>([]);
  const [confMeetings, setConfMeetings] = useState<Meeting[]>([]);
  const meetingAttendeeIds = useMemo(() => new Set(confMeetings.map(m => m.attendee_id)), [confMeetings]);

  // Optimistically insert a newly-scheduled meeting into this tab's list. Idempotent (checks
  // for an existing id) since both the local NewMeetingModal onSuccess and the global
  // 'meeting-scheduled' broadcast (fired by every NewMeetingModal instance, including ones
  // in other tabs/modals like Conference Targets) can both fire for the same meeting.
  const addMeetingOptimistically = useCallback((meeting: Meeting) => {
    if (meeting.conference_id !== conference?.id) return;
    setConfMeetings(prev => prev.some(m => m.id === meeting.id) ? prev : [meeting, ...prev]);
  }, [conference?.id]);

  useEffect(() => {
    const handler = (e: Event) => addMeetingOptimistically((e as CustomEvent<Meeting>).detail);
    window.addEventListener('meeting-scheduled', handler);
    return () => window.removeEventListener('meeting-scheduled', handler);
  }, [addMeetingOptimistically]);
  const [confSocialEvents, setConfSocialEvents] = useState<SocialEvent[]>([]);
  const [actionOptions, setActionOptions] = useState<string[]>([]);
  const [actionConfigs, setActionConfigs] = useState<{ id: number; value: string; action_key: string | null }[]>([]);
  const [userOptions, setUserOptions] = useState<UserOption[]>([]);
  const [eventTypeOptions, setEventTypeOptions] = useState<string[]>([]);
  const [conferenceStrategyOptions, setConferenceStrategyOptions] = useState<{ id: number; value: string }[]>([]);
  const [meetingCompanyTypeOpts, setMeetingCompanyTypeOpts] = useState<string[]>([]);
  const [meetingSeniorityOpts, setMeetingSeniorityOpts] = useState<string[]>([]);

  const [newMeetingOpen, setNewMeetingOpen] = useState(false);

  // Meeting filter state
  const [meetingFiltersOpen, setMeetingFiltersOpen] = useState(false);
  const [meetingFilterReps, setMeetingFilterReps] = useState<number[]>([]);
  const [meetingFilterDates, setMeetingFilterDates] = useState<string[]>([]);
  const [meetingFilterCompanyTypes, setMeetingFilterCompanyTypes] = useState<string[]>([]);
  const [meetingFilterSeniorities, setMeetingFilterSeniorities] = useState<string[]>([]);

  const [attendeeSearch, setAttendeeSearch] = useState('');
  const [filterSeniority, setFilterSeniority] = useState('');
  const [filterCompanyType, setFilterCompanyType] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterConfCounts, setFilterConfCounts] = useState<Set<string>>(new Set());
  const [showConfFilter, setShowConfFilter] = useState(false);
  const [filterUpdatedWithin, setFilterUpdatedWithin] = useState('');
  const { panelStyle: qvPanelStyle, handleResizeStart: qvResizeStart } = useDrawerResize(480);
  const [quickViewId, setQuickViewId] = useState<number | null>(null);
  const [quickViewType, setQuickViewType] = useState<'attendee' | 'company'>('attendee');
  const [attendeeFiltersOpen, setAttendeeFiltersOpen] = useState(false);
  const [attendeePage, setAttendeePage] = useState(1);
  const [selectedAttendeeIds, setSelectedAttendeeIds] = useState<Set<number>>(new Set());
  const [isRemoving, setIsRemoving] = useState(false);
  const [showAttendeeEdit, setShowAttendeeEdit] = useState(false);
  const [attendeeEditFields, setAttendeeEditFields] = useState<{ status?: string; seniority?: string; function?: string; company_id?: string; consent?: string }>({});
  const [isApplyingAttendeeEdit, setIsApplyingAttendeeEdit] = useState(false);
  const [editingCell, setEditingCell] = useState<{ attendeeId: number; field: 'title' | 'company_type' | 'status' | 'seniority' | 'company_wse' } | null>(null);
  const [cellDraft, setCellDraft] = useState('');
  const [isSavingCell, setIsSavingCell] = useState(false);
  const [sortKey, setSortKey] = useState<'name' | 'title' | 'company' | 'seniority'>('name');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [filterNeedsReview, setFilterNeedsReview] = useState(false);
  const [titleMetaMap, setTitleMetaMap] = useState<Record<number, TitleMatchMetadata>>({});
  const [titleMetaLoading, setTitleMetaLoading] = useState(false);
  const [titleMetaRefetch, setTitleMetaRefetch] = useState(0);
  const [classifyingAttendee, setClassifyingAttendee] = useState<{ id: number; title: string } | null>(null);
  const [showBulkClassify, setShowBulkClassify] = useState(false);
  const [showMergeModal, setShowMergeModal] = useState(false);
  const [classifyFunctionOptions, setClassifyFunctionOptions] = useState<Array<{ id: number; value: string }>>([]);
  const [classifySeniorityOptions, setClassifySeniorityOptions] = useState<Array<{ id: number; value: string }>>([]);
  const [editInternalAttendees, setEditInternalAttendees] = useState<string[]>([]);
  const [internalDropdownOpen, setInternalDropdownOpen] = useState(false);
  const internalDropdownRef = useRef<HTMLDivElement>(null);
  const [editSeries, setEditSeries] = useState<SeriesOption | null>(null);
  const [editSeasonId, setEditSeasonId] = useState<string | null>(null);
  const [industryOptions, setIndustryOptions] = useState<{ id: number; value: string }[]>([]);
  const [editIndustrySearch, setEditIndustrySearch] = useState('');
  const [editIndustryDropdownOpen, setEditIndustryDropdownOpen] = useState(false);
  const editIndustryDropdownRef = useRef<HTMLDivElement>(null);
  const [sponsorshipOptions, setSponsorshipOptions] = useState<{ id: number; value: string; color: string | null; is_system: number }[]>([]);
  const [sponsorshipAddOpen, setSponsorshipAddOpen] = useState(false);
  const [sponsorshipAddValue, setSponsorshipAddValue] = useState('');
  const [sponsorshipAdding, setSponsorshipAdding] = useState(false);
  const [metaPillsExpanded, setMetaPillsExpanded] = useState(false);

  // Resizable column widths
  const [colWidths, setColWidths] = useState<Record<string, number>>({ name: 220, title: 160, company: 160, type: 120, seniority: 120, conferences: 80 });
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

  const handleSort = (key: typeof sortKey) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('asc'); }
  };

  // Add attendee inline form state
  const [showAddForm, setShowAddForm] = useState(false);
  const [addFormData, setAddFormData] = useState({ first_name: '', last_name: '', title: '', company: '', email: '' });
  const [isAddingAttendee, setIsAddingAttendee] = useState(false);

  const { openMeetingNotes } = useMeetingNotesDrawer();

  const [showBatchScan, setShowBatchScan] = useState(false);
  const [showBudgetModal, setShowBudgetModal] = useState(false);
  const [showDebrief, setShowDebrief] = useState(false);
  const [activityMapOpen, setActivityMapOpen] = useState(false);
  const [mobileReportMenuOpen, setMobileReportMenuOpen] = useState(false);
  const [executiveBriefOpen, setExecutiveBriefOpen] = useState(false);
  const [executiveBriefSnapshot, setExecutiveBriefSnapshot] = useState<ConferenceSnapshot | null>(null);
  const [executiveBriefYoY, setExecutiveBriefYoY] = useState<SeriesYoYData | null>(null);
  const [executiveBriefLoading, setExecutiveBriefLoading] = useState(false);
  const [showCrmExport, setShowCrmExport] = useState(false);
  const [showAdminStage, setShowAdminStage] = useState(false);
  const [stageActionLoading, setStageActionLoading] = useState(false);
  const [stageExtendDays, setStageExtendDays] = useState(7);

  // Compute conference stage (null for historical)
  const conferenceStage = useMemo(() => {
    if (!conference || conference.is_historical) return null;
    try {
      return computeConferenceStage({
        start_date: conference.start_date,
        end_date: conference.end_date,
        post_conference_days: conference.post_conference_days ?? null,
        stage_override: conference.stage_override ?? null,
      });
    } catch {
      return null;
    }
  }, [conference]);

  const stageDaysRemaining = useMemo(() => {
    if (!conference || conferenceStage !== 'post_conference') return undefined;
    return postConferenceDaysRemaining({
      end_date: conference.end_date,
      post_conference_days: conference.post_conference_days ?? null,
    });
  }, [conference, conferenceStage]);

  const stagePermissions = useMemo(() => {
    if (!conferenceStage) return null;
    return getConferencePermissions(conferenceStage, isAdminUser);
  }, [conferenceStage, isAdminUser]);

  const isInternalAttendee = useMemo(() => {
    if (!conference || !currentUser?.repName) return false;
    const names = conference.internal_attendees?.split(',').map(s => s.trim()).filter(Boolean) ?? [];
    return names.includes(currentUser.repName);
  }, [conference, currentUser?.repName]);

  // Open field report drawer if ?fieldreport=true is in the URL
  useEffect(() => {
    if (searchParams.get('fieldreport') === 'true' && isInternalAttendee) {
      setShowDebrief(true);
      window.history.replaceState(null, '', window.location.pathname);
    }
  }, [searchParams, isInternalAttendee]);

  // Fetch snapshot + YoY data when executive brief opens
  useEffect(() => {
    if (!executiveBriefOpen || !conference) return;
    setExecutiveBriefLoading(true);
    const fetches: Promise<void>[] = [
      fetch(`/api/conferences/${conference.id}/snapshot`)
        .then(r => r.json())
        .then(data => setExecutiveBriefSnapshot(data.snapshot ?? null))
        .catch(() => setExecutiveBriefSnapshot(null)),
    ];
    if (conference.series_id) {
      fetches.push(
        fetch(`/api/conferences/series/${conference.series_id}/yoy`)
          .then(r => r.json())
          .then(data => setExecutiveBriefYoY(data ?? null))
          .catch(() => setExecutiveBriefYoY(null))
      );
    }
    Promise.all(fetches).finally(() => setExecutiveBriefLoading(false));
  }, [executiveBriefOpen, conference?.id, conference?.series_id]);

  async function applyStageAction(action: string, extra?: Record<string, unknown>) {
    setStageActionLoading(true);
    try {
      const res = await fetch(`/api/conferences/${id}/stage`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ...extra }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error || 'Failed to update stage.');
        return;
      }
      // Re-fetch the conference bypassing the browser's 30s cache so the updated
      // stage_override (or cleared override) is reflected immediately, not stale.
      const freshConf = await fetch(`/api/conferences/${id}?_t=${Date.now()}`)
        .then(r => r.ok ? r.json() : null)
        .catch(() => null);
      if (freshConf && !freshConf.error) {
        setConference(freshConf);
      }
      toast.success('Conference stage updated.');
      // After closing, trigger an explicit snapshot computation so it runs to
      // completion (serverless functions may not finish fire-and-forget tasks).
      if (action === 'close_now') {
        fetch(`/api/conferences/${id}/compute-snapshot`, { method: 'POST' }).catch(() => {});
      }
    } catch {
      toast.error('Failed to update stage.');
    } finally {
      setStageActionLoading(false);
    }
  }

  // Agenda upload state (edit form)
  const [agendaUploading, setAgendaUploading] = useState(false);
  const [agendaUploadError, setAgendaUploadError] = useState<string | null>(null);
  const [agendaUploadSuccess, setAgendaUploadSuccess] = useState<string | null>(null);
  const [agendaLastUploadedAt, setAgendaLastUploadedAt] = useState<string | null>(null);
  const [agendaUrlPanelOpen, setAgendaUrlPanelOpen] = useState(false);
  const [agendaUrlInput, setAgendaUrlInput] = useState('');
  const [agendaUrlError, setAgendaUrlError] = useState<string | null>(null);
  const agendaFileRef = useRef<HTMLInputElement>(null);

  const handleAgendaFile = async (file: File) => {
    setAgendaUploadError(null);
    setAgendaUploadSuccess(null);
    setAgendaUploading(true);
    try {
      const reader = new FileReader();
      const { base64, mediaType } = await new Promise<{ base64: string; mediaType: string }>((resolve, reject) => {
        reader.onload = () => {
          const result = reader.result as string;
          const [header, data] = result.split(',');
          const mt = header.replace('data:', '').replace(';base64', '');
          resolve({ base64: data, mediaType: mt });
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const res = await fetch(`/api/conferences/${id}/agenda`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image_base64: base64, media_type: mediaType, scope: 'global' }),
      });
      const data = await res.json() as { count?: number; error?: string };
      if (!res.ok) { setAgendaUploadError(data.error ?? 'Failed to upload agenda.'); return; }
      setAgendaUploadSuccess(`Agenda uploaded — ${data.count ?? 0} sessions parsed.`);
      setAgendaLastUploadedAt(new Date().toISOString());
    } catch { setAgendaUploadError('Upload failed. Please try again.'); }
    finally { setAgendaUploading(false); }
  };

  const handleAgendaUrl = async () => {
    setAgendaUrlError(null);
    const trimmed = agendaUrlInput.trim();
    if (!trimmed) { setAgendaUrlError('Please enter a URL.'); return; }
    try {
      const p = new URL(trimmed);
      if (p.protocol !== 'http:' && p.protocol !== 'https:') throw new Error();
    } catch { setAgendaUrlError('Please enter a valid URL.'); return; }
    setAgendaUploading(true);
    setAgendaUploadError(null);
    setAgendaUploadSuccess(null);
    try {
      const res = await fetch(`/api/conferences/${id}/agenda`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: trimmed, scope: 'global' }),
      });
      const data = await res.json() as { count?: number; error?: string };
      if (!res.ok) { setAgendaUploadError(data.error ?? 'Failed to import agenda from URL.'); return; }
      setAgendaUrlInput('');
      setAgendaUrlPanelOpen(false);
      setAgendaUploadSuccess(`Agenda uploaded — ${data.count ?? 0} sessions parsed.`);
      setAgendaLastUploadedAt(new Date().toISOString());
    } catch { setAgendaUploadError('Failed to connect. Please try again.'); }
    finally { setAgendaUploading(false); }
  };

  // Upload attendee list state
  const [isUploading, setIsUploading] = useState(false);
  const uploadFileRef = useRef<HTMLInputElement>(null);
  const [pendingUploadFile, setPendingUploadFile] = useState<File | null>(null);
  const [pendingMapping, setPendingMapping] = useState<ColumnMapping | null>(null);
  const [columnMappingData, setColumnMappingData] = useState<{
    headers: string[];
    suggestions: ColumnMapping;
    sampleRows: Record<string, string>[];
    totalRows: number;
  } | null>(null);
  const [pendingConflicts, setPendingConflicts] = useState<ConflictItem[] | null>(null);

  const visibleConferenceTabs = CONFERENCE_TAB_ORDER.filter((tabKey) => {
    if (conference?.is_historical && !['attendees', 'companies', 'notes'].includes(tabKey)) return false;
    return conferenceTabConfig.orderedKeys.includes(tabKey) && conferenceTabConfig.isVisible(tabKey);
  });

  useEffect(() => {
    if (visibleConferenceTabs.length === 0) return;
    if (!visibleConferenceTabs.includes(activeTab)) {
      setActiveTab(visibleConferenceTabs[0]);
    }
  }, [activeTab, visibleConferenceTabs]);

  const handleTabChange = (tabKey: ConferenceTabKey) => {
    setActiveTab(tabKey);
    if (tabKey === 'companies' || tabKey === 'social' || tabKey === 'notes') {
      loadCompanies();
    }
  };

  const fetchConference = useCallback(async () => {
    try {
      const [confRes, detailsRes, followUpsRes, notesRes, meetingsRes, actionRes, userRes, socialRes, eventTypeRes, companyTypeRes, seniorityRes, conferenceStrategyRes, allSeriesRes] = await Promise.all([
        fetch(`/api/conferences/${id}`),
        fetch(`/api/conference-details?conference_id=${id}`),
        fetch(`/api/follow-ups?conference_id=${id}`),
        fetch(`/api/notes?entity_type=conference&entity_id=${id}`),
        fetch(`/api/meetings?conference_id=${id}`),
        fetch('/api/config?category=action&form=conference_detail'),
        fetch('/api/config?category=user&form=conference_detail'),
        fetch(`/api/social-events?conference_id=${id}`),
        fetch('/api/config?category=event_type&form=conference_detail'),
        fetch('/api/config?category=company_type&form=conference_detail'),
        fetch('/api/config?category=seniority&form=conference_detail'),
        fetch('/api/config?category=conference_strategy_type&form=conference_detail'),
        fetch('/api/conference-series'),
      ]);
      if (!confRes.ok) throw new Error('Not found');
      const data = await confRes.json();
      const detailsData = detailsRes.ok ? await detailsRes.json() : [];
      const followUpsData = followUpsRes.ok ? await followUpsRes.json() : [];
      const notesData = notesRes.ok ? await notesRes.json() : [];
      const meetingsData = meetingsRes.ok ? await meetingsRes.json() : [];
      const socialData = socialRes.ok ? await socialRes.json() : [];
      const eventTypeData = eventTypeRes.ok ? await eventTypeRes.json() : [];
      const actionData = actionRes.ok ? await actionRes.json() : [];
      const userData = userRes.ok ? await userRes.json() : [];
      const companyTypeData = companyTypeRes.ok ? await companyTypeRes.json() : [];
      const seniorityData = seniorityRes.ok ? await seniorityRes.json() : [];
      const conferenceStrategyData = conferenceStrategyRes.ok ? await conferenceStrategyRes.json() : [];
      const allSeriesData: SeriesOption[] = allSeriesRes.ok ? await allSeriesRes.json() : [];
      setConference(data);
      if (data.series_id) {
        setEditSeries(allSeriesData.find((s) => s.id === data.series_id) ?? null);
      }
      setEditSeasonId(data.season_id ?? null);
      setConferenceDetails(Array.isArray(detailsData) ? detailsData : []);
      setConfFollowUps(Array.isArray(followUpsData) ? followUpsData : []);
      setConfNotes(Array.isArray(notesData) ? notesData : []);
      setConfMeetings(Array.isArray(meetingsData) ? meetingsData : []);
      setConfSocialEvents(Array.isArray(socialData) ? socialData : []);
      setActionOptions(actionData.map((o: { value: string }) => o.value));
      setActionConfigs(actionData.map((o: { id: number; value: string; action_key?: string | null }) => ({
        id: o.id,
        value: o.value,
        action_key: o.action_key ?? null,
      })));
      setUserOptions(userData.map((o: { id: number; value: string }) => ({ id: o.id, value: o.value })));
      setEventTypeOptions(eventTypeData.map((o: { value: string }) => o.value));
      setMeetingCompanyTypeOpts(companyTypeData.map((o: { value: string }) => o.value));
      setMeetingSeniorityOpts(seniorityData.map((o: { value: string }) => o.value));
      setConferenceStrategyOptions(conferenceStrategyData.map((o: { id: number; value: string }) => ({ id: Number(o.id), value: String(o.value) })));
      setEditData({
        name: data.name,
        start_date: data.start_date,
        end_date: data.end_date,
        location: data.location,
        notes: data.notes || '',
        conference_strategy_type_id: data.conference_strategy_type_id ?? null,
        series_id: data.series_id ?? null,
        season_id: data.season_id ?? null,
        industry_focus: data.industry_focus ?? null,
        conference_type: data.conference_type ?? null,
        website: data.website ?? null,
        sponsorship_level: data.sponsorship_level ?? null,
        booth_present: data.booth_present ?? 0,
        booth_width: data.booth_width ?? null,
        booth_length: data.booth_length ?? null,
        booth_number: data.booth_number ?? null,
        booth_hall: data.booth_hall ?? null,
      });
      setEditSeasonId(data.season_id ?? null);
      setEditInternalAttendees(
        data.internal_attendees ? data.internal_attendees.split(',').filter(Boolean) : []
      );
    } catch {
      toast.error('Failed to load conference');
      router.push('/conferences');
    } finally {
      setIsLoading(false);
    }
  }, [id, router]);

  useEffect(() => {
    fetchConference();
  }, [fetchConference]);

  // Fetch which conference notes are pinned elsewhere
  useEffect(() => {
    if (confNotes.length === 0) { setConfPinnedNoteIds(new Set()); return; }
    const noteIds = confNotes.map(n => n.id).join(',');
    fetch(`/api/pinned-notes?note_ids=${noteIds}`)
      .then(r => r.ok ? r.json() : [])
      .then((ids: number[]) => setConfPinnedNoteIds(new Set(ids)))
      .catch(() => {});
  }, [confNotes]);

  // Fetch pinned notes for this conference
  useEffect(() => {
    fetch(`/api/pinned-notes?entity_type=conference&entity_id=${id}`)
      .then(r => r.ok ? r.json() : [])
      .then((data: PinnedNote[]) => setConfPinnedNotes(data))
      .catch(() => {});
  }, [id]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (internalDropdownRef.current && !internalDropdownRef.current.contains(e.target as Node)) {
        setInternalDropdownOpen(false);
      }
      if (editIndustryDropdownRef.current && !editIndustryDropdownRef.current.contains(e.target as Node)) {
        setEditIndustryDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    fetch('/api/config?category=industry')
      .then((r) => r.json())
      .then((rows) => setIndustryOptions((rows ?? []).map((r: { id: number; value: string }) => ({ id: Number(r.id), value: String(r.value) }))))
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetch('/api/config/sponsorship-levels')
      .then((r) => r.json())
      .then((rows) => setSponsorshipOptions((rows ?? []).map((r: { id: number; value: string; color: string | null; is_system: number }) => ({ id: Number(r.id), value: String(r.value), color: r.color ?? null, is_system: Number(r.is_system ?? 0) }))))
      .catch(() => {});
  }, []);

  const loadCompanies = useCallback(async () => {
    if (companiesLoaded || !conference) return;
    setIsLoadingCompanies(true);
    try {
      const companyIds = new Set(conference.attendees.map(a => a.company_id).filter(Boolean) as number[]);
      if (companyIds.size === 0) { setConferenceCompanies([]); setCompaniesLoaded(true); return; }
      const allCompanies = await fetch('/api/companies').then(r => r.json());
      // Count attendees per company in THIS conference
      const countMap = new Map<number, number>();
      // Build attendee summary per company for THIS conference only
      const summaryMap = new Map<number, string[]>();
      for (const a of conference.attendees) {
        if (a.company_id) {
          countMap.set(a.company_id, (countMap.get(a.company_id) ?? 0) + 1);
          const info = `${a.first_name} ${a.last_name}|${a.title || ''}`;
          const existing = summaryMap.get(a.company_id) ?? [];
          existing.push(info);
          summaryMap.set(a.company_id, existing);
        }
      }
      const filtered = allCompanies
        .filter((c: { id: number }) => companyIds.has(c.id))
        .map((c: { id: number; attendee_count: number }) => ({
          ...c,
          attendee_count: countMap.get(c.id) ?? 0,
          attendee_summary: summaryMap.get(c.id)?.join('~~~') ?? '',
        }));
      setConferenceCompanies(filtered);
      setCompaniesLoaded(true);
    } catch { /* non-fatal */ } finally { setIsLoadingCompanies(false); }
  }, [conference, companiesLoaded]);

  useEffect(() => {
    const requestedTab = new URLSearchParams(window.location.search).get('tab');
    if (!requestedTab) return;
    if (!CONFERENCE_TAB_ORDER.includes(requestedTab as ConferenceTabKey)) return;
    const tabKey = requestedTab as ConferenceTabKey;
    if (!visibleConferenceTabs.includes(tabKey)) return;
    setActiveTab(tabKey);
    if (tabKey === 'companies' || tabKey === 'social' || tabKey === 'notes') {
      loadCompanies();
    }
  }, [visibleConferenceTabs, loadCompanies]);

  // Track A onboarding: mark pre-conference review visited when this page loads for track A users
  useEffect(() => {
    if (onboardingTrack !== 'track_a' || !onboardingProgress) return;
    if (!onboardingProgress.completed_steps.includes('preconf_visited')) {
      markStepComplete('preconf_visited');
    }
  }, [onboardingTrack, onboardingProgress, markStepComplete]);

  const createSponsorshipLevel = async () => {
    const value = sponsorshipAddValue.trim();
    if (!value) return;
    setSponsorshipAdding(true);
    try {
      const res = await fetch('/api/config/sponsorship-levels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value }),
      });
      if (!res.ok) throw new Error();
      const created = await res.json() as { id: number; value: string; color: string | null; is_system: number };
      const newOpt = { id: Number(created.id), value: String(created.value), color: created.color ?? null, is_system: 0 };
      setSponsorshipOptions((prev) => [...prev.filter((o) => o.id !== newOpt.id), newOpt]);
      setEditData((p) => ({ ...p, sponsorship_level: newOpt.value }));
      setSponsorshipAddValue('');
      setSponsorshipAddOpen(false);
    } catch {
      toast.error('Failed to add sponsorship level.');
    } finally {
      setSponsorshipAdding(false);
    }
  };

  const deleteSponsorshipLevel = async (id: number, value: string) => {
    try {
      const res = await fetch(`/api/config/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as { error?: string };
        toast.error(data.error || 'Failed to delete.');
        return;
      }
      setSponsorshipOptions((prev) => prev.filter((o) => o.id !== id));
      if ((editData.sponsorship_level ?? '') === value) setEditData((p) => ({ ...p, sponsorship_level: null }));
    } catch {
      toast.error('Failed to delete sponsorship level.');
    }
  };

  const createIndustryOption = async (value: string, onSuccess: (val: string) => void) => {
    try {
      const res = await fetch('/api/config/industry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value }),
      });
      if (!res.ok) throw new Error();
      const created = await res.json() as { id: number; value: string };
      const newOpt = { id: Number(created.id), value: String(created.value) };
      setIndustryOptions((prev) => [...prev.filter((o) => o.value !== newOpt.value), newOpt]);
      onSuccess(newOpt.value);
    } catch {
      toast.error('Failed to create industry option.');
    }
  };

  const handleSave = async () => {
    if (!editData.name || !editData.start_date || !editData.end_date || !editData.location) {
      toast.error('Please fill in all required fields.');
      return;
    }
    setIsSaving(true);
    try {
      const res = await fetch(`/api/conferences/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...editData, internal_attendees: editInternalAttendees.join(','), series_id: editSeries?.id ?? editData.series_id ?? null, season_id: editSeasonId ?? null }),
      });
      if (!res.ok) throw new Error('Update failed');
      const updated = await res.json();
      const selectedStrategyId = editData.conference_strategy_type_id != null ? Number(editData.conference_strategy_type_id) : null;
      const selectedStrategyDisplay = selectedStrategyId != null
        ? (conferenceStrategyOptions.find((o) => o.id === selectedStrategyId)?.value ?? null)
        : null;
      setConference((prev) => prev ? {
        ...prev,
        ...updated,
        conference_strategy_type_id: selectedStrategyId,
        conference_strategy_type_display_name: selectedStrategyDisplay,
        internal_attendees: editInternalAttendees.join(','),
      } : prev);
      setIsEditing(false);
      toast.success('Conference updated!');
    } catch {
      toast.error('Failed to update conference');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this conference? This cannot be undone.')) return;
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/conferences/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Delete failed');
      toast.success('Conference deleted.');
      invalidateConfsCache();
      // Use a full-page navigation instead of router.push() + router.refresh() —
      // combining the two causes a race condition that corrupts the router state
      // and silently breaks all subsequent Link navigations until a page reload.
      window.location.href = '/conferences';
    } catch {
      toast.error('Failed to delete conference');
      setIsDeleting(false);
    }
  };

  const toggleAttendeeSelect = (aid: number) => {
    setSelectedAttendeeIds((prev) => {
      const next = new Set(prev);
      if (next.has(aid)) next.delete(aid); else next.add(aid);
      return next;
    });
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
    if (!conference || isSavingCell) return;
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
      setConference(prev => prev ? {
        ...prev,
        attendees: prev.attendees.map(a => {
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
        }),
      } : prev);
      setEditingCell(null);
      toast.success('Updated.');
      fetchConference();
    } catch {
      toast.error('Failed to update attendee.');
    } finally {
      setIsSavingCell(false);
    }
  };

  const handleRemoveOne = async (aid: number, name: string) => {
    if (!confirm(`Remove ${name} from this conference?`)) return;
    setIsRemoving(true);
    try {
      const res = await fetch(`/api/conferences/${id}/attendees`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ attendee_ids: [aid] }),
      });
      if (!res.ok) throw new Error();
      toast.success(`${name} removed from conference.`);
      fetchConference();
    } catch {
      toast.error('Failed to remove attendee.');
    } finally {
      setIsRemoving(false);
    }
  };

  const handleRemoveSelected = async () => {
    if (!confirm(`Remove ${selectedAttendeeIds.size} attendee(s) from this conference?`)) return;
    setIsRemoving(true);
    try {
      const res = await fetch(`/api/conferences/${id}/attendees`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ attendee_ids: Array.from(selectedAttendeeIds) }),
      });
      if (!res.ok) throw new Error();
      toast.success(`${selectedAttendeeIds.size} attendee(s) removed.`);
      setSelectedAttendeeIds(new Set());
      fetchConference();
    } catch {
      toast.error('Failed to remove attendees.');
    } finally {
      setIsRemoving(false);
    }
  };

  const handleDecoupleOne = async (aid: number, name: string) => {
    if (!confirm(`Decouple ${name} from this conference? The record will remain in the database.`)) return;
    // Optimistic remove
    const prevConference = conference;
    setConference(prev => prev ? { ...prev, attendees: prev.attendees.filter(a => a.id !== aid) } : prev);
    try {
      const res = await fetch(`/api/conferences/${id}/attendees`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ attendee_ids: [aid], decouple_only: true }),
      });
      if (!res.ok) throw new Error();
      toast.success(`${name} decoupled from conference.`);
    } catch {
      toast.error('Failed to decouple attendee.');
      setConference(prevConference);
    }
  };

  const handleDecoupleSelected = async () => {
    const count = selectedAttendeeIds.size;
    if (!confirm(`Decouple ${count} attendee(s) from this conference? Records will remain in the database.`)) return;
    const idsToRemove = new Set(selectedAttendeeIds);
    // Optimistic remove
    const prevConference = conference;
    setConference(prev => prev ? { ...prev, attendees: prev.attendees.filter(a => !idsToRemove.has(a.id)) } : prev);
    setSelectedAttendeeIds(new Set());
    try {
      const res = await fetch(`/api/conferences/${id}/attendees`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ attendee_ids: Array.from(idsToRemove), decouple_only: true }),
      });
      if (!res.ok) throw new Error();
      toast.success(`${count} attendee(s) decoupled.`);
    } catch {
      toast.error('Failed to decouple attendees.');
      setConference(prevConference);
    }
  };

  const handleMergeAttendees = async (masterId: number, duplicateIds: number[]) => {
    const dupSet = new Set(duplicateIds);
    const prevConference = conference;
    setConference(prev => prev ? { ...prev, attendees: prev.attendees.filter(a => !dupSet.has(a.id)) } : prev);
    setSelectedAttendeeIds(new Set());
    try {
      const res = await fetch('/api/attendees/merge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ master_id: masterId, duplicate_ids: duplicateIds }),
      });
      if (!res.ok) { const err = await res.json(); throw new Error(err.error || 'Merge failed'); }
      toast.success('Attendees merged!');
      fetchConference();
    } catch (e) {
      setConference(prevConference);
      throw e;
    }
  };

  const handleAttendeeEdit = async () => {
    if (selectedAttendeeIds.size === 0 || !conference) return;
    const ids = Array.from(selectedAttendeeIds);
    const fields: Record<string, string | number | null> = {};
    if (attendeeEditFields.status) fields.status = attendeeEditFields.status;
    if (attendeeEditFields.seniority) fields.seniority = attendeeEditFields.seniority;
    if (attendeeEditFields.function) fields.function = attendeeEditFields.function;
    if (attendeeEditFields.company_id) fields.company_id = parseInt(attendeeEditFields.company_id);
    if (attendeeEditFields.consent) fields.consent = attendeeEditFields.consent;
    if (Object.keys(fields).length === 0) return;

    const snapshot = conference.attendees;
    setConference(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        attendees: prev.attendees.map(a => {
          if (!selectedAttendeeIds.has(a.id)) return a;
          const updated = { ...a };
          if (fields.status != null) updated.status = String(fields.status);
          if (fields.seniority != null) updated.seniority = String(fields.seniority);
          if ('function' in fields) updated.function = fields.function == null ? undefined : String(fields.function);
          if (fields.company_id != null) {
            updated.company_id = Number(fields.company_id);
            updated.company_name = conferenceCompanies.find(c => c.id === Number(fields.company_id))?.name;
          }
          return updated;
        }),
      };
    });
    setShowAttendeeEdit(false);
    setAttendeeEditFields({});
    setIsApplyingAttendeeEdit(true);
    try {
      const res = await fetch('/api/attendees/bulk', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids, fields }),
      });
      if (!res.ok) throw new Error();
      toast.success(`${ids.length} attendee(s) updated.`);
    } catch {
      toast.error('Failed to update attendees.');
      setConference(prev => prev ? { ...prev, attendees: snapshot } : prev);
    } finally {
      setIsApplyingAttendeeEdit(false);
    }
  };

  const handleDecoupleCompanies = async (selectedCompanyIds: Set<number>) => {
    const count = selectedCompanyIds.size;
    if (!conference) return;
    const attendeeIds = conference.attendees
      .filter(a => a.company_id != null && selectedCompanyIds.has(a.company_id))
      .map(a => a.id);
    if (attendeeIds.length === 0) {
      toast.error('No attendees found for the selected company/companies.');
      return;
    }
    if (!confirm(`Decouple ${count} company/companies from this conference? Records will remain in the database.`)) return;
    // Optimistic remove
    const prevConference = conference;
    const prevCompanies = conferenceCompanies;
    setConference(prev => prev
      ? { ...prev, attendees: prev.attendees.filter(a => !(a.company_id != null && selectedCompanyIds.has(a.company_id))) }
      : prev
    );
    setConferenceCompanies(prev => prev.filter(c => !selectedCompanyIds.has(c.id)));
    try {
      const res = await fetch(`/api/conferences/${id}/attendees`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ attendee_ids: attendeeIds, decouple_only: true }),
      });
      if (!res.ok) throw new Error();
      toast.success(`${count} company/companies decoupled from conference.`);
    } catch {
      toast.error('Failed to decouple company/companies.');
      setConference(prevConference);
      setConferenceCompanies(prevCompanies);
    }
  };

  const handleAddAttendee = async () => {
    if (!addFormData.first_name || !addFormData.last_name) {
      toast.error('First and last name are required.');
      return;
    }
    setIsAddingAttendee(true);
    try {
      const res = await fetch(`/api/conferences/${id}/attendees/add`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(addFormData),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to add attendee');
      }
      toast.success('Attendee added!');
      setAddFormData({ first_name: '', last_name: '', title: '', company: '', email: '' });
      setShowAddForm(false);
      fetchConference();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to add attendee');
    } finally {
      setIsAddingAttendee(false);
    }
  };

  const handleUploadAttendees = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (uploadFileRef.current) uploadFileRef.current.value = '';
    const ext = file.name.toLowerCase().split('.').pop();
    if (!['xlsx', 'xls', 'csv'].includes(ext || '')) {
      toast.error('Please upload an Excel (.xlsx, .xls) or CSV file.');
      return;
    }
    setIsUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/upload-preview', { method: 'POST', body: fd });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        const msg = res.status === 413 ? 'File is too large. Please try a smaller file.' : (JSON.parse(text)?.error ?? 'Failed to read file');
        throw new Error(msg);
      }
      const data = await res.json();
      setPendingUploadFile(file);
      setColumnMappingData(data);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to read file');
    } finally {
      setIsUploading(false);
    }
  };

  const doUpload = async (mapping: ColumnMapping, resolutions: Record<string, 'accept' | 'ignore'>) => {
    if (!pendingUploadFile) return;
    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', pendingUploadFile);
      formData.append('mapping', JSON.stringify(mapping));
      if (Object.keys(resolutions).length > 0 || pendingConflicts !== null) {
        formData.append('conflict_resolutions', JSON.stringify(resolutions));
      }
      const res = await fetch(`/api/conferences/${id}/attendees/upload`, { method: 'POST', body: formData });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        let errMsg = 'Failed to upload attendees';
        if (res.status === 413) errMsg = 'File is too large. Please try a smaller file.';
        else { try { errMsg = JSON.parse(text)?.error ?? errMsg; } catch { /* plain-text error */ } }
        throw new Error(errMsg);
      }
      const result = await res.json();

      if (result.status === 'processing') {
        localStorage.setItem('upload_job_in_progress', JSON.stringify({
          jobId: result.job_id,
          conferenceId: id,
          conferenceName: result.conference_name,
          totalRows: result.total_rows,
        }));
        toast('Large file upload started — you\'ll be notified when it\'s complete.', { duration: 6000, icon: '⏳' });
        return;
      }

      if (result.new_count === 0 && (!result.updated_count || result.updated_count === 0)) {
        toast.success('All attendees in the file are already in this conference.');
      } else {
        const parts: string[] = [];
        if (result.new_count > 0) parts.push(`${result.new_count} new attendee(s) added`);
        if (result.updated_count > 0) parts.push(`${result.updated_count} existing record(s) updated`);
        if (result.skipped_count > 0) parts.push(`${result.skipped_count} unchanged`);
        toast.success(parts.join('. ') + '.');
      }
      fetchConference();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to upload attendees');
    } finally {
      setIsUploading(false);
      setPendingUploadFile(null);
      setPendingMapping(null);
      setPendingConflicts(null);
    }
  };

  const handleConfirmMapping = async (mapping: ColumnMapping) => {
    if (!pendingUploadFile) return;
    setColumnMappingData(null);
    setPendingMapping(mapping);
    setIsUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', pendingUploadFile);
      fd.append('mapping', JSON.stringify(mapping));
      const res = await fetch(`/api/conferences/${id}/attendees/upload/conflicts`, { method: 'POST', body: fd });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        let errMsg = 'Failed to check for conflicts';
        if (res.status === 413) errMsg = 'File is too large. Please try a smaller file.';
        else { try { errMsg = JSON.parse(text)?.error ?? errMsg; } catch { /* plain-text error */ } }
        throw new Error(errMsg);
      }
      const { conflicts }: { conflicts: ConflictItem[] } = await res.json();
      if (conflicts.length > 0) {
        setPendingConflicts(conflicts);
        setIsUploading(false);
        return; // wait for user to resolve conflicts in modal
      }
      // No conflicts — proceed directly
      await doUpload(mapping, {});
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to upload attendees');
      setIsUploading(false);
      setPendingUploadFile(null);
      setPendingMapping(null);
    }
  };

  const handleConflictResolved = async (resolutions: Record<string, 'accept' | 'ignore'>) => {
    if (!pendingMapping) return;
    setPendingConflicts(null);
    await doUpload(pendingMapping, resolutions);
  };

  useEffect(() => { setAttendeePage(1); }, [attendeeSearch, filterSeniority, filterCompanyType, filterStatus, filterConfCounts, filterUpdatedWithin, filterNeedsReview]);

  const CONF_COUNT_OPTIONS = ['1', '2', '3', '4+'];
  const toggleConfFilter = (val: string) => {
    setFilterConfCounts(prev => { const n = new Set(prev); n.has(val) ? n.delete(val) : n.add(val); return n; });
  };
  const confCountMatches = (count: number): boolean => {
    if (filterConfCounts.size === 0) return true;
    if (filterConfCounts.has('4+') && count >= 4) return true;
    if (filterConfCounts.has(String(count)) && count < 4) return true;
    return false;
  };

  // Fetch function and seniority option records once for the classify modal
  useEffect(() => {
    Promise.all([
      fetch('/api/config?category=function').then(r => r.json()),
      fetch('/api/config?category=seniority').then(r => r.json()),
    ]).then(([fnData, snData]) => {
      setClassifyFunctionOptions(fnData.map((o: { id: number; value: string }) => ({ id: Number(o.id), value: String(o.value) })));
      setClassifySeniorityOptions(snData.map((o: { id: number; value: string }) => ({ id: Number(o.id), value: String(o.value) })));
    }).catch(() => {});
  }, []);

  // Batch-fetch title metadata when conference attendees change
  useEffect(() => {
    const attendees = conference?.attendees ?? [];
    const ids = attendees.filter(a => a.title).map(a => a.id);
    if (ids.length === 0) { setTitleMetaMap({}); return; }
    setTitleMetaLoading(true);
    const chunks: number[][] = [];
    for (let i = 0; i < ids.length; i += 100) chunks.push(ids.slice(i, i + 100));
    Promise.all(chunks.map(chunk => {
      const key = `title-metadata:${chunk.join(',')}`;
      return getCached(key, () =>
        fetch(`/api/attendees/title-metadata?ids=${chunk.join(',')}`).then(r => r.json())
      );
    })).then(results => {
      const combined: Record<number, TitleMatchMetadata> = {};
      for (const res of results) {
        for (const [id, meta] of Object.entries(res as Record<string, unknown>)) {
          combined[Number(id)] = meta as TitleMatchMetadata;
        }
      }
      setTitleMetaMap(combined);
    }).catch(() => {}).finally(() => setTitleMetaLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conference?.attendees, titleMetaRefetch]);

  const seniorityFilterOptions = configOptions.seniority ?? [];
  const companyTypeFilterOptions = configOptions.company_type ?? [];

  const filteredAttendees = (conference?.attendees || [])
    .filter((a) => {
      if (attendeeSearch) {
        const fullName = `${a.first_name} ${a.last_name}`.toLowerCase();
        if (!(
          fullName.includes(attendeeSearch.toLowerCase()) ||
          (a.company_name?.toLowerCase().includes(attendeeSearch.toLowerCase())) ||
          (a.title?.toLowerCase().includes(attendeeSearch.toLowerCase()))
        )) return false;
      }
      if (filterSeniority && effectiveSeniority(a.seniority, a.title) !== filterSeniority) return false;
      if (filterCompanyType && (a.company_type || '') !== filterCompanyType) return false;
      if (filterStatus && !(a.status || '').split(',').map(s => s.trim()).some(s => s === filterStatus)) return false;
      if (!confCountMatches(Number(a.conference_count ?? 0))) return false;
      if (filterUpdatedWithin) {
        const days = filterUpdatedWithin === '1day' ? 1 : filterUpdatedWithin === '1week' ? 7 : filterUpdatedWithin === '2weeks' ? 14 : 30;
        const updAt = a.updated_at ? String(a.updated_at) : null;
        if (!updAt || new Date(updAt.endsWith('Z') || updAt.includes('+') ? updAt : updAt + 'Z').getTime() < Date.now() - days * 24 * 60 * 60 * 1000) return false;
      }
      if (filterNeedsReview && !(a.title ? shouldWarnForTitleMetadata(titleMetaMap[a.id]) : false)) return false;
      return true;
    })
    .sort((a, b) => {
      let aVal = '', bVal = '';
      if (sortKey === 'name') { aVal = `${a.last_name} ${a.first_name}`.toLowerCase(); bVal = `${b.last_name} ${b.first_name}`.toLowerCase(); }
      else if (sortKey === 'title') { aVal = (a.title || '').toLowerCase(); bVal = (b.title || '').toLowerCase(); }
      else if (sortKey === 'company') { aVal = (a.company_name || '').toLowerCase(); bVal = (b.company_name || '').toLowerCase(); }
      else if (sortKey === 'seniority') { aVal = effectiveSeniority(a.seniority, a.title); bVal = effectiveSeniority(b.seniority, b.title); }
      return sortDir === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
    });

  const attendeeTotalPages = Math.ceil(filteredAttendees.length / ATTENDEE_PAGE_SIZE);
  const paginatedAttendees = filteredAttendees.slice((attendeePage - 1) * ATTENDEE_PAGE_SIZE, attendeePage * ATTENDEE_PAGE_SIZE);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin w-8 h-8 border-4 border-brand-secondary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!conference) return null;

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <BackButton />
      {/* Column mapping modal */}
      {columnMappingData && pendingUploadFile && (
        <ColumnMappingModal
          fileName={pendingUploadFile.name}
          totalRows={columnMappingData.totalRows}
          headers={columnMappingData.headers}
          suggestions={columnMappingData.suggestions}
          sampleRows={columnMappingData.sampleRows}
          onConfirm={handleConfirmMapping}
          onCancel={() => { setColumnMappingData(null); setPendingUploadFile(null); }}
        />
      )}

      {/* Conflict resolution modal */}
      {pendingConflicts && pendingConflicts.length > 0 && (
        <ConflictResolutionModal
          conflicts={pendingConflicts}
          onResolve={handleConflictResolved}
          onCancel={() => {
            setPendingConflicts(null);
            setPendingUploadFile(null);
            setPendingMapping(null);
          }}
        />
      )}

      {/* Conference Info Card */}
      <div className="card">
        {isEditing ? (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-brand-primary font-serif">Edit Conference</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="label">Conference Name *</label>
                <input
                  value={editData.name || ''}
                  onChange={(e) => setEditData((p) => ({ ...p, name: e.target.value }))}
                  className="input-field"
                />
              </div>
              <div>
                <label className="label">Location *</label>
                <input
                  value={editData.location || ''}
                  onChange={(e) => setEditData((p) => ({ ...p, location: e.target.value }))}
                  className="input-field"
                />
              </div>
              <div>
                <label className="label">Start Date *</label>
                <input
                  type="date"
                  value={editData.start_date || ''}
                  onChange={(e) => setEditData((p) => ({ ...p, start_date: e.target.value }))}
                  className="input-field"
                />
              </div>
              <div>
                <label className="label">Conference Strategy</label>
                <select
                  value={editData.conference_strategy_type_id ? String(editData.conference_strategy_type_id) : ''}
                  onChange={(e) => setEditData((p) => ({ ...p, conference_strategy_type_id: e.target.value ? Number(e.target.value) : null }))}
                  className="input-field"
                >
                  <option value="">Select conference strategy...</option>
                  {conferenceStrategyOptions.map((o) => <option key={o.id} value={String(o.id)}>{o.value}</option>)}
                </select>
              </div>
              <div>
                <label className="label">End Date *</label>
                <input
                  type="date"
                  value={editData.end_date || ''}
                  onChange={(e) => setEditData((p) => ({ ...p, end_date: e.target.value }))}
                  className="input-field"
                />
              </div>
              <div className="md:col-span-2">
                <SeriesSeasonCombobox
                  seriesId={editSeries?.id ?? editData.series_id ?? null}
                  seasonId={editSeasonId}
                  onSeriesChange={(s) => {
                    setEditSeries(s);
                    setEditData((p) => ({ ...p, series_id: s?.id ?? null }));
                    if (!s) { setEditSeasonId(null); setEditData((p2) => ({ ...p2, season_id: null })); }
                    if (s?.industry_focus) setEditData((p) => ({ ...p, industry_focus: s.industry_focus ?? null }));
                    if (s?.conference_type) setEditData((p) => ({ ...p, conference_type: s.conference_type ?? null }));
                  }}
                  onSeasonChange={(sid) => { setEditSeasonId(sid); setEditData((p) => ({ ...p, season_id: sid })); }}
                />
              </div>

              <div className="md:col-span-2" ref={editIndustryDropdownRef}>
                <label className="label flex items-center gap-2">
                  Industry Focus
                  {editSeries && <span className="text-xs font-normal text-teal-600">• Synced to series</span>}
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={editIndustryDropdownOpen ? editIndustrySearch : (editData.industry_focus ?? '')}
                    onFocus={() => { setEditIndustryDropdownOpen(true); setEditIndustrySearch(editData.industry_focus ?? ''); }}
                    onChange={(e) => { setEditIndustrySearch(e.target.value); setEditData((p) => ({ ...p, industry_focus: e.target.value || null })); }}
                    placeholder="Search or add industry..."
                    className="input-field pr-8"
                    autoComplete="off"
                  />
                  {editData.industry_focus && !editIndustryDropdownOpen && (
                    <button type="button" onClick={() => setEditData((p) => ({ ...p, industry_focus: null }))} className="absolute inset-y-0 right-0 flex items-center pr-3">
                      <svg className="h-4 w-4 text-gray-400 hover:text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                  )}
                  {editIndustryDropdownOpen && (
                    <div className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-52 overflow-y-auto">
                      {industryOptions
                        .filter((o) => !editIndustrySearch || o.value.toLowerCase().includes(editIndustrySearch.toLowerCase()))
                        .map((opt) => (
                          <button key={opt.id} type="button" onClick={() => { setEditData((p) => ({ ...p, industry_focus: opt.value })); setEditIndustryDropdownOpen(false); setEditIndustrySearch(''); }} className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50">
                            {opt.value}
                          </button>
                        ))}
                      {editIndustrySearch && !industryOptions.some((o) => o.value.toLowerCase() === editIndustrySearch.toLowerCase()) && (
                        <button type="button" onClick={() => void createIndustryOption(editIndustrySearch, (val) => { setEditData((p) => ({ ...p, industry_focus: val })); setEditIndustryDropdownOpen(false); setEditIndustrySearch(''); })} className="w-full text-left px-3 py-2 text-sm text-brand-secondary hover:bg-blue-50 flex items-center gap-2 font-medium">
                          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                          Create &ldquo;{editIndustrySearch}&rdquo;
                        </button>
                      )}
                      {industryOptions.length === 0 && !editIndustrySearch && (
                        <div className="px-3 py-2 text-sm text-gray-400">No industry options configured. Type to create one.</div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              <div>
                <label className="label flex items-center gap-2">
                  Conference Type
                  {editSeries && <span className="text-xs font-normal text-teal-600">• Synced to series</span>}
                </label>
                <select
                  value={editData.conference_type ?? ''}
                  onChange={(e) => setEditData((p) => ({ ...p, conference_type: e.target.value || null }))}
                  className="input-field"
                >
                  <option value="">Select type...</option>
                  <option>Trade show</option>
                  <option>User conference</option>
                  <option>Executive summit</option>
                  <option>Hosted dinner / private event</option>
                  <option>Roundtable</option>
                  <option>Field event</option>
                  <option>Industry association conference</option>
                  <option>Analyst conference</option>
                  <option>Partner / ecosystem event</option>
                  <option>Other</option>
                </select>
              </div>

              <div>
                <label className="label">Website</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <svg className="h-4 w-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" /></svg>
                  </div>
                  <input
                    type="url"
                    value={editData.website ?? ''}
                    onChange={(e) => setEditData((p) => ({ ...p, website: e.target.value || null }))}
                    className="input-field pl-9"
                    placeholder="https://example.com"
                  />
                </div>
              </div>

              <div className="md:col-span-2">
                <label className="label">Sponsorship Level</label>
                <div className="flex flex-wrap items-center gap-2">
                  {sponsorshipOptions.map((opt) => {
                    const isSelected = (editData.sponsorship_level ?? '') === opt.value;
                    return (
                      <div key={opt.id} className="relative inline-flex">
                        <button
                          type="button"
                          onClick={() => setEditData((p) => ({ ...p, sponsorship_level: isSelected ? null : opt.value }))}
                          className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium border transition-all ${isSelected ? 'border-transparent text-white shadow-sm' : 'border-gray-300 bg-white text-gray-700 hover:border-gray-400'} ${!opt.is_system ? 'pr-6' : ''}`}
                          style={isSelected && opt.color ? { backgroundColor: opt.color } : {}}
                        >
                          {opt.is_system ? (
                            <svg className="w-3 h-3 flex-shrink-0 opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
                          ) : (
                            <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: isSelected ? 'rgba(255,255,255,0.55)' : '#9ca3af' }} />
                          )}
                          {opt.value}
                        </button>
                        {!opt.is_system && (
                          <button
                            type="button"
                            onClick={() => void deleteSponsorshipLevel(opt.id, opt.value)}
                            className="absolute right-1.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-red-500 transition-colors"
                            title={`Remove ${opt.value}`}
                          >
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                          </button>
                        )}
                      </div>
                    );
                  })}
                  {!sponsorshipAddOpen ? (
                    <button
                      type="button"
                      onClick={() => setSponsorshipAddOpen(true)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm text-brand-secondary border border-dashed border-brand-secondary/50 hover:bg-blue-50 transition-colors"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                      Add custom level
                    </button>
                  ) : (
                    <div className="flex items-center gap-1.5">
                      <input
                        type="text"
                        value={sponsorshipAddValue}
                        onChange={(e) => setSponsorshipAddValue(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void createSponsorshipLevel(); } if (e.key === 'Escape') { setSponsorshipAddOpen(false); setSponsorshipAddValue(''); } }}
                        placeholder="Level name..."
                        className="input-field text-sm py-1 h-8 w-36"
                        autoFocus
                      />
                      <button type="button" onClick={() => void createSponsorshipLevel()} disabled={!sponsorshipAddValue.trim() || sponsorshipAdding} className="btn-primary text-xs px-3 h-8 disabled:opacity-50">
                        {sponsorshipAdding ? '…' : 'Add'}
                      </button>
                      <button type="button" onClick={() => { setSponsorshipAddOpen(false); setSponsorshipAddValue(''); }} className="text-gray-400 hover:text-gray-600">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                      </button>
                    </div>
                  )}
                </div>
              </div>

              <div className="md:col-span-2">
                <label className="label">Booth</label>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    role="switch"
                    aria-checked={Boolean(editData.booth_present)}
                    onClick={() => setEditData((p) => ({ ...p, booth_present: p.booth_present ? 0 : 1, booth_width: p.booth_present ? null : p.booth_width, booth_length: p.booth_present ? null : p.booth_length, booth_number: p.booth_present ? null : p.booth_number, booth_hall: p.booth_present ? null : p.booth_hall }))}
                    className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors focus:outline-none ${editData.booth_present ? 'bg-brand-secondary' : 'bg-gray-200'}`}
                  >
                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform ${editData.booth_present ? 'translate-x-6' : 'translate-x-1'}`} />
                  </button>
                  <span className="text-sm text-gray-700">{editData.booth_present ? 'We have a booth' : 'No booth'}</span>
                </div>
                {Boolean(editData.booth_present) && (
                  <div className="mt-3 flex flex-wrap items-end gap-3">
                    <div>
                      <label className="label text-xs !mb-1">Length (ft)</label>
                      <input type="number" min="1" value={editData.booth_length ?? ''} onChange={(e) => setEditData((p) => ({ ...p, booth_length: e.target.value ? Number(e.target.value) : null }))} className="input-field w-24" placeholder="10" />
                    </div>
                    <span className="pb-2.5 text-gray-400 text-sm">×</span>
                    <div>
                      <label className="label text-xs !mb-1">Width (ft)</label>
                      <input type="number" min="1" value={editData.booth_width ?? ''} onChange={(e) => setEditData((p) => ({ ...p, booth_width: e.target.value ? Number(e.target.value) : null }))} className="input-field w-24" placeholder="10" />
                    </div>
                    <div>
                      <label className="label text-xs !mb-1">Booth #</label>
                      <input type="text" value={editData.booth_number ?? ''} onChange={(e) => setEditData((p) => ({ ...p, booth_number: e.target.value || null }))} className="input-field w-28" placeholder="e.g., 412" />
                    </div>
                    <div>
                      <label className="label text-xs !mb-1">Hall</label>
                      <input type="text" value={editData.booth_hall ?? ''} onChange={(e) => setEditData((p) => ({ ...p, booth_hall: e.target.value || null }))} className="input-field w-36" placeholder="e.g., Hall B" />
                    </div>
                  </div>
                )}
              </div>

              <div className="md:col-span-2">
                <input ref={agendaFileRef} type="file" accept="image/*,image/heic,application/pdf" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleAgendaFile(f); e.target.value = ''; }} />
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <label className="label">Conference Agenda <span className="text-gray-400 font-normal">(optional)</span></label>
                    <p className="text-xs text-gray-500 mb-2">Upload the conference agenda to share with all internal attendees.</p>
                    {agendaUploading ? (
                      <div className="flex items-center gap-2 text-sm text-gray-500">
                        <div className="h-4 w-4 animate-spin rounded-full border-2 border-brand-secondary border-t-transparent" />
                        Parsing agenda…
                      </div>
                    ) : agendaUploadSuccess ? (
                      <div className="flex items-center gap-3">
                        <span className="text-sm text-teal-700">{agendaUploadSuccess}</span>
                        <button type="button" onClick={() => { setAgendaUploadSuccess(null); setAgendaUrlPanelOpen(false); }} className="text-xs text-gray-400 hover:text-gray-600 underline">Replace</button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <button type="button" onClick={() => agendaFileRef.current?.click()} className="inline-flex items-center gap-1.5 text-sm text-gray-600 border border-gray-300 rounded-lg px-3 py-1.5 hover:bg-gray-50 transition-colors">
                          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" /></svg>
                          Upload agenda
                        </button>
                        <button type="button" onClick={() => { setAgendaUrlPanelOpen(p => !p); setAgendaUrlError(null); }} className={`inline-flex items-center gap-1.5 text-sm border rounded-lg px-3 py-1.5 transition-colors ${agendaUrlPanelOpen ? 'border-brand-secondary text-brand-secondary' : 'border-gray-300 text-gray-600 hover:bg-gray-50'}`}>
                          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" /></svg>
                          From link
                        </button>
                      </div>
                    )}
                    {agendaUrlPanelOpen && !agendaUploadSuccess && (
                      <div className="mt-2 flex gap-2">
                        <input type="url" value={agendaUrlInput} onChange={(e) => { setAgendaUrlInput(e.target.value); setAgendaUrlError(null); }} onKeyDown={(e) => e.key === 'Enter' && void handleAgendaUrl()} placeholder="https://example.com/agenda" className="input-field flex-1 text-sm" autoFocus />
                        <button
                          type="button"
                          onClick={() => void handleAgendaUrl()}
                          disabled={!agendaUrlInput.trim() || agendaUploading}
                          className="btn-primary inline-flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                        >
                          {agendaUploading ? (
                            <>
                              <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                              Importing…
                            </>
                          ) : 'Import'}
                        </button>
                      </div>
                    )}
                    {agendaUrlError && <p className="text-xs text-red-500 mt-1">{agendaUrlError}</p>}
                    {agendaUploadError && <p className="text-xs text-red-500 mt-1">{agendaUploadError}</p>}
                  </div>
                  {(() => {
                    const ts = agendaLastUploadedAt ?? conference?.global_agenda_uploaded_at ?? null;
                    const byName = conference?.global_agenda_uploaded_by_name ?? null;
                    if (!ts) return null;
                    const d = new Date(ts);
                    const formatted = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) + ' · ' + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
                    return (
                      <div className="shrink-0 text-right mt-5">
                        <p className="text-xs text-gray-400 leading-snug">Last uploaded</p>
                        <p className="text-xs text-gray-600 font-medium leading-snug">{formatted}</p>
                        {byName && <p className="text-xs text-gray-400 leading-snug">by {byName}</p>}
                      </div>
                    );
                  })()}
                </div>
              </div>

              <div className="md:col-span-2" ref={internalDropdownRef}>
                <label className="label">Internal Attendees</label>
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setInternalDropdownOpen(!internalDropdownOpen)}
                    className="input-field w-full text-left flex items-center justify-between"
                  >
                    <span className={editInternalAttendees.length === 0 ? 'text-gray-400' : 'text-gray-800'}>
                      {editInternalAttendees.length === 0
                        ? 'Select internal attendees...'
                        : `${editInternalAttendees.length} selected`}
                    </span>
                    <svg className={`w-4 h-4 text-gray-400 transition-transform ${internalDropdownOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                  {internalDropdownOpen && (
                    <div className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                      {userOptions.length === 0 ? (
                        <div className="px-3 py-2 text-sm text-gray-500">No users configured. Add users in the Admin panel.</div>
                      ) : (
                        userOptions.map((user) => {
                          const isSelected = editInternalAttendees.includes(user.value);
                          return (
                            <button
                              key={user.id}
                              type="button"
                              onClick={() => {
                                setEditInternalAttendees((prev) =>
                                  isSelected ? prev.filter((u) => u !== user.value) : [...prev, user.value]
                                );
                              }}
                              className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 flex items-center gap-2"
                            >
                              <span className={`w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center ${isSelected ? 'bg-brand-secondary border-brand-secondary' : 'border-gray-300'}`}>
                                {isSelected && (
                                  <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                  </svg>
                                )}
                              </span>
                              {user.value}
                            </button>
                          );
                        })
                      )}
                    </div>
                  )}
                </div>
                {editInternalAttendees.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {editInternalAttendees.map((user) => (
                      <span
                        key={user}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-blue-50 text-[#3A506B] border border-blue-200"
                      >
                        {user}
                        <button
                          type="button"
                          onClick={() => setEditInternalAttendees((prev) => prev.filter((u) => u !== user))}
                          className="hover:text-red-500"
                        >
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <button onClick={handleSave} disabled={isSaving} className="btn-primary">
                {isSaving ? 'Saving...' : 'Save'}
              </button>
              <button onClick={() => setIsEditing(false)} className="btn-secondary">
                Cancel
              </button>
              <button onClick={handleDelete} disabled={isDeleting} className="btn-danger">
                {isDeleting ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        ) : (
          <div>
            {/* Top row: report nav (scrollable) + Field Report pinned at right */}
            <div className="flex items-start relative">
              {/* Scrollable buttons — right padding reserves space for the absolutely-positioned button stack */}
              <div className="flex items-center gap-5 overflow-x-auto flex-nowrap hide-scrollbar flex-1 min-w-0 pr-10 sm:pr-44">
              <PreConferenceReview
                conferenceId={conference.id}
                conferenceName={conference.name}
                targetsReadOnly={conferenceStage === 'closed'}
              />
              <PostConferenceReview
                conferenceId={conference.id}
                conferenceName={conference.name}
              />
              <ConferenceEffectivenessModal
                conferenceId={conference.id}
                conferenceName={conference.name}
              />
              <button
                type="button"
                onClick={() => setShowBudgetModal(true)}
                className="flex items-center gap-1 text-sm font-medium text-gray-500 hover:text-brand-accent cursor-pointer transition-colors flex-shrink-0"
              >
                <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 11h.01M12 11h.01M15 11h.01M4 19h16a2 2 0 002-2V7a2 2 0 00-2-2H4a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
                Budget vs. Actual
              </button>
              </div>
              {/* Pinned right: divider + stacked Field Report / Activity map / Executive brief / Export CRM Files.
                  Absolutely positioned so its height (now 4 rows tall) doesn't force the whole
                  top row — and the gap below it — to grow with it. */}
              {isInternalAttendee && (
                <div className="hidden sm:flex absolute top-0 right-0 items-stretch gap-3 flex-shrink-0 bg-white pl-2">
                  <div className="self-stretch w-px bg-gray-200" />
                  <div className="flex flex-col gap-3 justify-center">
                    <button
                      type="button"
                      onClick={() => setShowDebrief(true)}
                      className="flex items-center gap-1.5 text-sm font-medium text-brand-accent hover:opacity-70 cursor-pointer transition-opacity flex-shrink-0"
                    >
                      <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M14 3v4a1 1 0 0 0 1 1h4" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M17 21h-10a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2h7l5 5v11a2 2 0 0 1 -2 2z" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 17l0 -5" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 17l0 -1" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 17l0 -3" />
                      </svg>
                      Field Report
                    </button>
                    <button
                      type="button"
                      onClick={() => setActivityMapOpen(true)}
                      className="flex items-center gap-1.5 text-sm font-medium text-brand-accent hover:opacity-70 cursor-pointer transition-opacity flex-shrink-0"
                    >
                      <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3 12h4l2 -6l4 12l2 -6h6" />
                      </svg>
                      Activity map
                    </button>
                    {capabilities?.planCapabilities?.revenue_intelligence?.executive_brief && (
                    <button
                      type="button"
                      onClick={() => setExecutiveBriefOpen(true)}
                      className="flex items-center gap-1.5 text-sm font-medium text-brand-accent hover:opacity-70 cursor-pointer transition-opacity flex-shrink-0"
                    >
                      <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3 4h18" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v10a2 2 0 0 0 2 2h12a2 2 0 0 0 2 -2v-10" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 16v4" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 20h6" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12v-4" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 12v-6" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12v-2" />
                      </svg>
                      Executive brief
                    </button>
                    )}
                    {capabilities?.capabilities?.crm_export && (
                      <button
                        type="button"
                        onClick={() => setShowCrmExport(true)}
                        className="flex items-center gap-1.5 text-sm font-medium text-brand-accent hover:opacity-70 cursor-pointer transition-opacity flex-shrink-0"
                      >
                        <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                        </svg>
                        Export CRM Files
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Mobile: same 4 links collapsed behind a kebab menu. Opaque bg + fixed width
                  masks the scrollable button row underneath so it doesn't peek out. */}
              {isInternalAttendee && (
                <div className="sm:hidden absolute top-0 right-0 bottom-0 w-10 flex items-start justify-end bg-white flex-shrink-0">
                  <button
                    type="button"
                    onClick={() => setMobileReportMenuOpen(v => !v)}
                    className="p-1.5 text-gray-500 hover:text-brand-accent transition-colors"
                    aria-label="More report options"
                  >
                    <svg className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
                      <circle cx="10" cy="4" r="1.5" />
                      <circle cx="10" cy="10" r="1.5" />
                      <circle cx="10" cy="16" r="1.5" />
                    </svg>
                  </button>
                  {mobileReportMenuOpen && (
                    <>
                      <div className="fixed inset-0 z-10" onClick={() => setMobileReportMenuOpen(false)} />
                      <div className="absolute top-full right-0 mt-1 w-52 bg-white rounded-lg shadow-lg border border-gray-100 py-1.5 z-20">
                        <button
                          type="button"
                          onClick={() => { setShowDebrief(true); setMobileReportMenuOpen(false); }}
                          className="flex items-center gap-2 w-full px-3 py-2 text-sm font-medium text-brand-accent hover:bg-gray-50 transition-colors"
                        >
                          <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M14 3v4a1 1 0 0 0 1 1h4" />
                            <path strokeLinecap="round" strokeLinejoin="round" d="M17 21h-10a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2h7l5 5v11a2 2 0 0 1 -2 2z" />
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 17l0 -5" />
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 17l0 -1" />
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15 17l0 -3" />
                          </svg>
                          Field Report
                        </button>
                        <button
                          type="button"
                          onClick={() => { setActivityMapOpen(true); setMobileReportMenuOpen(false); }}
                          className="flex items-center gap-2 w-full px-3 py-2 text-sm font-medium text-brand-accent hover:bg-gray-50 transition-colors"
                        >
                          <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M3 12h4l2 -6l4 12l2 -6h6" />
                          </svg>
                          Activity map
                        </button>
                        {capabilities?.planCapabilities?.revenue_intelligence?.executive_brief && (
                          <button
                            type="button"
                            onClick={() => { setExecutiveBriefOpen(true); setMobileReportMenuOpen(false); }}
                            className="flex items-center gap-2 w-full px-3 py-2 text-sm font-medium text-brand-accent hover:bg-gray-50 transition-colors"
                          >
                            <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M3 4h18" />
                              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v10a2 2 0 0 0 2 2h12a2 2 0 0 0 2 -2v-10" />
                              <path strokeLinecap="round" strokeLinejoin="round" d="M12 16v4" />
                              <path strokeLinecap="round" strokeLinejoin="round" d="M9 20h6" />
                              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12v-4" />
                              <path strokeLinecap="round" strokeLinejoin="round" d="M12 12v-6" />
                              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12v-2" />
                            </svg>
                            Executive brief
                          </button>
                        )}
                        {capabilities?.capabilities?.crm_export && (
                          <button
                            type="button"
                            onClick={() => { setShowCrmExport(true); setMobileReportMenuOpen(false); }}
                            className="flex items-center gap-2 w-full px-3 py-2 text-sm font-medium text-brand-accent hover:bg-gray-50 transition-colors"
                          >
                            <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                            </svg>
                            Export CRM Files
                          </button>
                        )}
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>

            {/* Main content */}
            <div className="mt-5">

              {/* Row 1: Name + status + Stage Controls */}
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-bold text-brand-primary font-serif">
                  {conference.name}{conference.start_date ? ` - ${new Date(conference.start_date).getUTCFullYear()}` : ''}
                </h1>
                {conferenceStage && (
                  <ConferenceStageBadge stage={conferenceStage} daysRemaining={stageDaysRemaining} />
                )}
                {!!conference.is_historical && (
                  <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold border border-amber-400 bg-amber-100 text-amber-900">
                    Historical Conference
                  </span>
                )}
                {isAdminUser && conferenceStage && (
                  <button
                    type="button"
                    onClick={() => setShowAdminStage(!showAdminStage)}
                    className="text-xs font-medium text-gray-400 hover:text-gray-600 flex items-center gap-1 transition-colors"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    Stage Controls
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setIsEditing(true)}
                  className="text-xs font-medium text-gray-400 hover:text-gray-600 flex items-center gap-1 transition-colors"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                  Edit
                </button>
              </div>

              {/* Row 2: Dates · Location · Website */}
              <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 mt-2">
                <span className="flex items-center gap-2 text-sm text-gray-600">
                  <svg className="w-4 h-4 text-brand-secondary flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  {formatDate(conference.start_date)}
                  {conference.end_date && conference.end_date !== conference.start_date
                    ? ` – ${formatDate(conference.end_date)}`
                    : ''}
                </span>
                <span className="flex items-center gap-2 text-sm text-gray-600">
                  <svg className="w-4 h-4 text-brand-secondary flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  {conference.location}
                </span>
                {conference.website && (
                  <span className="flex items-center gap-2 text-sm">
                    <svg className="w-4 h-4 text-brand-secondary flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 12m-9 0a9 9 0 1 0 18 0a9 9 0 1 0 -18 0" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3.6 9h16.8" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3.6 15h16.8" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M11.5 3a17 17 0 0 0 0 18" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12.5 3a17 17 0 0 1 0 18" />
                    </svg>
                    <a
                      href={conference.website.startsWith('http') ? conference.website : `https://${conference.website}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ color: '#185FA5' }}
                      className="hover:underline"
                    >
                      {conference.name} Website
                    </a>
                  </span>
                )}
              </div>

              {/* Row 3: Internal attendee pills */}
              <div className="flex flex-wrap gap-1.5 mt-3">
                {conference.internal_attendees?.split(',').filter(Boolean).map((user) => {
                  const parts = user.trim().split(/\s+/);
                  const initials = parts.length >= 2
                    ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
                    : parts[0].substring(0, 2).toUpperCase();
                  return (
                    <span
                      key={user}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-blue-50 text-[#3A506B] border border-blue-200"
                      title={user.trim()}
                    >
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                      </svg>
                      <span className="sm:hidden">{initials}</span>
                      <span className="hidden sm:inline">{user.trim()}</span>
                    </span>
                  );
                })}
                {!conference.internal_attendees?.trim() && (
                  <span className="text-xs text-gray-400">None listed</span>
                )}
              </div>

              {/* Row 4: Metadata pills */}
              {/* Mobile: collapsible toggle row */}
              <div className="sm:hidden flex items-center justify-between mt-3 mb-1">
                <button
                  type="button"
                  onClick={() => setMetaPillsExpanded(v => !v)}
                  className="flex items-center gap-1.5 text-xs font-medium text-gray-500 hover:text-gray-700 transition-colors"
                >
                  <svg
                    className={`w-3.5 h-3.5 transition-transform duration-200 ${metaPillsExpanded ? 'rotate-180' : ''}`}
                    fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                  </svg>
                  Details
                </button>
              </div>
              {/* Desktop: always visible divider; Mobile: hidden */}
              <div style={{ height: '0.5px' }} className="hidden sm:block bg-gray-100 my-3" />
              <div className={`flex flex-wrap items-end gap-6 mt-1 sm:flex ${metaPillsExpanded ? 'flex' : 'hidden'}`}>
                {conference.conference_type && (
                  <div>
                    <p className="text-[10px] font-medium text-gray-400 uppercase tracking-[0.07em] mb-1.5">Type</p>
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-[12px] font-semibold bg-amber-50 text-amber-800 border border-amber-300">
                      <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3 21l18 0" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3 7v1a3 3 0 0 0 6 0v-1m0 1a3 3 0 0 0 6 0v-1m0 1a3 3 0 0 0 6 0v-1h-18l2 -4h14l2 4" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 21l0 -10.15" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 21l0 -10.15" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 21v-4a2 2 0 0 1 2 -2h2a2 2 0 0 1 2 2v4" />
                      </svg>
                      {conference.conference_type}
                    </span>
                  </div>
                )}
                {!conference.is_historical && conference.conference_strategy_type_display_name && (
                  <div>
                    <p className="text-[10px] font-medium text-gray-400 uppercase tracking-[0.07em] mb-1.5">Strategy</p>
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-[12px] font-semibold bg-blue-50 text-blue-800 border border-blue-200">
                      <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 12m-3 0a3 3 0 1 0 6 0a3 3 0 1 0 -6 0" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 12m-8 0a8 8 0 1 0 16 0a8 8 0 1 0 -16 0" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 2l0 2" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 20l0 2" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M20 12l2 0" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M2 12l2 0" />
                      </svg>
                      {conference.conference_strategy_type_display_name}
                    </span>
                  </div>
                )}
                {conference.sponsorship_level && conference.sponsorship_level.toLowerCase() !== 'none' && (
                  <div>
                    <p className="text-[10px] font-medium text-gray-400 uppercase tracking-[0.07em] mb-1.5">Sponsorship</p>
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-[12px] font-semibold bg-green-50 text-green-800 border border-green-300">
                      <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M8 21l8 0" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 17l0 4" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M7 4l10 0" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M17 4v8a5 5 0 0 1 -10 0v-8" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 9m-2 0a2 2 0 1 0 4 0a2 2 0 1 0 -4 0" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 9m-2 0a2 2 0 1 0 4 0a2 2 0 1 0 -4 0" />
                      </svg>
                      {conference.sponsorship_level}
                    </span>
                  </div>
                )}
                <div>
                  <p className="text-[10px] font-medium text-gray-400 uppercase tracking-[0.07em] mb-1.5">Agenda</p>
                  {conference.global_agenda_uploaded_at ? (
                    <button
                      type="button"
                      onClick={() => setActiveTab('agenda')}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-[12px] font-semibold bg-green-50 text-green-800 border border-green-300 hover:bg-green-100 transition-colors cursor-pointer"
                    >
                      <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M14 3v4a1 1 0 0 0 1 1h4" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M17 21h-10a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2h7l5 5v11a2 2 0 0 1 -2 2z" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 15l2 2l4 -4" />
                      </svg>
                      Agenda Uploaded
                    </button>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-[12px] font-semibold bg-red-50 text-red-700 border border-red-300">
                      <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M14 3v4a1 1 0 0 0 1 1h4" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M17 21h-10a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2h7l5 5v11a2 2 0 0 1 -2 2z" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M10 12l4 4m0 -4l-4 4" />
                      </svg>
                      No Agenda
                    </span>
                  )}
                </div>
                <div>
                  <p className="text-[10px] font-medium text-gray-400 uppercase tracking-[0.07em] mb-1.5">Attendees</p>
                  {conference.attendees.length === 0 ? (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-[12px] font-semibold bg-amber-50 text-amber-700 border border-amber-300">
                      <svg className="w-3.5 h-3.5 flex-shrink-0 text-amber-500" fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M10.29 3.86l-8.58 14.86a1 1 0 00.87 1.5h17.16a1 1 0 00.87-1.5L12.71 3.86a1 1 0 00-1.42 0z" />
                      </svg>
                      Awaiting Attendee Upload
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-[12px] font-semibold bg-blue-50 text-blue-800 border border-blue-200">
                      <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 7m-4 0a4 4 0 1 0 8 0a4 4 0 1 0 -8 0" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3 21v-2a4 4 0 0 1 4 -4h4a4 4 0 0 1 4 4v2" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M16 3.13a4 4 0 0 1 0 7.75" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M21 21v-2a4 4 0 0 0 -3 -3.85" />
                      </svg>
                      {conference.attendees.length} attendees
                    </span>
                  )}
                </div>
                {conference.booth_present ? (
                  <div>
                    <p className="text-[10px] font-medium text-gray-400 uppercase tracking-[0.07em] mb-1.5">Booth</p>
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-[12px] font-semibold bg-purple-50 text-purple-800 border border-purple-300">
                      <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4 4m0 1a1 1 0 0 1 1 -1h14a1 1 0 0 1 1 1v14a1 1 0 0 1 -1 1h-14a1 1 0 0 1 -1 -1zm0 5l16 0m-5 -5l0 16m-6 -16l0 16" />
                      </svg>
                      Booth{conference.booth_number ? ` #${conference.booth_number}` : ''}{(conference.booth_width || conference.booth_length) ? ` · ${conference.booth_width ?? '?'}×${conference.booth_length ?? '?'} ft` : ''}
                    </span>
                  </div>
                ) : null}
              </div>

              {/* Banners */}
              {conference.notes && (
                <p className="text-sm text-gray-600 mt-3 max-w-2xl">{conference.notes}</p>
              )}
              {!!conference.is_historical && (
                <div className="mt-3 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-900">
                  This conference has a Calendar Recommendation Score.{' '}
                  <button
                    type="button"
                    onClick={() => router.push(`/program-intelligence?tab=calendar&conferenceId=${conference.id}`)}
                    className="font-semibold underline underline-offset-2"
                  >
                    View it in Calendar Intelligence →
                  </button>
                </div>
              )}
              {conferenceStage === 'post_conference' && !isAdminUser && (
                <div className="mt-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 flex items-start gap-2">
                  <svg className="w-4 h-4 mt-0.5 flex-shrink-0 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86l-8.58 14.86a1 1 0 00.87 1.5h17.16a1 1 0 00.87-1.5L12.71 3.86a1 1 0 00-1.42 0z" />
                  </svg>
                  <span>
                    <strong>Post-conference window is open.</strong> Log any remaining meetings, touchpoints, or follow-ups.{' '}
                    {stageDaysRemaining != null && (
                      <span className={stageDaysRemaining <= 2 ? 'font-semibold text-red-700' : ''}>
                        {stageDaysRemaining} day{stageDaysRemaining !== 1 ? 's' : ''} remaining before this conference closes.
                      </span>
                    )}
                  </span>
                </div>
              )}
              {isAdminUser && conferenceStage && showAdminStage && (
                <div className="mt-3 rounded-lg border border-gray-200 bg-gray-50 p-3 flex flex-wrap items-center gap-2">
                  {conferenceStage !== 'closed' && (
                    <button
                      type="button"
                      disabled={stageActionLoading}
                      onClick={() => applyStageAction('close_now')}
                      className="px-3 py-1.5 rounded text-xs font-medium bg-gray-700 text-white hover:bg-gray-900 disabled:opacity-50 transition-colors"
                    >
                      Close Now
                    </button>
                  )}
                  {conferenceStage === 'closed' && (
                    <button
                      type="button"
                      disabled={stageActionLoading}
                      onClick={() => applyStageAction('reopen')}
                      className="px-3 py-1.5 rounded text-xs font-medium bg-green-700 text-white hover:bg-green-900 disabled:opacity-50 transition-colors"
                    >
                      Reopen
                    </button>
                  )}
                  {conferenceStage === 'post_conference' && (
                    <div className="flex items-center gap-1.5">
                      <input
                        type="number"
                        min={1}
                        max={90}
                        value={stageExtendDays}
                        onChange={e => setStageExtendDays(Number(e.target.value))}
                        className="w-14 rounded border border-gray-300 px-2 py-1 text-xs text-center focus:outline-none focus:ring-1 focus:ring-brand-accent"
                      />
                      <button
                        type="button"
                        disabled={stageActionLoading}
                        onClick={() => applyStageAction('extend_window', { days: stageExtendDays })}
                        className="px-3 py-1.5 rounded text-xs font-medium bg-amber-600 text-white hover:bg-amber-800 disabled:opacity-50 transition-colors"
                      >
                        Extend Window
                      </button>
                    </div>
                  )}
                  {conference.stage_override && (
                    <button
                      type="button"
                      disabled={stageActionLoading}
                      onClick={() => applyStageAction('clear_override')}
                      className="px-3 py-1.5 rounded text-xs font-medium bg-white border border-gray-300 text-gray-700 hover:bg-gray-100 disabled:opacity-50 transition-colors"
                    >
                      Clear Override
                    </button>
                  )}
                  {conference.stage_override && (
                    <span className="text-xs text-gray-500">Override set by {conference.stage_override_by}</span>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 overflow-x-auto">
        <nav className="flex gap-1 sm:gap-6 whitespace-nowrap">
          {visibleConferenceTabs.map((tabKey) => {
            const baseLabel = conferenceTabConfig.getLabel(tabKey);
            const labelWithCount = tabKey === 'attendees'
              ? `${baseLabel} (${conference.attendees.length})`
              : tabKey === 'meetings' && confMeetings.length > 0
                ? `${baseLabel} (${confMeetings.length})`
                : tabKey === 'follow-ups' && confFollowUps.length > 0
                  ? `${baseLabel} (${confFollowUps.length})`
                  : tabKey === 'social' && confSocialEvents.length > 0
                    ? `${baseLabel} (${confSocialEvents.length})`
                    : tabKey === 'notes' && confNotes.length > 0
                      ? `${baseLabel} (${confNotes.length})`
                      : baseLabel;

            return (
              <button
                key={tabKey}
                onClick={() => handleTabChange(tabKey)}
                className={`py-3 px-2 sm:px-1 text-xs sm:text-sm font-medium border-b-2 transition-colors ${activeTab === tabKey ? 'border-brand-secondary text-brand-secondary' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
              >
                {labelWithCount}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Attendees Tab */}
      {activeTab === 'attendees' && (
        <div className="card">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <div className="flex items-center gap-3 flex-wrap">
              <h2 className="text-lg font-semibold text-brand-primary font-serif">Attendee List</h2>
              {titleMetaLoading && (
                <span className="flex items-center gap-1.5 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2.5 py-1">
                  <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" /></svg>
                  Title normalization is processing. This may take a few moments.
                </span>
              )}
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              {selectedAttendeeIds.size >= 1 && (
                <>
                  <button
                    onClick={() => setShowAttendeeEdit(v => !v)}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg bg-blue-50 border border-blue-300 text-blue-700 hover:bg-blue-100 transition-colors text-sm font-medium"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                    Edit Fields ({selectedAttendeeIds.size})
                  </button>
                  <button
                    onClick={handleDecoupleSelected}
                    disabled={isRemoving}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-50 border border-amber-300 text-amber-700 hover:bg-amber-100 transition-colors text-sm font-medium disabled:opacity-50"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                    </svg>
                    Decouple ({selectedAttendeeIds.size})
                  </button>
                  {selectedAttendeeIds.size >= 2 && (
                    <button
                      onClick={() => setShowMergeModal(true)}
                      className="btn-gold flex items-center gap-2 text-sm"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                      </svg>
                      Merge ({selectedAttendeeIds.size})
                    </button>
                  )}
                  <button
                    onClick={handleRemoveSelected}
                    disabled={isRemoving}
                    className="btn-danger flex items-center gap-2 text-sm"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                    Remove ({selectedAttendeeIds.size})
                  </button>
                  {!titleMetaLoading && (() => {
                    const warnCount = (conference?.attendees ?? []).filter(a => selectedAttendeeIds.has(a.id) && a.title && shouldWarnForTitleMetadata(titleMetaMap[a.id])).length;
                    const titleCount = (conference?.attendees ?? []).filter(a => selectedAttendeeIds.has(a.id) && a.title).length;
                    return titleCount > 0 ? (
                      <button onClick={() => setShowBulkClassify(true)} className="flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors text-sm font-medium">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" /></svg>
                        Classify Titles ({titleCount}{warnCount > 0 ? `, ${warnCount} flagged` : ''})
                      </button>
                    ) : null;
                  })()}
                </>
              )}
              <button
                onClick={() => setShowBatchScan(true)}
                className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-gray-100 transition-colors text-sm font-medium text-brand-primary"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                Scan Cards
              </button>
              <button
                onClick={() => setShowAddForm((v) => !v)}
                className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-gray-100 transition-colors text-sm font-medium text-brand-primary"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                </svg>
                Add Attendee
              </button>
              <button
                onClick={() => uploadFileRef.current?.click()}
                disabled={isUploading}
                className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-gray-100 transition-colors text-sm font-medium text-brand-primary disabled:opacity-50"
              >
                {isUploading ? (
                  <>
                    <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                    </svg>
                    Uploading...
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                    </svg>
                    Upload List
                  </>
                )}
              </button>
              <input
                ref={uploadFileRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                className="hidden"
                onChange={handleUploadAttendees}
              />
              <div className="relative">
                <svg className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input
                  value={attendeeSearch}
                  onChange={(e) => setAttendeeSearch(e.target.value)}
                  placeholder="Search attendees..."
                  className="input-field pl-9 w-56"
                />
              </div>
              {/* Filters toggle button */}
              <button
                onClick={() => setAttendeeFiltersOpen(v => !v)}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${attendeeFiltersOpen ? 'bg-brand-secondary text-white border-brand-secondary' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'}`}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2a1 1 0 01-.293.707L13 13.414V19a1 1 0 01-.553.894l-4 2A1 1 0 017 21v-7.586L3.293 6.707A1 1 0 013 6V4z" />
                </svg>
                Filters
                {(filterSeniority || filterCompanyType || filterStatus || filterConfCounts.size > 0 || filterUpdatedWithin || filterNeedsReview) && (
                  <span className="ml-0.5 min-w-[18px] h-[18px] rounded-full bg-white text-brand-secondary text-[10px] font-bold flex items-center justify-center px-1 leading-none border border-brand-secondary">
                    {(filterSeniority ? 1 : 0) + (filterCompanyType ? 1 : 0) + (filterStatus ? 1 : 0) + (filterConfCounts.size > 0 ? 1 : 0) + (filterUpdatedWithin ? 1 : 0) + (filterNeedsReview ? 1 : 0)}
                  </span>
                )}
              </button>
            </div>
          </div>

          {/* Bulk edit panel */}
          {showAttendeeEdit && selectedAttendeeIds.size >= 1 && (
            <div className="mb-4 px-4 py-3 bg-blue-50 border border-blue-200 rounded-xl">
              <div className="flex flex-wrap items-end gap-3">
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Status</p>
                  <select value={attendeeEditFields.status || ''} onChange={e => setAttendeeEditFields(p => ({ ...p, status: e.target.value }))} className="input-field w-36 text-sm">
                    <option value="">— no change —</option>
                    {(allConfigOptions.status ?? []).map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Seniority</p>
                  <select value={attendeeEditFields.seniority || ''} onChange={e => setAttendeeEditFields(p => ({ ...p, seniority: e.target.value }))} className="input-field w-40 text-sm">
                    <option value="">— no change —</option>
                    {seniorityFilterOptions.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Function</p>
                  <select value={attendeeEditFields.function ?? ''} onChange={e => setAttendeeEditFields(p => ({ ...p, function: e.target.value }))} className="input-field w-40 text-sm">
                    <option value="">— no change —</option>
                    {(allConfigOptions.function ?? []).map(f => <option key={f} value={f}>{f}</option>)}
                  </select>
                </div>
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Company</p>
                  <select value={attendeeEditFields.company_id || ''} onChange={e => setAttendeeEditFields(p => ({ ...p, company_id: e.target.value }))} className="input-field w-48 text-sm">
                    <option value="">— no change —</option>
                    {conferenceCompanies.map(c => <option key={c.id} value={String(c.id)}>{c.name}</option>)}
                  </select>
                </div>
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Consent</p>
                  <select value={attendeeEditFields.consent || ''} onChange={e => setAttendeeEditFields(p => ({ ...p, consent: e.target.value }))} className="input-field w-48 text-sm">
                    <option value="">— no change —</option>
                    <option value="Opted-In">Opted-In</option>
                    <option value="Opted-Out">Opted-Out</option>
                    <option value="Consent Not Recorded">Consent Not Recorded</option>
                  </select>
                </div>
                <button
                  onClick={handleAttendeeEdit}
                  disabled={isApplyingAttendeeEdit || (!attendeeEditFields.status && !attendeeEditFields.seniority && !attendeeEditFields.function && !attendeeEditFields.company_id && !attendeeEditFields.consent)}
                  className="btn-primary text-sm disabled:opacity-50"
                >
                  {isApplyingAttendeeEdit ? 'Applying…' : 'Apply'}
                </button>
                <button
                  onClick={() => { setShowAttendeeEdit(false); setAttendeeEditFields({}); }}
                  className="text-sm text-gray-500 hover:text-gray-700"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Collapsible attendee filters pane */}
          {attendeeFiltersOpen && (
            <div className="mb-4 px-6 py-4 bg-gray-50 border border-gray-200 rounded-xl">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Company Type</p>
                  <select value={filterCompanyType} onChange={e => setFilterCompanyType(e.target.value)} className="input-field w-full text-sm">
                    <option value="">All Company Types</option>
                    {companyTypeFilterOptions.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Status</p>
                  <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="input-field w-full text-sm">
                    <option value="">All Statuses</option>
                    {(allConfigOptions.status ?? []).map(s => <option key={s} value={s}>{s}</option>)}
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
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Title Status</p>
                  <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer border border-gray-200 rounded-lg px-3 py-2 bg-white">
                    <input type="checkbox" checked={filterNeedsReview} onChange={e => setFilterNeedsReview(e.target.checked)} className="accent-brand-secondary" />
                    Needs Title Review
                    {titleMetaLoading && <span className="text-xs text-gray-400">…</span>}
                  </label>
                </div>
              </div>
              {(filterSeniority || filterCompanyType || filterStatus || filterConfCounts.size > 0 || filterUpdatedWithin || filterNeedsReview) && (
                <div className="mt-3 flex justify-end">
                  <button
                    type="button"
                    onClick={() => { setFilterSeniority(''); setFilterCompanyType(''); setFilterStatus(''); setFilterConfCounts(new Set()); setFilterUpdatedWithin(''); setFilterNeedsReview(false); }}
                    className="text-xs text-gray-500 hover:text-red-500 transition-colors"
                  >
                    Clear all filters
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Add Attendee Inline Form */}
          {showAddForm && (
            <div className="mb-4 p-4 bg-blue-50 border border-brand-secondary rounded-xl">
              <h3 className="text-sm font-semibold text-brand-primary mb-3">Add Attendee to Conference</h3>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                <div>
                  <label className="label text-xs">First Name *</label>
                  <input
                    value={addFormData.first_name}
                    onChange={(e) => setAddFormData((p) => ({ ...p, first_name: e.target.value }))}
                    className="input-field"
                    placeholder="First name"
                  />
                </div>
                <div>
                  <label className="label text-xs">Last Name *</label>
                  <input
                    value={addFormData.last_name}
                    onChange={(e) => setAddFormData((p) => ({ ...p, last_name: e.target.value }))}
                    className="input-field"
                    placeholder="Last name"
                  />
                </div>
                <div>
                  <label className="label text-xs">Title</label>
                  <input
                    value={addFormData.title}
                    onChange={(e) => setAddFormData((p) => ({ ...p, title: e.target.value }))}
                    className="input-field"
                    placeholder="Job title"
                  />
                </div>
                <div>
                  <label className="label text-xs">Company</label>
                  <input
                    value={addFormData.company}
                    onChange={(e) => setAddFormData((p) => ({ ...p, company: e.target.value }))}
                    className="input-field"
                    placeholder="Company name"
                  />
                </div>
                <div>
                  <label className="label text-xs">Email</label>
                  <input
                    type="email"
                    value={addFormData.email}
                    onChange={(e) => setAddFormData((p) => ({ ...p, email: e.target.value }))}
                    className="input-field"
                    placeholder="email@example.com"
                  />
                </div>
              </div>
              <div className="flex gap-2 mt-3">
                <button
                  onClick={handleAddAttendee}
                  disabled={isAddingAttendee}
                  className="btn-primary text-sm"
                >
                  {isAddingAttendee ? 'Adding...' : 'Add'}
                </button>
                <button
                  onClick={() => {
                    setShowAddForm(false);
                    setAddFormData({ first_name: '', last_name: '', title: '', company: '', email: '' });
                  }}
                  className="btn-secondary text-sm"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {filteredAttendees.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-gray-400 text-sm">
                {attendeeSearch ? 'No attendees match your search.' : 'No attendees for this conference yet.'}
              </p>
            </div>
          ) : (
            <>
              {/* Mobile card list */}
              <div className="block lg:hidden divide-y divide-gray-100 -mx-6">
                {paginatedAttendees.map((attendee) => {
                  const seniority = effectiveSeniority(attendee.seniority, attendee.title);
                  return (
                    <div key={attendee.id} className={`px-4 py-4 ${selectedAttendeeIds.has(attendee.id) ? 'bg-blue-50' : 'bg-white'}`}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          <input type="checkbox" checked={selectedAttendeeIds.has(attendee.id)} onChange={() => toggleAttendeeSelect(attendee.id)} className="accent-brand-secondary flex-shrink-0" />
                          <button
                            type="button"
                            onClick={() => { setQuickViewId(attendee.id); setQuickViewType('attendee'); }}
                            className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-brand-secondary flex-shrink-0"
                            title="Quick view"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                            </svg>
                          </button>
                          <Link href={`/attendees/${attendee.id}`} className="font-semibold text-brand-secondary hover:underline text-sm truncate">
                            {attendee.first_name} {attendee.last_name}
                          </Link>
                        </div>
                      </div>
                      {attendee.title && (
                        <div className="flex items-center gap-1 mt-1 ml-6">
                          <button type="button" onClick={() => setClassifyingAttendee({ id: attendee.id, title: attendee.title! })} className="text-xs text-gray-500 hover:text-brand-secondary text-left">
                            {attendee.title}
                          </button>
                          {!titleMetaLoading && shouldWarnForTitleMetadata(titleMetaMap[attendee.id]) && (
                            <span className="text-amber-500 flex-shrink-0 pointer-events-none">
                              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" /></svg>
                            </span>
                          )}
                        </div>
                      )}
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
                          <ConferenceCountTooltip count={Number(attendee.conference_count ?? 0)} names={attendee.conference_names as string | undefined} />
                        </span>
                        {Number(attendee.entity_notes_count ?? 0) > 0 && (
                          <NotesPopover attendeeId={attendee.id} notesCount={Number(attendee.entity_notes_count)} />
                        )}
                      </div>
                      {attendee.created_at && (
                        <p className="text-[11px] text-gray-400 mt-1 ml-6">Added {fmtDate(attendee.created_at)}</p>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Desktop table */}
            <div className="hidden lg:block overflow-x-auto">
              <table className="w-full text-sm" style={{ tableLayout: 'fixed' }}>
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="px-4 py-3 text-left" style={{ width: 40 }}>
                      <input
                        type="checkbox"
                        checked={selectedAttendeeIds.size === filteredAttendees.length && filteredAttendees.length > 0}
                        onChange={(e) => {
                          if (e.target.checked) setSelectedAttendeeIds(new Set(filteredAttendees.map((a) => a.id)));
                          else setSelectedAttendeeIds(new Set());
                        }}
                        className="accent-brand-secondary"
                      />
                    </th>
                    {confAttendeeColumns.map(col => {
                      if (!isConfAttendeeColVisible(col.key)) return null;
                      const rh = (c: string) => <div key={c} onMouseDown={e => startResize(e, c)} style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: 4, cursor: 'col-resize', userSelect: 'none', zIndex: 10 }} className="hover:bg-brand-secondary opacity-0 hover:opacity-30" />;
                      const sortThCls = "px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider select-none transition-colors whitespace-nowrap relative cursor-pointer hover:text-brand-secondary";
                      const plainThCls = "px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider whitespace-nowrap relative";
                      switch (col.key) {
                        case 'name': return <th key="name" onClick={() => handleSort('name')} className={sortThCls} style={{ width: colWidths.name }}>Name{sortKey === 'name' && <span className="ml-1">{sortDir === 'asc' ? '↑' : '↓'}</span>}{rh('name')}</th>;
                        case 'title': return <th key="title" onClick={() => handleSort('title')} className={sortThCls} style={{ width: colWidths.title }}>Title{sortKey === 'title' && <span className="ml-1">{sortDir === 'asc' ? '↑' : '↓'}</span>}{rh('title')}</th>;
                        case 'company': return <th key="company" onClick={() => handleSort('company')} className={sortThCls} style={{ width: colWidths.company }}>Company{sortKey === 'company' && <span className="ml-1">{sortDir === 'asc' ? '↑' : '↓'}</span>}{rh('company')}</th>;
                        case 'type': return <th key="type" className={plainThCls} style={{ width: colWidths.type }}>Type{rh('type')}</th>;
                        case 'seniority': return <th key="seniority" onClick={() => handleSort('seniority')} className={sortThCls} style={{ width: colWidths.seniority }}>Seniority{sortKey === 'seniority' && <span className="ml-1">{sortDir === 'asc' ? '↑' : '↓'}</span>}{rh('seniority')}</th>;
                        case 'conferences': return <th key="conferences" className={plainThCls} style={{ width: colWidths.conferences }}># Conf{rh('conferences')}</th>;
                        case 'notes': return <th key="notes" className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Notes</th>;
                        case 'date_added': return <th key="date_added" className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider whitespace-nowrap">Date Added</th>;
                        default: return null;
                      }
                    })}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {paginatedAttendees.map((attendee) => (
                    <tr key={attendee.id} className={`hover:bg-gray-50 transition-colors ${selectedAttendeeIds.has(attendee.id) ? 'bg-blue-50' : ''}`}>
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={selectedAttendeeIds.has(attendee.id)}
                          onChange={() => toggleAttendeeSelect(attendee.id)}
                          className="accent-brand-secondary"
                        />
                      </td>
                      {confAttendeeColumns.map(col => {
                        if (!isConfAttendeeColVisible(col.key)) return null;
                        switch (col.key) {
                          case 'name': return (
                            <td key="name" className="px-4 py-3 font-medium overflow-visible">
                              <div className="flex items-center gap-1 text-left">
                                <button
                                  type="button"
                                  onClick={() => { setQuickViewId(attendee.id); setQuickViewType('attendee'); }}
                                  className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-brand-secondary flex-shrink-0"
                                  title="Quick view"
                                >
                                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                  </svg>
                                </button>
                                <Link href={`/attendees/${attendee.id}`} className="text-brand-secondary hover:underline block truncate" title={`${attendee.first_name} ${attendee.last_name}`}>
                                  {attendee.first_name} {attendee.last_name}
                                </Link>
                              </div>
                            </td>
                          );
                          case 'title': return (
                            <td key="title" className="px-4 py-3 text-gray-600 overflow-visible relative" style={{ maxWidth: colWidths.title }}>
                              <div className="flex items-start gap-1 min-w-0">
                                {attendee.title ? (
                                  <button type="button" className="text-left flex-1 min-w-0 hover:text-brand-secondary" onClick={() => setClassifyingAttendee({ id: attendee.id, title: attendee.title! })}>
                                    <span className="block text-xs leading-snug break-words whitespace-normal">{attendee.title}</span>
                                  </button>
                                ) : (
                                  <span className="text-gray-300">—</span>
                                )}
                                {!titleMetaLoading && attendee.title && shouldWarnForTitleMetadata(titleMetaMap[attendee.id]) && (
                                  <span className="flex-shrink-0 text-amber-500 mt-0.5 pointer-events-none">
                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" /></svg>
                                  </span>
                                )}
                              </div>
                            </td>
                          );
                          case 'company': return (
                            <td key="company" className="px-4 py-3 overflow-visible relative">
                              {attendee.company_name ? (
                                <div>
                                  {attendee.company_id ? (
                                    <Link href={`/companies/${attendee.company_id}`} className="text-xs text-brand-secondary hover:underline break-words whitespace-normal leading-snug">{attendee.company_name}</Link>
                                  ) : (
                                    <span className="text-xs text-gray-800 break-words whitespace-normal leading-snug">{attendee.company_name}</span>
                                  )}
                                </div>
                              ) : (
                                <span className="text-gray-300">—</span>
                              )}
                            </td>
                          );
                          case 'type': return (
                            <td key="type" className="px-4 py-3 overflow-visible relative">
                              {editingCell?.attendeeId === attendee.id && editingCell.field === 'company_type' ? (
                                <select className="input-field bg-white text-sm py-2 min-w-[260px] w-auto relative z-30 shadow-md" value={cellDraft} onChange={(e) => setCellDraft(e.target.value)} onBlur={() => saveInlineEdit(attendee, 'company_type')} autoFocus>
                                  <option value="">—</option>
                                  {companyTypeFilterOptions.map(t => <option key={t} value={t}>{t}</option>)}
                                </select>
                              ) : (
                                <button type="button" onClick={() => startInlineEdit(attendee, 'company_type')}>
                                  {attendee.company_type ? (<span className={`${getBadgeClass(attendee.company_type, colorMaps.company_type || {})} text-xs`}>{attendee.company_type}</span>) : (<span className="text-gray-300">—</span>)}
                                </button>
                              )}
                            </td>
                          );
                          case 'seniority': return (
                            <td key="seniority" className="px-4 py-3 overflow-visible relative">
                              {editingCell?.attendeeId === attendee.id && editingCell.field === 'seniority' ? (
                                <select className="input-field bg-white text-sm py-2 min-w-[260px] w-auto relative z-30 shadow-md" value={cellDraft} onChange={(e) => setCellDraft(e.target.value)} onBlur={() => saveInlineEdit(attendee, 'seniority')} autoFocus>
                                  <option value="">Auto-detect</option>
                                  {seniorityFilterOptions.map(s => <option key={s} value={s}>{s}</option>)}
                                </select>
                              ) : ((() => { const s = effectiveSeniority(attendee.seniority, attendee.title); return (<button type="button" onClick={() => startInlineEdit(attendee, 'seniority')}><span className={getBadgeClass(s, colorMaps.seniority || {})}>{s}</span></button>); })())}
                            </td>
                          );
                          case 'conferences': return (
                            <td key="conferences" className="px-4 py-3">
                              <ConferenceCountTooltip count={Number(attendee.conference_count ?? 0)} names={attendee.conference_names as string | undefined} />
                            </td>
                          );
                          case 'notes': return (
                            <td key="notes" className="px-4 py-3">
                              {Number(attendee.entity_notes_count ?? 0) > 0 ? <NotesPopover attendeeId={attendee.id} notesCount={Number(attendee.entity_notes_count)} /> : <span className="text-gray-300">—</span>}
                            </td>
                          );
                          case 'date_added': return (
                            <td key="date_added" className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">{fmtDate(attendee.created_at)}</td>
                          );
                          default: return null;
                        }
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            </>
          )}

          {/* Pagination */}
          {attendeeTotalPages > 1 && (
            <div className="flex items-center justify-between mt-4 pt-3 border-t border-gray-100">
              <span className="text-xs text-gray-500">Page {attendeePage} of {attendeeTotalPages} · {filteredAttendees.length} total</span>
              <div className="flex items-center gap-2">
                <button disabled={attendeePage === 1} onClick={() => setAttendeePage(p => p - 1)} className="px-3 py-1 text-xs rounded border border-gray-200 disabled:opacity-40 hover:bg-gray-50">Previous</button>
                <button disabled={attendeePage >= attendeeTotalPages} onClick={() => setAttendeePage(p => p + 1)} className="px-3 py-1 text-xs rounded border border-gray-200 disabled:opacity-40 hover:bg-gray-50">Next</button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Companies Tab */}
      {activeTab === 'companies' && (
        <div className="card">
          {isLoadingCompanies ? (
            <div className="flex justify-center py-12">
              <div className="animate-spin w-6 h-6 border-4 border-brand-secondary border-t-transparent rounded-full" />
            </div>
          ) : (
            <CompanyTable
              companies={conferenceCompanies}
              onRefresh={loadCompanies}
              tableName="conference_companies"
              onDecoupleSelected={handleDecoupleCompanies}
            />
          )}
        </div>
      )}

      {/* Analytics Tab */}
      {activeTab === 'analytics' && (
        <AnalyticsCharts attendees={conference.attendees} conferenceDetails={conferenceDetails} conferenceName={conference?.name || ''} actionConfigs={actionConfigs} />
      )}

      {/* Notes Tab */}
      {activeTab === 'notes' && (
        <>
        <PinnedNotesSection pinnedNotes={confPinnedNotes} onUnpin={async (pinId: number) => {
          if (!confirm('Unpin this note?')) return;
          try {
            const res = await fetch('/api/pinned-notes', {
              method: 'DELETE',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ id: pinId }),
            });
            if (!res.ok) throw new Error();
            toast.success('Note unpinned.');
            setConfPinnedNotes(prev => prev.filter(p => p.id !== pinId));
          } catch {
            toast.error('Failed to unpin note.');
          }
        }} />
        <NotesSection
          entityType="conference"
          entityId={Number(id)}
          initialNotes={confNotes}
          companies={conferenceCompanies.map(c => ({ id: c.id, name: c.name }))}
          attendees={(conference?.attendees || []).map(a => ({ id: a.id, first_name: a.first_name, last_name: a.last_name, company_id: a.company_id, company_name: a.company_name }))}
          currentConferenceName={conference?.name}
          showPinnedIndicator
          pinnedNoteIds={confPinnedNoteIds}
        />
        </>
      )}

      {/* Follow Ups Tab */}
      {activeTab === 'meetings' && (() => {
        const attendeeMap = new Map((conference?.attendees || []).map(a => [a.id, a]));
        const conferenceDates = conference ? getConferenceDates(conference.start_date, conference.end_date) : [];
        const anyFilters = meetingFilterReps.length > 0 || meetingFilterDates.length > 0 || meetingFilterCompanyTypes.length > 0 || meetingFilterSeniorities.length > 0;
        const activeFilterCount = [meetingFilterReps, meetingFilterDates, meetingFilterCompanyTypes, meetingFilterSeniorities].filter(f => f.length > 0).length;
        const filteredMeetings = confMeetings.filter(m => {
          if (meetingFilterReps.length > 0) {
            const ids = (m.scheduled_by || '').split(',').map(s => parseInt(s.trim())).filter(n => !isNaN(n));
            if (!meetingFilterReps.some(id => ids.includes(id))) return false;
          }
          if (meetingFilterDates.length > 0 && !meetingFilterDates.includes(m.meeting_date)) return false;
          if (meetingFilterCompanyTypes.length > 0) {
            const att = attendeeMap.get(m.attendee_id);
            if (!att?.company_type || !meetingFilterCompanyTypes.includes(att.company_type)) return false;
          }
          if (meetingFilterSeniorities.length > 0) {
            const att = attendeeMap.get(m.attendee_id);
            if (!att) return false;
            if (!meetingFilterSeniorities.includes(effectiveSeniority(att.seniority, att.title))) return false;
          }
          return true;
        });
        const activePills: { label: string; shortLabel: string; onRemove: () => void }[] = [
          ...meetingFilterReps.map(rid => {
            const u = userOptions.find(o => o.id === rid);
            return { label: u ? u.value : String(rid), shortLabel: u ? getRepInitials(u.value) : String(rid), onRemove: () => setMeetingFilterReps(meetingFilterReps.filter(x => x !== rid)) };
          }),
          ...meetingFilterDates.map(d => ({ label: formatDayLabel(d), shortLabel: formatDayLabel(d), onRemove: () => setMeetingFilterDates(meetingFilterDates.filter(x => x !== d)) })),
          ...meetingFilterCompanyTypes.map(t => ({ label: t, shortLabel: t, onRemove: () => setMeetingFilterCompanyTypes(meetingFilterCompanyTypes.filter(x => x !== t)) })),
          ...meetingFilterSeniorities.map(s => ({ label: s, shortLabel: s, onRemove: () => setMeetingFilterSeniorities(meetingFilterSeniorities.filter(x => x !== s)) })),
        ];
        const PillList = ({ useShortLabel, className }: { useShortLabel?: boolean; className?: string }) => (
          <div className={`flex flex-wrap gap-1.5 ${className ?? ''}`}>
            {activePills.map((pill, i) => (
              <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200 whitespace-nowrap">
                {useShortLabel ? pill.shortLabel : pill.label}
                <button type="button" onClick={pill.onRemove} className="hover:text-red-500 leading-none ml-0.5">
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </span>
            ))}
          </div>
        );
        return (
          <div className="card p-0 overflow-hidden">
            {/* Header */}
            <div className="px-6 py-4 border-b border-gray-100">
              {/* Top row: title + desktop pills + filters button */}
              <div className="flex items-center gap-3">
                <h2 className="text-lg font-semibold text-brand-primary font-serif flex-shrink-0">
                  Meetings
                  {confMeetings.length > 0 && (
                    <span className="ml-2 text-sm font-normal text-gray-500">
                      ({filteredMeetings.length}{filteredMeetings.length !== confMeetings.length && ` of ${confMeetings.length}`})
                    </span>
                  )}
                </h2>
                {/* Desktop: pills inline between count and Filters button — full rep names */}
                {anyFilters && <div className="hidden lg:block flex-1 min-w-0"><PillList useShortLabel={false} /></div>}
                <div className="ml-auto flex-shrink-0 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setNewMeetingOpen(true)}
                    disabled={stagePermissions != null && !stagePermissions.canLogMeeting}
                    title={stagePermissions != null && !stagePermissions.canLogMeeting ? 'Activity logging is closed for this conference.' : undefined}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-brand-secondary text-brand-secondary text-sm font-medium hover:bg-blue-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    Meeting
                  </button>
                  <button
                    type="button"
                    onClick={() => setMeetingFiltersOpen(o => !o)}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm font-medium transition-colors ${
                      anyFilters
                        ? 'border-brand-secondary text-brand-secondary bg-blue-50'
                        : 'border-gray-200 text-gray-600 hover:border-gray-400'
                    }`}
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                    </svg>
                    Filters
                    {anyFilters && (
                      <span className="bg-brand-secondary text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center leading-none">
                        {activeFilterCount}
                      </span>
                    )}
                    <svg className={`w-3.5 h-3.5 text-gray-400 transition-transform ${meetingFiltersOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                </div>
              </div>
              {/* Mobile: pills below the header row */}
              {/* Mobile: pills below header row — rep initials only */}
              {anyFilters && <div className="lg:hidden mt-3"><PillList useShortLabel={true} /></div>}
            </div>

            {/* Collapsible filter pane */}
            {meetingFiltersOpen && (
              <div className="px-6 py-4 border-b border-gray-100 bg-gray-50">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div>
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Rep(s)</p>
                    <RepMultiSelect
                      options={userOptions}
                      selectedIds={meetingFilterReps}
                      onChange={setMeetingFilterReps}
                      triggerClass="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-left flex items-center justify-between gap-2 hover:border-brand-secondary transition-colors bg-white"
                      placeholder="All reps..."
                    />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Date</p>
                    <MeetingMultiSelect
                      placeholder="All dates..."
                      options={conferenceDates.map(d => ({ value: d, label: formatDayLabel(d) }))}
                      selected={meetingFilterDates}
                      onChange={setMeetingFilterDates}
                    />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Company Type</p>
                    <MeetingMultiSelect
                      placeholder="All types..."
                      options={meetingCompanyTypeOpts.map(v => ({ value: v, label: v }))}
                      selected={meetingFilterCompanyTypes}
                      onChange={setMeetingFilterCompanyTypes}
                    />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Seniority</p>
                    <MeetingMultiSelect
                      placeholder="All levels..."
                      options={meetingSeniorityOpts.map(v => ({ value: v, label: v }))}
                      selected={meetingFilterSeniorities}
                      onChange={setMeetingFilterSeniorities}
                    />
                  </div>
                </div>
                {anyFilters && (
                  <div className="mt-3 flex justify-end">
                    <button
                      type="button"
                      onClick={() => { setMeetingFilterReps([]); setMeetingFilterDates([]); setMeetingFilterCompanyTypes([]); setMeetingFilterSeniorities([]); }}
                      className="text-xs text-gray-500 hover:text-red-500 transition-colors"
                    >
                      Clear all filters
                    </button>
                  </div>
                )}
              </div>
            )}

            <MeetingsTable
              tableName="conference_meetings"
              meetings={filteredMeetings}
              actionOptions={actionOptions}
              colorMap={colorMaps.action || {}}
              userOptions={userOptions}
              onNotesClick={(meetingId) => openMeetingNotes(meetingId)}
              onOutcomeChange={async (meetingId, outcome) => {
                setConfMeetings(prev => prev.map(m => m.id === meetingId ? { ...m, outcome } : m));
                try {
                  const res = await fetch('/api/meetings', {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ id: meetingId, outcome }),
                  });
                  if (!res.ok) throw new Error();
                  toast.success('Outcome updated.');
                } catch {
                  fetchConference();
                  toast.error('Failed to update outcome.');
                }
              }}
              onDelete={async (meetingId) => {
                if (!confirm('Delete this meeting? This cannot be undone.')) return;
                try {
                  const res = await fetch(`/api/meetings/${meetingId}`, { method: 'DELETE' });
                  if (!res.ok) throw new Error();
                  toast.success('Meeting deleted.');
                  fetchConference();
                } catch {
                  toast.error('Failed to delete meeting.');
                }
              }}
              onEdit={async (meetingId, data) => {
                setConfMeetings(prev => prev.map(m => m.id === meetingId ? { ...m, ...data } : m));
                try {
                  const res = await fetch(`/api/meetings/${meetingId}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(data),
                  });
                  if (!res.ok) throw new Error();
                  toast.success('Meeting updated.');
                } catch {
                  fetchConference();
                  toast.error('Failed to update meeting.');
                }
              }}
              onBulkDelete={async (ids) => {
                try {
                  await Promise.all(ids.map(id => fetch(`/api/meetings/${id}`, { method: 'DELETE' })));
                  toast.success(`${ids.length} meeting${ids.length > 1 ? 's' : ''} deleted.`);
                  fetchConference();
                } catch {
                  toast.error('Failed to delete some meetings.');
                  fetchConference();
                }
              }}
              onBulkUpdate={async (ids, field, value) => {
                try {
                  if (field === 'outcome') {
                    await Promise.all(ids.map(id =>
                      fetch('/api/meetings', {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ id, outcome: value }),
                      })
                    ));
                  } else {
                    await Promise.all(ids.map(async id => {
                      const meeting = filteredMeetings.find(m => m.id === id);
                      if (!meeting) return;
                      await fetch(`/api/meetings/${id}`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          meeting_date: meeting.meeting_date,
                          meeting_time: meeting.meeting_time,
                          location: meeting.location || '',
                          additional_attendees: meeting.additional_attendees || '',
                          meeting_type: field === 'meeting_type' ? value : (meeting.meeting_type || ''),
                          scheduled_by: field === 'scheduled_by' ? value : (meeting.scheduled_by || ''),
                        }),
                      });
                    }));
                  }
                  toast.success(`Updated ${ids.length} meeting${ids.length > 1 ? 's' : ''}.`);
                  fetchConference();
                } catch {
                  toast.error('Failed to update some meetings.');
                  fetchConference();
                }
              }}
            />
          </div>
        );
      })()}

      <NewMeetingModal
        isOpen={newMeetingOpen}
        onClose={() => setNewMeetingOpen(false)}
        availableConferences={conference ? [{ id: conference.id, name: conference.name, start_date: conference.start_date, end_date: conference.end_date }] : []}
        defaultConferenceId={conference?.id}
        onSuccess={addMeetingOptimistically}
      />

      {activeTab === 'follow-ups' && (
        <div className="card p-0 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between flex-wrap gap-3">
            <div>
              <h2 className="text-lg font-semibold text-brand-primary font-serif">Follow Ups</h2>
              {confFollowUps.length > 0 && (
                <p className="text-sm text-gray-500 mt-0.5">
                  {confFollowUps.filter(f => !f.completed).length} pending · {confFollowUps.filter(f => f.completed).length} completed
                </p>
              )}
            </div>
            <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5">
              {(['all', 'open', 'completed'] as const).map(opt => (
                <button
                  key={opt}
                  onClick={() => setFollowUpFilter(opt)}
                  className={`px-3 py-1 rounded-md text-xs font-medium transition-colors capitalize ${
                    followUpFilter === opt ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  {opt === 'open' ? 'Open' : opt === 'completed' ? 'Completed' : 'All'}
                </button>
              ))}
            </div>
          </div>
          {(() => {
            const filteredFollowUps = followUpFilter === 'open'
              ? confFollowUps.filter(f => !f.completed)
              : followUpFilter === 'completed'
                ? confFollowUps.filter(f => f.completed)
                : confFollowUps;
            return (
          <FollowUpsTable
            followUps={filteredFollowUps}
            onToggle={async (id, completed) => {
              setConfFollowUps(prev =>
                prev.map(fu =>
                  fu.id === id ? { ...fu, completed } : fu
                )
              );
              try {
                const res = await fetch('/api/follow-ups', {
                  method: 'PATCH',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ id, completed }),
                });
                if (!res.ok) throw new Error();
              } catch {
                setConfFollowUps(prev =>
                  prev.map(fu =>
                    fu.id === id ? { ...fu, completed: !completed } : fu
                  )
                );
                toast.error('Failed to update.');
              }
            }}
            onDelete={async (id) => {
              if (!confirm('Are you sure you want to delete this follow-up?')) return;
              const prev = confFollowUps;
              setConfFollowUps(fus => fus.filter(fu => fu.id !== id));
              try {
                const res = await fetch('/api/follow-ups', {
                  method: 'DELETE',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ id }),
                });
                if (!res.ok) throw new Error();
                toast.success('Follow-up deleted.');
              } catch {
                setConfFollowUps(prev);
                toast.error('Failed to delete follow-up.');
              }
            }}
            userOptions={userOptions}
            onRepChange={async (id, rep) => {
              setConfFollowUps(prev =>
                prev.map(fu =>
                  fu.id === id ? { ...fu, assigned_rep: rep } : fu
                )
              );
              try {
                const res = await fetch('/api/follow-ups', {
                  method: 'PATCH',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ id, assigned_rep: rep }),
                });
                if (!res.ok) throw new Error();
                toast.success('Rep updated.');
              } catch {
                fetchConference();
                toast.error('Failed to update rep.');
              }
            }}
            onNextStepsChange={async (id, nextSteps) => {
              setConfFollowUps(prev =>
                prev.map(fu =>
                  fu.id === id ? { ...fu, next_steps: nextSteps } : fu
                )
              );
              try {
                const res = await fetch('/api/follow-ups', {
                  method: 'PATCH',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ id, next_steps: nextSteps }),
                });
                if (!res.ok) throw new Error();
                toast.success('Next step updated.');
              } catch {
                fetchConference();
                toast.error('Failed to update next step.');
              }
            }}
          />
            );
          })()}
        </div>
      )}

      {activeTab === 'social' && (
        <SocialEventsTable
          conferenceId={Number(id)}
          conferenceName={conference?.name || ''}
          events={confSocialEvents}
          onRefresh={fetchConference}
          userOptions={userOptions.map(u => u.value)}
          userOptionsFull={userOptions}
          eventTypeOptions={eventTypeOptions}
          companies={conferenceCompanies.map(c => ({ id: c.id, name: c.name, assigned_user: c.assigned_user }))}
          attendees={(conference?.attendees || []).map(a => ({ id: a.id, first_name: a.first_name, last_name: a.last_name, title: a.title, company_id: a.company_id, company_name: a.company_name, company_type: a.company_type }))}
        />
      )}

      {activeTab === 'forms' && (
        <ConferenceFormsTab
          conferenceId={Number(id)}
          conferenceName={conference?.name || ''}
          attendees={(conference?.attendees || []).map(a => ({
            id: a.id,
            first_name: a.first_name,
            last_name: a.last_name,
            title: a.title,
            company_name: a.company_name,
            email: a.email,
          }))}
          brandLogoUrl={logoConfig.logoDarkUrl}
          isAdmin={isAdminUser}
          currentUserEmail={currentUser?.email || ''}
        />
      )}

      {activeTab === 'targets' && (
        <ConferenceDetailsTargetsTab
          conferenceId={Number(id)}
          conferenceName={conference?.name || ''}
          meetingAttendeeIds={meetingAttendeeIds}
        />
      )}

      {activeTab === 'agenda' && (
        <AgendaTab
          conferenceId={Number(id)}
          conferenceName={conference?.name || ''}
          userEmail={currentUser?.email || ''}
        />
      )}

      <MyDebriefDrawer
        conferenceId={Number(id)}
        isOpen={showDebrief}
        onClose={() => setShowDebrief(false)}
      />

      {conference && (
        <ConferenceActivityMapDrawer
          conferenceId={conference.id}
          conferenceName={conference.name}
          isOpen={activityMapOpen}
          onClose={() => setActivityMapOpen(false)}
        />
      )}

      {conference && (
        <ExecutiveBriefDrawer
          isOpen={executiveBriefOpen}
          onClose={() => setExecutiveBriefOpen(false)}
          conference={conference}
          seriesYoY={executiveBriefYoY}
          snapshot={executiveBriefLoading ? null : executiveBriefSnapshot}
        />
      )}

      {showBatchScan && (
        <BatchCardScanModal
          conferenceId={Number(id)}
          onClose={() => setShowBatchScan(false)}
          onDone={() => { setShowBatchScan(false); fetchConference(); }}
        />
      )}

      {showBudgetModal && conference && (
        <BudgetVsActualModal
          conferenceId={conference.id}
          conferenceName={conference.name}
          onClose={() => setShowBudgetModal(false)}
          readOnly={stagePermissions != null && !stagePermissions.canEditBudget}
        />
      )}

      {showCrmExport && conference && (
        <CrmExportModal
          conferenceId={conference.id}
          conferenceName={conference.name}
          startDate={conference.start_date}
          endDate={conference.end_date}
          onClose={() => setShowCrmExport(false)}
        />
      )}

      {classifyingAttendee && (
        <ClassifyTitleModal
          rawTitle={classifyingAttendee.title}
          meta={titleMetaMap[classifyingAttendee.id]}
          functionOptions={classifyFunctionOptions}
          seniorityOptions={classifySeniorityOptions}
          onClose={() => setClassifyingAttendee(null)}
          onSaved={(savedMeta) => {
            setTitleMetaMap(prev => ({ ...prev, [classifyingAttendee.id]: savedMeta }));
            setClassifyingAttendee(null);
          }}
        />
      )}

      {showMergeModal && (
        <MergeModal
          isOpen={showMergeModal}
          onClose={() => setShowMergeModal(false)}
          onMerge={handleMergeAttendees}
          items={(conference?.attendees ?? []).filter(a => selectedAttendeeIds.has(a.id)).map(a => ({
            id: a.id,
            label: `${a.first_name} ${a.last_name}`,
            sublabel: [a.title, a.company_name].filter(Boolean).join(' · '),
          }))}
          title="Merge Attendees"
          description="Select the master record. All conference associations will be merged into master. Duplicates will be deleted."
          searchType="attendee"
        />
      )}

      {showBulkClassify && (
        <BulkClassifyTitlesModal
          attendees={(conference?.attendees ?? []).filter(a => selectedAttendeeIds.has(a.id))}
          metadataMap={titleMetaMap}
          functionOptions={classifyFunctionOptions}
          seniorityOptions={classifySeniorityOptions}
          onClose={() => setShowBulkClassify(false)}
          onSaved={() => { setShowBulkClassify(false); setTitleMetaRefetch(c => c + 1); }}
        />
      )}

      {/* Quick View iframe drawer — rendered via portal directly under <body> so its
          fixed positioning is always relative to the true viewport, matching the
          Companies tab's quick-view drawer regardless of where this component sits
          in the page's DOM tree. */}
      {quickViewId !== null && createPortal(
        <>
          <style>{`@keyframes slideInRight { from { transform: translateX(100%); } to { transform: translateX(0); } }`}</style>
          <div className="fixed inset-0 z-40 bg-black/30" onClick={() => setQuickViewId(null)} />
          <div
            className="drawer-mobile-responsive fixed bottom-0 left-0 right-0 sm:inset-y-0 sm:left-auto sm:right-0 h-[90vh] sm:h-auto w-full sm:w-[480px] bg-white shadow-2xl flex flex-col rounded-t-2xl sm:rounded-tl-2xl sm:rounded-tr-none z-50"
            style={qvPanelStyle}
          >
            <div className="hidden sm:block absolute left-0 inset-y-0 w-1 cursor-col-resize z-10 group/rh" onMouseDown={qvResizeStart}>
              <div className="absolute inset-y-0 left-0 w-0.5 bg-brand-secondary/0 group-hover/rh:bg-brand-secondary/40 transition-colors" />
            </div>
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 flex-shrink-0">
              <a
                href={`/${quickViewType === 'attendee' ? 'attendees' : 'companies'}/${quickViewId}`}
                className="text-xs text-brand-secondary hover:underline font-medium"
              >
                Go to {quickViewType === 'attendee' ? 'Attendee' : 'Company'} Record →
              </a>
              <button
                type="button"
                onClick={() => setQuickViewId(null)}
                className="p-1.5 rounded hover:bg-gray-100 text-gray-500"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <iframe
              src={`/${quickViewType === 'attendee' ? 'attendees' : 'companies'}/${quickViewId}?embed=true`}
              className="flex-1 w-full border-0"
              title="Quick View"
            />
          </div>
        </>,
        document.body
      )}
    </div>
  );
}
