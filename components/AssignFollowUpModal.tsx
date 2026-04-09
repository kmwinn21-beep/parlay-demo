'use client';

import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { RepMultiSelect } from '@/components/RepMultiSelect';
import {
  useUserOptions,
  useConfigWithIds,
  resolveRepNames,
} from '@/lib/useUserOptions';

interface AttendeeOption {
  id: number;
  first_name: string;
  last_name: string;
}

interface ConferenceOption {
  id: number;
  name: string;
  start_date: string;
}

export interface AssignFollowUpModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  /** Pre-selects the attendee (e.g. when opened from Attendee Details page) */
  defaultAttendeeId?: number;
  /** Pre-selects the conference (e.g. when currently viewing a conference) */
  defaultConferenceId?: number;
  /** When set, attendee dropdown is filtered to this company's attendees */
  companyId?: number;
  /** Pre-loaded attendees for the company (avoids an extra fetch) */
  companyAttendees?: AttendeeOption[];
}

function formatDateShort(d: string) {
  if (!d) return '';
  return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

export function AssignFollowUpModal({
  isOpen,
  onClose,
  onSuccess,
  defaultAttendeeId,
  defaultConferenceId,
  companyAttendees,
}: AssignFollowUpModalProps) {
  const userOptions = useUserOptions();
  const actionOptions = useConfigWithIds('next_steps');

  const [repIds, setRepIds] = useState<number[]>([]);
  const [attendeeId, setAttendeeId] = useState<string>('');
  const [conferenceId, setConferenceId] = useState<string>('');
  const [actionId, setActionId] = useState<string>('');
  const [nextStepDesc, setNextStepDesc] = useState('');
  const [notes, setNotes] = useState('');

  const [attendees, setAttendees] = useState<AttendeeOption[]>([]);
  const [conferences, setConferences] = useState<ConferenceOption[]>([]);
  const [attendeeCompanyId, setAttendeeCompanyId] = useState<number | null>(null);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoadingAttendees, setIsLoadingAttendees] = useState(false);
  const [isLoadingConferences, setIsLoadingConferences] = useState(false);

  const selectedAction = actionOptions.find(a => String(a.id) === actionId);
  const isOther = selectedAction?.value.toLowerCase() === 'other';

  const loadConferencesForAttendee = async (aid: string) => {
    if (!aid) {
      setConferences([]);
      setAttendeeCompanyId(null);
      return;
    }
    setIsLoadingConferences(true);
    try {
      const res = await fetch(`/api/attendees/${aid}`);
      const data = await res.json();
      setConferences(
        (data.conferences || []).map((c: { id: number; name: string; start_date: string }) => ({
          id: Number(c.id),
          name: String(c.name),
          start_date: String(c.start_date),
        }))
      );
      setAttendeeCompanyId(data.company_id ? Number(data.company_id) : null);
    } catch {
      toast.error('Failed to load conferences');
    } finally {
      setIsLoadingConferences(false);
    }
  };

  // Reset form and load data on open
  useEffect(() => {
    if (!isOpen) return;

    setRepIds([]);
    setAttendeeId(defaultAttendeeId ? String(defaultAttendeeId) : '');
    setConferenceId(defaultConferenceId ? String(defaultConferenceId) : '');
    setActionId('');
    setNextStepDesc('');
    setNotes('');
    setConferences([]);
    setAttendeeCompanyId(null);

    if (companyAttendees && companyAttendees.length > 0) {
      setAttendees(companyAttendees);
    } else {
      setIsLoadingAttendees(true);
      fetch('/api/attendees')
        .then(r => r.json())
        .then((data: Array<{ id: number; first_name: string; last_name: string }>) =>
          setAttendees(
            data.map(a => ({
              id: Number(a.id),
              first_name: String(a.first_name),
              last_name: String(a.last_name),
            }))
          )
        )
        .catch(() => toast.error('Failed to load attendees'))
        .finally(() => setIsLoadingAttendees(false));
    }

    if (defaultAttendeeId) {
      loadConferencesForAttendee(String(defaultAttendeeId));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const handleAttendeeChange = (aid: string) => {
    setAttendeeId(aid);
    setConferenceId('');
    loadConferencesForAttendee(aid);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!attendeeId || !conferenceId || !actionId) {
      toast.error('Attendee, Conference, and Follow Up Action are required.');
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
        const conf = conferences.find(c => String(c.id) === conferenceId);
        const confName = conf?.name ?? null;
        const repDisplay = repIds.length > 0 ? resolveRepNames(repIds.join(','), userOptions) : null;

        const notePayloads = [
          { entity_type: 'attendee', entity_id: Number(attendeeId) },
          { entity_type: 'conference', entity_id: Number(conferenceId) },
          ...(attendeeCompanyId
            ? [{ entity_type: 'company', entity_id: attendeeCompanyId }]
            : []),
        ];

        await Promise.allSettled(
          notePayloads.map(p =>
            fetch('/api/notes', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                ...p,
                content: notes.trim(),
                conference_name: confName,
                rep: repDisplay,
              }),
            })
          )
        );
      }

      toast.success('Follow-up assigned!');
      onSuccess();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to assign follow-up');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-procare-dark-blue font-serif">Assign Follow Up</h2>
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

          {/* Attendee */}
          <div>
            <label className="label">Attendee *</label>
            {isLoadingAttendees ? (
              <div className="input-field text-gray-400 text-sm">Loading attendees…</div>
            ) : (
              <select
                value={attendeeId}
                onChange={e => handleAttendeeChange(e.target.value)}
                className="input-field"
                required
              >
                <option value="">Select attendee…</option>
                {attendees.map(a => (
                  <option key={a.id} value={String(a.id)}>
                    {a.first_name} {a.last_name}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Conference */}
          <div>
            <label className="label">Conference *</label>
            {isLoadingConferences ? (
              <div className="input-field text-gray-400 text-sm">Loading conferences…</div>
            ) : (
              <select
                value={conferenceId}
                onChange={e => setConferenceId(e.target.value)}
                className="input-field"
                required
                disabled={!attendeeId}
              >
                <option value="">
                  {attendeeId ? 'Select conference…' : 'Select an attendee first'}
                </option>
                {conferences.map(c => (
                  <option key={c.id} value={String(c.id)}>
                    {c.name} ({formatDateShort(c.start_date)})
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
                <option key={a.id} value={String(a.id)}>{a.value}</option>
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
            <button type="submit" disabled={isSubmitting} className="btn-primary flex-1">
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
