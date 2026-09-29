/**
 * A meeting, on a phone and at a desk: what each view says, in what order, and
 * what cannot scroll away.
 *
 *   node --experimental-strip-types --import ./tests/register-ts.mjs \
 *        tests/meeting-card.mjs
 *
 * THE CARD carried the same facts before this, scattered: the time beside the
 * type, the location inside a scrolling strip of pills, the status next to the
 * rep, the support badges on a row of their own. Answering "when, where, and
 * did it happen" meant reading the whole card. Every value now sits under a
 * word saying what it is, in two rows.
 *
 * Source assertions rather than a render, for what a screenshot cannot show:
 * that the labels are in the order asked for, that the checkbox is OUTSIDE the
 * scrolling region, and that the pills the old strip carried were moved rather
 * than dropped. The layout itself, the support stack pushing the row along and
 * the chevrons, were checked in Chromium at phone width.
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

const SRC = 'components/MeetingsTable.tsx';
const table = strip(SRC);
const card = table.slice(table.indexOf('const renderMobileCard'), table.indexOf('const renderRow'));

console.log('\n— every value is under a word saying what it is —');
{
  // In the order asked for. Read out of the source in source order, so a label
  // moved is a label this notices — the point of the change is that a reader
  // knows where to look, and that is a claim about sequence.
  const labels = [...card.matchAll(/<p className=\{EYEBROW\}>([^<]+)<\/p>/g)].map(m => m[1]);
  eq('the first row answers when, where and how it went',
    labels.slice(0, 3), ['When', 'Where', 'Status']);
  eq('  and the second one, who and what',
    labels.slice(3), ['Rep', 'Support', 'Type', 'Value', 'Conference', 'Guests']);

  // One declared class. Written out at each site they drift, and a row of
  // labels that do not match reads as several things rather than one row.
  eq('the labels are one declared style',
    /const EYEBROW = 'text-\[9px\] uppercase tracking-wide text-gray-400 font-medium mb-1';/.test(table), true);
  eq('  used by every one of them',
    (card.match(/className=\{EYEBROW\}/g) ?? []).length, labels.length);
  eq('  with none writing its own',
    /text-\[9px\] uppercase tracking-wide/.test(card), false);

  // The values match each other too. Type is a plain rounded tag and Location
  // is a bordered pill, so they share no class list — but they sit on one row
  // under matching labels, and two text sizes read as two kinds of thing.
  eq('the values are all one text size', /const PILL_TEXT = 'text-\[\d+px\]';/.test(table), true);
  eq('  which the location pill takes', /rounded-full \$\{PILL_TEXT\} font-medium/.test(table), true);
  eq('  and the type tag takes as well',
    /\$\{PILL_TEXT\} text-gray-500 bg-gray-100[^`]*`}>\{m\.meeting_type\}/.test(card), true);
  eq('  with neither setting a size of its own',
    /text-xs[^`"]*>\{m\.meeting_type\}/.test(card), false);
}

console.log('\n— where, when nobody set a where —');
{
  // An empty slot that says what is missing and takes you to where it is
  // fixed. A blank reads as "no location needed" and a reader cannot tell the
  // difference between that and nobody having filled it in.
  eq('a missing location offers to take one',
    /\+ Location/.test(card), true);
  eq('  drawn as a placeholder, not a value',
    /border-dashed border-gray-300 text-gray-400/.test(card), true);
  eq('  and opens the edit form for this meeting',
    /onClick=\{\(\) => setEditingId\(m\.id\)\}[\s\S]{0,400}\+ Location/.test(card), true);
  // The real thing when there is one, with the same icon either way so the
  // slot does not change shape when it is filled.
  eq('a set location is the pill it always was',
    /\{m\.location \? \([\s\S]{0,400}<LocationIcon \/>/.test(card), true);
}

console.log('\n— what must not scroll away —');
{
  // Selecting rows is the one thing on this row that has to work without
  // hunting for it. Inside the ScrollRow it is reachable only after paging.
  const row = card.slice(card.indexOf('<ScrollRow'), card.indexOf('</div>', card.indexOf('</ScrollRow>')));
  eq('the checkbox is outside the scrolling region',
    row.indexOf('</ScrollRow>') < row.indexOf('type="checkbox"'), true);
  eq('  and cannot shrink',
    /type="checkbox"[\s\S]{0,400}flex-shrink-0/.test(card), true);
  // The row pages rather than wrapping, which is what carries the rest.
  eq('the rest of the row scrolls', /<ScrollRow className="flex-1 min-w-0"/.test(card), true);
}

console.log('\n— support keeps its stack, and its expansion —');
{
  eq('support is still the overlapping stack',
    /<p className=\{EYEBROW\}>Support<\/p>\s*\n\s*<OverlappingRepPills/.test(card), true);
  // The component owns the click-to-expand; the card must not have quietly
  // replaced it with a plain list while moving it.
  const pills = strip('components/OverlappingRepPills.tsx');
  eq('  which is what expands on click', /setExpanded\(/.test(pills), true);
  // ScrollRow watches its children, so a child that widens updates the
  // chevrons rather than overflowing silently.
  const scroll = strip('components/ScrollRow.tsx');
  eq('  and the row notices it widening',
    /Array\.from\(el\.children\)\.forEach\(c => ro\.observe\(c\)\)/.test(scroll), true);
}

console.log('\n— the size of the company, beside its name —');
{
  const header = card.slice(card.indexOf('relative flex items-start mb-2'), card.indexOf('AttendeeInitialsAvatar'));
  eq('the units pill sits in the company row',
    /m\.company_wse != null && \([\s\S]{0,300}bg-yellow-50 text-yellow-700/.test(header), true);
  /*
   * One cluster, laid out together.
   *
   * They were positioned separately, which meant guessing how wide the kebab
   * is in order to place the pill beside it — and the guess was short, so the
   * pill lost its right edge behind the menu's border. Side by side in a flex
   * row they cannot overlap whatever either one measures.
   */
  eq('  laid out beside the kebab rather than offset by a guess',
    /absolute right-0 top-0 flex items-start gap-1\.5 pl-1\.5 bg-white/.test(header), true);
  eq('  with no guessed offset left',
    /right-7/.test(table), false);
  eq('  and the kebab inside the same cluster',
    header.indexOf('flex items-start gap-1.5') < header.indexOf('<MeetingActionsMenu'), true);
  // It is a fact about the company, so it goes where the company name goes.
  // The GATE, not the padding expression on the same row — which also reads
  // "!hideCompany && m.company_wse != null" and satisfied a looser match.
  eq('  and is hidden wherever the company is',
    /\{!hideCompany && m\.company_wse != null && \(/.test(header), true);
  // The name scrolls UNDER the cluster rather than being cut off by it, so the
  // room reserved for that cluster has to grow when the pill joins it.
  eq('  with room reserved for it',
    /!hideCompany && m\.company_wse != null \? 'pr-24' : 'pr-9'/.test(header), true);
}

console.log('\n— the strip of pills it replaced left nothing behind —');
{
  // Conference and Guests were in that strip and are in neither of the rows
  // the design named. Relabelled and kept, because dropped they would simply
  // be gone from the card.
  eq('the conference survives', /<p className=\{EYEBROW\}>Conference<\/p>/.test(card), true);
  eq('  and so do the typed-in guests', /<p className=\{EYEBROW\}>Guests<\/p>/.test(card), true);
  // Only the typed-in ones: guests picked off the roster already have a
  // name-and-title row on the card, and a pill would repeat the line above it.
  eq('  which are only the typed-in names',
    /function mobileGuests[\s\S]{0,200}m\.additional_attendees \|\| ''/.test(table), true);

  // The old component is gone rather than orphaned. Left in place it would be
  // dead code that still compiles, and the next reader would have to work out
  // which of the two the card uses.
  eq('the old pill strip is deleted', /MeetingDetailPills/.test(readFileSync(SRC, 'utf8')), false);
}

console.log('\n— the desktop table gained a Location column —');
{
  const defs = strip('lib/useTableColumnConfig.ts');
  const conf = defs.slice(defs.indexOf('conference_meetings: ['), defs.indexOf(']', defs.indexOf('conference_meetings: [')));
  // Registered, or the Edit Tables screen cannot show, hide or move it — the
  // switch below would render a cell no admin can turn off.
  eq('it is a registered column', /\{ key: 'location',\s+label: 'Location' \}/.test(conf), true);
  // Beside the time: a meeting is at a time AND a place, and a rep checking
  // one is checking the other.
  const keys = [...conf.matchAll(/key: '(\w+)'/g)].map(m => m[1]);
  eq('  sitting next to the date', keys[keys.indexOf('datetime') + 1], 'location');

  eq('the table renders a cell for it', /case 'location': return <td key="location"/.test(table), true);
  eq('  and a header', /case 'location': return <th key="location"/.test(table), true);
  // The same pill as the card, so the two views agree about what a location
  // looks like, and an em-dash rather than a blank when there is none.
  eq('  showing the location pill', /case 'location':[\s\S]{0,300}<LocationIcon \/>/.test(table), true);
  eq('  and saying so when there is none',
    /case 'location':[\s\S]{0,400}text-gray-300">&mdash;</.test(table), true);
}

console.log('\n— and the title column made room for it —');
{
  const cell = table.slice(table.indexOf("case 'title': return <td"), table.indexOf("case 'rep': return <td"));
  // The span carrying the title itself — the guest titles under it truncate
  // too, and satisfied a looser match while the title above them wrapped.
  const flowSpan = cell.slice(cell.indexOf("title={m.title ?? ''}"), cell.indexOf('{m.title && ('));
  eq('the title is one line, cut short', /truncate/.test(flowSpan), true);
  eq('  with the full text still reachable without a pointer', /title=\{m\.title \?\? ''\}/.test(cell), true);

  // The expansion leaves the flow. A block inside the cell cannot be wider
  // than the cell, and widening the CELL re-measures an auto-layout table —
  // the whole thing would jump under the pointer.
  const overlayTag = cell.slice(cell.indexOf('{m.title && ('), cell.indexOf('>', cell.indexOf('pointer-events-none absolute')));
  eq('the expansion is taken out of the flow', /pointer-events-none absolute/.test(cell), true);
  eq('  and never swallows a click', /pointer-events-none/.test(cell), true);
  eq('  it is mounted and faded, not toggled', /opacity-0 transition-all/.test(cell), true);
  // Plain text, not a pill. The background is opaque only so the text stays
  // readable over the column it slides across; anything else — a border, a
  // rounding, a shadow — makes a title look like a status.
  eq('  and reads as text, not as a pill',
    /rounded|shadow|border/.test(overlayTag), false);
  /*
   * Two background layers, and both are needed.
   *
   * The tint alone is semi-transparent, so the column behind shows through the
   * expanded title and two lines of text sit on top of each other. White alone
   * is opaque but wrong: hovering the title hovers the row, so the row under
   * it is tinted and the expansion reads as a white hole in it. White with the
   * tint painted over it is the colour the row is already showing.
   */
  eq('  over an opaque background', /bg-white/.test(overlayTag), true);
  eq('  tinted to match the row it covers',
    /from-brand-highlight\/20 to-brand-highlight\/20/.test(overlayTag), true);
  eq('  growing on hover', /group-hover\/title:max-w-\[var\(--title-hover\)\]/.test(cell), true);
  eq('  from the group the cell declares', /group\/title/.test(cell), true);

  /*
   * Both widths reach the stylesheet as custom properties.
   *
   * This is the bug the first attempt had: the resting width was an inline
   * style, which beats any class, so the hover rule was applied and did
   * nothing at all. Asserted as the ABSENCE of an inline max-width on the
   * expanding span, because that is what silently disables the whole effect.
   */
  eq('the expanding span sets no inline width at all', /style=/.test(overlayTag), false);
  eq('  taking both from the table', /--title-rest[\s\S]{0,120}--title-hover/.test(table), true);
  eq('  which are declared once each',
    /const TITLE_WIDTH = \d+;\s*\nconst TITLE_HOVER_WIDTH = \d+;/.test(table), true);
}

console.log('\n— the outcome menu stays on the screen —');
{
  // To the next top-level function AFTER it. Naming a specific one is how the
  // slice comes out backwards when that function turns out to be declared
  // above this one.
  const from = table.indexOf('function OutcomeButton');
  const btn = table.slice(from, table.indexOf('\nfunction ', from + 1));

  // It opens left-aligned under the pill. On a phone the Status pill is at the
  // end of its row and the menu is wider than it, so half of it was off the
  // right edge. The vertical overflow was already handled; this is the other
  // axis.
  eq('the menu is pulled back inside the viewport',
    /Math\.max\(MENU_MARGIN, Math\.min\(dropdownPos\.left, window\.innerWidth - width - MENU_MARGIN\)\)/.test(btn), true);
  // Measured, not guessed: the widest option decides the width, and that is
  // the account's own wording.
  eq('  against its measured width',
    /const width = el\.getBoundingClientRect\(\)\.width;/.test(btn), true);
  eq('  which means the menu is held',
    /ref=\{menuRef\}/.test(btn), true);
  // The guard is what stops the clamp from setting state forever.
  eq('  and stops once it agrees',
    /if \(clamped !== dropdownPos\.left\) setDropdownPos/.test(btn), true);
  // A menu wider than the screen has nowhere to be clamped to.
  eq('  never wider than the screen', /max-w-\[calc\(100vw-1rem\)\]/.test(btn), true);
  eq('the margin is declared once', /const MENU_MARGIN = \d+;/.test(table), true);
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
