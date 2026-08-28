'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { AssignFollowUpFields, EMPTY_FOLLOW_UP_DRAFT, type FollowUpDraft } from '@/components/AssignFollowUpFields';
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
  const [draft, setDraft] = useState<FollowUpDraft>(EMPTY_FOLLOW_UP_DRAFT);
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

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
            <AssignFollowUpFields userOptions={userOptions} value={draft} onChange={setDraft} />
          </div>

          <div className="flex flex-wrap gap-2 px-4 py-3 border-t border-gray-100">
            <button type="button" onClick={() => onAssignToMe(draft.action, draft.note)} disabled={submitting} className="btn-secondary text-sm disabled:opacity-50">
              Assign to Myself
            </button>
            <button
              type="button"
              onClick={() => onAssignToSelected(draft.repIds, draft.action, draft.note)}
              disabled={submitting || draft.repIds.length === 0}
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
