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
  // Drawn once and imported, so the feed and the record cannot drift apart.
  for (const [name, src] of [['the feed', feed], ['the attendee record', noteCard]]) {
    eq(`${name} uses the shared pills`,
      /from '@\/components\/NotePills'/.test(src), true);
  }
  eq('the record draws no meeting-note pill of its own',
    /bg-purple-50 text-purple-700/.test(noteCard), false);
  eq('  nor its own conference pill',
    /bg-blue-50 text-brand-secondary/.test(noteCard), false);

  // The attendee's own name is not among them: on the record it is the
  // heading, and in the feed it is the subject line directly above.
  eq('no pill repeats the attendee', /attendee_name|item\.subject/.test(pills), false);

  // Conference trails the row, as it does on the record — least specific last.
  const sheetPills = feed.slice(feed.indexOf('<ScrollRow className="mt-2"'), feed.indexOf('</ScrollRow>', feed.indexOf('<ScrollRow className="mt-2"')));
  eq('the conference trails the row',
    sheetPills.indexOf('item.pills.map') < sheetPills.indexOf('NoteConferencePill'), true);
  eq('  and the row scrolls rather than wrapping',
    /<ScrollRow className="mt-2"/.test(feed), true);
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
  eq('the card opens as the sheet below sm',
    /if \(isPhone\) \{\s*\n\s*return <NoteSheet/.test(popover), true);
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
