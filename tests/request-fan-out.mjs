/**
 * How much the app asks for when you open a conference.
 *
 *   node --experimental-strip-types --import ./tests/register-ts.mjs \
 *        tests/request-fan-out.mjs
 *
 * A production log for a SINGLE conference page view: 86 lines, which
 * deduplicate to 78 real requests (the edge middleware and the function each
 * log one), in 27 seconds, 40 of them inside one second. Vercel's bot check
 * was firing on it.
 *
 * Three causes, in order of size:
 *
 *   29 of the 78 were pages nobody opened. Next prefetches a Link's whole
 *   destination once it is on screen, and nothing in the app turned that off:
 *   /conferences/4, /10, /15, /16 and /18 were all fetched while opening /17.
 *
 *   14 were a resource already being fetched: /api/config x5,
 *   /api/conferences x4, /api/notifications x3, /api/admin/section-config x3.
 *
 *   The rest is the page's own data, which is legitimate.
 *
 * The dedup rules are RUN in a browser, because what is worth proving is that
 * several callers produce one request — which cannot be read off the source.
 * Measured after: four section-config consumers on four different pages make
 * one request; three concurrent asks for one config category make one; the
 * notification bell and the nav badge together make one, where they used to
 * make two a minute each, forever.
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

const strip = (f) => readFileSync(f, 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

console.log('\n— pages nobody opened are not fetched —');
{
  /*
   * The conference list is the worst case: every card points at the most
   * expensive route in the app, and a phone shows a column of them.
   */
  const list = strip('app/conferences/page.tsx');
  eq('a conference card does not prefetch',
    /href=\{`\/conferences\/\$\{conf\.id\}`\}\s*\n\s*prefetch=\{false\}/.test(list), true);

  /*
   * And the phone's nav menu, which is unmounted when it closes — so unlike
   * the sidebar it pays for its prefetches again on every open. In the log
   * each of its eleven destinations appears exactly twice, which is the menu
   * having been opened twice.
   */
  const nav = strip('components/FloatingNav.tsx');
  eq('nor does the phone nav menu', (nav.match(/prefetch=\{false\}/g) ?? []).length, 2);
  eq('  for either of its two link kinds',
    /<Link\s*\n\s*href=\{item\.href\}\s*\n\s*prefetch=\{false\}/.test(nav), true);
}

console.log('\n— and a thing is asked for once —');
{
  /*
   * section-config answers for EVERY page in one payload, and the cache was
   * keyed by the page a caller wanted — so four components fetched the same
   * URL and each kept a quarter of it.
   */
  const sc = strip('lib/useSectionConfig.ts');
  eq('section config is cached whole, not per page',
    /let _all: SectionConfigByPage \| null = null;/.test(sc), true);
  eq('  with one in-flight request for all of them',
    /if \(_pending\) return _pending;/.test(sc), true);
  eq('  and nothing keyed by page any more', /_cache\[page\]/.test(sc), false);
  // A failed request must not become the answer for the life of the page.
  eq('  a failure is not cached', /_pending = null;\s*\n\s*return \{\};/.test(sc), true);

  /*
   * One category of config, shared. Two components both wanting 'status' made
   * two identical requests in the same instant.
   */
  const cc = strip('lib/configCache.ts');
  eq('a config category goes through the shared cache',
    /export function getConfigCategory\(/.test(cc), true);
  eq('  keyed by the URL it would have fetched', /return getCached\(url, \(\) =>/.test(cc), true);
  // The version is what lets an admin's edit escape the browser's own cache.
  eq('  carrying the config version', /&v=\$\{configVersion\(\)\}/.test(cc), true);

  for (const f of ['components/MeetingsTable.tsx', 'components/CompanyTable.tsx',
    'components/ConferenceFormsTab.tsx', 'components/AssignFollowUpFields.tsx',
    'components/ConferenceDetailsTargetsTab.tsx']) {
    const src = strip(f);
    eq(`  ${f.split('/').pop()} uses it`, /getConfigCategory\(/.test(src), true);
    eq(`    and fetches no category itself`, /api\/config\?category=/.test(src), false);
  }

  /*
   * The unread count had two owners, each polling every 30 seconds for the
   * identical URL — two requests a minute for one number, for as long as the
   * app was open. That steady drip is exactly what a bot check watches.
   */
  const un = strip('lib/unreadNotifications.ts');
  eq('one poller owns the unread count', (un.match(/startPolling\(/g) ?? []).length, 1);
  eq('  started by the first subscriber', /if \(!started\) \{/.test(un), true);
  eq('  and stopped by the last to leave', /if \(subscribers\.size === 0\) \{/.test(un), true);

  const bell = strip('components/NotificationBell.tsx');
  const hook = strip('lib/useUnreadNotificationCount.ts');
  eq('the bell subscribes rather than polling',
    /subscribeUnreadNotifications\(setUnreadCount\)/.test(bell), true);
  eq('  and so does the nav badge',
    /subscribeUnreadNotifications\(setCount\)/.test(hook), true);
  eq('  neither polls on its own',
    /startPolling/.test(bell) || /startPolling/.test(hook), false);
  /* Neither fetches the COUNT. The bell still fetches the dropdown's LIST
     when it opens (limit=20), which is a different request and a real one. */
  eq('  neither fetches the count itself',
    /limit=200/.test(bell) || /limit=200/.test(hook), false);
  /* And the list does not set the count. It is capped at 20, so opening the
     panel with fifty unread showed 20 — and now that the number is shared,
     that would have dropped the nav's badge too. */
  eq('  nor does the dropdown overwrite it',
    /setUnreadCount\(Array\.isArray\(data\)/.test(bell), false);
  // Marking read, and opening the panel, both have to move the other
  // subscriber or the badge sits stale for up to a poll.
  eq('  and anything that changes it tells both',
    (bell.match(/refreshUnreadNotifications\(\)/g) ?? []).length, 3);

  /*
   * The conference menu already cached /api/conferences?nav=1, and this asked
   * for the same URL again a moment later.
   */
  const setConf = strip('components/SetConferenceButton.tsx');
  eq('the auto-set reads the shared conference cache',
    /await loadConferenceNav\(\)/.test(setConf), true);
  eq('  rather than the URL it already holds',
    /fetch\('\/api\/conferences\?nav=1'\)/.test(setConf), false);
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
