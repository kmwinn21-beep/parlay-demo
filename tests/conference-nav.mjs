/**
 * The conference list behind the header's Go To menu.
 *
 *   node --experimental-strip-types --import ./tests/register-ts.mjs \
 *        tests/conference-nav.mjs
 *
 * The loader read `r.ok ? r.json() : []` and cached the result, so a bot
 * challenge — an HTML page, sometimes under a 200 — was stored as "this
 * account has no conferences" and never retried. The menu went empty for the
 * rest of the session and said "No conferences found.", which is exactly what
 * an account with none says, so nothing about it looked broken.
 *
 * Every case below is RUN against the real loader with fetch stubbed, because
 * the thing that was wrong was its behaviour over time — what it keeps, for
 * how long, and what it does next — and none of that can be read off the
 * source.
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

const {
  loadConferenceNav, invalidateConferenceNav, __setConferenceNavClock, CONFS_RETRY_AFTER_MS,
} = await import('@/lib/conferenceNav');

const CONFS = [{ id: 1, name: 'NIC Fall', start_date: '2026-09-01', end_date: '2026-09-03' }];

/** Responses the loader has to tell apart, and a count of what it asked for. */
let calls = 0;
let reply = () => ({ ok: true, json: async () => CONFS });
globalThis.fetch = async (url) => {
  if (!String(url).includes('/api/conferences?nav=1')) throw new Error(`unexpected fetch: ${url}`);
  calls++;
  return reply();
};

let clock = 1_000_000;
__setConferenceNavClock(() => clock);

const reset = () => { invalidateConferenceNav(); calls = 0; };

// What a challenge actually looks like on the wire.
const CHALLENGE_403 = () => ({ ok: false, status: 403, json: async () => { throw new Error('html'); } });
const CHALLENGE_200 = () => ({ ok: true, status: 200, json: async () => { throw new Error('not json'); } });
const HTML_THAT_PARSES = () => ({ ok: true, status: 200, json: async () => ({ error: 'challenge' }) });

console.log('\n— a list is a list —');
{
  reset();
  reply = () => ({ ok: true, json: async () => CONFS });
  eq('the conferences come back', (await loadConferenceNav()).conferences.length, 1);
  eq('  and are not a failure', (await loadConferenceNav()).failed, false);
  eq('  the second read is from cache', calls, 1);
}

console.log('\n— an empty account is not a failure —');
{
  reset();
  reply = () => ({ ok: true, json: async () => [] });
  const r = await loadConferenceNav();
  eq('nothing in it', r.conferences, []);
  // The distinction the dropdown needs: this says "No conferences found.",
  // the one below says "Couldn't load conferences."
  eq('  but it loaded', r.failed, false);
  eq('  and is cached like any other answer', (await loadConferenceNav()) && calls, 1);
}

console.log('\n— a challenge is a failure, whatever it arrives as —');
{
  for (const [label, response] of [
    ['a 403 with an HTML body', CHALLENGE_403],
    ['a 200 with an HTML body', CHALLENGE_200],
    ['a 200 whose JSON is not a list', HTML_THAT_PARSES],
  ]) {
    reset();
    reply = response;
    const r = await loadConferenceNav();
    eq(label, r.failed, true);
    eq('  and nothing is listed', r.conferences, []);

    /*
     * The heart of it: the failure is NOT cached.
     *
     * Asking again after the pause has to go back to the network. Under the
     * old loader this returned a cached [] forever.
     */
    reply = () => ({ ok: true, json: async () => CONFS });
    clock += CONFS_RETRY_AFTER_MS;
    const again = await loadConferenceNav();
    eq('  the next read tries again', again.conferences.length, 1);
    eq('  and recovers', again.failed, false);
  }
}

console.log('\n— but it does not retry on every navigation —');
{
  reset();
  reply = CHALLENGE_403;
  await loadConferenceNav();
  eq('one request for the first failure', calls, 1);

  // Route changes inside the pause are answered from the failure, not the
  // network: retrying hardest while something is already rate-limiting us is
  // how a stumble becomes a stampede.
  clock += 1_000;
  eq('  a route change just after is not a second request', (await loadConferenceNav()).failed, true);
  eq('  so the count is unchanged', calls, 1);

  clock += CONFS_RETRY_AFTER_MS;
  await loadConferenceNav();
  eq('  but one after the pause is', calls, 2);
}

console.log('\n— and the reader is never made to wait —');
{
  reset();
  reply = CHALLENGE_403;
  await loadConferenceNav();
  eq('a failure is on the books', calls, 1);

  // Opening the menu and pressing Try again both go through this, and must
  // not be answered out of the pause.
  invalidateConferenceNav();
  reply = () => ({ ok: true, json: async () => CONFS });
  const r = await loadConferenceNav();
  eq('  an explicit retry goes straight out', calls, 2);
  eq('  and gets the list', r.conferences.length, 1);
}

console.log('\n— and the menu says which empty it is —');
{
  const header = strip('components/Header.tsx');
  eq('a failed load reads as one', /Couldn&rsquo;t load conferences\./.test(header), true);
  eq('  with a way to try again', /onClick=\{refreshConferences\}[\s\S]{0,160}Try again/.test(header), true);
  eq('  while an empty account still reads as empty',
    /conferences\.length === 0 \? \([\s\S]{0,160}No conferences found\./.test(header), true);
  // The failure branch has to come first, or an empty list from a failed load
  // falls through to "No conferences found." again.
  eq('  and the failure is tested first',
    header.indexOf('confsFailed ?') < header.indexOf('conferences.length === 0 ?'), true);
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
