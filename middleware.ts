import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { verifyToken, COOKIE_NAME } from '@/lib/auth';

// Paths that don't require a session
const PUBLIC_PREFIXES = ['/auth/', '/api/auth/'];

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

  // Always allow public auth paths through
  if (isPublic(pathname)) return NextResponse.next();

  // Verify session token from cookie
  const token = request.cookies.get(COOKIE_NAME)?.value;
  const user = token ? await verifyToken(token) : null;

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
