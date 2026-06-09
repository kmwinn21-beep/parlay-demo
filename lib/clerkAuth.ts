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
 *     "role":            "{{user.public_metadata.role}}"
 *   }
 *
 * These are populated by the Clerk webhook (app/api/webhooks/clerk/route.ts)
 * when a user is created or synced. The app will return 401 for any session
 * that is missing these claims until the metadata is set.
 *
 * REQUIRED SETUP — Clerk Dashboard > Webhooks
 * ────────────────────────────────────────────
 * Create an endpoint pointing to:
 *   https://your-domain/api/webhooks/clerk
 * Subscribe to: user.created
 * Copy the Signing Secret into CLERK_WEBHOOK_SECRET in .env.local.
 */

import { auth } from '@clerk/nextjs/server';

export type ClerkSessionUser = {
  id: number;
  email: string;
  role: string;
  emailVerified: number;
  accountId: string;
  clerkId: string;
};

export async function getClerkSessionUser(): Promise<ClerkSessionUser | null> {
  const { userId, sessionClaims } = await auth();
  if (!userId) return null;

  const accountId = sessionClaims?.account_id as string | undefined;
  const parlayUserId = sessionClaims?.parlay_user_id as number | undefined;
  const role = sessionClaims?.role as string | undefined;

  // Claims are populated by the JWT template once public metadata is set via
  // the user.created webhook. Return null (→ 401) if not yet synced.
  if (!accountId || !parlayUserId) return null;

  return {
    id: parlayUserId,
    email: (sessionClaims?.email as string | undefined) ?? '',
    role: role ?? 'user',
    emailVerified: 1,
    accountId,
    clerkId: userId,
  };
}
