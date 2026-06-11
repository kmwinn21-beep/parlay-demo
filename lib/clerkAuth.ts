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

export async function getClerkSessionUser(): Promise<ClerkSessionUser | null> {
  // Skip entirely when Clerk isn't configured — auth() throws without a
  // clerkMiddleware context, which would crash the route before JWT fallback.
  if (!process.env.CLERK_SECRET_KEY) return null;

  const { userId, sessionClaims } = await auth();
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
    return {
      id: parlayUserId,
      email: primaryEmail,
      role: (meta.role as string | undefined) ?? 'user',
      emailVerified: 1,
      accountId: meta.account_id as string | undefined,
      clerkId: userId,
    };
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

  return {
    id: claimsParlayUserId,
    email: claimsEmail,
    role: role ?? 'user',
    emailVerified: 1,
    accountId,
    clerkId: userId,
  };
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

