import { NextRequest, NextResponse } from 'next/server';
import { requireOpsAdmin } from '@/lib/opsAuth';
import { db, dbReady } from '@/lib/db';
import { PLAN_CAPABILITIES, type PlanId } from '@/lib/capabilities';
import { createTenantDb } from '@/lib/tenantDb';

const VALID_PLAN_IDS: PlanId[] = ['trial', 'essentials', 'professional', 'enterprise'];

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireOpsAdmin(request);
  if (auth instanceof NextResponse) return auth;

  const body = await request.json() as { planId?: string };
  const planId = body.planId as PlanId | undefined;

  if (!planId || !VALID_PLAN_IDS.includes(planId)) {
    return NextResponse.json({ error: 'Invalid planId.' }, { status: 400 });
  }

  await dbReady;

  const accountRes = await db.execute({
    sql: `SELECT plan_id, turso_db_url, turso_auth_token FROM accounts WHERE id = ?`,
    args: [params.id],
  });

  if (!accountRes.rows[0]) {
    return NextResponse.json({ error: 'Account not found.' }, { status: 404 });
  }

  const previousPlan = String(accountRes.rows[0].plan_id ?? 'trial');
  const now = new Date().toISOString();
  const activatedAt = planId !== 'trial' ? now : '';

  // Update accounts table
  await db.execute({
    sql: `UPDATE accounts SET plan_id = ?, activated_plan_at = ?, updated_at = ? WHERE id = ?`,
    args: [planId, activatedAt, now, params.id],
  });

  // Audit log
  await db.execute({
    sql: `INSERT INTO admin_audit_log (admin_user_id, account_id, action, previous_value, new_value) VALUES (?, ?, 'plan_change', ?, ?)`,
    args: [auth.userId, params.id, previousPlan, planId],
  });

  // Update tenant DB site_settings if credentials available
  const tursoDbUrl = String(accountRes.rows[0].turso_db_url ?? '');
  const tursoAuthToken = String(accountRes.rows[0].turso_auth_token ?? '');
  if (tursoDbUrl && tursoAuthToken) {
    try {
      const tenantDb = createTenantDb(tursoDbUrl, tursoAuthToken);
      const capJson = JSON.stringify(PLAN_CAPABILITIES[planId] ?? PLAN_CAPABILITIES['trial']);
      await Promise.all([
        tenantDb.execute({ sql: `INSERT OR REPLACE INTO site_settings (key, value) VALUES ('plan_id', ?)`, args: [planId] }),
        tenantDb.execute({ sql: `INSERT OR REPLACE INTO site_settings (key, value) VALUES ('plan_capabilities', ?)`, args: [capJson] }),
        tenantDb.execute({ sql: `INSERT OR REPLACE INTO site_settings (key, value) VALUES ('activated_plan_at', ?)`, args: [activatedAt] }),
      ]);
    } catch { /* tenant DB unavailable — accounts table updated, continue */ }
  }

  return NextResponse.json({ success: true, planId });
}
