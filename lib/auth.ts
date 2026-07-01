import { SignJWT, jwtVerify, type JWTPayload } from 'jose';
import type { NextRequest } from 'next/server';

// Re-export everything from auth-shared so existing API route imports keep working.
export type {
  UserRole,
  CapabilityKey,
  RoleCapabilityMap,
  RoleCapabilities,
  SessionUser,
} from './auth-shared';
export {
  ALL_ROLES,
  VALID_ROLES,
  ROLE_DISPLAY_LABELS,
  CAPABILITY_LABELS,
  LOCKED_ADMIN_CAPS,
  DEFAULT_ROLE_CAPABILITIES,
  resolveCapabilities,
} from './auth-shared';

import type { UserRole, SessionUser } from './auth-shared';

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET ?? 'dev-secret-CHANGE-IN-PRODUCTION-minimum-32-chars!!'
);

export const COOKIE_NAME = 'auth_token';
export const COOKIE_MAX_AGE = 60 * 60 * 24 * 7; // 7 days

interface AuthJWTPayload extends JWTPayload {
  email: string;
  role: UserRole;
  emailVerified: boolean;
  accountId?: string;
}

// ─── Token signing/verification ──────────────────────────────────────────────

export async function signToken(user: SessionUser): Promise<string> {
  const claims: Record<string, unknown> = {
    email: user.email,
    role: user.role,
    emailVerified: user.emailVerified,
  };
  if (user.accountId) claims.accountId = user.accountId;
  return new SignJWT(claims)
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
      accountId: payload.accountId ?? undefined,
    };
  } catch {
    return null;
  }
}

// ─── Session access ───────────────────────────────────────────────────────────

/** For middleware and API route handlers — uses the request object */
export async function getSessionUser(request: NextRequest): Promise<SessionUser | null> {
  // Try Clerk first when configured — SSO users have no auth_token cookie.
  // lib/clerkAuth.ts imports @clerk/nextjs/server (server-only), so it lives
  // here (lib/auth.ts) which is never imported by client components.
  // Client components import role constants from lib/auth-shared.ts instead.
  if (process.env.CLERK_SECRET_KEY) {
    const { getClerkSessionUser } = await import('./clerkAuth');
    const clerkUser = await getClerkSessionUser();
    if (clerkUser) {
      return {
        id: clerkUser.id,
        email: clerkUser.email,
        role: clerkUser.role as UserRole,
        emailVerified: Boolean(clerkUser.emailVerified),
        accountId: clerkUser.accountId,
      };
    }
  }
  const token = request.cookies.get(COOKIE_NAME)?.value;
  if (!token) return null;
  return verifyToken(token);
}

/** For Server Components — uses next/headers cookies() */
export async function getServerSessionUser(): Promise<SessionUser | null> {
  // Try Clerk first when configured — mirrors getSessionUser(). Without this,
  // Clerk-authenticated users (no auth_token cookie) resolve to a null session
  // in Server Components, and getDb(undefined) silently falls back to the
  // master DB instead of throwing/redirecting — surfacing master DB data on
  // any page built with Server Components (e.g. the dashboard) while
  // client-fetched API routes correctly resolve the real tenant DB.
  if (process.env.CLERK_SECRET_KEY) {
    const { getClerkSessionUser } = await import('./clerkAuth');
    const clerkUser = await getClerkSessionUser();
    if (clerkUser) {
      return {
        id: clerkUser.id,
        email: clerkUser.email,
        role: clerkUser.role as UserRole,
        emailVerified: Boolean(clerkUser.emailVerified),
        accountId: clerkUser.accountId,
      };
    }
  }
  const { cookies } = await import('next/headers');
  const cookieStore = cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;
  return verifyToken(token);
}

// ─── Cookie config ────────────────────────────────────────────────────────────

export function authCookieOptions(maxAge = COOKIE_MAX_AGE) {
  const rootDomain = process.env.NEXT_PUBLIC_COOKIE_DOMAIN; // e.g. ".useparlay.app"
  // On Vercel preview deployments (VERCEL_ENV=preview) the host is *.vercel.app,
  // which doesn't match the production cookie domain — omit the domain in that case
  // so the browser accepts the cookie on the preview hostname.
  const isPreview = process.env.VERCEL_ENV === 'preview';
  return {
    name: COOKIE_NAME,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge,
    ...(!isPreview && rootDomain ? { domain: rootDomain } : {}),
  };
}

// ─── API route helpers ────────────────────────────────────────────────────────

import { NextResponse } from 'next/server';

/**
 * Returns the session user or a 401 JSON response.
 * When an ops impersonation session is active (x-ops-impersonation-id header
 * forwarded by middleware), overrides accountId with the impersonated tenant's
 * account ID so getDb() routes to the correct tenant database.
 */
export async function requireAuth(
  request: NextRequest
): Promise<SessionUser | NextResponse> {
  const user = await getSessionUser(request);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const impersonationId = request.headers.get('x-ops-impersonation-id');
  if (impersonationId) {
    try {
      const { db, dbReady } = await import('./db');
      await dbReady;
      const row = await db.execute({
        sql: `SELECT account_id FROM impersonation_sessions WHERE id = ? AND ended_at IS NULL AND last_active_at > datetime('now', '-60 minutes')`,
        args: [impersonationId],
      });
      if (row.rows[0]) {
        return { ...user, accountId: String(row.rows[0].account_id) };
      }
    } catch { /* fallthrough — impersonation lookup failure is non-fatal */ }
  }

  // Demo mode: elevate role to administrator so inline role checks in admin
  // routes pass. Writes are still faked by the middleware for non-bypass users.
  if (process.env.NEXT_PUBLIC_DEMO_MODE === 'true' && user.role !== 'administrator') {
    return { ...user, role: 'administrator' as UserRole };
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
  // Demo mode: all authenticated users get admin access (writes are still
  // faked by the middleware — this only gates the role check).
  if (process.env.NEXT_PUBLIC_DEMO_MODE === 'true') {
    return { ...user, role: 'administrator' as UserRole };
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
