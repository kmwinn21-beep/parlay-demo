/**
 * The feed's UI contract: what it says, when it polls, and what was deleted.
 *
 *   node --experimental-strip-types --import ./tests/register-ts.mjs \
 *        tests/feed-ui.mjs
 *
 * These read the sources rather than mounting React, for the same reason
 * tests/slack-ui.mjs does: the assertions worth pinning here are ones a
 * screenshot cannot make — that polling is GUARDED, that a verbatim string was
 * not paraphrased, that two components were deleted rather than orphaned.
 *
 * The rendering itself was checked in a browser against the production build;
 * that is not something a source assertion can stand in for, and this does not
 * pretend to.
 *
 * Exits non-zero on the first failing expectation, so it can gate a build.
 */
import { readFileSync, existsSync } from 'node:fs';

let pass = 0;
let fail = 0;
const eq = (label, got, want) => {
  const g = JSON.stringify(got);
  const w = JSON.stringify(want);
  if (g === w) { pass++; console.log(`  ok   ${label}`); }
  else { fail++; console.log(`  FAIL ${label}\n       got  ${g}\n       want ${w}`); }
};

const feed = readFileSync('components/DashboardFeed.tsx', 'utf8');
const page = readFileSync('app/page.tsx', 'utf8');
const { COLOUR_BY_KIND, FEED_KINDS } = await import('@/lib/feed/types');

// ── Polling ──────────────────────────────────────────────────────────────────

console.log('\n— polling —');
{
  // An account between shows must poll NOTHING. There is no source of new items
  // to discover, and a dashboard left open overnight should cost zero requests.
  const effect = feed.slice(feed.indexOf('const shouldPoll'), feed.indexOf('const items = useMemo'));
  eq('polling is derived from the in-progress count',
    /const shouldPoll = \(data\?\.inProgressCount \?\? 0\) > 0/.test(effect), true);
  eq('  and startPolling is behind that guard', /if \(!shouldPoll\)[\s\S]*?return[\s\S]*?startPolling\(/.test(effect), true);
  eq('  which stops any existing timer on the way out', effect.includes("stopPolling('dashboard-feed')"), true);
  eq('  and unmounting stops it too', /return \(\) => stopPolling\('dashboard-feed'\)/.test(effect), true);

  // pollingManager already handles focus and visibilitychange centrally. Using
  // it rather than a raw setInterval is what makes the background behaviour
  // match the rest of the app instead of being reinvented here.
  eq('it uses the shared polling manager, not a raw interval',
    [feed.includes("from '@/lib/pollingManager'"), feed.includes('setInterval(')], [true, false]);
  eq('45s in front, 120s behind',
    [/POLL_FG_MS = 45_000/.test(feed), /POLL_BG_MS = 120_000/.test(feed)], [true, true]);
}

// ── The empty states ─────────────────────────────────────────────────────────

console.log('\n— the empty states —');
{
  // Verbatim. Between shows this is the DEFAULT view for weeks, and it must not
  // read as broken — the wording was specified, not suggested.
  eq('the no-conferences message is exactly as specified',
    feed.includes('No conferences in progress. Switch to All to see recent activity.'), true);
  eq('  and offers the control it names', feed.includes('Switch to All'), true);

  // Three different nothings. Collapsing them into one would tell somebody
  // between shows that their data is missing.
  const empty = feed.slice(feed.indexOf('function FeedEmptyState'));
  eq('a filter with no matches names the filter', /No \{label\.toLowerCase\(\)\} in this view/.test(empty), true);
  eq('all-with-nothing says so without a toggle prompt',
    empty.includes('No activity in the last 90 days.'), true);
  eq('  and does NOT prompt for the toggle it is already on',
    empty.slice(empty.indexOf('No activity in the last 90 days.')).includes('Switch to All'), false);
}

// ── The stream navigates normally ────────────────────────────────────────────

console.log('\n— the stream scrolls —');
{
  // The chevron paging idea was reverted: a list that ignores the wheel reads
  // as frozen, and variable-height cards make a page size erratic.
  eq('ordinary vertical scroll', feed.includes('overflow-y-auto'), true);
  eq('  no hidden scrollbar', /scrollbar-width|scrollbar-hide|overflow-hidden/.test(
    feed.slice(feed.indexOf('The stream.'), feed.indexOf('</div>', feed.indexOf('The stream.')))), false);
  eq('  and no chevron pager', /chevron|pageUp|pageDown/i.test(feed), false);
  eq('show earlier activity ends the loaded set', feed.includes('Show earlier activity'), true);
  eq('day headers stick to the top of the scroll region', /sticky top-0[\s\S]{0,200}dayLabel/.test(feed), true);
}

// ── Colours and card shape ───────────────────────────────────────────────────

console.log('\n— five colours, and pinned is not one of them —');
{
  const dots = feed.slice(feed.indexOf('const DOT_CLASS'), feed.indexOf('const CHIPS'));
  const colours = new Set(Object.values(COLOUR_BY_KIND));
  eq('every colour has a dot class', [...colours].filter(c => !dots.includes(`${c}:`)), []);
  eq('  and there are five of them', colours.size, 5);
  eq('  covering all nine kinds', FEED_KINDS.filter(k => !COLOUR_BY_KIND[k]), []);

  // Pinned is an attribute of a note, drawn as a rule, not a sixth colour.
  eq('pinned draws a left rule', feed.includes('border-l-4 border-l-amber-400'), true);
  eq('  and is not in the colour map', dots.includes('pinned'), false);
}

console.log('\n— the card —');
{
  // The conference pill identifies the card; the bottom pills describe the
  // event. Putting the conference in the bottom row mixes the two.
  // Anchored past the doc comment above actionPrefix, which also says "Row 2":
  // an earlier match made this slice run backwards and silently return "".
  const row1Start = feed.indexOf('{/* Row 1 —');
  const row1 = feed.slice(row1Start, feed.indexOf('{/* Row 2 —', row1Start));
  eq('the slice under test is not empty', row1.length > 100, true);
  eq('the conference pill sits inline with the actor', row1.includes('item.conference.name'), true);
  eq('  with a hash-derived colour dot', row1.includes('conferenceColour(item.conference.name)'), true);
  eq('  and the timestamp', row1.includes('relativeTime('), true);

  eq('a note renders its text instead of rows 3-4',
    /showsBody \?[\s\S]{0,400}line-clamp-2/.test(feed), true);
  eq('a system actor gets a neutral avatar', feed.includes("item.actor.system ? '#9CA3AF'"), true);
  eq('cards link to the record', /item\.href \?[\s\S]{0,80}<Link href=\{item\.href\}/.test(feed), true);
}

// ── The layout ───────────────────────────────────────────────────────────────

console.log('\n— the dashboard grid —');
{
  // A CSS row-span cannot cross two sibling grids. The two rows were merged
  // into one so the Feed could span them.
  eq('one grid, with explicit rows', /lg:grid-cols-3 lg:grid-rows-\[auto_auto\]/.test(page), true);
  eq('the feed spans both rows in the third column',
    /lg:row-span-2 lg:row-start-1 lg:col-start-3/.test(page), true);
  eq('floor notes keeps its span', /lg:col-span-2 lg:row-start-1/.test(page), true);
  eq('  and now has an explicit height, since Touchpoints no longer sets one',
    /lg:row-start-1 h-\[489px\]/.test(page), true);
  eq('targets keeps its own Suspense boundary as a grid child',
    /<Suspense fallback=\{<div className="lg:col-span-2 lg:row-start-2">/.test(page), true);

  // The feed is taken out of flow on desktop for the same reason Floor Notes
  // is: a card that sizes to its content drives the row height, and forty items
  // would stretch the grid instead of scrolling.
  eq('the feed is absolutely positioned inside its cell', /lg:absolute lg:inset-0/.test(page), true);
}

console.log('\n— what was deleted —');
{
  eq('the Touchpoints card is gone', existsSync('components/DashboardTouchpointsSection.tsx'), false);
  eq('the Notifications card is gone', existsSync('components/DashboardNotificationsSection.tsx'), false);
  eq('  and nothing still imports them',
    /DashboardTouchpointsSection|DashboardNotificationsSection/.test(page), false);

  // The notification system itself is untouched — only the dashboard card went.
  eq('the bell survives', existsSync('components/NotificationBell.tsx'), true);
  eq('the notifications page survives', existsSync('app/notifications/page.tsx'), true);
  // The quick-log modal was never in the deleted card; it lives in
  // DashboardActionCard and is reachable from the header on every page.
  const header = readFileSync('components/Header.tsx', 'utf8');
  eq('the touchpoint quick-log is still in the header', header.includes('TouchpointQuickModal'), true);
  eq('  and in the row kebab',
    readFileSync('components/RowActionsKebab.tsx', 'utf8').includes('TouchpointQuickModal'), true);
}

console.log('\n— the feed is team-wide —');
{
  const route = readFileSync('app/api/feed/route.ts', 'utf8');
  // It ignores notification preferences by design: a shared view of what the
  // team is doing, not a per-person delivery.
  eq('the route consults no preferences', /notification_preferences|prefKey/.test(route), false);
  eq('  and scopes by the session account, not a parameter',
    route.includes('getDb(user.accountId)'), true);
  eq('  with no user filter in the query',
    /user_id|author_user_id\s*=/.test(readFileSync('lib/feed/query.ts', 'utf8').split('resolveActors')[0]), false);
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
