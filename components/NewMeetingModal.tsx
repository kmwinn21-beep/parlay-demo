'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import toast from 'react-hot-toast';

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
}

export function NewMeetingModal({ isOpen, onClose }: NewMeetingModalProps) {
  const [userOptions, setUserOptions] = useState<string[]>([]);
  const [conferences, setConferences] = useState<ConferenceOption[]>([]);
  const [attendees, setAttendees] = useState<AttendeeOption[]>([]);
  const [loadingConference, setLoadingConference] = useState(false);

  const [selectedRep, setSelectedRep] = useState('');
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

  // Fetch users and conferences on open
  useEffect(() => {
    if (!isOpen) return;
    fetch('/api/config?category=user')
      .then(r => r.json())
      .then((data: { value: string }[]) => setUserOptions(data.map(d => d.value)))
      .catch(() => {});
    fetch('/api/conferences')
      .then(r => r.json())
      .then((data: ConferenceOption[]) => setConferences(data))
      .catch(() => {});
  }, [isOpen]);

  // Fetch conference attendees when conference changes
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
        setAttendees(data.attendees || []);
      })
      .catch(() => setAttendees([]))
      .finally(() => setLoadingConference(false));
  }, [selectedConferenceId]);

  // Reset contact when company changes
  useEffect(() => {
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
    setSelectedRep('');
    setSelectedConferenceId('');
    setSelectedCompanyId('');
    setSelectedAttendeeId('');
    setMeetingDate('');
    setMeetingTime('');
    setLocation('');
    setAdditionalAttendees('');
    setCompanySearch('');
    setShowCompanyDropdown(false);
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
          scheduled_by: selectedRep || null,
          additional_attendees: additionalAttendees || null,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to schedule meeting');
      }
      toast.success('Meeting scheduled successfully!');
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
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-procare-dark-blue font-serif">Schedule New Meeting</h2>
          <button type="button" onClick={handleClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="overflow-y-auto flex-1 px-6 py-4 space-y-4">
          {/* Rep */}
          <div>
            <label className={labelClass}>Rep</label>
            <select className={inputClass} value={selectedRep} onChange={e => setSelectedRep(e.target.value)}>
              <option value="">Select rep...</option>
              {userOptions.map(u => <option key={u} value={u}>{u}</option>)}
            </select>
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
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200">
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
