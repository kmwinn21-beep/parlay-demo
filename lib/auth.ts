import { SignJWT, jwtVerify, type JWTPayload } from 'jose';
import type { NextRequest } from 'next/server';

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET ?? 'dev-secret-CHANGE-IN-PRODUCTION-minimum-32-chars!!'
);

export const COOKIE_NAME = 'auth_token';
export const COOKIE_MAX_AGE = 60 * 60 * 24 * 7; // 7 days

export type UserRole = 'user' | 'administrator';

export interface SessionUser {
  id: number;
  email: string;
  role: UserRole;
  emailVerified: boolean;
}

interface AuthJWTPayload extends JWTPayload {
  email: string;
  role: UserRole;
  emailVerified: boolean;
}

// ─── Token signing/verification ──────────────────────────────────────────────

export async function signToken(user: SessionUser): Promise<string> {
  return new SignJWT({
    email: user.email,
    role: user.role,
    emailVerified: user.emailVerified,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(String(user.id))
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(JWT_SECRET);
}

export async function verifyToken(token: string): Promise<SessionUser | null> {
  try {
    const { payload } = await jwtVerify<AuthJWTPayload>(token, JWT_SECRET);
    if (!payload.sub || !payload.email || !payload.role) return null;
    return {
      id: Number(payload.sub),
      email: payload.email,
      role: payload.role,
      emailVerified: Boolean(payload.emailVerified),
    };
  } catch {
    return null;
  }
}

// ─── Session access ───────────────────────────────────────────────────────────

/** For middleware and API route handlers — uses the request object */
export async function getSessionUser(request: NextRequest): Promise<SessionUser | null> {
  const token = request.cookies.get(COOKIE_NAME)?.value;
  if (!token) return null;
  return verifyToken(token);
}

/** For Server Components — uses next/headers cookies() */
export async function getServerSessionUser(): Promise<SessionUser | null> {
  const { cookies } = await import('next/headers');
  const cookieStore = cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;
  return verifyToken(token);
}

// ─── Cookie config ────────────────────────────────────────────────────────────

export function authCookieOptions(maxAge = COOKIE_MAX_AGE) {
  return {
    name: COOKIE_NAME,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge,
  };
}

// ─── API route helpers ────────────────────────────────────────────────────────

import { NextResponse } from 'next/server';

/**
 * Returns the session user or a 401 JSON response.
 * Usage: const result = await requireAuth(request);
 *        if (result instanceof NextResponse) return result;
 */
export async function requireAuth(
  request: NextRequest
): Promise<SessionUser | NextResponse> {
  const user = await getSessionUser(request);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return user;
}

/**
 * Returns the session user (admin) or a 401/403 JSON response.
 */
export async function requireAdmin(
  request: NextRequest
): Promise<SessionUser | NextResponse> {
  const user = await getSessionUser(request);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (user.role !== 'administrator') {
    return NextResponse.json({ error: 'Forbidden: administrator access required' }, { status: 403 });
  }
  return user;
}

// ─── Input validation ─────────────────────────────────────────────────────────

export function validateEmail(email: string, allowedDomain?: string | null): { valid: boolean; error?: string } {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return { valid: false, error: 'Email is required.' };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    return { valid: false, error: 'Enter a valid email address.' };
  }
  const domain = allowedDomain ?? process.env.ALLOWED_EMAIL_DOMAIN ?? null;
  if (domain) {
    const suffix = domain.startsWith('@') ? domain : `@${domain}`;
    if (!normalized.endsWith(suffix)) {
      return { valid: false, error: `Only ${suffix} email addresses may sign up.` };
    }
  }
  return { valid: true };
}

export function validatePassword(password: string): { valid: boolean; error?: string } {
  if (!password || password.length < 8) {
    return { valid: false, error: 'Password must be at least 8 characters.' };
  }
  return { valid: true };
}
