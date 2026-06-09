import { SignJWT, jwtVerify, type JWTPayload } from 'jose';
import type { NextRequest } from 'next/server';

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET ?? 'dev-secret-CHANGE-IN-PRODUCTION-minimum-32-chars!!'
);

export const COOKIE_NAME = 'auth_token';
export const COOKIE_MAX_AGE = 60 * 60 * 24 * 7; // 7 days

export type UserRole = 'user' | 'administrator' | 'sales_rep' | 'manager' | 'analyst' | 'conference_coordinator' | 'stakeholder';

export const ALL_ROLES: UserRole[] = ['sales_rep', 'manager', 'analyst', 'conference_coordinator', 'user', 'administrator', 'stakeholder'];
export const VALID_ROLES = new Set<string>(ALL_ROLES);

export const ROLE_DISPLAY_LABELS: Record<string, string> = {
  sales_rep: 'Sales Rep',
  manager: 'Manager',
  analyst: 'Analyst',
  conference_coordinator: 'Coordinator',
  user: 'User',
  administrator: 'Administrator',
  stakeholder: 'Stakeholder',
};

export type CapabilityKey =
  | 'view_data'
  | 'create_activity'
  | 'view_rep_metrics'
  | 'view_effectiveness'
  | 'view_financials'
  | 'view_pre_post_conference'
  | 'crm_export'
  | 'manage_conference_data'
  | 'delete_merge'
  | 'manage_system_config'
  | 'manage_users'
  | 'manage_role_scope'
  | 'view_calendar_intelligence'
  | 'use_calendar_tools';

export type RoleCapabilityMap = Record<CapabilityKey, boolean>;
export type RoleCapabilities = Record<UserRole, RoleCapabilityMap>;

export const CAPABILITY_LABELS: Record<CapabilityKey, string> = {
  view_data: 'View conferences, companies & attendees',
  create_activity: 'Create notes, meetings & follow-ups',
  view_rep_metrics: 'View rep activity metrics',
  view_effectiveness: 'Conference Effectiveness (non-financial tabs)',
  view_financials: 'Budget, cost efficiency & ROI data',
  view_pre_post_conference: 'Pre/Post-Conference Review',
  crm_export: 'Export CRM import files',
  manage_conference_data: 'Upload attendees, edit agendas & forms',
  delete_merge: 'Delete or merge companies & attendees',
  manage_system_config: 'ICP rules, scoring config & branding',
  manage_users: 'User management & invitations',
  manage_role_scope: 'Role Scope',
  view_calendar_intelligence: 'View Calendar Intelligence',
  use_calendar_tools: 'Use Path to Tier & Strategic Lens tools',
};

export const LOCKED_ADMIN_CAPS: CapabilityKey[] = [
  'manage_system_config', 'manage_users', 'manage_role_scope',
];

export const DEFAULT_ROLE_CAPABILITIES: RoleCapabilities = {
  sales_rep:              { view_data: true,  create_activity: true,  view_rep_metrics: true,  view_effectiveness: false, view_financials: false, view_pre_post_conference: false, crm_export: false, manage_conference_data: false, delete_merge: false, manage_system_config: false, manage_users: false, manage_role_scope: false, view_calendar_intelligence: true,  use_calendar_tools: false },
  manager:                { view_data: true,  create_activity: true,  view_rep_metrics: true,  view_effectiveness: true,  view_financials: false, view_pre_post_conference: true,  crm_export: true,  manage_conference_data: false, delete_merge: false, manage_system_config: false, manage_users: false, manage_role_scope: false, view_calendar_intelligence: true,  use_calendar_tools: true  },
  analyst:                { view_data: true,  create_activity: false, view_rep_metrics: true,  view_effectiveness: true,  view_financials: true,  view_pre_post_conference: true,  crm_export: true,  manage_conference_data: false, delete_merge: false, manage_system_config: false, manage_users: false, manage_role_scope: false, view_calendar_intelligence: true,  use_calendar_tools: true  },
  conference_coordinator: { view_data: true,  create_activity: false, view_rep_metrics: false, view_effectiveness: false, view_financials: false, view_pre_post_conference: false, crm_export: true,  manage_conference_data: true,  delete_merge: true,  manage_system_config: false, manage_users: false, manage_role_scope: false, view_calendar_intelligence: true,  use_calendar_tools: false },
  user:                   { view_data: true,  create_activity: true,  view_rep_metrics: true,  view_effectiveness: true,  view_financials: true,  view_pre_post_conference: true,  crm_export: false, manage_conference_data: true,  delete_merge: true,  manage_system_config: false, manage_users: false, manage_role_scope: false, view_calendar_intelligence: true,  use_calendar_tools: true  },
  administrator:          { view_data: true,  create_activity: true,  view_rep_metrics: true,  view_effectiveness: true,  view_financials: true,  view_pre_post_conference: true,  crm_export: true,  manage_conference_data: true,  delete_merge: true,  manage_system_config: true,  manage_users: true,  manage_role_scope: true,  view_calendar_intelligence: true,  use_calendar_tools: true  },
  stakeholder:            { view_data: false, create_activity: false, view_rep_metrics: false, view_effectiveness: false, view_financials: false, view_pre_post_conference: false, crm_export: false, manage_conference_data: false, delete_merge: false, manage_system_config: false, manage_users: false, manage_role_scope: false, view_calendar_intelligence: true,  use_calendar_tools: false },
};

export function resolveCapabilities(role: UserRole, stored: Partial<RoleCapabilities>): RoleCapabilityMap {
  if (role === 'administrator') return DEFAULT_ROLE_CAPABILITIES['administrator'];
  const defaults = DEFAULT_ROLE_CAPABILITIES[role] ?? DEFAULT_ROLE_CAPABILITIES['user'];
  const overrides = (stored[role] ?? {}) as Partial<RoleCapabilityMap>;
  const merged = { ...defaults, ...overrides };
  LOCKED_ADMIN_CAPS.forEach(k => { merged[k] = false; });
  return merged;
}

export interface SessionUser {
  id: number;
  email: string;
  role: UserRole;
  emailVerified: boolean;
  accountId?: string;
}

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
