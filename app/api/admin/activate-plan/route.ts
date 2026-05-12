import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { getDb } from '@/lib/getDb';
import { enforceBundleDependencies, type PlanCapabilities, type PlanId } from '@/lib/capabilities';

const VALID_PLAN_IDS: PlanId[] = ['essentials', 'professional', 'enterprise', 'custom'];

export async function POST(request: NextRequest) {
  const authResult = await requireAdmin(request);
  if (authResult instanceof NextResponse) return authResult;
  const db = await getDb(authResult?.accountId);

  let body: { planId?: string; planCapabilities?: PlanCapabilities };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const planId = body.planId as PlanId | undefined;
  if (!planId || !VALID_PLAN_IDS.includes(planId)) {
    return NextResponse.json({ error: 'Invalid planId. Must be essentials, professional, enterprise, or custom.' }, { status: 400 });
  }

  const updates: Array<[string, string]> = [
    ['plan_id', planId],
    ['activated_plan_at', new Date().toISOString()],
    ['trial_expires_at', ''],
    ['grace_period_ends_at', ''],
  ];

  if (planId === 'custom' && body.planCapabilities) {
    const enforced = enforceBundleDependencies(body.planCapabilities);
    updates.push(['plan_capabilities', JSON.stringify(enforced)]);
  }

  await Promise.all(
    updates.map(([key, value]) =>
      db.execute({
        sql: `INSERT OR REPLACE INTO site_settings (key, value) VALUES (?, ?)`,
        args: [key, value],
      })
    )
  );

  return NextResponse.json({ success: true, planId, message: `Plan activated: ${planId}` });
}
