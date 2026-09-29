/**
 * Reading a note on a phone: the sheet, and the tags it wears.
 *
 *   node --experimental-strip-types --import ./tests/register-ts.mjs \
 *        tests/note-sheet.mjs
 *
 * A note is read in three places — the attendee's own record, the feed, and
 * the card that hangs off a meeting row — and the last two drew their own
 * chrome and their own tags. Two of them are now the same sheet wearing the
 * same pills as the first.
 *
 * The sheet's SPAN is the part worth writing down: it is fixed from just under
 * the app header to the bottom edge, rather than sized to the note. A
 * two-line note in a content-height sheet opens as a strip along the bottom of
 * the screen, which is what this replaces. The geometry itself was measured in
 * Chromium; what is here is the rules that produce it.
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

const { titleCase, isMeetingNoteTag } = await import('@/lib/noteTags');

const sheet = strip('components/NoteSheet.tsx');
const css = readFileSync('app/globals.css', 'utf8');
const feed = strip('components/DashboardFeed.tsx');
const popover = strip('components/NotesPopoverCard.tsx');
const noteCard = strip('components/NoteCard.tsx');
const pills = strip('components/NotePills.tsx');
const layout = strip('components/NoteSheetLayout.tsx');

console.log('\n— the sheet fills a fixed span, not the note —');
{
  // Top and bottom both pinned: the height is the span between them, so a
  // short note opens where a long one does.
  const rule = css.slice(css.indexOf('.note-sheet {'), css.indexOf('}', css.indexOf('.note-sheet {')));
  eq('it is fixed to the viewport', /position: fixed;/.test(rule), true);
  eq('  starting under the header', /top: var\(--sheet-top, 0px\);/.test(rule), true);
  eq('  and ending at the bottom edge', /bottom: 0;/.test(rule), true);
  eq('  with no height of its own', /height:|max-height:/.test(rule), false);

  // From sm it is the centred dialog it always was, so the desktop reading of
  // a note is untouched.
  const wide = css.slice(css.indexOf('@media (min-width: 640px) {', css.indexOf('.note-sheet {')));
  const wideRule = wide.slice(wide.indexOf('.note-sheet {'), wide.indexOf('}', wide.indexOf('.note-sheet {')));
  eq('from sm it stops being fixed', /position: static;/.test(wideRule), true);
  eq('  and is capped again', /max-height: 80vh;/.test(wideRule), true);
}

console.log('\n— the top is measured, not assumed —');
{
  /*
   * Banners sit above the header and arrive after their own fetch, so the
   * header's bottom edge is not a number anyone can write down once. Measured
   * off the element, re-measured when it resizes.
   */
  eq('the header is found by an attribute it carries',
    /document\.querySelector\('\[data-app-header\]'\)/.test(sheet), true);
  eq('  which the header actually sets',
    /<header data-app-header/.test(strip('components/Header.tsx')), true);
  eq('  read as its bottom edge, so banners above it count',
    /getBoundingClientRect\(\)\.bottom/.test(sheet), true);
  eq('  never negative', /Math\.max\(0,/.test(sheet), true);
  eq('  and re-read when the header changes size',
    /new ResizeObserver\(measure\)/.test(sheet), true);
  eq('  or the window does', /addEventListener\('resize', measure\)/.test(sheet), true);

  // It rises from the bottom on a phone and fades in from sm — the site's
  // existing sheet animation rather than a second one.
  eq('it rises from the bottom edge', /modal-sheet-mobile/.test(sheet), true);
  const anim = css.slice(css.indexOf('.modal-sheet-mobile {'), css.indexOf('.modal-sheet-mobile {') + 400);
  eq('  which is the slide-up', /animation: slideInUp/.test(anim), true);
}

console.log('\n— one note, three places, one set of tags —');
{
  // Drawn once and imported, so the three cannot drift apart. The feed and
  // the meeting row's card reach them through the shared LAYOUT, which is
  // what makes those two identical rather than merely similar.
  eq('the attendee record uses the shared pills',
    /from '@\/components\/NotePills'/.test(noteCard), true);
  for (const [name, src] of [['the feed', feed], ['the meeting row\u2019s card', popover]]) {
    eq(`${name} uses the shared layout`,
      /from '@\/components\/NoteSheetLayout'/.test(src), true);
  }
  eq('  and neither lays out a note of its own',
    /px-5 pt-5 pb-3 border-b border-gray-100/.test(feed + popover), false);
  eq('the record draws no meeting-note pill of its own',
    /bg-purple-50 text-purple-700/.test(noteCard), false);
  eq('  nor its own conference pill',
    /bg-blue-50 text-brand-secondary/.test(noteCard), false);

  // The attendee's own name is not among them: on the record it is the
  // heading, and in the feed it is the subject line directly above.
  eq('no pill repeats the attendee', /attendee_name|item\.subject/.test(pills), false);

  // Conference trails the row, as it does on the record — least specific last.
  const sheetPills = layout.slice(layout.indexOf('function NoteSheetTags'), layout.indexOf('export function NoteSheetBody'));
  eq('the conference trails the row',
    sheetPills.indexOf('tags.map') < sheetPills.indexOf('NoteConferencePill'), true);
  eq('  and the row scrolls rather than wrapping', /<ScrollRow/.test(sheetPills), true);
  // Nothing at all rather than an empty line where the tags would be.
  eq('  and is not drawn when there are none',
    /if \(tags\.length === 0 && !conference\) return null;/.test(layout), true);
}

console.log('\n— a stored tag reads as a tag —');
{
  // `meeting_note` is the note_type column, not a phrase anyone chose.
  eq('the meeting-note tag is recognised', isMeetingNoteTag('meeting_note'), true);
  eq('  however it was written',
    ['Meeting Note', 'meeting note', 'MEETING_NOTE'].map(isMeetingNoteTag), [true, true, true]);
  eq('  and nothing else is', ['note', 'meeting', 'call_note'].map(isMeetingNoteTag), [false, false, false]);
  // Anything else keeps its words but loses the column shape it was stored in.
  eq('other tags lose their underscores', titleCase('touchpoint_type'), 'Touchpoint Type');
  eq('  and gain their capitals', titleCase('follow up'), 'Follow Up');
  eq('  without collapsing to nothing', titleCase(''), '');
}

console.log('\n— the meeting row s card is the same sheet on a phone —');
{
  eq('the card opens as the sheet below sm', /if \(isPhone\) \{/.test(popover), true);
  /*
   * The same LAYOUT, not just the same chrome.
   *
   * It was a two-column table of dates and text inside the sheet, which is a
   * second way of showing the one thing the feed already shows: who wrote it,
   * when, what it is about, what it is tagged with, and then the note.
   */
  eq('  laid out as the feed lays a note out',
    /<NoteSheetHeader[\s\S]{0,900}<NoteSheetBody>\{n\.content\}<\/NoteSheetBody>/.test(popover), true);
  eq('  with no table left in it', /<table|<thead|<tbody/.test(popover.slice(popover.indexOf('if (isPhone)'), popover.indexOf('return createPortal'))), false);
  // One block per note: the control asks for an attendee's notes, and there
  // can be several.
  eq('  one block per note', /notes\.map\(n =>/.test(popover), true);

  /*
   * Titled once, at the top.
   *
   * Every note in here belongs to the same person, so a "Note on Tina Thomas"
   * line above each of them says the same thing as many times as there are
   * notes. The sheet says it instead, and the note blocks carry no subject at
   * all — which is why the field is optional on the shared head.
   */
  eq('  the sheet is titled with the record',
    /<NoteSheetTitle title=\{`\$\{subject\} Notes`\}/.test(popover), true);
  eq('  and no note inside it names the record',
    /actionPrefix|subject:/.test(popover.slice(popover.indexOf('notes.map'), popover.indexOf('</NoteSheetFooter>'))), false);
  eq('  the subject line is optional on the shared head',
    /actionPrefix\?: string;\s*\n\s*subject\?: string;/.test(layout), true);
  eq('  and is not drawn without one',
    /\{head\.subject && \(/.test(layout), true);
  // One close, in the title bar, rather than one per note.
  eq('  one way out, in the title bar',
    (popover.slice(popover.indexOf('if (isPhone)'), popover.indexOf('return createPortal')).match(/aria-label="Close"/g) ?? []).length, 0);
  eq('    which the title bar provides', /aria-label="Close"/.test(layout), true);

  // The feed still names its subject: there the note arrives on its own, with
  // no heading above it saying whose it is.
  eq('the feed still says what its note is on', /actionPrefix: actionPrefix\(item\)/.test(feed), true);
  // The footer the feed has, and no more — writing a note is the kebab's own
  // Add Note entry, one item above the View Notes that opened this.
  const footer = popover.slice(popover.indexOf('<NoteSheetFooter>'), popover.indexOf('</NoteSheetFooter>'));
  eq('  the feed\u2019s two buttons', /Open \{subject\}[\s\S]{0,200}Close/.test(footer), true);
  eq('  and not a third that duplicates the menu', /Add New Note/.test(footer), false);
  // With a pointer it stays anchored to the control that opened it, which is
  // what makes it read as belonging to that row.
  eq('  and stays anchored with a pointer',
    /position: 'fixed',\s*\n\s*top: above \? anchor\.top : anchor\.bottom \+ PADDING/.test(popover), true);
  // One body, both shapes. Two copies would answer the same question twice.
  eq('  from one set of markup', (popover.match(/\{body\}/g) ?? []).length + (popover.match(/>\{body\}</g) ?? []).length >= 1, true);
  eq('  named for assistive tech', /labelledBy="notes-card-title"/.test(popover), true);
  eq('  and the name is on something', /id="notes-card-title"/.test(popover), true);

  // The list grows into the sheet on a phone and keeps its cap with a pointer,
  // where the card hangs off a row and must not run down the screen.
  eq('the list fills the sheet, and is capped in the card',
    /overflow-y-auto flex-1 sm:flex-none sm:max-h-64/.test(popover), true);
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
