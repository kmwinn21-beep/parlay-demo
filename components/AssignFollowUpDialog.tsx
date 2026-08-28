'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { RepMultiSelect } from '@/components/RepMultiSelect';
import type { UserOption } from '@/lib/useUserOptions';

/**
 * Closing out a meeting creates the follow-up for it automatically, and it used
 * to land on whoever happened to change the outcome. Often that isn't who owns
 * the next step, so the follow-up is offered here instead: keep it, or hand it
 * to whoever should have it.
 *
 * Dismissing leaves it where it already is — on the person who closed the
 * meeting out — so there is no way to end up with an unowned follow-up.
 */
export function AssignFollowUpDialog({
  userOptions, attendeeName, outcome, onAssignToMe, onAssignToSelected, onCancel, submitting,
}: {
  userOptions: UserOption[];
  /** Named so it's clear which follow-up is being handed over. */
  attendeeName?: string;
  outcome?: string;
  onAssignToMe: (followUpAction: string, note: string) => void;
  onAssignToSelected: (repIds: number[], followUpAction: string, note: string) => void;
  onCancel: () => void;
  submitting?: boolean;
}) {
  const [selected, setSelected] = useState<number[]>([]);
  const [action, setAction] = useState('');
  const [note, setNote] = useState('');
  const [actionOptions, setActionOptions] = useState<string[]>([]);
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    fetch('/api/config?category=follow_up_actions')
      .then(r => (r.ok ? r.json() : []))
      .then((data: { value: string }[]) => setActionOptions(Array.isArray(data) ? data.map(d => d.value) : []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel(); };
    document.addEventListener('keydown', onEsc);
    return () => document.removeEventListener('keydown', onEsc);
  }, [onCancel]);

  if (!mounted) return null;

  return createPortal(
    <>
      <div className="fixed inset-0 z-[90] bg-black/40" onClick={onCancel} />
      <div className="fixed inset-0 z-[91] flex items-center justify-center p-4 pointer-events-none">
        <div className="pointer-events-auto w-full max-w-md bg-white rounded-xl shadow-2xl overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100">
            <h3 className="text-sm font-semibold text-brand-primary">Assign the follow-up</h3>
            <p className="text-xs text-gray-500 mt-0.5">
              {outcome ? `Marking this meeting ${outcome} created a follow-up` : 'A follow-up was created'}
              {attendeeName ? ` for ${attendeeName}` : ''}. Who should own it?
            </p>
          </div>

          <div className="px-4 py-3">
            <label className="label text-xs">Assign to</label>
            <RepMultiSelect
              options={userOptions}
              selectedIds={selected}
              onChange={setSelected}
              triggerClass="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-brand-secondary bg-white text-left flex items-center justify-between gap-1"
              placeholder="Select one or more users…"
            />

            {/* What the follow-up is for. Set here so the task arrives with its
                action already filled in rather than as a bare row someone has
                to come back and describe. */}
            <label className="label text-xs mt-3">Follow up action</label>
            <select value={action} onChange={e => setAction(e.target.value)} className="input-field">
              <option value="">No action yet</option>
              {actionOptions.map(o => <option key={o} value={o}>{o}</option>)}
            </select>

            {/* Whatever came out of the meeting, captured while it's fresh. It
                is filed against the attendee, their company and the conference
                so it turns up wherever the reader happens to be looking. */}
            <label className="label text-xs mt-3">Notes</label>
            <textarea
              value={note}
              onChange={e => setNote(e.target.value)}
              rows={3}
              placeholder="What came out of the meeting?"
              className="input-field resize-none"
            />
            <p className="text-[11px] text-gray-400 mt-1">
              Saved to the attendee, their company and the conference, tagged as a Meeting Note.
            </p>
          </div>

          <div className="flex flex-wrap gap-2 px-4 py-3 border-t border-gray-100">
            <button type="button" onClick={() => onAssignToMe(action, note)} disabled={submitting} className="btn-secondary text-sm disabled:opacity-50">
              Assign to Myself
            </button>
            <button
              type="button"
              onClick={() => onAssignToSelected(selected, action, note)}
              disabled={submitting || selected.length === 0}
              className="btn-primary text-sm disabled:opacity-50"
            >
              {submitting ? 'Assigning…' : 'Assign to Selected'}
            </button>
          </div>
        </div>
      </div>
    </>,
    document.body,
  );
}
