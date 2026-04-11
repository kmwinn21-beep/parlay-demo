'use client';

import { useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { RepMultiSelect } from '@/components/RepMultiSelect';
import type { UserOption } from '@/lib/useUserOptions';
import { useHideBottomNav } from './BottomNavContext';

interface CompanyOption {
  id: number;
  name: string;
}

interface AttendeeOption {
  id: number;
  first_name: string;
  last_name: string;
  title?: string;
}

interface RelTypeOption {
  id: number;
  value: string;
}

interface NewRelationshipModalProps {
  isOpen: boolean;
  onClose: () => void;
}

function SearchableCompanySelect({
  options,
  value,
  onChange,
  placeholder,
}: {
  options: CompanyOption[];
  value: string;
  onChange: (val: string) => void;
  placeholder: string;
}) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const selected = options.find(o => String(o.id) === value);
  const filtered = options.filter(o =>
    o.name.toLowerCase().includes(query.toLowerCase())
  );

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery('');
      }
    }
    if (open) document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => { setOpen(o => !o); setQuery(''); }}
        className={`input-field w-full flex items-center justify-between gap-2 text-sm text-left ${selected ? 'text-gray-900' : 'text-gray-400'}`}
      >
        <span className="truncate">{selected ? selected.name : placeholder}</span>
        <svg className={`w-4 h-4 text-gray-400 flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg">
          <div className="p-2 border-b border-gray-100">
            <input
              autoFocus
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              className="w-full px-2 py-1.5 text-sm border border-gray-200 rounded-md outline-none focus:border-procare-bright-blue"
              placeholder="Search companies…"
            />
          </div>
          <div className="max-h-48 overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="px-3 py-2 text-sm text-gray-400">No matches</div>
            ) : (
              filtered.map(o => (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => { onChange(String(o.id)); setOpen(false); setQuery(''); }}
                  className={`w-full text-left px-3 py-2 text-sm hover:bg-blue-50 transition-colors ${String(o.id) === value ? 'bg-blue-50 text-procare-bright-blue font-medium' : 'text-gray-800'}`}
                >
                  {o.name}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function ContactMultiSelect({
  attendees,
  values,
  onChange,
  disabled,
}: {
  attendees: AttendeeOption[];
  values: number[];
  onChange: (values: number[]) => void;
  disabled?: boolean;
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

  useEffect(() => {
    if (disabled) setOpen(false);
  }, [disabled]);

  const toggleValue = (id: number) => {
    onChange(values.includes(id) ? values.filter(v => v !== id) : [...values, id]);
  };

  if (disabled) {
    return (
      <div className="input-field text-gray-400 text-sm cursor-not-allowed">
        Select a company first
      </div>
    );
  }

  return (
    <div ref={ref}>
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
              <div className="px-3 py-2 text-sm text-gray-500">No attendees found for this company.</div>
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

export function NewRelationshipModal({ isOpen, onClose }: NewRelationshipModalProps) {
  useHideBottomNav(isOpen);

  const [userOptions, setUserOptions] = useState<UserOption[]>([]);
  const [relTypeOptions, setRelTypeOptions] = useState<RelTypeOption[]>([]);
  const [allCompanies, setAllCompanies] = useState<CompanyOption[]>([]);
  const [companyAttendees, setCompanyAttendees] = useState<AttendeeOption[]>([]);

  const [formRepIds, setFormRepIds] = useState<number[]>([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState('');
  const [formContactIds, setFormContactIds] = useState<number[]>([]);
  const [formRelStatus, setFormRelStatus] = useState<number[]>([]);
  const [formDescription, setFormDescription] = useState('');

  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingAttendees, setIsLoadingAttendees] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Load config data on open
  useEffect(() => {
    if (!isOpen) return;

    // Reset form
    setFormRepIds([]);
    setSelectedCompanyId('');
    setFormContactIds([]);
    setFormRelStatus([]);
    setFormDescription('');
    setCompanyAttendees([]);

    setIsLoading(true);
    Promise.all([
      fetch('/api/config?category=user').then(r => r.json()),
      fetch('/api/config?category=rep_relationship_type').then(r => r.json()),
      fetch('/api/companies').then(r => r.json()),
    ]).then(([userData, relData, companyData]) => {
      setUserOptions(userData.map((o: { id: number; value: string }) => ({ id: Number(o.id), value: String(o.value) })));
      setRelTypeOptions(relData.map((o: { id: number; value: string }) => ({ id: Number(o.id), value: String(o.value) })));
      setAllCompanies(
        (companyData as CompanyOption[])
          .sort((a, b) => a.name.localeCompare(b.name))
      );
    }).catch(() => {
      toast.error('Failed to load form data.');
    }).finally(() => setIsLoading(false));
  }, [isOpen]);

  // Load company attendees when company changes
  const handleCompanyChange = async (compId: string) => {
    setSelectedCompanyId(compId);
    setFormContactIds([]);
    setCompanyAttendees([]);

    if (!compId) return;

    setIsLoadingAttendees(true);
    try {
      const compData = await fetch(`/api/companies/${compId}`).then(r => r.json());
      const attendees: AttendeeOption[] = (compData.attendees || []).map(
        (a: { id: number; first_name: string; last_name: string; title?: string }) => ({
          id: Number(a.id),
          first_name: String(a.first_name),
          last_name: String(a.last_name),
          title: a.title ? String(a.title) : undefined,
        })
      );
      setCompanyAttendees(attendees);
    } catch {
      toast.error('Failed to load company contacts.');
    } finally {
      setIsLoadingAttendees(false);
    }
  };

  const handleSubmit = async () => {
    if (!selectedCompanyId) {
      toast.error('Company is required.');
      return;
    }
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
          company_id: Number(selectedCompanyId),
          rep_ids: formRepIds.length > 0 ? formRepIds.join(',') : null,
          contact_ids: formContactIds.length > 0 ? formContactIds.join(',') : null,
          relationship_status: formRelStatus.join(','),
          description: formDescription.trim(),
        }),
      });
      if (!res.ok) throw new Error('Failed to create');
      toast.success('Internal relationship added.');
      onClose();
    } catch {
      toast.error('Failed to add internal relationship.');
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen) return null;

  const selectedCompany = allCompanies.find(c => String(c.id) === selectedCompanyId);

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-procare-bright-blue font-serif">
            Add New Internal Relationship
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin w-6 h-6 border-2 border-procare-bright-blue border-t-transparent rounded-full" />
          </div>
        ) : (
          <div className="p-6 space-y-4">
            {/* Rep */}
            <div>
              <label className="label">Rep</label>
              <RepMultiSelect
                options={userOptions}
                selectedIds={formRepIds}
                onChange={setFormRepIds}
                triggerClass="input-field w-full flex items-center justify-between gap-2 text-sm"
                placeholder="Select rep(s)..."
              />
            </div>

            {/* Company */}
            <div>
              <label className="label">Company *</label>
              <SearchableCompanySelect
                options={allCompanies}
                value={selectedCompanyId}
                onChange={handleCompanyChange}
                placeholder="Select company…"
              />
            </div>

            {/* Contact — dependent on Company */}
            <div>
              <label className="label">Contact</label>
              {isLoadingAttendees ? (
                <div className="input-field text-gray-400 text-sm">Loading contacts…</div>
              ) : (
                <ContactMultiSelect
                  attendees={companyAttendees}
                  values={formContactIds}
                  onChange={setFormContactIds}
                  disabled={!selectedCompanyId}
                />
              )}
            </div>

            {/* Relationship Status/Type */}
            <MultiSelectDropdownById
              label="Relationship Status/Type *"
              options={relTypeOptions}
              values={formRelStatus}
              onChange={setFormRelStatus}
              placeholder="Select status/type..."
            />

            {/* Description */}
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

            {/* Green form note */}
            <div className="rounded-lg bg-green-50 border border-green-200 px-4 py-3">
              <p className="text-xs text-green-800 leading-relaxed">
                <span className="font-semibold">Note:</span> This relationship will appear on the{' '}
                {selectedCompany ? (
                  <span className="font-medium">{selectedCompany.name}</span>
                ) : (
                  'selected company'
                )}
                {' '}company details page
                {formContactIds.length > 0 && ' and on each selected contact\u2019s attendee details page'}.
              </p>
            </div>

            {/* Actions */}
            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={handleSubmit}
                disabled={isSaving}
                className="btn-primary flex-1"
              >
                {isSaving ? 'Saving…' : 'Save Relationship'}
              </button>
              <button type="button" onClick={onClose} className="btn-secondary">
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
