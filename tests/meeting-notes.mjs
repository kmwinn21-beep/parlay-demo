/**
 * Notes that belong to one meeting.
 *
 *   node --experimental-strip-types --import ./tests/register-ts.mjs \
 *        tests/meeting-notes.mjs
 *
 * Internal notes about a meeting — what to bring, who not to say it in front
 * of — kept on that meeting and nowhere else. Every other note in this app is
 * written three times, against the attendee, the company and the conference,
 * which is what makes it readable from any of them. These are deliberately not.
 *
 * That property is a consequence of where they are stored rather than a rule
 * anything enforces: they are `entity_type = 'meeting'` rows, and the company's
 * notes section asks for company rows, the attendee's for attendee rows. A
 * meeting row is in none of those answers because nobody asked for it.
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

/* `{}` is what stripping a JSX comment leaves; `accept="image/*"` is not a
   comment opener, however much the usual one-liner thinks it is. */
const strip = (f) => readFileSync(f, 'utf8')
  .replace(/(^|[\s{(,;])\/\*[\s\S]*?\*\//g, '$1').replace(/^\s*\/\/.*$/gm, '');

const table = strip('components/MeetingsTable.tsx');
const modal = strip('components/NewMeetingModal.tsx');
const drawer = strip('components/EntityNotesDrawer.tsx');
const parts = strip('components/SocialEventCardParts.tsx');
const route = strip('app/api/meetings/[id]/route.ts');

console.log('\n— the same drawer, not a second one —');
{
  /*
   * Written for social events and generalised when meetings wanted it. The
   * second caller got the component rather than a copy, which is the mistake
   * that put the note fan-out in nine files and got one of them wrong.
   */
  eq('the drawer is about an entity, not an event', /export function EntityNotesDrawer\(\{/.test(drawer), true);
  eq('  taking the type from its caller', /entityType: string;/.test(drawer), true);
  eq('  and asking for that type’s notes',
    /entity_type=\$\{entityType\}&entity_id=\$\{entityId\}/.test(drawer), true);
  eq('  and writing them back the same way',
    /entity_type: entityType,\n\s*entity_id: entityId,/.test(drawer), true);
  eq('nothing is left naming social events', /social_event/.test(drawer), false);

  const events = strip('components/SocialEventsTable.tsx');
  eq('the social events still get theirs', /entityType="social_event"/.test(events), true);
  eq('  and the meetings table asks for its own', /entityType="meeting"/.test(table), true);
}

console.log('\n— a button where the request asked for one —');
{
  // Between the outcome and the kebab on a row; left of the kebab on a card.
  eq('the row has one', /<CardNotesButton\n\s*count=\{meetingNoteCounts\[m\.id\] \?\? 0\}/.test(table), true);
  eq('  and so does the card, on a phone too', /onPhone\n/.test(table), true);
  /*
   * A social event's card hides this below sm because its menu offers the same
   * thing a few pixels away. A meeting's menu has no notes entry, so there the
   * button IS the way in.
   */
  eq('the button can be told to show on a phone', /onPhone \? 'flex' : 'hidden sm:flex'/.test(parts), true);

  /*
   * Two counts with two meanings. `noteCounts` in this file is keyed by
   * ATTENDEE id and counts that person's notes for the conference; sharing one
   * map would have shown one row's number on another.
   */
  eq('the meeting counts are their own map', /const \[meetingNoteCounts, setMeetingNoteCounts\]/.test(table), true);
  eq('  fetched for every row at once', /entity_type=meeting&entity_ids=\$\{meetingIdKey\}/.test(table), true);

  /*
   * And the tooltip says which notes these are. The kebab a few pixels away
   * offers Company Notes, which means the attendee's.
   */
  eq('the tooltip names them', /return 'Meeting notes';/.test(table), true);
  eq('  and counts them', /\$\{count\} meeting note\$\{count === 1 \? '' : 's'\}/.test(table), true);
}

console.log('\n— and the two are told apart by name —');
{
  /*
   * One row, two ways in: the button on the row opens this meeting's own
   * notes, the kebab opens the attendee's notes for the conference. Both used
   * to say "Notes" somewhere, which is the one thing that makes them
   * indistinguishable.
   */
  eq('the panel says which notes it is showing', /tabLabel="Pre-Meeting Notes"/.test(table), true);
  eq('  because the panel takes its own label', /tabLabel = 'Notes'/.test(drawer), true);
  eq('  and renders it instead of a fixed word', /\{tabLabel\}/.test(drawer), true);
  eq('the kebab says whose notes it opens', /\n\s*Company Notes\n/.test(table), true);
  eq('  and nothing is left saying just View Notes', /^\s*View Notes$/m.test(table), false);
}

console.log('\n— opening it anchors to the row, like the other panel —');
{
  /*
   * The requested behaviour, which the attendee panel already had: the panel's
   * top edge meets the top edge of its row, the row lights and the rest dim.
   * Measured rather than computed — the rows are not all one height.
   */
  eq('the panel is anchored to its row',
    /useAnchoredDrawer\(\{\n\s*open: notesMeetingId != null && !isPhone,/.test(table), true);
  eq('  against the row carrying that meeting’s id',
    /anchorKey: notesMeetingId != null \? String\(notesMeetingId\) : null,/.test(table), true);
  eq('  with its own panel to measure', /panelRef: meetingNotesPanelRef,/.test(table), true);
  eq('  offset so its top meets the row’s', /paddingTop: meetingNotesOffset/.test(table), true);
  eq('  and room below so a low row can still be scrolled to',
    /style=\{\{ height: meetingNotesOverhang \}\}/.test(table), true);

  // The row lights for EITHER panel: they are one slot showing two kinds of
  // note, and the reader needs to know which row they are reading about.
  eq('the row is emphasised while it is open',
    /const emphasisedMeetingId = notesMeetingId != null && !isPhone\n\s*\? notesMeetingId/.test(table), true);
  eq('  and the others dim', /otherFocused: emphasisedMeetingId != null && emphasisedMeetingId !== m\.id,/.test(table), true);

  /*
   * Which only works because they are never both open. They share one wrap and
   * one slot on screen; two panels there would overlap, and two lit rows would
   * answer the same question twice.
   */
  eq('opening this one closes the other',
    /openMeetingNotes = useCallback\(\(id: number\) => \{\n\s*setNotesView\(null\);\n\s*setNotesMeetingId\(id\);/.test(table), true);
  eq('  and the button on the row goes through it', /onClick=\{\(\) => openMeetingNotes\(m\.id\)\}/.test(table), true);

  /*
   * Built once and placed twice. The button is on the mobile card as well as
   * the row, and the kanban and cards-only views have no row to anchor to — a
   * panel rendered only beside the table answers that tap with nothing.
   */
  eq('the panel itself is built once', (table.match(/<EntityNotesDrawer/g) ?? []).length, 1);
  eq('  anchored where there is a table', /const notesAnchorable = !cardsOnly && viewMode === 'table';/.test(table), true);
  eq('  and on its own where there is not', /\{meetingNotesDrawer && !notesAnchorable && \(/.test(table), true);
}

console.log('\n— written as the meeting is booked —');
{
  eq('the schedule modal offers it', /\{isLog \? 'Meeting Notes' : 'Pre-Meeting Notes'\}/.test(modal), true);
  // The request was "the same row as the Additional Attendees button".
  eq('  beside Additional Attendees', /<AdditionalAttendeesButton[\s\S]{0,400}onClick=\{\(\) => setShowMeetingNote/.test(modal), true);
  eq('  revealing one box', /placeholder="Anything the team should know walking in…"/.test(modal), true);
  eq('  and saying where it goes', /Stays on this meeting\. Not added to the attendee, the company or the conference\./.test(modal), true);

  // Empty is empty: a box opened and left blank writes nothing, rather than an
  // empty note that gives the row a count of one.
  eq('a blank box writes nothing', /if \(meetingNote\.trim\(\)\) \{/.test(modal), true);
  eq('  and a filled one writes to the meeting',
    /entity_type: 'meeting',\n\s*entity_id: Number\(created\.id\),/.test(modal), true);
  eq('  notifying nobody', /skip_notification: true,/.test(modal), true);
}

console.log('\n— and they go when the meeting goes —');
{
  /*
   * entity_notes is polymorphic, so no foreign key can do this: the column
   * holding the id does not know which table it names. Driven against a real
   * SQLite database — meeting 1 and its two notes gone, the attendee, company
   * and conference notes untouched, and another meeting's note untouched.
   */
  eq('the delete takes the meeting’s notes',
    /DELETE FROM entity_notes WHERE entity_type = 'meeting' AND entity_id = \?/.test(route), true);
  eq('  before the meeting itself',
    route.indexOf("DELETE FROM entity_notes WHERE entity_type = 'meeting'") < route.indexOf('DELETE FROM meetings WHERE id = ?'), true);
  // Only this meeting's, and only meeting rows.
  eq('  and nothing else’s', /DELETE FROM entity_notes WHERE entity_type = 'meeting' AND entity_id = \?/.test(route), true);
}

console.log('\n— and they stay off every other record —');
{
  /*
   * The whole point. A note written anywhere else is copied out; this one is
   * not, and the test for it is that nothing in either surface posts a second
   * copy of it to an attendee, a company or a conference.
   */
  const meetingWrite = modal.slice(modal.indexOf("if (meetingNote.trim())"), modal.indexOf("if (meetingNote.trim())") + 900);
  eq('the modal writes one row', (meetingWrite.match(/entity_type:/g) ?? []).length, 1);
  eq('  and it is the meeting', /entity_type: 'meeting'/.test(meetingWrite), true);
  // The drawer posts whatever type it was given and nothing besides.
  eq('the drawer writes one row', (drawer.match(/entity_type:/g) ?? []).length, 1);
  // And nothing asks the server to cascade them.
  eq('nothing asks for a cascade', /cascade: true/.test(modal) || /cascade: true/.test(drawer), false);
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
