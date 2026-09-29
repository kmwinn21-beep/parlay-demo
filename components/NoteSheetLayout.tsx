'use client';

import { ScrollRow } from '@/components/ScrollRow';
import { MeetingNotePill, NoteConferencePill, NoteTagPill } from '@/components/NotePills';
import { isMeetingNoteTag } from '@/lib/noteTags';

/**
 * A note as it is read in a sheet: who wrote it and when, what it is about,
 * what it is tagged with, and then the note.
 *
 * Drawn here rather than in each sheet that opens one. A note reached from the
 * feed and the same note reached from a meeting row are the same note, and the
 * two had grown different layouts — one a dialog with the author at the top,
 * the other a two-column table of dates and text.
 */

/** Everything the head of a note needs, however the caller stores it. */
export interface NoteSheetHead {
  /** Who wrote it. Initials go in the disc; the name sits beside it. */
  authorName: string;
  authorInitials: string;
  /** Any CSS colour — callers seed this from their own palette. */
  authorColour: string;
  /** Already formatted: the callers disagree about how to get at a date. */
  when: string;
  /** "Note on", "Added a note to" — whatever the surface calls the action. */
  actionPrefix: string;
  /** The record the note is about. */
  subject: string;
  /** Stored tags — `meeting_note`, a status, a touchpoint. */
  tags: string[];
  conference?: string | null;
}

export function NoteSheetHeader({ head, titleId, onClose }: {
  head: NoteSheetHead;
  titleId?: string;
  onClose?: () => void;
}) {
  return (
    <div className="px-5 pt-5 pb-3 border-b border-gray-100 flex-shrink-0">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <span
            className="w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center text-white text-[10px] font-semibold"
            style={{ backgroundColor: head.authorColour }}
          >
            {head.authorInitials}
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-gray-800 truncate">{head.authorName}</p>
            {/* The full timestamp, not "3w" — a note being read in full is
                being read for the record, and "3w ago" is not a date. */}
            <p className="text-[11px] text-gray-400">{head.when}</p>
          </div>
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 flex-shrink-0"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      <p id={titleId} className="text-sm text-gray-700 mt-3 leading-snug">
        {head.actionPrefix}{' '}
        <span className="font-semibold text-brand-primary">{head.subject}</span>
      </p>

      {/* The same tags, in the same shapes, as the note wears on the attendee's
          own record — one scrolling line, conference last because it is the
          least specific of them. The attendee is the subject line directly
          above, so no pill repeats it. */}
      <NoteSheetTags tags={head.tags} conference={head.conference} />
    </div>
  );
}

export function NoteSheetTags({ tags, conference }: { tags: string[]; conference?: string | null }) {
  if (tags.length === 0 && !conference) return null;
  return (
    <ScrollRow className="mt-2" gapClass="gap-2">
      {tags.map(t => (
        isMeetingNoteTag(t) ? <MeetingNotePill key={t} /> : <NoteTagPill key={t} label={t} />
      ))}
      {conference && <NoteConferencePill name={conference} />}
    </ScrollRow>
  );
}

/**
 * The note itself.
 *
 * `whitespace-pre-wrap` because notes are typed with line breaks, and the card
 * they are read from clamps to two lines and hid that they existed at all.
 */
export function NoteSheetBody({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap break-words">{children}</p>
  );
}

/** The row of actions along the bottom of the sheet. */
export function NoteSheetFooter({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-5 py-3 border-t border-gray-100 flex items-center justify-end gap-2 flex-shrink-0">
      {children}
    </div>
  );
}
