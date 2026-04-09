'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { FollowUpsTable, type FollowUp } from '@/components/FollowUpsTable';
import { MeetingsTable, type Meeting, type EditFormData } from '@/components/MeetingsTable';
import { NotesSection, type EntityNote } from '@/components/NotesSection';
import { BackButton } from '@/components/BackButton';
import { MultiSelectDropdown } from '@/components/MultiSelectDropdown';
import { RepMultiSelect } from '@/components/RepMultiSelect';
import { useConfigColors } from '@/lib/useConfigColors';
import { getPillClass, getBadgeClass } from '@/lib/colors';
import { effectiveSeniority, classifyICP } from '@/lib/parsers';
import { type UserOption, parseRepIds, resolveRepInitials } from '@/lib/useUserOptions';
import { AssignFollowUpModal } from '@/components/AssignFollowUpModal';

interface ConferenceItem { id: number; name: string; start_date: string; end_date: string; location: string; }

interface Attendee {
  id: number;
  first_name: string;
  last_name: string;
  title?: string;
  email?: string;
  seniority?: string;
  company_id?: number;
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
  wse?: number;
  status?: string;
  assigned_user?: string;
  parent_company_id?: number;
  entity_structure?: string;
  services?: string[];
  icp?: string;
  created_at: string;
  attendees: Attendee[];
  conferences?: ConferenceItem[];
  parent_company?: { id: number; name: string } | null;
  child_companies?: { id: number; name: string; website: string | null; company_type: string | null; attendee_count: number }[];
  related_companies?: { id: number; name: string; company_type: string | null }[];
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
  const [attendeePage, setAttendeePage] = useState(1);
  const ATTENDEE_PAGE_SIZE = 100;
  const [companyFollowUps, setCompanyFollowUps] = useState<FollowUp[]>([]);
  const [companyNotes, setCompanyNotes] = useState<EntityNote[]>([]);
  const [companyMeetings, setCompanyMeetings] = useState<Meeting[]>([]);
  const [actionOptions, setActionOptions] = useState<string[]>([]);
  const [allCompanies, setAllCompanies] = useState<{ id: number; name: string }[]>([]);
  const [editingCompanyAttendeeId, setEditingCompanyAttendeeId] = useState<number | null>(null);
  const [savingCompanyAttendeeId, setSavingCompanyAttendeeId] = useState<number | null>(null);
  const [attendeesExpanded, setAttendeesExpanded] = useState(false);
  const ATTENDEE_COLLAPSED_COUNT = 4;

  // Dynamic config options
  const [statusOptions, setStatusOptions] = useState<string[]>([]);
  const [companyTypeOptions, setCompanyTypeOptions] = useState<string[]>([]);
  const [profitTypeOptions, setProfitTypeOptions] = useState<string[]>([]);
  const [userOptions, setUserOptions] = useState<UserOption[]>([]);
  const [entityStructureOptions, setEntityStructureOptions] = useState<string[]>([]);
  const [servicesOptions, setServicesOptions] = useState<string[]>([]);
  const [icpOptions, setIcpOptions] = useState<string[]>([]);

  // Operator / Capital relationship state
  const [operatorTypeValues, setOperatorTypeValues] = useState<Set<string>>(new Set());
  const [capitalTypeValues, setCapitalTypeValues] = useState<Set<string>>(new Set());
  const [showRelateModal, setShowRelateModal] = useState(false);
  const [showAssignFollowUp, setShowAssignFollowUp] = useState(false);
  const [relateSearch, setRelateSearch] = useState('');
  const [relateResults, setRelateResults] = useState<{ id: number; name: string; company_type: string | null }[]>([]);
  const [relateSaving, setRelateSaving] = useState(false);

  const fetchCompany = useCallback(async () => {
    try {
      const [compRes, statusRes, compTypeRes, profitRes, actionRes, userRes, entityStructureRes, servicesRes, icpRes, allCompaniesRes] = await Promise.all([
        fetch(`/api/companies/${id}`),
        fetch('/api/config?category=status'),
        fetch('/api/config?category=company_type'),
        fetch('/api/config?category=profit_type'),
        fetch('/api/config?category=action'),
        fetch('/api/config?category=user'),
        fetch('/api/config?category=entity_structure'),
        fetch('/api/config?category=services'),
        fetch('/api/config?category=icp'),
        fetch('/api/companies'),
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
        wse: data.wse ?? undefined,
        assigned_user: data.assigned_user || '',
        entity_structure: data.entity_structure || '',
        services: Array.isArray(data.services) ? data.services : [],
        icp: data.icp || 'False',
      });
      if (statusRes.ok) setStatusOptions((await statusRes.json()).map((o: { value: string }) => o.value));
      if (compTypeRes.ok) {
        const compTypeData = await compTypeRes.json();
        setCompanyTypeOptions(compTypeData.map((o: { value: string }) => o.value));
        // Identify Operator and Capital type values by their config option IDs
        // so the relationship section works even if option names change in Admin
        const opVals = new Set<string>();
        const capVals = new Set<string>();
        for (const opt of compTypeData) {
          const v = (opt.value as string).toLowerCase();
          if (v.includes('operator') || v === 'opco' || v === 'own/op') {
            opVals.add(opt.value as string);
          } else if (v.includes('capital') || v === 'propco') {
            capVals.add(opt.value as string);
          }
        }
        setOperatorTypeValues(opVals);
        setCapitalTypeValues(capVals);
      }
      if (profitRes.ok) setProfitTypeOptions((await profitRes.json()).map((o: { value: string }) => o.value));
      if (actionRes.ok) setActionOptions((await actionRes.json()).map((o: { value: string }) => o.value));
      if (userRes.ok) setUserOptions((await userRes.json()).map((o: { id: number; value: string }) => ({ id: Number(o.id), value: String(o.value) })));
      if (entityStructureRes.ok) setEntityStructureOptions((await entityStructureRes.json()).map((o: { value: string }) => o.value));
      if (servicesRes.ok) setServicesOptions((await servicesRes.json()).map((o: { value: string }) => o.value));
      if (icpRes.ok) setIcpOptions((await icpRes.json()).map((o: { value: string }) => o.value));
      if (allCompaniesRes.ok) setAllCompanies((await allCompaniesRes.json()).map((c: { id: number; name: string }) => ({ id: c.id, name: c.name })));

      // For parent companies, include child company IDs in meetings, follow-ups, and notes queries
      const childIds = (data.child_companies || []).map((c: { id: number }) => c.id);
      const isParent = childIds.length > 0;
      const companyIds = isParent ? [id, ...childIds].join(',') : null;

      const [fuRes, notesRes, meetingsRes] = await Promise.all([
        fetch(companyIds
          ? `/api/follow-ups?company_ids=${companyIds}`
          : `/api/follow-ups?company_id=${id}`),
        fetch(companyIds
          ? `/api/notes?entity_type=company&entity_ids=${companyIds}`
          : `/api/notes?entity_type=company&entity_id=${id}`),
        fetch(companyIds
          ? `/api/meetings?company_ids=${companyIds}`
          : `/api/meetings?company_id=${id}`),
      ]);
      if (fuRes.ok) setCompanyFollowUps(await fuRes.json());
      if (notesRes.ok) setCompanyNotes(await notesRes.json());
      if (meetingsRes.ok) setCompanyMeetings(await meetingsRes.json());
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

  // Auto-classify ICP when WSE, Company Type, or Services change in edit mode
  useEffect(() => {
    if (!isEditing) return;
    const services = Array.isArray(editData.services) ? editData.services.join(',') : '';
    const wse = editData.wse != null ? Number(editData.wse) : null;
    const icp = classifyICP(wse, editData.company_type || null, services || null);
    setEditData((p) => ({ ...p, icp }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEditing, editData.wse, editData.company_type, editData.services]);

  // Search companies for relate modal
  useEffect(() => {
    if (!showRelateModal || relateSearch.length < 2) {
      setRelateResults([]);
      return;
    }
    const controller = new AbortController();
    fetch('/api/companies', { signal: controller.signal })
      .then(r => r.json())
      .then((companies: { id: number; name: string; company_type?: string }[]) => {
        const existingRelatedIds = new Set((company?.related_companies || []).map(c => c.id));
        const q = relateSearch.toLowerCase();
        setRelateResults(
          companies
            .filter(c => c.id !== Number(id) && !existingRelatedIds.has(c.id) && c.name.toLowerCase().includes(q))
            .slice(0, 10)
            .map(c => ({ id: c.id, name: c.name, company_type: c.company_type || null }))
        );
      })
      .catch(() => {});
    return () => controller.abort();
  }, [showRelateModal, relateSearch, id, company?.related_companies]);

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
    const currentStatuses = new Set((company?.status || '').split(',').map(s => s.trim()).filter(Boolean));
    if (currentStatuses.has(value)) { currentStatuses.delete(value); } else { currentStatuses.add(value); }
    const newStatus = Array.from(currentStatuses).join(',');
    try {
      const res = await fetch(`/api/companies/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) throw new Error();
      setCompany(prev => prev ? { ...prev, status: newStatus } : prev);
      toast.success(newStatus ? 'Status updated — all attendees updated.' : 'Status cleared — all attendees updated.');
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

  const handleCompanyChange = async (attendeeId: number, newCompanyId: number) => {
    setSavingCompanyAttendeeId(attendeeId);
    try {
      const res = await fetch(`/api/attendees/${attendeeId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ company_id: newCompanyId }),
      });
      if (!res.ok) throw new Error();
      toast.success('Company updated.');
      setEditingCompanyAttendeeId(null);
      fetchCompany();
    } catch {
      toast.error('Failed to update company.');
    } finally {
      setSavingCompanyAttendeeId(null);
    }
  };

  const handleAddRelationship = async (relatedCompanyId: number) => {
    setRelateSaving(true);
    try {
      const res = await fetch('/api/companies/relationships', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ company_id_1: Number(id), company_id_2: relatedCompanyId }),
      });
      if (!res.ok) throw new Error();
      toast.success('Relationship added.');
      setShowRelateModal(false);
      setRelateSearch('');
      setRelateResults([]);
      fetchCompany();
    } catch {
      toast.error('Failed to add relationship.');
    } finally {
      setRelateSaving(false);
    }
  };

  const handleRemoveRelationship = async (relatedCompanyId: number) => {
    if (!confirm('Remove this relationship?')) return;
    try {
      const res = await fetch('/api/companies/relationships', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ company_id_1: Number(id), company_id_2: relatedCompanyId }),
      });
      if (!res.ok) throw new Error();
      toast.success('Relationship removed.');
      fetchCompany();
    } catch {
      toast.error('Failed to remove relationship.');
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

  const handleRepChange = async (attendeeId: number, conferenceId: number, rep: string | null) => {
    setCompanyFollowUps((prev) =>
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
      fetchCompany();
      toast.error('Failed to update rep.');
    }
  };

  const filteredAttendees = company?.attendees || [];

  const attendeeTotalPages = Math.ceil(filteredAttendees.length / ATTENDEE_PAGE_SIZE);
  const displayedAttendees = attendeesExpanded
    ? filteredAttendees
    : filteredAttendees.slice(0, ATTENDEE_COLLAPSED_COUNT);
  const paginatedAttendees = displayedAttendees;

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
            <div className="flex items-center justify-between gap-4">
              <h2 className="text-lg font-semibold text-procare-dark-blue font-serif">Edit Company</h2>
              <div>
                <label className="label">ICP</label>
                <div className="inline-flex items-center rounded-lg border border-gray-200 p-1 bg-gray-50">
                  {(icpOptions.length > 0 ? icpOptions : ['True', 'False']).map((option) => (
                    <button
                      key={option}
                      type="button"
                      onClick={() => setEditData((p) => ({ ...p, icp: option }))}
                      className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${String(editData.icp || 'False') === option ? 'bg-procare-bright-blue text-white' : 'text-gray-600 hover:text-gray-800'}`}
                    >
                      {option}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="label">Company Name *</label>
                <input
                  value={editData.name || ''}
                  onChange={(e) => setEditData((p) => ({ ...p, name: e.target.value }))}
                  className="input-field"
                />
              </div>
              <div>
                <label className="label">WSE</label>
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={editData.wse ?? ''}
                  onChange={(e) => {
                    const val = e.target.value.replace(/\D/g, '');
                    setEditData((p) => ({ ...p, wse: val === '' ? undefined : Number(val) }));
                  }}
                  className="input-field"
                  placeholder="# of Work Site Employees"
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
                <label className="label">Assigned User</label>
                <RepMultiSelect
                  options={userOptions}
                  selectedIds={parseRepIds(editData.assigned_user)}
                  onChange={(ids) => setEditData((p) => ({ ...p, assigned_user: ids.join(',') }))}
                  triggerClass="input-field w-full flex items-center justify-between gap-2 text-sm"
                  placeholder="Select users..."
                />
              </div>
              <div>
                <label className="label">Entity Structure</label>
                <select
                  value={editData.entity_structure || ''}
                  onChange={(e) => setEditData((p) => ({ ...p, entity_structure: e.target.value }))}
                  className="input-field"
                >
                  <option value="">Select...</option>
                  {entityStructureOptions.map(opt => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </select>
              </div>
              <div className="md:col-span-2">
                <MultiSelectDropdown
                  label="Services"
                  options={servicesOptions}
                  values={Array.isArray(editData.services) ? editData.services : []}
                  onChange={(values) => setEditData((p) => ({ ...p, services: values }))}
                  placeholder="Select services..."
                  emptyMessage="No services configured. Add options in the Admin panel."
                />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <button onClick={handleSave} disabled={isSaving} className="btn-primary">
                {isSaving ? 'Saving...' : 'Save'}
              </button>
              <button onClick={() => setIsEditing(false)} className="btn-secondary">Cancel</button>
              <button onClick={handleDelete} disabled={isDeleting} className="btn-danger">
                {isDeleting ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        ) : (
          <div>
            {/* Header: avatar, name, badges, actions */}
            <div className="flex items-start gap-4">
              <div className="w-14 h-14 rounded-xl bg-procare-gold flex items-center justify-center text-procare-dark-blue text-xl font-bold font-serif flex-shrink-0">
                {company.name[0]}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h1 className="text-2xl font-bold text-procare-dark-blue font-serif flex items-center gap-2">
                      {company.name}
                      {company.icp === 'True' && (
                        <span title="Ideal Customer Profile" className="inline-flex items-center justify-center w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-green-100 flex-shrink-0">
                          <svg className="w-4 h-4 sm:w-5 sm:h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                        </span>
                      )}
                    </h1>
                    {company.parent_company && (
                      <p className="text-sm text-gray-500 mt-0.5">
                        Subsidiary of{' '}
                        <Link href={`/companies/${company.parent_company.id}`} className="text-procare-bright-blue hover:underline">
                          {company.parent_company.name}
                        </Link>
                      </p>
                    )}
                  </div>
                  <div className="flex gap-2 flex-shrink-0">
                    <button onClick={() => setIsEditing(true)} className="btn-secondary text-sm flex items-center gap-2">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                      <span className="hidden sm:inline">Edit</span>
                    </button>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 mt-2">
                  {company.company_type && (
                    <span className={`${getBadgeClass(company.company_type, colorMaps.company_type || {})} inline-flex items-center gap-1`}>
                      {company.entity_structure === 'Parent' && (
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                        </svg>
                      )}
                      {company.entity_structure === 'Child' && (
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-4 0h4" />
                        </svg>
                      )}
                      {company.company_type}
                    </span>
                  )}
                  {company.profit_type && (
                    <span className={`badge ${company.profit_type === 'for-profit' ? 'badge-green' : 'badge-gold'}`}>
                      {company.profit_type}
                    </span>
                  )}
                  <span className="badge-gray">{company.attendees.length} attendees</span>
                  {company.assigned_user && resolveRepInitials(company.assigned_user, userOptions).map((ini, i) => (
                    <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 text-xs font-medium">
                      <svg className="w-3 h-3 opacity-70" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                      </svg>
                      {ini}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            {/* Metadata fields */}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mt-6 pt-6 border-t border-gray-100">
              <div>
                <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">Website</p>
                {company.website ? (
                  <a
                    href={company.website.startsWith('http') ? company.website : `https://${company.website}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-procare-bright-blue hover:text-blue-700 transition-colors"
                    title={company.website.replace(/^https?:\/\//, '')}
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                  </a>
                ) : <p className="text-sm text-gray-400">—</p>}
              </div>
              <div>
                <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">Added</p>
                <p className="text-sm text-gray-600">{new Date(company.created_at).toLocaleDateString()}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">Status</p>
                <span className="flex flex-wrap gap-1">
                  {(company.status || 'Unknown').split(',').map(s => s.trim()).filter(Boolean).map(s => (
                    <span key={s} className={getBadgeClass(s, colorMaps.status || {})}>{s}</span>
                  ))}
                  {!(company.status || '').trim() && <span className={getBadgeClass('Unknown', colorMaps.status || {})}>Unknown</span>}
                </span>
              </div>
              <div>
                <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">WSE</p>
                {company.wse != null ? (
                  <span className="text-sm text-gray-600 inline-flex items-center gap-1">
                    <svg className="w-4 h-4 text-yellow-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M2 18h20M4 18v-3a8 8 0 0116 0v3M12 3v2M4.93 7.93l1.41 1.41M19.07 7.93l-1.41 1.41" /></svg>
                    {company.wse.toLocaleString()}
                  </span>
                ) : <p className="text-sm text-gray-400">—</p>}
              </div>
              <div>
                <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">Services</p>
                {company.services && company.services.length > 0 ? (
                  <div className="flex flex-wrap gap-1">
                    {company.services.map(s => (
                      <span key={s} className="badge-gray text-xs">{s}</span>
                    ))}
                  </div>
                ) : <p className="text-sm text-gray-400">—</p>}
              </div>
              <div>
                <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">ICP</p>
                {company.icp === 'True' ? (
                  <span className="inline-flex items-center gap-1 text-sm font-medium text-green-700 bg-green-50 px-2 py-0.5 rounded-full">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                    True
                  </span>
                ) : (
                  <span className="text-sm text-gray-500">False</span>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Attendees */}
      <div className="card">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-procare-dark-blue font-serif">
            Attendees ({company.attendees.length})
          </h2>
          {filteredAttendees.length > ATTENDEE_COLLAPSED_COUNT && (
            <button
              onClick={() => setAttendeesExpanded(prev => !prev)}
              className="text-gray-400 hover:text-procare-bright-blue transition-colors p-1 rounded hover:bg-gray-50"
              title={attendeesExpanded ? 'Collapse attendees' : 'Expand attendees'}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                {attendeesExpanded ? (
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                )}
              </svg>
            </button>
          )}
        </div>

        {filteredAttendees.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-4">No attendees for this company yet.</p>
        ) : (
          <>
            {/* Mobile card layout */}
            <div className="block lg:hidden divide-y divide-gray-100">
              {paginatedAttendees.map((attendee) => {
                const seniority = effectiveSeniority(attendee.seniority, attendee.title);
                return (
                <div key={attendee.id} className="p-4 bg-white">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <Link href={`/attendees/${attendee.id}`} className="font-semibold text-procare-bright-blue hover:underline text-sm">
                        {attendee.first_name} {attendee.last_name}
                      </Link>
                      {attendee.email && (
                        <a href={`mailto:${attendee.email}`} title={attendee.email} className="text-gray-400 hover:text-procare-bright-blue">
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                          </svg>
                        </a>
                      )}
                    </div>
                    <ConferenceCountTooltip count={Number(attendee.conference_count)} names={attendee.conference_names} />
                  </div>
                  {attendee.title && <p className="text-xs text-gray-500 mt-1">{attendee.title}</p>}
                  {seniority && (
                    <span className={`${getBadgeClass(seniority, colorMaps.seniority || {})} mt-1 inline-block text-[10px]`}>{seniority}</span>
                  )}
                </div>
                );
              })}
            </div>

            {/* Desktop table layout */}
            <div className="hidden lg:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Name</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Title</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Seniority</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider w-16">
                      <svg className="w-4 h-4 mx-auto text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                      </svg>
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Company</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Conferences</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {paginatedAttendees.map((attendee) => {
                    const seniority = effectiveSeniority(attendee.seniority, attendee.title);
                    return (
                    <tr key={attendee.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 font-medium overflow-hidden" style={{ maxWidth: 220 }}>
                        <Link href={`/attendees/${attendee.id}`} className="text-procare-bright-blue hover:underline block truncate" title={`${attendee.first_name} ${attendee.last_name}`}>
                          {attendee.first_name} {attendee.last_name}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-gray-600">
                        {attendee.title ? (
                          <span className="block text-xs leading-snug break-words whitespace-normal" title={attendee.title}>{attendee.title}</span>
                        ) : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-4 py-3">
                        {seniority ? (
                          <span className={getBadgeClass(seniority, colorMaps.seniority || {})}>{seniority}</span>
                        ) : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {attendee.email ? (
                          <a href={`mailto:${attendee.email}`} title={attendee.email} className="inline-flex items-center justify-center text-gray-400 hover:text-procare-bright-blue transition-colors">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                            </svg>
                          </a>
                        ) : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-4 py-3">
                        {editingCompanyAttendeeId === attendee.id ? (
                          <div className="flex items-center gap-1">
                            <select
                              defaultValue={attendee.company_id || ''}
                              disabled={savingCompanyAttendeeId === attendee.id}
                              onChange={(e) => {
                                const val = Number(e.target.value);
                                if (val && val !== attendee.company_id) {
                                  handleCompanyChange(attendee.id, val);
                                }
                              }}
                              className="input-field text-xs py-1 px-2 w-40"
                            >
                              <option value="">Select...</option>
                              {allCompanies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                            </select>
                            <button onClick={() => setEditingCompanyAttendeeId(null)} className="text-gray-400 hover:text-gray-600 p-0.5">
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                              </svg>
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setEditingCompanyAttendeeId(attendee.id)}
                            className="text-xs text-gray-500 hover:text-procare-bright-blue hover:underline cursor-pointer"
                            title="Click to change company"
                          >
                            {company.name}
                          </button>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <ConferenceCountTooltip count={Number(attendee.conference_count)} names={attendee.conference_names} />
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
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
              colorMap={colorMaps.action || {}}
              userOptions={userOptions}
              hideCompany
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
              onEdit={async (meetingId, data) => {
                setCompanyMeetings(prev => prev.map(m => m.id === meetingId ? { ...m, ...data } : m));
                try {
                  const res = await fetch(`/api/meetings/${meetingId}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(data),
                  });
                  if (!res.ok) throw new Error();
                  toast.success('Meeting updated.');
                } catch {
                  fetchCompany();
                  toast.error('Failed to update meeting.');
                }
              }}
            />
          </div>

          {/* Follow Ups */}
          <div className="card p-0 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-base font-semibold text-procare-dark-blue font-serif">
                Follow Ups
                {companyFollowUps.length > 0 && (
                  <span className="ml-2 text-sm font-normal text-gray-500">
                    ({companyFollowUps.filter(f => !f.completed).length} pending)
                  </span>
                )}
              </h2>
              <button
                type="button"
                onClick={() => setShowAssignFollowUp(true)}
                className="btn-primary flex items-center gap-1.5 text-sm py-1.5"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Assign Follow Up
              </button>
            </div>
            <FollowUpsTable followUps={companyFollowUps} onToggle={handleToggleFollowUp} onDelete={handleDeleteFollowUp} userOptions={userOptions} onRepChange={handleRepChange} />
          </div>

          {/* Notes */}
          <NotesSection
            entityType="company"
            entityId={Number(id)}
            initialNotes={companyNotes}
            parentEntityId={company.child_companies && company.child_companies.length > 0 ? Number(id) : undefined}
            conferences={company.conferences || []}
            attendees={(company.attendees || []).map(a => ({ id: a.id, first_name: a.first_name, last_name: a.last_name, company_id: Number(id), company_name: company.name }))}
            currentCompanyName={company.name}
            currentCompanyId={Number(id)}
          />

        </div>{/* end left column */}

        {/* Right column — Status */}
        <div className="space-y-6">
          <div className="card">
            <h2 className="text-base font-semibold text-procare-dark-blue font-serif mb-1">Status</h2>
            <p className="text-xs text-gray-500 mb-3">Setting a company status will update all associated attendees.</p>
            <div className="flex flex-wrap gap-2">
              {statusOptions.map(val => {
                const activeStatuses = new Set((company.status || '').split(',').map(s => s.trim()).filter(Boolean));
                const isActive = activeStatuses.has(val);
                return (
                  <button
                    key={val}
                    onClick={() => handleStatus(val)}
                    className={`px-4 py-2 rounded-lg text-sm font-medium border-2 transition-all ${
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

          {/* Child / subsidiary companies */}
          {company.child_companies && company.child_companies.length > 0 && (
            <div className="card">
              <h2 className="text-base font-semibold text-procare-dark-blue font-serif mb-3">
                Communities ({company.child_companies.length})
              </h2>
              <div className="space-y-2">
                {company.child_companies.map(child => (
                  <Link
                    key={child.id}
                    href={`/companies/${child.id}`}
                    className="flex items-center justify-between p-3 rounded-lg border border-gray-100 hover:border-procare-bright-blue hover:bg-blue-50 transition-all"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-800 truncate">{child.name}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        {child.company_type && <span className="text-xs text-gray-500">{child.company_type}</span>}
                        <span className="text-xs text-gray-400">{child.attendee_count} attendees</span>
                      </div>
                    </div>
                    <svg className="w-4 h-4 text-gray-400 flex-shrink-0 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* Operator / Capital Relationships — shown when company type is Operator or Capital */}
          {company.company_type && (operatorTypeValues.has(company.company_type) || capitalTypeValues.has(company.company_type)) && (
            <div className="card">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-base font-semibold text-procare-dark-blue font-serif">
                  Operator / Capital Relationships
                </h2>
                <button
                  onClick={() => setShowRelateModal(true)}
                  className="text-xs text-procare-bright-blue hover:underline font-medium"
                >
                  + Add
                </button>
              </div>
              {!company.related_companies || company.related_companies.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-3">No related companies yet.</p>
              ) : (
                <div className="space-y-2">
                  {company.related_companies.map(rel => (
                    <div
                      key={rel.id}
                      className="flex items-center justify-between p-3 rounded-lg border border-gray-100 hover:border-procare-bright-blue hover:bg-blue-50 transition-all group"
                    >
                      <Link href={`/companies/${rel.id}`} className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-gray-800 truncate">{rel.name}</p>
                        {rel.company_type && (
                          <span className={`mt-1 ${getBadgeClass(rel.company_type, colorMaps.company_type || {})}`}>
                            {rel.company_type}
                          </span>
                        )}
                      </Link>
                      <div className="flex items-center gap-1 flex-shrink-0 ml-2">
                        <button
                          onClick={() => handleRemoveRelationship(rel.id)}
                          className="opacity-0 group-hover:opacity-100 p-1 text-gray-400 hover:text-red-500 transition-all"
                          title="Remove relationship"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                        <Link href={`/companies/${rel.id}`}>
                          <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                          </svg>
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Relate modal */}
              {showRelateModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
                  <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md mx-4">
                    <h3 className="text-lg font-semibold text-procare-dark-blue font-serif mb-4">
                      Add Related Company
                    </h3>
                    <input
                      type="text"
                      placeholder="Search companies..."
                      value={relateSearch}
                      onChange={(e) => setRelateSearch(e.target.value)}
                      className="input w-full mb-3"
                      autoFocus
                    />
                    <div className="max-h-60 overflow-y-auto space-y-1">
                      {relateResults.length === 0 && relateSearch.length >= 2 && (
                        <p className="text-sm text-gray-400 text-center py-3">No companies found.</p>
                      )}
                      {relateResults.map(c => (
                        <button
                          key={c.id}
                          onClick={() => handleAddRelationship(c.id)}
                          disabled={relateSaving}
                          className="w-full text-left px-3 py-2 rounded-lg hover:bg-blue-50 transition-colors flex items-center justify-between"
                        >
                          <div>
                            <p className="text-sm font-medium text-gray-800">{c.name}</p>
                            {c.company_type && (
                              <span className={`mt-0.5 ${getBadgeClass(c.company_type, colorMaps.company_type || {})}`}>
                                {c.company_type}
                              </span>
                            )}
                          </div>
                          <svg className="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                          </svg>
                        </button>
                      ))}
                    </div>
                    <div className="mt-4 flex justify-end">
                      <button
                        onClick={() => { setShowRelateModal(false); setRelateSearch(''); setRelateResults([]); }}
                        className="btn-secondary text-sm"
                      >
                        Close
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

      </div>{/* end grid */}

      <AssignFollowUpModal
        isOpen={showAssignFollowUp}
        onClose={() => setShowAssignFollowUp(false)}
        onSuccess={fetchCompany}
        defaultCompanyId={Number(id)}
      />
    </div>
  );
}
