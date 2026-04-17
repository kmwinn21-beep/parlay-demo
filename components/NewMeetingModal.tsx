'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import toast from 'react-hot-toast';
import { RepMultiSelect } from '@/components/RepMultiSelect';
import { type UserOption } from '@/lib/useUserOptions';
import { useHideBottomNav } from './BottomNavContext';
import { type Meeting } from '@/components/MeetingsTable';
import { useUser } from '@/components/UserContext';

interface ConferenceOption {
  id: number;
  name: string;
  start_date: string;
}

interface AttendeeOption {
  id: number;
  first_name: string;
  last_name: string;
  title: string | null;
  company_id: number | null;
  company_name: string | null;
}

interface CompanyOption {
  id: number;
  name: string;
}

interface NewMeetingModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Pre-select this company after a conference is chosen (auto-populates Company field) */
  prefillCompanyId?: number;
  /** Pre-select this attendee after a conference is chosen (auto-populates Contact field) */
  prefillAttendeeId?: number;
  /** Called with the newly created Meeting object for optimistic UI updates */
  onSuccess?: (meeting: Meeting) => void;
  /** When provided, restrict the conference dropdown to only these conferences (skips global fetch) */
  availableConferences?: Array<{ id: number; name: string; start_date: string }>;
}

export function NewMeetingModal({
  isOpen,
  onClose,
  prefillCompanyId,
  prefillAttendeeId,
  onSuccess,
  availableConferences,
}: NewMeetingModalProps) {
  useHideBottomNav(isOpen);
  const { user } = useUser();
  const [userOptions, setUserOptions] = useState<UserOption[]>([]);
  const [conferences, setConferences] = useState<ConferenceOption[]>([]);
  const [attendees, setAttendees] = useState<AttendeeOption[]>([]);
  const [loadingConference, setLoadingConference] = useState(false);

  const [selectedRepIds, setSelectedRepIds] = useState<number[]>([]);
  const [selectedConferenceId, setSelectedConferenceId] = useState('');
  const [selectedCompanyId, setSelectedCompanyId] = useState('');
  const [selectedAttendeeId, setSelectedAttendeeId] = useState('');
  const [meetingDate, setMeetingDate] = useState('');
  const [meetingTime, setMeetingTime] = useState('');
  const [location, setLocation] = useState('');
  const [additionalAttendees, setAdditionalAttendees] = useState('');
  const [companySearch, setCompanySearch] = useState('');
  const [showCompanyDropdown, setShowCompanyDropdown] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const companyDropdownRef = useRef<HTMLDivElement>(null);
  // Used to skip the "reset attendee on company change" effect when we set
  // the company programmatically from the prefill logic.
  const isPrefilling = useRef(false);

  // Fetch users and conferences on open; auto-select logged-in user as Rep
  useEffect(() => {
    if (!isOpen) return;
    if (user?.configId) {
      setSelectedRepIds([user.configId]);
    }
    fetch('/api/config?category=user&form=conference_detail')
      .then(r => r.json())
      .then((data: { id: number; value: string }[]) =>
        setUserOptions(data.map(d => ({ id: Number(d.id), value: String(d.value) })))
      )
      .catch(() => {});
    if (availableConferences) {
      setConferences(availableConferences);
    } else {
      fetch('/api/conferences')
        .then(r => r.json())
        .then((data: ConferenceOption[]) => setConferences(data))
        .catch(() => {});
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // Fetch conference attendees when conference changes; auto-populate company/contact if prefills are set
  useEffect(() => {
    if (!selectedConferenceId) {
      setAttendees([]);
      setSelectedCompanyId('');
      setCompanySearch('');
      setSelectedAttendeeId('');
      return;
    }
    setLoadingConference(true);
    setSelectedCompanyId('');
    setCompanySearch('');
    setSelectedAttendeeId('');
    fetch(`/api/conferences/${selectedConferenceId}`)
      .then(r => r.json())
      .then((data: { attendees: AttendeeOption[] }) => {
        const fetched = data.attendees || [];
        setAttendees(fetched);

        if (prefillCompanyId) {
          const hasCompany = fetched.some(a => a.company_id === prefillCompanyId);
          if (hasCompany) {
            // Signal the company-change effect to skip its reset so the attendee
            // we set here is preserved.
            isPrefilling.current = true;
            setSelectedCompanyId(String(prefillCompanyId));

            if (prefillAttendeeId) {
              const hasAttendee = fetched.some(
                a => a.id === prefillAttendeeId && a.company_id === prefillCompanyId
              );
              if (hasAttendee) {
                setSelectedAttendeeId(String(prefillAttendeeId));
              }
            }
          }
        }
      })
      .catch(() => setAttendees([]))
      .finally(() => setLoadingConference(false));
  }, [selectedConferenceId, prefillCompanyId, prefillAttendeeId]);

  // Reset contact when company changes — but skip if the change came from a prefill
  useEffect(() => {
    if (isPrefilling.current) {
      isPrefilling.current = false;
      return;
    }
    setSelectedAttendeeId('');
  }, [selectedCompanyId]);

  // Close company dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (companyDropdownRef.current && !companyDropdownRef.current.contains(e.target as Node)) {
        setShowCompanyDropdown(false);
      }
    }
    if (showCompanyDropdown) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showCompanyDropdown]);

  // Derive companies from attendees
  const companies = useMemo<CompanyOption[]>(() => {
    const map = new Map<number, string>();
    for (const a of attendees) {
      if (a.company_id && a.company_name) {
        map.set(a.company_id, a.company_name);
      }
    }
    return Array.from(map.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [attendees]);

  // Filter companies by search
  const filteredCompanies = useMemo(() => {
    if (!companySearch.trim()) return companies;
    const q = companySearch.toLowerCase();
    return companies.filter(c => c.name.toLowerCase().includes(q));
  }, [companies, companySearch]);

  // Contacts for selected company at selected conference
  const contacts = useMemo(() => {
    if (!selectedCompanyId) return [];
    const cid = Number(selectedCompanyId);
    return attendees
      .filter(a => a.company_id === cid)
      .sort((a, b) => `${a.last_name} ${a.first_name}`.localeCompare(`${b.last_name} ${b.first_name}`));
  }, [attendees, selectedCompanyId]);

  const selectedCompanyName = companies.find(c => c.id === Number(selectedCompanyId))?.name || '';

  function resetForm() {
    setSelectedRepIds([]);
    setSelectedConferenceId('');
    setSelectedCompanyId('');
    setSelectedAttendeeId('');
    setMeetingDate('');
    setMeetingTime('');
    setLocation('');
    setAdditionalAttendees('');
    setCompanySearch('');
    setShowCompanyDropdown(false);
    isPrefilling.current = false;
  }

  function handleClose() {
    resetForm();
    onClose();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedAttendeeId || !selectedConferenceId || !meetingDate || !meetingTime) {
      toast.error('Please fill in all required fields.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch('/api/meetings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          attendee_id: Number(selectedAttendeeId),
          conference_id: Number(selectedConferenceId),
          meeting_date: meetingDate,
          meeting_time: meetingTime,
          location: location || null,
          scheduled_by: selectedRepIds.length > 0 ? selectedRepIds.join(',') : null,
          additional_attendees: additionalAttendees || null,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to schedule meeting');
      }
      const created = await res.json();
      toast.success('Meeting scheduled successfully!');

      // Build a full Meeting object for optimistic UI updates in the parent
      if (onSuccess) {
        const contact = contacts.find(a => a.id === Number(selectedAttendeeId));
        const conf = conferences.find(c => c.id === Number(selectedConferenceId));
        const company = companies.find(c => c.id === Number(selectedCompanyId));
        onSuccess({
          id: Number(created.id),
          attendee_id: Number(selectedAttendeeId),
          conference_id: Number(selectedConferenceId),
          meeting_date: meetingDate,
          meeting_time: meetingTime,
          location: location || null,
          scheduled_by: selectedRepIds.length > 0 ? selectedRepIds.join(',') : null,
          additional_attendees: additionalAttendees || null,
          outcome: created.outcome || 'Meeting Scheduled',
          created_at: created.created_at || new Date().toISOString(),
          first_name: contact?.first_name || '',
          last_name: contact?.last_name || '',
          title: contact?.title || null,
          company_id: contact?.company_id || null,
          company_name: company?.name || null,
          company_wse: null,
          conference_name: conf?.name || '',
        });
      }

      handleClose();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to schedule meeting');
    } finally {
      setSubmitting(false);
    }
  }

  if (!isOpen) return null;

  const inputClass = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-procare-bright-blue focus:border-procare-bright-blue bg-white';
  const labelClass = 'block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={handleClose} />
      <div className="relative bg-white rounded-xl shadow-xl w-full max-w-lg mx-4 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 shrink-0">
          <h2 className="text-lg font-semibold text-procare-dark-blue font-serif">Schedule New Meeting</h2>
          <button type="button" onClick={handleClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="overflow-y-auto flex-1 min-h-0 px-6 py-4 space-y-4">
          {/* Rep — multiselect */}
          <div>
            <label className={labelClass}>Rep</label>
            <RepMultiSelect
              options={userOptions}
              selectedIds={selectedRepIds}
              onChange={setSelectedRepIds}
              triggerClass={`${inputClass} flex items-center justify-between gap-2`}
              placeholder="Select reps..."
            />
          </div>

          {/* Conference */}
          <div>
            <label className={labelClass}>Conference *</label>
            <select className={inputClass} value={selectedConferenceId} onChange={e => setSelectedConferenceId(e.target.value)} required>
              <option value="">Select conference...</option>
              {conferences.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          {/* Company (searchable dropdown) */}
          <div>
            <label className={labelClass}>Company *</label>
            <div className="relative" ref={companyDropdownRef}>
              <input
                type="text"
                className={inputClass}
                placeholder={selectedConferenceId ? (loadingConference ? 'Loading companies...' : 'Search companies...') : 'Select a conference first'}
                value={selectedCompanyId ? selectedCompanyName : companySearch}
                onChange={e => {
                  setCompanySearch(e.target.value);
                  setSelectedCompanyId('');
                  setShowCompanyDropdown(true);
                }}
                onFocus={() => { if (selectedConferenceId && !loadingConference) setShowCompanyDropdown(true); }}
                disabled={!selectedConferenceId || loadingConference}
              />
              {selectedCompanyId && (
                <button
                  type="button"
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  onClick={() => { setSelectedCompanyId(''); setCompanySearch(''); }}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
              {showCompanyDropdown && !selectedCompanyId && (
                <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                  {filteredCompanies.length === 0 ? (
                    <p className="text-sm text-gray-400 text-center py-3">No companies found</p>
                  ) : (
                    filteredCompanies.map(c => (
                      <button
                        key={c.id}
                        type="button"
                        className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50 transition-colors"
                        onClick={() => {
                          setSelectedCompanyId(String(c.id));
                          setCompanySearch('');
                          setShowCompanyDropdown(false);
                        }}
                      >
                        {c.name}
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Contact */}
          <div>
            <label className={labelClass}>Contact *</label>
            <select
              className={inputClass}
              value={selectedAttendeeId}
              onChange={e => setSelectedAttendeeId(e.target.value)}
              required
              disabled={!selectedCompanyId}
            >
              <option value="">{selectedCompanyId ? 'Select contact...' : 'Select a company first'}</option>
              {contacts.map(a => (
                <option key={a.id} value={a.id}>
                  {a.first_name} {a.last_name}{a.title ? ` — ${a.title}` : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Date and Time */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Date *</label>
              <input type="date" className={inputClass} value={meetingDate} onChange={e => setMeetingDate(e.target.value)} required />
            </div>
            <div>
              <label className={labelClass}>Time *</label>
              <input type="time" className={inputClass} value={meetingTime} onChange={e => setMeetingTime(e.target.value)} required />
            </div>
          </div>

          {/* Location */}
          <div>
            <label className={labelClass}>Location</label>
            <input type="text" className={inputClass} value={location} onChange={e => setLocation(e.target.value)} placeholder="e.g. Room 201, Lobby Bar" />
          </div>

          {/* Additional Attendees */}
          <div>
            <label className={labelClass}>Additional Attendees</label>
            <input type="text" className={inputClass} value={additionalAttendees} onChange={e => setAdditionalAttendees(e.target.value)} placeholder="Comma-separated names" />
          </div>
        </form>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200 shrink-0">
          <button
            type="button"
            onClick={handleClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            onClick={handleSubmit}
            disabled={submitting || !selectedAttendeeId || !selectedConferenceId || !meetingDate || !meetingTime}
            className="px-4 py-2 text-sm font-semibold text-white bg-procare-bright-blue rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? 'Scheduling...' : 'Schedule Meeting'}
          </button>
        </div>
      </div>
    </div>
  );
}
