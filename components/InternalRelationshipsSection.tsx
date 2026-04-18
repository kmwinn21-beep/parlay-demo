'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import toast from 'react-hot-toast';
import { RepMultiSelect } from './RepMultiSelect';
import type { UserOption } from '@/lib/useUserOptions';
import { getRepInitials } from '@/lib/useUserOptions';
import { getBadgeClass, getPreset } from '@/lib/colors';
import { useConfigColors } from '@/lib/useConfigColors';

interface InternalRelationship {
  id: number;
  company_id: number;
  rep_ids: string | null;
  contact_ids: string | null;
  relationship_status: string;
  description: string;
  created_at: string;
}

interface RelTypeOption {
  id: number;
  value: string;
}

interface AttendeeOption {
  id: number;
  first_name: string;
  last_name: string;
  title?: string;
}

/** Name/title display for contacts on relationship cards */
function ContactInitialsDisplay({ firstName, lastName, title }: { firstName: string; lastName: string; title?: string }) {
  return (
    <div className="min-w-0">
      <span className="text-sm font-medium text-gray-800 leading-tight block">{firstName} {lastName}</span>
      {title && <span className="text-xs text-gray-500 leading-tight block">{title}</span>}
    </div>
  );
}

/** User pill with admin-configured color */
function RepPill({ name }: { name: string }) {
  const colorMaps = useConfigColors();
  const initials = getRepInitials(name);
  const colorClass = getPreset(colorMaps.user?.[name]).badgeClass;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${colorClass}`}>
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3 h-3 flex-shrink-0">
        <path d="M10 8a3 3 0 100-6 3 3 0 000 6zM3.465 14.493a1.23 1.23 0 00.41 1.412A9.957 9.957 0 0010 18c2.31 0 4.438-.784 6.131-2.1.43-.333.604-.903.408-1.41a7.002 7.002 0 00-13.074.003z" />
      </svg>
      {initials}
    </span>
  );
}

interface InternalRelationshipsSectionProps {
  companyId: number;
  companyName?: string;
  attendeeId?: number; // If set, we're in attendee detail context
  userOptions: UserOption[];
  attendees?: AttendeeOption[]; // Company attendees for the Contact dropdown
  relTypeOptions: RelTypeOption[];
  relationships: InternalRelationship[];
  onRefresh: () => void;
}

function MultiSelectDropdownById({
  label,
  options,
  values,
  onChange,
  placeholder = 'Select options...',
}: {
  label: string;
  options: { id: number; value: string }[];
  values: number[];
  onChange: (values: number[]) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  const toggleValue = (id: number) => {
    onChange(values.includes(id) ? values.filter(v => v !== id) : [...values, id]);
  };

  const selectedLabels = values.map(v => options.find(o => o.id === v)?.value).filter(Boolean);

  return (
    <div ref={ref}>
      <label className="label">{label}</label>
      <div className="relative">
        <button type="button" onClick={() => setOpen(v => !v)} className="input-field w-full text-left flex items-center justify-between">
          <span className={values.length === 0 ? 'text-gray-400' : 'text-gray-800'}>
            {values.length === 0 ? placeholder : `${values.length} selected`}
          </span>
          <svg className={`w-4 h-4 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        {open && (
          <div className="absolute z-30 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-56 overflow-y-auto">
            {options.length === 0 ? (
              <div className="px-3 py-2 text-sm text-gray-500">No options available.</div>
            ) : options.map(option => {
              const checked = values.includes(option.id);
              return (
                <button key={option.id} type="button" onClick={() => toggleValue(option.id)}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 flex items-center gap-2">
                  <span className={`w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center ${checked ? 'bg-procare-bright-blue border-procare-bright-blue' : 'border-gray-300'}`}>
                    {checked && <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
                  </span>
                  {option.value}
                </button>
              );
            })}
          </div>
        )}
      </div>
      {selectedLabels.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-2">
          {values.map(v => {
            const label = options.find(o => o.id === v)?.value;
            if (!label) return null;
            return (
              <span key={v} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-blue-50 text-procare-bright-blue border border-blue-200">
                {label}
                <button type="button" onClick={() => onChange(values.filter(val => val !== v))} className="hover:text-red-500">
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}

function AttendeeMultiSelect({
  attendees,
  values,
  onChange,
}: {
  attendees: AttendeeOption[];
  values: number[];
  onChange: (values: number[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  const toggleValue = (id: number) => {
    onChange(values.includes(id) ? values.filter(v => v !== id) : [...values, id]);
  };

  return (
    <div ref={ref}>
      <label className="label">Contact</label>
      <div className="relative">
        <button type="button" onClick={() => setOpen(v => !v)} className="input-field w-full text-left flex items-center justify-between">
          <span className={values.length === 0 ? 'text-gray-400' : 'text-gray-800'}>
            {values.length === 0 ? 'Select contacts...' : `${values.length} selected`}
          </span>
          <svg className={`w-4 h-4 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        {open && (
          <div className="absolute z-30 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-56 overflow-y-auto">
            {attendees.length === 0 ? (
              <div className="px-3 py-2 text-sm text-gray-500">No attendees associated with this company.</div>
            ) : attendees.map(att => {
              const checked = values.includes(att.id);
              return (
                <button key={att.id} type="button" onClick={() => toggleValue(att.id)}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 flex items-center gap-2">
                  <span className={`w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center ${checked ? 'bg-procare-bright-blue border-procare-bright-blue' : 'border-gray-300'}`}>
                    {checked && <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
                  </span>
                  {att.first_name} {att.last_name}
                </button>
              );
            })}
          </div>
        )}
      </div>
      {values.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-2">
          {values.map(v => {
            const att = attendees.find(a => a.id === v);
            if (!att) return null;
            return (
              <span key={v} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-blue-50 text-procare-bright-blue border border-blue-200">
                {att.first_name} {att.last_name}
                <button type="button" onClick={() => onChange(values.filter(val => val !== v))} className="hover:text-red-500">
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}

function RelationshipCard({
  rel,
  userOptions,
  attendeeDetailMap,
  relTypeOptions,
  onDelete,
}: {
  rel: InternalRelationship;
  userOptions: UserOption[];
  attendeeDetailMap: Map<number, AttendeeOption>;
  relTypeOptions: RelTypeOption[];
  onDelete: (id: number) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const colorMaps = useConfigColors();

  const reps = rel.rep_ids
    ? rel.rep_ids.split(',').map(id => {
        const user = userOptions.find(u => u.id === Number(id.trim()));
        return user?.value || null;
      }).filter(Boolean) as string[]
    : [];

  const contacts = rel.contact_ids
    ? rel.contact_ids.split(',').map(id => {
        return attendeeDetailMap.get(Number(id.trim())) || null;
      }).filter(Boolean) as AttendeeOption[]
    : [];

  const statusNames = rel.relationship_status
    ? rel.relationship_status.split(',').map(id => {
        const opt = relTypeOptions.find(o => o.id === Number(id.trim()));
        return opt?.value || id.trim();
      }).filter(Boolean)
    : [];

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      {/* Collapsed header — always visible */}
      <button
        onClick={() => setExpanded(v => !v)}
        className="w-full p-3 hover:bg-gray-50 transition-colors text-left"
      >
        {/* Top row: Contact name/title + expand chevron */}
        <div className="flex items-start justify-between">
          <div className="min-w-0 flex-1">
            {contacts.length > 0 ? (
              <div className="flex flex-col gap-1.5">
                {contacts.map(att => (
                  <ContactInitialsDisplay
                    key={att.id}
                    firstName={att.first_name}
                    lastName={att.last_name}
                    title={att.title}
                  />
                ))}
              </div>
            ) : (
              <span className="text-sm text-gray-400">No contact</span>
            )}
          </div>
          <svg className={`w-4 h-4 text-gray-400 transition-transform flex-shrink-0 ml-2 ${expanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>

        {/* Bottom row: User pills */}
        {reps.length > 0 && (
          <div className="flex flex-wrap items-center gap-1 mt-2">
            {reps.map((name, i) => (
              <RepPill key={i} name={name} />
            ))}
          </div>
        )}
      </button>

      {/* Expanded content — relationship status pills + notes */}
      {expanded && (
        <div className="px-3 pb-3 border-t border-gray-100">
          {statusNames.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {statusNames.map((s, i) => (
                <span key={i} className={getBadgeClass(s, colorMaps.rep_relationship_type || {})}>
                  {s}
                </span>
              ))}
            </div>
          )}
          <p className="text-sm text-gray-700 mt-2 whitespace-pre-wrap">{rel.description}</p>
          <div className="mt-2 flex justify-end">
            <button
              onClick={() => { if (confirm('Remove this internal relationship?')) onDelete(rel.id); }}
              className="text-xs text-red-500 hover:underline"
            >
              Remove
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function InternalRelationshipsSection({
  companyId,
  companyName,
  attendeeId,
  userOptions,
  attendees = [],
  relTypeOptions,
  relationships,
  onRefresh,
}: InternalRelationshipsSectionProps) {
  const [sectionExpanded, setSectionExpanded] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Form state - full form (company context)
  const [formRepIds, setFormRepIds] = useState<number[]>([]);
  const [formContactIds, setFormContactIds] = useState<number[]>([]);
  const [formRelStatus, setFormRelStatus] = useState<number[]>([]);
  const [formDescription, setFormDescription] = useState('');

  const isAttendeeContext = !!attendeeId;

  // Build attendee detail map from passed attendees
  const [attendeeDetailMap, setAttendeeDetailMap] = useState<Map<number, AttendeeOption>>(new Map());

  // Collect all contact IDs from relationships that need resolving
  useEffect(() => {
    const map = new Map<number, AttendeeOption>();
    for (const att of attendees) {
      map.set(att.id, att);
    }

    // Find contact IDs that aren't in our map yet
    const missingIds: number[] = [];
    for (const rel of relationships) {
      if (!rel.contact_ids) continue;
      for (const idStr of rel.contact_ids.split(',')) {
        const numId = Number(idStr.trim());
        if (numId && !map.has(numId)) missingIds.push(numId);
      }
    }

    if (missingIds.length === 0) {
      setAttendeeDetailMap(map);
      return;
    }

    // Fetch missing attendee details
    const uniqueIds = Array.from(new Set(missingIds));
    Promise.all(
      uniqueIds.map(aid =>
        fetch(`/api/attendees/${aid}`).then(r => r.ok ? r.json() : null).catch(() => null)
      )
    ).then(results => {
      for (const data of results) {
        if (data?.id) {
          map.set(data.id, { id: data.id, first_name: data.first_name, last_name: data.last_name, title: data.title || undefined });
        }
      }
      setAttendeeDetailMap(new Map(map));
    });
  }, [attendees, relationships]);

  const resetForm = () => {
    setFormRepIds([]);
    setFormContactIds([]);
    setFormRelStatus([]);
    setFormDescription('');
    setShowForm(false);
  };

  const handleSubmit = async () => {
    if (formRelStatus.length === 0) {
      toast.error('Relationship Status/Type is required.');
      return;
    }
    if (!formDescription.trim()) {
      toast.error('Describe Relationship is required.');
      return;
    }

    setIsSaving(true);
    try {
      const res = await fetch('/api/internal-relationships', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          company_id: companyId,
          rep_ids: formRepIds.length > 0 ? formRepIds.join(',') : null,
          contact_ids: isAttendeeContext
            ? String(attendeeId)
            : formContactIds.length > 0 ? formContactIds.join(',') : null,
          relationship_status: formRelStatus.join(','),
          description: formDescription.trim(),
        }),
      });
      if (!res.ok) throw new Error('Failed to create');
      toast.success('Internal relationship added.');
      resetForm();
      onRefresh();
    } catch {
      toast.error('Failed to add internal relationship.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      const res = await fetch(`/api/internal-relationships?id=${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error();
      toast.success('Internal relationship removed.');
      onRefresh();
    } catch {
      toast.error('Failed to remove relationship.');
    }
  };

  return (
    <div className="card">
      <div className="flex items-center justify-between">
        <button
          onClick={() => setSectionExpanded(v => !v)}
          className="flex items-center gap-2"
        >
          <svg className={`w-4 h-4 text-gray-400 transition-transform ${sectionExpanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
          <h2 className="text-base font-semibold text-procare-dark-blue font-serif">
            Internal Relationships ({relationships.length})
          </h2>
        </button>
        {sectionExpanded && (
          <button
            onClick={() => setShowForm(true)}
            className="text-xs text-procare-bright-blue hover:underline font-medium"
          >
            + Add
          </button>
        )}
      </div>

      {sectionExpanded && (
        <div className="mt-3">
          {/* Add Form */}
          {showForm && (
            <div className="mb-4 p-4 border border-blue-200 rounded-lg bg-blue-50/50 space-y-3">
              {/* Rep multiselect always shown */}
              <div>
                <label className="label">Rep</label>
                <RepMultiSelect
                  options={userOptions}
                  selectedIds={formRepIds}
                  onChange={setFormRepIds}
                  placeholder="Select rep(s)..."
                />
              </div>
              {!isAttendeeContext && (
                <AttendeeMultiSelect
                  attendees={attendees}
                  values={formContactIds}
                  onChange={setFormContactIds}
                />
              )}
              <MultiSelectDropdownById
                label="Relationship Status/Type *"
                options={relTypeOptions}
                values={formRelStatus}
                onChange={setFormRelStatus}
                placeholder="Select status/type..."
              />
              <div>
                <label className="label">Describe Relationship *</label>
                <textarea
                  value={formDescription}
                  onChange={e => setFormDescription(e.target.value)}
                  className="input-field w-full"
                  rows={3}
                  placeholder="Briefly describe the relationship..."
                />
              </div>
              <div className="flex justify-end gap-2">
                <button onClick={resetForm} className="btn-secondary text-sm">Cancel</button>
                <button onClick={handleSubmit} disabled={isSaving} className="btn-primary text-sm">
                  {isSaving ? 'Saving...' : 'Save'}
                </button>
              </div>
            </div>
          )}

          {/* Relationship Cards */}
          {relationships.length === 0 && !showForm ? (
            <p className="text-sm text-gray-400 text-center py-3">No internal relationships yet.</p>
          ) : (
            <div className="space-y-2">
              {relationships.map(rel => (
                <RelationshipCard
                  key={rel.id}
                  rel={rel}
                  userOptions={userOptions}
                  attendeeDetailMap={attendeeDetailMap}
                  relTypeOptions={relTypeOptions}
                  onDelete={handleDelete}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Standalone modal for adding relationships from tables
export function InternalRelationshipModal({
  isOpen,
  onClose,
  onSuccess,
  entityType,
  entityIds,
  entityNames,
}: {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  entityType: 'company' | 'attendee';
  entityIds: number[];
  entityNames: Map<number, string>;
}) {
  const [userOptions, setUserOptions] = useState<UserOption[]>([]);
  const [relTypeOptions, setRelTypeOptions] = useState<RelTypeOption[]>([]);
  const [attendeesByCompany, setAttendeesByCompany] = useState<Map<number, AttendeeOption[]>>(new Map());
  const [companyNames, setCompanyNames] = useState<Map<number, string>>(new Map());
  const [companyIdsByAttendee, setCompanyIdsByAttendee] = useState<Map<number, number>>(new Map());
  const [isLoading, setIsLoading] = useState(true);

  const [formRepIds, setFormRepIds] = useState<number[]>([]);
  const [formContactIds, setFormContactIds] = useState<number[]>([]);
  const [formRelStatus, setFormRelStatus] = useState<number[]>([]);
  const [formDescription, setFormDescription] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setIsLoading(true);
    Promise.all([
      fetch('/api/config?category=user&form=relationships_page').then(r => r.json()),
      fetch('/api/config?category=rep_relationship_type&form=relationships_page').then(r => r.json()),
      ...(entityType === 'company'
        ? entityIds.map(id => fetch(`/api/companies/${id}`).then(r => r.json()))
        : entityIds.map(id => fetch(`/api/attendees/${id}`).then(r => r.json()))
      ),
    ]).then(([userData, relData, ...entityData]) => {
      setUserOptions(userData.map((o: { id: number; value: string }) => ({ id: Number(o.id), value: String(o.value) })));
      setRelTypeOptions(relData.map((o: { id: number; value: string }) => ({ id: Number(o.id), value: String(o.value) })));

      if (entityType === 'company') {
        const byCompany = new Map<number, AttendeeOption[]>();
        for (const data of entityData) {
          if (data?.id && data?.attendees) {
            byCompany.set(data.id, data.attendees.map((a: { id: number; first_name: string; last_name: string }) => ({
              id: a.id, first_name: a.first_name, last_name: a.last_name,
            })));
          }
        }
        setAttendeesByCompany(byCompany);
      } else {
        // Attendee context - map attendee to company
        const compMap = new Map<number, number>();
        const cNames = new Map<number, string>();
        for (const data of entityData) {
          if (data?.company_id) {
            compMap.set(data.id, data.company_id);
            if (data.company_name) cNames.set(data.company_id, data.company_name);
          }
        }
        setCompanyIdsByAttendee(compMap);
        setCompanyNames(cNames);
      }
    }).catch(() => {
      toast.error('Failed to load data.');
    }).finally(() => setIsLoading(false));
  }, [isOpen, entityType, entityIds]);

  const resetForm = () => {
    setFormRepIds([]);
    setFormContactIds([]);
    setFormRelStatus([]);
    setFormDescription('');
  };

  const handleSubmit = async () => {
    if (formRelStatus.length === 0) {
      toast.error('Relationship Status/Type is required.');
      return;
    }
    if (!formDescription.trim()) {
      toast.error('Describe Relationship is required.');
      return;
    }

    setIsSaving(true);
    try {
      if (entityType === 'company') {
        // Create one relationship per selected company
        for (const companyId of entityIds) {
          await fetch('/api/internal-relationships', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              company_id: companyId,
              rep_ids: formRepIds.length > 0 ? formRepIds.join(',') : null,
              contact_ids: formContactIds.length > 0 ? formContactIds.join(',') : null,
              relationship_status: formRelStatus.join(','),
              description: formDescription.trim(),
            }),
          });
        }
      } else {
        // Attendee context - create relationship for each attendee's company
        for (const attendeeId of entityIds) {
          const companyId = companyIdsByAttendee.get(attendeeId);
          if (!companyId) continue;
          await fetch('/api/internal-relationships', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              company_id: companyId,
              rep_ids: formRepIds.length > 0 ? formRepIds.join(',') : null,
              contact_ids: String(attendeeId),
              relationship_status: formRelStatus.join(','),
              description: formDescription.trim(),
            }),
          });
        }
      }
      toast.success('Internal relationship(s) added.');
      resetForm();
      onSuccess();
      onClose();
    } catch {
      toast.error('Failed to add internal relationship.');
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen) return null;

  // Merge all attendees from all selected companies for the Contact dropdown
  const allAttendees: AttendeeOption[] = [];
  attendeesByCompany.forEach(atts => atts.forEach(a => allAttendees.push(a)));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl border border-procare-gold p-6 w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <h3 className="text-lg font-semibold text-procare-dark-blue font-serif mb-1">
          Add Rep Relationship
        </h3>
        <p className="text-xs text-gray-500 mb-4">
          {entityType === 'company'
            ? `For ${entityIds.length} selected company/companies`
            : `For ${entityIds.length} selected attendee(s)`}
        </p>

        {isLoading ? (
          <div className="flex justify-center py-8">
            <div className="animate-spin w-6 h-6 border-2 border-procare-bright-blue border-t-transparent rounded-full" />
          </div>
        ) : (
          <div className="space-y-3">
            {/* Rep multiselect always shown */}
            <div>
              <label className="label">Rep</label>
              <RepMultiSelect
                options={userOptions}
                selectedIds={formRepIds}
                onChange={setFormRepIds}
                placeholder="Select rep(s)..."
              />
            </div>
            {entityType === 'company' && (
              <AttendeeMultiSelect
                attendees={allAttendees}
                values={formContactIds}
                onChange={setFormContactIds}
              />
            )}
            <MultiSelectDropdownById
              label="Relationship Status/Type *"
              options={relTypeOptions}
              values={formRelStatus}
              onChange={setFormRelStatus}
              placeholder="Select status/type..."
            />
            <div>
              <label className="label">Describe Relationship *</label>
              <textarea
                value={formDescription}
                onChange={e => setFormDescription(e.target.value)}
                className="input-field w-full"
                rows={3}
                placeholder="Briefly describe the relationship..."
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => { resetForm(); onClose(); }} className="btn-secondary text-sm">Cancel</button>
              <button onClick={handleSubmit} disabled={isSaving} className="btn-primary text-sm">
                {isSaving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
