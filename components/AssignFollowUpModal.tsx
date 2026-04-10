'use client';

import { useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { RepMultiSelect } from '@/components/RepMultiSelect';
import {
  useUserOptions,
  useConfigWithIds,
  resolveRepNames,
} from '@/lib/useUserOptions';
import { useHideBottomNav } from './BottomNavContext';

interface ConferenceOption {
  id: number;
  name: string;
  start_date: string;
}

interface CompanyOption {
  id: number;
  name: string;
}

interface AttendeeOption {
  id: number;
  first_name: string;
  last_name: string;
}

export interface AssignFollowUpModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  /** Pre-selects and locks in the conference */
  defaultConferenceId?: number;
  /** Pre-selects the company (auto-selects when conference is chosen that includes it) */
  defaultCompanyId?: number;
  /** Pre-selects the attendee */
  defaultAttendeeId?: number;
}

function SearchableSelect({
  options,
  value,
  onChange,
  disabled,
  placeholder,
  disabledPlaceholder,
}: {
  options: CompanyOption[];
  value: string;
  onChange: (val: string) => void;
  disabled?: boolean;
  placeholder: string;
  disabledPlaceholder: string;
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

  // Reset query/open when disabled
  useEffect(() => {
    if (disabled) { setOpen(false); setQuery(''); }
  }, [disabled]);

  if (disabled) {
    return (
      <div className="input-field text-gray-400 text-sm cursor-not-allowed">
        {disabledPlaceholder}
      </div>
    );
  }

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

function formatDateShort(d: string) {
  if (!d) return '';
  return new Date(d + 'T00:00:00').toLocaleDateString('en-US', {
    month: 'short',
    year: 'numeric',
  });
}

export function AssignFollowUpModal({
  isOpen,
  onClose,
  onSuccess,
  defaultConferenceId,
  defaultCompanyId,
  defaultAttendeeId,
}: AssignFollowUpModalProps) {
  useHideBottomNav(isOpen);
  const userOptions = useUserOptions();
  const actionOptions = useConfigWithIds('next_steps');

  // Form values
  const [repIds, setRepIds] = useState<number[]>([]);
  const [conferenceId, setConferenceId] = useState<string>('');
  const [companyId, setCompanyId] = useState<string>('');
  const [attendeeId, setAttendeeId] = useState<string>('');
  const [actionId, setActionId] = useState<string>('');
  const [nextStepDesc, setNextStepDesc] = useState('');
  const [notes, setNotes] = useState('');

  // Cascade data
  const [allConferences, setAllConferences] = useState<ConferenceOption[]>([]);
  const [confCompanies, setConfCompanies] = useState<CompanyOption[]>([]);
  const [companyAttendeesInConf, setCompanyAttendeesInConf] = useState<AttendeeOption[]>([]);

  // Loading states
  const [isLoadingConferences, setIsLoadingConferences] = useState(false);
  const [isLoadingCompanies, setIsLoadingCompanies] = useState(false);
  const [isLoadingAttendees, setIsLoadingAttendees] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const selectedAction = actionOptions.find(a => String(a.id) === actionId);
  const isOther = selectedAction?.value.toLowerCase() === 'other';

  // ---------------------------------------------------------------------------
  // Cascade loaders
  // ---------------------------------------------------------------------------

  /**
   * Load companies present at `confId`. Pass `autoCompanyId` to auto-select
   * a company on the initial open (not on user-driven conference changes).
   */
  const loadConferenceCompanies = async (
    confId: string,
    autoCompanyId?: number
  ) => {
    if (!confId) {
      setConfCompanies([]);
      setCompanyId('');
      setAttendeeId('');
      setCompanyAttendeesInConf([]);
      return;
    }
    setIsLoadingCompanies(true);
    try {
      // Fetch the conference to get its attendees (and thus company IDs)
      const [confData, allCompanies] = await Promise.all([
        fetch(`/api/conferences/${confId}`).then(r => r.json()),
        fetch('/api/companies').then(r => r.json()),
      ]);

      const confAttendees: Array<{ id: number; company_id?: number }> =
        confData.attendees || [];
      const attendeeIdSet = new Set(confAttendees.map(a => Number(a.id)));
      const companyIdSet = new Set(
        confAttendees.map(a => a.company_id).filter(Boolean) as number[]
      );

      const filtered: CompanyOption[] = (
        allCompanies as Array<{ id: number; name: string }>
      )
        .filter(c => companyIdSet.has(c.id))
        .sort((a, b) => a.name.localeCompare(b.name));

      setConfCompanies(filtered);

      // Auto-select company when present in this conference
      if (autoCompanyId && companyIdSet.has(autoCompanyId)) {
        setCompanyId(String(autoCompanyId));
        await loadCompanyAttendeesInConf(
          String(autoCompanyId),
          attendeeIdSet,
          autoCompanyId
        );
      } else {
        setCompanyId('');
        setAttendeeId('');
        setCompanyAttendeesInConf([]);
      }
    } catch {
      toast.error('Failed to load companies for conference');
    } finally {
      setIsLoadingCompanies(false);
    }
  };

  /**
   * Load company attendees who also attended the selected conference.
   * `confAttendeeSet` can be supplied directly to avoid stale-state reads.
   * `autoAttendeeId` triggers auto-selection if the attendee is in the list.
   */
  const loadCompanyAttendeesInConf = async (
    compId: string,
    confAttendeeSet: Set<number>,
    autoComp?: number, // only used to decide whether to auto-select attendee
  ) => {
    if (!compId) {
      setCompanyAttendeesInConf([]);
      setAttendeeId('');
      return;
    }
    setIsLoadingAttendees(true);
    try {
      const compData = await fetch(`/api/companies/${compId}`).then(r =>
        r.json()
      );
      const all: Array<{ id: number; first_name: string; last_name: string }> =
        compData.attendees || [];
      const inConf = all
        .filter(a => confAttendeeSet.has(Number(a.id)))
        .map(a => ({
          id: Number(a.id),
          first_name: String(a.first_name),
          last_name: String(a.last_name),
        }));
      setCompanyAttendeesInConf(inConf);

      // Auto-select attendee only during the initial open cascade
      if (defaultAttendeeId && autoComp !== undefined) {
        const found = inConf.find(a => a.id === defaultAttendeeId);
        if (found) setAttendeeId(String(defaultAttendeeId));
      }
    } catch {
      toast.error('Failed to load attendees');
    } finally {
      setIsLoadingAttendees(false);
    }
  };

  // ---------------------------------------------------------------------------
  // On modal open: reset form and load conferences (with optional auto-selects)
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!isOpen) return;

    setRepIds([]);
    setConferenceId('');
    setCompanyId('');
    setAttendeeId('');
    setActionId('');
    setNextStepDesc('');
    setNotes('');
    setConfCompanies([]);
    setCompanyAttendeesInConf([]);

    setIsLoadingConferences(true);
    fetch('/api/conferences')
      .then(r => r.json())
      .then(async (data: ConferenceOption[]) => {
        const sorted = [...data].sort((a, b) =>
          b.start_date.localeCompare(a.start_date)
        );
        setAllConferences(sorted);

        if (defaultConferenceId) {
          setConferenceId(String(defaultConferenceId));
          // Pass defaultCompanyId so companies cascade auto-selects it
          await loadConferenceCompanies(
            String(defaultConferenceId),
            defaultCompanyId
          );
        }
      })
      .catch(() => toast.error('Failed to load conferences'))
      .finally(() => setIsLoadingConferences(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // ---------------------------------------------------------------------------
  // User-driven handlers (no auto-selection of downstream values)
  // ---------------------------------------------------------------------------
  const handleConferenceChange = async (confId: string) => {
    setConferenceId(confId);
    setCompanyId('');
    setAttendeeId('');
    setCompanyAttendeesInConf([]);
    // Pass defaultCompanyId so it auto-selects if present in this conference
    await loadConferenceCompanies(confId, defaultCompanyId);
  };

  const handleCompanyChange = async (compId: string) => {
    setCompanyId(compId);
    setAttendeeId('');
    setCompanyAttendeesInConf([]);
    if (!compId || !conferenceId) return;
    // Re-fetch conference attendees to rebuild the filter set
    setIsLoadingAttendees(true);
    try {
      const [confData, compData] = await Promise.all([
        fetch(`/api/conferences/${conferenceId}`).then(r => r.json()),
        fetch(`/api/companies/${compId}`).then(r => r.json()),
      ]);
      const confAttIds = new Set<number>(
        (confData.attendees || []).map((a: { id: number }) => Number(a.id))
      );
      const all: Array<{ id: number; first_name: string; last_name: string }> =
        compData.attendees || [];
      setCompanyAttendeesInConf(
        all
          .filter(a => confAttIds.has(Number(a.id)))
          .map(a => ({
            id: Number(a.id),
            first_name: String(a.first_name),
            last_name: String(a.last_name),
          }))
      );
    } catch {
      toast.error('Failed to load attendees');
    } finally {
      setIsLoadingAttendees(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Submit
  // ---------------------------------------------------------------------------
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!conferenceId || !companyId || !attendeeId || !actionId) {
      toast.error('Conference, Company, Attendee, and Follow Up Action are required.');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch('/api/conference-details', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          attendee_id: Number(attendeeId),
          conference_id: Number(conferenceId),
          next_steps: actionId, // stored as config option ID
          next_steps_notes: isOther ? (nextStepDesc.trim() || null) : null,
          assigned_rep: repIds.length > 0 ? repIds.join(',') : null,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to create follow-up');
      }

      if (notes.trim()) {
        const conf = allConferences.find(c => String(c.id) === conferenceId);
        const confName = conf?.name ?? null;
        const repDisplay =
          repIds.length > 0
            ? resolveRepNames(repIds.join(','), userOptions)
            : null;

        await Promise.allSettled([
          fetch('/api/notes', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              entity_type: 'attendee',
              entity_id: Number(attendeeId),
              content: notes.trim(),
              conference_name: confName,
              rep: repDisplay,
            }),
          }),
          fetch('/api/notes', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              entity_type: 'company',
              entity_id: Number(companyId),
              content: notes.trim(),
              conference_name: confName,
              rep: repDisplay,
            }),
          }),
          fetch('/api/notes', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              entity_type: 'conference',
              entity_id: Number(conferenceId),
              content: notes.trim(),
              rep: repDisplay,
            }),
          }),
        ]);
      }

      toast.success('Follow-up assigned!');
      onSuccess();
      onClose();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : 'Failed to assign follow-up'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-procare-dark-blue font-serif">
            Assign Follow Up
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Assign To */}
          <div>
            <label className="label">Assign To</label>
            <RepMultiSelect
              options={userOptions}
              selectedIds={repIds}
              onChange={setRepIds}
              triggerClass="input-field w-full flex items-center justify-between gap-2 text-sm"
              placeholder="Select users..."
            />
          </div>

          {/* Conference */}
          <div>
            <label className="label">Conference *</label>
            {isLoadingConferences ? (
              <div className="input-field text-gray-400 text-sm">
                Loading conferences…
              </div>
            ) : (
              <select
                value={conferenceId}
                onChange={e => handleConferenceChange(e.target.value)}
                className="input-field"
                required
              >
                <option value="">Select conference…</option>
                {allConferences.map(c => (
                  <option key={c.id} value={String(c.id)}>
                    {c.name} ({formatDateShort(c.start_date)})
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Company — filtered to companies that attended the selected conference */}
          <div>
            <label className="label">Company *</label>
            {isLoadingCompanies ? (
              <div className="input-field text-gray-400 text-sm">
                Loading companies…
              </div>
            ) : (
              <SearchableSelect
                options={confCompanies}
                value={companyId}
                onChange={handleCompanyChange}
                disabled={!conferenceId}
                placeholder="Select company…"
                disabledPlaceholder="Select a conference first"
              />
            )}
          </div>

          {/* Attendee — filtered to company attendees who attended the conference */}
          <div>
            <label className="label">Attendee *</label>
            {isLoadingAttendees ? (
              <div className="input-field text-gray-400 text-sm">
                Loading attendees…
              </div>
            ) : (
              <select
                value={attendeeId}
                onChange={e => setAttendeeId(e.target.value)}
                className="input-field"
                required
                disabled={!companyId}
              >
                <option value="">
                  {companyId ? 'Select attendee…' : 'Select a company first'}
                </option>
                {companyAttendeesInConf.map(a => (
                  <option key={a.id} value={String(a.id)}>
                    {a.first_name} {a.last_name}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Follow Up Action */}
          <div>
            <label className="label">Follow Up Action *</label>
            <select
              value={actionId}
              onChange={e => setActionId(e.target.value)}
              className="input-field"
              required
            >
              <option value="">Select action…</option>
              {actionOptions.map(a => (
                <option key={a.id} value={String(a.id)}>
                  {a.value}
                </option>
              ))}
            </select>
          </div>

          {/* Next Step Description — visible only when "Other" is selected */}
          {isOther && (
            <div>
              <label className="label">Next Step Description</label>
              <input
                type="text"
                value={nextStepDesc}
                onChange={e => setNextStepDesc(e.target.value)}
                className="input-field"
                placeholder="Describe the next step…"
              />
            </div>
          )}

          {/* Notes */}
          <div>
            <label className="label">Notes</label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              className="input-field resize-none"
              rows={3}
              placeholder="Optional notes (added to attendee, company, and conference records)…"
            />
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              disabled={isSubmitting}
              className="btn-primary flex-1"
            >
              {isSubmitting ? 'Assigning…' : 'Assign Follow Up'}
            </button>
            <button type="button" onClick={onClose} className="btn-secondary">
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
