'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { AnalyticsCharts } from '@/components/AnalyticsCharts';
import { FollowUpsTable, type FollowUp } from '@/components/FollowUpsTable';
import { MeetingsTable, type Meeting, type EditFormData } from '@/components/MeetingsTable';
import { NotesSection, type EntityNote } from '@/components/NotesSection';
import { NotesPopover } from '@/components/NotesPopover';
import { CompanyTable } from '@/components/CompanyTable';
import { BackButton } from '@/components/BackButton';
import { effectiveSeniority } from '@/lib/parsers';
import { useConfigColors } from '@/lib/useConfigColors';
import { getBadgeClass, getHex, type ColorMap } from '@/lib/colors';

interface Attendee {
  id: number;
  first_name: string;
  last_name: string;
  title?: string;
  company_id?: number;
  company_name?: string;
  company_type?: string;
  email?: string;
  seniority?: string;
  conference_count?: number;
  conference_names?: string;
  entity_notes_count?: number;
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
}

function formatDate(dateStr: string) {
  if (!dateStr) return '';
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

export default function ConferenceDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const colorMaps = useConfigColors();

  const [conference, setConference] = useState<Conference | null>(null);
  const [conferenceDetails, setConferenceDetails] = useState<ConferenceDetail[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [editData, setEditData] = useState<Partial<Conference>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [activeTab, setActiveTab] = useState<'attendees' | 'companies' | 'analytics' | 'follow-ups' | 'notes'>('attendees');
  const [conferenceCompanies, setConferenceCompanies] = useState<{ id: number; name: string; website?: string; profit_type?: string; company_type?: string; status?: string; attendee_count: number; conference_count: number; conference_names?: string }[]>([]);
  const [isLoadingCompanies, setIsLoadingCompanies] = useState(false);
  const [companiesLoaded, setCompaniesLoaded] = useState(false);
  const [confFollowUps, setConfFollowUps] = useState<FollowUp[]>([]);
  const [confNotes, setConfNotes] = useState<EntityNote[]>([]);
  const [confMeetings, setConfMeetings] = useState<Meeting[]>([]);
  const [actionOptions, setActionOptions] = useState<string[]>([]);
  const [userOptions, setUserOptions] = useState<string[]>([]);
  const [attendeeSearch, setAttendeeSearch] = useState('');
  const [attendeePage, setAttendeePage] = useState(1);
  const [selectedAttendeeIds, setSelectedAttendeeIds] = useState<Set<number>>(new Set());
  const [isRemoving, setIsRemoving] = useState(false);
  const [sortKey, setSortKey] = useState<'name' | 'title' | 'company' | 'seniority'>('name');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [editInternalAttendees, setEditInternalAttendees] = useState<string[]>([]);
  const [internalDropdownOpen, setInternalDropdownOpen] = useState(false);
  const internalDropdownRef = useRef<HTMLDivElement>(null);

  const handleSort = (key: typeof sortKey) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('asc'); }
  };

  // Add attendee inline form state
  const [showAddForm, setShowAddForm] = useState(false);
  const [addFormData, setAddFormData] = useState({ first_name: '', last_name: '', title: '', company: '', email: '' });
  const [isAddingAttendee, setIsAddingAttendee] = useState(false);

  const fetchConference = useCallback(async () => {
    try {
      const [confRes, detailsRes, followUpsRes, notesRes, meetingsRes, actionRes, userRes] = await Promise.all([
        fetch(`/api/conferences/${id}`),
        fetch(`/api/conference-details?conference_id=${id}`),
        fetch(`/api/follow-ups?conference_id=${id}`),
        fetch(`/api/notes?entity_type=conference&entity_id=${id}`),
        fetch(`/api/meetings?conference_id=${id}`),
        fetch('/api/config?category=action'),
        fetch('/api/config?category=user'),
      ]);
      if (!confRes.ok) throw new Error('Not found');
      const data = await confRes.json();
      const detailsData = detailsRes.ok ? await detailsRes.json() : [];
      const followUpsData = followUpsRes.ok ? await followUpsRes.json() : [];
      const notesData = notesRes.ok ? await notesRes.json() : [];
      const meetingsData = meetingsRes.ok ? await meetingsRes.json() : [];
      const actionData = actionRes.ok ? await actionRes.json() : [];
      const userData = userRes.ok ? await userRes.json() : [];
      setConference(data);
      setConferenceDetails(Array.isArray(detailsData) ? detailsData : []);
      setConfFollowUps(Array.isArray(followUpsData) ? followUpsData : []);
      setConfNotes(Array.isArray(notesData) ? notesData : []);
      setConfMeetings(Array.isArray(meetingsData) ? meetingsData : []);
      setActionOptions(actionData.map((o: { value: string }) => o.value));
      setUserOptions(userData.map((o: { value: string }) => o.value));
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
      for (const a of conference.attendees) {
        if (a.company_id) countMap.set(a.company_id, (countMap.get(a.company_id) ?? 0) + 1);
      }
      const filtered = allCompanies
        .filter((c: { id: number }) => companyIds.has(c.id))
        .map((c: { id: number; attendee_count: number }) => ({ ...c, attendee_count: countMap.get(c.id) ?? 0 }));
      setConferenceCompanies(filtered);
      setCompaniesLoaded(true);
    } catch { /* non-fatal */ } finally { setIsLoadingCompanies(false); }
  }, [conference, companiesLoaded]);

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
      router.refresh();
      router.push('/conferences');
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

  useEffect(() => { setAttendeePage(1); }, [attendeeSearch]);

  const filteredAttendees = (conference?.attendees || [])
    .filter((a) => {
      if (!attendeeSearch) return true;
      const fullName = `${a.first_name} ${a.last_name}`.toLowerCase();
      return (
        fullName.includes(attendeeSearch.toLowerCase()) ||
        (a.company_name?.toLowerCase().includes(attendeeSearch.toLowerCase())) ||
        (a.title?.toLowerCase().includes(attendeeSearch.toLowerCase()))
      );
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
        <div className="animate-spin w-8 h-8 border-4 border-procare-bright-blue border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!conference) return null;

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center justify-between">
        <nav className="flex items-center gap-2 text-sm text-gray-500">
          <Link href="/conferences" className="hover:text-procare-bright-blue">Conferences</Link>
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
          <span className="text-gray-800 truncate max-w-xs">{conference.name}</span>
        </nav>
        <BackButton />
      </div>

      {/* Conference Info Card */}
      <div className="card">
        {isEditing ? (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-procare-dark-blue font-serif">Edit Conference</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <label className="label">Conference Name *</label>
                <input
                  value={editData.name || ''}
                  onChange={(e) => setEditData((p) => ({ ...p, name: e.target.value }))}
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
              <div className="md:col-span-2">
                <label className="label">Location *</label>
                <input
                  value={editData.location || ''}
                  onChange={(e) => setEditData((p) => ({ ...p, location: e.target.value }))}
                  className="input-field"
                />
              </div>
              <div className="md:col-span-2">
                <label className="label">Notes</label>
                <textarea
                  value={editData.notes || ''}
                  onChange={(e) => setEditData((p) => ({ ...p, notes: e.target.value }))}
                  className="input-field resize-none"
                  rows={3}
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
                          const isSelected = editInternalAttendees.includes(user);
                          return (
                            <button
                              key={user}
                              type="button"
                              onClick={() => {
                                setEditInternalAttendees((prev) =>
                                  isSelected ? prev.filter((u) => u !== user) : [...prev, user]
                                );
                              }}
                              className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 flex items-center gap-2"
                            >
                              <span className={`w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center ${isSelected ? 'bg-procare-bright-blue border-procare-bright-blue' : 'border-gray-300'}`}>
                                {isSelected && (
                                  <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                  </svg>
                                )}
                              </span>
                              {user}
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
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-blue-50 text-procare-bright-blue border border-blue-200"
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
            <div className="flex gap-3">
              <button onClick={handleSave} disabled={isSaving} className="btn-primary">
                {isSaving ? 'Saving...' : 'Save Changes'}
              </button>
              <button onClick={() => setIsEditing(false)} className="btn-secondary">
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-procare-dark-blue font-serif">{conference.name}</h1>
              <div className="flex flex-wrap items-center gap-x-5 gap-y-2 mt-3">
                <span className="flex items-center gap-2 text-sm text-gray-600">
                  <svg className="w-4 h-4 text-procare-bright-blue" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  {formatDate(conference.start_date)}
                  {conference.end_date && conference.end_date !== conference.start_date
                    ? ` – ${formatDate(conference.end_date)}`
                    : ''}
                </span>
                <span className="flex items-center gap-2 text-sm text-gray-600">
                  <svg className="w-4 h-4 text-procare-bright-blue" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  {conference.location}
                </span>
                <span className="badge-blue">
                  {conference.attendees.length} attendees
                </span>
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
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-blue-50 text-procare-bright-blue border border-blue-200"
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
              <button
                onClick={handleDelete}
                disabled={isDeleting}
                className="btn-danger flex items-center gap-2 text-sm"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
                Delete
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 overflow-x-auto">
        <nav className="flex gap-1 sm:gap-6 whitespace-nowrap">
          <button
            onClick={() => setActiveTab('attendees')}
            className={`py-3 px-2 sm:px-1 text-xs sm:text-sm font-medium border-b-2 transition-colors ${activeTab === 'attendees' ? 'border-procare-bright-blue text-procare-bright-blue' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
          >
            Attendees ({conference.attendees.length})
          </button>
          <button
            onClick={() => { setActiveTab('companies'); loadCompanies(); }}
            className={`py-3 px-2 sm:px-1 text-xs sm:text-sm font-medium border-b-2 transition-colors ${activeTab === 'companies' ? 'border-procare-bright-blue text-procare-bright-blue' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
          >
            Companies
          </button>
          <button
            onClick={() => setActiveTab('analytics')}
            className={`py-3 px-2 sm:px-1 text-xs sm:text-sm font-medium border-b-2 transition-colors ${activeTab === 'analytics' ? 'border-procare-bright-blue text-procare-bright-blue' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
          >
            Analytics
          </button>
          <button
            onClick={() => setActiveTab('follow-ups')}
            className={`py-3 px-2 sm:px-1 text-xs sm:text-sm font-medium border-b-2 transition-colors ${activeTab === 'follow-ups' ? 'border-procare-bright-blue text-procare-bright-blue' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
          >
            Meetings &amp; Follow Ups{confFollowUps.length > 0 ? ` (${confFollowUps.length})` : ''}
          </button>
          <button
            onClick={() => setActiveTab('notes')}
            className={`py-3 px-2 sm:px-1 text-xs sm:text-sm font-medium border-b-2 transition-colors ${activeTab === 'notes' ? 'border-procare-bright-blue text-procare-bright-blue' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
          >
            Notes{confNotes.length > 0 ? ` (${confNotes.length})` : ''}
          </button>
        </nav>
      </div>

      {/* Attendees Tab */}
      {activeTab === 'attendees' && (
        <div className="card">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <h2 className="text-lg font-semibold text-procare-dark-blue font-serif">Attendee List</h2>
            <div className="flex items-center gap-3 flex-wrap">
              {selectedAttendeeIds.size >= 1 && (
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
              )}
              <button
                onClick={() => setShowAddForm((v) => !v)}
                className="btn-secondary flex items-center gap-2 text-sm"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                </svg>
                Add Attendee
              </button>
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
            </div>
          </div>

          {/* Add Attendee Inline Form */}
          {showAddForm && (
            <div className="mb-4 p-4 bg-blue-50 border border-procare-bright-blue rounded-xl">
              <h3 className="text-sm font-semibold text-procare-dark-blue mb-3">Add Attendee to Conference</h3>
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
                          <input type="checkbox" checked={selectedAttendeeIds.has(attendee.id)} onChange={() => toggleAttendeeSelect(attendee.id)} className="accent-procare-bright-blue flex-shrink-0" />
                          <Link href={`/attendees/${attendee.id}`} className="font-semibold text-procare-bright-blue hover:underline text-sm truncate">
                            {attendee.first_name} {attendee.last_name}
                          </Link>
                        </div>
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
                        <span className={getBadgeClass(seniority, colorMaps.seniority || {})}>{seniority}</span>
                        <ConferenceCountTooltip count={Number(attendee.conference_count ?? 0)} names={attendee.conference_names as string | undefined} />
                        {Number(attendee.entity_notes_count ?? 0) > 0 && (
                          <NotesPopover attendeeId={attendee.id} notesCount={Number(attendee.entity_notes_count)} />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Desktop table */}
            <div className="hidden lg:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="px-4 py-3 text-left">
                      <input
                        type="checkbox"
                        checked={selectedAttendeeIds.size === filteredAttendees.length && filteredAttendees.length > 0}
                        onChange={(e) => {
                          if (e.target.checked) setSelectedAttendeeIds(new Set(filteredAttendees.map((a) => a.id)));
                          else setSelectedAttendeeIds(new Set());
                        }}
                        className="accent-procare-bright-blue"
                      />
                    </th>
                    {(['name', 'title', 'company', 'seniority'] as const).map(col => (
                      <th key={col} onClick={() => handleSort(col)} className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider cursor-pointer select-none hover:text-procare-bright-blue transition-colors whitespace-nowrap">
                        {col === 'name' ? 'Name' : col === 'title' ? 'Title' : col === 'company' ? 'Company' : 'Seniority'}
                        {sortKey === col && <span className="ml-1">{sortDir === 'asc' ? '↑' : '↓'}</span>}
                      </th>
                    ))}
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider whitespace-nowrap"># Conf</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Email</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Notes</th>
                    <th className="px-4 py-3"></th>
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
                          className="accent-procare-bright-blue"
                        />
                      </td>
                      <td className="px-4 py-3 font-medium">
                        <Link href={`/attendees/${attendee.id}`} className="text-procare-bright-blue hover:underline">
                          {attendee.first_name} {attendee.last_name}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-gray-600 max-w-[160px] truncate">
                        {attendee.title || <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-4 py-3">
                        {attendee.company_name ? (
                          <div>
                            {attendee.company_id ? (
                              <Link href={`/companies/${attendee.company_id}`} className="text-procare-bright-blue hover:underline">{attendee.company_name}</Link>
                            ) : (
                              <p className="text-gray-800">{attendee.company_name}</p>
                            )}
                            {attendee.company_type && (
                              <span className="badge-blue text-xs">{attendee.company_type}</span>
                            )}
                          </div>
                        ) : (
                          <span className="text-gray-300">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {(() => {
                          const s = effectiveSeniority(attendee.seniority, attendee.title);
                          return (
                            <span className={getBadgeClass(s, colorMaps.seniority || {})}>{s}</span>
                          );
                        })()}
                      </td>
                      <td className="px-4 py-3">
                        <ConferenceCountTooltip count={Number(attendee.conference_count ?? 0)} names={attendee.conference_names as string | undefined} />
                      </td>
                      <td className="px-4 py-3">
                        {attendee.email ? (
                          <a href={`mailto:${attendee.email}`} className="text-procare-bright-blue hover:underline text-xs">
                            {attendee.email}
                          </a>
                        ) : (
                          <span className="text-gray-300">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {Number(attendee.entity_notes_count ?? 0) > 0
                          ? <NotesPopover attendeeId={attendee.id} notesCount={Number(attendee.entity_notes_count)} />
                          : <span className="text-gray-300">—</span>
                        }
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <Link
                            href={`/attendees/${attendee.id}`}
                            className="text-procare-bright-blue hover:underline text-xs font-medium"
                          >
                            View
                          </Link>
                          <button
                            onClick={() => handleRemoveOne(attendee.id, `${attendee.first_name} ${attendee.last_name}`)}
                            disabled={isRemoving}
                            className="text-red-400 hover:text-red-600 text-xs font-medium transition-colors disabled:opacity-50"
                          >
                            Remove
                          </button>
                        </div>
                      </td>
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
              <div className="animate-spin w-6 h-6 border-4 border-procare-bright-blue border-t-transparent rounded-full" />
            </div>
          ) : (
            <CompanyTable companies={conferenceCompanies} onRefresh={loadCompanies} />
          )}
        </div>
      )}

      {/* Analytics Tab */}
      {activeTab === 'analytics' && (
        <AnalyticsCharts attendees={conference.attendees} conferenceDetails={conferenceDetails} />
      )}

      {/* Notes Tab */}
      {activeTab === 'notes' && (
        <NotesSection
          entityType="conference"
          entityId={Number(id)}
          initialNotes={confNotes}
        />
      )}

      {/* Follow Ups Tab */}
      {activeTab === 'follow-ups' && (
        <div className="space-y-6">
          {/* Meetings */}
          <div className="card p-0 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100">
              <h2 className="text-lg font-semibold text-procare-dark-blue font-serif">
                Meetings
                {confMeetings.length > 0 && (
                  <span className="ml-2 text-sm font-normal text-gray-500">
                    ({confMeetings.length})
                  </span>
                )}
              </h2>
            </div>
            <MeetingsTable
              meetings={confMeetings}
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

          {/* Follow Ups */}
          <div className="card p-0 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-procare-dark-blue font-serif">Follow Ups</h2>
                {confFollowUps.length > 0 && (
                  <p className="text-sm text-gray-500 mt-0.5">
                    {confFollowUps.filter(f => !f.completed).length} pending · {confFollowUps.filter(f => f.completed).length} completed
                  </p>
                )}
              </div>
            </div>
            <FollowUpsTable
              followUps={confFollowUps}
              onToggle={async (attendeeId, conferenceId, completed) => {
                setConfFollowUps(prev =>
                  prev.map(fu =>
                    fu.attendee_id === attendeeId && fu.conference_id === conferenceId
                      ? { ...fu, completed }
                      : fu
                  )
                );
                try {
                  const res = await fetch('/api/follow-ups', {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ attendee_id: attendeeId, conference_id: conferenceId, completed }),
                  });
                  if (!res.ok) throw new Error();
                } catch {
                  setConfFollowUps(prev =>
                    prev.map(fu =>
                      fu.attendee_id === attendeeId && fu.conference_id === conferenceId
                        ? { ...fu, completed: !completed }
                        : fu
                    )
                  );
                  toast.error('Failed to update.');
                }
              }}
              onDelete={async (attendeeId, conferenceId) => {
                if (!confirm('Are you sure you want to delete this follow-up?')) return;
                const prev = confFollowUps;
                setConfFollowUps(fus => fus.filter(fu => !(fu.attendee_id === attendeeId && fu.conference_id === conferenceId)));
                try {
                  const res = await fetch('/api/follow-ups', {
                    method: 'DELETE',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ attendee_id: attendeeId, conference_id: conferenceId }),
                  });
                  if (!res.ok) throw new Error();
                  toast.success('Follow-up deleted.');
                } catch {
                  setConfFollowUps(prev);
                  toast.error('Failed to delete follow-up.');
                }
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
