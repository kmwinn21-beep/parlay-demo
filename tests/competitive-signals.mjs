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
 *   internalRelationship    the one source flags it, a window never ages it
 *                           out, and no activity feed can stand in for it.
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
  RECENT_DAYS, ROW_LABELS, SIGNAL_LABELS, SIGNAL_ABBREVIATIONS, SIGNAL_FULL_LABELS,
} = await import('@/lib/competitiveSignals');

const strip = (f) => readFileSync(f, 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const NOW = new Date('2026-09-26T12:00:00Z');
/** Years on, for showing that a standing fact takes no window. */
const FUTURE = new Date('2031-09-26T12:00:00Z');
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
  eq('  and the matched pair comes back', res.pairs, [{
    companyId: 1,
    a: { competitorId: 10, row: 'useCompetitor' },
    b: { competitorId: 20, row: 'activeEvaluation' },
  }]);
  // Each end carries its row, so the connector can be drawn between any two
  // cells without the view working out where they landed.
  // Read defensively: a change that stops pairs being built should turn this
  // red, not throw. A crash exits non-zero too, and a mutation harness cannot
  // tell that from a caught mutant.
  eq('  each end knowing its own row',
    [res.pairs[0]?.a?.row ?? null, res.pairs[0]?.b?.row ?? null],
    ['useCompetitor', 'activeEvaluation']);
  eq('  and which competitor it is',
    [res.pairs[0]?.a?.competitorId ?? null, res.pairs[0]?.b?.competitorId ?? null],
    [10, 20]);
}

console.log('\n— evaluating alternatives: two trials against each other —');
{
  // The signal's own words, taken literally. Nobody has won yet, which is the
  // case a rep most wants at a conference.
  const two = deriveSignals({
    relationships: [rel(1, 1, 10, 'evaluating'), rel(2, 1, 20, 'evaluating')],
    now: NOW,
  });
  eq('evaluating two competitors flags both cells',
    [flagged(two, 1, 10, 'evaluatingAlternatives'), flagged(two, 1, 20, 'evaluatingAlternatives')],
    [true, true]);
  eq('  and pairs them', two.pairs, [{
    companyId: 1,
    a: { competitorId: 10, row: 'activeEvaluation' },
    b: { competitorId: 20, row: 'activeEvaluation' },
  }]);
  // Both ends land in the same band, so the connector runs across one row.
  eq('  with both ends in Active Evaluation',
    [two.pairs[0]?.a?.row, two.pairs[0]?.b?.row], ['activeEvaluation', 'activeEvaluation']);

  // (A,B) and (B,A) are one fact. Emitting both would draw the line twice and
  // count the signal twice in the rail.
  eq('each unordered pair once', two.pairs.length, 1);
  const three = deriveSignals({
    relationships: [
      rel(1, 1, 10, 'evaluating'), rel(2, 1, 20, 'evaluating'), rel(3, 1, 30, 'evaluating'),
    ],
    now: NOW,
  });
  eq('  three evaluations make three pairs, not six', three.pairs.length, 3);
  eq('  and every one of them is flagged',
    three.cells.every(c => c.signals.evaluatingAlternatives), true);

  // Two rows naming the SAME competitor is one relationship recorded twice,
  // not an account weighing a vendor against itself. resolveCompetitive already
  // collapses those, but this module is pure and does not get to assume its
  // caller did — the same reason the buy-versus-trial loop has the same guard.
  const dupe = deriveSignals({
    relationships: [rel(1, 1, 10, 'evaluating'), rel(2, 1, 10, 'evaluating')],
    now: NOW,
  });
  eq('two trials of the same competitor make no pair', dupe.pairs, []);
  eq('  and flag nothing',
    dupe.cells.some(c => c.signals.evaluatingAlternatives), false);

  // A trial against a buy still pairs, so adding the new shape did not replace
  // the old one.
  const both = deriveSignals({
    relationships: [
      rel(1, 1, 10, 'current'), rel(2, 1, 20, 'evaluating'), rel(3, 1, 30, 'evaluating'),
    ],
    now: NOW,
  });
  eq('a buy and two trials make three pairs', both.pairs.length, 3);
  // The signal is set from the pair SET, so all three cards light together —
  // lighting two of them would say the third is not part of the same decision.
  eq('  and all three cards carry the signal',
    both.cells.map(c => [c.competitorId, c.signals.evaluatingAlternatives]),
    [[10, true], [20, true], [30, true]]);
  eq('  two of them against the incumbent',
    both.pairs.filter(p => p.a.row === 'useCompetitor').length, 2);
  eq('  and one between the trials',
    both.pairs.filter(p => p.a.row === 'activeEvaluation' && p.b.row === 'activeEvaluation').length, 1);
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

  // Two CURRENTS are not a pair. An account running two vendors side by side
  // has decided; it is not weighing anything, and saying so would put the pill
  // on half the book. (Two EVALUATIONS are — see the section above.)
  const bothCurrent = deriveSignals({
    relationships: [rel(1, 1, 10, 'current'), rel(2, 1, 20, 'current')],
    now: NOW,
  });
  eq('two currents and nothing being tried is not flagged',
    [flagged(bothCurrent, 1, 10, 'evaluatingAlternatives'),
      flagged(bothCurrent, 1, 20, 'evaluatingAlternatives')], [false, false]);
  eq('  and produces no pair', bothCurrent.pairs, []);

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
    many.pairs.map(p => p.b.competitorId), [30, 30]);
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

console.log('\n— internal relationship: one source, and only one —');
{
  const base = [rel(1, 1, 10, 'current')];
  const internalOnly = deriveSignals({
    relationships: base, companiesWithInternal: [1], now: NOW,
  });
  eq('an internal relationship flags the cell',
    flagged(internalOnly, 1, 10, 'internalRelationship'), true);

  // A standing fact, so no window. Somebody who knows somebody there still
  // knows them, whatever the date on the row.
  eq('  and is never aged out',
    flagged(deriveSignals({ relationships: base, companiesWithInternal: [1], now: FUTURE }),
      1, 10, 'internalRelationship'), true);

  eq('no internal relationship is no signal',
    flagged(deriveSignals({ relationships: base, now: NOW }), 1, 10, 'internalRelationship'), false);
  // Somebody else's internal relationship is not this account's.
  eq('  and another company\u2019s does not carry over',
    flagged(deriveSignals({ relationships: base, companiesWithInternal: [2], now: NOW }), 1, 10,
      'internalRelationship'), false);

  // The pill says "Int. Relationship". A meeting or a touchpoint is not one,
  // and the module must not offer a way to pretend otherwise: a parameter
  // nothing passes is a promise the module is not keeping.
  const mod = strip('lib/competitiveSignals.ts');
  eq('the module takes no activity feed at all',
    /lastActivity/i.test(mod), false);
  eq('  and the signal reads only the internal set',
    /internalRelationship: withInternal\.has\(r\.companyId\),/.test(mod), true);
  // Passing one anyway must not quietly work.
  eq('  an activity feed passed by mistake changes nothing',
    flagged(deriveSignals({
      relationships: base, lastActivityByCompany: { 1: daysAgo(1) }, now: NOW,
    }), 1, 10, 'internalRelationship'), false);
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
    { cells: [], pairs: [], switches: [], unclassifiedCount: 0 });
}

console.log('\n— a switch somebody recorded —');
{
  // Never derived. "They left A for B" is a claim about cause, and two
  // end-states and a calendar cannot establish one — so it arrives as input.
  const base = [rel(1, 1, 10, 'former'), rel(2, 1, 20, 'current')];
  const sw = { companyId: 1, fromCompetitorId: 10, toCompetitorId: 20 };
  const res = deriveSignals({ relationships: base, switches: [sw], now: NOW });
  eq('both ends of a recorded switch carry the signal',
    res.cells.map(c => [c.competitorId, c.signals.switched]), [[10, true], [20, true]]);
  eq('  and the switch comes back for the connector', res.switches, [sw]);
  eq('no switches recorded means no signal',
    deriveSignals({ relationships: base, now: NOW }).cells.map(c => c.signals.switched),
    [false, false]);
  // Half a connector points at a cell that is not there and reads as a bug.
  eq('a switch with an end that drew no cell is not returned',
    deriveSignals({
      relationships: [rel(1, 1, 10, 'former')], switches: [sw], now: NOW,
    }).switches, []);
  eq('  and the end that IS drawn still carries the signal',
    deriveSignals({
      relationships: [rel(1, 1, 10, 'former')], switches: [sw], now: NOW,
    }).cells.map(c => c.signals.switched), [true]);
  // Another account's switch is not this one's.
  eq('a switch belongs to its own account',
    deriveSignals({
      relationships: [rel(1, 2, 10, 'former'), rel(2, 2, 20, 'current')],
      switches: [sw], now: NOW,
    }).cells.map(c => c.signals.switched), [false, false]);
  // A switch is a durable fact, not a recent event: the window belongs to
  // Recent Change, which answers a different question.
  eq('no window is applied to it',
    deriveSignals({ relationships: base, switches: [sw], now: FUTURE })
      .cells.every(c => c.signals.switched), true);
  // Its own signal, so it counts and filters on its own.
  eq('it counts separately',
    countSignals(res.cells).switched, 2);
}

console.log('\n— ordering a Recent Change cell —');
{
  const { byRecency } = await import('@/lib/competitiveSignals');
  const cell = (id, changed) => ({
    relationshipId: id, companyId: 1, competitorId: 10, statusClass: 'former',
    row: 'recentChange', statusChangedAt: changed,
    signals: { evaluatingAlternatives: false, recentChange: false, internalRelationship: false },
  });
  const order = list => list.slice().sort(byRecency).map(c => c.relationshipId);

  // The order IS the information here: the account that moved last week is the
  // call to make, and it belongs at the top rather than wherever the query
  // happened to return it.
  eq('most recently changed first',
    order([cell(1, '2026-01-01 00:00:00'), cell(2, '2026-09-01 00:00:00'), cell(3, '2026-05-01 00:00:00')]),
    [2, 3, 1]);
  eq('  whatever order they arrive in',
    order([cell(3, '2026-05-01 00:00:00'), cell(2, '2026-09-01 00:00:00'), cell(1, '2026-01-01 00:00:00')]),
    [2, 3, 1]);

  // A null date is no KNOWN change. Putting "we have no idea when this moved"
  // above "this moved on Tuesday" would be exactly backwards.
  eq('unknown dates sort last',
    order([cell(1, null), cell(2, '2020-01-01 00:00:00'), cell(3, null)]), [2, 1, 3]);
  eq('  and last even against a very old date',
    order([cell(1, null), cell(2, '1999-01-01 00:00:00')]), [2, 1]);
  eq('  never first', order([cell(9, null), cell(2, '2026-09-01 00:00:00')])[0], 2);
  eq('all unknown falls back to the id, so the cell is stable',
    order([cell(7, null), cell(3, null), cell(5, null)]), [3, 5, 7]);
  eq('  as does an exact tie on the date',
    order([cell(7, '2026-02-02 00:00:00'), cell(3, '2026-02-02 00:00:00')]), [3, 7]);
  // Sorting must not mutate what it was handed.
  const given = [cell(1, '2026-01-01 00:00:00'), cell(2, '2026-09-01 00:00:00')];
  given.slice().sort(byRecency);
  eq('  and the input is left alone', given.map(c => c.relationshipId), [1, 2]);

  // The date has to survive derivation, or there is nothing to sort on.
  const derived = deriveSignals({
    relationships: [rel(1, 1, 10, 'former', daysAgo(5))], now: NOW,
  });
  eq('the cell carries the change date through', derived.cells[0]?.statusChangedAt, daysAgo(5));
}

console.log('\n— labels live in one place —');
{
  const lib = strip('lib/competitiveSignals.ts');
  eq('the row titles are as specified',
    [ROW_LABELS.activeEvaluation, ROW_LABELS.useCompetitor, ROW_LABELS.recentChange],
    ['Active Evaluation', 'Use Competitor', 'Left Competitor']);
  // The row and the signal must not share a name. They did, and on screen the
  // signal's pill lands in all three rows — so a Recent Change pill sat in
  // Active Evaluation, next to a row headed Recent Change, reading as a bug.
  eq('  and no row is named after a signal',
    Object.values(ROW_LABELS).some(l => Object.values(SIGNAL_LABELS).includes(l)), false);
  // The key is what the status class maps to and does not follow the wording.
  eq('  while the KEY is still recentChange',
    Object.keys(ROW_LABELS).includes('recentChange'), true);
  // The rail's rows head a filter with a count beside them — "8 Recent
  // Changes" — so they name a quantity and read plural.
  eq('  and the signal names, as the rail counts them',
    [SIGNAL_LABELS.evaluatingAlternatives, SIGNAL_LABELS.recentChange, SIGNAL_LABELS.internalRelationship],
    ['Evaluating Alternatives', 'Recent Changes', 'Internal Relationships']);
  eq('  none of which is abbreviated either',
    Object.values(SIGNAL_LABELS).some(v => v.includes('.')), false);
  // Three names for three jobs, and none of them is the others shortened by
  // accident. The rail has a filter row with a count eating the end of it, the
  // badge beside a company name has room for two letters, and the legend is
  // where somebody goes to find out what those two letters mean.
  eq('  a two-letter form for the badge beside a name',
    [SIGNAL_ABBREVIATIONS.evaluatingAlternatives, SIGNAL_ABBREVIATIONS.recentChange,
      SIGNAL_ABBREVIATIONS.internalRelationship], ['EA', 'RC', 'IR']);
  eq('  every abbreviation two characters',
    Object.values(SIGNAL_ABBREVIATIONS).every(a => a.length === 2), true);
  eq('  and distinct, or the legend cannot explain them',
    new Set(Object.values(SIGNAL_ABBREVIATIONS)).size,
    Object.keys(SIGNAL_ABBREVIATIONS).length);
  eq('  the full names for the legend',
    [SIGNAL_FULL_LABELS.evaluatingAlternatives, SIGNAL_FULL_LABELS.recentChange,
      SIGNAL_FULL_LABELS.internalRelationship],
    ['Evaluating Alternatives', 'Recent Change', 'Internal Relationship']);
  // Abbreviating it in the legend would answer the question with the question.
  eq('  none of which is abbreviated',
    Object.values(SIGNAL_FULL_LABELS).some(v => v.includes('.')), false);
  // All three maps cover every signal, so a fourth cannot be half-added.
  eq('  and all three maps cover every signal',
    [SIGNAL_LABELS, SIGNAL_ABBREVIATIONS, SIGNAL_FULL_LABELS]
      .map(m => Object.keys(m).sort().join()),
    Array(3).fill(Object.keys(SIGNAL_LABELS).sort().join()));

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
