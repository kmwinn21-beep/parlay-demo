import { Webhook } from 'svix';
import { headers } from 'next/headers';
import { clerkClient } from '@clerk/nextjs/server';
import type { WebhookEvent } from '@clerk/nextjs/server';
import { syncClerkUserToTenant } from '@/lib/syncClerkUser';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const WEBHOOK_SECRET = process.env.CLERK_WEBHOOK_SECRET;
  if (!WEBHOOK_SECRET) {
    console.error('[clerk-webhook] CLERK_WEBHOOK_SECRET is not set');
    return new Response('Webhook secret not configured', { status: 500 });
  }

  // Read svix signature headers
  const headerPayload = headers();
  const svix_id        = headerPayload.get('svix-id');
  const svix_timestamp = headerPayload.get('svix-timestamp');
  const svix_signature = headerPayload.get('svix-signature');

  if (!svix_id || !svix_timestamp || !svix_signature) {
    return new Response('Missing svix headers', { status: 400 });
  }

  // Verify signature
  const payload = await request.json();
  const body = JSON.stringify(payload);
  const wh = new Webhook(WEBHOOK_SECRET);
  let evt: WebhookEvent;

  try {
    evt = wh.verify(body, {
      'svix-id':        svix_id,
      'svix-timestamp': svix_timestamp,
      'svix-signature': svix_signature,
    }) as WebhookEvent;
  } catch (err) {
    console.error('[clerk-webhook] Invalid signature:', err);
    return new Response('Invalid signature', { status: 400 });
  }

  // ── user.created ──────────────────────────────────────────────────────────
  if (evt.type === 'user.created') {
    const { id: clerkId, email_addresses, primary_email_address_id } = evt.data;

    const primaryEmail = email_addresses.find(
      e => e.id === primary_email_address_id,
    )?.email_address;

    if (!primaryEmail) {
      console.error('[clerk-webhook] user.created event has no primary email', { clerkId });
      return new Response('No primary email', { status: 400 });
    }

    // Sync clerk_id into tenant DB and get the metadata needed for JWT claims
    const result = await syncClerkUserToTenant(clerkId, primaryEmail);

    if (!result.success || !result.accountId || !result.parlayUserId) {
      // Log and return 200 so Clerk doesn't retry indefinitely for unknown users
      console.warn('[clerk-webhook] Could not sync user — tenant not found or user row missing', {
        clerkId,
        email: primaryEmail,
      });
      return new Response('User not found in tenant — skipped', { status: 200 });
    }

    // Write public metadata onto the Clerk user so the JWT template can
    // embed account_id, parlay_user_id, and role as session claims.
    try {
      await clerkClient.users.updateUserMetadata(clerkId, {
        publicMetadata: {
          account_id:     result.accountId,
          parlay_user_id: result.parlayUserId,
          role:           result.role ?? 'user',
        },
      });
    } catch (err) {
      console.error('[clerk-webhook] Failed to set Clerk public metadata:', err);
      // Return 500 so Clerk retries — metadata is required for JWT claims to work
      return new Response('Failed to set public metadata', { status: 500 });
    }

    console.log('[clerk-webhook] Synced user', {
      clerkId,
      email: primaryEmail,
      accountId: result.accountId,
      parlayUserId: result.parlayUserId,
      role: result.role,
    });
  }

  return new Response('OK', { status: 200 });
}
