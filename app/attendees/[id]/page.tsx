'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { classifySeniority } from '@/lib/parsers';

interface Conference {
  id: number;
  name: string;
  start_date: string;
  end_date: string;
  location: string;
}

interface Attendee {
  id: number;
  first_name: string;
  last_name: string;
  title?: string;
  company_id?: number;
  company_name?: string;
  company_type?: string;
  company_website?: string;
  email?: string;
  notes?: string;
  created_at: string;
  conferences: Conference[];
}

interface Company {
  id: number;
  name: string;
}

function formatDate(dateStr: string) {
  if (!dateStr) return '';
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export default function AttendeeDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [attendee, setAttendee] = useState<Attendee | null>(null);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [editData, setEditData] = useState<{
    first_name?: string;
    last_name?: string;
    title?: string;
    company_id?: string;
    email?: string;
    notes?: string;
  }>({});
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const fetchAttendee = useCallback(async () => {
    try {
      const [atRes, coRes] = await Promise.all([
        fetch(`/api/attendees/${id}`),
        fetch('/api/companies'),
      ]);
      if (!atRes.ok) throw new Error('Not found');
      const [atData, coData] = await Promise.all([atRes.json(), coRes.json()]);
      setAttendee(atData);
      setCompanies(coData);
      setEditData({
        first_name: atData.first_name,
        last_name: atData.last_name,
        title: atData.title || '',
        company_id: atData.company_id?.toString() || '',
        email: atData.email || '',
        notes: atData.notes || '',
      });
    } catch {
      toast.error('Failed to load attendee');
      router.push('/attendees');
    } finally {
      setIsLoading(false);
    }
  }, [id, router]);

  useEffect(() => {
    fetchAttendee();
  }, [fetchAttendee]);

  const handleSave = async () => {
    if (!editData.first_name || !editData.last_name) {
      toast.error('First and last name are required.');
      return;
    }
    setIsSaving(true);
    try {
      const res = await fetch(`/api/attendees/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...editData,
          company_id: editData.company_id ? parseInt(editData.company_id as string) : null,
        }),
      });
      if (!res.ok) throw new Error('Update failed');
      toast.success('Attendee updated!');
      setIsEditing(false);
      fetchAttendee();
    } catch {
      toast.error('Failed to update attendee');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this attendee? This cannot be undone.')) return;
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/attendees/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Delete failed');
      toast.success('Attendee deleted.');
      router.push('/attendees');
    } catch {
      toast.error('Failed to delete attendee');
      setIsDeleting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin w-8 h-8 border-4 border-procare-bright-blue border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!attendee) return null;

  const seniority = classifySeniority(attendee.title);
  const seniorityColors: Record<string, string> = {
    'C-Suite': 'bg-procare-dark-blue text-white',
    'VP Level': 'bg-procare-bright-blue text-white',
    'Director': 'bg-yellow-100 text-yellow-800',
    'Manager': 'bg-green-100 text-green-800',
    'Other': 'bg-gray-100 text-gray-600',
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-sm text-gray-500">
        <Link href="/attendees" className="hover:text-procare-bright-blue">Attendees</Link>
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
        <span className="text-gray-800">{attendee.first_name} {attendee.last_name}</span>
      </nav>

      {/* Profile Card */}
      <div className="card">
        {isEditing ? (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-procare-dark-blue font-serif">Edit Attendee</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="label">First Name *</label>
                <input
                  value={editData.first_name || ''}
                  onChange={(e) => setEditData((p) => ({ ...p, first_name: e.target.value }))}
                  className="input-field"
                />
              </div>
              <div>
                <label className="label">Last Name *</label>
                <input
                  value={editData.last_name || ''}
                  onChange={(e) => setEditData((p) => ({ ...p, last_name: e.target.value }))}
                  className="input-field"
                />
              </div>
              <div>
                <label className="label">Title</label>
                <input
                  value={editData.title || ''}
                  onChange={(e) => setEditData((p) => ({ ...p, title: e.target.value }))}
                  className="input-field"
                />
              </div>
              <div>
                <label className="label">Company</label>
                <select
                  value={editData.company_id || ''}
                  onChange={(e) => setEditData((p) => ({ ...p, company_id: e.target.value }))}
                  className="input-field"
                >
                  <option value="">No company</option>
                  {companies.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">Email</label>
                <input
                  type="email"
                  value={editData.email || ''}
                  onChange={(e) => setEditData((p) => ({ ...p, email: e.target.value }))}
                  className="input-field"
                />
              </div>
              <div>
                <label className="label">Notes</label>
                <textarea
                  value={editData.notes || ''}
                  onChange={(e) => setEditData((p) => ({ ...p, notes: e.target.value }))}
                  className="input-field resize-none"
                  rows={2}
                />
              </div>
            </div>
            <div className="flex gap-3">
              <button onClick={handleSave} disabled={isSaving} className="btn-primary">
                {isSaving ? 'Saving...' : 'Save Changes'}
              </button>
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
                  <h1 className="text-2xl font-bold text-procare-dark-blue font-serif">
                    {attendee.first_name} {attendee.last_name}
                  </h1>
                  {attendee.title && (
                    <p className="text-gray-600 mt-1">{attendee.title}</p>
                  )}
                  <div className="flex flex-wrap gap-2 mt-2">
                    {attendee.title && (
                      <span className={`badge ${seniorityColors[seniority]}`}>{seniority}</span>
                    )}
                    {attendee.company_type && (
                      <span className="badge-blue">{attendee.company_type}</span>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={() => setIsEditing(true)} className="btn-secondary text-sm flex items-center gap-2">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                  Edit
                </button>
                <button onClick={handleDelete} disabled={isDeleting} className="btn-danger text-sm flex items-center gap-2">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                  Delete
                </button>
              </div>
            </div>

            {/* Info Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6 pt-6 border-t border-gray-100">
              <div>
                <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">Company</p>
                {attendee.company_name ? (
                  <div>
                    <p className="text-sm font-medium text-gray-800">{attendee.company_name}</p>
                    {attendee.company_website && (
                      <a
                        href={attendee.company_website.startsWith('http') ? attendee.company_website : `https://${attendee.company_website}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-procare-bright-blue hover:underline"
                      >
                        {attendee.company_website}
                      </a>
                    )}
                  </div>
                ) : <p className="text-sm text-gray-400">—</p>}
              </div>
              <div>
                <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">Email</p>
                {attendee.email ? (
                  <a href={`mailto:${attendee.email}`} className="text-sm text-procare-bright-blue hover:underline">
                    {attendee.email}
                  </a>
                ) : <p className="text-sm text-gray-400">—</p>}
              </div>
              {attendee.notes && (
                <div className="md:col-span-2">
                  <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">Notes</p>
                  <p className="text-sm text-gray-600">{attendee.notes}</p>
                </div>
              )}
              <div>
                <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">Added</p>
                <p className="text-sm text-gray-600">{new Date(attendee.created_at).toLocaleDateString()}</p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Conferences */}
      <div className="card">
        <h2 className="text-lg font-semibold text-procare-dark-blue mb-4 font-serif">
          Conferences ({attendee.conferences.length})
        </h2>
        {attendee.conferences.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-4">
            Not associated with any conferences.
          </p>
        ) : (
          <div className="space-y-3">
            {attendee.conferences.map((conf) => (
              <Link
                key={conf.id}
                href={`/conferences/${conf.id}`}
                className="flex items-center justify-between p-3 rounded-lg border border-gray-100 hover:border-procare-bright-blue hover:bg-blue-50 transition-all"
              >
                <div>
                  <p className="text-sm font-medium text-gray-800">{conf.name}</p>
                  <p className="text-xs text-gray-500">
                    {formatDate(conf.start_date)} · {conf.location}
                  </p>
                </div>
                <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
