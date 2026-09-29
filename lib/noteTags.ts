/**
 * The tags a note carries, as they are stored and as they are read.
 *
 * Stored values arrive in the shape they were written in — `meeting_note` is
 * the note_type column, not a phrase anybody chose — and more than one writer
 * has put the words in instead. Both are read here so a note tagged either way
 * wears the same pill.
 *
 * In lib rather than beside the pills that draw them: this is the part with
 * rules in it, and a module that renders JSX cannot be run by a test.
 */

/** Underscores become spaces, words gain their capitals. */
export function titleCase(raw: string): string {
  return raw
    .split(/[_\s]+/)
    .filter(Boolean)
    .map(w => w[0].toUpperCase() + w.slice(1))
    .join(' ');
}

/** Whether a stored tag is the meeting-note one, in any of its spellings. */
export function isMeetingNoteTag(raw: string): boolean {
  return raw.trim().toLowerCase().replace(/[\s_]+/g, '') === 'meetingnote';
}
