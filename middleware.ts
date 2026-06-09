import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';
import type { ClerkMiddlewareAuth } from '@clerk/nextjs/server';
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
  '/ops-login',
  '/ops(.*)',
  '/api/ops/(.*)',
]);

const isAdminRoute = createRouteMatcher(['/admin(.*)']);

// /ops routes intentionally redirect to plain /auth/login (no ?next=) so that
// after login the ops user lands on the dashboard rather than re-entering ops.
const isOpsRoute = createRouteMatcher(['/ops(.*)', '/api/ops(.*)']);

// Core middleware logic shared by both Clerk and legacy (JWT-only) paths.
// When clerkAuth is null, Clerk is not configured — session validation is
// delegated to per-route requireAuth() (JWT cookie path, e.g. demo env).
async function handleCore(
  clerkAuth: ClerkMiddlewareAuth | null,
  request: NextRequest,
): Promise<NextResponse> {
  const url = request.nextUrl;
  const { pathname } = url;

  // ── CORS — trial signup from marketing site ──────────────────────────────
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

  // ── Clerk session check (only when Clerk is configured) ──────────────────
  // When clerkAuth is null (e.g. demo environment without Clerk keys),
  // route handlers call requireAuth() which validates the JWT cookie directly.
  if (clerkAuth) {
    const { userId, sessionClaims } = clerkAuth();

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

    // ── Admin route protection ─────────────────────────────────────────────
    // Only block when role is explicitly non-administrator. If role is absent
    // from claims (Clerk JWT template not yet configured), pass through and
    // let per-route requireAdmin() check the tenant DB role instead.
    if (isAdminRoute(request)) {
      const role = sessionClaims?.role as string | undefined;
      if (role !== undefined && role !== 'administrator') {
        if (pathname.startsWith('/api/')) {
          return NextResponse.json(
            { error: 'Forbidden: administrator access required' },
            { status: 403 },
          );
        }
        return NextResponse.redirect(new URL('/auth/access-denied', request.url));
      }
    }
  }

  // ── Impersonation write-blocking ─────────────────────────────────────────
  const impersonationId = request.cookies.get('ops_impersonation')?.value;
  if (impersonationId && pathname.startsWith('/api/') && !pathname.startsWith('/api/ops/')) {
    const method = request.method.toUpperCase();
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
      return NextResponse.json(
        { error: 'Write actions are disabled in admin view.' },
        { status: 403 },
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
}

// When CLERK_SECRET_KEY is present, wrap with clerkMiddleware so auth() works.
// When absent (e.g. demo environment), export a plain middleware — Clerk is never
// contacted and all auth is handled by per-route requireAuth() JWT cookie checks.
export default process.env.CLERK_SECRET_KEY
  ? clerkMiddleware((auth, request: NextRequest) => handleCore(auth, request))
  : (request: NextRequest) => handleCore(null, request);

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?|ttf|eot)$).*)',
    '/__clerk/:path*',
    '/(api|trpc)(.*)',
  ],
};
