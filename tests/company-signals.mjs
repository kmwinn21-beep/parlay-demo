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
    SIGNAL_KEYS, ['evaluatingAlternatives', 'switched', 'recentChange', 'internalRelationship']);
  for (const [name, map] of [
    ['labels', SIGNAL_LABELS], ['abbreviations', SIGNAL_ABBREVIATIONS],
    ['full labels', SIGNAL_FULL_LABELS], ['tones', SIGNAL_TONE],
  ]) {
    eq(`  and every one of them has ${name}`,
      SIGNAL_KEYS.every(k => !!map[k]) && Object.keys(map).length === SIGNAL_KEYS.length, true);
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

  // On a phone the badges spread into full names, which needs a line of its
  // own — on the pill row they would push the type and the counts off the end
  // every time somebody read them.
  eq('a row of their own on a phone',
    /mt-2 ml-6 flex items-center justify-between gap-2/.test(table), true);
  // The pill row scrolls; the menu used to sit at the end of it and stay put
  // while the pills passed behind. It is on the signals row now, which is also
  // where it gets the width.
  // Read unstripped: the two rows are told apart by the comments that head
  // them, and strip() takes those out.
  const raw = readFileSync('components/CompanyTable.tsx', 'utf8');
  const pillRow = raw.slice(
    raw.indexOf('Rows 2-4 ride one scrolling line'),
    raw.indexOf('Row 5: the signals'),
  );
  const signalRow = raw.slice(raw.indexOf('Row 5: the signals'));
  eq('  with the actions menu brought down beside them',
    /RowActionsKebab/.test(signalRow), true);
  eq('  and none left on the pill row above',
    /RowActionsKebab/.test(pillRow), false);
  // Nothing to say and nothing to show: an em-dash on a phone card is a row
  // of punctuation.
  eq('  showing nothing rather than a dash when there are none',
    /emptyLabel=\{null\}/.test(table), true);
  eq('  while the desktop cell keeps the dash the other columns use',
    /<CompanySignalBadges signals=\{companySignals\[company\.id\]\} \/>/.test(table), true);

  // Scoped to the conference when there is one, which is what the map's own
  // "At this conference" means.
  eq('scoped to the conference when there is one',
    /useCompanySignals\(conferenceId \?\? undefined\)/.test(table), true);
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
  // Both ends at the show, which is what the map's conference scope means.
  eq('a conference narrows it to relationships with both ends there',
    /!\(atConference\.has\(a\) && atConference\.has\(z\)\)/.test(route), true);
  eq('  and without one the whole book is read',
    /const conferenceId = Number\(new URL\(request\.url\)\.searchParams\.get\('conference_id'\) \?\? 0\);/.test(route), true);
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
  // Both the loader and the hook derive it, and either one falling back to a
  // single key would serve the conference answer to the whole-book question.
  eq('the cache is keyed by scope, not shared across them',
    (hook.match(/conferenceId \? `conference:\$\{conferenceId\}` : 'all'/g) || []).length, 2);
  eq('  and one fetch is shared rather than one per table',
    /inFlight/.test(hook), true);
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
