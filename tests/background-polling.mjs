/**
 * What the app asks the server for when nobody is using it.
 *
 *   node --experimental-strip-types --import ./tests/register-ts.mjs \
 *        tests/background-polling.mjs
 *
 * The host's bot protection kept challenging real people. The production logs
 * said why: over six hours the app made 1,093 requests to serve about
 * twenty-five page views, and 72% of that was polling. In a four-hour
 * overnight window there were 120 calls to one endpoint and three page views
 * — a perfect two-minute metronome from one address with nobody there, which
 * is the shape of traffic that protection exists to stop.
 *
 * Two causes, both checked here. One poller used a bare setInterval, so
 * nothing ever paused it: every open tab called that endpoint 720 times a day
 * through the night. And the unread-chat badge polled the same two endpoints,
 * on the same schedule, that the chat panel was already polling — every chat
 * request was being made twice.
 *
 * The gating itself is pollingManager's and is run: a poll registered with it
 * stops on blur and resumes on focus.
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

console.log('\n— nothing polls on a timer of its own —');
{
  /*
   * Every network poll goes through pollingManager, which is the only thing
   * that knows whether anyone is looking. A bare setInterval beside a fetch
   * is the defect this file exists to keep out.
   */
  const pollers = [
    'lib/usePendingInputRequestCount.ts',
    'lib/useUnreadChatCount.ts',
    'lib/useNeedsAttentionCount.ts',
    'lib/useUnreadNotificationCount.ts',
    'components/NotificationBell.tsx',
    'components/ChatPanelContext.tsx',
  ];
  for (const f of pollers) {
    const src = strip(f);
    // A file either polls through the manager or does not poll at all.
    const managed = src.includes('startPolling(');
    const raw = /setInterval\s*\(/.test(src);
    eq(`${f.split('/').pop()} uses no timer of its own`, raw, false);
    if (raw) continue;
    eq(`  ${managed ? 'and polls through the manager' : 'and does not poll'}`, true, true);
  }

  const pending = strip('lib/usePendingInputRequestCount.ts');
  eq('the sidebar badge is registered with the manager',
    /startPolling\('pending-input-count', load, 120_000, 300_000\)/.test(pending), true);
  // Unregistered on unmount, or a second tab's poll would outlive its page.
  eq('  and unregistered when it goes away',
    /stopPolling\('pending-input-count'\)/.test(pending), true);
}

console.log('\n— and the chat badge does not refetch what is already loaded —');
{
  const unread = strip('lib/useUnreadChatCount.ts');
  // It polled /api/chat/conversations and /api/chat/groups every fifteen
  // seconds — the same two the panel polls, whose totals it already exposes.
  eq('the badge fetches nothing', /fetch\(/.test(unread), false);
  eq('  it reads the panel’s own total', /return useChatPanel\(\)\.totalUnread;/.test(unread), true);

  const panel = strip('components/ChatPanelContext.tsx');
  eq('  which the panel computes', /totalUnread: dmUnread \+ groupUnread,/.test(panel), true);
  eq('  from the one poll it runs', /startPolling\('chat-dock', refresh, 15_000, 30_000\)/.test(panel), true);
}

console.log('\n— the manager stops when nobody is looking —');
{
  /*
   * Run, not read. This is the behaviour the overnight traffic turned on:
   * a poll that keeps its timer through a blur is a poll that runs all night.
   */
  const listeners = {};
  globalThis.window = {
    addEventListener: (ev, fn) => { (listeners[ev] ??= []).push(fn); },
    removeEventListener: () => {},
  };
  globalThis.document = {
    hasFocus: () => true,
    visibilityState: 'visible',
    addEventListener: (ev, fn) => { (listeners[ev] ??= []).push(fn); },
    removeEventListener: () => {},
  };

  const { startPolling, stopPolling } = await import('@/lib/pollingManager');
  const fire = (ev) => (listeners[ev] ?? []).forEach(fn => fn());
  const wait = (ms) => new Promise(r => setTimeout(r, ms));

  let ticks = 0;
  startPolling('probe', () => { ticks++; }, 40, 40);
  await wait(220);
  const focused = ticks;
  eq('it ticks while the window has focus', focused > 0, true);

  fire('blur');
  const atBlur = ticks;
  await wait(220);
  eq('  and stops the moment it loses it', ticks - atBlur, 0);

  fire('focus');
  await wait(180);
  eq('  then picks up again when it comes back', ticks > atBlur, true);

  stopPolling('probe');
  const atStop = ticks;
  await wait(150);
  eq('  and stopping it means stopping', ticks - atStop, 0);

  delete globalThis.window;
  delete globalThis.document;
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
