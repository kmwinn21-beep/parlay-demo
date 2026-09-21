'use client';

/**
 * What a note just saved was about, for anything that wants to read it.
 *
 * `entityType` and `entityId` are what the vendor prompt has always needed:
 * enough to go and ask the server what it extracted. Everything below them is
 * OPTIONAL and was added for the activity chooser, which reads the note itself
 * in the browser and so needs the text and the records it was filed against.
 *
 * Optional on purpose. Ten flows call this, they were all written before any
 * of these fields existed, and a required field would have broken every one of
 * them — a listener that gets nothing simply has nothing to offer, which is
 * the same as the behaviour before it was added.
 */
export interface NoteSavedContext {
  /** The note as written. Without it the activity chooser stays silent. */
  text?: string | null;
  /**
   * The row this became, when the flow that saved it kept the response.
   *
   * Scopes a deferred suggestion to its note, the way an extracted one is —
   * the unique index is (COALESCE(source_note_id, 0), dedupe_key). Without it
   * a suggestion lands in the 0 bucket, where two notes saying the same thing
   * about the same company collapse into one card. That is a reasonable answer
   * rather than a wrong one, which is why this stays optional.
   */
  noteId?: number | null;
  conferenceId?: number | null;
  conferenceName?: string | null;
  companyId?: number | null;
  companyName?: string | null;
  attendeeId?: number | null;
  attendeeName?: string | null;
  /**
   * The note's own record of what wrote it. A note posted BY the touchpoint
   * form or the meeting log describes exactly what the scanner looks for, so
   * passing these through is what stops the chooser offering to log something
   * that was just logged. See shouldScanNote in ./activityScan.
   */
  touchpointType?: string | null;
  noteType?: string | null;
  meetingId?: number | null;
  tag?: string | null;
}

/** What the prompt needs to know to go looking. */
export interface NoteSavedDetail extends NoteSavedContext {
  entityType: 'attendee' | 'company' | 'conference' | string;
  entityId: number;
}

export const NOTE_SAVED_EVENT = 'parlay:note-saved';

/**
 * Tell the app a note was just written.
 *
 * An event rather than a prop, because notes are saved from a dozen places —
 * a modal, a record section, a drawer, the meeting log — and none of them
 * should have to know that suggestions exist, let alone wire a callback up
 * through whatever is rendering them.
 *
 * Extraction runs after the response, so nothing is ready yet; the listener
 * waits for it.
 */
export function announceNoteSaved(
  entityType: string,
  entityId: number | null | undefined,
  context?: NoteSavedContext,
) {
  if (typeof window === 'undefined' || !entityId) return;
  window.dispatchEvent(new CustomEvent<NoteSavedDetail>(NOTE_SAVED_EVENT, {
    detail: { ...context, entityType, entityId: Number(entityId) },
  }));
}
