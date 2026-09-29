/**
 * The line along the top of a conference card.
 *
 *   node --experimental-strip-types --import ./tests/register-ts.mjs \
 *        tests/conference-card-bar.mjs
 *
 * It said "Happening now", "in 12 days" and "Post-conference · 10 days
 * remaining". The first is true of every live show at once and says nothing
 * about which morning a rep is on; the other two name a number without saying
 * what it counts down to, and the third repeats the word already on the badge
 * beside it.
 *
 * Every label here is RUN against a fixed clock rather than read out of the
 * source, because every one of them is arithmetic: which day of the show it
 * is, and how many are left. Grepping for the string `Day ${day}` would pass
 * with the day number off by one.
 *
 * Exits non-zero on the first failing expectation, so it can gate a build.
 */
// Set before anything reads a Date, and set HERE rather than left to whoever
// runs the suite. These dates are compared in UTC, the way lib/conference-stage
// compares them, and a container running in UTC cannot tell that apart from a
// mutant parsing them locally — so the test has to sit behind Greenwich.
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

const { conferenceDayLabel, startsInLabel, closesInLabel } =
  await import('@/lib/conferenceCardBar');

/** Noon UTC on a date, so a mutant reading local time lands on another day. */
const at = (date) => Date.parse(`${date}T12:00:00Z`);

console.log('\n— which day of the show it is —');
{
  // A three-day conference, walked through.
  const day = (d) => conferenceDayLabel('2026-09-28', '2026-09-30', at(d));
  eq('the first morning', day('2026-09-28'), 'Day 1');
  eq('  the second', day('2026-09-29'), 'Day 2');
  /*
   * And the last one is NAMED, not numbered.
   *
   * That is the fact a rep acts on — the morning to get the remaining
   * meetings booked — and "Day 3" only says so to somebody who already knows
   * how long the show runs.
   */
  eq('  and the last is named', day('2026-09-30'), 'Final Day');

  // A one-day conference is its own final day. Numbering it "Day 1" would be
  // true and useless: there is no second day to get to.
  eq('a one-day show is the final day', conferenceDayLabel('2026-09-28', '2026-09-28', at('2026-09-28')), 'Final Day');

  // A longer one, to catch an off-by-one that a three-day show hides.
  const week = (d) => conferenceDayLabel('2026-09-28', '2026-10-04', at(d));
  eq('a week-long show counts through', [
    week('2026-09-28'), week('2026-09-30'), week('2026-10-03'), week('2026-10-04'),
  ], ['Day 1', 'Day 3', 'Day 6', 'Final Day']);

  /*
   * Clamped at both ends.
   *
   * A stage override can put a conference in progress outside its own dates,
   * and a card is not the place to argue with that: the first day before it
   * starts, the final day after it ends. "Day 0" and "Day -3" are not days.
   */
  eq('before it starts, the first day', day('2026-09-20'), 'Day 1');
  eq('  after it ends, the final one', day('2026-10-20'), 'Final Day');

  // Dates read in UTC, like the stage that decides this card is in progress at
  // all. Late evening in Los Angeles on the 28th is already the 29th in UTC,
  // and the badge beside the bar has already moved.
  eq('the day turns at UTC midnight, as the stage does',
    conferenceDayLabel('2026-09-28', '2026-09-30', Date.parse('2026-09-29T00:30:00Z')), 'Day 2');

  // Nothing usable to count from: the plain statement, not "Day NaN".
  eq('an unusable date falls back rather than counting',
    conferenceDayLabel('', '', at('2026-09-28')), 'Happening now');
}

console.log('\n— how long until one starts —');
{
  eq('a fortnight out', startsInLabel(12), 'Starts in 12 days');
  // Singular. "Starts in 1 days" is the kind of thing a reader trusts less
  // afterwards.
  eq('  the day before', startsInLabel(1), 'Starts in 1 day');
  /*
   * And the morning of, which is the one day the line matters most.
   *
   * The countdown reaches nought before the conference flips to in_progress,
   * and "Starts in 0 days" is what that produced.
   */
  eq('  the morning of', startsInLabel(0), 'Starts today');
  eq('  never counting below it', startsInLabel(-3), 'Starts today');
}

console.log('\n— how long before the window shuts —');
{
  eq('ten days of window left', closesInLabel(10), 'Closes in 10 days');
  eq('  the last full day', closesInLabel(1), 'Closes in 1 day');
  eq('  and the day it shuts', closesInLabel(0), 'Closes today');
  eq('  never counting below it', closesInLabel(-2), 'Closes today');
}

console.log('\n— and the card says it —');
{
  const card = strip('components/ProgramConferenceCard.tsx');

  // Both surfaces that draw this card get the change, because they draw THIS
  // card. That is the whole reason the bar lives here.
  eq('the bar is built from the shared labels',
    /label: conferenceDayLabel\(conference\.start_date, conference\.end_date\)/.test(card), true);
  eq('  for a show that has not started', /const label = startsInLabel\(daysUntil\);/.test(card), true);
  eq('  and one whose window is closing', /label: closesInLabel\(daysRemaining\)/.test(card), true);

  // The strings they replaced are gone, not merely unused.
  for (const [what, pattern] of [
    ['"Happening now" as the live label', /label: 'Happening now'/],
    ['the bare "in N days"', /label: `in \$\{daysUntil\} days`/],
    ['the stage repeated back at its own badge', /Post-conference · \$\{daysRemaining\}/],
  ]) {
    eq(`${what} is gone`, pattern.test(card), false);
  }

  // The dashboard banner draws the Program tab's own card rather than a copy,
  // so it gets all of this for nothing. If that ever stopped being true the
  // two would drift apart a label at a time.
  eq('the banner draws this same card',
    /<ProgramConferenceCard/.test(strip('components/DashboardConferenceBanner.tsx')), true);
  eq('  as does the Program tab',
    /<ProgramConferenceCard/.test(strip('app/conferences/page.tsx')), true);
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
