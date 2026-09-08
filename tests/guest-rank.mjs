/**
 * Guest-list ranking: the order, the scale, and what the API will accept.
 *
 *   node --experimental-strip-types --import ./tests/register-ts.mjs \
 *        tests/guest-rank.mjs
 *
 * The sort is the part worth pinning. It runs in two places that must agree —
 * the guest list drawer and the selected block of the Build Guest List modal —
 * and a list that orders itself differently depending on which panel you are
 * looking at is worse than one that does not sort at all.
 *
 * Exits non-zero on the first failing expectation, so it can gate a build.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir = mkdtempSync(join(tmpdir(), 'parlay-guest-rank-'));
process.env.TURSO_DATABASE_URL = `file:${join(dir, 'master.db')}`;
process.env.TURSO_AUTH_TOKEN = '';
process.env.JWT_SECRET = 'test-secret-at-least-thirty-two-characters-long';
delete process.env.CLERK_SECRET_KEY;

let pass = 0;
let fail = 0;
const eq = (label, got, want) => {
  const g = JSON.stringify(got);
  const w = JSON.stringify(want);
  if (g === w) { pass++; console.log(`  ok   ${label}`); }
  else { fail++; console.log(`  FAIL ${label}\n       got  ${g}\n       want ${w}`); }
};
process.on('exit', () => { try { rmSync(dir, { recursive: true, force: true }); } catch {} });

const {
  RANK_MIN, RANK_MAX, RANK_VALUES, EMPTY_RANK,
  normalizeRank, isInvalidRank, rankBadgeClass, sortByRank,
} = await import('@/lib/guestRank');

// ── The scale ────────────────────────────────────────────────────────────────

console.log('\n— the scale —');
{
  eq('runs 1 to 25', [RANK_MIN, RANK_MAX], [1, 25]);
  eq('the picker offers every value, best first', [RANK_VALUES.length, RANK_VALUES[0], RANK_VALUES.at(-1)], [25, 1, 25]);
  eq('unranked is both fields null', EMPTY_RANK, { repRank: null, teamRank: null });
}

console.log('\n— what counts as a rank —');
{
  eq('a number in range', normalizeRank(7), 7);
  eq('the ends of the range', [normalizeRank(1), normalizeRank(25)], [1, 25]);
  eq('a numeric string, since a <select> yields one', normalizeRank('12'), 12);
  // Clearing is a first-class outcome, not a failure to parse: `+ Rank` has to
  // be reachable again after a rank is set.
  eq('null clears', normalizeRank(null), null);
  eq('  as does an empty string', normalizeRank(''), null);
  eq('  and undefined', normalizeRank(undefined), null);

  eq('0 is not a rank', normalizeRank(0), null);
  eq('26 is not a rank', normalizeRank(26), null);
  eq('a fraction is not a rank', normalizeRank(3.5), null);
  eq('nor is a word', normalizeRank('high'), null);
}

console.log('\n— what the API refuses outright —');
{
  // Out of range is rejected rather than clamped. A 26 is a caller bug, and
  // silently storing 25 would hide it; a null is a deliberate clear.
  eq('null and undefined are not errors', [isInvalidRank(null), isInvalidRank(undefined)], [false, false]);
  eq('in-range values are not errors', [isInvalidRank(1), isInvalidRank(25)], [false, false]);
  eq('0 is an error', isInvalidRank(0), true);
  eq('26 is an error', isInvalidRank(26), true);
  eq('a fraction is an error', isInvalidRank(2.5), true);
  eq('a word is an error', isInvalidRank('best'), true);
}

console.log('\n— the badge colours —');
{
  // Five bands of five. Twenty-five distinguishable colours would not be
  // distinguishable, so the band carries the meaning and the number the detail.
  const bands = [1, 6, 11, 16, 21].map(n => rankBadgeClass(n));
  eq('each band is distinct', new Set(bands).size, 5);
  eq('a band is stable across its five values',
    [1, 2, 3, 4, 5].map(rankBadgeClass), Array(5).fill(rankBadgeClass(1)));
  eq('the bands change at the boundary', rankBadgeClass(5) === rankBadgeClass(6), false);
  eq('the best band is green', rankBadgeClass(1).includes('green'), true);
  eq('the worst band is red', rankBadgeClass(25).includes('red'), true);
  eq('unranked is grey, not a colour on the scale', rankBadgeClass(null).includes('gray'), true);
}

// ── The order ────────────────────────────────────────────────────────────────

const ranks = new Map();
const guest = (id, last, first, teamRank, repRank) => {
  ranks.set(id, { repRank, teamRank });
  return { id, last_name: last, first_name: first };
};
const rankOf = a => ranks.get(a.id) ?? EMPTY_RANK;
const order = list => sortByRank(list, rankOf).map(a => a.id);

console.log('\n— team rank first —');
{
  const list = [guest('c', 'Adams', 'A', 3, 1), guest('a', 'Zeno', 'Z', 1, 25), guest('b', 'Mills', 'M', 2, 12)];
  // Team rank wins outright: the guest with the worst rep rank sorts first
  // because their team rank is 1.
  eq('ascending, ignoring rep rank and name', order(list), ['a', 'b', 'c']);
}

console.log('\n— then rep rank —');
{
  ranks.clear();
  const list = [guest('c', 'Adams', 'A', 2, 9), guest('a', 'Zeno', 'Z', 2, 1), guest('b', 'Mills', 'M', 2, 4)];
  eq('breaks a tie on team rank, ascending', order(list), ['a', 'b', 'c']);
}

console.log('\n— then last name, A to Z —');
{
  ranks.clear();
  const list = [guest('c', 'Parrish', 'C', 2, 4), guest('a', 'Corbin', 'T', 2, 4), guest('b', 'Hobbs', 'S', 2, 4)];
  eq('breaks a tie on both ranks', order(list), ['a', 'b', 'c']);
}
{
  ranks.clear();
  // Two people with the same surname need a stable order, or the list reshuffles
  // itself between renders depending on what the database returned.
  const list = [guest('b', 'Smith', 'Zoe', 1, 1), guest('a', 'Smith', 'Alan', 1, 1)];
  eq('first name breaks a tie on last name', order(list), ['a', 'b']);
}
{
  ranks.clear();
  const list = [guest('b', 'de Vries', 'B', 1, 1), guest('a', 'Adams', 'A', 1, 1)];
  eq('and the comparison ignores case', order(list), ['a', 'b']);
}

console.log('\n— the unranked —');
{
  ranks.clear();
  const list = [
    guest('unranked', 'Aaronson', 'A', null, null),
    guest('worst', 'Zeno', 'Z', 25, 25),
  ];
  // After everyone with a number, not before. An empty rank is "not yet
  // considered", and burying the ranked guests under blanks defeats the point.
  eq('sort last, even behind rank 25 and an earlier name', order(list), ['worst', 'unranked']);
}
{
  ranks.clear();
  const list = [
    guest('b', 'Mills', 'M', null, null),
    guest('a', 'Adams', 'A', null, null),
  ];
  eq('and are ordered among themselves by name', order(list), ['a', 'b']);
}
{
  ranks.clear();
  // A half-ranked guest: team rank set, rep rank not. The missing half sorts
  // last within its own tie, rather than the row dropping to the bottom.
  const list = [
    guest('noRep', 'Adams', 'A', 2, null),
    guest('bothSet', 'Zeno', 'Z', 2, 9),
  ];
  eq('a missing rep rank sorts behind a set one at the same team rank',
    order(list), ['bothSet', 'noRep']);
}
{
  ranks.clear();
  const list = [
    guest('noTeam', 'Adams', 'A', null, 1),
    guest('hasTeam', 'Zeno', 'Z', 20, 25),
  ];
  eq('a missing TEAM rank sorts last whatever the rep rank says',
    order(list), ['hasTeam', 'noTeam']);
}

console.log('\n— duplicates —');
{
  ranks.clear();
  // No uniqueness constraint: two guests may both be Team Rank 1. The name
  // tiebreaker is what keeps that from being an unstable order.
  const list = [guest('b', 'Zeno', 'Z', 1, 1), guest('a', 'Adams', 'A', 1, 1)];
  eq('two guests may share a rank, and still order stably', order(list), ['a', 'b']);
}

console.log('\n— the sort does not mutate its input —');
{
  ranks.clear();
  const list = [guest('b', 'Zeno', 'Z', 5, 5), guest('a', 'Adams', 'A', 1, 1)];
  const before = list.map(a => a.id);
  sortByRank(list, rankOf);
  eq('the original array is untouched', list.map(a => a.id), before);
}

// ── The whole rule, on the fixture from the screenshot ───────────────────────

console.log('\n— the five guests from the Teton dinner —');
{
  ranks.clear();
  const list = [
    guest('corbin', 'Corbin', 'Terese', 2, 3),
    guest('easton', 'Easton-Garrett', 'Sheri', 1, 8),
    guest('hobbs', 'Hobbs', 'Sarah', 2, 1),
    guest('parrish', 'Parrish', 'Crystal', null, 2),
    guest('davis', 'Davis', 'Spencer', 2, 3),
  ];
  eq('order the drawer and the modal must both produce',
    order(list),
    // Easton-Garrett is team 1. Then the three at team 2: Hobbs (rep 1), then
    // Corbin and Davis tie at rep 3 and fall to last name — Corbin before
    // Davis. Parrish has no team rank, so she is last despite a rep rank of 2.
    ['easton', 'hobbs', 'corbin', 'davis', 'parrish']);
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
