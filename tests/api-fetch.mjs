/**
 * Telling a bot challenge apart from an answer.
 *
 *   node --experimental-strip-types --import ./tests/register-ts.mjs \
 *        tests/api-fetch.mjs
 *
 * Call sites across the app read `r.ok ? r.json() : []`. That looks defensive
 * and does the opposite: it turns every failure into a plausible success, so
 * "the request was refused" and "there is nothing here" arrive as the same
 * value and the screen says the same thing about both.
 *
 * The host's bot protection makes it concrete — it answers with an HTML
 * interstitial, sometimes under a 200. This is the reader that notices, and
 * every case below is run against it.
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

const { classifyResponse, fetchJson, fetchList, onChallenge } = await import('@/lib/apiFetch');

const JSON_CT = 'application/json; charset=utf-8';
const HTML_CT = 'text/html; charset=utf-8';

console.log('\n— what came back —');
{
  eq('our API answering',
    classifyResponse({ ok: true, status: 200, contentType: JSON_CT }), 'ok');
  eq('our API saying no',
    classifyResponse({ ok: false, status: 404, contentType: JSON_CT }), 'error');
  eq('  and failing',
    classifyResponse({ ok: false, status: 500, contentType: JSON_CT }), 'error');

  /*
   * HTML is the tell. Our routes answer JSON on every path, errors included —
   * they are NextResponse.json, which sets application/json even for a 500 —
   * so an HTML body means something in front of the app answered instead.
   */
  eq('an interstitial under a 403',
    classifyResponse({ ok: false, status: 403, contentType: HTML_CT }), 'challenged');
  // The one that made this hard to see: ok is true, so every `r.ok ?` check
  // in the app walks straight past it and then gets nothing from r.json().
  eq('  and the same page under a 200',
    classifyResponse({ ok: true, status: 200, contentType: HTML_CT }), 'challenged');
  eq('  a bare 403 with no content type',
    classifyResponse({ ok: false, status: 403, contentType: null }), 'challenged');
  eq('  and a bare 429', classifyResponse({ ok: false, status: 429, contentType: null }), 'challenged');

  // Not every failure is a challenge. Calling a 404 one would tell the reader
  // to reload a page that will never load.
  eq('a 404 with no content type is ours',
    classifyResponse({ ok: false, status: 404, contentType: null }), 'error');
  eq('  and so is a 500',
    classifyResponse({ ok: false, status: 500, contentType: null }), 'error');
}

/** Responses shaped like real ones, headers included. */
const res = (body, { status = 200, contentType = JSON_CT, parses = true } = {}) => ({
  ok: status >= 200 && status < 300,
  status,
  headers: new Headers(contentType ? { 'content-type': contentType } : {}),
  json: async () => { if (!parses) throw new Error('not json'); return body; },
});

let noticed = 0;
onChallenge(() => { noticed++; });
const withFetch = async (impl, fn) => {
  const before = globalThis.fetch;
  globalThis.fetch = impl;
  try { return await fn(); } finally { globalThis.fetch = before; }
};

console.log('\n— reading it —');
{
  const ok = await withFetch(async () => res([{ id: 1 }]), () => fetchJson('/api/x'));
  eq('a clean read hands back the data', ok.data, [{ id: 1 }]);
  eq('  and is not a failure', ok.failed, false);

  const empty = await withFetch(async () => res([]), () => fetchList('/api/x'));
  // The distinction the whole thing exists for: an empty list is an answer.
  eq('an empty list is not a failure', empty, { items: [], failed: false });

  noticed = 0;
  const challenged = await withFetch(async () => res(null, { contentType: HTML_CT, parses: false }), () => fetchList('/api/x'));
  eq('a challenge is', challenged, { items: [], failed: true });
  eq('  and is announced', noticed, 1);

  noticed = 0;
  const notJson = await withFetch(async () => res(null, { parses: false }), () => fetchJson('/api/x'));
  // Said JSON and was not: an interstitial served with the wrong content
  // type. The reader's next step is the same, so it is reported the same.
  eq('a body that says JSON and is not', notJson.kind, 'challenged');
  eq('  is announced too', noticed, 1);

  noticed = 0;
  const serverError = await withFetch(async () => res({ error: 'boom' }, { status: 500 }), () => fetchJson('/api/x'));
  eq('our own 500 is a failure', serverError.failed, true);
  // Nothing to reload past, so the banner must stay away.
  eq('  but not a challenge', serverError.kind, 'error');
  eq('  and says nothing', noticed, 0);

  noticed = 0;
  const offline = await withFetch(async () => { throw new TypeError('Failed to fetch'); }, () => fetchJson('/api/x'));
  eq('a dropped connection is a failure', offline.failed, true);
  eq('  and not a challenge', offline.kind, 'error');
  eq('  and says nothing either', noticed, 0);

  // A caller asking for a list and getting an object has not got a list.
  const wrongShape = await withFetch(async () => res({ error: 'nope' }), () => fetchList('/api/x'));
  eq('an object where a list was asked for', wrongShape, { items: [], failed: true });
}

console.log('\n— and the app says so —');
{
  const notice = strip('components/ChallengeNotice.tsx');
  eq('the banner listens for it', /onChallenge\(\(\) => setShowing\(true\)\)/.test(notice), true);
  eq('  and offers the one thing that clears it', /window\.location\.reload\(\)/.test(notice), true);
  // Dismissed rather than timed out: it describes a condition, and it has no
  // way of learning the condition has passed.
  eq('  and can be dismissed', /setShowing\(false\)/.test(notice), true);

  const shell = strip('components/AppShell.tsx');
  eq('it is mounted once for the whole app', /<ChallengeNotice \/>/.test(shell), true);

  // The surface the complaint came from reads through the helper, so the
  // fix and the warning cannot disagree about what happened.
  const nav = strip('lib/conferenceNav.ts');
  eq('the nav list reads through it', /fetchList<ConferenceOption>\('\/api\/conferences\?nav=1'\)/.test(nav), true);
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
