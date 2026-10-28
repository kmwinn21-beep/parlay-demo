/**
 * Which view the dashboard feed opens on.
 *
 *   node --experimental-strip-types --import ./tests/register-ts.mjs \
 *        tests/feed-opening-scope.mjs
 *
 * Active is the right view while a show is running and the wrong one for the
 * weeks between shows, when it is empty — and a feed whose default view is
 * blank reads as a feed with no data in it, whatever its empty state says. So
 * the opening view falls through: Active, then Upcoming, then All.
 *
 * Two things are asserted here that a screenshot could not be trusted to
 * catch. The fall-through is measured in ITEMS, not conferences — a show that
 * is running with nothing logged against it yet is just as blank — and it costs
 * ONE request in the common case, because walking three scopes on every
 * dashboard load would be a tax on the case that was already fine.
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

const { pickOpeningScope, SCOPE_FALLBACK } = await import('@/lib/feed/openingScope');
const { FEED_SCOPES } = await import('@/lib/feed/types');

/**
 * A stub feed. `counts` says how many items each scope has; the returned
 * fetcher records the order it was asked in, which is the other half of what
 * is being tested.
 */
function stub(counts) {
  const asked = [];
  const fetchScope = async (scope) => {
    asked.push(scope);
    return {
      items: Array.from({ length: counts[scope] ?? 0 }, (_, i) => ({ id: `${scope}-${i}` })),
      hasMore: false,
      activeCount: 0,
      upcomingCount: 0,
    };
  };
  return { fetchScope, asked };
}

console.log('\n— the order it falls through —');
{
  eq('Active, then Upcoming, then All', [...SCOPE_FALLBACK], ['active', 'upcoming', 'all']);
  // Every candidate has to be a real option on the toggle, or the feed opens
  // on a view the user cannot see is selected.
  const keys = FEED_SCOPES.map(s => s.key);
  eq('  and each is one the toggle offers', SCOPE_FALLBACK.filter(s => !keys.includes(s)), []);
}

console.log('\n— a show that is running —');
{
  const { fetchScope, asked } = stub({ active: 12, upcoming: 4, all: 40 });
  const { scope, payload } = await pickOpeningScope(fetchScope);
  eq('opens on Active', scope, 'active');
  eq('  and asks for nothing else', asked, ['active']);
  // The payload comes back with the scope so the caller renders what it just
  // fetched instead of asking the same question twice.
  eq('  returning what it fetched', payload.items.length, 12);
}

console.log('\n— nothing logged on Active —');
{
  const { fetchScope, asked } = stub({ active: 0, upcoming: 4, all: 40 });
  const { scope, payload } = await pickOpeningScope(fetchScope);
  eq('falls through to Upcoming', scope, 'upcoming');
  eq('  having tried Active first', asked, ['active', 'upcoming']);
  eq('  and shows Upcoming\'s items', payload.items.length, 4);
}

console.log('\n— nothing logged on either —');
{
  const { fetchScope, asked } = stub({ active: 0, upcoming: 0, all: 40 });
  const { scope } = await pickOpeningScope(fetchScope);
  eq('falls through to All', scope, 'all');
  eq('  having tried both in order', asked, ['active', 'upcoming', 'all']);
}

console.log('\n— nothing logged anywhere —');
{
  /*
   * All is the end of the line, so its emptiness is shown rather than fallen
   * through: there is nowhere further to go, and that is the one empty state
   * with no toggle to point at ("No activity in the last 90 days").
   */
  const { fetchScope, asked } = stub({ active: 0, upcoming: 0, all: 0 });
  const { scope, payload } = await pickOpeningScope(fetchScope);
  eq('settles on All anyway', scope, 'all');
  eq('  and stops there', asked, ['active', 'upcoming', 'all']);
  eq('  with its empty payload', payload.items.length, 0);
}

console.log('\n— a counted scope with items only further down —');
{
  // Upcoming empty while Active has something must NOT skip past Active: the
  // walk stops at the first scope with items, it does not look for the fullest.
  const { fetchScope } = stub({ active: 1, upcoming: 0, all: 99 });
  eq('one item is enough to stay put', (await pickOpeningScope(fetchScope)).scope, 'active');
}

console.log('\n— a fetch that fails —');
{
  const err = new Error('network');
  let threw = null;
  try { await pickOpeningScope(async () => { throw err; }); } catch (e) { threw = e; }
  // The caller's load path owns this failure: the feed keeps whatever is on
  // screen and leaves the scope where it started, rather than this swallowing
  // the error and walking on as though the scope were empty.
  eq('it reaches the caller rather than reading as empty', threw, err);
}

console.log('\n— how the component uses it —');
{
  const feed = readFileSync('components/DashboardFeed.tsx', 'utf8');
  eq('the feed picks its opening scope through this', /pickOpeningScope\(async candidate =>/.test(feed), true);
  eq('  starting from Active, as before', /useState<FeedScope>\('active'\)/.test(feed), true);
  /*
   * Once. A scope the user picked is their choice and stays put even when it
   * is empty — that is what the empty states and their "Switch to All"
   * prompts are for, and re-running the walk would undo the click.
   */
  eq('  once, on mount', /if \(!resolvedRef\.current\) \{\s*resolvedRef\.current = true;\s*void chooseScope\(\);/.test(feed), true);
  /*
   * And the scope it settles on must not then be fetched a second time by the
   * effect that watches `scope` — the walk already has that response.
   */
  eq('  without re-fetching what the walk already loaded',
    /if \(loadedScopeRef\.current === scope\) return;/.test(feed), true);
  eq('  while a later switch still loads', /if \(loadedScopeRef\.current === scope\) return;\s*void load\(\);/.test(feed), true);
  /*
   * Strict Mode's second effect pass arrives with the walk still in flight.
   * Without this guard it fetches Active alongside it and whichever response
   * lands last wins — the toggle on Upcoming showing Active's empty answer.
   */
  eq('  and nothing races the walk', /if \(resolvingRef\.current\) return;/.test(feed), true);
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
