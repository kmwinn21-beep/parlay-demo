'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { FollowUpsTable, type FollowUp } from '@/components/FollowUpsTable';
import { MeetingsTable, type Meeting } from '@/components/MeetingsTable';
import { NotesSection, type EntityNote } from '@/components/NotesSection';
import { BackButton } from '@/components/BackButton';
import { useConfigColors } from '@/lib/useConfigColors';
import { getPillClass, getBadgeClass } from '@/lib/colors';

interface ConferenceItem { id: number; name: string; start_date: string; end_date: string; location: string; }

interface Attendee {
  id: number;
  first_name: string;
  last_name: string;
  title?: string;
  email?: string;
  conference_count: number;
  conference_names?: string;
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
  conferences?: ConferenceItem[];
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
      <span
        className={`inline-flex items-center justify-center min-w-[1.5rem] px-2 py-0.5 rounded-full text-xs font-semibold ${count >= 4 ? 'bg-green-100 text-green-700' : count === 3 ? 'bg-yellow-100 text-yellow-700' : count === 2 ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'}`}
        style={{ cursor: list.length > 0 ? 'pointer' : 'default' }}
      >
        {count}
      </span>
      {pos && (
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

export default function CompanyDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const colorMaps = useConfigColors();

  const [company, setCompany] = useState<Company | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [editData, setEditData] = useState<Partial<Company>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [attendeeSearch, setAttendeeSearch] = useState('');
  const [attendeePage, setAttendeePage] = useState(1);
  const ATTENDEE_PAGE_SIZE = 100;
  const [companyFollowUps, setCompanyFollowUps] = useState<FollowUp[]>([]);
  const [companyNotes, setCompanyNotes] = useState<EntityNote[]>([]);
  const [companyMeetings, setCompanyMeetings] = useState<Meeting[]>([]);
  const [actionOptions, setActionOptions] = useState<string[]>([]);

  // Dynamic config options
  const [statusOptions, setStatusOptions] = useState<string[]>([]);
  const [companyTypeOptions, setCompanyTypeOptions] = useState<string[]>([]);
  const [profitTypeOptions, setProfitTypeOptions] = useState<string[]>([]);

  const fetchCompany = useCallback(async () => {
    try {
      const [compRes, fuRes, notesRes, statusRes, compTypeRes, profitRes, meetingsRes, actionRes] = await Promise.all([
        fetch(`/api/companies/${id}`),
        fetch(`/api/follow-ups?company_id=${id}`),
        fetch(`/api/notes?entity_type=company&entity_id=${id}`),
        fetch('/api/config?category=status'),
        fetch('/api/config?category=company_type'),
        fetch('/api/config?category=profit_type'),
        fetch(`/api/meetings?company_id=${id}`),
        fetch('/api/config?category=action'),
      ]);
      if (!compRes.ok) throw new Error('Not found');
      const data = await compRes.json();
      setCompany(data);
      setEditData({
        name: data.name,
        website: data.website || '',
        profit_type: data.profit_type || '',
        company_type: data.company_type || '',
        notes: data.notes || '',
      });
      if (fuRes.ok) setCompanyFollowUps(await fuRes.json());
      if (notesRes.ok) setCompanyNotes(await notesRes.json());
      if (statusRes.ok) setStatusOptions((await statusRes.json()).map((o: { value: string }) => o.value));
      if (compTypeRes.ok) setCompanyTypeOptions((await compTypeRes.json()).map((o: { value: string }) => o.value));
      if (profitRes.ok) setProfitTypeOptions((await profitRes.json()).map((o: { value: string }) => o.value));
      if (meetingsRes.ok) setCompanyMeetings(await meetingsRes.json());
      if (actionRes.ok) setActionOptions((await actionRes.json()).map((o: { value: string }) => o.value));
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

  const handleStatus = async (value: string) => {
    try {
      const res = await fetch(`/api/companies/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: value }),
      });
      if (!res.ok) throw new Error();
      setCompany(prev => prev ? { ...prev, status: value } : prev);
      toast.success(`Status set to "${value}" — all attendees updated.`);
    } catch {
      toast.error('Failed to update status.');
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

  const handleToggleFollowUp = async (attendeeId: number, conferenceId: number, completed: boolean) => {
    setCompanyFollowUps(prev =>
      prev.map(fu =>
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
      setCompanyFollowUps(prev =>
        prev.map(fu =>
          fu.attendee_id === attendeeId && fu.conference_id === conferenceId ? { ...fu, completed: !completed } : fu
        )
      );
      toast.error('Failed to update.');
    }
  };

  const handleDeleteFollowUp = async (attendeeId: number, conferenceId: number) => {
    if (!confirm('Are you sure you want to delete this follow-up?')) return;
    const prev = companyFollowUps;
    setCompanyFollowUps(fus => fus.filter(fu => !(fu.attendee_id === attendeeId && fu.conference_id === conferenceId)));
    try {
      const res = await fetch('/api/follow-ups', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ attendee_id: attendeeId, conference_id: conferenceId }),
      });
      if (!res.ok) throw new Error();
      toast.success('Follow-up deleted.');
    } catch {
      setCompanyFollowUps(prev);
      toast.error('Failed to delete follow-up.');
    }
  };

  useEffect(() => { setAttendeePage(1); }, [attendeeSearch]);

  const filteredAttendees = (company?.attendees || []).filter((a) => {
    if (!attendeeSearch) return true;
    const fullName = `${a.first_name} ${a.last_name}`.toLowerCase();
    return fullName.includes(attendeeSearch.toLowerCase()) ||
      (a.title?.toLowerCase().includes(attendeeSearch.toLowerCase()));
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

  if (!company) return null;

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center justify-between">
        <nav className="flex items-center gap-2 text-sm text-gray-500">
          <Link href="/companies" className="hover:text-procare-bright-blue">Companies</Link>
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
          <span className="text-gray-800">{company.name}</span>
        </nav>
        <BackButton />
      </div>

      {/* Two-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left column — main content */}
        <div className="lg:col-span-2 space-y-6">

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
                  {companyTypeOptions.map(opt => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
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
                  {profitTypeOptions.map(opt => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
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
                  <span className="hidden sm:inline">Edit</span>
                </button>
                <button onClick={handleDelete} disabled={isDeleting} className="btn-danger text-sm flex items-center gap-2">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                  <span className="hidden sm:inline">Delete</span>
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
                <span className={getBadgeClass(company.status || 'Unknown', colorMaps.status || {})}>{company.status || 'Unknown'}</span>
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
          <>
            {/* Mobile card layout */}
            <div className="block lg:hidden divide-y divide-gray-100">
              {paginatedAttendees.map((attendee) => (
                <div key={attendee.id} className="p-4 bg-white">
                  <div className="flex items-start justify-between gap-3">
                    <Link href={`/attendees/${attendee.id}`} className="font-semibold text-procare-bright-blue hover:underline text-sm">
                      {attendee.first_name} {attendee.last_name}
                    </Link>
                    <ConferenceCountTooltip count={Number(attendee.conference_count)} names={attendee.conference_names} />
                  </div>
                  {attendee.title && <p className="text-xs text-gray-500 mt-1">{attendee.title}</p>}
                  {attendee.email && (
                    <a href={`mailto:${attendee.email}`} className="text-xs text-procare-bright-blue hover:underline mt-1 block">
                      {attendee.email}
                    </a>
                  )}
                </div>
              ))}
            </div>

            {/* Desktop table layout */}
            <div className="hidden lg:block overflow-x-auto">
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
                  {paginatedAttendees.map((attendee) => (
                    <tr key={attendee.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 font-medium">
                        <Link href={`/attendees/${attendee.id}`} className="text-procare-bright-blue hover:underline">
                          {attendee.first_name} {attendee.last_name}
                        </Link>
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
                        <ConferenceCountTooltip count={Number(attendee.conference_count)} names={attendee.conference_names} />
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
          </>
        )}

        {/* Attendee pagination */}
        {attendeeTotalPages > 1 && (
          <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-100">
            <span className="text-xs text-gray-500">Page {attendeePage} of {attendeeTotalPages} · {filteredAttendees.length} total</span>
            <div className="flex items-center gap-2">
              <button disabled={attendeePage === 1} onClick={() => setAttendeePage(p => p - 1)} className="px-3 py-1 text-xs rounded border border-gray-200 disabled:opacity-40 hover:bg-gray-50">Previous</button>
              <button disabled={attendeePage >= attendeeTotalPages} onClick={() => setAttendeePage(p => p + 1)} className="px-3 py-1 text-xs rounded border border-gray-200 disabled:opacity-40 hover:bg-gray-50">Next</button>
            </div>
          </div>
        )}
      </div>

          {/* Meetings */}
          <div className="card p-0 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100">
              <h2 className="text-base font-semibold text-procare-dark-blue font-serif">
                Meetings
                {companyMeetings.length > 0 && (
                  <span className="ml-2 text-sm font-normal text-gray-500">
                    ({companyMeetings.length})
                  </span>
                )}
              </h2>
            </div>
            <MeetingsTable
              meetings={companyMeetings}
              actionOptions={actionOptions}
              onOutcomeChange={async (meetingId, outcome) => {
                setCompanyMeetings(prev => prev.map(m => m.id === meetingId ? { ...m, outcome } : m));
                try {
                  const res = await fetch('/api/meetings', {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ id: meetingId, outcome }),
                  });
                  if (!res.ok) throw new Error();
                  toast.success('Outcome updated.');
                } catch {
                  fetchCompany();
                  toast.error('Failed to update outcome.');
                }
              }}
              onDelete={async (meetingId) => {
                if (!confirm('Delete this meeting? This cannot be undone.')) return;
                try {
                  const res = await fetch(`/api/meetings/${meetingId}`, { method: 'DELETE' });
                  if (!res.ok) throw new Error();
                  toast.success('Meeting deleted.');
                  fetchCompany();
                } catch {
                  toast.error('Failed to delete meeting.');
                }
              }}
            />
          </div>

          {/* Follow Ups */}
          <div className="card p-0 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100">
              <h2 className="text-base font-semibold text-procare-dark-blue font-serif">
                Follow Ups
                {companyFollowUps.length > 0 && (
                  <span className="ml-2 text-sm font-normal text-gray-500">
                    ({companyFollowUps.filter(f => !f.completed).length} pending)
                  </span>
                )}
              </h2>
            </div>
            <FollowUpsTable followUps={companyFollowUps} onToggle={handleToggleFollowUp} onDelete={handleDeleteFollowUp} />
          </div>

          {/* Notes */}
          <NotesSection
            entityType="company"
            entityId={Number(id)}
            initialNotes={companyNotes}
          />

        </div>{/* end left column */}

        {/* Right column — Status */}
        <div className="space-y-6">
          <div className="card">
            <h2 className="text-base font-semibold text-procare-dark-blue font-serif mb-1">Status</h2>
            <p className="text-xs text-gray-500 mb-3">Setting a company status will update all associated attendees.</p>
            <div className="flex flex-wrap gap-2">
              {statusOptions.map(val => {
                const isActive = (company.status || 'Unknown') === val;
                return (
                  <button
                    key={val}
                    onClick={() => handleStatus(val)}
                    className={`px-4 py-2 rounded-full text-sm font-medium border-2 transition-all ${
                      isActive ? `${getPillClass(val, colorMaps.status || {})} shadow-md scale-105` : 'bg-white text-gray-500 border-gray-200 hover:border-gray-400'
                    }`}
                  >
                    {val}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Conferences this company has attended */}
          <div className="card">
            <h2 className="text-base font-semibold text-procare-dark-blue font-serif mb-3">
              Conferences ({company.conferences?.length ?? 0})
            </h2>
            {!company.conferences || company.conferences.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-3">No conferences attended yet.</p>
            ) : (
              <div className="space-y-2">
                {company.conferences.map(conf => (
                  <Link
                    key={conf.id}
                    href={`/conferences/${conf.id}`}
                    className="flex items-center justify-between p-3 rounded-lg border border-gray-100 hover:border-procare-bright-blue hover:bg-blue-50 transition-all"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-800 truncate">{conf.name}</p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {new Date(conf.start_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                        {conf.end_date && conf.end_date !== conf.start_date ? ` – ${new Date(conf.end_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}` : ''}
                      </p>
                    </div>
                    <svg className="w-4 h-4 text-gray-400 flex-shrink-0 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>

      </div>{/* end grid */}
    </div>
  );
}
