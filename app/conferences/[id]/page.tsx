'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { AnalyticsCharts } from '@/components/AnalyticsCharts';
import { FollowUpsTable, type FollowUp } from '@/components/FollowUpsTable';
import { classifySeniority } from '@/lib/parsers';

interface Attendee {
  id: number;
  first_name: string;
  last_name: string;
  title?: string;
  company_name?: string;
  company_type?: string;
  email?: string;
}

interface Conference {
  id: number;
  name: string;
  start_date: string;
  end_date: string;
  location: string;
  notes?: string;
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

  const [conference, setConference] = useState<Conference | null>(null);
  const [conferenceDetails, setConferenceDetails] = useState<ConferenceDetail[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [editData, setEditData] = useState<Partial<Conference>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [activeTab, setActiveTab] = useState<'attendees' | 'analytics' | 'follow-ups'>('attendees');
  const [confFollowUps, setConfFollowUps] = useState<FollowUp[]>([]);
  const [attendeeSearch, setAttendeeSearch] = useState('');
  const [selectedAttendeeIds, setSelectedAttendeeIds] = useState<Set<number>>(new Set());
  const [isRemoving, setIsRemoving] = useState(false);
  const [sortKey, setSortKey] = useState<'name' | 'title' | 'company' | 'seniority'>('name');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

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
      const [confRes, detailsRes, followUpsRes] = await Promise.all([
        fetch(`/api/conferences/${id}`),
        fetch(`/api/conference-details?conference_id=${id}`),
        fetch(`/api/follow-ups?conference_id=${id}`),
      ]);
      if (!confRes.ok) throw new Error('Not found');
      const data = await confRes.json();
      const detailsData = detailsRes.ok ? await detailsRes.json() : [];
      const followUpsData = followUpsRes.ok ? await followUpsRes.json() : [];
      setConference(data);
      setConferenceDetails(Array.isArray(detailsData) ? detailsData : []);
      setConfFollowUps(Array.isArray(followUpsData) ? followUpsData : []);
      setEditData({
        name: data.name,
        start_date: data.start_date,
        end_date: data.end_date,
        location: data.location,
        notes: data.notes || '',
      });
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
        body: JSON.stringify(editData),
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
      else if (sortKey === 'seniority') { aVal = classifySeniority(a.title); bVal = classifySeniority(b.title); }
      return sortDir === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
    });

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
      <nav className="flex items-center gap-2 text-sm text-gray-500">
        <Link href="/conferences" className="hover:text-procare-bright-blue">Conferences</Link>
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
        <span className="text-gray-800 truncate max-w-xs">{conference.name}</span>
      </nav>

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
          <div className="flex items-start justify-between">
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
            </div>
            <div className="flex gap-2 ml-4">
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
      <div className="border-b border-gray-200">
        <nav className="flex gap-6">
          <button
            onClick={() => setActiveTab('attendees')}
            className={`py-3 px-1 text-sm font-medium border-b-2 transition-colors ${activeTab === 'attendees' ? 'border-procare-bright-blue text-procare-bright-blue' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
          >
            Attendees ({conference.attendees.length})
          </button>
          <button
            onClick={() => setActiveTab('analytics')}
            className={`py-3 px-1 text-sm font-medium border-b-2 transition-colors ${activeTab === 'analytics' ? 'border-procare-bright-blue text-procare-bright-blue' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
          >
            Analytics
          </button>
          <button
            onClick={() => setActiveTab('follow-ups')}
            className={`py-3 px-1 text-sm font-medium border-b-2 transition-colors ${activeTab === 'follow-ups' ? 'border-procare-bright-blue text-procare-bright-blue' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
          >
            Follow Ups{confFollowUps.length > 0 ? ` (${confFollowUps.length})` : ''}
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
            <div className="overflow-x-auto">
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
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Email</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredAttendees.map((attendee) => (
                    <tr key={attendee.id} className={`hover:bg-gray-50 transition-colors ${selectedAttendeeIds.has(attendee.id) ? 'bg-blue-50' : ''}`}>
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={selectedAttendeeIds.has(attendee.id)}
                          onChange={() => toggleAttendeeSelect(attendee.id)}
                          className="accent-procare-bright-blue"
                        />
                      </td>
                      <td className="px-4 py-3 font-medium text-gray-800">
                        {attendee.first_name} {attendee.last_name}
                      </td>
                      <td className="px-4 py-3 text-gray-600 max-w-[160px] truncate">
                        {attendee.title || <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-4 py-3">
                        {attendee.company_name ? (
                          <div>
                            <p className="text-gray-800">{attendee.company_name}</p>
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
                          const s = classifySeniority(attendee.title);
                          const colorMap: Record<string, string> = {
                            'C-Suite': 'bg-procare-dark-blue text-white',
                            'VP Level': 'bg-procare-bright-blue text-white',
                            'Director': 'bg-yellow-100 text-yellow-800',
                            'Manager': 'bg-orange-100 text-orange-700',
                            'Other': 'bg-gray-100 text-gray-600',
                          };
                          return (
                            <span className={`badge ${colorMap[s] || 'badge-gray'}`}>{s}</span>
                          );
                        })()}
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
          )}
        </div>
      )}

      {/* Analytics Tab */}
      {activeTab === 'analytics' && (
        <AnalyticsCharts attendees={conference.attendees} conferenceDetails={conferenceDetails} />
      )}

      {/* Follow Ups Tab */}
      {activeTab === 'follow-ups' && (
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
                // Revert on error
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
          />
        </div>
      )}
    </div>
  );
}
