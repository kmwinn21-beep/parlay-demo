import { stripe } from '@/lib/stripe';
import { db, dbReady } from '@/lib/db';
import { createTenantDb } from '@/lib/tenantDb';
import { buildCustomPlanCapabilities, PLAN_CAPABILITIES } from '@/lib/capabilities';
import { PRICE_ID_TO_PLAN, PRICE_ID_TO_BUNDLE, type BundleId } from '@/lib/constants';
import type Stripe from 'stripe';

export async function POST(request: Request) {
  if (!process.env.STRIPE_SECRET_KEY) {
    return new Response('Stripe is not configured on this deployment.', { status: 501 });
  }
  const body = await request.text();
  const signature = request.headers.get('stripe-signature');

  if (!signature) {
    return new Response('Missing stripe-signature header', { status: 400 });
  }

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch (error) {
    console.error('[stripe-webhook] Signature verification failed:', error);
    return new Response('Webhook signature verification failed', { status: 400 });
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session);
        break;
      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
        break;
      case 'customer.subscription.updated':
        await handleSubscriptionUpdated(event.data.object as Stripe.Subscription);
        break;
      case 'invoice.payment_succeeded':
        console.log('[stripe-webhook] Renewal payment succeeded:', (event.data.object as Stripe.Invoice).id);
        break;
      case 'invoice.payment_failed':
        await handlePaymentFailed(event.data.object as Stripe.Invoice);
        break;
      default:
        console.log(`[stripe-webhook] Unhandled event: ${event.type}`);
    }

    return new Response('OK', { status: 200 });
  } catch (error) {
    console.error('[stripe-webhook] Handler error:', error);
    // Always return 200 to prevent Stripe retrying on handler errors
    return new Response('OK', { status: 200 });
  }
}

async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  const accountId = session.metadata?.account_id;
  const planId = session.metadata?.plan_id;
  const billingInterval = session.metadata?.billing_interval;

  if (!accountId || !planId) {
    console.error('[stripe-webhook] Missing metadata on session:', session.id);
    return;
  }

  // Retrieve full session with line items expanded to see exactly what was purchased
  const fullSession = await stripe.checkout.sessions.retrieve(session.id, {
    expand: ['line_items'],
  });

  const purchasedPriceIds = (fullSession.line_items?.data ?? [])
    .map(item => item.price?.id)
    .filter(Boolean) as string[];

  let capabilities: ReturnType<typeof buildCustomPlanCapabilities>;
  let resolvedPlanId: string;
  let purchasedBundles: BundleId[] = [];

  if (planId === 'custom') {
    purchasedBundles = purchasedPriceIds
      .map(priceId => PRICE_ID_TO_BUNDLE[priceId])
      .filter(Boolean) as BundleId[];

    capabilities = buildCustomPlanCapabilities(purchasedBundles);
    resolvedPlanId = 'custom';

    console.log('[stripe-webhook] Custom plan bundles purchased:', purchasedBundles);
  } else {
    const tierPlanId = PRICE_ID_TO_PLAN[purchasedPriceIds[0]] ?? planId;
    capabilities =
      PLAN_CAPABILITIES[tierPlanId as keyof typeof PLAN_CAPABILITIES] ??
      PLAN_CAPABILITIES.essentials;
    resolvedPlanId = tierPlanId;
  }

  const activatedAt = new Date().toISOString();
  const capabilitiesJson = JSON.stringify(capabilities);
  const purchasedBundlesJson = purchasedBundles.length > 0 ? JSON.stringify(purchasedBundles) : null;

  await dbReady;

  // Update master accounts table
  await db.execute({
    sql: `UPDATE accounts SET
      plan_id = ?,
      trial_expires_at = NULL,
      grace_period_ends_at = NULL,
      activated_plan_at = ?,
      stripe_customer_id = ?,
      stripe_subscription_id = ?,
      billing_interval = ?,
      purchased_bundles = ?,
      updated_at = ?
      WHERE id = ?`,
    args: [
      resolvedPlanId,
      activatedAt,
      session.customer as string,
      session.subscription as string,
      billingInterval ?? null,
      purchasedBundlesJson,
      activatedAt,
      accountId,
    ],
  });

  // Update tenant DB site_settings to clear trial state
  try {
    const accountRow = await db.execute({
      sql: 'SELECT turso_db_url, turso_auth_token FROM accounts WHERE id = ?',
      args: [accountId],
    });
    const tursoDbUrl = String(accountRow.rows[0]?.turso_db_url ?? '');
    const tursoAuthToken = String(accountRow.rows[0]?.turso_auth_token ?? '');

    if (tursoDbUrl && tursoAuthToken) {
      const tenantDb = createTenantDb(tursoDbUrl, tursoAuthToken);
      const upsert = (key: string, value: string | null) =>
        tenantDb.execute({
          sql: `INSERT INTO site_settings (key, value) VALUES (?, ?)
                ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
          args: [key, value ?? ''],
        });

      await Promise.all([
        upsert('plan_id', resolvedPlanId),
        upsert('plan_capabilities', capabilitiesJson),
        upsert('trial_expires_at', null),
        upsert('grace_period_ends_at', null),
        upsert('activated_plan_at', activatedAt),
      ]);
    }
  } catch (err) {
    console.error('[stripe-webhook] Failed to update tenant DB for account', accountId, err);
  }

  console.log(`[stripe-webhook] Account ${accountId} upgraded to ${resolvedPlanId}`);
}

async function handleSubscriptionDeleted(subscription: Stripe.Subscription) {
  const accountId = subscription.metadata?.account_id;
  if (!accountId) return;

  await dbReady;

  await db.execute({
    sql: `UPDATE accounts SET
      plan_id = 'cancelled',
      stripe_subscription_id = NULL,
      purchased_bundles = NULL,
      updated_at = ?
      WHERE id = ?`,
    args: [new Date().toISOString(), accountId],
  });

  // Update tenant DB
  try {
    const accountRow = await db.execute({
      sql: 'SELECT turso_db_url, turso_auth_token FROM accounts WHERE id = ?',
      args: [accountId],
    });
    const tursoDbUrl = String(accountRow.rows[0]?.turso_db_url ?? '');
    const tursoAuthToken = String(accountRow.rows[0]?.turso_auth_token ?? '');

    if (tursoDbUrl && tursoAuthToken) {
      const tenantDb = createTenantDb(tursoDbUrl, tursoAuthToken);
      const capsJson = JSON.stringify(PLAN_CAPABILITIES.read_only);
      await Promise.all([
        tenantDb.execute({
          sql: `INSERT INTO site_settings (key, value) VALUES ('plan_id', 'cancelled')
                ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
          args: [],
        }),
        tenantDb.execute({
          sql: `INSERT INTO site_settings (key, value) VALUES ('plan_capabilities', ?)
                ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
          args: [capsJson],
        }),
      ]);
    }
  } catch (err) {
    console.error('[stripe-webhook] Failed to update tenant DB on cancellation for account', accountId, err);
  }

  console.log(`[stripe-webhook] Subscription cancelled for account ${accountId}`);
}

async function handleSubscriptionUpdated(subscription: Stripe.Subscription) {
  const accountId = subscription.metadata?.account_id;
  if (!accountId) return;
  console.log(`[stripe-webhook] Subscription updated for account ${accountId}`);
}

async function handlePaymentFailed(invoice: Stripe.Invoice) {
  const customerId = invoice.customer as string;
  if (!customerId) return;

  await dbReady;
  const accountRow = await db.execute({
    sql: 'SELECT id FROM accounts WHERE stripe_customer_id = ?',
    args: [customerId],
  });

  if (!accountRow.rows[0]) return;

  const accountId = String(accountRow.rows[0].id);
  console.error(`[stripe-webhook] Payment failed for account ${accountId}, invoice ${invoice.id}`);
}
