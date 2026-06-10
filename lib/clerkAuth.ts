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

import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import type { SessionUser, UserRole } from './auth';

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

  const accountId = sessionClaims?.account_id as string | undefined;
  const parlayUserId = sessionClaims?.parlay_user_id as number | undefined;
  const role = sessionClaims?.role as string | undefined;
  const email = (sessionClaims?.email as string | undefined) ?? '';

  // parlay_user_id is required — it's set by the webhook or trial-signup.
  // account_id is optional: absent means master-DB user (no tenant Turso DB).
  if (!parlayUserId) return null;

  return {
    id: parlayUserId,
    email,
    role: role ?? 'user',
    emailVerified: 1,
    accountId, // may be undefined → getDb(undefined) → master DB
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

