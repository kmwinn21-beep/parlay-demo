/**
 * Clerk → Parlay session bridge.
 *
 * REQUIRED SETUP — Clerk Dashboard > JWT Templates
 * ─────────────────────────────────────────────────
 * Create a template named "parlay" with these custom claims:
 *
 *   {
 *     "account_id":      "{{user.public_metadata.account_id}}",
 *     "parlay_user_id":  "{{user.public_metadata.parlay_user_id}}",
 *     "role":            "{{user.public_metadata.role}}",
 *     "email":           "{{user.primary_email_address}}"
 *   }
 *
 * account_id is optional — omit it for master-DB users (ops admins whose
 * account predates the per-tenant Turso provisioning system). Those users
 * set only parlay_user_id + role; getDb(undefined) routes them to the
 * master DB automatically.
 *
 * These are populated by the Clerk webhook (app/api/webhooks/clerk/route.ts)
 * when a user is created or synced. The app will return 401 for any session
 * that is missing parlay_user_id until the metadata is set.
 *
 * REQUIRED SETUP — Clerk Dashboard > Webhooks
 * ────────────────────────────────────────────
 * Create an endpoint pointing to:
 *   https://your-domain/api/webhooks/clerk
 * Subscribe to: user.created
 * Copy the Signing Secret into CLERK_WEBHOOK_SECRET in .env.local.
 */

import { auth, currentUser } from '@clerk/nextjs/server';
import { headers } from 'next/headers';
import { NextResponse } from 'next/server';
import type { SessionUser, UserRole } from './auth-shared';

export type ClerkSessionUser = {
  id: number;
  email: string;
  role: string;
  emailVerified: number;
  accountId: string | undefined; // undefined for master-DB (ops admin) users
  clerkId: string;
};

/**
 * Clerk sessions this server instance has already written a row for.
 *
 * The database is the real guard — session_key is UNIQUE, so a duplicate
 * insert from another instance is ignored — and this is only here to keep
 * every request of an established session from making the round trip to find
 * that out. Bounded, because a long-lived instance would otherwise collect
 * session ids forever; the cost of forgetting one is a single INSERT OR
 * IGNORE that changes nothing.
 */
const seenSessions = new Set<string>();
/** When each user's activity stamp was last written, by this instance. */
const lastTouched = new Map<number, number>();
const SEEN_LIMIT = 5_000;
/** How stale an activity stamp may get before it is written again. */
const TOUCH_INTERVAL_MS = 15 * 60 * 1000;

/**
 * Note that an SSO user is here: one row the first time a session is seen,
 * and an activity stamp at most every quarter of an hour.
 *
 * This is the only place a single sign-on can be recorded. Clerk issues the
 * session on its own domain and the app never sees the sign-in happen — it
 * meets an existing session, on every request. Without this, Admin > Usage
 * counted only the password routes, which an SSO account never touches:
 * somebody in the product every day read as "Never".
 *
 * Deliberately awaited rather than fired and forgotten. An un-awaited write
 * races the serverless function freezing after its response and is dropped
 * often enough to be useless — the same reason recordUserSession is awaited.
 * It costs one round trip per session per instance, and nothing at all on the
 * requests after that.
 */
async function noteSession(user: ClerkSessionUser, sessionId: string | null | undefined): Promise<void> {
  try {
    const fresh = sessionId ? !seenSessions.has(sessionId) : false;
    const lastTouch = lastTouched.get(user.id) ?? 0;
    const stale = Date.now() - lastTouch > TOUCH_INTERVAL_MS;
    if (!fresh && !stale) return;

    const { getDb } = await import('./getDb');
    const { recordSessionOnce, touchLastSeen } = await import('./auth');
    const db = await getDb(user.accountId);

    if (fresh && sessionId) {
      if (seenSessions.size >= SEEN_LIMIT) seenSessions.clear();
      seenSessions.add(sessionId);
      const h = await headers();
      const inserted = await recordSessionOnce(db, user.id, sessionId, {
        ip: h.get('x-forwarded-for'),
        userAgent: h.get('user-agent'),
      });
      // The insert moves last_seen_at itself, so a touch on top of it would
      // be a second write saying the same thing.
      if (inserted) { lastTouched.set(user.id, Date.now()); return; }
    }

    if (stale) {
      lastTouched.set(user.id, Date.now());
      await touchLastSeen(db, user.id);
    }
  } catch (err) {
    // Usage tracking must never be why a request fails. A tenant database
    // that is briefly unreachable loses a statistic, not a page.
    console.error('[usage] could not record the SSO session:', err);
  }
}

export async function getClerkSessionUser(): Promise<ClerkSessionUser | null> {
  // Skip entirely when Clerk isn't configured — auth() throws without a
  // clerkMiddleware context, which would crash the route before JWT fallback.
  if (!process.env.CLERK_SECRET_KEY) return null;

  const { userId, sessionId, sessionClaims } = await auth();
  if (!userId) return null;

  const claimsAccountId = sessionClaims?.account_id as string | undefined;
  const claimsParlayUserId = sessionClaims?.parlay_user_id as number | undefined;
  const claimsRole = sessionClaims?.role as string | undefined;
  const claimsEmail = (sessionClaims?.email as string | undefined) ?? '';

  // If parlay_user_id is missing from claims the JWT template may not be set
  // up yet, or the user.created webhook fired after this session token was
  // issued. Fall back to currentUser() which always reads live publicMetadata.
  // Retry up to 3× with a short delay to handle the webhook race condition on
  // brand-new SSO signups (user lands on the app before webhook completes).
  if (!claimsParlayUserId) {
    let meta: Record<string, unknown> = {};
    let primaryEmail = claimsEmail;
    for (let attempt = 0; attempt < 3; attempt++) {
      if (attempt > 0) await new Promise(r => setTimeout(r, 800 * attempt));
      const user = await currentUser();
      if (!user) return null;
      meta = user.publicMetadata as Record<string, unknown>;
      primaryEmail = user.emailAddresses.find(e => e.id === user.primaryEmailAddressId)?.emailAddress ?? claimsEmail;
      if (meta.parlay_user_id) break;
    }
    const parlayUserId = meta.parlay_user_id as number | undefined;
    if (!parlayUserId) return null;
    const fallbackUser: ClerkSessionUser = {
      id: parlayUserId,
      email: primaryEmail,
      role: (meta.role as string | undefined) ?? 'user',
      emailVerified: 1,
      accountId: meta.account_id as string | undefined,
      clerkId: userId,
    };
    await noteSession(fallbackUser, sessionId);
    return fallbackUser;
  }

  // Happy path: JWT claims already have parlay_user_id.
  // Fetch live publicMetadata if role or account_id are missing from claims —
  // this happens when the JWT template doesn't include those fields, or when
  // the token was issued before the webhook wrote the metadata.
  let role = claimsRole;
  let accountId = claimsAccountId;
  if (!role || !accountId) {
    const user = await currentUser();
    const meta = (user?.publicMetadata ?? {}) as Record<string, unknown>;
    if (!role) role = (meta.role as string | undefined) ?? 'user';
    if (!accountId) accountId = meta.account_id as string | undefined;
  }

  const sessionUser: ClerkSessionUser = {
    id: claimsParlayUserId,
    email: claimsEmail,
    role: role ?? 'user',
    emailVerified: 1,
    accountId,
    clerkId: userId,
  };
  await noteSession(sessionUser, sessionId);
  return sessionUser;
}

/**
 * Clerk-backed variant of requireAuth. Uses Clerk session claims instead of
 * the legacy auth_token cookie. Mirrors the same return type so call sites
 * can swap requireAuth → requireClerkAuth without any other changes.
 * Kept in this file (not lib/auth.ts) because @clerk/nextjs/server is
 * server-only and cannot be imported from client component module chains.
 */
export async function requireClerkAuth(): Promise<SessionUser | NextResponse> {
  const clerkUser = await getClerkSessionUser();
  if (!clerkUser) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return {
    id: clerkUser.id,
    email: clerkUser.email,
    role: clerkUser.role as UserRole,
    emailVerified: Boolean(clerkUser.emailVerified),
    accountId: clerkUser.accountId,
  };
}

