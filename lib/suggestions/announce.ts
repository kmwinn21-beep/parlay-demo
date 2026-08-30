'use client';

/** What the prompt needs to know to go looking. */
export interface NoteSavedDetail {
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
export function announceNoteSaved(entityType: string, entityId: number | null | undefined) {
  if (typeof window === 'undefined' || !entityId) return;
  window.dispatchEvent(new CustomEvent<NoteSavedDetail>(NOTE_SAVED_EVENT, {
    detail: { entityType, entityId: Number(entityId) },
  }));
}
