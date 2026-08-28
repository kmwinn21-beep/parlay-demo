'use client';

import { useEffect, useState } from 'react';
import { RepMultiSelect } from '@/components/RepMultiSelect';
import type { UserOption } from '@/lib/useUserOptions';

export interface FollowUpDraft {
  repIds: number[];
  action: string;
  note: string;
}

export const EMPTY_FOLLOW_UP_DRAFT: FollowUpDraft = { repIds: [], action: '', note: '' };

/**
 * Who takes the follow-up, what it's for, and what came out of the meeting.
 * Shared by the prompt that appears when an outcome changes and by the Log
 * side of the meeting modal, so the two ask for the same things in the same
 * order rather than drifting apart.
 */
export function AssignFollowUpFields({
  userOptions, value, onChange, noteHelper = true,
}: {
  userOptions: UserOption[];
  value: FollowUpDraft;
  onChange: (next: FollowUpDraft) => void;
  /** The line explaining where the note is filed. */
  noteHelper?: boolean;
}) {
  const [actionOptions, setActionOptions] = useState<string[]>([]);

  useEffect(() => {
    fetch('/api/config?category=follow_up_actions')
      .then(r => (r.ok ? r.json() : []))
      .then((data: { value: string }[]) => setActionOptions(Array.isArray(data) ? data.map(d => d.value) : []))
      .catch(() => {});
  }, []);

  return (
    <>
      <label className="label text-xs">Assign to</label>
      <RepMultiSelect
        options={userOptions}
        selectedIds={value.repIds}
        onChange={ids => onChange({ ...value, repIds: ids })}
        triggerClass="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-brand-secondary bg-white text-left flex items-center justify-between gap-1"
        placeholder="Select one or more users…"
      />

      {/* What the follow-up is for. Set here so the task arrives with its
          action already filled in rather than as a bare row someone has to
          come back and describe. */}
      <label className="label text-xs mt-3">Follow up action</label>
      <select
        value={value.action}
        onChange={e => onChange({ ...value, action: e.target.value })}
        className="input-field"
      >
        <option value="">No action yet</option>
        {actionOptions.map(o => <option key={o} value={o}>{o}</option>)}
      </select>

      {/* Whatever came out of the meeting, captured while it's fresh. It is
          filed against the attendee, their company and the conference so it
          turns up wherever the reader happens to be looking. */}
      <label className="label text-xs mt-3">Notes</label>
      <textarea
        value={value.note}
        onChange={e => onChange({ ...value, note: e.target.value })}
        rows={3}
        placeholder="What came out of the meeting?"
        className="input-field resize-none"
      />
      {noteHelper && (
        <p className="text-[11px] text-gray-400 mt-1">
          Saved to the attendee, their company and the conference, tagged as a Meeting Note.
        </p>
      )}
    </>
  );
}
