'use client';

import { useEffect, useState } from 'react';
import { SlideInPanel } from '@/components/SlideInPanel';
import { NoteSheetHeader, NoteSheetBody, type NoteSheetHead } from '@/components/NoteSheetLayout';
import { noteTagsOf, type PopoverNote } from '@/components/NotesPopoverCard';
import { orderNotes } from '@/lib/noteOrder';
/* The same disc the feed and the notes popover give an author, so one person
   is one colour wherever their note is read. An author-colour of my own both
   duplicated this and hashed worse: h*31 mod a 6-colour palette collapses to
   the sum of the character codes, and three of seven real rep names came out
   the same amber. */
import { avatarColour, initials } from '@/lib/authorAvatar';

/**
 * A meeting's notes, read in the drawer the follow-ups table already uses.
 *
 * They were a popover anchored to the kebab that opened it: a floating card
 * with a two-column table of dates and truncated text. The same note reached
 * from the dashboard feed was a dialog with the author at the top, the tags
 * under them and the note in full. Two layouts for one note.
 *
 * This is the follow-up row's container — SlideInPanel, with its scale-from-top
 * open and Escape to close — holding the feed's own note layout. Nothing here
 * is new: both halves already existed and were simply never put together.
 */

/** 'YYYY-MM-DD HH:MM:SS' → '08/27/2026 at 9:14 AM'. */
function formatWhen(raw: string): string {
  const d = new Date(String(raw ?? '').replace(' ', 'T'));
  if (Number.isNaN(d.getTime())) return raw;
  return `${d.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' })} at ${
    d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;
}

/** The amber disc the tables already use to mark a record with a pinned note. */
function PinnedBadge() {
  return (
    <span
      title="Pinned note"
      className="flex-shrink-0 inline-flex items-center gap-1 pl-1 pr-2 py-0.5 rounded-full bg-amber-400 text-white text-[10px] font-semibold"
    >
      <span className="inline-flex items-center justify-center w-3.5 h-3.5">
        <svg className="w-2.5 h-2.5" viewBox="0 0 24 24" fill="currentColor">
          <path d="M16 12V4h1V2H7v2h1v8l-2 2v2h5.2v6h1.6v-6H18v-2l-2-2z" />
        </svg>
      </span>
      Pinned
    </span>
  );
}

export function MeetingNotesPanel({
  attendeeId, attendeeName, subtitle, conferenceName, onClose, onCountChange, onAddNote, onOpenRecord,
}: {
  attendeeId: number;
  attendeeName: string;
  subtitle?: string;
  /** Scoped to one conference, as the popover was: the panel hangs off a row. */
  conferenceName?: string;
  onClose: () => void;
  onCountChange?: (count: number) => void;
  onAddNote?: () => void;
  onOpenRecord?: () => void;
}) {
  const [notes, setNotes] = useState<PopoverNote[]>([]);
  const [pinned, setPinned] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/notes?entity_type=attendee&entity_id=${attendeeId}`)
      .then(r => (r.ok ? r.json() : []))
      .then(async (data: PopoverNote[]) => {
        if (cancelled) return;
        const rows = Array.isArray(data) ? data : [];
        const scoped = conferenceName
          ? rows.filter(n => (n.conference_name ?? '') === conferenceName)
          : rows;
        setNotes(scoped);
        onCountChange?.(scoped.length);
        if (scoped.length === 0) { setPinned(new Set()); return; }
        /*
         * Which of these are pinned, in one request for the whole list rather
         * than one per note. A failure leaves the set empty, so the panel
         * falls back to plain date order — losing the pin's position, not the
         * notes.
         */
        try {
          const ids = scoped.map(n => n.id).join(',');
          const res = await fetch(`/api/pinned-notes?note_ids=${ids}`);
          const pinnedIds: number[] = res.ok ? await res.json() : [];
          if (!cancelled) setPinned(new Set(Array.isArray(pinnedIds) ? pinnedIds.map(Number) : []));
        } catch { /* see above */ }
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
    // onCountChange is an inline arrow at every call site; depending on its
    // identity would refetch on every render that reported a count.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attendeeId, conferenceName]);

  const ordered = orderNotes(notes, pinned);

  return (
    <SlideInPanel
      fitContent
      title={<span className="text-sm">{attendeeName}</span>}
      subtitle={subtitle}
      onClose={onClose}
      footer={(onAddNote || onOpenRecord) ? (
        <div className="flex items-center justify-between gap-2">
          {onAddNote ? (
            <button
              type="button"
              onClick={onAddNote}
              className="text-xs font-medium text-brand-secondary hover:underline flex items-center gap-1.5"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
              Add New Note
            </button>
          ) : <span />}
          {onOpenRecord && (
            <button type="button" onClick={onOpenRecord} className="text-xs font-medium text-brand-secondary hover:underline">
              Open record →
            </button>
          )}
        </div>
      ) : undefined}
    >
      {loading ? (
        <p className="px-5 py-8 text-sm text-gray-400 text-center">Loading notes…</p>
      ) : ordered.length === 0 ? (
        <p className="px-5 py-8 text-sm text-gray-400 text-center">
          {conferenceName ? `No notes for ${conferenceName} yet.` : 'No notes yet.'}
        </p>
      ) : (
        <div className="divide-y divide-gray-100">
          {ordered.map(note => {
            const author = note.rep || 'Unknown';
            const head: NoteSheetHead = {
              authorName: author,
              authorInitials: initials(author),
              authorColour: avatarColour(author),
              when: formatWhen(note.created_at),
              /* No subject line: the panel is already titled with the attendee,
                 and repeating "Note on <name>" above every note says the same
                 thing once per note. */
              tags: noteTagsOf(note),
              conference: note.conference_name,
            };
            return (
              <div key={note.id}>
                {pinned.has(note.id) && (
                  /* Above the author rather than beside the tags: it is why
                     this note is first, which is a fact about the list's order
                     and not another label on the note. */
                  <div className="px-5 pt-4 -mb-2"><PinnedBadge /></div>
                )}
                <NoteSheetHeader head={head} />
                <div className="px-5 py-4">
                  <NoteSheetBody>{note.content}</NoteSheetBody>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </SlideInPanel>
  );
}
