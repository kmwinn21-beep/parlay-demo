'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import toast from 'react-hot-toast';
import { NewMeetingModal } from '@/components/NewMeetingModal';
import { TouchpointQuickModal } from '@/components/DashboardActionCard';
import { scanForActivity, shouldScanNote, type ActivityHit } from '@/lib/suggestions/activityScan';
import { setActivityFlowOpen } from '@/lib/suggestions/activityFlow';
import { NOTE_SAVED_EVENT, type NoteSavedDetail } from '@/lib/suggestions/announce';

/**
 * The sentence a match sits in, for the card to show later.
 *
 * A deferred suggestion is read cold, days after the note was written, so the
 * matched words alone are not enough to judge it — "came by" says nothing
 * about who or why. The suggestions table has a `quote` column for exactly
 * this, and the vendor extractor fills it the same way.
 */
function sentenceAround(text: string, index: number): string {
  if (!text) return '';
  const start = Math.max(0, ...['.', '!', '?', '\n'].map(c => text.lastIndexOf(c, Math.max(0, index - 1)) + 1));
  const ends = ['.', '!', '?', '\n'].map(c => text.indexOf(c, index)).filter(i => i >= 0);
  const end = ends.length > 0 ? Math.min(...ends) + 1 : text.length;
  return text.slice(start, end).trim();
}

/**
 * "This sounds like something happened — was it a meeting or a touchpoint?"
 *
 * The scanner deliberately does not decide which. Whether coffee at a booth is
 * a touchpoint or a meeting depends on how a team uses those words, so the
 * person who wrote the sentence is asked, and their answer opens the matching
 * form already filled in.
 *
 * Three buttons rather than two and a guess: Disregard is a first-class answer
 * here, not a way out of a wrong one. A scanner tuned on a handful of examples
 * will be wrong sometimes, and one tap to say so costs far less than a form
 * opened on a false positive.
 *
 * Mounted once for the whole app and driven by the same event the vendor
 * prompt listens to, so every note-writing flow gets this without knowing it
 * exists — and a flow added later gets it by passing the note's text along.
 */
export function ActivityDetectedPrompt() {
  const [mounted, setMounted] = useState(false);
  const [pending, setPending] = useState<{ hit: ActivityHit; note: NoteSavedDetail } | null>(null);
  const [opened, setOpened] = useState<'meeting' | 'touchpoint' | null>(null);
  /**
   * Notes already answered, so a flow that announces twice — or a re-save of
   * the same note — does not ask again. Keyed on the text and the record,
   * because a client-side scan has no note id to key on.
   */
  const answered = useRef<Set<string>>(new Set());

  useEffect(() => { setMounted(true); }, []);

  // Anything on screen holds the vendor prompt back until it is gone.
  const showing = pending !== null || opened !== null;
  useEffect(() => {
    setActivityFlowOpen(showing);
    return () => setActivityFlowOpen(false);
  }, [showing]);

  useEffect(() => {
    const onSaved = (e: Event) => {
      const note = (e as CustomEvent<NoteSavedDetail>).detail;
      // A flow that has not been taught to pass the text along gets exactly
      // the behaviour it had before this existed.
      const text = String(note?.text ?? '').trim();
      if (!text) return;

      // A note written BY the touchpoint form or the meeting log describes
      // precisely what the scanner looks for. Offering to log it again would
      // write another note, which would ask again.
      if (!shouldScanNote({
        content: text,
        touchpoint_type: note.touchpointType,
        note_type: note.noteType,
        meeting_id: note.meetingId,
        tag: note.tag,
      })) return;

      const key = `${note.entityType}:${note.entityId}:${text}`;
      if (answered.current.has(key)) return;

      const hit = scanForActivity(text);
      if (!hit) return;

      answered.current.add(key);
      setPending({ hit, note });
    };
    window.addEventListener(NOTE_SAVED_EVENT, onSaved);
    return () => window.removeEventListener(NOTE_SAVED_EVENT, onSaved);
  }, []);

  /** Which records the forms open against, from the note that was just filed. */
  const note = pending?.note ?? null;
  const companyId = note?.companyId ?? (note?.entityType === 'company' ? note.entityId : null);
  const attendeeId = note?.attendeeId ?? (note?.entityType === 'attendee' ? note.entityId : null);
  const conferenceId = note?.conferenceId ?? null;

  // Kept for the modals, which outlive the chooser: choosing dismisses the
  // question but the form it opened still needs to know what it is about.
  const [target, setTarget] = useState<{ companyId: number | null; attendeeId: number | null; conferenceId: number | null }>(
    { companyId: null, attendeeId: null, conferenceId: null },
  );

  const choose = useCallback((kind: 'meeting' | 'touchpoint') => {
    setTarget({ companyId, attendeeId, conferenceId });
    setPending(null);
    setOpened(kind);
  }, [companyId, attendeeId, conferenceId]);

  const closeModal = useCallback(() => setOpened(null), []);

  /**
   * Put the question on the record and answer it another time.
   *
   * Named to match the vendor prompt's button, which does the same thing from
   * the reader's side even though the work underneath is different.
   *
   * The vendor prompt's "Review later" only stops showing a row the extractor
   * had already written. Nothing has been written here, so this is the button
   * that writes it — same words, different work.
   *
   * Filed against the company, because that is where Suggested Updates reads
   * from and the attendee lookup falls through to the employer anyway. One row
   * means one decision: stored per record, the same coffee could be logged
   * twice.
   */
  const [saving, setSaving] = useState(false);
  const saveForLater = useCallback(async () => {
    if (!pending || !companyId) return;
    setSaving(true);
    try {
      const res = await fetch('/api/suggestions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          suggestions: [{
            target_key: 'logged_activity',
            entity_type: 'company',
            entity_id: companyId,
            source_note_id: note?.noteId ?? null,
            quote: sentenceAround(String(note?.text ?? ''), pending.hit.index),
            confidence: 'medium',
            payload: {
              // The registry's fields, which is what the card shows.
              phrase: pending.hit.phrase,
              attendee_name: note?.attendeeName ?? null,
              company_name: note?.companyName ?? null,
              conference_name: note?.conferenceName ?? null,
              // Not fields: what the form needs to open where the note was.
              // payloadFor strips these when the card is finally reviewed,
              // which is after they have been used.
              company_id: companyId,
              attendee_id: attendeeId,
              conference_id: conferenceId,
            },
          }],
        }),
      });
      if (!res.ok) throw new Error();
      toast.success('Saved to the record for later.');
      setPending(null);
    } catch {
      toast.error('Could not save that. Nothing was logged.');
    } finally {
      setSaving(false);
    }
  }, [pending, note, companyId, attendeeId, conferenceId]);

  if (!mounted) return null;

  return (
    <>
      {pending && createPortal(
        <div className="fixed inset-0 z-[150] flex items-end justify-center bg-black/40 sm:items-center sm:p-4">
          {/* Wider than the other sheets: four answers in a row need the room,
              and at max-w-md the last one ran past the card's edge. */}
          <div className="modal-sheet-mobile flex w-full flex-col rounded-t-2xl bg-white shadow-xl sm:max-w-xl sm:rounded-xl">
            <div className="px-5 pt-5">
              {/* Amber, and saying what was read rather than what was decided.
                  A person can only judge whether this is right if they can see
                  the words it keyed on. */}
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5">
                <p className="text-sm font-medium text-amber-800">
                  This note may describe a meeting or a touchpoint.
                </p>
                <p className="mt-1 text-xs leading-snug text-amber-700">
                  Detected “{pending.hit.phrase}” in what you just wrote. Nothing has been
                  logged — choose how to record it, or disregard.
                </p>
              </div>
              {note?.companyName && (
                <p className="mt-3 text-xs text-gray-500">
                  {note.attendeeName ? `${note.attendeeName} · ` : ''}{note.companyName}
                  {note.conferenceName ? ` · ${note.conferenceName}` : ''}
                </p>
              )}
            </div>
            {/* The inset is ADDED to the padding, not substituted for it:
                .pb-safe would cut 20px down to 8px on a phone without a home
                indicator, which is most of them. */}
            <div className="flex flex-col gap-2 px-5 pt-4 pb-[calc(1.25rem+env(safe-area-inset-bottom))] sm:flex-row sm:flex-wrap">
              <button
                type="button"
                onClick={() => choose('meeting')}
                className="btn-primary flex-1 whitespace-nowrap py-2 text-sm"
              >
                Meeting
              </button>
              <button
                type="button"
                onClick={() => choose('touchpoint')}
                className="btn-primary flex-1 whitespace-nowrap py-2 text-sm"
              >
                Touchpoint
              </button>
              {/* Only offered when there is a record to file it against. With
                  no company there is nowhere for Suggested Updates to show it,
                  and a button that silently does nothing is worse than none. */}
              {companyId != null && (
                <button
                  type="button"
                  onClick={saveForLater}
                  disabled={saving}
                  className="btn-secondary flex-1 whitespace-nowrap py-2 text-sm disabled:opacity-50"
                >
                  {saving ? 'Saving…' : 'Review later'}
                </button>
              )}
              <button
                type="button"
                onClick={() => setPending(null)}
                disabled={saving}
                className="btn-secondary flex-1 whitespace-nowrap py-2 text-sm disabled:opacity-50"
              >
                Disregard
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}

      {/* Opens on Log, not Schedule: the note said it already happened. */}
      {opened === 'meeting' && (
        <NewMeetingModal
          isOpen
          onClose={closeModal}
          onSuccess={closeModal}
          defaultMode="log"
          prefillCompanyId={target.companyId ?? undefined}
          prefillAttendeeId={target.attendeeId ?? undefined}
          defaultConferenceId={target.conferenceId ?? undefined}
        />
      )}

      {opened === 'touchpoint' && (
        <TouchpointQuickModal
          onClose={closeModal}
          defaultCompanyId={target.companyId}
          defaultAttendeeId={target.attendeeId}
          defaultConferenceId={target.conferenceId}
        />
      )}
    </>
  );
}
