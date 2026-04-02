'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { classifySeniority } from '@/lib/parsers';

interface Conference { id: number; name: string; start_date: string; end_date: string; location: string; }

interface Attendee {
  id: number; first_name: string; last_name: string; title?: string;
  company_id?: number; company_name?: string; company_type?: string; company_website?: string;
  email?: string; notes?: string; action?: string; next_steps?: string;
  next_steps_notes?: string; status?: string; created_at: string; conferences: Conference[];
}

interface Company { id: number; name: string; }

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
  const [notesValue, setNotesValue] = useState('');
  const [notesSaved, setNotesSaved] = useState(false);
  const [otherNotes, setOtherNotes] = useState('');
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchAttendee = useCallback(async () => {
    try {
      const [atRes, coRes] = await Promise.all([fetch(`/api/attendees/${id}`), fetch('/api/companies')]);
      if (!atRes.ok) throw new Error('Not found');
      const [atData, coData] = await Promise.all([atRes.json(), coRes.json()]);
      setAttendee(atData);
      setCompanies(coData);
      setNotesValue(atData.notes || '');
      setOtherNotes(atData.next_steps_notes || '');
      setEditData({ first_name: atData.first_name, last_name: atData.last_name, title: atData.title || '', company_id: atData.company_id?.toString() || '', email: atData.email || '' });
    } catch {
      toast.error('Failed to load attendee');
      router.push('/attendees');
    } finally { setIsLoading(false); }
  }, [id, router]);

  useEffect(() => { fetchAttendee(); }, [fetchAttendee]);

  const patch = useCallback(async (fields: Record<string, string | number | null>) => {
    const res = await fetch(`/api/attendees/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(fields) });
    if (!res.ok) throw new Error('Update failed');
    const updated = await res.json();
    setAttendee(prev => prev ? { ...prev, ...updated } : prev);
    return updated;
  }, [id]);

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

  const handleStatus = async (value: string) => {
    try { await patch({ status: value, company_id: attendee?.company_id ?? null }); toast.success('Status updated.'); }
    catch { toast.error('Failed to update status.'); }
  };

  const handleAction = async (value: string) => {
    try { await patch({ action: attendee?.action === value ? null : value }); }
    catch { toast.error('Failed to update action.'); }
  };

  const handleNextSteps = async (value: string) => {
    const newVal = attendee?.next_steps === value ? null : value;
    try {
      await patch({ next_steps: newVal, next_steps_notes: newVal === 'Other' ? otherNotes : null });
      if (newVal !== 'Other') setOtherNotes('');
    } catch { toast.error('Failed to update next steps.'); }
  };

  const handleSaveOtherNotes = async () => {
    try { await patch({ next_steps: 'Other', next_steps_notes: otherNotes }); toast.success('Saved.'); }
    catch { toast.error('Failed to save.'); }
  };

  const handleNotesBlur = () => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      try {
        await patch({ notes: notesValue });
        setNotesSaved(true);
        setTimeout(() => setNotesSaved(false), 2000);
      } catch { toast.error('Failed to save notes.'); }
    }, 400);
  };

  if (isLoading) return <div className="flex items-center justify-center h-64"><div className="animate-spin w-8 h-8 border-4 border-procare-bright-blue border-t-transparent rounded-full" /></div>;
  if (!attendee) return null;

  const seniority = classifySeniority(attendee.title);
  const seniorityColors: Record<string, string> = {
    'C-Suite': 'bg-blue-600 text-white', 'VP Level': 'bg-yellow-400 text-yellow-900',
    'Director': 'bg-gray-800 text-white', 'Manager': 'bg-green-100 text-green-800', 'Other': 'bg-gray-100 text-gray-600',
  };
  const currentStatus = attendee.status || 'Unknown';
  const statusCls = STATUS_OPTIONS.find(s => s.value === currentStatus)?.cls || 'bg-gray-200 text-gray-600 border-gray-300';

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <nav className="flex items-center gap-2 text-sm text-gray-500">
        <Link href="/attendees" className="hover:text-procare-bright-blue">Attendees</Link>
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
        <span className="text-gray-800">{attendee.first_name} {attendee.last_name}</span>
      </nav>

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

      {/* Status */}
      <div className="card">
        <h2 className="text-base font-semibold text-procare-dark-blue font-serif mb-3">Status</h2>
        <div className="flex flex-wrap gap-2">
          {STATUS_OPTIONS.map(opt => (
            <button key={opt.value} onClick={() => handleStatus(opt.value)}
              className={`px-4 py-2 rounded-full text-sm font-medium border-2 transition-all ${currentStatus === opt.value ? `${opt.cls} shadow-md scale-105` : 'bg-white text-gray-500 border-gray-200 hover:border-gray-400'}`}>
              {opt.value}
            </button>
          ))}
        </div>
      </div>

      {/* Actions */}
      <div className="card">
        <h2 className="text-base font-semibold text-procare-dark-blue font-serif mb-3">Actions</h2>
        <div className="flex flex-wrap gap-2">
          {ACTION_OPTIONS.map(opt => (
            <button key={opt} onClick={() => handleAction(opt)}
              className={`px-4 py-2 rounded-lg text-sm font-medium border-2 transition-all ${attendee.action === opt ? 'bg-procare-bright-blue text-white border-procare-bright-blue shadow-md' : 'bg-white text-gray-600 border-gray-200 hover:border-procare-bright-blue hover:text-procare-bright-blue'}`}>
              {opt}
            </button>
          ))}
        </div>
      </div>

      {/* Next Steps */}
      <div className="card">
        <h2 className="text-base font-semibold text-procare-dark-blue font-serif mb-3">Next Steps</h2>
        <div className="flex flex-wrap gap-2">
          {NEXT_STEPS_OPTIONS.map(opt => (
            <button key={opt} onClick={() => handleNextSteps(opt)}
              className={`px-4 py-2 rounded-lg text-sm font-medium border-2 transition-all ${attendee.next_steps === opt ? 'bg-procare-dark-blue text-white border-procare-dark-blue shadow-md' : 'bg-white text-gray-600 border-gray-200 hover:border-procare-dark-blue hover:text-procare-dark-blue'}`}>
              {opt}
            </button>
          ))}
        </div>
        {attendee.next_steps === 'Other' && (
          <div className="mt-3">
            <textarea value={otherNotes} onChange={e => setOtherNotes(e.target.value)} placeholder="Describe the next step..." className="input-field resize-none w-full" rows={3} />
            <button onClick={handleSaveOtherNotes} className="btn-primary mt-2 text-sm">Save Notes</button>
          </div>
        )}
      </div>

      {/* Notes */}
      <div className="card">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-semibold text-procare-dark-blue font-serif">Notes</h2>
          {notesSaved && <span className="text-xs text-green-500 font-medium">✓ Saved</span>}
        </div>
        <textarea value={notesValue} onChange={e => setNotesValue(e.target.value)} onBlur={handleNotesBlur} placeholder="Add free-form notes about this attendee..." className="input-field resize-none w-full" rows={4} />
        <p className="text-xs text-gray-400 mt-1">Auto-saves on focus change.</p>
      </div>

      {/* Conferences */}
      <div className="card">
        <h2 className="text-lg font-semibold text-procare-dark-blue mb-4 font-serif">Conferences ({attendee.conferences.length})</h2>
        {attendee.conferences.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-4">Not associated with any conferences.</p>
        ) : (
          <div className="space-y-3">
            {attendee.conferences.map(conf => (
              <Link key={conf.id} href={`/conferences/${conf.id}`} className="flex items-center justify-between p-3 rounded-lg border border-gray-100 hover:border-procare-bright-blue hover:bg-blue-50 transition-all">
                <div>
                  <p className="text-sm font-medium text-gray-800">{conf.name}</p>
                  <p className="text-xs text-gray-500">{formatDate(conf.start_date)} · {conf.location}</p>
                </div>
                <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
