'use client';

import { useCallback, useState, type ReactNode } from 'react';
import toast from 'react-hot-toast';
import { NewMeetingModal } from '@/components/NewMeetingModal';
import { TouchpointQuickModal } from '@/components/DashboardActionCard';
import { payloadFor, type SuggestionGroup } from '@/lib/suggestions/group';
import { getTarget } from '@/lib/suggestions/registry';

/**
 * Answering a suggestion, wherever it is being shown.
 *
 * Two surfaces offer the same decisions now — the queue on a record and the
 * queue on the dashboard — and a third would be cheap to add. What a card's
 * buttons DO is the part that must not differ between them: whether accepting
 * writes or opens a form, whether the suggestion is marked answered on opening
 * or on saving, which modal a kind opens and with what. Copied into each
 * surface those rules drift, and the drift is invisible until somebody logs a
 * meeting in one place and not the other.
 *
 * So the rules live here once and the surfaces supply only their own layout.
 */

/** A group whose every target opens a form rather than writing a row. */
export function isActivityGroup(group: SuggestionGroup): boolean {
  return group.members.length > 0
    && group.members.every(m => getTarget(m.target_key)?.write === 'open_form');
}

/** An id if the payload carries a usable one, else nothing to prefill with. */
function num(v: unknown): number | undefined {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

export interface SuggestionReview {
  /** The group currently being written, so its buttons can show it. */
  busyKey: string | null;
  review: (group: SuggestionGroup, action: 'accept' | 'dismiss', draft?: Record<string, unknown>) => Promise<void>;
  openForm: (kind: 'meeting' | 'touchpoint', group: SuggestionGroup) => void;
  /** Rendered by the host, once, anywhere in its tree. */
  modals: ReactNode;
}

/**
 * @param onReviewed Called with the ids that are now answered, so the host can
 *   drop them from whatever it is showing. It owns its own list; this does not.
 */
export function useSuggestionReview(onReviewed: (ids: number[]) => void): SuggestionReview {
  const [busyKey, setBusyKey] = useState<string | null>(null);
  /**
   * A deferred activity, and the form it is waiting on.
   *
   * Held while the modal is open so the suggestion can be marked accepted when
   * — and only when — that form actually saves. Closing it without saving
   * leaves the card exactly where it was, which is what makes deferring safe.
   */
  const [logging, setLogging] = useState<
    { kind: 'meeting' | 'touchpoint'; group: SuggestionGroup; payload: Record<string, unknown> } | null
  >(null);

  const review = useCallback(async (
    group: SuggestionGroup,
    action: 'accept' | 'dismiss',
    draft: Record<string, unknown> = group.draft,
  ) => {
    setBusyKey(group.key);
    try {
      // One company is one decision, so every member of the group is answered
      // together — a half-applied group would leave the record inconsistent
      // with what the reviewer saw.
      for (const member of group.members) {
        const res = await fetch('/api/suggestions', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: member.id, action, payload: payloadFor(member, draft) }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({})) as { error?: string };
          toast.error(err.error || 'Could not save that.');
          return;
        }
      }
      toast.success(action === 'accept' ? 'Added to the record.' : 'Dismissed.');
      onReviewed(group.members.map(m => m.id));
    } finally {
      setBusyKey(null);
    }
  }, [onReviewed]);

  /** The ids the chooser stored alongside the fields, for reopening in place. */
  const openForm = useCallback((kind: 'meeting' | 'touchpoint', group: SuggestionGroup) => {
    setLogging({ kind, group, payload: group.members[0]?.payload ?? {} });
  }, []);

  /**
   * The form saved, so the question it was asked about is answered.
   *
   * Deliberately does NOT close the modal. Both forms stay mounted after a
   * successful save to offer a follow-on step — a calendar invite for a
   * meeting, "Log w/ Note" for a touchpoint — so unmounting here would take
   * that away. Closing is the modal's own business; this only records that the
   * suggestion no longer needs asking.
   */
  const onLogged = useCallback((group: SuggestionGroup) => { void review(group, 'accept'); }, [review]);

  const modals = (
    <>
      {/* Opens on Log, as the chooser does: the note said it had happened. */}
      {logging?.kind === 'meeting' && (
        <NewMeetingModal
          isOpen
          onClose={() => setLogging(null)}
          onSuccess={() => onLogged(logging.group)}
          defaultMode="log"
          prefillCompanyId={num(logging.payload.company_id)}
          prefillAttendeeId={num(logging.payload.attendee_id)}
          defaultConferenceId={num(logging.payload.conference_id)}
        />
      )}
      {logging?.kind === 'touchpoint' && (
        <TouchpointQuickModal
          onClose={() => setLogging(null)}
          onLogged={() => onLogged(logging.group)}
          defaultCompanyId={num(logging.payload.company_id) ?? null}
          defaultAttendeeId={num(logging.payload.attendee_id) ?? null}
          defaultConferenceId={num(logging.payload.conference_id) ?? null}
        />
      )}
    </>
  );

  return { busyKey, review, openForm, modals };
}

/**
 * The answers a card offers, which depend on what accepting it would do.
 *
 * A deferred activity asks the same question it asked when the note was saved
 * — Meeting, Touchpoint or neither — because deferring a question should
 * present that question later, not something the reader has to work back to.
 * A vendor suggestion is a set of values to confirm, so it accepts or is
 * dismissed.
 */
export function SuggestionActions({ group, review, openForm, busyKey, draft }: {
  group: SuggestionGroup;
  review: SuggestionReview['review'];
  openForm: SuggestionReview['openForm'];
  busyKey: string | null;
  /** The reviewer's edits merged over the proposal, when the host tracks any. */
  draft?: Record<string, unknown>;
}) {
  const busy = busyKey === group.key;

  if (isActivityGroup(group)) {
    return (
      <>
        <button
          type="button"
          onClick={() => openForm('meeting', group)}
          disabled={busy}
          className="btn-primary text-xs px-3 py-1.5 disabled:opacity-50"
        >
          Meeting
        </button>
        <button
          type="button"
          onClick={() => openForm('touchpoint', group)}
          disabled={busy}
          className="btn-primary text-xs px-3 py-1.5 disabled:opacity-50"
        >
          Touchpoint
        </button>
        <button
          type="button"
          onClick={() => void review(group, 'dismiss', draft)}
          disabled={busy}
          className="text-xs text-gray-500 hover:text-gray-700 px-2"
        >
          {busy ? 'Saving…' : 'Disregard'}
        </button>
      </>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => void review(group, 'accept', draft)}
        disabled={busy}
        className="btn-primary text-xs px-3 py-1.5 disabled:opacity-50"
      >
        {busy ? 'Saving…' : 'Accept'}
      </button>
      <button
        type="button"
        onClick={() => void review(group, 'dismiss', draft)}
        disabled={busy}
        className="text-xs text-gray-500 hover:text-gray-700 px-2"
      >
        Dismiss
      </button>
    </>
  );
}
