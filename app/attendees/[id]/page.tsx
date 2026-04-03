'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { classifySeniority } from '@/lib/parsers';
import { FollowUpsTable, type FollowUp } from '@/components/FollowUpsTable';
import { NotesSection, type EntityNote } from '@/components/NotesSection';

interface Conference { id: number; name: string; start_date: string; end_date: string; location: string; }

interface Attendee {
  id: number; first_name: string; last_name: string; title?: string;
  company_id?: number; company_name?: string; company_type?: string; company_website?: string;
  email?: string; notes?: string; action?: string; next_steps?: string;
  next_steps_notes?: string; status?: string; created_at: string; conferences: Conference[];
}

interface Company { id: number; name: string; }

interface ConferenceDetail {
  attendee_id: number;
  conference_id: number;
  action?: string;
  next_steps?: string;
  next_steps_notes?: string;
  notes?: string;
}


const STATUS_OPTIONS = [
  { value: 'Client',         cls: 'bg-yellow-400 text-yellow-900 border-yellow-500' },
  { value: 'Hot Prospect',   cls: 'bg-red-500 text-white border-red-600' },
  { value: 'Interested',     cls: 'bg-green-500 text-white border-green-600' },
  { value: 'Not Interested', cls: 'bg-gray-900 text-white border-gray-800' },
  { value: 'Unknown',        cls: 'bg-gray-200 text-gray-600 border-gray-300' },
];

const ACTION_OPTIONS = ['Meeting Scheduled', 'Meeting Held', 'Social Conversation', 'Meeting No-Show'];
const NEXT_STEPS_OPTIONS = ['Schedule Follow Up Meeting', 'General Follow Up', 'Other'];

function formatDate(d: string) {
  if (!d) return '';
  return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function AttendeeDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [attendee, setAttendee] = useState<Attendee | null>(null);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [editData, setEditData] = useState<{ first_name?: string; last_name?: string; title?: string; company_id?: string; email?: string }>({});
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Follow-ups
  const [followUps, setFollowUps] = useState<FollowUp[]>([]);
  const [attendeeNotes, setAttendeeNotes] = useState<EntityNote[]>([]);

  // Conference-specific state
  const [selectedConferenceId, setSelectedConferenceId] = useState<string>('');
  const [conferenceDetail, setConferenceDetail] = useState<ConferenceDetail | null>(null);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const [confNotesValue, setConfNotesValue] = useState('');
  const [confOtherNotes, setConfOtherNotes] = useState('');
  const [confNotesSaved, setConfNotesSaved] = useState(false);
  const [confNoteEntityIds, setConfNoteEntityIds] = useState<Record<string, number>>({});
  const confNotesTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  const fetchAttendee = useCallback(async () => {
    try {
      const [atRes, coRes] = await Promise.all([fetch(`/api/attendees/${id}`), fetch('/api/companies')]);
      if (!atRes.ok) throw new Error('Not found');
      const [atData, coData] = await Promise.all([atRes.json(), coRes.json()]);
      setAttendee(atData);
      setCompanies(coData);
      setEditData({ first_name: atData.first_name, last_name: atData.last_name, title: atData.title || '', company_id: atData.company_id?.toString() || '', email: atData.email || '' });
    } catch {
      toast.error('Failed to load attendee');
      router.push('/attendees');
    } finally { setIsLoading(false); }
  }, [id, router]);

  useEffect(() => { fetchAttendee(); fetchFollowUps(); fetchNotes(); }, [fetchAttendee, fetchFollowUps, fetchNotes]);

  // Load conference detail when a conference is selected
  useEffect(() => {
    if (!selectedConferenceId) {
      setConferenceDetail(null);
      setConfNotesValue('');
      setConfOtherNotes('');
      return;
    }
    setIsLoadingDetail(true);
    fetch(`/api/conference-details?attendee_id=${id}&conference_id=${selectedConferenceId}`)
      .then(r => r.json())
      .then(data => {
        setConferenceDetail(data);
        setConfNotesValue(data?.notes || '');
        setConfOtherNotes(data?.next_steps_notes || '');
        // Find existing entity_note for this conference
        const conf = attendee?.conferences.find(c => c.id === Number(selectedConferenceId));
        if (conf && attendeeNotes.length > 0) {
          const prefix = `[${conf.name} - `;
          const existing = attendeeNotes.find(n => n.content.startsWith(prefix));
          if (existing) setConfNoteEntityIds(prev => ({ ...prev, [selectedConferenceId]: existing.id }));
        }
      })
      .catch(() => {
        setConferenceDetail(null);
        setConfNotesValue('');
        setConfOtherNotes('');
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
      notes: conferenceDetail?.notes ?? null,
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
      const res = await fetch(`/api/attendees/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...editData, company_id: editData.company_id ? parseInt(editData.company_id) : null }) });
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

  const handleStatus = async (value: string) => {
    try { await patchAttendee({ status: value, company_id: attendee?.company_id ?? null }); toast.success('Status updated.'); }
    catch { toast.error('Failed to update status.'); }
  };

  const handleAction = async (value: string) => {
    if (!selectedConferenceId) { toast.error('Please select a conference first.'); return; }
    try {
      const current = new Set((conferenceDetail?.action || '').split(',').map(a => a.trim()).filter(Boolean));
      if (current.has(value)) current.delete(value); else current.add(value);
      const newAction = Array.from(current).join(',') || undefined;
      await upsertConferenceDetail({ action: newAction });
    } catch { toast.error('Failed to update action.'); }
  };

  const handleNextSteps = async (value: string) => {
    if (!selectedConferenceId) { toast.error('Please select a conference first.'); return; }
    const newVal = conferenceDetail?.next_steps === value ? undefined : value;
    try {
      await upsertConferenceDetail({ next_steps: newVal, next_steps_notes: newVal === 'Other' ? confOtherNotes : undefined });
      if (newVal !== 'Other') setConfOtherNotes('');
    } catch { toast.error('Failed to update next steps.'); }
  };

  const handleSaveOtherNotes = async () => {
    if (!selectedConferenceId) return;
    try {
      await upsertConferenceDetail({ next_steps: 'Other', next_steps_notes: confOtherNotes });
      toast.success('Saved.');
    } catch { toast.error('Failed to save.'); }
  };

  const handleConfNotesBlur = () => {
    if (!selectedConferenceId) return;
    if (confNotesTimer.current) clearTimeout(confNotesTimer.current);
    confNotesTimer.current = setTimeout(async () => {
      try {
        await upsertConferenceDetail({ notes: confNotesValue });
        setConfNotesSaved(true);
        setTimeout(() => setConfNotesSaved(false), 2000);

        // Sync to general attendee notes
        const conf = attendee?.conferences.find(c => c.id === Number(selectedConferenceId));
        if (conf && confNotesValue.trim()) {
          const monthYear = new Date(conf.start_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
          const prefixedContent = `[${conf.name} - ${monthYear}]: ${confNotesValue.trim()}`;
          const existingId = confNoteEntityIds[selectedConferenceId];
          if (existingId) {
            const res = await fetch(`/api/notes/${existingId}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ content: prefixedContent }),
            });
            if (res.ok) {
              const updated = await res.json();
              setAttendeeNotes(prev => prev.map(n => n.id === existingId ? updated : n));
            }
          } else {
            const res = await fetch('/api/notes', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ entity_type: 'attendee', entity_id: Number(id), content: prefixedContent }),
            });
            if (res.ok) {
              const created = await res.json();
              setAttendeeNotes(prev => [created, ...prev]);
              setConfNoteEntityIds(prev => ({ ...prev, [selectedConferenceId]: created.id }));
            }
          }
        }
      } catch { toast.error('Failed to save notes.'); }
    }, 400);
  };

  if (isLoading) return <div className="flex items-center justify-center h-64"><div className="animate-spin w-8 h-8 border-4 border-procare-bright-blue border-t-transparent rounded-full" /></div>;
  if (!attendee) return null;

  const seniority = classifySeniority(attendee.title);
  const seniorityColors: Record<string, string> = {
    'C-Suite': 'bg-blue-600 text-white', 'VP Level': 'bg-yellow-400 text-yellow-900',
    'Director': 'bg-gray-800 text-white', 'Manager': 'bg-orange-100 text-orange-700', 'Other': 'bg-gray-100 text-gray-600',
  };
  const currentStatus = attendee.status || 'Unknown';
  const statusCls = STATUS_OPTIONS.find(s => s.value === currentStatus)?.cls || 'bg-gray-200 text-gray-600 border-gray-300';

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <nav className="flex items-center gap-2 text-sm text-gray-500">
        <Link href="/attendees" className="hover:text-procare-bright-blue">Attendees</Link>
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
        <span className="text-gray-800">{attendee.first_name} {attendee.last_name}</span>
      </nav>

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
                </div>
                <div className="flex gap-3">
                  <button onClick={handleSave} disabled={isSaving} className="btn-primary">{isSaving ? 'Saving...' : 'Save Changes'}</button>
                  <button onClick={() => setIsEditing(false)} className="btn-secondary">Cancel</button>
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
                        {attendee.title && <span className={`badge ${seniorityColors[seniority]}`}>{seniority}</span>}
                        <span className={`badge border ${statusCls}`}>{currentStatus}</span>
                        {attendee.company_type && <span className="badge-blue">{attendee.company_type}</span>}
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => setIsEditing(true)} className="btn-secondary text-sm flex items-center gap-2">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                      Edit
                    </button>
                    <button onClick={handleDelete} disabled={isDeleting} className="btn-danger text-sm flex items-center gap-2">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                      Delete
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6 pt-6 border-t border-gray-100">
                  <div>
                    <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">Company</p>
                    {attendee.company_name ? (
                      <div>
                        <p className="text-sm font-medium text-gray-800">{attendee.company_name}</p>
                        {attendee.company_website && <a href={attendee.company_website.startsWith('http') ? attendee.company_website : `https://${attendee.company_website}`} target="_blank" rel="noopener noreferrer" className="text-xs text-procare-bright-blue hover:underline">{attendee.company_website}</a>}
                      </div>
                    ) : <p className="text-sm text-gray-400">—</p>}
                  </div>
                  <div>
                    <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">Email</p>
                    {attendee.email ? <a href={`mailto:${attendee.email}`} className="text-sm text-procare-bright-blue hover:underline">{attendee.email}</a> : <p className="text-sm text-gray-400">—</p>}
                  </div>
                  <div>
                    <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">Added</p>
                    <p className="text-sm text-gray-600">{new Date(attendee.created_at).toLocaleDateString()}</p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Follow Ups */}
          <div className="card p-0 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100">
              <h2 className="text-lg font-semibold text-procare-dark-blue font-serif">
                Follow Ups
                {followUps.length > 0 && (
                  <span className="ml-2 text-sm font-normal text-gray-500">
                    ({followUps.filter(f => !f.completed).length} pending)
                  </span>
                )}
              </h2>
            </div>
            <FollowUpsTable followUps={followUps} onToggle={handleToggleFollowUp} />
          </div>

          {/* Notes */}
          <NotesSection
            entityType="attendee"
            entityId={Number(id)}
            initialNotes={attendeeNotes}
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
              {STATUS_OPTIONS.map(opt => (
                <button key={opt.value} onClick={() => handleStatus(opt.value)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium border-2 transition-all ${currentStatus === opt.value ? `${opt.cls} shadow-md scale-105` : 'bg-white text-gray-500 border-gray-200 hover:border-gray-400'}`}>
                  {opt.value}
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
              <p className="text-xs text-gray-400 text-center py-4">Select a conference above to log actions, next steps, and notes.</p>
            )}

            {selectedConferenceId && isLoadingDetail && (
              <div className="flex justify-center py-4">
                <div className="animate-spin w-5 h-5 border-2 border-procare-bright-blue border-t-transparent rounded-full" />
              </div>
            )}

            {selectedConferenceId && !isLoadingDetail && (
              <div className="space-y-5">
                {/* Actions */}
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Actions</p>
                  <div className="flex flex-wrap gap-2">
                    {(() => {
                      const activeActions = new Set((conferenceDetail?.action || '').split(',').map(a => a.trim()).filter(Boolean));
                      return ACTION_OPTIONS.map(opt => (
                      <button key={opt} onClick={() => handleAction(opt)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium border-2 transition-all flex items-center gap-1.5 ${activeActions.has(opt) ? 'bg-procare-bright-blue text-white border-procare-bright-blue shadow-md' : 'bg-white text-gray-600 border-gray-200 hover:border-procare-bright-blue hover:text-procare-bright-blue'}`}>
                        {activeActions.has(opt) && <svg className="w-3 h-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>}
                        {opt}
                      </button>
                    ));
                    })()}
                  </div>
                </div>

                {/* Next Steps */}
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Next Steps</p>
                  <div className="flex flex-wrap gap-2">
                    {NEXT_STEPS_OPTIONS.map(opt => (
                      <button key={opt} onClick={() => handleNextSteps(opt)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium border-2 transition-all ${conferenceDetail?.next_steps === opt ? 'bg-procare-dark-blue text-white border-procare-dark-blue shadow-md' : 'bg-white text-gray-600 border-gray-200 hover:border-procare-dark-blue hover:text-procare-dark-blue'}`}>
                        {opt}
                      </button>
                    ))}
                  </div>
                  {conferenceDetail?.next_steps === 'Other' && (
                    <div className="mt-2">
                      <textarea value={confOtherNotes} onChange={e => setConfOtherNotes(e.target.value)} placeholder="Describe the next step..." className="input-field resize-none w-full text-sm" rows={2} />
                      <button onClick={handleSaveOtherNotes} className="btn-primary mt-2 text-xs">Save</button>
                    </div>
                  )}
                </div>

                {/* Notes */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Notes</p>
                    {confNotesSaved && <span className="text-xs text-green-500 font-medium">Saved</span>}
                  </div>
                  <textarea
                    value={confNotesValue}
                    onChange={e => setConfNotesValue(e.target.value)}
                    onBlur={handleConfNotesBlur}
                    placeholder="Notes for this conference..."
                    className="input-field resize-none w-full text-sm"
                    rows={3}
                  />
                  <p className="text-xs text-gray-400 mt-1">Auto-saves on focus change.</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
