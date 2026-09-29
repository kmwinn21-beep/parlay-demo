'use client';

import { titleCase } from '@/lib/noteTags';

/**
 * The pills a note wears, wherever it is read.
 *
 * A note is shown in three places — the attendee's record, the feed, and the
 * card that hangs off a meeting row — and each had drawn its own tags. They
 * are the same facts about the same note, so they are drawn once here and the
 * three read alike.
 *
 * The attendee's own name is deliberately not among them. On the record it is
 * the heading, and in the feed it is the subject line directly above; a pill
 * repeating it is a pill nobody needs.
 */

const BASE = 'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border whitespace-nowrap flex-shrink-0';

/** Which conference the note was captured at. Trails the row: least specific. */
export function NoteConferencePill({ name }: { name: string }) {
  return (
    <span className={`${BASE} bg-blue-50 text-brand-secondary border-blue-100`} title={name}>
      {name}
    </span>
  );
}

/** Captured alongside a meeting, rather than typed against the record. */
export function MeetingNotePill() {
  return (
    <span className={`${BASE} gap-1 bg-purple-50 text-purple-700 border-purple-200`}>
      <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
        <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm-1-9c0-.55.45-1 1-1s1 .45 1 1v6c0 .55-.45 1-1 1s-1-.45-1-1V5zm6 6c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" />
      </svg>
      Meeting Note
    </span>
  );
}

/** The company the note is about. */
export function NoteCompanyPill({ name }: { name: string }) {
  return <span className={`${BASE} bg-teal-50 text-teal-700 border-teal-200`}>{name}</span>;
}

/**
 * Anything else a note carries — an outcome, a touchpoint, a stored type.
 *
 * Stored values arrive in the shape they were written in: `meeting_note` is
 * the note_type column, not a phrase anybody chose. Underscores become spaces
 * and the words are capitalised, so a tag reads as a tag rather than as a
 * column name that leaked into the page.
 */
export function NoteTagPill({ label }: { label: string }) {
  return <span className={`${BASE} bg-gray-100 text-gray-600 border-gray-200`}>{titleCase(label)}</span>;
}
