/**
 * Ours first, then everyone else's.
 *
 *   node --experimental-strip-types --import ./tests/register-ts.mjs \
 *        tests/social-event-order.mjs
 *
 * A conference week reads as a diary — what is on, and when — but the events
 * the company is hosting are the ones it has people and money committed to,
 * and they sat wherever their date happened to put them. They lead now, and
 * each group runs in time order, which is the arrangement the pre-conference
 * review already uses for the same flag.
 *
 * The rule is RUN. Sorting is the kind of thing that reads correct and is off
 * by one group, one unpadded hour, or one missing date.
 *
 * Exits non-zero on the first failing expectation, so it can gate a build.
 */
import { readFileSync } from 'node:fs';
import { sortSocialEvents } from '@/lib/socialEventOrder';

let pass = 0;
let fail = 0;
const eq = (label, got, want) => {
  const g = JSON.stringify(got);
  const w = JSON.stringify(want);
  if (g === w) { pass++; console.log(`  ok   ${label}`); }
  else { fail++; console.log(`  FAIL ${label}\n       got  ${g}\n       want ${w}`); }
};

const strip = (f) => readFileSync(f, 'utf8')
  .replace(/(^|[\s{(,;])\/\*[\s\S]*?\*\//g, '$1').replace(/^\s*\/\/.*$/gm, '');

/** An event, named so the order can be read at a glance. */
const ev = (name, date, time, hosted = false) =>
  ({ name, event_date: date, event_time: time, company_hosted: hosted });
const names = (list) => sortSocialEvents(list).map(e => e.name);

console.log('\n— the week on screen —');
{
  /*
   * The five from the conference in the report, in the order the query gave
   * them: one company-hosted event last, because it is the latest.
   */
  const week = [
    ev('August, SY & Palcare', '2026-10-20', '20:00'),
    ev('LTC REIT', '2026-10-21', '18:00'),
    ev('Welltower', '2026-10-21', '19:00'),
    ev('Procare', '2026-10-21', '19:45'),
    ev('Ema Dinner', '2026-10-22', '18:00', true),
  ];
  eq('the hosted event leads', names(week), [
    'Ema Dinner',
    'August, SY & Palcare', 'LTC REIT', 'Welltower', 'Procare',
  ]);
  // And the rest keep the time order they already read in.
  eq('  with the others still in time order', names(week).slice(1), [
    'August, SY & Palcare', 'LTC REIT', 'Welltower', 'Procare',
  ]);
}

console.log('\n— each group in its own time order —');
{
  const mixed = [
    ev('theirs tue', '2026-10-21', '09:00'),
    ev('ours wed', '2026-10-22', '09:00', true),
    ev('theirs mon', '2026-10-20', '09:00'),
    ev('ours mon late', '2026-10-20', '21:00', true),
    ev('ours mon early', '2026-10-20', '08:00', true),
  ];
  eq('hosted first, earliest first within each',
    names(mixed), ['ours mon early', 'ours mon late', 'ours wed', 'theirs mon', 'theirs tue']);

  // Same day, different hours — the hour decides.
  eq('the hour orders a single day',
    names([ev('late', '2026-10-21', '19:45'), ev('early', '2026-10-21', '18:00')]), ['early', 'late']);

  /*
   * '8:00' is what a row written before <input type="time"> carries, and it
   * compares AFTER '19:00' as text. Padded, it is the morning it says it is.
   */
  eq('an unpadded hour is still the morning',
    names([ev('seven pm', '2026-10-21', '19:00'), ev('eight am', '2026-10-21', '8:00')]), ['eight am', 'seven pm']);
}

console.log('\n— what is not scheduled is not first —');
{
  /*
   * An event with no date is not an event at the start of the week; it is one
   * nobody has scheduled. It goes to the end of its own group rather than the
   * top, where an empty string would sort it.
   */
  eq('an undated event trails its group',
    names([ev('undated', null, null), ev('monday', '2026-10-20', '09:00')]), ['monday', 'undated']);
  eq('  and an undated hosted one still leads the others',
    names([ev('theirs monday', '2026-10-20', '09:00'), ev('ours undated', null, null, true)]),
    ['ours undated', 'theirs monday']);
  // A dated event with no time is less fixed than a 7pm dinner on the same
  // day, so the dinner leads it.
  eq('  a timed event leads an untimed one on the same day',
    names([ev('that thursday', '2026-10-22', null), ev('dinner', '2026-10-22', '19:00')]), ['dinner', 'that thursday']);
  eq('  and an empty string counts as unset',
    names([ev('blank', '', ''), ev('monday', '2026-10-20', '09:00')]), ['monday', 'blank']);
}

console.log('\n— the flag as the database writes it —');
{
  // SQLite has no boolean: company_hosted comes back as 1 or 0.
  eq('1 hosts, 0 does not',
    names([{ name: 'theirs', event_date: '2026-10-20', event_time: '09:00', company_hosted: 0 },
           { name: 'ours', event_date: '2026-10-23', event_time: '09:00', company_hosted: 1 }]),
    ['ours', 'theirs']);
  eq('  and a missing flag is not hosted',
    names([{ name: 'theirs', event_date: '2026-10-20', event_time: '09:00' },
           { name: 'ours', event_date: '2026-10-23', event_time: '09:00', company_hosted: true }]),
    ['ours', 'theirs']);
}

console.log('\n— and it is a sort, not a shuffle —');
{
  // Two events at the same hour keep the order they arrived in, so the cards
  // do not swap places between renders.
  const tie = [ev('first in', '2026-10-21', '18:00'), ev('second in', '2026-10-21', '18:00')];
  eq('equal times keep their order', names(tie), ['first in', 'second in']);
  eq('  every render the same', names(sortSocialEvents(tie)), ['first in', 'second in']);

  // The caller's array is React state; sorting it in place would mutate it.
  const original = [ev('b', '2026-10-22', '09:00'), ev('a', '2026-10-20', '09:00')];
  const copy = [...original];
  sortSocialEvents(original);
  eq('the array handed in is untouched', original.map(e => e.name), copy.map(e => e.name));

  eq('nothing in, nothing out', sortSocialEvents([]), []);
  eq('  and one stays one', names([ev('only', '2026-10-20', '09:00')]), ['only']);
}

console.log('\n— and the tab lists them in that order —');
{
  const table = strip('components/SocialEventsTable.tsx');

  /*
   * Sorted in the component rather than left to the query's ORDER BY: the
   * list changes without being fetched again, so an event added — or one that
   * has just had Company Hosted ticked — takes its place on the click rather
   * than at the next load.
   */
  eq('the tab sorts what it was handed',
    /const ordered = useMemo\(\(\) => sortSocialEvents\(events\), \[events\]\);/.test(table), true);
  eq('  and renders that, not the raw list', /\{ordered\.map\(ev => \{/.test(table), true);
  eq('  with nothing else mapping the cards', (table.match(/events\.map\(ev =>/g) ?? []).length, 0);

  // The query still asks for time order, which is the right order inside each
  // group and the order the other readers of this endpoint get.
  const route = strip('app/api/social-events/route.ts');
  eq('the query still orders by date and time',
    /ORDER BY event_date ASC, event_time ASC/.test(route), true);

  /*
   * The same precedence the pre-conference review already gives the flag,
   * where the two groups are headed sections rather than one run of cards.
   */
  const pre = strip('components/pre-conference/SocialEventsTab.tsx');
  eq('the pre-conference review puts hosted first too',
    pre.indexOf('Company-Hosted Events') < pre.indexOf('External Events'), true);
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
