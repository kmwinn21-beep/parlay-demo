'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
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
import { NewMeetingModal } from '@/components/NewMeetingModal';

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
  conference_count?: number;
  conference_names?: string;
  entity_notes_count?: number;
  created_at?: string;
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

type ConferenceTabKey = 'attendees' | 'companies' | 'meetings' | 'follow-ups' | 'social' | 'analytics' | 'notes';

const CONFERENCE_TAB_ORDER: ConferenceTabKey[] = ['attendees', 'companies', 'meetings', 'follow-ups', 'social', 'analytics', 'notes'];

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
  const id = params.id as string;
  const colorMaps = useConfigColors();
  const configOptions = useConfigOptions('conference_detail');
  const { isVisible: isConfAttendeeColVisible } = useTableColumnConfig('conference_attendees');
  const conferenceTabConfig = useSectionConfig('conference_details');

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
  const [confNotes, setConfNotes] = useState<EntityNote[]>([]);
  const [confPinnedNoteIds, setConfPinnedNoteIds] = useState<Set<number>>(new Set());
  const [confPinnedNotes, setConfPinnedNotes] = useState<PinnedNote[]>([]);
  const [confMeetings, setConfMeetings] = useState<Meeting[]>([]);
  const [confSocialEvents, setConfSocialEvents] = useState<SocialEvent[]>([]);
  const [actionOptions, setActionOptions] = useState<string[]>([]);
  const [actionConfigs, setActionConfigs] = useState<{ id: number; value: string; action_key: string | null }[]>([]);
  const [userOptions, setUserOptions] = useState<UserOption[]>([]);
  const [eventTypeOptions, setEventTypeOptions] = useState<string[]>([]);
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
  const [attendeeFiltersOpen, setAttendeeFiltersOpen] = useState(false);
  const [attendeePage, setAttendeePage] = useState(1);
  const [selectedAttendeeIds, setSelectedAttendeeIds] = useState<Set<number>>(new Set());
  const [isRemoving, setIsRemoving] = useState(false);
  const [editingCell, setEditingCell] = useState<{ attendeeId: number; field: 'title' | 'company_type' | 'status' | 'seniority' | 'company_wse' } | null>(null);
  const [cellDraft, setCellDraft] = useState('');
  const [isSavingCell, setIsSavingCell] = useState(false);
  const [sortKey, setSortKey] = useState<'name' | 'title' | 'company' | 'seniority'>('name');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [editInternalAttendees, setEditInternalAttendees] = useState<string[]>([]);
  const [internalDropdownOpen, setInternalDropdownOpen] = useState(false);
  const internalDropdownRef = useRef<HTMLDivElement>(null);

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

  // Upload attendee list state
  const [isUploading, setIsUploading] = useState(false);
  const uploadFileRef = useRef<HTMLInputElement>(null);
  const [pendingUploadFile, setPendingUploadFile] = useState<File | null>(null);
  const [columnMappingData, setColumnMappingData] = useState<{
    headers: string[];
    suggestions: ColumnMapping;
    sampleRows: Record<string, string>[];
    totalRows: number;
  } | null>(null);

  const visibleConferenceTabs = CONFERENCE_TAB_ORDER.filter(
    (tabKey) => conferenceTabConfig.orderedKeys.includes(tabKey) && conferenceTabConfig.isVisible(tabKey),
  );

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
      const [confRes, detailsRes, followUpsRes, notesRes, meetingsRes, actionRes, userRes, socialRes, eventTypeRes, companyTypeRes, seniorityRes] = await Promise.all([
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
      setConference(data);
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
      setEditData({
        name: data.name,
        start_date: data.start_date,
        end_date: data.end_date,
        location: data.location,
        notes: data.notes || '',
      });
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
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
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
        body: JSON.stringify({ ...editData, internal_attendees: editInternalAttendees.join(',') }),
      });
      if (!res.ok) throw new Error('Update failed');
      const updated = await res.json();
      setConference((prev) => prev ? { ...prev, ...updated } : prev);
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
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to read file');
      setPendingUploadFile(file);
      setColumnMappingData(data);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to read file');
    } finally {
      setIsUploading(false);
    }
  };

  const handleConfirmMapping = async (mapping: ColumnMapping) => {
    if (!pendingUploadFile) return;
    setColumnMappingData(null);
    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', pendingUploadFile);
      formData.append('mapping', JSON.stringify(mapping));
      const res = await fetch(`/api/conferences/${id}/attendees/upload`, { method: 'POST', body: formData });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || 'Failed to upload attendees');
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
    }
  };

  useEffect(() => { setAttendeePage(1); }, [attendeeSearch, filterSeniority, filterCompanyType]);

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
                <label className="label">End Date *</label>
                <input
                  type="date"
                  value={editData.end_date || ''}
                  onChange={(e) => setEditData((p) => ({ ...p, end_date: e.target.value }))}
                  className="input-field"
                />
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
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-blue-50 text-brand-secondary border border-blue-200"
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
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-brand-primary font-serif">{conference.name}</h1>
              <div className="flex flex-wrap items-center gap-x-5 gap-y-2 mt-3">
                <span className="flex items-center gap-2 text-sm text-gray-600">
                  <svg className="w-4 h-4 text-brand-secondary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  {formatDate(conference.start_date)}
                  {conference.end_date && conference.end_date !== conference.start_date
                    ? ` – ${formatDate(conference.end_date)}`
                    : ''}
                </span>
                <span className="flex items-center gap-2 text-sm text-gray-600">
                  <svg className="w-4 h-4 text-brand-secondary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  {conference.location}
                </span>
                {conference.attendees.length === 0 ? (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-300">
                    <svg className="w-3.5 h-3.5 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86l-8.58 14.86a1 1 0 00.87 1.5h17.16a1 1 0 00.87-1.5L12.71 3.86a1 1 0 00-1.42 0z" />
                    </svg>
                    Awaiting Attendee Upload
                  </span>
                ) : (
                  <span className="badge-blue">
                    {conference.attendees.length} attendees
                  </span>
                )}
              </div>
              {conference.notes && (
                <p className="text-sm text-gray-600 mt-3 max-w-2xl">{conference.notes}</p>
              )}
              {conference.internal_attendees && (
                <div className="mt-3">
                  <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Internal Attendees</span>
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    {conference.internal_attendees.split(',').filter(Boolean).map((user) => {
                      const parts = user.trim().split(/\s+/);
                      const initials = parts.length >= 2
                        ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
                        : parts[0].substring(0, 2).toUpperCase();
                      return (
                        <span
                          key={user}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-blue-50 text-brand-secondary border border-blue-200"
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
                  </div>
                </div>
              )}
            </div>
            <div className="flex gap-2 sm:ml-4 flex-shrink-0">
              <button
                onClick={() => setIsEditing(true)}
                className="btn-secondary flex items-center gap-2 text-sm"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
                Edit
              </button>
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
            <h2 className="text-lg font-semibold text-brand-primary font-serif">Attendee List</h2>
            <div className="flex items-center gap-3 flex-wrap">
              {selectedAttendeeIds.size >= 1 && (
                <>
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
                </>
              )}
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
                {(filterSeniority || filterCompanyType) && (
                  <span className="ml-0.5 min-w-[18px] h-[18px] rounded-full bg-white text-brand-secondary text-[10px] font-bold flex items-center justify-center px-1 leading-none border border-brand-secondary">
                    {[filterSeniority, filterCompanyType].filter(Boolean).length}
                  </span>
                )}
              </button>
            </div>
          </div>

          {/* Collapsible attendee filters pane */}
          {attendeeFiltersOpen && (
            <div className="mb-4 px-6 py-4 bg-gray-50 border border-gray-200 rounded-xl">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Seniority</p>
                  <select value={filterSeniority} onChange={e => setFilterSeniority(e.target.value)} className="input-field w-full text-sm">
                    <option value="">All Seniorities</option>
                    {seniorityFilterOptions.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Company Type</p>
                  <select value={filterCompanyType} onChange={e => setFilterCompanyType(e.target.value)} className="input-field w-full text-sm">
                    <option value="">All Types</option>
                    {companyTypeFilterOptions.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
              </div>
              {(filterSeniority || filterCompanyType) && (
                <div className="mt-3 flex justify-end">
                  <button
                    type="button"
                    onClick={() => { setFilterSeniority(''); setFilterCompanyType(''); }}
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
                          <Link href={`/attendees/${attendee.id}`} className="font-semibold text-brand-secondary hover:underline text-sm truncate">
                            {attendee.first_name} {attendee.last_name}
                          </Link>
                        </div>
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
                          <ConferenceCountTooltip count={Number(attendee.conference_count ?? 0)} names={attendee.conference_names as string | undefined} />
                        </span>
                        {attendee.company_wse != null && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-yellow-50 text-yellow-700 border border-yellow-200">
                            <svg className="w-3 h-3 text-yellow-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M2 18h20M4 18v-3a8 8 0 0116 0v3M12 3v2M4.93 7.93l1.41 1.41M19.07 7.93l-1.41 1.41" /></svg>
                            {Number(attendee.company_wse).toLocaleString()}
                          </span>
                        )}
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
                    {isConfAttendeeColVisible('name') && (
                      <th onClick={() => handleSort('name')} className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider select-none transition-colors whitespace-nowrap relative cursor-pointer hover:text-brand-secondary" style={{ width: colWidths.name }}>
                        Name{sortKey === 'name' && <span className="ml-1">{sortDir === 'asc' ? '↑' : '↓'}</span>}
                        <div onMouseDown={e => startResize(e, 'name')} style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: 4, cursor: 'col-resize', userSelect: 'none', zIndex: 10 }} className="hover:bg-brand-secondary opacity-0 hover:opacity-30" />
                      </th>
                    )}
                    {isConfAttendeeColVisible('title') && (
                      <th onClick={() => handleSort('title')} className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider select-none transition-colors whitespace-nowrap relative cursor-pointer hover:text-brand-secondary" style={{ width: colWidths.title }}>
                        Title{sortKey === 'title' && <span className="ml-1">{sortDir === 'asc' ? '↑' : '↓'}</span>}
                        <div onMouseDown={e => startResize(e, 'title')} style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: 4, cursor: 'col-resize', userSelect: 'none', zIndex: 10 }} className="hover:bg-brand-secondary opacity-0 hover:opacity-30" />
                      </th>
                    )}
                    {isConfAttendeeColVisible('company') && (
                      <th onClick={() => handleSort('company')} className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider select-none transition-colors whitespace-nowrap relative cursor-pointer hover:text-brand-secondary" style={{ width: colWidths.company }}>
                        Company{sortKey === 'company' && <span className="ml-1">{sortDir === 'asc' ? '↑' : '↓'}</span>}
                        <div onMouseDown={e => startResize(e, 'company')} style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: 4, cursor: 'col-resize', userSelect: 'none', zIndex: 10 }} className="hover:bg-brand-secondary opacity-0 hover:opacity-30" />
                      </th>
                    )}
                    {isConfAttendeeColVisible('type') && (
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider whitespace-nowrap relative" style={{ width: colWidths.type }}>
                        Type
                        <div onMouseDown={e => startResize(e, 'type')} style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: 4, cursor: 'col-resize', userSelect: 'none', zIndex: 10 }} className="hover:bg-brand-secondary opacity-0 hover:opacity-30" />
                      </th>
                    )}
                    {isConfAttendeeColVisible('seniority') && (
                      <th onClick={() => handleSort('seniority')} className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider select-none transition-colors whitespace-nowrap relative cursor-pointer hover:text-brand-secondary" style={{ width: colWidths.seniority }}>
                        Seniority{sortKey === 'seniority' && <span className="ml-1">{sortDir === 'asc' ? '↑' : '↓'}</span>}
                        <div onMouseDown={e => startResize(e, 'seniority')} style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: 4, cursor: 'col-resize', userSelect: 'none', zIndex: 10 }} className="hover:bg-brand-secondary opacity-0 hover:opacity-30" />
                      </th>
                    )}
                    {isConfAttendeeColVisible('conferences') && (
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider whitespace-nowrap relative" style={{ width: colWidths.conferences }}># Conf
                        <div onMouseDown={e => startResize(e, 'conferences')} style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: 4, cursor: 'col-resize', userSelect: 'none', zIndex: 10 }} className="hover:bg-brand-secondary opacity-0 hover:opacity-30" />
                      </th>
                    )}
                    {isConfAttendeeColVisible('notes') && (
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Notes</th>
                    )}
                    {isConfAttendeeColVisible('date_added') && (
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider whitespace-nowrap">Date Added</th>
                    )}
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
                      {isConfAttendeeColVisible('name') && (
                        <td className="px-4 py-3 font-medium overflow-visible">
                          <div className="text-left">
                            <Link href={`/attendees/${attendee.id}`} className="text-brand-secondary hover:underline block truncate" title={`${attendee.first_name} ${attendee.last_name}`}>
                              {attendee.first_name} {attendee.last_name}
                            </Link>
                          </div>
                        </td>
                      )}
                      {isConfAttendeeColVisible('title') && (
                        <td className="px-4 py-3 text-gray-600 overflow-visible relative" style={{ maxWidth: colWidths.title }}>
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
                            <button type="button" className="text-left w-full" onClick={() => startInlineEdit(attendee, 'title')}>
                              <span className="block text-xs leading-snug break-words whitespace-normal">{attendee.title || <span className="text-gray-300">—</span>}</span>
                            </button>
                          )}
                        </td>
                      )}
                      {isConfAttendeeColVisible('company') && (
                        <td className="px-4 py-3 overflow-visible relative">
                          {attendee.company_name ? (
                            <div>
                              {attendee.company_id ? (
                                <Link href={`/companies/${attendee.company_id}`} className="text-xs text-brand-secondary hover:underline break-words whitespace-normal leading-snug">{attendee.company_name}</Link>
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
                                  <button type="button" className="text-[10px] text-gray-400 mt-0.5 hover:text-brand-secondary" onClick={() => startInlineEdit(attendee, 'company_wse')}>
                                    WSE: {Number(attendee.company_wse).toLocaleString()}
                                  </button>
                                )
                              )}
                            </div>
                          ) : (
                            <span className="text-gray-300">—</span>
                          )}
                        </td>
                      )}
                      {isConfAttendeeColVisible('type') && (
                        <td className="px-4 py-3 overflow-visible relative">
                          {editingCell?.attendeeId === attendee.id && editingCell.field === 'company_type' ? (
                            <select className="input-field bg-white text-sm py-2 min-w-[260px] w-auto relative z-30 shadow-md" value={cellDraft} onChange={(e) => setCellDraft(e.target.value)} onBlur={() => saveInlineEdit(attendee, 'company_type')} autoFocus>
                              <option value="">—</option>
                              {companyTypeFilterOptions.map(t => <option key={t} value={t}>{t}</option>)}
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
                      )}
                      {isConfAttendeeColVisible('seniority') && (
                        <td className="px-4 py-3 overflow-visible relative">
                          {editingCell?.attendeeId === attendee.id && editingCell.field === 'seniority' ? (
                            <select className="input-field bg-white text-sm py-2 min-w-[260px] w-auto relative z-30 shadow-md" value={cellDraft} onChange={(e) => setCellDraft(e.target.value)} onBlur={() => saveInlineEdit(attendee, 'seniority')} autoFocus>
                              <option value="">Auto-detect</option>
                              {seniorityFilterOptions.map(s => <option key={s} value={s}>{s}</option>)}
                            </select>
                          ) : (
                            (() => {
                              const s = effectiveSeniority(attendee.seniority, attendee.title);
                              return (
                                <button type="button" onClick={() => startInlineEdit(attendee, 'seniority')}>
                                  <span className={getBadgeClass(s, colorMaps.seniority || {})}>{s}</span>
                                </button>
                              );
                            })()
                          )}
                        </td>
                      )}
                      {isConfAttendeeColVisible('conferences') && (
                        <td className="px-4 py-3">
                          <ConferenceCountTooltip count={Number(attendee.conference_count ?? 0)} names={attendee.conference_names as string | undefined} />
                        </td>
                      )}
                      {isConfAttendeeColVisible('notes') && (
                        <td className="px-4 py-3">
                          {Number(attendee.entity_notes_count ?? 0) > 0
                            ? <NotesPopover attendeeId={attendee.id} notesCount={Number(attendee.entity_notes_count)} />
                            : <span className="text-gray-300">—</span>
                          }
                        </td>
                      )}
                      {isConfAttendeeColVisible('date_added') && (
                        <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">{fmtDate(attendee.created_at)}</td>
                      )}
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
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-brand-secondary text-brand-secondary text-sm font-medium hover:bg-blue-50 transition-colors"
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
              meetings={filteredMeetings}
              actionOptions={actionOptions}
              colorMap={colorMaps.action || {}}
              userOptions={userOptions}
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
            />
          </div>
        );
      })()}

      <NewMeetingModal
        isOpen={newMeetingOpen}
        onClose={() => setNewMeetingOpen(false)}
        availableConferences={conference ? [{ id: conference.id, name: conference.name, start_date: conference.start_date }] : []}
        defaultConferenceId={conference?.id}
        onSuccess={m => setConfMeetings(prev => [m, ...prev])}
      />

      {activeTab === 'follow-ups' && (
        <div className="card p-0 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-brand-primary font-serif">Follow Ups</h2>
              {confFollowUps.length > 0 && (
                <p className="text-sm text-gray-500 mt-0.5">
                  {confFollowUps.filter(f => !f.completed).length} pending · {confFollowUps.filter(f => f.completed).length} completed
                </p>
              )}
            </div>
          </div>
          <FollowUpsTable
            followUps={confFollowUps}
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
          />
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
    </div>
  );
}
