/**
 * The competitive signals, as a column on a table of companies.
 *
 *   node --experimental-strip-types --import ./tests/register-ts.mjs \
 *        tests/company-signals.mjs
 *
 * The badges are the relationship map's own answer shown somewhere else, so
 * the thing worth checking is that it IS the same answer — computed through
 * the same resolver rather than a second, simpler rule that agrees today.
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

const {
  SIGNAL_KEYS, SIGNAL_ABBREVIATIONS, SIGNAL_FULL_LABELS, SIGNAL_LABELS, SIGNAL_TONE,
  SIGNAL_OUTLINED,
} = await import('@/lib/competitiveSignals');
const { TABLE_COLUMN_DEFS } = await import('@/lib/useTableColumnConfig');

const strip = (f) => readFileSync(f, 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '');

console.log('\n— every signal, declared once —');
{
  // Anything iterating them should not have to pick a map and hope its keys
  // are the whole set.
  eq('the keys are their own list',
    SIGNAL_KEYS,
    ['atRisk', 'evaluatingAlternatives', 'switched', 'recentChange', 'internalRelationship']);
  // At Risk leads, and the order here is the order badges are drawn in: the
  // one that says an account is ours and being competed for reads first.
  eq('  with At Risk at the head of it', SIGNAL_KEYS[0], 'atRisk');
  for (const [name, map] of [
    ['labels', SIGNAL_LABELS], ['abbreviations', SIGNAL_ABBREVIATIONS],
    ['full labels', SIGNAL_FULL_LABELS], ['tones', SIGNAL_TONE],
    ['outline flags', SIGNAL_OUTLINED],
  ]) {
    eq(`  and every one of them has ${name}`,
      // `in`, not truthiness: SIGNAL_OUTLINED is booleans and four of them are
      // false, which a truthiness check would read as four missing entries.
      SIGNAL_KEYS.every(k => k in map) && Object.keys(map).length === SIGNAL_KEYS.length, true);
  }
}

console.log('\n— the column is registered, so admin can move or hide it —');
{
  for (const table of ['companies', 'conference_companies']) {
    const keys = TABLE_COLUMN_DEFS[table].map(c => c.key);
    eq(`${table} declares a signals column`, keys.includes('signals'), true);
    // Beside the name it is about: a reader who has to find the badges three
    // columns over has already decided the row is not worth reading.
    eq(`  second, right after the name`, keys.indexOf('signals'), 1);
    eq(`  labelled Signals`,
      TABLE_COLUMN_DEFS[table].find(c => c.key === 'signals')?.label, 'Signals');
  }
  // Registering it is what puts it in Edit Tables — there is no second list.
  const hook = strip('lib/useTableColumnConfig.ts');
  eq('the admin screen reads that same registry',
    /export const TABLE_COLUMN_DEFS/.test(hook), true);
  eq('  and the table renders in the order it gives',
    /orderedColumns/.test(strip('components/CompanyTable.tsx')), true);
}

console.log('\n— the badges —');
{
  const badges = strip('components/CompanySignalBadges.tsx');
  // The same stack the meetings table uses for reps, and for the same reason:
  // several marks on one row, in a column that cannot afford their names.
  eq('they overlap when folded and spread when opened',
    /-ml-1\.5/.test(badges) && /ml-1/.test(badges), true);
  // One element in both states, so the names appear in place rather than one
  // row being swapped for another.
  eq('  through one element that transitions',
    /transition-all duration-300 ease-out/.test(badges), true);
  eq('  showing two letters folded and the name opened',
    /expanded \? SIGNAL_FULL_LABELS\[k\] : SIGNAL_ABBREVIATIONS\[k\]/.test(badges), true);
  // Three seconds, not the rep pills' five: there are at most four of these and
  // they are two letters each.
  eq('it folds itself back after three seconds',
    /const EXPAND_MS = 3000;/.test(badges), true);
  eq('  cleared on unmount, so a closed row leaves no timer',
    /clearTimeout\(timerRef\.current\)/.test(badges), true);
  // The row underneath usually opens something.
  eq('  and reading them does not open the row',
    /e\.stopPropagation\(\)/.test(badges), true);

  // ── The column grows, rather than the names hiding behind it ──
  //
  // The companies table lays out FIXED, so a cell cannot widen to its own
  // contents the way the meetings table's can — spread names simply vanished
  // under the column to the right. The column is told instead.
  const table2 = strip('components/CompanyTable.tsx');
  eq('nothing clips or scrolls inside the cell',
    /overflow-x-auto|max-w-full/.test(badges), false);
  eq('  the badges report how much room they need',
    /latest\.current\?\.\(px\)/.test(badges), true);
  // Measured every frame of the widening, not once when it starts: the badges
  // animate over 300ms, so a single reading is of the row still folded — the
  // column grew by about a fifth of what it needed and clipped the rest.
  eq('  measured as they spread, not once when they start',
    /const ro = new ResizeObserver\(measure\);\s*\n\s*ro\.observe\(el\);/.test(badges), true);
  eq('  and nothing left behind by a row that unmounts mid-spread',
    /useEffect\(\(\) => \(\) => latest\.current\?\.\(null\), \[\]\)/.test(badges), true);
  /*
   * Neither effect may depend on the caller's callback, and this is the whole
   * bug rather than a style note.
   *
   * A caller writes `onWidthChange={px => setWidth(id, px)}`, which is a new
   * function on every render. As a dependency that re-runs both effects every
   * render: the measuring one reports a width, the clearing one's cleanup
   * reports null, and each report re-renders the caller. One click on a badge
   * produced twelve thousand renders before React stopped it with "maximum
   * update depth exceeded" — a blank page with an error boundary on it.
   *
   * So the rule is checked, not the two call sites: any dependency array that
   * names the callback brings the loop back.
   */
  eq('  and no effect depends on the caller’s identity',
    /\[[^\][]*onWidthChange[^\][]*\]/.test(badges), false);
  eq('  the reporter being stable for the same reason',
    /const report = useCallback\(\(px: number \| null\) => latest\.current\?\.\(px\), \[\]\)/.test(badges), true);
  eq('  so measuring is keyed on the spread alone',
    /\}, \[expanded, report\]\);/.test(badges), true);
  // Kept current, or the ref pins whichever callback was passed at mount. That
  // works only for as long as a mounted badge row keeps the same company, which
  // is true of this table today and is not something this component knows.
  eq('  with the held callback kept current',
    /useLayoutEffect\(\(\) => \{ latest\.current = onWidthChange; \}\);/.test(badges), true);
  eq('the column takes the widest spread row',
    /Math\.max\(\s*\n\s*colWidths\.signals \?\? COL_DEFAULT_WIDTH,\s*\n\s*\.\.\.Object\.values\(signalWidths\)\.map\(w => w \+ 24\),/.test(table2), true);
  // Keyed by company so two rows open at once do not fight over one number.
  eq('  keyed by company, so two open rows do not fight',
    /const \[signalWidths, setSignalWidths\] = useState<Record<number, number>>\(\{\}\);/.test(table2), true);
  eq('  and the header reads that width, not its own',
    /style=\{\{ width: signalsWidth \}\}/.test(table2), true);
  eq('  moving with the badges rather than after them',
    /transition-\[width\] duration-300 ease-out" style=\{\{ width: signalsWidth \}\}/.test(table2), true);
  eq('  and giving it back when they fold',
    /if \(px == null\) \{[\s\S]{0,160}delete next\[companyId\];/.test(table2), true);
  // Order is declared, not whatever the data happened to arrive in.
  eq('they read the same way down on every row',
    /SIGNAL_KEYS\.filter\(k => signals\?\.includes\(k\)\)/.test(badges), true);
  eq('  in the signal colours the map already uses',
    /SIGNAL_TONE\[k\]/.test(badges), true);
  // Keyboard and screen readers get the names, not the initials.
  eq('  named for assistive tech',
    /aria-label=\{on\.map\(k => SIGNAL_FULL_LABELS\[k\]\)\.join\(', '\)\}/.test(badges), true);
  eq('  and reachable by keyboard',
    /onKeyDown=\{e => \{ if \(e\.key === 'Enter' \|\| e\.key === ' '\)/.test(badges), true);
}

console.log('\n— filtering the list down to rows that have a signal —');
{
  const table = strip('components/CompanyTable.tsx');

  // The same map the column renders from. Read from anywhere else and the
  // button would keep rows with no badge, or drop rows that have one.
  eq('the button keeps rows the column would badge',
    /matchQuickSignals = !quickFilterSignals \|\| \(companySignals\[c\.id\]\?\.length \?\? 0\) > 0/.test(table), true);
  eq('  and it is applied, not merely computed',
    /&& matchQuickSignals &&/.test(table), true);
  eq('  and counts as a quick filter, so the others recede behind it',
    /const anyQuickFilter = [^;]*quickFilterSignals/.test(table), true);
  // Paging is reset when a filter changes, or page 3 of an unfiltered list
  // becomes an empty page 3 of a filtered one.
  eq('  and returns the reader to the first page',
    /\}, \[search[^\]]*quickFilterSignals[^\]]*groupByParent\]\);/.test(table), true);

  // Colour by reference. The icon is meant to read as the same subject as the
  // EA badge; a hex copied here drifts the first time that palette moves.
  eq('the icon borrows the signal palette rather than a copy of it',
    /stroke=\{SIGNAL_TONE\.evaluatingAlternatives\}/.test(table), true);
  eq('  with no hardcoded hex beside it',
    /#D97706/.test(table), false);
  // An icon with no text needs a name for anyone not looking at it.
  eq('  and is named for screen readers',
    /aria-label="Companies with a signal"/.test(table), true);

  // Second in the row, as asked: after "is this mine", "is anything happening".
  const row = table.slice(table.indexOf('const filterButtons'), table.indexOf('{beforeFiltersButton}'));
  const order = [...row.matchAll(/setQuickFilter(\w+)\(v => !v\)/g)].map(m => m[1]);
  eq('the order of the quick filters', order, ['MyAccounts', 'Signals', 'Icp', 'Prospects']);
}

console.log('\n— one Prospects button instead of one per ICP type —');
{
  const table = strip('components/CompanyTable.tsx');

  // The ICP company types were a button each, so the row grew with the
  // settings. They are one idea, so they are one button.
  eq('the ICP types are gathered into one bucket',
    /const prospectTypes = useMemo\(\s*\n\s*\(\) => icpCompanyTypeOptions\.filter\(t => t !== 'Customer' && t !== 'Competitor'\)/.test(table), true);
  eq('  which the button filters by',
    /matchQuickProspects = !quickFilterProspects \|\| prospectTypes\.includes\(c\.company_type \|\| ''\)/.test(table), true);
  eq('  and which is applied',
    /&& matchQuickProspects &&/.test(table), true);

  // Customer and Competitor are what a prospect is not, and neither is an ICP
  // parameter — they keep their own toggles, so the three divide the list.
  eq('Customers and Competitors keep their own buttons',
    /const quickFilterTypeButtons: \[string, string\]\[\] = \[\['Customer', 'Customers'\], \['Competitor', 'Competitors'\]\];/.test(table), true);
  eq('  and are not swept into the bucket',
    /prospectTypes[\s\S]{0,120}t !== 'Customer' && t !== 'Competitor'/.test(table), true);

  // The ICP rules arrive over the network. Until they do the bucket is empty,
  // and a Prospects button that matches nothing is worse than no button.
  eq('nothing is offered until the ICP types load',
    /\{prospectTypes\.length > 0 && \(\s*\n\s*<button/.test(table), true);
  // The types it stands for, for a reader who cannot know what is in the ICP
  // settings from the word "Prospects".
  eq('  and the button says which types it means',
    /title=\{`Company type is \$\{prospectTypes\.join\(', '\)\}`\}/.test(table), true);
}

console.log('\n— the pages are wide enough to hold the table —');
{
  /*
   * The table lays out fixed, so its columns come to a fixed number — about
   * 1200px with Signals in — and a page narrower than that does not compress
   * it, it cuts the last column off. The conference tab was max-w-6xl (1152)
   * while the other two were max-w-7xl (1280), so the same table lost its
   * last column there and nowhere else, which reads as a broken table rather
   * than as a narrow page.
   *
   * Checked as an agreement between the three rather than against a literal:
   * whoever changes one is told about the others.
   */
  // EVERY container in each file, not just the first: two of these pages have
  // a second one for their loading state, and a page that loads at one width
  // and settles at another jumps under the reader.
  const pageWidths = (f) =>
    [...readFileSync(f, 'utf8').matchAll(/className="(max-w-\w+) mx-auto space-y-6"/g)].map(m => m[1]);
  const hosts = {
    companies: 'app/companies/page.tsx',
    attendees: 'app/attendees/page.tsx',
    conference: 'app/conferences/[id]/page.tsx',
  };
  const widths = Object.fromEntries(Object.entries(hosts).map(([k, f]) => [k, pageWidths(f)]));
  for (const [name, found] of Object.entries(widths)) {
    eq(`${name} declares a width`, found.length > 0, true);
  }
  eq('every page hosting a wide table is the same width',
    [...new Set(Object.values(widths).flat())], ['max-w-7xl']);
}

console.log('\n— where they sit —');
{
  const table = strip('components/CompanyTable.tsx');
  eq('a desktop cell, in the column switch, rendering the badges',
    /case 'signals': return <td key="signals" className="px-3 py-3">\s*\n\s*<CompanySignalBadges/.test(table), true);
  eq('  with a header to match',
    /case 'signals': return <th key="signals"/.test(table), true);
  // A spanning row has to stay as wide as the header above it.
  eq('  counted in the colspan tally',
    /'name','signals','type'/.test(table), true);
  // The family header row has its own switch; without an entry the columns
  // under a family heading would slide one to the left.
  eq('  and an empty cell on the family row',
    /case 'signals': return <td key="signals" className="px-3 py-3" \/>;/.test(table), true);

  // ── The phone card grows only when there is something to grow for ──
  //
  // The badges spread into full names when tapped, which needs a line of its
  // own — on the pill row they would push the type and the counts off the end
  // every time somebody read them. But a card with no signals has nothing to
  // put on that line, and an empty third row is a row of nothing.
  eq('a third row only when the company has signals',
    /const showSignalRow = isVisible\('signals'\)\s*\n\s*&& \(companySignals\[company\.id\] \?\? \[\]\)\.length > 0;/.test(table), true);
  eq('  with an eyebrow saying what they are',
    /Signal\{\(companySignals\[company\.id\] \?\? \[\]\)\.length === 1 \? '' : 's'\}/.test(table), true);
  // One menu, placed on whichever row turns out to be the card's last, so the
  // card always ends on a line that has it.
  eq('the menu is built once and placed, not written twice',
    (table.match(/<RowActionsKebab/g) || []).length, 3);
  eq('  staying on the pill row when there is no third one',
    /\{!showSignalRow && kebab\}/.test(table), true);
  eq('  and coming down to the signals row when there is',
    /\{kebab && <div className="ml-auto">\{kebab\}<\/div>\}/.test(table), true);
  // Four spread names are wider than the card. The menu is pushed along in
  // front of them rather than sitting on top of the last one — ml-auto holds it
  // at the right edge until the badges need the room, then resolves to nothing.
  // Read unstripped and sliced to the row itself: justify-between appears on
  // unrelated rows elsewhere in this file, and a match anywhere would say
  // nothing about this one.
  const raw = readFileSync('components/CompanyTable.tsx', 'utf8');
  const signalRow = raw.slice(raw.indexOf('Row 3, only when there is something'));
  eq('  pushed along by the badges rather than pinned',
    /flex items-center gap-2 overflow-x-auto scrollbar-hide/.test(signalRow), true);
  eq('  never pinned to the far edge of the card',
    /justify-between/.test(signalRow.slice(0, signalRow.indexOf('</div>'))), false);

  // Nothing to say and nothing to show: an em-dash on a phone card is a row
  // of punctuation.
  eq('  showing nothing rather than a dash when there are none',
    /emptyLabel=\{null\}/.test(table), true);
  // The desktop cell keeps the dash the other columns use, and it is the one
  // that reports its width — the phone card has no column to widen.
  eq('  while the desktop cell keeps the dash the other columns use',
    /<CompanySignalBadges\s*\n\s*signals=\{companySignals\[company\.id\]\}\s*\n\s*onWidthChange=/.test(table), true);

  // The badge is about the company, not about this show.
  eq('the table asks for every signal, not this conference\u2019s',
    /const companySignals = useCompanySignals\(\);/.test(table), true);
}

console.log('\n— the same answer as the map, not a second rule —');
{
  const route = strip('app/api/companies/signals/route.ts');
  eq('the endpoint resolves through the shared resolver',
    /resolveCompetitive\(\{/.test(route), true);
  eq('  and derives through the shared module',
    /deriveSignals\(\{/.test(route), true);
  eq('  with no rule of its own',
    /action_key = 'competitor'/.test(route) && /classOf|vendorEnd|statusClass/.test(route), false);
  // Recorded, never inferred — the same restriction the grid's connector has.
  eq('only a recorded switch counts',
    /answer = 'replacing' AND incoming_company_id IS NOT NULL/.test(route), true);
  // Never narrowed to one show. A badge answers "what is going on with this
  // company", which does not stop being true because the other end of it did
  // not come — and a row carrying EA at one conference and nothing at another,
  // for the same company on the same day, reads as the badge being unreliable
  // rather than as a scope. The map's grid IS about one show; these are
  // different questions and now have different answers on purpose.
  eq('every relationship counts, whatever conference it touches',
    /conference_id|atConference|conference_attendees/.test(route), false);
  eq('  so the rows go straight into the resolver',
    /const rows: RawRelationshipRow\[\] = relRes\.rows\.map/.test(route), true);
  // Keyed by the account: a competitor's cells belong to the accounts above
  // them, so a competitor carries a signal here only when it is being weighed.
  eq('keyed by the account the cell belongs to',
    /signals\[companyId\] = SIGNAL_KEYS\.filter/.test(route), true);
  eq('  with each signal once however many relationships carry it',
    /new Set<SignalKey>\(\)/.test(route), true);

  // The badges are extra information about a row. A table that will not render
  // because one optional column failed is a worse outcome than one without it.
  const hook = strip('lib/useCompanySignals.ts');
  eq('a failed load leaves the table alone',
    /\.catch\(\(\) => \(\{\} as CompanySignals\)\)/.test(hook), true);
  // The conference answer and the whole-book answer are different answers.
  // One answer, so one cache. A scope key for a thing with one scope is a
  // parameter nothing passes.
  eq('one answer, cached once',
    /let cache: CompanySignals \| null = null;/.test(hook), true);
  eq('  with no scope left to key it by',
    /conferenceId/.test(hook), false);
  eq('  and one fetch shared rather than one per table',
    /if \(inFlight\) return inFlight;/.test(hook), true);
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
