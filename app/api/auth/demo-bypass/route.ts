import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const COOKIE_NAME = 'demo_bypass';

export async function GET(request: NextRequest) {
  const { searchParams, pathname } = request.nextUrl;

  // Clear route: /api/auth/demo-bypass/clear
  if (pathname.endsWith('/clear')) {
    const res = NextResponse.redirect(new URL('/auth/login', request.url));
    res.cookies.set(COOKIE_NAME, '', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: 0,
    });
    return res;
  }

  const secret = process.env.DEMO_BYPASS_SECRET;
  if (!secret) {
    return NextResponse.json({ error: 'Demo bypass not configured' }, { status: 503 });
  }

  const provided = searchParams.get('secret');
  if (!provided || provided !== secret) {
    return NextResponse.json({ error: 'Invalid secret' }, { status: 401 });
  }

  const res = NextResponse.redirect(new URL('/', request.url));
  res.cookies.set(COOKIE_NAME, secret, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 7, // 7 days
    sameSite: 'lax',
  });
  return res;
}
