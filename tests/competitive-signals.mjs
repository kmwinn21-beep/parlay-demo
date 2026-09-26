/**
 * What the competitive view highlights, and why each card survived a filter.
 *
 *   node --experimental-strip-types --import ./tests/register-ts.mjs \
 *        tests/competitive-signals.mjs
 *
 * Three signals, and each has a way of being quietly wrong:
 *
 *   evaluatingAlternatives  an over-inclusive self-join passes every "is it
 *                           flagged" test perfectly, so the cases here test
 *                           what must NOT be flagged as hard as what must.
 *   recentChange            the window is checked AT the boundary from both
 *                           sides, and a non-status edit is checked explicitly
 *                           — updated_at moves on a notes correction, and
 *                           reading that as a change is the bug this column
 *                           exists to avoid.
 *   internalRelationship    each of its two sources flags on its own.
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
  deriveSignals, countSignals, hasAnySignal, isRecent, daysSince,
  RECENT_DAYS, ROW_LABELS, SIGNAL_LABELS, SIGNAL_PILL_LABELS,
} = await import('@/lib/competitiveSignals');

const strip = (f) => readFileSync(f, 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const NOW = new Date('2026-09-26T12:00:00Z');
const daysAgo = (n) => {
  const d = new Date(NOW.getTime() - n * 24 * 60 * 60 * 1000);
  return d.toISOString().replace('T', ' ').slice(0, 19);
};

// company 1 is the account; 10, 20, 30 are competitors.
const rel = (id, companyId, competitorId, statusClass, statusChangedAt = null) =>
  ({ id, companyId, competitorId, statusClass, statusChangedAt });

const flagged = (res, companyId, competitorId, key) =>
  res.cells.find(c => c.companyId === companyId && c.competitorId === competitorId)?.signals[key];

console.log('\n— evaluating alternatives: what must be flagged —');
{
  // The case the view exists for: buying from one, trying another.
  const res = deriveSignals({
    relationships: [rel(1, 1, 10, 'current'), rel(2, 1, 20, 'evaluating')],
    now: NOW,
  });
  eq('current with one and evaluating another flags both cells',
    [flagged(res, 1, 10, 'evaluatingAlternatives'), flagged(res, 1, 20, 'evaluatingAlternatives')],
    [true, true]);

  // The pair comes back so the connector is drawn from it rather than worked
  // out again in the view.
  eq('  and the matched pair comes back', res.pairs,
    [{ companyId: 1, currentCompetitorId: 10, evaluatingCompetitorId: 20 }]);
  // Read defensively: a change that stops pairs being built should turn this
  // red, not throw. A crash exits non-zero too, and a mutation harness cannot
  // tell that from a caught mutant.
  eq('  naming which end is which',
    [res.pairs[0]?.currentCompetitorId ?? null, res.pairs[0]?.evaluatingCompetitorId ?? null],
    [10, 20]);
}

console.log('\n— evaluating alternatives: what must NOT be —');
{
  // An over-inclusive join passes every positive test. These are the ones that
  // catch it.
  const currentOnly = deriveSignals({ relationships: [rel(1, 1, 10, 'current')], now: NOW });
  eq('current with one competitor alone is not flagged',
    flagged(currentOnly, 1, 10, 'evaluatingAlternatives'), false);
  eq('  and produces no pair', currentOnly.pairs, []);

  const twoCurrents = deriveSignals({
    relationships: [rel(1, 1, 10, 'current'), rel(2, 1, 20, 'current')],
    now: NOW,
  });
  eq('two currents and no evaluating is not a pair', twoCurrents.pairs, []);
  eq('  and neither cell is flagged',
    twoCurrents.cells.some(c => c.signals.evaluatingAlternatives), false);

  const evalOnly = deriveSignals({
    relationships: [rel(1, 1, 10, 'evaluating'), rel(2, 1, 20, 'evaluating')],
    now: NOW,
  });
  eq('evaluating two competitors with no current is not flagged',
    [flagged(evalOnly, 1, 10, 'evaluatingAlternatives'), flagged(evalOnly, 1, 20, 'evaluatingAlternatives')],
    [false, false]);
  eq('  and produces no pair', evalOnly.pairs, []);

  // The same competitor on both sides is an account trying more of what it
  // already buys, not an account in play.
  const same = deriveSignals({
    relationships: [rel(1, 1, 10, 'current'), rel(2, 1, 10, 'evaluating')],
    now: NOW,
  });
  eq('current and evaluating the SAME competitor is not flagged',
    flagged(same, 1, 10, 'evaluatingAlternatives'), false);
  eq('  and produces no pair', same.pairs, []);

  // Two different accounts must not be joined into one another's business.
  const twoCompanies = deriveSignals({
    relationships: [rel(1, 1, 10, 'current'), rel(2, 2, 20, 'evaluating')],
    now: NOW,
  });
  eq('one account current and a DIFFERENT account evaluating is not a pair',
    twoCompanies.pairs, []);

  // Former is neither side of the join.
  const former = deriveSignals({
    relationships: [rel(1, 1, 10, 'former'), rel(2, 1, 20, 'evaluating')],
    now: NOW,
  });
  eq('a former vendor does not stand in for a current one', former.pairs, []);

  // Every current × evaluating combination, when there are several.
  const many = deriveSignals({
    relationships: [
      rel(1, 1, 10, 'current'), rel(2, 1, 20, 'current'), rel(3, 1, 30, 'evaluating'),
    ],
    now: NOW,
  });
  eq('two currents and one evaluating make two pairs', many.pairs.length, 2);
  eq('  both naming the same evaluating end',
    many.pairs.map(p => p.evaluatingCompetitorId), [30, 30]);
  eq('  and every cell is flagged', many.cells.every(c => c.signals.evaluatingAlternatives), true);
}

console.log('\n— recent change: the window, at the boundary —');
{
  const at = (days) => deriveSignals({
    relationships: [rel(1, 1, 10, 'current', daysAgo(days))], now: NOW,
  });
  eq('a change yesterday flags', flagged(at(1), 1, 10, 'recentChange'), true);
  // Both sides of the boundary, because an off-by-one here is invisible.
  eq(`  a change exactly ${RECENT_DAYS} days ago flags`,
    flagged(at(RECENT_DAYS), 1, 10, 'recentChange'), true);
  eq(`  one day past ${RECENT_DAYS} does not`,
    flagged(at(RECENT_DAYS + 1), 1, 10, 'recentChange'), false);
  eq('  and a year ago does not', flagged(at(365), 1, 10, 'recentChange'), false);

  // null is "no known change". Not an old one, and certainly not the epoch —
  // the backfill could only see changes logged through the update form, so a
  // status changed through the edit form before the column existed is null.
  const unknown = deriveSignals({ relationships: [rel(1, 1, 10, 'current', null)], now: NOW });
  eq('no known change is no signal', flagged(unknown, 1, 10, 'recentChange'), false);
  const missing = deriveSignals({ relationships: [rel(1, 1, 10, 'current')], now: NOW });
  eq('  and so is the field being absent', flagged(missing, 1, 10, 'recentChange'), false);
  const blank = deriveSignals({ relationships: [rel(1, 1, 10, 'current', '   ')], now: NOW });
  eq('  or blank', flagged(blank, 1, 10, 'recentChange'), false);
  const nonsense = deriveSignals({ relationships: [rel(1, 1, 10, 'current', 'last tuesday')], now: NOW });
  eq('  or unparseable', flagged(nonsense, 1, 10, 'recentChange'), false);

  // THE assertion this column exists for. A notes correction, a rep change or
  // a "still accurate" confirmation bumps updated_at; none of them is a status
  // change, and none of them writes status_changed_at.
  const edited = deriveSignals({
    relationships: [{
      id: 1, companyId: 1, competitorId: 10, statusClass: 'current',
      statusChangedAt: null,
      // What a non-status edit leaves behind. Present on the row, ignored here.
      updatedAt: daysAgo(1), statusAsOf: daysAgo(1),
    }],
    now: NOW,
  });
  eq('a non-status edit does not flag as a change',
    flagged(edited, 1, 10, 'recentChange'), false);

  // Clock skew between a tenant database and the browser is small but real.
  const future = deriveSignals({
    relationships: [rel(1, 1, 10, 'current', '2027-01-01 00:00:00')], now: NOW,
  });
  eq('a stamp in the future is recent, not negatively old',
    flagged(future, 1, 10, 'recentChange'), true);
  // Through isRecent a negative age still reads as recent, so the clamp is
  // invisible there. Asserted on the age itself.
  eq('  and its age is zero rather than negative',
    daysSince('2027-01-01 00:00:00', NOW), 0);

  eq('a stamp that names its zone is left alone',
    Math.round(daysSince('2026-09-25T12:00:00Z', NOW)), 1);
}

console.log('\n— the stored shape is read as UTC, wherever the reader is —');
{
  // This cannot be asserted in this process: the container runs in UTC, so
  // local and UTC agree and a missing fix-up looks identical to a working one.
  // Run in a western zone it is eight hours of drift, which at the window
  // boundary decides the answer.
  //
  // A child process is the only way to change TZ, which V8 reads once at
  // startup.
  const probe = `
    const { daysSince, isRecent, RECENT_DAYS } = await import('@/lib/competitiveSignals');
    const now = new Date('2026-09-26T19:00:00Z');
    const boundary = new Date(now.getTime() - RECENT_DAYS * 86400000)
      .toISOString().replace('T', ' ').slice(0, 19);
    console.log(JSON.stringify({
      tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
      hours: daysSince('2026-09-26 12:00:00', now) * 24,
      atBoundary: isRecent(boundary, now),
    }));
  `;
  const { execFileSync } = await import('node:child_process');
  const out = execFileSync(process.execPath, [
    '--experimental-strip-types', '--import', './tests/register-ts.mjs',
    '--input-type=module', '--eval', probe,
  ], { env: { ...process.env, TZ: 'America/Los_Angeles' }, encoding: 'utf8' });
  const got = JSON.parse(out.trim().split('\n').pop());

  eq('the child really is in a western zone', got.tz, 'America/Los_Angeles');
  // 19:00Z minus 12:00Z is seven hours. Parsed as local it would be seven
  // hours in the future, which the clamp reads as zero.
  eq('a bare stamp is seven hours old, not zero', Math.round(got.hours), 7);
  // And a change exactly at the window edge still counts, rather than being
  // pushed outside it by the offset.
  eq('  and the boundary still falls inside the window', got.atBoundary, true);
}

console.log('\n— internal relationship: each source on its own —');
{
  const base = [rel(1, 1, 10, 'current')];
  const internalOnly = deriveSignals({
    relationships: base, companiesWithInternal: [1], now: NOW,
  });
  eq('an internal relationship flags on its own',
    flagged(internalOnly, 1, 10, 'internalRelationship'), true);

  const activityOnly = deriveSignals({
    relationships: base, lastActivityByCompany: { 1: daysAgo(10) }, now: NOW,
  });
  eq('recent activity flags on its own',
    flagged(activityOnly, 1, 10, 'internalRelationship'), true);

  // An internal relationship is a standing fact and takes no window.
  const oldInternal = deriveSignals({
    relationships: base, companiesWithInternal: [1],
    lastActivityByCompany: { 1: daysAgo(900) }, now: NOW,
  });
  eq('  and an internal relationship is not aged out by stale activity',
    flagged(oldInternal, 1, 10, 'internalRelationship'), true);

  // Activity is an event and does take one.
  const staleActivity = deriveSignals({
    relationships: base, lastActivityByCompany: { 1: daysAgo(RECENT_DAYS + 1) }, now: NOW,
  });
  eq('activity outside the window does not flag',
    flagged(staleActivity, 1, 10, 'internalRelationship'), false);
  const boundary = deriveSignals({
    relationships: base, lastActivityByCompany: { 1: daysAgo(RECENT_DAYS) }, now: NOW,
  });
  eq(`  and activity exactly ${RECENT_DAYS} days ago does`,
    flagged(boundary, 1, 10, 'internalRelationship'), true);

  eq('neither source is no signal',
    flagged(deriveSignals({ relationships: base, now: NOW }), 1, 10, 'internalRelationship'), false);
  // Somebody else's internal relationship is not this account's.
  eq('  and another company\u2019s does not carry over',
    flagged(deriveSignals({ relationships: base, companiesWithInternal: [2], now: NOW }), 1, 10,
      'internalRelationship'), false);
}

console.log('\n— a status nobody classified —');
{
  // Fail closed, and say so. Guessing from the words breaks the moment an
  // account renames one, and breaks silently in a language nobody anticipated.
  const res = deriveSignals({
    relationships: [
      rel(1, 1, 10, 'current'),
      rel(2, 1, 20, null),
      rel(3, 1, 30, null),
    ],
    now: NOW,
  });
  eq('an unclassified relationship gets no cell', res.cells.length, 1);
  eq('  takes no part in a pair', res.pairs, []);
  eq('  and is counted rather than dropped quietly', res.unclassifiedCount, 2);
  eq('everything classified is counted as nothing', deriveSignals({
    relationships: [rel(1, 1, 10, 'current')], now: NOW,
  }).unclassifiedCount, 0);

  // An unclassified status must not stand in for a current one on the join.
  const wouldPair = deriveSignals({
    relationships: [rel(1, 1, 10, null), rel(2, 1, 20, 'evaluating')], now: NOW,
  });
  eq('an unclassified status does not complete a pair', wouldPair.pairs, []);

  // A value that is not one of the three classes is unclassified, not a class.
  const bogus = deriveSignals({
    relationships: [{ id: 1, companyId: 1, competitorId: 10, statusClass: 'partner' }], now: NOW,
  });
  eq('an unrecognised class is unclassified', bogus.unclassifiedCount, 1);
  eq('  and gets no cell', bogus.cells.length, 0);
}

console.log('\n— rows, counts and filters —');
{
  const res = deriveSignals({
    relationships: [
      rel(1, 1, 10, 'evaluating'), rel(2, 1, 20, 'current'), rel(3, 1, 30, 'former'),
    ],
    now: NOW,
  });
  eq('each class has its row',
    res.cells.map(c => c.row), ['activeEvaluation', 'useCompetitor', 'recentChange']);

  // A company in two cells is two relationships to two competitors, which is
  // the point of the grid.
  eq('the same company appears once per competitor', res.cells.length, 3);

  const counts = countSignals(res.cells);
  eq('the rail counts each signal', counts.evaluatingAlternatives, 2);
  eq('  and the ones with none', counts.recentChange, 0);
  eq('a cell with nothing carries no signal',
    hasAnySignal(deriveSignals({ relationships: [rel(1, 1, 10, 'former')], now: NOW }).cells[0]), false);
  eq('  and one with something does', hasAnySignal(res.cells[0]), true);

  eq('nothing in is nothing out', deriveSignals({ relationships: [], now: NOW }),
    { cells: [], pairs: [], unclassifiedCount: 0 });
}

console.log('\n— labels live in one place —');
{
  const lib = strip('lib/competitiveSignals.ts');
  eq('the row titles are as specified',
    [ROW_LABELS.activeEvaluation, ROW_LABELS.useCompetitor, ROW_LABELS.recentChange],
    ['Active Evaluation', 'Use Competitor', 'Recent Change']);
  eq('  and the signal names',
    [SIGNAL_LABELS.evaluatingAlternatives, SIGNAL_LABELS.recentChange, SIGNAL_LABELS.internalRelationship],
    ['Evaluating Alternatives', 'Recent Change', 'Int. Relationship']);
  // "Evaluating Alternatives" will not fit a pill at cell width.
  eq('  with a short form for the pill',
    SIGNAL_PILL_LABELS.evaluatingAlternatives, 'Evaluating Alt.');

  // One constant, used by both windows. Two that happen to be equal today are
  // two that disagree later.
  eq('the window is one named constant', RECENT_DAYS, 90);
  eq('  and 90 appears nowhere else in the module',
    (lib.match(/\b90\b/g) ?? []).length, 1);

  // Keys are not labels. A render site reaching for a string would put the
  // wording in two places.
  eq('the keys are separate from the words',
    /activeEvaluation|useCompetitor/.test(lib) && /ROW_LABELS/.test(lib), true);
}

console.log('\n— the column the signal reads —');
{
  const mig = readFileSync('lib/db-migrations.ts', 'utf8');
  const put = strip('app/api/vendor-relationships/route.ts');
  const upd = strip('app/api/vendor-relationships/updates/route.ts');

  eq('statuses are keyed, not matched by name',
    /action_key = 'current'[\s\S]{0,160}'Current Vendor', 'Preferred Partner'/.test(mig), true);
  eq('  with pilots and evaluations together',
    /action_key = 'evaluating'[\s\S]{0,160}'Evaluating', 'Active Pilot'/.test(mig), true);
  eq('  and Other left unkeyed',
    /action_key = '\w+'[\s\S]{0,120}value = 'Other'/.test(mig), false);

  eq('the column exists', /ALTER TABLE vendor_relationships ADD COLUMN status_changed_at TEXT/.test(mig), true);
  eq('  backfilled only from real status changes',
    /ru\.status_after IS NOT NULL AND TRIM\(ru\.status_after\) != ''/.test(mig), true);
  eq('  and the backfill says it is incomplete',
    /INCOMPLETE BY CONSTRUCTION/.test(mig), true);

  // Both write paths, and only on a real change.
  eq('the edit form stamps only when the status differs',
    /const statusChanged = previous !== statuses;/.test(put), true);
  eq('  reading the old value to know', /SELECT relationship_status FROM vendor_relationships WHERE id = \?/.test(put), true);
  eq('the update form stamps only when the status differs',
    /const STATUS_STAMP = changed \? ", status_changed_at = datetime\('now'\)" : '';/.test(upd), true);
  // The confirmation path moves status_as_of and must never move this.
  eq('  and status_as_of stays a different fact',
    /status_as_of = datetime\('now'\)/.test(upd) && /STATUS_STAMP/.test(upd), true);
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
