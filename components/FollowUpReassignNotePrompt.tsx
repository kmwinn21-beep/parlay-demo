'use client';

import { useState } from 'react';
import toast from 'react-hot-toast';
import { getRepInitials, type UserOption } from '@/lib/useUserOptions';
import { announceNoteSaved } from '@/lib/suggestions/announce';

export interface ReassignNoteTarget {
  attendeeId: number;
  attendeeName: string | null;
  companyId: number | null;
  companyName: string | null;
  conferenceId: number | null;
  conferenceName: string | null;
  /** config_option ids of whoever now owns the follow-up. */
  repIds: number[];
}

/**
 * Handing a follow-up to someone else usually comes with something to say —
 * why it moved, what they should know. This asks for that note right after the
 * reassignment, and tags the new owner so it reaches them.
 *
 * The note is filed against the attendee, their company and the conference, so
 * it turns up wherever the reader happens to be looking.
 */
export function FollowUpReassignNotePrompt({
  target,
  userOptions,
  onClose,
}: {
  target: ReassignNoteTarget;
  userOptions: UserOption[];
  onClose: () => void;
}) {
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  const reps = target.repIds
    .map(id => userOptions.find(u => u.id === id))
    .filter((u): u is UserOption => !!u);
  const repNames = reps.map(r => r.value).join(', ');

  const handleSubmit = async () => {
    const content = note.trim();
    if (!content || saving) return;
    setSaving(true);

    const shared = {
      content,
      conference_name: target.conferenceName || null,
      attendee_name: target.attendeeName || null,
      company_name: target.companyName || null,
      // The new owner is tagged, which is what notifies them.
      tagged_users: target.repIds.length > 0 ? target.repIds.join(',') : null,
    };

    const posts: Promise<Response>[] = [
      fetch('/api/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...shared, entity_type: 'attendee', entity_id: target.attendeeId }),
      }),
    ];
    if (target.companyId) {
      posts.push(fetch('/api/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // One notification is enough; the attendee note carries it.
        body: JSON.stringify({ ...shared, entity_type: 'company', entity_id: target.companyId, skip_notification: true }),
      }));
    }
    if (target.conferenceId) {
      posts.push(fetch('/api/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...shared, entity_type: 'conference', entity_id: target.conferenceId, skip_notification: true }),
      }));
    }

    try {
      const results = await Promise.allSettled(posts);
      const ok = results.some(r => r.status === 'fulfilled' && r.value.ok);
      if (!ok) throw new Error('note failed');
      announceNoteSaved('attendee', target.attendeeId);
      toast.success('Note added.');
      onClose();
    } catch {
      toast.error('Failed to save the note.');
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[200] bg-black/50 flex items-end sm:items-center justify-center sm:p-4" onClick={onClose}>
      <div
        className="modal-sheet-mobile bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <div className="px-5 pt-5 pb-3 border-b border-gray-100 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-base font-semibold text-brand-primary font-serif">Add a note?</h3>
            <p className="text-xs text-gray-500 mt-0.5">
              {repNames
                ? <>Reassigned to <span className="font-medium text-gray-700">{repNames}</span>. They&apos;ll be tagged on anything you write.</>
                : <>The follow-up is now unassigned. A note is optional.</>}
            </p>
          </div>
          <button type="button" onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100" aria-label="Close">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="px-5 py-4">
          {reps.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 mb-2.5">
              {reps.map(r => (
                <span key={r.id} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-brand-secondary/10 text-brand-secondary border border-brand-secondary/30">
                  {getRepInitials(r.value)}
                  <span className="font-medium">{r.value}</span>
                </span>
              ))}
            </div>
          )}
          <textarea
            value={note}
            onChange={e => setNote(e.target.value)}
            rows={4}
            autoFocus
            className="input-field resize-none w-full"
            placeholder="Anything the new owner should know…"
          />
          <p className="text-[10px] text-gray-400 mt-1.5">
            Filed against {[target.attendeeName, target.companyName, target.conferenceName].filter(Boolean).join(' · ') || 'this follow-up'}.
          </p>
        </div>

        <div className="px-5 py-3 border-t border-gray-100 flex justify-end gap-2">
          <button type="button" onClick={onClose} disabled={saving} className="px-3 py-1.5 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-100 disabled:opacity-60">
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!note.trim() || saving}
            className="px-4 py-1.5 rounded-lg text-sm font-medium bg-brand-secondary text-white hover:opacity-90 disabled:opacity-60"
          >
            {saving ? 'Saving…' : 'Submit'}
          </button>
        </div>
      </div>
    </div>
  );
}
