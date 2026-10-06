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
  /*
   * Status leads, then Type, under When. The company's status is the frame
   * for everything after it — what this company IS, before what the meeting
   * was — and a reader going down the left edge gets both without crossing
   * the card. The unit count is labelled with whatever the account calls a
   * unit.
   */
  eq('  and the second, what the meeting was and who the company is',
    labels.slice(2), ['Type', 'Acct Status', 'Support', '{unitTypeLabel}', 'Value', 'Conference', 'Guests']);
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
  /* Counted on a word boundary. CARD_FIELD_CENTERED contains CARD_FIELD, so
     a bare substring count happened to give the right answer here and would
     not for a field class that was not also a field. */
  const fields = (card.match(/CARD_FIELD\b(?!_)/g) ?? []).length;
  const centered = (card.match(/CARD_FIELD_CENTERED\b/g) ?? []).length;
  eq('  worn by every field on both rows', fields + centered, 9);
  /* The two badge stacks are centred under their labels. Each is a few small
     circles beneath a word wider than they are, and ranged left they hang off
     the start of it and read as having come loose. Every other value is a
     pill at least as wide as its own label and stays ranged left. */
  eq('  with the two badge stacks centred under theirs', centered, 2);
  eq('  by a class that says so',
    /const CARD_FIELD_CENTERED = 'flex-shrink-0 flex flex-col items-center';/.test(table), true);
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

console.log('\n— the faces, down the right edge —');
{
  const people = card.slice(card.indexOf('flex items-start justify-between gap-3'), card.indexOf('<p className={EYEBROW}>When</p>'));
  // The name comes first in the markup and the avatar last, so the face sits
  // at the right edge under the kebab rather than leading the name.
  eq('the primary attendee\u2019s name leads and the face follows',
    people.indexOf('m.first_name') < people.indexOf('<AttendeeInitialsAvatar'), true);
  // Compared against the guest's NAME LINE, not against `extra.first_name` —
  // the avatar's own name prop reads that too, and sits after the tag.
  const guest = people.slice(people.indexOf('additional_attendee_records ?? []'));
  eq('  and the guests read the same way',
    guest.indexOf('text-xs font-normal text-gray-600') < guest.indexOf('<AttendeeInitialsAvatar'), true);
  // Source order is the whole claim here, so nothing may turn it around again
  // in CSS.
  eq('  and nothing reverses them back', /flex-row-reverse/.test(people), false);
  // Both, or the two faces sit on opposite edges and neither reads as a column.
  eq('  both of them still have one',
    (people.match(/<AttendeeInitialsAvatar/g) ?? []).length, 2);

  // Ruled off from the people below it, so the card reads as a company and
  // then who from it was in the room.
  const header = card.slice(card.indexOf('relative flex items-start gap-2'), card.indexOf('AttendeeInitialsAvatar'));
  eq('the company line is ruled off', /mb-2 pb-2 border-b border-gray-100/.test(header), true);
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

  /*
   * Summoned, not standing there.
   *
   * A phone has no hover, so a checkbox per card is either always on screen —
   * a column of empty boxes down a list somebody is mostly reading — or it is
   * asked for. Select in the kebab starts a selection and every card's box
   * appears with it, so the second and third are one tap each.
   *
   * Derived from the selection itself rather than kept as a second flag: the
   * last box being unticked IS the end of the selection, so there is no state
   * that can be left switched on after the selection is empty.
   */
  eq('the boxes appear only once something is selected',
    /\{hasSelection && anySelected && \(\s*\n\s*<input/.test(header), true);
  eq('  which is read straight off the selection',
    /const anySelected = selectedIds\.size > 0;/.test(table), true);
  eq('  and is not a flag of its own',
    /useState[^\n]*[Ss]electMode|setShowChecks|setChecksVisible/.test(table), false);

  // The menu starts one, and only while there is not one running — otherwise
  // it would offer to reveal a box already on screen.
  eq('the kebab offers Select',
    /onSelect=\{hasSelection && !anySelected \? \(\) => toggleSelect\(m\.id\) : undefined\}/.test(card), true);
  const menu = table.slice(table.indexOf('function MeetingActionsMenu'), table.indexOf('\nfunction ', table.indexOf('function MeetingActionsMenu') + 1));
  eq('  as the first thing in the menu',
    menu.indexOf('Select\n') < menu.indexOf('View Notes'), true);
  eq('  with an icon beside it, like every other entry',
    /onSelect\(\); \}\} className=\{itemCls\}>\s*\n\s*<svg/.test(menu), true);
  // The menu decides whether to open upward by counting its own entries.
  eq('  and counted when the menu works out where to open',
    /\(onSelect \? 33 : 0\)/.test(menu), true);
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
  // "Mtg. Status", not "Status": the row above carries the COMPANY's status
  // now, and two things called Status on one card is one too many.
  eq('  and the meeting\u2019s status beside its own',
    /<span className=\{INLINE_LABEL\}>Mtg\. Status:<\/span>/.test(tail), true);
  eq('  with neither taking an eyebrow', /EYEBROW/.test(tail), false);
  eq('  Rep at the left and the meeting\u2019s status at the right',
    tail.indexOf('Rep:') < tail.indexOf('Mtg. Status:'), true);

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
  const flowSpan = cell.slice(cell.indexOf('<span'), cell.indexOf('{(m.additional_attendee_records'));
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

  // The tooltip is not here. It hangs off Name, which every table has — see
  // the block below.
  eq('the title cell opens nothing of its own', /onMouseEnter/.test(cell), false);
}

console.log('\n— the name cell carries the title, and the card —');
{
  const cell = table.slice(table.indexOf("case 'name': return <td"), table.indexOf("case 'title': return <td"));

  /*
   * A table with no Title column reads the title under the name instead. Off
   * the column list, not off isVisible: hiding Title from the column menu
   * should hide the title, not relocate it.
   */
  eq('tables without a Title column read it under the name',
    /const titleUnderName = !orderedColumns\.some\(col => col\.key === 'title'\);/.test(table), true);
  // The column list itself, not a regex over the file it is declared in.
  const { TABLE_COLUMN_DEFS } = await import('../lib/useTableColumnConfig.ts');
  eq('  and the conference meetings table is one of them',
    TABLE_COLUMN_DEFS.conference_meetings.some(c => c.key === 'title'), false);
  // The tables that still have the column keep it: this is the conference
  // details table's layout, not every meetings table's.
  for (const t of ['meetings', 'attendee_meetings', 'company_meetings']) {
    eq(`  and ${t} keeps its Title column`,
      TABLE_COLUMN_DEFS[t].some(c => c.key === 'title'), true);
  }

  // Second line of this cell against second line of Date/Time: the quieter
  // half of each pair, so they are set alike.
  eq('the title is set like the time beside it',
    /\{titleUnderName && m\.title && \([\s\S]{0,200}font-normal text-gray-400 leading-snug truncate/.test(cell), true);
  eq('  and the guests’ titles with it',
    /\{titleUnderName && extra\.title && \([\s\S]{0,200}font-normal text-gray-400 leading-snug truncate/.test(cell), true);

  // The name has to start at the top of the cell to sit on the date's line;
  // with a Title column beside it, it stays centred against the avatar so the
  // two columns keep step.
  eq('the stack starts at the top when the title is under the name',
    /titleUnderName \? 'items-start' : 'items-center'/.test(cell), true);
  eq('  and Date\/Time is pinned to the top to meet it',
    /case 'datetime': return <td key="datetime" className="[^"]*align-top"/.test(table), true);
  eq('  with room for what the removed column held',
    /maxWidth: titleUnderName \? NAME_WIDTH_WITH_TITLE : 220/.test(cell), true);
  eq('  declared once', /const NAME_WIDTH_WITH_TITLE = \d+;/.test(table), true);

  // The tooltip itself: the shared card, positioned by the shared helper. On
  // Name rather than Title, because a table whose titles read under the names
  // has no Title cell to hover.
  eq('hovering the name opens a tooltip',
    /onMouseEnter=\{\(\) => \{[\s\S]{0,160}setPeopleTip\(\{ id: m\.id, pos: calcTooltipPos\(el\) \}\)/.test(cell), true);
  eq('  and leaving closes it', /onMouseLeave=\{\(\) => setPeopleTip\(null\)\}/.test(cell), true);
  eq('  only over the row being hovered', /peopleTip\?\.id === m\.id/.test(cell), true);
  eq('  it never swallows a click', /className="pointer-events-none"/.test(cell), true);
  eq('  and it is the shared card', /<PeopleTooltipCard heading="Attendees" people=\{meetingPeople\(m\)\} \/>/.test(cell), true);

  // Everyone on the meeting. The guests' titles are clipped in the same cell,
  // so a tooltip answering only for the first line would have to be hovered
  // once per person.
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

console.log('\n— the card says whose status is whose —');
{
  // "Status" alone sat opposite the outcome pill, which is the MEETING's
  // status, while the row above now carries the COMPANY's.
  eq('the outcome pill is labelled Mtg. Status',
    /<span className=\{INLINE_LABEL\}>Mtg\. Status:<\/span>/.test(table), true);
  eq('  and not just Status', /<span className=\{INLINE_LABEL\}>Status:<\/span>/.test(table), false);
}

console.log('\n— the company status leads the card\u2019s badge row —');
{
  const row = table.slice(table.indexOf('<ScrollRow className="mt-3"'), table.indexOf('<p className={EYEBROW}>Support</p>'));
  /* Both ends found before they are compared: an earlier version of this
     looked for a label that had been renamed, so indexOf returned -1 and the
     comparison passed by not finding what it was looking for. */
  const statusAt = row.indexOf('>Acct Status</p>');
  const typeAt = row.indexOf('>Type</p>');
  eq('both labels are there', statusAt !== -1 && typeAt !== -1, true);
  // Type leads, under When: the two read as one sentence about the meeting.
  eq('  and Type comes before Acct Status', typeAt < statusAt, true);
  eq('  drawn as the overlapping stack',
    /<OverlappingStatusBadges status=\{m\.company_status\}/.test(row), true);

  // An eyebrow over an empty space is worse than no eyebrow, so the cell is
  // left out when there is nothing to show.
  eq('  and left out when there is none', /\{mobileStatuses\(m\)\.length > 0 && \(/.test(row), true);
  eq('  which the row itself also tests for',
    /\{\(m\.meeting_type \|\| mobileStatuses\(m\)\.length > 0/.test(table), true);

  // 'Unknown' is the column's default rather than anybody's choice.
  eq('Unknown does not count as a status',
    /\.filter\(v => v && v !== 'Unknown'\)/.test(table), true);

  // It has to reach the card to be drawn.
  eq('the meetings API sends it',
    /co\.status AS company_status/.test(strip('app/api/meetings/route.ts')), true);
  eq('  and the row carries it', /company_status\?: string \| null;/.test(table), true);
}

console.log('\n— and both stacks are the same stack —');
{
  const pills = strip('components/OverlappingRepPills.tsx');
  /*
   * The overlap, the spread, the five-second fold-back and the chevrons live
   * in one component. A second copy for statuses is how two stacks that are
   * supposed to behave identically stop doing so.
   */
  eq('the behaviour is written once', /export function OverlappingBadges\(/.test(pills), true);
  eq('  reps go through it', /export function OverlappingRepPills\([\s\S]{0,900}<OverlappingBadges/.test(pills), true);
  eq('  statuses too', /export function OverlappingStatusBadges\([\s\S]{0,900}<OverlappingBadges/.test(pills), true);
  // One expand timer, one set of overlap classes.
  eq('  with one timer between them', (pills.match(/EXPAND_MS\)/g) ?? []).length, 2);
  eq('  and one overlap rule', (pills.match(/-ml-1\.5/g) ?? []).length, 2);

  // A letter per circle for a status, initials for a rep — the only thing
  // that differs between them.
  eq('a status collapses to its first letter',
    /short: value\.charAt\(0\)\.toUpperCase\(\)/.test(pills), true);
  eq('  and a rep to their initials', /short: getRepInitials\(name\)/.test(pills), true);
  eq('  and each expands to the full text',
    /\{expanded \? item\.label : item\.short\}/.test(pills), true);
}

console.log('\n— the Rep column is drawn like every other rep pill —');
{
  // Initials with nothing to say they are a person's was the one place in the
  // app that did it that way. RepPills already took the flag; this column was
  // simply not passing it.
  eq('the Rep column asks for the glyph',
    /case 'rep': return <td key="rep"[\s\S]{0,200}<RepPills[^/]*withIcon \/>/.test(table), true);
  eq('  and the mobile card still has it',
    /<RepPills scheduledBy=\{splitInternalIds\(m\)\.repIds\} userOptions=\{userOptions\} size="md" withIcon \/>/.test(table), true);
  // Support is a different column with its own treatment; this is not it.
  eq('  the support column is untouched',
    /<OverlappingRepPills repIds=\{splitInternalIds\(m\)\.supportIds\}/.test(table), true);
}

console.log('\n— and on a phone it is a sheet instead —');
{
  const from = table.indexOf('function OutcomeButton');
  const btn = table.slice(from, table.indexOf('\nfunction ', from + 1));

  /*
   * The same sheet the company card's type picker opens.
   *
   * An anchored menu on a 390px screen has to be clamped back inside the
   * viewport, lands under the thumb that opened it, and puts seven colour
   * dots in a 160px box. A sheet has the room to show each outcome as the
   * pill it will become, which is what the type picker already does.
   */
  eq('a phone gets a sheet', /\{open && isPhone && createPortal\(/.test(btn), true);
  eq('  rising from the bottom edge', /fixed inset-0 z-\[9999\] flex items-end sm:hidden/.test(btn), true);
  eq('  with the heading and a Cancel',
    /Outcome<\/h3>[\s\S]{0,400}Cancel/.test(btn), true);
  // The sheet covers the card it came from, so it has to say whose meeting.
  eq('  naming the meeting it is about', /\{subject && <p/.test(btn), true);
  eq('  and the card passes one',
    /subject=\{m\.company_name \|\| `\$\{m\.first_name\} \$\{m\.last_name\}`\.trim\(\)\}/.test(table), true);
  // Each row is the pill, not a dot beside a word.
  eq('  each option drawn as its pill',
    /\$\{p\.pillClass\} px-2\.5 py-1 rounded-full/.test(btn), true);
  eq('  with the current one marked', /opt === value \? 'ring-2/.test(btn), true);
  // Clear stays first, as in the anchored menu.
  eq('  and Clear still leads', btn.indexOf('— Clear —') < btn.indexOf('{options.map('), true);

  /*
   * The two are alternatives, not a sheet drawn over a menu.
   *
   * Each piece of the anchored menu's machinery is off on a phone: measuring
   * a menu that is not rendered reads zero and would move the one that is,
   * and the document-level close would shut the sheet on the tap that opened
   * it, since the sheet is portalled outside the button's own ref.
   */
  eq('the anchored menu is pointers only', /\{open && !isPhone && dropdownPos && \(/.test(btn), true);
  eq('  no clamping on a phone', /if \(isPhone \|\| !open \|\| !dropdownPos\) return;/.test(btn), true);
  eq('  no outside-click handler', /if \(!open \|\| isPhone\) return;/.test(btn), true);
  eq('  and no position measured for it', /if \(!open && !isPhone && btnRef\.current\)/.test(btn), true);
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
