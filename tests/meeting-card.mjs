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
// Set before anything reads a Date. A card date is parsed as LOCAL midnight;
// parsed as UTC it lands on the previous day anywhere behind Greenwich, and a
// container running in UTC cannot tell the two apart.
process.env.TZ = 'America/Los_Angeles';

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

const { formatCardDate } = await import('@/lib/meetingTime');

const SRC = 'components/MeetingsTable.tsx';
const table = strip(SRC);
/*
 * The mobile card alone.
 *
 * Ended at the next thing declared after it, and CHECKED — an end anchor that
 * is not in the file makes indexOf return -1, and the slice quietly becomes
 * the whole rest of the component. Every assertion below would then be
 * satisfied by the desktop table markup underneath it.
 */
const cardStart = table.indexOf('const renderMobileCard');
const cardEnd = table.indexOf('const attendeeNameNode');
if (cardStart < 0 || cardEnd <= cardStart) {
  console.log('  FAIL could not isolate the mobile card');
  process.exit(1);
}
const card = table.slice(cardStart, cardEnd);

console.log('\n— every value is under a word saying what it is —');
{
  // In the order asked for. Read out of the source in source order, so a label
  // moved is a label this notices — the point of the change is that a reader
  // knows where to look, and that is a claim about sequence.
  const labels = [...card.matchAll(/<p className=\{EYEBROW\}>([^<]+)<\/p>/g)].map(m => m[1]);
  eq('the first row answers when and where',
    labels.slice(0, 2), ['When', 'Where']);
  // Type leads, under When: the two read as one sentence about the meeting,
  // and a reader going down the left edge gets both without crossing the card.
  // The unit count is labelled with whatever the account calls a unit.
  eq('  and the second, what it was and what it is worth',
    labels.slice(2), ['Type', 'Support', '{unitTypeLabel}', 'Value', 'Conference', 'Guests']);
  /*
   * The labels are read out of the source, so a block switched off still
   * shows its label here. Each one is gated on the thing it displays, and
   * nothing is gated on a constant — which is exactly what a label left
   * behind by a removed value looks like.
   */
  eq('  each shown only when there is something to show',
    /\{m\.meeting_type && \(\s*\n\s*<div className=\{CARD_FIELD\}>\s*\n\s*<p className=\{EYEBROW\}>Type<\/p>/.test(card), true);
  eq('  and nothing is switched off', /\{false &&/.test(card), false);

  // One declared class. Written out at each site they drift, and a row of
  // labels that do not match reads as several things rather than one row.
  eq('the labels are one declared style',
    /const EYEBROW = 'text-\[9px\] uppercase tracking-wide text-gray-400 font-medium mb-1';/.test(table), true);
  eq('  used by every one of them',
    (card.match(/className=\{EYEBROW\}/g) ?? []).length, labels.length);
  eq('  with none writing its own',
    /text-\[9px\] uppercase tracking-wide/.test(card), false);

  /*
   * Two sizes, one per row, and each row internally consistent.
   *
   * When, Where and Status are what a rep checks first, so they are set
   * larger; Rep, Support, Type and Value are what gets read once one of those
   * is worth a second look. Within a row the size is declared once, because
   * Type is a rounded tag and Value is a pill and nothing else keeps them in
   * step — which is how they came to differ before.
   */
  eq('the second row is one declared size', /const PILL_TEXT = 'text-\[\d+px\]';/.test(table), true);
  eq('  which every pill on it takes through one shape',
    /const ROW_PILL = `inline-flex items-center \$\{ROW_PILL_H\} px-2 rounded-xl border \$\{PILL_TEXT\} font-semibold whitespace-nowrap`;/.test(table), true);
  eq('  including the type tag', /\$\{ROW_PILL\}[^`]*`}>\{m\.meeting_type\}/.test(card), true);
  eq('  with none setting a size of its own',
    /text-xs[^`"]*>\{m\.meeting_type\}/.test(card), false);

  /*
   * One declared HEIGHT for that row, not just one padding.
   *
   * The pills carry different things — a few words, a number, a count with a
   * glyph — so their text and padding differ and nothing else lines them up. A
   * row at four heights reads as four kinds of thing rather than one band.
   */
  eq('the second row is one declared height', /const ROW_PILL_H = 'h-\d+';/.test(table), true);
  const rowPills = (card.match(/\$\{ROW_PILL\}/g) ?? []).length;
  eq('  worn by every pill on it', rowPills, 5);
  // The support stack is the sixth thing on that row and is not a pill; it is
  // sized square at the same height so it stays a circle.
  /*
   * The pills' TOP EDGES line up, which the heights alone do not give you.
   *
   * A pill is inline-flex, so its line box reserves room under the baseline —
   * and a pill whose first child is an icon has no text baseline to use, so
   * the browser synthesises one from the icon's edge instead. The unit count
   * sat 1.8px above Type and Value for exactly that reason, at the same
   * height as both. Every label-and-value stack is a flex COLUMN, which
   * blockifies the pill and takes baselines out of it.
   */
  eq('each label and its value is a flex column',
    /const CARD_FIELD = 'flex-shrink-0 flex flex-col items-start';/.test(table), true);
  const fields = (card.match(/CARD_FIELD/g) ?? []).length;
  eq('  worn by every field on both rows', fields, 8);
  eq('  with none left as a plain block',
    /<div className="flex-shrink-0">\s*\n\s*<p className=\{EYEBROW\}>/.test(card), false);

  eq('  and the support stack is square at that height',
    /<p className=\{EYEBROW\}>Support<\/p>\s*\n\s*<OverlappingRepPills[\s\S]{0,160}size="sm"/.test(card), true);
  eq('  which is the size that is 24px', /const dim = size === 'xs' \? 'w-5 h-5[^']*' : 'w-6 h-6/.test(strip('components/OverlappingRepPills.tsx')), true);

  // The first row's pill, declared once and used by all three of them.
  eq('the first row is one declared pill',
    /const FACT_PILL = 'inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold whitespace-nowrap border';/.test(table), true);
  const factPills = (card.match(/\$\{FACT_PILL\}/g) ?? []).length;
  eq('  worn by the date and both states of the location', factPills, 3);
  // Status is the third, and comes from a component the table shares with the
  // desktop view — so it is told to match rather than restyled for everyone.
  eq('  and the status pill is asked to match',
    /onChange=\{\(val\) => changeOutcome\(m, val\)\}\s*\n\s*compact\s*\n/.test(card), true);
  eq('  which only narrows it here',
    /const pad = compact \? 'px-2 py-1' : 'px-2\.5 py-1';/.test(table), true);
}

console.log('\n— the date, as the card writes it —');
{
  // Run, not read. Grepping the formatter's source said the month came from
  // getMonth() and the day was padded, and was satisfied by a version that
  // padded both and dropped the weekday entirely.
  eq('a date reads "Sun, 7/05"', formatCardDate('2026-07-05'), 'Sun, 7/05');
  eq('  the month is not padded', formatCardDate('2026-07-05').split(', ')[1], '7/05');
  eq('  the day is', formatCardDate('2026-11-03'), 'Tue, 11/03');
  eq('  a two-digit month stays two digits', formatCardDate('2026-12-25'), 'Fri, 12/25');
  eq('  and the year is not in it', /2026/.test(formatCardDate('2026-07-05')), false);
  eq('nothing in, nothing out', formatCardDate(''), '');

  // Read as local midnight. Parsed as UTC it lands on the previous day for
  // every reader behind Greenwich — this file runs in Los Angeles so that the
  // difference is visible at all.
  eq('the run is not in UTC', new Date().getTimezoneOffset() !== 0, true);
  eq('  and the date is not shifted by the time zone', formatCardDate('2026-01-01'), 'Thu, 1/01');

  // The card uses it; the table keeps its own longer form.
  eq('the card is written with it',
    /\{formatCardDate\(m\.meeting_date\)\} at \{formatMeetingTime\(m\.meeting_time\)\}/.test(card), true);
  eq('  and the table is not',
    /formatCardDate/.test(table.slice(table.indexOf("case 'datetime': return <td"))), false);
}

console.log('\n— where, when nobody set a where —');
{
  // An empty slot that says what is missing and takes you to where it is
  // fixed. A blank reads as "no location needed" and a reader cannot tell the
  // difference between that and nobody having filled it in.
  eq('a missing location offers to take one',
    /\+ Location/.test(card), true);
  // Wordmark only: a pin drawn over "+ Location" labels a location that is
  // not there.
  const placeholder = card.slice(card.indexOf('title="Set a location"'), card.indexOf('+ Location'));
  eq('  with no pin on it', /<LocationIcon \/>/.test(placeholder), false);
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
  /*
   * Selecting a card is a thing you do TO the card, so it leads the line the
   * card is titled with. It used to ride the end of the row of facts, where it
   * sat beside a ScrollRow and had to be kept out of it by hand; on the title
   * line there is nothing to scroll and nothing to keep it out of.
   */
  const header = card.slice(card.indexOf('relative flex items-start gap-2 mb-2'), card.indexOf('AttendeeInitialsAvatar'));
  eq('the checkbox leads the title line', /type="checkbox"/.test(header), true);
  eq('  ahead of the company name',
    header.indexOf('type="checkbox"') < header.indexOf('m.company_name'), true);
  eq('  and cannot shrink', /type="checkbox"[\s\S]{0,400}flex-shrink-0/.test(header), true);
  // Once only: a second one further down would be a second answer to the same
  // question.
  eq('  and is the only one on the card', (card.match(/type="checkbox"/g) ?? []).length, 1);
  // The row of facts still pages rather than wrapping.
  eq('the row of facts scrolls', /<ScrollRow className="mt-3" gapClass="gap-3"/.test(card), true);
}

console.log('\n— who owns it and how it went, under a rule —');
{
  const tail = card.slice(card.indexOf('border-t border-gray-100'));
  eq('the last row is ruled off from the facts above it',
    /mt-3 pt-3 border-t border-gray-100 flex items-center justify-between/.test(card), true);
  // Labelled inline rather than with an eyebrow: there are two of them on one
  // line, at opposite ends, and a label stacked above each would read as the
  // start of another row of facts.
  eq('  Rep is labelled beside its pill', /<span className=\{INLINE_LABEL\}>Rep:<\/span>/.test(tail), true);
  eq('  and Status beside its own', /<span className=\{INLINE_LABEL\}>Status:<\/span>/.test(tail), true);
  eq('  with neither taking an eyebrow', /EYEBROW/.test(tail), false);
  eq('  Rep at the left and Status at the right',
    tail.indexOf('Rep:') < tail.indexOf('Status:'), true);

  // The two ends of that line read as a pair, so they are the same height,
  // text and weight — which is what the rep pill's 'md' size is for.
  eq('the rep pill is sized to the outcome pill', /size="md" withIcon/.test(tail), true);
  eq('  which matches its padding, text and weight',
    /size === 'md'\s*\n\s*\? 'inline-flex items-center px-2 py-1 rounded-full text-xs font-semibold whitespace-nowrap'/.test(table), true);
  eq('  and carries the glyph at full strength beside it',
    /size === 'md' \? '' : 'opacity-70'/.test(table), true);
  eq('the outcome pill is the narrow one', /compact/.test(tail), true);
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

console.log('\n— the size of the company, among the facts —');
{
  // It was in the title line, wedged beside the kebab. It is a fact about the
  // account like Value is, and it now sits with the facts — immediately before
  // Value, which is computed from it.
  const header = card.slice(card.indexOf('relative flex items-start gap-2 mb-2'), card.indexOf('AttendeeInitialsAvatar'));
  eq('the title line carries no unit count', /company_wse/.test(header), false);
  eq('  nor any offset left over from it', /right-7|pr-24/.test(table), false);

  const labels = [...card.matchAll(/<p className=\{EYEBROW\}>([^<]+)<\/p>/g)].map(m => m[1]);
  eq('the unit count sits before Value',
    labels.indexOf('{unitTypeLabel}') + 1, labels.indexOf('Value'));
  // Named for whatever the account calls a unit — beds, keys, doors — rather
  // than for the column it is stored in.
  eq('  and is labelled from the admin setting',
    /<p className=\{EYEBROW\}>\{unitTypeLabel\}<\/p>/.test(card), true);
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

  // The flow span, not the guest-title spans under it, which truncate too.
  const flowSpan = cell.slice(cell.indexOf('<span'), cell.indexOf('{titleTip?.id === m.id'));
  eq('the title is one line, cut short', /truncate/.test(flowSpan), true);

  /*
   * Read in a tooltip, not by expanding the cell.
   *
   * The expansion was an opaque copy of the title sliding over the next
   * column, which could only ever be one line wide: a long title ran out of
   * room and was cut off again — the very thing it existed to fix. None of
   * that machinery should come back.
   */
  eq('nothing expands over the neighbouring cell',
    /pointer-events-none absolute left-3 top-2/.test(cell), false);
  eq('  no hover width is declared', /TITLE_HOVER_WIDTH|--title-hover|--title-rest/.test(table), false);
  eq('  and no hover group on the cell', /group\/title/.test(table), false);

  // The tooltip itself: the shared card, positioned by the shared helper.
  eq('hovering the title opens a tooltip',
    /onMouseEnter=\{\(\) => \{[\s\S]{0,160}setTitleTip\(\{ id: m\.id, pos: calcTooltipPos\(el\) \}\)/.test(cell), true);
  eq('  and leaving closes it', /onMouseLeave=\{\(\) => setTitleTip\(null\)\}/.test(cell), true);
  eq('  only over the row being hovered', /titleTip\?\.id === m\.id/.test(cell), true);
  eq('  it never swallows a click', /className="pointer-events-none"/.test(cell), true);
  eq('  and it is the shared card', /<PeopleTooltipCard heading="Attendees" people=\{meetingPeople\(m\)\} \/>/.test(cell), true);

  // Everyone on the meeting. The guests' titles are clipped in this same
  // column, so a tooltip answering only for the first line would have to be
  // hovered once per person.
  eq('the tooltip lists the guests too',
    /function meetingPeople[\s\S]{0,400}additional_attendee_records \?\? \[\]/.test(table), true);
  eq('  with the meeting\u2019s own attendee first',
    /function meetingPeople[\s\S]{0,200}\$\{m\.first_name\} \$\{m\.last_name\}/.test(table), true);
  // A name is the whole point of the line; a row with neither is not a person.
  eq('  and nobody nameless in it', /\.filter\(p => p\.name\)/.test(table), true);
}

console.log('\n— the tooltip card, and where it goes, are shared —');
{
  const card = strip('components/PeopleTooltipCard.tsx');
  eq('the card reads "Name \u00b7 Title"',
    /<span className="font-medium">\{p\.name\}<\/span>[\s\S]{0,160}\u00b7 \{p\.title\}/.test(card), true);
  eq('  under a heading the caller names', /uppercase tracking-wide text-\[10px\]">\{heading\}/.test(card), true);
  eq('  with a bullet a line', /rounded-full bg-yellow-400/.test(card), true);

  // The count pill in the companies table drew this itself. Two copies of one
  // tooltip is how the same information comes to be laid out two ways.
  const pills = strip('components/CountPills.tsx');
  eq('the attendees pill uses the same card',
    /<PeopleTooltipCard heading="Attendees" people=\{attendees\} \/>/.test(pills), true);

  // calcTooltipPos was written out identically in three components and a
  // fourth was about to be added.
  const shared = strip('lib/tooltipPosition.ts');
  eq('the position is worked out in one place',
    /export function calcTooltipPos/.test(shared), true);
  for (const f of ['components/CompanyTable.tsx', 'components/PriorityLeads.tsx', 'components/CountPills.tsx', 'components/MeetingsTable.tsx']) {
    const src = strip(f);
    eq(`  ${f.split('/').pop()} imports it`,
      /import \{ calcTooltipPos[^}]*\} from '@\/lib\/tooltipPosition'/.test(src), true);
    eq(`  and declares none of its own`, /^function calcTooltipPos/m.test(src), false);
  }
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
