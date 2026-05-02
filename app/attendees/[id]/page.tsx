'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { effectiveSeniority } from '@/lib/parsers';
import { FollowUpsTable, type FollowUp } from '@/components/FollowUpsTable';
import { MeetingsTable, type Meeting, type EditFormData } from '@/components/MeetingsTable';
import { NotesSection, type EntityNote } from '@/components/NotesSection';
import { PinnedNotesSection, type PinnedNote } from '@/components/PinnedNotesSection';
import { BackButton } from '@/components/BackButton';
import { RepMultiSelect } from '@/components/RepMultiSelect';
import { parseRepIds } from '@/lib/useUserOptions';
import { useUser } from '@/components/UserContext';
import { AssignFollowUpModal } from '@/components/AssignFollowUpModal';
import { NewMeetingModal } from '@/components/NewMeetingModal';
import { useConfigColors } from '@/lib/useConfigColors';
import { getPillClass, getBadgeClass, getPreset } from '@/lib/colors';
import { useUserOptions, resolveRepInitials, getRepInitials } from '@/lib/useUserOptions';
import { InternalRelationshipsSection } from '@/components/InternalRelationshipsSection';
import { TouchpointsSection } from '@/components/TouchpointsSection';
import { useSectionConfig } from '@/lib/useSectionConfig';
import { ComposeEmailModal } from '@/components/ComposeEmailModal';

interface Conference { id: number; name: string; start_date: string; end_date: string; location: string; }

type RsvpStatus = 'yes' | 'no' | 'maybe' | 'attended';
function parseRsvpStatuses(stored: string | null | undefined): RsvpStatus[] {
  if (!stored) return [];
  return stored.split(',').map(s => s.trim()).filter(s => ['yes','no','maybe','attended'].includes(s)) as RsvpStatus[];
}

interface AttendeeEventItem {
  event_id: number;
  event_name: string | null;
  event_type: string | null;
  conference_id: number;
  conference_name: string;
  rsvp_status: string | null;
}

interface Attendee {
  id: number; first_name: string; last_name: string; title?: string;
  company_id?: number; company_name?: string; company_type?: string; company_website?: string; company_assigned_user?: string;
  email?: string; notes?: string; action?: string; next_steps?: string;
  next_steps_notes?: string; status?: string; seniority?: string; linkedin_url?: string; phone?: string;
  function?: string; products?: string;
  created_at: string; conferences: Conference[];
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
  const routerRef = useRef(router);
  useEffect(() => { routerRef.current = router; }, [router]);
  const id = params.id as string;
  const colorMaps = useConfigColors();
  const userOptionsFull = useUserOptions();
  const { getLabel: getSectionLabel, orderedKeys: sectionOrder, isVisible: isSectionVisible } = useSectionConfig('attendee');

  const [attendee, setAttendee] = useState<Attendee | null>(null);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [editData, setEditData] = useState<{ first_name?: string; last_name?: string; title?: string; company_id?: string; email?: string; seniority?: string; linkedin_url?: string; phone?: string; function?: string }>({});
  const [showPhonePopup, setShowPhonePopup] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const { user } = useUser();
  const isAdminUser = user?.role === 'administrator';

  // Dynamic config options
  const [statusOptions, setStatusOptions] = useState<string[]>([]);
  const [actionOptions, setActionOptions] = useState<{ id: number; value: string; action_key: string | null }[]>([]);
  const [actionKeyMap, setActionKeyMap] = useState<Record<string, string | null>>({});
  const [seniorityOptions, setSeniorityOptions] = useState<string[]>([]);
  const [functionOptions, setFunctionOptions] = useState<string[]>([]);
  const [productsOptions, setProductsOptions] = useState<{ value: string; color: string | null }[]>([]);
  const [userOptions, setUserOptions] = useState<import('@/lib/useUserOptions').UserOption[]>([]);

  const [showAssignFollowUp, setShowAssignFollowUp] = useState(false);
  const [showComposeEmail, setShowComposeEmail] = useState(false);
  const [conferencesExpanded, setConferencesExpanded] = useState(false);

  // Follow-ups
  const [followUps, setFollowUps] = useState<FollowUp[]>([]);
  const [attendeeNotes, setAttendeeNotes] = useState<EntityNote[]>([]);

  // Meetings
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [showScheduleMeeting, setShowScheduleMeeting] = useState(false);
  const [showMeetingForm, setShowMeetingForm] = useState(false);
  const [meetingForm, setMeetingForm] = useState({ meeting_date: '', meeting_time: '', location: '', scheduled_by: '', additional_attendees: '' });
  const [isSchedulingMeeting, setIsSchedulingMeeting] = useState(false);

  // Pinned notes
  const [pinnedNotes, setPinnedNotes] = useState<PinnedNote[]>([]);
  const [pinnedNoteIds, setPinnedNoteIds] = useState<Set<number>>(new Set());

  // Internal relationships state
  const [internalRelationships, setInternalRelationships] = useState<{ id: number; company_id: number; rep_ids: string | null; contact_ids: string | null; relationship_status: string; description: string; created_at: string }[]>([]);
  const [relTypeOptions, setRelTypeOptions] = useState<{ id: number; value: string }[]>([]);

  // Events / Social section
  const [attendeeEvents, setAttendeeEvents] = useState<AttendeeEventItem[]>([]);
  const [eventsExpanded, setEventsExpanded] = useState(true);
  const [localEventRsvps, setLocalEventRsvps] = useState<Record<number, RsvpStatus[]>>({});
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteForm, setInviteForm] = useState({ rep: '', conference_id: '', event_id: '' });
  const [inviteConferenceEvents, setInviteConferenceEvents] = useState<{ id: number; event_name: string | null; event_type: string | null }[]>([]);
  const [isLoadingInviteEvents, setIsLoadingInviteEvents] = useState(false);
  const [isInviting, setIsInviting] = useState(false);

  const fetchInternalRelationships = useCallback(async () => {
    try {
      const res = await fetch(`/api/internal-relationships?attendee_id=${id}`);
      if (res.ok) setInternalRelationships(await res.json());
    } catch { /* non-fatal */ }
  }, [id]);

  const fetchAttendeeEvents = useCallback(async () => {
    try {
      const res = await fetch(`/api/social-events/attendee?attendee_id=${id}`);
      if (res.ok) setAttendeeEvents(await res.json());
    } catch { /* non-fatal */ }
  }, [id]);

  const handleToggleEventRsvp = useCallback(async (eventId: number, status: RsvpStatus) => {
    const current = localEventRsvps[eventId] ?? parseRsvpStatuses(attendeeEvents.find(e => e.event_id === eventId)?.rsvp_status);
    const next = current.includes(status) ? current.filter(s => s !== status) : [...current, status];
    setLocalEventRsvps(prev => ({ ...prev, [eventId]: next }));
    try {
      const res = await fetch(`/api/social-events/${eventId}/rsvp`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ attendee_id: Number(id), rsvp_status: next.length > 0 ? next.join(',') : 'maybe' }),
      });
      if (!res.ok) throw new Error();
    } catch {
      setLocalEventRsvps(prev => { const n = { ...prev }; delete n[eventId]; return n; });
      toast.error('Failed to save RSVP');
    }
  }, [localEventRsvps, attendeeEvents, id]);

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

  const fetchPinnedNotes = useCallback(async () => {
    try {
      const res = await fetch(`/api/pinned-notes?entity_type=attendee&entity_id=${id}`);
      if (res.ok) {
        const data = await res.json();
        setPinnedNotes(data);
        setPinnedNoteIds(new Set(data.map((p: PinnedNote) => p.note_id)));
      }
    } catch { /* non-fatal */ }
  }, [id]);

  const fetchAttendee = useCallback(async () => {
    try {
      const [atRes, coRes, statusRes, actionRes, seniorityRes, userRes, relTypeRes, functionRes, productsRes] = await Promise.all([
        fetch(`/api/attendees/${id}`),
        fetch('/api/companies'),
        fetch('/api/config?category=status&form=attendee_detail'),
        fetch('/api/config?category=action&form=attendee_detail'),
        fetch('/api/config?category=seniority&form=attendee_detail'),
        fetch('/api/config?category=user&form=attendee_detail'),
        fetch('/api/config?category=rep_relationship_type&form=attendee_detail'),
        fetch('/api/config?category=function'),
        fetch('/api/config?category=products'),
      ]);
      if (!atRes.ok) throw new Error('Not found');
      const [atData, coData, statusData, actionData, seniorityData, userData, relTypeData, functionData, productsData] = await Promise.all([
        atRes.json(), coRes.json(), statusRes.json(), actionRes.json(), seniorityRes.json(), userRes.json(), relTypeRes.json(), functionRes.json(), productsRes.json(),
      ]);
      setAttendee(atData);
      setCompanies(coData);
      setStatusOptions(statusData.map((o: { value: string }) => o.value));
      setActionOptions(actionData.map((o: { id: number; value: string; action_key: string | null }) => ({ id: Number(o.id), value: String(o.value), action_key: o.action_key ?? null })));
      setActionKeyMap(Object.fromEntries(actionData.map((o: { value: string; action_key: string | null }) => [o.value, o.action_key])));
      setSeniorityOptions(seniorityData.map((o: { value: string }) => o.value));
      setUserOptions(userData.map((o: { id: number; value: string }) => ({ id: Number(o.id), value: String(o.value) })));
      setRelTypeOptions(relTypeData.map((o: { id: number; value: string }) => ({ id: Number(o.id), value: String(o.value) })));
      setFunctionOptions(functionData.map((o: { value: string }) => o.value));
      setProductsOptions(productsData.map((o: { value: string; color: string | null }) => ({ value: String(o.value), color: o.color ?? null })));
      setEditData({ first_name: atData.first_name, last_name: atData.last_name, title: atData.title || '', company_id: atData.company_id?.toString() || '', email: atData.email || '', seniority: atData.seniority || '', linkedin_url: atData.linkedin_url || '', phone: atData.phone || '', function: atData.function || '' });
    } catch {
      toast.error('Failed to load attendee');
      routerRef.current.push('/attendees');
    } finally { setIsLoading(false); }
  }, [id]);

  useEffect(() => { fetchAttendee(); fetchFollowUps(); fetchNotes(); fetchMeetings(); fetchPinnedNotes(); fetchInternalRelationships(); fetchAttendeeEvents(); }, [fetchAttendee, fetchFollowUps, fetchNotes, fetchMeetings, fetchPinnedNotes, fetchInternalRelationships, fetchAttendeeEvents]);

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

  const handleInviteConferenceChange = async (conferenceId: string) => {
    setInviteForm(p => ({ ...p, conference_id: conferenceId, event_id: '' }));
    if (!conferenceId) { setInviteConferenceEvents([]); return; }
    setIsLoadingInviteEvents(true);
    try {
      const res = await fetch(`/api/social-events?conference_id=${conferenceId}`);
      if (res.ok) {
        const events = await res.json();
        setInviteConferenceEvents(events.map((e: { id: number; event_name: string | null; event_type: string | null }) => ({ id: e.id, event_name: e.event_name, event_type: e.event_type })));
      }
    } catch { /* non-fatal */ }
    finally { setIsLoadingInviteEvents(false); }
  };

  const handleInviteSubmit = async () => {
    if (!inviteForm.event_id) { toast.error('Please select an event.'); return; }
    setIsInviting(true);

    // Build optimistic event card from current form selections
    const eventId = Number(inviteForm.event_id);
    const conferenceId = Number(inviteForm.conference_id);
    const selectedEvent = inviteConferenceEvents.find(e => e.id === eventId);
    const selectedConference = attendee?.conferences.find(c => c.id === conferenceId);
    const optimisticEvent: AttendeeEventItem = {
      event_id: eventId,
      event_name: selectedEvent?.event_name ?? null,
      event_type: selectedEvent?.event_type ?? null,
      conference_id: conferenceId,
      conference_name: selectedConference?.name ?? '',
      rsvp_status: 'maybe',
    };
    const alreadyPresent = attendeeEvents.some(e => e.event_id === eventId);
    if (!alreadyPresent) setAttendeeEvents(prev => [...prev, optimisticEvent]);

    try {
      const res = await fetch(`/api/social-events/${inviteForm.event_id}/guest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ attendee_id: Number(id) }),
      });
      if (!res.ok) throw new Error();
      toast.success('Added to guest list!');
      setShowInviteModal(false);
      setInviteForm({ rep: '', conference_id: '', event_id: '' });
      setInviteConferenceEvents([]);
      fetchAttendeeEvents();
    } catch {
      // Roll back the optimistic addition
      if (!alreadyPresent) setAttendeeEvents(prev => prev.filter(e => e.event_id !== eventId));
      toast.error('Failed to add to guest list.');
    }
    finally { setIsInviting(false); }
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

  const handleToggleFollowUp = async (id: number, completed: boolean) => {
    setFollowUps((prev) =>
      prev.map((fu) =>
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
      toast.success(completed ? 'Marked as completed!' : 'Marked as pending.');
    } catch {
      setFollowUps((prev) =>
        prev.map((fu) =>
          fu.id === id ? { ...fu, completed: !completed } : fu
        )
      );
      toast.error('Failed to update.');
    }
  };

  const handleDeleteFollowUp = async (id: number) => {
    if (!confirm('Are you sure you want to delete this follow-up?')) return;
    const prev = followUps;
    setFollowUps(fus => fus.filter(fu => fu.id !== id));
    try {
      const res = await fetch('/api/follow-ups', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      if (!res.ok) throw new Error();
      toast.success('Follow-up deleted.');
    } catch {
      setFollowUps(prev);
      toast.error('Failed to delete follow-up.');
    }
  };

  const handleRepChange = async (id: number, rep: string | null) => {
    setFollowUps((prev) =>
      prev.map((fu) =>
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
      fetchFollowUps();
      toast.error('Failed to update rep.');
    }
  };

  const handlePinNote = async (noteId: number, conferenceName: string | null, _attendeeName: string | null, _attendeeId: number | null) => {
    if (!user?.email) { toast.error('You must be logged in to pin notes.'); return; }
    const attendeeName = attendee ? `${attendee.first_name} ${attendee.last_name}` : null;
    try {
      // Pin to attendee
      const res = await fetch('/api/pinned-notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          note_id: noteId,
          entity_type: 'attendee',
          entity_id: Number(id),
          pinned_by: user.email,
          conference_name: conferenceName,
          attendee_name: null,
          attendee_id: null,
        }),
      });
      if (!res.ok) throw new Error();

      // Also pin to company if attendee has a company
      if (attendee?.company_id) {
        await fetch('/api/pinned-notes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            note_id: noteId,
            entity_type: 'company',
            entity_id: attendee.company_id,
            pinned_by: user.email,
            conference_name: conferenceName,
            attendee_name: attendeeName,
            attendee_id: Number(id),
          }),
        });
      }

      toast.success('Note pinned!');
      fetchPinnedNotes();
    } catch {
      toast.error('Failed to pin note.');
    }
  };

  const handleUnpinNote = async (pinId: number) => {
    if (!confirm('Unpin this note?')) return;
    try {
      const res = await fetch('/api/pinned-notes', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: pinId }),
      });
      if (!res.ok) throw new Error();
      toast.success('Note unpinned.');
      setPinnedNotes(prev => prev.filter(p => p.id !== pinId));
      setPinnedNoteIds(prev => {
        const next = new Set(prev);
        const pin = pinnedNotes.find(p => p.id === pinId);
        if (pin) next.delete(pin.note_id);
        return next;
      });
    } catch {
      toast.error('Failed to unpin note.');
    }
  };

  const handleStatus = async (value: string) => {
    const currentStatuses = new Set((attendee?.status || '').split(',').map(s => s.trim()).filter(s => s && s !== 'Unknown'));
    if (currentStatuses.has(value)) { currentStatuses.delete(value); } else { currentStatuses.add(value); }
    const newStatus = Array.from(currentStatuses).join(',');
    try { await patchAttendee({ status: newStatus, company_id: attendee?.company_id ?? null }); toast.success(newStatus ? 'Status updated.' : 'Status cleared.'); }
    catch { toast.error('Failed to update status.'); }
  };


  const handleProduct = async (value: string) => {
    const current = new Set((attendee?.products || '').split(',').map(s => s.trim()).filter(Boolean));
    if (current.has(value)) { current.delete(value); } else { current.add(value); }
    const next = Array.from(current).join(',');
    try { await patchAttendee({ products: next }); toast.success('Products updated.'); }
    catch { toast.error('Failed to update products.'); }
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
      fetchFollowUps();
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


  if (isLoading) return <div className="flex items-center justify-center h-64"><div className="animate-spin w-8 h-8 border-4 border-brand-secondary border-t-transparent rounded-full" /></div>;
  if (!attendee) return null;

  const seniority = effectiveSeniority(attendee.seniority, attendee.title);
  const currentStatuses = new Set((attendee.status || '').split(',').map(s => s.trim()).filter(s => s && s !== 'Unknown'));
  const currentFunctions = new Set((attendee.function || '').split(',').map(s => s.trim()).filter(Boolean));
  const currentProducts = new Set((attendee.products || '').split(',').map(s => s.trim()).filter(Boolean));
  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <BackButton />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left column (2/3 width) — profile + follow ups */}
        <div className="lg:col-span-2 space-y-6">
          {/* Profile Card */}
          <div className="card">
            {isEditing ? (
              <div className="space-y-4">
                <h2 className="text-lg font-semibold text-brand-primary font-serif">Edit Attendee</h2>
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
                  <div><label className="label">LinkedIn URL</label><input type="url" value={editData.linkedin_url || ''} onChange={e => setEditData(p => ({ ...p, linkedin_url: e.target.value }))} placeholder="https://linkedin.com/in/…" className="input-field" /></div>
                  <div><label className="label">Phone Number</label><input type="tel" value={editData.phone || ''} onChange={e => setEditData(p => ({ ...p, phone: e.target.value }))} placeholder="+1 (555) 000-0000" className="input-field" /></div>
                </div>
                {functionOptions.length > 0 && (
                  <div>
                    <label className="label">Function</label>
                    <select value={editData.function || ''} onChange={e => setEditData(p => ({ ...p, function: e.target.value }))} className="input-field">
                      <option value="">— No function —</option>
                      {functionOptions.map(val => <option key={val} value={val}>{val}</option>)}
                    </select>
                  </div>
                )}
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
                    <div className="w-16 h-16 rounded-full bg-brand-primary flex items-center justify-center text-white text-2xl font-bold font-serif flex-shrink-0">
                      {attendee.first_name[0]}{attendee.last_name[0]}
                    </div>
                    <div>
                      <h1 className="text-2xl font-bold text-brand-primary font-serif">{attendee.first_name} {attendee.last_name}</h1>
                      {attendee.title && <p className="text-gray-600 mt-1">{attendee.title}</p>}
                      <div className="flex flex-wrap items-center gap-2 mt-2">
                        {attendee.title && <span className={`badge ${getPillClass(seniority, colorMaps.seniority || {})}`}>{seniority}</span>}
                        {currentFunctions.size > 0 && Array.from(currentFunctions).map(f => (
                          <span key={f} className={`badge ${getPillClass(f, colorMaps.function || {})}`}>{f}</span>
                        ))}
                        {currentStatuses.size > 0 ? Array.from(currentStatuses).map(s => (
                          <span key={s} className={`badge ${getPillClass(s, colorMaps.status || {})}`}>{s}</span>
                        )) : <span className="text-sm text-gray-400">—</span>}
                        {attendee.company_type && <span className={getBadgeClass(attendee.company_type, colorMaps.company_type || {})}>{attendee.company_type}</span>}
                        {/* LinkedIn icon */}
                        {attendee.linkedin_url ? (
                          <a href={attendee.linkedin_url} target="_blank" rel="noopener noreferrer" title="LinkedIn profile" className="flex-shrink-0">
                            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="#0A66C2" aria-label="LinkedIn">
                              <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
                            </svg>
                          </a>
                        ) : (
                          <svg viewBox="0 0 24 24" className="h-5 w-5 flex-shrink-0" fill="#9CA3AF" aria-label="No LinkedIn">
                            <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
                          </svg>
                        )}
                        {/* Phone icon — only shown if phone exists */}
                        {attendee.phone && (
                          <div className="relative flex-shrink-0">
                            <button
                              onClick={() => setShowPhonePopup(p => !p)}
                              title="Show phone number"
                              className="flex items-center"
                            >
                              <svg className="h-5 w-5 text-gray-500 hover:text-brand-secondary transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                              </svg>
                            </button>
                            {showPhonePopup && (
                              <div className="absolute left-0 top-7 z-10 min-w-max rounded-lg border border-gray-200 bg-white px-4 py-3 shadow-lg">
                                <p className="text-xs text-gray-400 mb-1">Phone</p>
                                <a href={`callto:${attendee.phone}`} className="text-sm font-medium text-brand-secondary hover:underline whitespace-nowrap">
                                  {attendee.phone}
                                </a>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => setIsEditing(true)} className="text-sm text-brand-primary font-medium flex items-center gap-2">
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
                        <Link href={`/companies/${attendee.company_id}`} className="text-sm font-medium text-gray-800 hover:text-brand-secondary hover:underline">{attendee.company_name}</Link>
                      ) : (
                        <p className="text-sm font-medium text-gray-800">{attendee.company_name}</p>
                      )
                    ) : <p className="text-sm text-gray-400">—</p>}
                  </div>
                  <div>
                    <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">Assigned Rep(s)</p>
                    <div className="flex flex-wrap gap-1">
                      {(() => {
                        const repUsers = parseRepIds(attendee.company_assigned_user ?? '').map(id => userOptionsFull.find(u => u.id === id)).filter(Boolean);
                        return repUsers.length > 0 ? repUsers.map((user, i) => (
                          <span key={i} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${getPreset(colorMaps.user?.[user!.value]).badgeClass}`}>
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3 h-3 flex-shrink-0">
                              <path d="M10 8a3 3 0 100-6 3 3 0 000 6zM3.465 14.493a1.23 1.23 0 00.41 1.412A9.957 9.957 0 0010 18c2.31 0 4.438-.784 6.131-2.1.43-.333.604-.903.408-1.41a7.002 7.002 0 00-13.074.003z" />
                            </svg>
                            {getRepInitials(user!.value)}
                          </span>
                        )) : <p className="text-sm text-gray-400">—</p>;
                      })()}
                    </div>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-400 uppercase tracking-wider mb-1">Email</p>
                    {attendee.email ? (
                      <div className="flex items-center gap-2">
                        <a
                          href={`mailto:${attendee.email}`}
                          className="text-sm text-brand-secondary hover:underline truncate"
                          title={attendee.email}
                        >
                          {attendee.email}
                        </a>
                        <button
                          type="button"
                          onClick={() => setShowComposeEmail(true)}
                          title="Send email"
                          className="flex-shrink-0 text-gray-400 hover:text-brand-secondary transition-colors"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                          </svg>
                        </button>
                      </div>
                    ) : <p className="text-sm text-gray-400">—</p>}
                  </div>
                  <div>
                    <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">Added</p>
                    <p className="text-sm text-gray-600">{new Date(attendee.created_at.includes('Z') || attendee.created_at.includes('+') ? attendee.created_at : attendee.created_at + 'Z').toLocaleDateString()}</p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Pinned Notes */}
          <PinnedNotesSection pinnedNotes={pinnedNotes} onUnpin={handleUnpinNote} />

          {/* Meetings */}
          <div className="card p-0 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-brand-primary font-serif">
                Meetings
                {meetings.length > 0 && (
                  <span className="ml-2 text-sm font-normal text-gray-500">
                    ({meetings.length})
                  </span>
                )}
              </h2>
              <button
                type="button"
                onClick={() => setShowScheduleMeeting(true)}
                className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-gray-100 transition-colors"
                title="Schedule Meeting"
              >
                <svg className="w-5 h-5 text-brand-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                <span className="text-sm font-medium text-brand-primary">Schedule</span>
              </button>
            </div>
            <MeetingsTable meetings={meetings} actionOptions={actionOptions.map(o => o.value)} colorMap={colorMaps.action || {}} userOptions={userOptions} hideCompany tableName="attendee_meetings" onOutcomeChange={handleMeetingOutcome} onDelete={handleDeleteMeeting} onEdit={async (meetingId, data) => {
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
              <h2 className="text-lg font-semibold text-brand-primary font-serif">
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
                <svg className="w-5 h-5 text-brand-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"/>
            </svg>
                <span className="text-sm font-medium text-brand-primary">Follow Up</span>
            </button>
            </div>
            <FollowUpsTable followUps={followUps} onToggle={handleToggleFollowUp} onDelete={handleDeleteFollowUp} userOptions={userOptions} onRepChange={handleRepChange} tableName="attendee_follow_ups" />
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
            onPin={handlePinNote}
            pinnedNoteIds={pinnedNoteIds}
          />
        </div>

        {/* Right column (1/3 width) */}
        <div className="space-y-6">
          {(() => {
            const sectionMap: Record<string, React.ReactNode> = {
              status: (
                <div key="status" className="card">
                  <h2 className="text-base font-semibold text-brand-primary font-serif mb-3">{getSectionLabel('status')}</h2>
                  <div className="flex flex-wrap gap-2">
                    {statusOptions.map(val => (
                      <button key={val} onClick={() => handleStatus(val)}
                        className={`px-3 py-1.5 rounded-full text-xs font-medium border-2 transition-all ${currentStatuses.has(val) ? `${getPillClass(val, colorMaps.status || {})} shadow-md scale-105` : 'bg-white text-gray-500 border-gray-200 hover:border-gray-400'}`}>
                        {val}
                      </button>
                    ))}
                  </div>
                </div>
              ),
              products: (
                <div key="products" className="card">
                  <h2 className="text-base font-semibold text-brand-primary font-serif mb-3">{getSectionLabel('products')}</h2>
                  <div className="flex flex-wrap gap-2">
                    {productsOptions.map(opt => {
                      const selected = currentProducts.has(opt.value);
                      const preset = getPreset(opt.color);
                      return (
                        <button
                          key={opt.value}
                          onClick={() => handleProduct(opt.value)}
                          style={selected ? { backgroundColor: preset.hex + '25', borderColor: preset.hex, color: preset.hex } : undefined}
                          className={`px-3 py-1.5 rounded-lg text-xs font-semibold border-2 transition-all ${selected ? 'shadow-md scale-105' : 'bg-white text-gray-500 border-gray-200 hover:border-gray-400'}`}
                        >
                          {opt.value}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ),
              conferences: (
                <div key="conferences" className="card">
                  {(() => {
                    const today = new Date().toISOString().slice(0, 10);
                    const inProgressConfs = attendee.conferences.filter(conf => conf.start_date <= today && conf.end_date >= today);
                    return (
                      <>
                        <button
                          onClick={() => setConferencesExpanded(prev => !prev)}
                          className="flex items-center justify-between w-full text-left"
                        >
                          <h2 className="text-lg font-semibold text-brand-primary font-serif">{getSectionLabel('conferences')} ({attendee.conferences.length})</h2>
                          <svg className={`w-5 h-5 text-gray-400 transition-transform ${conferencesExpanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                        </button>
                        {!conferencesExpanded && inProgressConfs.length > 0 && (
                          <div className="space-y-2 mt-4">
                            {inProgressConfs.map(conf => (
                              <Link key={conf.id} href={`/conferences/${conf.id}`} className="flex items-center justify-between p-3 rounded-lg border border-brand-secondary hover:bg-blue-50 transition-all">
                                <div className="min-w-0">
                                  <span className="inline-flex items-center gap-1 text-xs font-semibold text-brand-secondary mb-1">
                                    <span className="w-2 h-2 rounded-full bg-brand-secondary animate-pulse" />
                                    In Progress
                                  </span>
                                  <p className="text-sm font-medium text-gray-800 truncate">{conf.name}</p>
                                  <p className="text-xs text-gray-500">{formatDate(conf.start_date)}</p>
                                </div>
                                <svg className="w-4 h-4 text-gray-400 flex-shrink-0 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                              </Link>
                            ))}
                          </div>
                        )}
                        {conferencesExpanded && (
                          <>
                            {attendee.conferences.length === 0 ? (
                              <p className="text-sm text-gray-400 text-center py-4 mt-4">Not associated with any conferences.</p>
                            ) : (
                              <div className="space-y-2 mt-4">
                                {attendee.conferences.map(conf => {
                                  const isActive = conf.start_date <= today && conf.end_date >= today;
                                  return (
                                    <Link key={conf.id} href={`/conferences/${conf.id}`} className={`flex items-center justify-between p-3 rounded-lg border transition-all hover:bg-blue-50 ${isActive ? 'border-brand-secondary' : 'border-gray-100 hover:border-brand-secondary'}`}>
                                      <div className="min-w-0">
                                        {isActive && (
                                          <span className="inline-flex items-center gap-1 text-xs font-semibold text-brand-secondary mb-1">
                                            <span className="w-2 h-2 rounded-full bg-brand-secondary animate-pulse" />
                                            In Progress
                                          </span>
                                        )}
                                        <p className="text-sm font-medium text-gray-800 truncate">{conf.name}</p>
                                        <p className="text-xs text-gray-500">{formatDate(conf.start_date)}</p>
                                      </div>
                                      <svg className="w-4 h-4 text-gray-400 flex-shrink-0 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                                    </Link>
                                  );
                                })}
                              </div>
                            )}
                          </>
                        )}
                      </>
                    );
                  })()}
                </div>
              ),
              relationships: attendee.company_id ? (
                <InternalRelationshipsSection
                  key="relationships"
                  companyId={attendee.company_id}
                  attendeeId={attendee.id}
                  userOptions={userOptions}
                  relTypeOptions={relTypeOptions}
                  relationships={internalRelationships}
                  onRefresh={fetchInternalRelationships}
                />
              ) : null,
              events: (
                <div key="events" className="card">
                  <div className="flex items-center justify-between mb-3">
                    <button
                      type="button"
                      onClick={() => setEventsExpanded(v => !v)}
                      className="flex items-center gap-2 text-left flex-1"
                    >
                      <h2 className="text-base font-semibold text-brand-primary font-serif">{getSectionLabel('events')}</h2>
                      <svg className={`w-4 h-4 text-gray-400 transition-transform ${eventsExpanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowInviteModal(true)}
                      className="flex items-center gap-1 text-xs font-medium text-brand-secondary hover:text-brand-primary transition-colors flex-shrink-0"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" /></svg>
                      Invite
                    </button>
                  </div>
                  {eventsExpanded && (
                    <div className="space-y-2">
                      {attendeeEvents.length === 0 ? (
                        <p className="text-xs text-gray-400 text-center py-3">No events yet.</p>
                      ) : (
                        attendeeEvents.map(ev => {
                          const statuses = localEventRsvps[ev.event_id] ?? parseRsvpStatuses(ev.rsvp_status);
                          const has = (s: RsvpStatus) => statuses.includes(s);
                          return (
                            <div key={ev.event_id} className="rounded-xl border border-gray-200 bg-white overflow-hidden">
                              <div className="px-3 pt-3 pb-2">
                                <Link
                                  href={`/conferences/${ev.conference_id}?tab=social&event_id=${ev.event_id}`}
                                  className="inline-block text-sm font-semibold text-brand-primary leading-tight hover:text-brand-secondary hover:underline"
                                >
                                  {ev.event_name || ev.event_type || 'Social Event'}
                                </Link>
                                <p className="text-xs text-gray-500 mt-0.5">{ev.conference_name}</p>
                              </div>
                              <div className="flex gap-1 px-3 pb-3">
                                {(['yes', 'attended', 'no', 'maybe'] as RsvpStatus[]).map(s => (
                                  <button
                                    key={s}
                                    type="button"
                                    onClick={() => handleToggleEventRsvp(ev.event_id, s)}
                                    className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center justify-center gap-1 ${
                                      has(s)
                                        ? s === 'yes' ? 'bg-green-100 text-green-700' : s === 'attended' ? 'bg-purple-100 text-purple-700' : s === 'no' ? 'bg-red-50 text-red-600' : 'bg-gray-200 text-gray-700'
                                        : 'bg-gray-50 text-gray-500 hover:bg-gray-100'
                                    }`}
                                  >
                                    {s === 'yes' && <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
                                    {s === 'attended' && <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" /></svg>}
                                    {s === 'no' && <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" /></svg>}
                                    {s === 'maybe' && <span className="font-bold leading-none">?</span>}
                                    {s.charAt(0).toUpperCase() + s.slice(1)}
                                  </button>
                                ))}
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  )}
                </div>
              ),
              conference_activity: isAdminUser ? (
                <div key="conference_activity" className="card">
                  <h2 className="text-base font-semibold text-brand-primary font-serif mb-3">{getSectionLabel('conference_activity')}</h2>
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
                <div className="animate-spin w-5 h-5 border-2 border-brand-secondary border-t-transparent rounded-full" />
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
                      className="w-full px-3 py-2 rounded-lg text-xs font-medium border-2 border-dashed border-gray-300 text-gray-500 hover:border-brand-secondary hover:text-brand-secondary transition-all flex items-center justify-center gap-1.5"
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
                      const RESTRICTED_ACTION_KEYS = new Set(['meeting_held', 'meeting_scheduled', 'pending', 'rescheduled', 'cancelled', 'no_show']);
                      const activeActions = new Set((conferenceDetail?.action || '').split(',').map(a => a.trim()).filter(Boolean));
                      return actionOptions
                        .filter(opt => isAdminUser || !opt.action_key || !RESTRICTED_ACTION_KEYS.has(opt.action_key))
                        .map(opt => {
                          const isActive = activeActions.has(opt.value);
                          const pillCls = isActive ? getPillClass(opt.value, colorMaps.action ?? {}) : '';
                          return (
                            <button key={opt.id} onClick={() => handleAction(opt.value)}
                              className={`px-3 py-1.5 rounded-lg text-xs font-medium border-2 transition-all flex items-center gap-1.5 ${isActive ? `${pillCls} shadow-md` : 'bg-white text-gray-600 border-gray-200 hover:border-brand-secondary hover:text-brand-secondary'}`}>
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
              ) : null,
              touchpoints: attendee ? (
                <TouchpointsSection
                  key="touchpoints"
                  attendeeId={Number(id)}
                  conferences={attendee.conferences}
                  sectionLabel={getSectionLabel('touchpoints')}
                  onTouchpointLogged={fetchFollowUps}
                />
              ) : null,
            };
            return sectionOrder.map(key => isSectionVisible(key) ? sectionMap[key] : null);
          })()}
        </div>
      </div>

      <NewMeetingModal
        isOpen={showScheduleMeeting}
        onClose={() => setShowScheduleMeeting(false)}
        prefillCompanyId={attendee?.company_id ?? undefined}
        prefillAttendeeId={attendee ? Number(id) : undefined}
        onSuccess={(meeting) => setMeetings(prev => [meeting, ...prev])}
        availableConferences={attendee?.conferences}
      />

      <AssignFollowUpModal
        isOpen={showAssignFollowUp}
        onClose={() => setShowAssignFollowUp(false)}
        onSuccess={fetchFollowUps}
        defaultAttendeeId={Number(id)}
        defaultConferenceId={selectedConferenceId ? Number(selectedConferenceId) : undefined}
        defaultCompanyId={attendee?.company_id}
        availableConferences={attendee?.conferences}
      />

      {showComposeEmail && attendee?.email && (
        <ComposeEmailModal
          contactEmail={attendee.email}
          contactName={`${attendee.first_name} ${attendee.last_name}`}
          onClose={() => setShowComposeEmail(false)}
        />
      )}

      {/* Add to Guest List Modal */}
      {showInviteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => { setShowInviteModal(false); setInviteForm({ rep: '', conference_id: '', event_id: '' }); setInviteConferenceEvents([]); }}>
          <div className="bg-white rounded-2xl shadow-2xl border border-brand-highlight w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <h3 className="text-base font-semibold text-brand-primary font-serif">Add to Guest List</h3>
              <button type="button" onClick={() => { setShowInviteModal(false); setInviteForm({ rep: '', conference_id: '', event_id: '' }); setInviteConferenceEvents([]); }} className="text-gray-400 hover:text-gray-600 transition-colors">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="px-6 py-4 space-y-4">
              {/* Rep */}
              <div>
                <label className="label text-xs">Rep</label>
                <select value={inviteForm.rep} onChange={e => setInviteForm(p => ({ ...p, rep: e.target.value }))} className="input-field w-full text-sm">
                  <option value="">Select rep...</option>
                  {userOptions.map(u => <option key={u.id} value={u.value}>{u.value}</option>)}
                </select>
              </div>
              {/* Company (read-only context) */}
              <div>
                <label className="label text-xs">Company</label>
                <div className="input-field text-sm text-gray-600 bg-gray-50">{attendee.company_name || '—'}</div>
              </div>
              {/* Attendee (read-only context) */}
              <div>
                <label className="label text-xs">Attendee</label>
                <div className="input-field text-sm text-gray-600 bg-gray-50">{attendee.first_name} {attendee.last_name}</div>
              </div>
              {/* Conference */}
              <div>
                <label className="label text-xs">Conference</label>
                <select
                  value={inviteForm.conference_id}
                  onChange={e => handleInviteConferenceChange(e.target.value)}
                  className="input-field w-full text-sm"
                >
                  <option value="">Select conference...</option>
                  {attendee.conferences.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              {/* Event */}
              <div>
                <label className="label text-xs">Event</label>
                <select
                  value={inviteForm.event_id}
                  onChange={e => setInviteForm(p => ({ ...p, event_id: e.target.value }))}
                  className="input-field w-full text-sm"
                  disabled={!inviteForm.conference_id || isLoadingInviteEvents}
                >
                  <option value="">{isLoadingInviteEvents ? 'Loading...' : 'Select event...'}</option>
                  {inviteConferenceEvents.map(e => (
                    <option key={e.id} value={e.id}>{e.event_name || e.event_type || `Event #${e.id}`}</option>
                  ))}
                </select>
                {inviteForm.conference_id && !isLoadingInviteEvents && inviteConferenceEvents.length === 0 && (
                  <p className="text-xs text-gray-400 mt-1">No events for this conference.</p>
                )}
              </div>
            </div>
            <div className="px-6 py-4 border-t border-gray-100 flex gap-2">
              <button type="button" onClick={handleInviteSubmit} disabled={isInviting || !inviteForm.event_id} className="btn-primary text-sm flex-1">
                {isInviting ? 'Adding...' : 'Add to Guest List'}
              </button>
              <button type="button" onClick={() => { setShowInviteModal(false); setInviteForm({ rep: '', conference_id: '', event_id: '' }); setInviteConferenceEvents([]); }} className="btn-secondary text-sm">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
