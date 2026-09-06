/**
 * Middleware forwards every request through the header strip.
 *
 *   node --experimental-strip-types --import ./tests/register-ts.mjs \
 *        tests/middleware-forwarding.mjs
 *
 * lib/requestHeaders.ts is unit-tested elsewhere; what that cannot show is that
 * middleware actually *calls* it on every path. The bug this guards against was
 * exactly a path that did not: `NextResponse.next()` with no argument forwards
 * the original request headers, so four bare calls were four ways for a
 * client-supplied `x-ops-impersonation-id` to reach a handler while the two
 * paths that set the header looked correct.
 *
 * @clerk/nextjs/server is stubbed to load middleware.ts at all — its ESM build
 * does not resolve under plain Node. CLERK_SECRET_KEY is left unset, so the
 * stub is never called; it only satisfies the import.
 */
import { register } from 'node:module';
register('./stub-clerk.mjs', import.meta.url);

process.env.JWT_SECRET = 'test-secret-at-least-thirty-two-characters-long';
delete process.env.CLERK_SECRET_KEY;
delete process.env.NEXT_PUBLIC_DEMO_MODE;
delete process.env.DEMO_BYPASS_SECRET;

let pass = 0;
let fail = 0;
const eq = (label, got, want) => {
  const g = JSON.stringify(got);
  const w = JSON.stringify(want);
  if (g === w) { pass++; console.log(`  ok   ${label}`); }
  else { fail++; console.log(`  FAIL ${label}\n       got  ${g}\n       want ${w}`); }
};

const { NextRequest } = await import('next/server');
const middleware = (await import('@/middleware')).default;

const FORGED = 'forged-by-the-client';
const FROM_COOKIE = 'set-from-the-cookie';
const HEADER = 'x-ops-impersonation-id';

/**
 * What middleware forwarded, as Next encodes it.
 *
 * `NextResponse.next({ request: { headers } })` lists every forwarded header in
 * `x-middleware-override-headers`, and the Next server rebuilds the request
 * from exactly that list — so a name absent from it does not reach the handler.
 *
 * A bare `NextResponse.next()` passes no header set at all and so emits no such
 * response header. Its presence is therefore proof that this path went through
 * forward(), which is the property this file exists to pin down.
 */
function forwarded(res) {
  const list = res.headers.get('x-middleware-override-headers');
  if (list === null) return { wentThroughForward: false, names: [], value: null };
  const names = list.split(',').map(n => n.trim().toLowerCase()).filter(Boolean);
  return {
    wentThroughForward: true,
    names,
    value: names.includes(HEADER) ? res.headers.get(`x-middleware-request-${HEADER}`) : null,
  };
}

const request = (path, { cookies = {}, headers = {}, method = 'GET' } = {}) => {
  const cookie = Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join('; ');
  return new NextRequest(`https://parlay.test${path}`, {
    method,
    headers: cookie ? { ...headers, cookie } : headers,
  });
};

// Every path a request can leave middleware by. Each must go through forward().
//
// '/api/ops/accounts' is deliberately absent: isPublicRoute lists '/ops(.*)'
// and '/api/ops/(.*)', so it matches before the ops branch is reached and the
// request leaves through the public branch. '/api/ops' with no trailing
// segment is the one shape that reaches the ops branch itself.
const PATHS = [
  ['a public route',        '/api/auth/login',    {}],
  ['an ops path',           '/api/ops/accounts',  {}],
  ['the ops branch itself', '/api/ops',           {}],
  ['an app API route',      '/api/companies',     {}],
  ['an app page',           '/conferences',       {}],
];

console.log('\n— every forwarding path goes through the strip —');
for (const [label, path] of PATHS) {
  const res = await middleware(request(path, { headers: { [HEADER]: FORGED } }));
  const f = forwarded(res);
  eq(`${label} forwards through forward()`, f.wentThroughForward, true);
  eq('  and the forged header does not survive it', f.value, null);
}

{
  // The ops branch is the one that sets the header from the cookie, so it is
  // worth pinning that it still does where it is actually reached.
  const res = await middleware(request('/api/ops', {
    cookies: { ops_impersonation: FROM_COOKIE },
    headers: { [HEADER]: FORGED },
  }));
  eq('the ops branch replaces a forged header with the cookie\'s value',
    forwarded(res).value, FROM_COOKIE);
}

console.log('\n— and middleware\'s own value still gets through —');
{
  const res = await middleware(request('/api/companies', { cookies: { ops_impersonation: FROM_COOKIE } }));
  eq('the cookie sets the header', forwarded(res).value, FROM_COOKIE);
}
{
  const res = await middleware(request('/api/companies', {
    cookies: { ops_impersonation: FROM_COOKIE },
    headers: { [HEADER]: FORGED },
  }));
  eq('  and beats a forged one rather than colliding with it', forwarded(res).value, FROM_COOKIE);
}
{
  const res = await middleware(request('/api/companies', { headers: { cookie: 'a=b', 'x-forwarded-for': '203.0.113.9' } }));
  eq('headers middleware does not own are left alone',
    forwarded(res).names.includes('x-forwarded-for'), true);
}

console.log('\n— impersonation is still read-only —');
{
  const res = await middleware(request('/api/companies', {
    method: 'POST', cookies: { ops_impersonation: FROM_COOKIE },
  }));
  eq('a write during impersonation is refused', res.status, 403);
}
{
  const res = await middleware(request('/api/ops/accounts', {
    method: 'POST', cookies: { ops_impersonation: FROM_COOKIE },
  }));
  eq('  but ops routes are how an admin acts, so they are not blocked', res.status !== 403, true);
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
