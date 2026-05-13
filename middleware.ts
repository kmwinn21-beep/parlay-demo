import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { verifyToken, COOKIE_NAME } from '@/lib/auth';

// Paths that don't require a session
const PUBLIC_PREFIXES = ['/auth/', '/api/auth/', '/api/logo-config', '/api/tagline', '/api/app-name', '/signup'];

// Paths that require administrator role
const ADMIN_PREFIXES = ['/admin'];

function isPublic(pathname: string): boolean {
  return PUBLIC_PREFIXES.some((p) => pathname.startsWith(p));
}

function isAdminOnly(pathname: string): boolean {
  return ADMIN_PREFIXES.some((p) => pathname.startsWith(p));
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Handle CORS preflight for trial signup — must be resolved at the edge
  // before Vercel's routing layer can interfere.
  if (request.method === 'OPTIONS' && pathname === '/api/auth/trial-signup') {
    return new NextResponse(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': 'https://useparlay.app',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Credentials': 'true',
      },
    });
  }

  // Always allow public auth paths through
  if (isPublic(pathname)) return NextResponse.next();

  // Verify session token from cookie
  const token = request.cookies.get(COOKIE_NAME)?.value;
  const user = token ? await verifyToken(token) : null;

  // /ops routes: redirect unauthenticated to /auth/login (no error, no params)
  // is_admin check happens per-route-handler (requires DB, unavailable in Edge Runtime)
  if (pathname.startsWith('/ops') || pathname.startsWith('/api/ops')) {
    if (!user) {
      return NextResponse.redirect(new URL('/auth/login', request.url));
    }
    // Pass impersonation cookie as request header for downstream handlers
    const impersonationId = request.cookies.get('ops_impersonation')?.value;
    const requestHeaders = new Headers(request.headers);
    if (impersonationId) {
      requestHeaders.set('x-ops-impersonation-id', impersonationId);
    }
    return NextResponse.next({ request: { headers: requestHeaders } });
  }

  if (!user) {
    // API routes → 401 JSON; page routes → redirect to login
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const loginUrl = new URL('/auth/login', request.url);
    loginUrl.searchParams.set('next', pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Enforce administrator role for admin routes
  if (isAdminOnly(pathname) && user.role !== 'administrator') {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json(
        { error: 'Forbidden: administrator access required' },
        { status: 403 }
      );
    }
    return NextResponse.redirect(new URL('/auth/access-denied', request.url));
  }

  // Impersonation write-blocking: block all writes while impersonating
  // (allow /api/ops/impersonate/end so the admin can exit)
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

  // Forward impersonation ID to downstream handlers for main app API routes
  if (impersonationId) {
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set('x-ops-impersonation-id', impersonationId);
    return NextResponse.next({ request: { headers: requestHeaders } });
  }

  // Demo mode: intercept all writes and return fake 200 responses
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
        try { body = await request.json(); } catch { /* non-JSON or file upload body */ }
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

export const config = {
  matcher: [
    /*
     * Run on all paths EXCEPT:
     *  - _next/static  (Next.js build assets)
     *  - _next/image   (image optimisation)
     *  - Static files with extensions (images, fonts, favicon)
     */
    '/((?!_next/static|_next/image|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?|ttf|eot)$).*)',
  ],
};
