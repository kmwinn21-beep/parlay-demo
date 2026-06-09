import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const isPublicRoute = createRouteMatcher([
  '/auth/login(.*)',
  '/auth/signup(.*)',
  '/auth/accept-invite(.*)',
  '/auth/forgot-password(.*)',
  '/auth/reset-password(.*)',
  '/api/auth/login(.*)',
  '/api/auth/signup(.*)',
  '/api/auth/trial-signup(.*)',
  '/api/auth/accept-invite(.*)',
  '/api/auth/forgot-password(.*)',
  '/api/auth/reset-password(.*)',
  '/api/auth/verify(.*)',
  '/api/logo-config(.*)',
  '/api/tagline(.*)',
  '/api/app-name(.*)',
  // Clerk internals + webhook (arrives without a user session)
  '/api/webhooks/clerk(.*)',
  '/__clerk(.*)',
  '/signup(.*)',
  // Ops panel uses its own JWT auth (requireOpsAdmin) — fully Clerk-independent
  '/ops(.*)',
  '/api/ops/(.*)',
]);

const isAdminRoute = createRouteMatcher(['/admin(.*)']);

// /ops routes intentionally redirect to plain /auth/login (no ?next=) so that
// after login the ops user lands on the dashboard rather than re-entering ops.
const isOpsRoute = createRouteMatcher(['/ops(.*)', '/api/ops(.*)']);

export default clerkMiddleware(async (auth, request: NextRequest) => {
  const url = request.nextUrl;
  const { pathname } = url;

  // ── CORS — trial signup from marketing site ──────────────────────────────
  // Exact-origin check preserved from the original middleware.
  if (request.method === 'OPTIONS' && pathname === '/api/auth/trial-signup') {
    const origin = request.headers.get('origin') ?? '';
    const allowed = origin === 'https://useparlay.app' || origin === 'https://www.useparlay.app';
    return new NextResponse(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': allowed ? origin : 'https://useparlay.app',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Credentials': 'true',
      },
    });
  }

  // ── Public routes — skip all auth ────────────────────────────────────────
  if (isPublicRoute(request)) {
    return NextResponse.next();
  }

  // ── Ops routes — bypass Clerk entirely ───────────────────────────────────
  // requireOpsAdmin / requireOpsAdminPage inside each handler are the real
  // auth gate (JWT auth_token cookie + master DB is_admin check). Returning
  // here before await auth() means Clerk is never contacted for ops routes,
  // so the ops panel remains accessible even if Clerk is unavailable.
  if (isOpsRoute(request)) {
    const impersonationId = request.cookies.get('ops_impersonation')?.value;
    if (impersonationId) {
      const requestHeaders = new Headers(request.headers);
      requestHeaders.set('x-ops-impersonation-id', impersonationId);
      return NextResponse.next({ request: { headers: requestHeaders } });
    }
    return NextResponse.next();
  }

  // ── Require Clerk session for everything else ────────────────────────────
  const { userId, sessionClaims } = await auth();

  // ── Unauthenticated ──────────────────────────────────────────────────────
  if (!userId) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const loginUrl = new URL('/auth/login', request.url);
    const search = url.search;
    loginUrl.searchParams.set('next', pathname + (search || ''));
    // Forward Vercel preview bypass token so the login page isn't blocked by
    // deployment protection on preview URLs.
    const vToken = url.searchParams.get('_v');
    if (vToken) loginUrl.searchParams.set('_v', vToken);
    return NextResponse.redirect(loginUrl);
  }

  // ── Admin route protection ───────────────────────────────────────────────
  if (isAdminRoute(request)) {
    const role = sessionClaims?.role as string | undefined;
    if (role !== 'administrator') {
      if (pathname.startsWith('/api/')) {
        return NextResponse.json(
          { error: 'Forbidden: administrator access required' },
          { status: 403 }
        );
      }
      return NextResponse.redirect(new URL('/auth/access-denied', request.url));
    }
  }

  // ── Impersonation write-blocking ─────────────────────────────────────────
  // Block all mutations while an ops_impersonation cookie is active.
  // Exempt the entire /api/ops/ prefix (not just the end-session path) so
  // all ops management actions still work during impersonation.
  const impersonationId = request.cookies.get('ops_impersonation')?.value;
  if (impersonationId && pathname.startsWith('/api/') && !pathname.startsWith('/api/ops/')) {
    const method = request.method.toUpperCase();
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
      return NextResponse.json(
        { error: 'Write actions are disabled in admin view.' },
        { status: 403 }
      );
    }
  }

  // ── Forward impersonation header for main-app API routes ─────────────────
  if (impersonationId) {
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set('x-ops-impersonation-id', impersonationId);
    return NextResponse.next({ request: { headers: requestHeaders } });
  }

  // ── Demo mode — intercept all mutations ──────────────────────────────────
  const bypassSecret = process.env.DEMO_BYPASS_SECRET;
  const bypassCookie = request.cookies.get('demo_bypass')?.value;
  const hasBypass = !!bypassSecret && bypassCookie === bypassSecret;

  if (!hasBypass && process.env.NEXT_PUBLIC_DEMO_MODE === 'true') {
    const method = request.method.toUpperCase();
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method) && pathname.startsWith('/api/')) {
      const DEMO_PASSTHROUGH = [
        '/api/auth/',
        '/api/upload-preview',
        '/api/scan-card',
        '/api/scan-notes',
        '/api/card-scan/match',
      ];
      if (!DEMO_PASSTHROUGH.some(p => pathname.startsWith(p))) {
        let body: Record<string, unknown> = {};
        try { body = await request.json(); } catch { /* non-JSON or file upload */ }
        const now = new Date().toISOString();
        const fake = method === 'DELETE'
          ? {}
          : { id: Date.now(), ...body, created_at: now, updated_at: now };
        return NextResponse.json(fake, { status: 200 });
      }
    }
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?|ttf|eot)$).*)',
    '/__clerk/:path*',
    '/(api|trpc)(.*)',
  ],
};
