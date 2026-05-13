import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { stripe } from '@/lib/stripe';
import { db, dbReady } from '@/lib/db';

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL ?? 'http://localhost:3000';

export async function POST(request: NextRequest) {
  const user = await requireAuth(request);
  if (user instanceof NextResponse) return user;

  if (!user.accountId) {
    return NextResponse.json({ error: 'No account associated with this session' }, { status: 400 });
  }

  try {
    await dbReady;
    const accountRes = await db.execute({
      sql: 'SELECT stripe_customer_id FROM accounts WHERE id = ?',
      args: [user.accountId],
    });

    const customerId = accountRes.rows[0]?.stripe_customer_id
      ? String(accountRes.rows[0].stripe_customer_id)
      : null;

    if (!customerId) {
      return NextResponse.json({ error: 'No billing account found' }, { status: 400 });
    }

    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${BASE_URL}/admin`,
    });

    return NextResponse.json({ url: session.url });
  } catch (error) {
    console.error('[create-portal-session] Error:', error);
    return NextResponse.json({ error: 'Failed to create portal session' }, { status: 500 });
  }
}
