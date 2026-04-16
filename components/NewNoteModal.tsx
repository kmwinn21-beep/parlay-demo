'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import toast from 'react-hot-toast';
import { useHideBottomNav } from './BottomNavContext';
import { useUser } from '@/components/UserContext';
import { RepMultiSelect } from '@/components/RepMultiSelect';
import { MentionTextarea } from '@/components/MentionTextarea';
import { useUserOptions } from '@/lib/useUserOptions';

interface ConferenceOption {
  id: number;
  name: string;
}

interface CompanyOption {
  id: number;
  name: string;
}

interface AttendeeOption {
  id: number;
  first_name: string;
  last_name: string;
  title: string | null;
  company_id: number | null;
  company_name: string | null;
}

interface NewNoteModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function NewNoteModal({ isOpen, onClose }: NewNoteModalProps) {
  useHideBottomNav(isOpen);
  const userOptionsWithIds = useUserOptions();
  const [conferences, setConferences] = useState<ConferenceOption[]>([]);
  const [allCompanies, setAllCompanies] = useState<CompanyOption[]>([]);
  const [conferenceAttendees, setConferenceAttendees] = useState<AttendeeOption[]>([]);
  const [allAttendees, setAllAttendees] = useState<AttendeeOption[]>([]);
  const [loadingConference, setLoadingConference] = useState(false);

  const [taggedUserIds, setTaggedUserIds] = useState<number[]>([]);
  const [selectedConferenceId, setSelectedConferenceId] = useState('');
  const [selectedCompanyId, setSelectedCompanyId] = useState('');
  const [selectedAttendeeId, setSelectedAttendeeId] = useState('');
  const [noteText, setNoteText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [pinOnSubmit, setPinOnSubmit] = useState(false);
  const [companySearch, setCompanySearch] = useState('');
  const { user } = useUser();
  const [showCompanyDropdown, setShowCompanyDropdown] = useState(false);

  const companyDropdownRef = useRef<HTMLDivElement>(null);

  // Fetch conferences, all companies, all attendees on open
  useEffect(() => {
    if (!isOpen) return;
    fetch('/api/conferences')
      .then(r => r.json())
      .then((data: ConferenceOption[]) => setConferences(data))
      .catch(() => {});
    fetch('/api/companies')
      .then(r => r.json())
      .then((data: CompanyOption[]) => setAllCompanies(data))
      .catch(() => {});
    fetch('/api/attendees')
      .then(r => r.json())
      .then((data: AttendeeOption[]) => setAllAttendees(data))
      .catch(() => {});
  }, [isOpen]);

  // Fetch conference attendees when conference changes
  useEffect(() => {
    if (!selectedConferenceId) {
      setConferenceAttendees([]);
      setSelectedAttendeeId('');
      return;
    }
    setLoadingConference(true);
    setSelectedAttendeeId('');
    fetch(`/api/conferences/${selectedConferenceId}`)
      .then(r => r.json())
      .then((data: { attendees: AttendeeOption[] }) => {
        const attendees = data.attendees || [];
        setConferenceAttendees(attendees);
        if (selectedCompanyId) {
          const conferenceCompanyIds = new Set(
            attendees.map(a => a.company_id).filter((id): id is number => id !== null)
          );
          if (!conferenceCompanyIds.has(Number(selectedCompanyId))) {
            setSelectedCompanyId('');
            setCompanySearch('');
          }
        }
      })
      .catch(() => setConferenceAttendees([]))
      .finally(() => setLoadingConference(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedConferenceId]);

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

  const companies = useMemo(() => {
    if (!selectedConferenceId || conferenceAttendees.length === 0) return allCompanies;
    const conferenceCompanyIds = new Set(
      conferenceAttendees.map(a => a.company_id).filter((id): id is number => id !== null)
    );
    return allCompanies.filter(c => conferenceCompanyIds.has(c.id));
  }, [selectedConferenceId, conferenceAttendees, allCompanies]);

  const filteredCompanies = useMemo(() => {
    if (!companySearch.trim()) return companies;
    const q = companySearch.toLowerCase();
    return companies.filter(c => c.name.toLowerCase().includes(q));
  }, [companies, companySearch]);

  const selectedCompanyName = allCompanies.find(c => c.id === Number(selectedCompanyId))?.name || '';

  const currentAttendees = selectedConferenceId ? conferenceAttendees : allAttendees;

  const filteredAttendees = useMemo(() => {
    if (!selectedCompanyId) return currentAttendees;
    return currentAttendees.filter(a => String(a.company_id) === selectedCompanyId);
  }, [currentAttendees, selectedCompanyId]);

  const hasRequiredSelection = selectedConferenceId || selectedCompanyId || selectedAttendeeId;
  const canSubmit = noteText.trim() && hasRequiredSelection && !submitting;

  function resetForm() {
    setTaggedUserIds([]);
    setSelectedConferenceId('');
    setSelectedCompanyId('');
    setSelectedAttendeeId('');
    setNoteText('');
    setPinOnSubmit(false);
    setCompanySearch('');
    setShowCompanyDropdown(false);
  }

  function handleClose() {
    resetForm();
    onClose();
  }

  // When @mention resolves in textarea, add to tagged users
  function handleMentionAdd(configId: number) {
    setTaggedUserIds(prev => prev.includes(configId) ? prev : [...prev, configId]);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!noteText.trim()) { toast.error('Note cannot be empty.'); return; }
    if (!hasRequiredSelection) { toast.error('Please select at least one of Conference, Company, or Attendee.'); return; }

    setSubmitting(true);
    const content = noteText.trim();
    // Auto-detect rep from logged-in user
    const repValue = user?.displayName || null;
    const taggedUsersStr = taggedUserIds.length > 0 ? taggedUserIds.join(',') : null;

    try {
      const selConf = conferences.find(c => String(c.id) === selectedConferenceId);
      const selCompany = companies.find(c => String(c.id) === selectedCompanyId);
      const selAttendee = filteredAttendees.find(a => String(a.id) === selectedAttendeeId);

      const attendeeLabel = selAttendee ? `${selAttendee.first_name} ${selAttendee.last_name}` : '';
      const companyLabel = selCompany ? selCompany.name : (selAttendee?.company_name || '');
      const conferenceName = selConf ? selConf.name : 'General Note';

      const notifyFor = selAttendee ? 'attendee' : selCompany ? 'company' : selConf ? 'conference' : null;

      const notePromises: Promise<unknown>[] = [];

      if (selConf) {
        notePromises.push(
          fetch('/api/notes', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              entity_type: 'conference',
              entity_id: selConf.id,
              content,
              conference_name: conferenceName,
              rep: repValue,
              attendee_name: attendeeLabel || null,
              company_name: companyLabel || null,
              skip_notification: notifyFor !== 'conference',
              tagged_users: taggedUsersStr,
            }),
          })
        );
      }

      if (selCompany) {
        notePromises.push(
          fetch('/api/notes', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              entity_type: 'company',
              entity_id: selCompany.id,
              content,
              conference_name: conferenceName,
              rep: repValue,
              attendee_name: attendeeLabel || null,
              company_name: companyLabel || null,
              skip_notification: notifyFor !== 'company',
              tagged_users: notifyFor === 'company' ? taggedUsersStr : null,
            }),
          })
        );
      }

      if (selAttendee) {
        notePromises.push(
          fetch('/api/notes', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              entity_type: 'attendee',
              entity_id: selAttendee.id,
              content,
              conference_name: conferenceName,
              rep: repValue,
              attendee_name: attendeeLabel || null,
              company_name: companyLabel || null,
              skip_notification: notifyFor !== 'attendee',
              tagged_users: notifyFor === 'attendee' ? taggedUsersStr : null,
            }),
          })
        );
      }

      const results = await Promise.all(notePromises);
      const allOk = results.every(r => (r as Response).ok);
      if (!allOk) throw new Error('Failed to save note');

      if (pinOnSubmit && user?.email) {
        try {
          const noteResponses = await Promise.all(
            results.map(r => (r as Response).clone().json())
          );
          for (const noteData of noteResponses) {
            if (noteData.entity_type === 'company' || noteData.entity_type === 'attendee') {
              await fetch('/api/pinned-notes', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  note_id: noteData.id,
                  entity_type: noteData.entity_type,
                  entity_id: noteData.entity_id,
                  pinned_by: user.email,
                  conference_name: conferenceName !== 'General Note' ? conferenceName : null,
                  attendee_name: noteData.entity_type === 'company' && selAttendee ? attendeeLabel : null,
                  attendee_id: noteData.entity_type === 'company' && selAttendee ? selAttendee.id : null,
                }),
              });
            }
          }
        } catch { /* non-fatal */ }
      }

      toast.success('Note saved.');
      handleClose();
    } catch {
      toast.error('Failed to save note.');
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
          <h2 className="text-lg font-semibold text-procare-dark-blue font-serif">Add New Note</h2>
          <button type="button" onClick={handleClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="overflow-y-auto flex-1 px-6 py-4 space-y-4">
          {/* Entered by indicator (auto-detected, read-only) */}
          {user?.displayName && (
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <span className="font-semibold text-gray-600 uppercase tracking-wide">Entered By:</span>
              <span className="font-medium text-procare-dark-blue">{user.displayName}</span>
            </div>
          )}

          {/* Tag User multiselect */}
          <div>
            <label className={labelClass}>Tag User</label>
            <RepMultiSelect
              options={userOptionsWithIds}
              selectedIds={taggedUserIds}
              onChange={setTaggedUserIds}
              triggerClass={`${inputClass} flex items-center justify-between gap-2`}
              placeholder="Tag a user to notify them..."
            />
          </div>

          {/* Conference */}
          <div>
            <label className={labelClass}>Conference</label>
            <select className={inputClass} value={selectedConferenceId} onChange={e => setSelectedConferenceId(e.target.value)}>
              <option value="">Select conference...</option>
              {conferences.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          {/* Company (searchable dropdown) */}
          <div>
            <label className={labelClass}>Company</label>
            <div className="relative" ref={companyDropdownRef}>
              <input
                type="text"
                className={inputClass}
                placeholder={
                  selectedConferenceId
                    ? (loadingConference ? 'Loading companies...' : 'Search companies...')
                    : 'Search companies...'
                }
                value={selectedCompanyId ? selectedCompanyName : companySearch}
                onChange={e => {
                  setCompanySearch(e.target.value);
                  setSelectedCompanyId('');
                  setSelectedAttendeeId('');
                  setShowCompanyDropdown(true);
                }}
                onFocus={() => {
                  if (!loadingConference) setShowCompanyDropdown(true);
                }}
                disabled={loadingConference}
              />
              {selectedCompanyId && (
                <button
                  type="button"
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  onClick={() => { setSelectedCompanyId(''); setCompanySearch(''); setSelectedAttendeeId(''); }}
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
                          setSelectedAttendeeId('');
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

          {/* Attendee */}
          <div>
            <label className={labelClass}>Attendee</label>
            <select className={inputClass} value={selectedAttendeeId} onChange={e => setSelectedAttendeeId(e.target.value)}>
              <option value="">Select attendee...</option>
              {filteredAttendees.map(a => (
                <option key={a.id} value={a.id}>
                  {a.first_name} {a.last_name}{a.title ? ` — ${a.title}` : ''}
                </option>
              ))}
            </select>
          </div>

          {!hasRequiredSelection && (
            <p className="text-xs text-amber-600">At least one of Conference, Company, or Attendee must be selected.</p>
          )}

          {/* Note Text with @mention support */}
          <div>
            <label className={labelClass}>Note *</label>
            <MentionTextarea
              value={noteText}
              onChange={setNoteText}
              onMentionAdd={handleMentionAdd}
              userOptions={userOptionsWithIds}
              className={`${inputClass} resize-none`}
              placeholder="Enter your note... (type @ to mention a user)"
              rows={5}
              autoFocus
            />
          </div>

          {/* Pin Note */}
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={pinOnSubmit}
              onChange={e => setPinOnSubmit(e.target.checked)}
              className="w-4 h-4 rounded border-gray-300 text-procare-gold focus:ring-procare-gold"
            />
            <svg className="w-4 h-4 text-procare-gold" fill="currentColor" viewBox="0 0 24 24">
              <path d="M16 12V4h1V2H7v2h1v8l-2 2v2h5.2v6h1.6v-6H18v-2l-2-2z" />
            </svg>
            <span className="text-sm font-medium text-gray-700">Pin Note?</span>
          </label>
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
            disabled={!canSubmit}
            className="px-4 py-2 text-sm font-semibold text-white bg-procare-bright-blue rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? 'Saving...' : 'Submit'}
          </button>
        </div>
      </div>
    </div>
  );
}
