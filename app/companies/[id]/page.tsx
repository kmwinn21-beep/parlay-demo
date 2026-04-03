'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import toast from 'react-hot-toast';

interface Attendee {
  id: number;
  first_name: string;
  last_name: string;
  title?: string;
  email?: string;
  conference_count: number;
}

interface Company {
  id: number;
  name: string;
  website?: string;
  profit_type?: string;
  company_type?: string;
  notes?: string;
  status?: string;
  created_at: string;
  attendees: Attendee[];
}

function statusBadgeClass(status: string) {
  switch (status) {
    case 'Client':        return 'inline-flex px-2 py-0.5 rounded-full text-xs font-semibold bg-yellow-100 text-yellow-800 border border-yellow-300';
    case 'Hot Prospect':  return 'inline-flex px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-700 border border-red-300';
    case 'Interested':    return 'inline-flex px-2 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-700 border border-green-300';
    case 'Not Interested':return 'inline-flex px-2 py-0.5 rounded-full text-xs font-semibold bg-gray-800 text-white';
    default:              return 'inline-flex px-2 py-0.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-500';
  }
}

export default function CompanyDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [company, setCompany] = useState<Company | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [editData, setEditData] = useState<Partial<Company>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [attendeeSearch, setAttendeeSearch] = useState('');

  const fetchCompany = useCallback(async () => {
    try {
      const res = await fetch(`/api/companies/${id}`);
      if (!res.ok) throw new Error('Not found');
      const data = await res.json();
      setCompany(data);
      setEditData({
        name: data.name,
        website: data.website || '',
        profit_type: data.profit_type || '',
        company_type: data.company_type || '',
        notes: data.notes || '',
      });
    } catch {
      toast.error('Failed to load company');
      router.push('/companies');
    } finally {
      setIsLoading(false);
    }
  }, [id, router]);

  useEffect(() => {
    fetchCompany();
  }, [fetchCompany]);

  const handleSave = async () => {
    if (!editData.name) {
      toast.error('Company name is required.');
      return;
    }
    setIsSaving(true);
    try {
      const res = await fetch(`/api/companies/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editData),
      });
      if (!res.ok) throw new Error('Update failed');
      toast.success('Company updated!');
      setIsEditing(false);
      fetchCompany();
    } catch {
      toast.error('Failed to update company');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this company? Attendees will be unlinked but not deleted.')) return;
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/companies/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Delete failed');
      toast.success('Company deleted.');
      router.push('/companies');
    } catch {
      toast.error('Failed to delete company');
      setIsDeleting(false);
    }
  };

  const filteredAttendees = (company?.attendees || []).filter((a) => {
    if (!attendeeSearch) return true;
    const fullName = `${a.first_name} ${a.last_name}`.toLowerCase();
    return fullName.includes(attendeeSearch.toLowerCase()) ||
      (a.title?.toLowerCase().includes(attendeeSearch.toLowerCase()));
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin w-8 h-8 border-4 border-procare-bright-blue border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!company) return null;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-sm text-gray-500">
        <Link href="/companies" className="hover:text-procare-bright-blue">Companies</Link>
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
        <span className="text-gray-800">{company.name}</span>
      </nav>

      {/* Company Info Card */}
      <div className="card">
        {isEditing ? (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-procare-dark-blue font-serif">Edit Company</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <label className="label">Company Name *</label>
                <input
                  value={editData.name || ''}
                  onChange={(e) => setEditData((p) => ({ ...p, name: e.target.value }))}
                  className="input-field"
                />
              </div>
              <div>
                <label className="label">Website</label>
                <input
                  value={editData.website || ''}
                  onChange={(e) => setEditData((p) => ({ ...p, website: e.target.value }))}
                  className="input-field"
                  placeholder="https://example.com"
                />
              </div>
              <div>
                <label className="label">Company Type</label>
                <select
                  value={editData.company_type || ''}
                  onChange={(e) => setEditData((p) => ({ ...p, company_type: e.target.value }))}
                  className="input-field"
                >
                  <option value="">Select type...</option>
                  <option value="3rd Party Operator">3rd Party Operator</option>
                  <option value="Owner/Operator">Owner/Operator</option>
                  <option value="Capital Partner">Capital Partner</option>
                  <option value="Vendor">Vendor</option>
                  <option value="Partner">Partner</option>
                  <option value="Other">Other</option>
                </select>
              </div>
              <div>
                <label className="label">Profit Type</label>
                <select
                  value={editData.profit_type || ''}
                  onChange={(e) => setEditData((p) => ({ ...p, profit_type: e.target.value }))}
                  className="input-field"
                >
                  <option value="">Select...</option>
                  <option value="for-profit">For-Profit</option>
                  <option value="non-profit">Non-Profit</option>
                </select>
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
                <div className="w-14 h-14 rounded-xl bg-procare-gold flex items-center justify-center text-procare-dark-blue text-xl font-bold font-serif flex-shrink-0">
                  {company.name[0]}
                </div>
                <div>
                  <h1 className="text-2xl font-bold text-procare-dark-blue font-serif">{company.name}</h1>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {company.company_type && (
                      <span className="badge-blue">{company.company_type}</span>
                    )}
                    {company.profit_type && (
                      <span className={`badge ${company.profit_type === 'for-profit' ? 'badge-green' : 'badge-gold'}`}>
                        {company.profit_type}
                      </span>
                    )}
                    <span className="badge-gray">{company.attendees.length} attendees</span>
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

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6 pt-6 border-t border-gray-100">
              <div>
                <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">Website</p>
                {company.website ? (
                  <a
                    href={company.website.startsWith('http') ? company.website : `https://${company.website}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-procare-bright-blue hover:underline"
                  >
                    {company.website.replace(/^https?:\/\//, '')}
                  </a>
                ) : <p className="text-sm text-gray-400">—</p>}
              </div>
              <div>
                <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">Added</p>
                <p className="text-sm text-gray-600">{new Date(company.created_at).toLocaleDateString()}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">Status</p>
                <span className={statusBadgeClass(company.status || 'Unknown')}>{company.status || 'Unknown'}</span>
              </div>
              {company.notes && (
                <div className="md:col-span-3">
                  <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">Notes</p>
                  <p className="text-sm text-gray-600">{company.notes}</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Attendees */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-procare-dark-blue font-serif">
            Attendees ({company.attendees.length})
          </h2>
          <div className="relative">
            <svg className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              value={attendeeSearch}
              onChange={(e) => setAttendeeSearch(e.target.value)}
              placeholder="Search attendees..."
              className="input-field pl-9 w-48"
            />
          </div>
        </div>

        {filteredAttendees.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-4">
            {attendeeSearch ? 'No attendees match your search.' : 'No attendees for this company yet.'}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Name</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Title</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Email</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Conferences</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredAttendees.map((attendee) => (
                  <tr key={attendee.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 font-medium text-gray-800">
                      {attendee.first_name} {attendee.last_name}
                    </td>
                    <td className="px-4 py-3 text-gray-600 max-w-[160px] truncate">
                      {attendee.title || <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      {attendee.email ? (
                        <a href={`mailto:${attendee.email}`} className="text-procare-bright-blue hover:underline text-xs">
                          {attendee.email}
                        </a>
                      ) : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      <span className="badge-gray">{attendee.conference_count}</span>
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/attendees/${attendee.id}`}
                        className="text-procare-bright-blue hover:underline text-xs font-medium"
                      >
                        View
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
