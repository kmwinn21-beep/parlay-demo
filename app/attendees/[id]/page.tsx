'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { effectiveSeniority } from '@/lib/parsers';
import { FollowUpsTable, type FollowUp } from '@/components/FollowUpsTable';
import { MeetingsTable, type Meeting, type EditFormData } from '@/components/MeetingsTable';
import { NotesSection, type EntityNote } from '@/components/NotesSection';
import { BackButton } from '@/components/BackButton';
import { RepMultiSelect } from '@/components/RepMultiSelect';
import { parseRepIds } from '@/lib/useUserOptions';
import { useUser } from '@/components/UserContext';
import { AssignFollowUpModal } from '@/components/AssignFollowUpModal';
import { useConfigColors } from '@/lib/useConfigColors';
import { getPillClass, getBadgeClass } from '@/lib/colors';
import { useUserOptions, resolveRepInitials } from '@/lib/useUserOptions';

interface Conference { id: number; name: string; start_date: string; end_date: string; location: string; }

interface Attendee {
  id: number; first_name: string; last_name: string; title?: string;
  company_id?: number; company_name?: string; company_type?: string; company_website?: string; company_assigned_user?: string;
  email?: string; notes?: string; action?: string; next_steps?: string;
  next_steps_notes?: string; status?: string; seniority?: string; created_at: string; conferences: Conference[];
}

interface Company { id: number; name: string; }

interface ConferenceDetail {
  attendee_id: number;
  conference_id: number;
  action?: string;
  next_steps?: string;
  next_steps_notes?: string;
  assigned_rep?: string;
}


function formatDate(d: string) {
  if (!d) return '';
  return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function AttendeeDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const colorMaps = useConfigColors();
  const userOptionsFull = useUserOptions();

  const [attendee, setAttendee] = useState<Attendee | null>(null);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [editData, setEditData] = useState<{ first_name?: string; last_name?: string; title?: string; company_id?: string; email?: string; seniority?: string }>({});
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const { user } = useUser();
  const isAdminUser = user?.role === 'administrator';

  // Dynamic config options
  const [statusOptions, setStatusOptions] = useState<string[]>([]);
  const [actionOptions, setActionOptions] = useState<{ id: number; value: string; action_key: string | null }[]>([]);
  const [actionKeyMap, setActionKeyMap] = useState<Record<string, string | null>>({});
  const [seniorityOptions, setSeniorityOptions] = useState<string[]>([]);
  const [userOptions, setUserOptions] = useState<import('@/lib/useUserOptions').UserOption[]>([]);

  const [showAssignFollowUp, setShowAssignFollowUp] = useState(false);
  const [showEmailTooltip, setShowEmailTooltip] = useState(false);
  const emailTooltipRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!showEmailTooltip) return;
    function handleClickOutside(e: MouseEvent) {
      if (emailTooltipRef.current && !emailTooltipRef.current.contains(e.target as Node)) {
        setShowEmailTooltip(false);
      }
    }
    document.addEventListener('click', handleClickOutside, true);
    return () => document.removeEventListener('click', handleClickOutside, true);
  }, [showEmailTooltip]);

  // Follow-ups
  const [followUps, setFollowUps] = useState<FollowUp[]>([]);
  const [attendeeNotes, setAttendeeNotes] = useState<EntityNote[]>([]);

  // Meetings
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [showMeetingForm, setShowMeetingForm] = useState(false);
  const [meetingForm, setMeetingForm] = useState({ meeting_date: '', meeting_time: '', location: '', scheduled_by: '', additional_attendees: '' });
  const [isSchedulingMeeting, setIsSchedulingMeeting] = useState(false);

  // Conference-specific state
  const [selectedConferenceId, setSelectedConferenceId] = useState<string>('');
  const [conferenceDetail, setConferenceDetail] = useState<ConferenceDetail | null>(null);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);

  const fetchFollowUps = useCallback(async () => {
    try {
      const res = await fetch(`/api/follow-ups?attendee_id=${id}`);
      if (res.ok) setFollowUps(await res.json());
    } catch { /* non-fatal */ }
  }, [id]);

  const fetchNotes = useCallback(async () => {
    try {
      const res = await fetch(`/api/notes?entity_type=attendee&entity_id=${id}`);
      if (res.ok) setAttendeeNotes(await res.json());
    } catch { /* non-fatal */ }
  }, [id]);

  const fetchMeetings = useCallback(async () => {
    try {
      const res = await fetch(`/api/meetings?attendee_id=${id}`);
      if (res.ok) setMeetings(await res.json());
    } catch { /* non-fatal */ }
  }, [id]);

  const fetchAttendee = useCallback(async () => {
    try {
      const [atRes, coRes, statusRes, actionRes, seniorityRes, userRes] = await Promise.all([
        fetch(`/api/attendees/${id}`),
        fetch('/api/companies'),
        fetch('/api/config?category=status'),
        fetch('/api/config?category=action'),
        fetch('/api/config?category=seniority'),
        fetch('/api/config?category=user'),
      ]);
      if (!atRes.ok) throw new Error('Not found');
      const [atData, coData, statusData, actionData, seniorityData, userData] = await Promise.all([
        atRes.json(), coRes.json(), statusRes.json(), actionRes.json(), seniorityRes.json(), userRes.json(),
      ]);
      setAttendee(atData);
      setCompanies(coData);
      setStatusOptions(statusData.map((o: { value: string }) => o.value));
      setActionOptions(actionData.map((o: { id: number; value: string; action_key: string | null }) => ({ id: Number(o.id), value: String(o.value), action_key: o.action_key ?? null })));
      setActionKeyMap(Object.fromEntries(actionData.map((o: { value: string; action_key: string | null }) => [o.value, o.action_key])));
      setSeniorityOptions(seniorityData.map((o: { value: string }) => o.value));
      setUserOptions(userData.map((o: { id: number; value: string }) => ({ id: Number(o.id), value: String(o.value) })));
      setEditData({ first_name: atData.first_name, last_name: atData.last_name, title: atData.title || '', company_id: atData.company_id?.toString() || '', email: atData.email || '', seniority: atData.seniority || '' });
    } catch {
      toast.error('Failed to load attendee');
      router.push('/attendees');
    } finally { setIsLoading(false); }
  }, [id, router]);

  useEffect(() => { fetchAttendee(); fetchFollowUps(); fetchNotes(); fetchMeetings(); }, [fetchAttendee, fetchFollowUps, fetchNotes, fetchMeetings]);

  // Load conference detail when a conference is selected
  useEffect(() => {
    if (!selectedConferenceId) {
      setConferenceDetail(null);
      return;
    }
    setIsLoadingDetail(true);
    fetch(`/api/conference-details?attendee_id=${id}&conference_id=${selectedConferenceId}`)
      .then(r => r.json())
      .then(data => {
        setConferenceDetail(data);
      })
      .catch(() => {
        setConferenceDetail(null);
      })
      .finally(() => setIsLoadingDetail(false));
  }, [selectedConferenceId, id]);

  const patchAttendee = useCallback(async (fields: Record<string, string | number | null>) => {
    const res = await fetch(`/api/attendees/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(fields) });
    if (!res.ok) throw new Error('Update failed');
    const updated = await res.json();
    setAttendee(prev => prev ? { ...prev, ...updated } : prev);
    return updated;
  }, [id]);

  const upsertConferenceDetail = useCallback(async (fields: Partial<ConferenceDetail>) => {
    if (!selectedConferenceId) return;
    const payload = {
      attendee_id: Number(id),
      conference_id: Number(selectedConferenceId),
      action: conferenceDetail?.action ?? null,
      next_steps: conferenceDetail?.next_steps ?? null,
      next_steps_notes: conferenceDetail?.next_steps_notes ?? null,
      assigned_rep: conferenceDetail?.assigned_rep ?? null,
      ...fields,
    };
    const res = await fetch('/api/conference-details', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error('Update failed');
    const updated = await res.json();
    setConferenceDetail(updated);
    return updated;
  }, [id, selectedConferenceId, conferenceDetail]);

  const handleSave = async () => {
    if (!editData.first_name || !editData.last_name) { toast.error('First and last name are required.'); return; }
    setIsSaving(true);
    try {
      const res = await fetch(`/api/attendees/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...editData, company_id: editData.company_id ? parseInt(editData.company_id) : null, seniority: editData.seniority || null }) });
      if (!res.ok) throw new Error();
      toast.success('Attendee updated!');
      setIsEditing(false);
      fetchAttendee();
    } catch { toast.error('Failed to update attendee'); } finally { setIsSaving(false); }
  };

  const handleDelete = async () => {
    if (!confirm('Delete this attendee? This cannot be undone.')) return;
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/attendees/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error();
      toast.success('Attendee deleted.');
      router.push('/attendees');
    } catch { toast.error('Failed to delete attendee'); setIsDeleting(false); }
  };

  const handleToggleFollowUp = async (attendeeId: number, conferenceId: number, completed: boolean) => {
    setFollowUps((prev) =>
      prev.map((fu) =>
        fu.attendee_id === attendeeId && fu.conference_id === conferenceId ? { ...fu, completed } : fu
      )
    );
    try {
      const res = await fetch('/api/follow-ups', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ attendee_id: attendeeId, conference_id: conferenceId, completed }),
      });
      if (!res.ok) throw new Error();
      toast.success(completed ? 'Marked as completed!' : 'Marked as pending.');
    } catch {
      setFollowUps((prev) =>
        prev.map((fu) =>
          fu.attendee_id === attendeeId && fu.conference_id === conferenceId ? { ...fu, completed: !completed } : fu
        )
      );
      toast.error('Failed to update.');
    }
  };

  const handleDeleteFollowUp = async (attendeeId: number, conferenceId: number) => {
    if (!confirm('Are you sure you want to delete this follow-up?')) return;
    const prev = followUps;
    setFollowUps(fus => fus.filter(fu => !(fu.attendee_id === attendeeId && fu.conference_id === conferenceId)));
    try {
      const res = await fetch('/api/follow-ups', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ attendee_id: attendeeId, conference_id: conferenceId }),
      });
      if (!res.ok) throw new Error();
      toast.success('Follow-up deleted.');
    } catch {
      setFollowUps(prev);
      toast.error('Failed to delete follow-up.');
    }
  };

  const handleRepChange = async (attendeeId: number, conferenceId: number, rep: string | null) => {
    setFollowUps((prev) =>
      prev.map((fu) =>
        fu.attendee_id === attendeeId && fu.conference_id === conferenceId
          ? { ...fu, assigned_rep: rep }
          : fu
      )
    );
    try {
      const res = await fetch('/api/follow-ups', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ attendee_id: attendeeId, conference_id: conferenceId, assigned_rep: rep }),
      });
      if (!res.ok) throw new Error();
      toast.success('Rep updated.');
    } catch {
      fetchFollowUps();
      toast.error('Failed to update rep.');
    }
  };

  const handleStatus = async (value: string) => {
    const currentStatuses = new Set((attendee?.status || '').split(',').map(s => s.trim()).filter(Boolean));
    if (currentStatuses.has(value)) { currentStatuses.delete(value); } else { currentStatuses.add(value); }
    const newStatus = Array.from(currentStatuses).join(',');
    try { await patchAttendee({ status: newStatus, company_id: attendee?.company_id ?? null }); toast.success(newStatus ? 'Status updated.' : 'Status cleared.'); }
    catch { toast.error('Failed to update status.'); }
  };

  const handleAction = async (value: string) => {
    if (!selectedConferenceId) { toast.error('Please select a conference first.'); return; }
    try {
      const current = new Set((conferenceDetail?.action || '').split(',').map(a => a.trim()).filter(Boolean));
      if (current.has(value)) current.delete(value); else {
        current.add(value);
        // When selecting Cancelled or No Show, deselect Held and Pending
        const selectedKey = actionKeyMap[value];
        if (selectedKey === 'cancelled' || selectedKey === 'no_show') {
          const keysToRemove = ['meeting_held', 'pending'];
          for (const opt of Array.from(current)) {
            if (opt !== value && keysToRemove.includes(actionKeyMap[opt] ?? '')) {
              current.delete(opt);
            }
          }
        }
        // When selecting Scheduled, deselect Cancelled
        if (selectedKey === 'meeting_scheduled') {
          for (const opt of Array.from(current)) {
            if (opt !== value && actionKeyMap[opt] === 'cancelled') {
              current.delete(opt);
            }
          }
        }
      }
      const newAction = Array.from(current).join(',') || undefined;
      await upsertConferenceDetail({ action: newAction });
    } catch { toast.error('Failed to update action.'); }
  };

  const handleScheduleMeeting = async () => {
    if (!selectedConferenceId) { toast.error('Please select a conference first.'); return; }
    if (!meetingForm.meeting_date || !meetingForm.meeting_time) { toast.error('Date and time are required.'); return; }
    setIsSchedulingMeeting(true);
    try {
      const res = await fetch('/api/meetings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          attendee_id: Number(id),
          conference_id: Number(selectedConferenceId),
          meeting_date: meetingForm.meeting_date,
          meeting_time: meetingForm.meeting_time,
          location: meetingForm.location || null,
          scheduled_by: meetingForm.scheduled_by || null,
          additional_attendees: meetingForm.additional_attendees.trim() || null,
        }),
      });
      if (!res.ok) throw new Error('Failed to schedule meeting');
      toast.success('Meeting scheduled!');
      setShowMeetingForm(false);
      setMeetingForm({ meeting_date: '', meeting_time: '', location: '', scheduled_by: '', additional_attendees: '' });
      fetchMeetings();
      // Refresh conference details to show updated actions
      const detailRes = await fetch(`/api/conference-details?attendee_id=${id}&conference_id=${selectedConferenceId}`);
      if (detailRes.ok) {
        const data = await detailRes.json();
        setConferenceDetail(data);
      }
    } catch { toast.error('Failed to schedule meeting.'); }
    finally { setIsSchedulingMeeting(false); }
  };

  const handleMeetingOutcome = async (meetingId: number, outcome: string) => {
    setMeetings(prev => prev.map(m => m.id === meetingId ? { ...m, outcome } : m));
    try {
      const res = await fetch('/api/meetings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: meetingId, outcome }),
      });
      if (!res.ok) throw new Error();
      toast.success('Outcome updated.');
      // Refresh conference details to reflect action update
      if (selectedConferenceId) {
        const detailRes = await fetch(`/api/conference-details?attendee_id=${id}&conference_id=${selectedConferenceId}`);
        if (detailRes.ok) {
          const data = await detailRes.json();
          setConferenceDetail(data);
        }
      }
    } catch {
      fetchMeetings();
      toast.error('Failed to update outcome.');
    }
  };

  const handleDeleteMeeting = async (meetingId: number) => {
    if (!confirm('Delete this meeting? This cannot be undone.')) return;
    try {
      const res = await fetch(`/api/meetings/${meetingId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error();
      toast.success('Meeting deleted.');
      fetchMeetings();
      // Refresh conference detail to reflect deselected actions
      if (selectedConferenceId) {
        const detailRes = await fetch(`/api/conference-details?attendee_id=${id}&conference_id=${selectedConferenceId}`);
        if (detailRes.ok) {
          const data = await detailRes.json();
          setConferenceDetail(data);
        }
      }
    } catch {
      toast.error('Failed to delete meeting.');
    }
  };


  if (isLoading) return <div className="flex items-center justify-center h-64"><div className="animate-spin w-8 h-8 border-4 border-procare-bright-blue border-t-transparent rounded-full" /></div>;
  if (!attendee) return null;

  const seniority = effectiveSeniority(attendee.seniority, attendee.title);
  const currentStatus = attendee.status || 'Unknown';
  const currentStatuses = new Set(currentStatus.split(',').map(s => s.trim()).filter(Boolean));

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <nav className="flex items-center gap-2 text-sm text-gray-500">
          <Link href="/attendees" className="hover:text-procare-bright-blue">Attendees</Link>
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
          <span className="text-gray-800">{attendee.first_name} {attendee.last_name}</span>
        </nav>
        <BackButton />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left column (2/3 width) — profile + follow ups */}
        <div className="lg:col-span-2 space-y-6">
          {/* Profile Card */}
          <div className="card">
            {isEditing ? (
              <div className="space-y-4">
                <h2 className="text-lg font-semibold text-procare-dark-blue font-serif">Edit Attendee</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div><label className="label">First Name *</label><input value={editData.first_name || ''} onChange={e => setEditData(p => ({ ...p, first_name: e.target.value }))} className="input-field" /></div>
                  <div><label className="label">Last Name *</label><input value={editData.last_name || ''} onChange={e => setEditData(p => ({ ...p, last_name: e.target.value }))} className="input-field" /></div>
                  <div><label className="label">Title</label><input value={editData.title || ''} onChange={e => setEditData(p => ({ ...p, title: e.target.value }))} className="input-field" /></div>
                  <div>
                    <label className="label">Company</label>
                    <select value={editData.company_id || ''} onChange={e => setEditData(p => ({ ...p, company_id: e.target.value }))} className="input-field">
                      <option value="">No company</option>
                      {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                  <div><label className="label">Email</label><input type="email" value={editData.email || ''} onChange={e => setEditData(p => ({ ...p, email: e.target.value }))} className="input-field" /></div>
                  <div>
                    <label className="label">Seniority</label>
                    <select value={editData.seniority || ''} onChange={e => setEditData(p => ({ ...p, seniority: e.target.value }))} className="input-field">
                      <option value="">Auto-detect from title</option>
                      {seniorityOptions.map(val => <option key={val} value={val}>{val}</option>)}
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <button onClick={handleSave} disabled={isSaving} className="btn-primary">{isSaving ? 'Saving...' : 'Save'}</button>
                  <button onClick={() => setIsEditing(false)} className="btn-secondary">Cancel</button>
                  <button onClick={handleDelete} disabled={isDeleting} className="btn-danger">{isDeleting ? 'Deleting...' : 'Delete'}</button>
                </div>
              </div>
            ) : (
              <div>
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-4">
                    <div className="w-16 h-16 rounded-full bg-procare-dark-blue flex items-center justify-center text-white text-2xl font-bold font-serif flex-shrink-0">
                      {attendee.first_name[0]}{attendee.last_name[0]}
                    </div>
                    <div>
                      <h1 className="text-2xl font-bold text-procare-dark-blue font-serif">{attendee.first_name} {attendee.last_name}</h1>
                      {attendee.title && <p className="text-gray-600 mt-1">{attendee.title}</p>}
                      <div className="flex flex-wrap gap-2 mt-2">
                        {attendee.title && <span className={`badge ${getPillClass(seniority, colorMaps.seniority || {})}`}>{seniority}</span>}
                        {currentStatuses.size > 0 ? Array.from(currentStatuses).map(s => (
                          <span key={s} className={`badge ${getPillClass(s, colorMaps.status || {})}`}>{s}</span>
                        )) : <span className={`badge ${getPillClass('Unknown', colorMaps.status || {})}`}>Unknown</span>}
                        {attendee.company_type && <span className={getBadgeClass(attendee.company_type, colorMaps.company_type || {})}>{attendee.company_type}</span>}
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => setIsEditing(true)} className="btn-secondary text-sm flex items-center gap-2">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                      <span className="hidden sm:inline">Edit</span>
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6 pt-6 border-t border-gray-100">
                  <div>
                    <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">Company</p>
                    {attendee.company_name ? (
                      attendee.company_id ? (
                        <Link href={`/companies/${attendee.company_id}`} className="text-sm font-medium text-gray-800 hover:text-procare-bright-blue hover:underline">{attendee.company_name}</Link>
                      ) : (
                        <p className="text-sm font-medium text-gray-800">{attendee.company_name}</p>
                      )
                    ) : <p className="text-sm text-gray-400">—</p>}
                  </div>
                  <div>
                    <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">Assigned Rep(s)</p>
                    <div className="flex flex-wrap gap-1">
                      {attendee.company_assigned_user ? resolveRepInitials(attendee.company_assigned_user, userOptionsFull).map((ini, i) => (
                        <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 text-xs font-medium">
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3 h-3 flex-shrink-0">
                            <path d="M10 8a3 3 0 100-6 3 3 0 000 6zM3.465 14.493a1.23 1.23 0 00.41 1.412A9.957 9.957 0 0010 18c2.31 0 4.438-.784 6.131-2.1.43-.333.604-.903.408-1.41a7.002 7.002 0 00-13.074.003z" />
                          </svg>
                          {ini}
                        </span>
                      )) : <p className="text-sm text-gray-400">—</p>}
                    </div>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">Email</p>
                    {attendee.email ? (
                      <span
                        ref={emailTooltipRef}
                        className="relative group/email inline-block"
                        onClick={() => setShowEmailTooltip(v => !v)}
                      >
                        <button type="button" className="p-1 rounded-lg hover:bg-gray-100 transition-colors text-procare-bright-blue">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                          </svg>
                        </button>
                        <span className={`pointer-events-auto absolute bottom-full left-0 mb-2 z-20 flex-col items-start ${showEmailTooltip ? 'flex' : 'hidden group-hover/email:flex'}`}>
                          <span className="rounded-lg bg-gray-900 px-3 py-2.5 text-xs text-white shadow-xl whitespace-nowrap">
                            <span className="block font-semibold mb-1 text-gray-300 uppercase tracking-wide text-[10px]">Email</span>
                            <a
                              href={`mailto:${attendee.email}`}
                              className="text-procare-bright-blue hover:underline"
                              onClick={e => e.stopPropagation()}
                            >
                              {attendee.email}
                            </a>
                          </span>
                          <span className="w-2 h-2 bg-gray-900 rotate-45 -mt-1 ml-3" />
                        </span>
                      </span>
                    ) : <p className="text-sm text-gray-400">—</p>}
                  </div>
                  <div>
                    <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">Added</p>
                    <p className="text-sm text-gray-600">{new Date(attendee.created_at).toLocaleDateString()}</p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Meetings */}
          <div className="card p-0 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100">
              <h2 className="text-lg font-semibold text-procare-dark-blue font-serif">
                Meetings
                {meetings.length > 0 && (
                  <span className="ml-2 text-sm font-normal text-gray-500">
                    ({meetings.length})
                  </span>
                )}
              </h2>
            </div>
            <MeetingsTable meetings={meetings} actionOptions={actionOptions.map(o => o.value)} colorMap={colorMaps.action || {}} userOptions={userOptions} hideCompany onOutcomeChange={handleMeetingOutcome} onDelete={handleDeleteMeeting} onEdit={async (meetingId, data) => {
              setMeetings(prev => prev.map(m => m.id === meetingId ? { ...m, ...data } : m));
              try {
                const res = await fetch(`/api/meetings/${meetingId}`, {
                  method: 'PUT',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify(data),
                });
                if (!res.ok) throw new Error();
                toast.success('Meeting updated.');
              } catch {
                fetchMeetings();
                toast.error('Failed to update meeting.');
              }
            }} />
          </div>

          {/* Follow Ups */}
          <div className="card p-0 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-procare-dark-blue font-serif">
                Follow Ups
                {followUps.length > 0 && (
                  <span className="ml-2 text-sm font-normal text-gray-500">
                    ({followUps.filter(f => !f.completed).length} pending)
                  </span>
                )}
              </h2>
              <button
                type="button"
                onClick={() => setShowAssignFollowUp(true)}
                className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-gray-100 transition-colors"
            title="Follow Up"
              >
                <svg className="w-5 h-5 text-procare-bright-blue" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            <span className="text-sm 
                <span className="text-sm font-medium text-procare-bright-blue">Add Follow Up</span>
              </button>
            </div>
            <FollowUpsTable followUps={followUps} onToggle={handleToggleFollowUp} onDelete={handleDeleteFollowUp} userOptions={userOptions} onRepChange={handleRepChange} />
          </div>

          {/* Notes */}
          <NotesSection
            entityType="attendee"
            entityId={Number(id)}
            initialNotes={attendeeNotes}
            conferences={attendee.conferences}
            currentAttendeeName={`${attendee.first_name} ${attendee.last_name}`}
            currentCompanyName={attendee.company_name}
            currentCompanyId={attendee.company_id}
          />
        </div>

        {/* Right column (1/3 width) */}
        <div className="space-y-6">
          {/* Conferences — at the top of the right column */}
          <div className="card">
            <h2 className="text-lg font-semibold text-procare-dark-blue mb-4 font-serif">Conferences ({attendee.conferences.length})</h2>
            {attendee.conferences.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-4">Not associated with any conferences.</p>
            ) : (
              <div className="space-y-2">
                {attendee.conferences.map(conf => (
                  <Link key={conf.id} href={`/conferences/${conf.id}`} className="flex items-center justify-between p-3 rounded-lg border border-gray-100 hover:border-procare-bright-blue hover:bg-blue-50 transition-all">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-800 truncate">{conf.name}</p>
                      <p className="text-xs text-gray-500">{formatDate(conf.start_date)}</p>
                    </div>
                    <svg className="w-4 h-4 text-gray-400 flex-shrink-0 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                  </Link>
                ))}
              </div>
            )}
          </div>
          {/* Status */}
          <div className="card">
            <h2 className="text-base font-semibold text-procare-dark-blue font-serif mb-3">Status</h2>
            <div className="flex flex-wrap gap-2">
              {statusOptions.map(val => (
                <button key={val} onClick={() => handleStatus(val)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium border-2 transition-all ${currentStatuses.has(val) ? `${getPillClass(val, colorMaps.status || {})} shadow-md scale-105` : 'bg-white text-gray-500 border-gray-200 hover:border-gray-400'}`}>
                  {val}
                </button>
              ))}
            </div>
          </div>

          {/* Conference selector */}
          <div className="card">
            <h2 className="text-base font-semibold text-procare-dark-blue font-serif mb-3">Conference Activity</h2>
            <div className="mb-4">
              <label className="label text-xs">Select a conference to log activity</label>
              <select
                value={selectedConferenceId}
                onChange={e => setSelectedConferenceId(e.target.value)}
                className="input-field"
              >
                <option value="">— select a conference —</option>
                {attendee.conferences.map(conf => (
                  <option key={conf.id} value={conf.id}>{conf.name}</option>
                ))}
              </select>
            </div>

            {!selectedConferenceId && (
              <p className="text-xs text-gray-400 text-center py-4">Select a conference above to log actions and next steps.</p>
            )}

            {selectedConferenceId && isLoadingDetail && (
              <div className="flex justify-center py-4">
                <div className="animate-spin w-5 h-5 border-2 border-procare-bright-blue border-t-transparent rounded-full" />
              </div>
            )}

            {selectedConferenceId && !isLoadingDetail && (
              <div className="space-y-5">
                {/* Schedule Meeting */}
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Schedule Meeting</p>
                  {!showMeetingForm ? (
                    <button
                      onClick={() => setShowMeetingForm(true)}
                      className="w-full px-3 py-2 rounded-lg text-xs font-medium border-2 border-dashed border-gray-300 text-gray-500 hover:border-procare-bright-blue hover:text-procare-bright-blue transition-all flex items-center justify-center gap-1.5"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                      Schedule Meeting
                    </button>
                  ) : (
                    <div className="space-y-3">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <div>
                          <label className="label text-[10px]">Meeting Date *</label>
                          <input type="date" value={meetingForm.meeting_date} onChange={e => setMeetingForm(p => ({ ...p, meeting_date: e.target.value }))} className="input-field text-xs" />
                        </div>
                        <div>
                          <label className="label text-[10px]">Meeting Time *</label>
                          <input type="time" value={meetingForm.meeting_time} onChange={e => setMeetingForm(p => ({ ...p, meeting_time: e.target.value }))} className="input-field text-xs" />
                        </div>
                      </div>
                      <div>
                        <label className="label text-[10px]">Location</label>
                        <input type="text" value={meetingForm.location} onChange={e => setMeetingForm(p => ({ ...p, location: e.target.value }))} placeholder="e.g., Conference Room A" className="input-field text-xs" />
                      </div>
                      <div>
                        <label className="label text-[10px]">Scheduled By</label>
                        <RepMultiSelect
                          options={userOptions}
                          selectedIds={parseRepIds(meetingForm.scheduled_by)}
                          onChange={(ids) => setMeetingForm(p => ({ ...p, scheduled_by: ids.join(',') }))}
                          triggerClass="input-field w-full text-xs flex items-center justify-between gap-2"
                          placeholder="Select reps..."
                        />
                      </div>
                      <div>
                        <label className="label text-[10px]">Additional Attendees</label>
                        <input
                          type="text"
                          placeholder="Comma-separated names..."
                          className="input-field text-xs"
                          value={meetingForm.additional_attendees}
                          onChange={e => setMeetingForm(p => ({ ...p, additional_attendees: e.target.value }))}
                        />
                        <p className="text-[10px] text-gray-400 mt-0.5">Separate multiple names with commas</p>
                      </div>
                      <div className="flex gap-2">
                        <button onClick={handleScheduleMeeting} disabled={isSchedulingMeeting} className="btn-primary text-xs flex-1">
                          {isSchedulingMeeting ? 'Scheduling...' : 'Schedule Meeting'}
                        </button>
                        <button onClick={() => { setShowMeetingForm(false); setMeetingForm({ meeting_date: '', meeting_time: '', location: '', scheduled_by: '', additional_attendees: '' }); }} className="btn-secondary text-xs">
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Actions</p>
                  <div className="flex flex-wrap gap-2">
                    {(() => {
                      const RESTRICTED_ACTION_KEYS = new Set(['meeting_held', 'meeting_scheduled', 'pending', 'meeting_rescheduled', 'cancelled', 'no_show']);
                      const activeActions = new Set((conferenceDetail?.action || '').split(',').map(a => a.trim()).filter(Boolean));
                      return actionOptions
                        .filter(opt => isAdminUser || !opt.action_key || !RESTRICTED_ACTION_KEYS.has(opt.action_key))
                        .map(opt => {
                          const isActive = activeActions.has(opt.value);
                          const pillCls = isActive ? getPillClass(opt.value, colorMaps.action ?? {}) : '';
                          return (
                            <button key={opt.id} onClick={() => handleAction(opt.value)}
                              className={`px-3 py-1.5 rounded-lg text-xs font-medium border-2 transition-all flex items-center gap-1.5 ${isActive ? `${pillCls} shadow-md` : 'bg-white text-gray-600 border-gray-200 hover:border-procare-bright-blue hover:text-procare-bright-blue'}`}>
                              {isActive && <svg className="w-3 h-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>}
                              {opt.value}
                            </button>
                          );
                        });
                    })()}
                  </div>
                </div>


              </div>
            )}
          </div>
        </div>
      </div>

      <AssignFollowUpModal
        isOpen={showAssignFollowUp}
        onClose={() => setShowAssignFollowUp(false)}
        onSuccess={fetchFollowUps}
        defaultAttendeeId={Number(id)}
        defaultConferenceId={selectedConferenceId ? Number(selectedConferenceId) : undefined}
        defaultCompanyId={attendee?.company_id}
      />
    </div>
  );
}
