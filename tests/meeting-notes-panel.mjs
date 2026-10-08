/**
 * A meeting's notes, read beside the table rather than in a popover.
 *
 *   node --experimental-strip-types --import ./tests/register-ts.mjs \
 *        tests/meeting-notes-panel.mjs
 *
 * View Notes opened a floating card with a two-column table of dates and
 * truncated text. The same note reached from the dashboard feed was a dialog
 * with the author at the top, the tags under them and the note in full — two
 * layouts for one note. On a pointer it is now the follow-up row's own
 * container holding the feed's own note layout; neither half is new.
 *
 * The ORDER is what is RUN here, because it is the part that cannot be read
 * off the markup: a pin is somebody saying "read this one first", and a list
 * that honours it only when the pinned note happens to be recent is not
 * honouring it at all.
 *
 * Driven in Chromium at 1440x900 with a pinned note dated BEFORE every other:
 * it comes out first wearing the amber pill, the rest follow newest first, and
 * the panel's top edge sits at 130 — the row's own top — with its right edge
 * at 1408.
 *
 * Exits non-zero on the first failing expectation, so it can gate a build.
 */
import { readFileSync } from 'node:fs';

let pass = 0;
let fail = 0;
const eq = (label, got, want) => {
  const g = JSON.stringify(got);
  const w = JSON.stringify(want);
  if (g === w) { pass++; console.log(`  ok   ${label}`); }
  else { fail++; console.log(`  FAIL ${label}\n       got  ${g}\n       want ${w}`); }
};

const strip = (f) => readFileSync(f, 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const { orderNotes } = await import('@/lib/noteOrder');
const ids = (rows) => rows.map(r => r.id);

console.log('\n— pinned first, then newest —');
{
  const NOTES = [
    { id: 1, created_at: '2026-08-20 09:00:00' },
    { id: 2, created_at: '2026-08-27 09:14:00' },
    { id: 3, created_at: '2026-08-10 08:00:00' },  // the pin, and the OLDEST
    { id: 4, created_at: '2026-08-25 12:00:00' },
  ];

  /*
   * The pinned note is the oldest of the four. If the sort merely stabilised
   * ties it would come last, which is the whole point of the case.
   */
  eq('the pin leads even when it is the oldest',
    ids(orderNotes(NOTES, new Set([3]))), [3, 2, 4, 1]);
  eq('  and the rest are newest first',
    ids(orderNotes(NOTES, new Set())), [2, 4, 1, 3]);

  // Two pins keep the same rule between themselves.
  eq('two pins are ordered by date as well',
    ids(orderNotes(NOTES, new Set([1, 3]))), [1, 3, 2, 4]);
  // A pin for a note that is not in this list changes nothing.
  eq('a pin on something else is ignored',
    ids(orderNotes(NOTES, new Set([99]))), [2, 4, 1, 3]);

  eq('nothing to order is nothing', ids(orderNotes([], new Set([3]))), []);
  // The input is not mutated: the caller holds it in state.
  const original = [...NOTES];
  orderNotes(NOTES, new Set([3]));
  eq('the list it was given is untouched', ids(NOTES), ids(original));
}

console.log('\n— and ties do not reshuffle —');
{
  /*
   * A batch import stamps every row with the same created_at, and a sort with
   * no tiebreak leaves their order undefined — so the list can come out
   * differently between two renders of the same data. The id breaks it,
   * highest first, which is "most recent" for rows written in sequence.
   */
  const SAME = [
    { id: 5, created_at: '2026-08-20 09:00:00' },
    { id: 7, created_at: '2026-08-20 09:00:00' },
    { id: 6, created_at: '2026-08-20 09:00:00' },
  ];
  eq('the same timestamp falls back to the id', ids(orderNotes(SAME, new Set())), [7, 6, 5]);

  /*
   * created_at is text in this database and has arrived both as
   * 'YYYY-MM-DD HH:MM:SS' and as an ISO string.
   */
  const MIXED = [
    { id: 1, created_at: '2026-08-20 09:00:00' },
    { id: 2, created_at: '2026-08-21T09:00:00Z' },
  ];
  eq('both stored shapes compare', ids(orderNotes(MIXED, new Set()))[0], 2);
  // A NaN would make every comparison against it false and leave the order
  // undefined, which is worse than putting the odd row at the end.
  eq('an unreadable date sorts last, not randomly',
    ids(orderNotes([{ id: 1, created_at: 'not a date' }, { id: 2, created_at: '2026-01-01' }], new Set())),
    [2, 1]);
}

console.log('\n— the panel is the follow-up drawer, with the feed’s notes in it —');
{
  const panel = strip('components/MeetingNotesPanel.tsx');

  // The container the follow-ups table uses for its own row detail.
  eq('it is a SlideInPanel', /<SlideInPanel/.test(panel), true);
  eq('  sized to its content', /fitContent/.test(panel), true);
  // And the layout the dashboard feed gives a note.
  eq('each note uses the feed’s own layout',
    /<NoteSheetHeader head=\{head\} \/>/.test(panel) && /<NoteSheetBody>/.test(panel), true);
  /* No subject line: the panel is already titled with the attendee, and
     "Note on <name>" above every note says the same thing once per note. */
  eq('  without repeating who it is about', /actionPrefix/.test(panel), false);
  // The same tags in the same order as the attendee's record, from the one
  // helper — a second copy of that list is a second order.
  eq('  and the same tags as the record', /noteTagsOf\(note\)/.test(panel), true);

  /*
   * The author's disc comes from the shared helper. Rolling my own both
   * duplicated it and hashed worse: h*31 into a six-colour palette collapses
   * to the sum of the character codes, and three of seven real rep names came
   * out the same amber. Measured after: Kevin Winn teal, Michael Verroco ochre.
   */
  eq('the author disc is the one the feed gives them',
    /avatarColour\(author\)/.test(panel), true);
  eq('  with no palette of its own', /AUTHOR_COLOURS/.test(panel), false);

  // The pin is marked, or being first says nothing about why.
  eq('a pinned note says it is pinned', /pinned\.has\(note\.id\) &&/.test(panel), true);
  eq('  in the amber the tables already use', /bg-amber-400 text-white/.test(panel), true);
  // One request for the whole list rather than one per note.
  eq('pins are looked up in one request', /pinned-notes\?note_ids=\$\{ids\}/.test(panel), true);
  // A failed lookup must lose the pin's POSITION, not the notes.
  eq('  and a failure still shows the notes', /catch \{ \/\* see above \*\/ \}/.test(readFileSync('components/MeetingNotesPanel.tsx', 'utf8')), true);
}

console.log('\n— opened beside the row that asked for it —');
{
  const table = strip('components/MeetingsTable.tsx');

  /*
   * The same hook, the same shape, as the follow-ups table's drawer: a column
   * at the table's right, offset so the panel's top meets its row. Measured —
   * panel top 130 against a row top of 130, right edge 1408 in a 1440
   * viewport. The offset is measured rather than computed because meeting
   * rows are not a uniform height; one with two attendees is taller.
   */
  eq('it uses the shared anchored-drawer hook', /useAnchoredDrawer\(\{/.test(table), true);
  eq('  finding the row by its own id',
    /tr\[data-meeting-id="\$\{CSS\.escape\(key\)\}"\]/.test(table), true);
  eq('  which the row carries', /data-meeting-id=\{m\.id\}/.test(table), true);
  eq('  in a column at the table’s right',
    /lg:absolute lg:inset-y-0 lg:right-0 lg:w-96/.test(table), true);
  // The spacer below the table, so a panel anchored near the bottom has
  // somewhere to scroll to.
  eq('  with room below for a panel near the end', /style=\{\{ height: notesOverhang \}\}/.test(table), true);

  /*
   * Desktop only. SlideInPanel's mobile form is a 75vh bottom sheet, and that
   * over the meeting card's own sheet is a worse answer than the popover that
   * is already there.
   */
  eq('a phone keeps the popover', /notesView && isPhone && \(/.test(table), true);
  eq('  and the panel is not drawn there', /notesView && !isPhone && \(/.test(table), true);
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
