import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { stripe } from '@/lib/stripe';
import { db, dbReady } from '@/lib/db';
import {
  STRIPE_TIER_PRICES,
  STRIPE_BUNDLE_PRICES,
  type CheckoutPlanId,
  type BillingInterval,
  type BundleId,
} from '@/lib/constants';

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL ?? 'http://localhost:3000';

export async function POST(request: NextRequest) {
  const user = await requireAuth(request);
  if (user instanceof NextResponse) return user;

  if (!user.accountId) {
    return NextResponse.json({ error: 'No account associated with this session' }, { status: 400 });
  }

  try {
    const body = await request.json() as {
      planId: CheckoutPlanId;
      billingInterval: BillingInterval;
      selectedBundles?: BundleId[];
    };

    const { planId, billingInterval, selectedBundles } = body;

    if (!planId || !billingInterval) {
      return NextResponse.json({ error: 'planId and billingInterval are required' }, { status: 400 });
    }

    await dbReady;
    const accountRes = await db.execute({
      sql: 'SELECT id, admin_email, stripe_customer_id FROM accounts WHERE id = ?',
      args: [user.accountId],
    });

    if (!accountRes.rows[0]) {
      return NextResponse.json({ error: 'Account not found' }, { status: 404 });
    }

    const account = accountRes.rows[0];

    // Get or create Stripe customer
    let customerId = account.stripe_customer_id ? String(account.stripe_customer_id) : null;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: String(account.admin_email),
        metadata: { account_id: user.accountId },
      });
      customerId = customer.id;
      await db.execute({
        sql: 'UPDATE accounts SET stripe_customer_id = ? WHERE id = ?',
        args: [customerId, user.accountId],
      });
    }

    const successUrl = `${BASE_URL}/?upgraded=true&plan=${planId}`;
    const cancelUrl = `${BASE_URL}/?checkout=cancelled`;

    let session;

    if (planId === 'custom' && selectedBundles && selectedBundles.length > 0) {
      const optionalItems = selectedBundles.map(bundleId => ({
        price: STRIPE_BUNDLE_PRICES[bundleId][billingInterval],
        quantity: 1,
      }));

      session = await stripe.checkout.sessions.create({
        customer: customerId,
        mode: 'subscription',
        payment_method_types: ['card'],
        line_items: [
          {
            price: STRIPE_TIER_PRICES.essentials[billingInterval],
            quantity: 1,
          },
        ],
        optional_items: optionalItems,
        metadata: {
          account_id: user.accountId,
          plan_id: 'custom',
          billing_interval: billingInterval,
          selected_bundles: JSON.stringify(selectedBundles),
        },
        subscription_data: {
          metadata: {
            account_id: user.accountId,
            plan_id: 'custom',
          },
        },
        success_url: successUrl,
        cancel_url: cancelUrl,
        allow_promotion_codes: true,
      });
    } else {
      const tierPlanId = planId as Exclude<CheckoutPlanId, 'custom'>;
      const priceId = STRIPE_TIER_PRICES[tierPlanId]?.[billingInterval];
      if (!priceId) {
        return NextResponse.json({ error: 'Invalid plan or billing interval' }, { status: 400 });
      }

      session = await stripe.checkout.sessions.create({
        customer: customerId,
        mode: 'subscription',
        payment_method_types: ['card'],
        line_items: [{ price: priceId, quantity: 1 }],
        metadata: {
          account_id: user.accountId,
          plan_id: planId,
          billing_interval: billingInterval,
        },
        subscription_data: {
          metadata: {
            account_id: user.accountId,
            plan_id: planId,
          },
        },
        success_url: successUrl,
        cancel_url: cancelUrl,
        allow_promotion_codes: true,
      });
    }

    return NextResponse.json({ url: session.url });
  } catch (error) {
    console.error('[create-checkout-session] Error:', error);
    return NextResponse.json({ error: 'Failed to create checkout session' }, { status: 500 });
  }
}
