import { NextRequest, NextResponse } from 'next/server';
import { requireOpsAdmin } from '@/lib/opsAuth';
import { db, dbReady } from '@/lib/db';
import { createTenantDb } from '@/lib/tenantDb';

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireOpsAdmin(request);
  if (auth instanceof NextResponse) return auth;

  const body = await request.json() as { action: 'extend' | 'expire'; days?: number };

  if (!['extend', 'expire'].includes(body.action)) {
    return NextResponse.json({ error: 'Invalid action.' }, { status: 400 });
  }

  await dbReady;

  const accountRes = await db.execute({
    sql: `SELECT trial_expires_at, turso_db_url, turso_auth_token FROM accounts WHERE id = ?`,
    args: [params.id],
  });

  if (!accountRes.rows[0]) {
    return NextResponse.json({ error: 'Account not found.' }, { status: 404 });
  }

  const now = new Date();
  let newTrialExpires: string;
  let newGraceEnds: string;
  let action: string;
  let previousValue: string;
  let newValue: string;

  if (body.action === 'expire') {
    newTrialExpires = new Date(now.getTime() - 1000).toISOString();
    newGraceEnds = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000).toISOString();
    action = 'trial_expire';
    previousValue = String(accountRes.rows[0].trial_expires_at ?? '');
    newValue = newTrialExpires;
  } else {
    const days = Math.max(1, Math.min(365, Number(body.days ?? 7)));
    const currentExpiry = accountRes.rows[0].trial_expires_at
      ? new Date(String(accountRes.rows[0].trial_expires_at))
      : now;
    // If trial already expired, extend from now
    const base = currentExpiry < now ? now : currentExpiry;
    newTrialExpires = new Date(base.getTime() + days * 24 * 60 * 60 * 1000).toISOString();
    newGraceEnds = new Date(new Date(newTrialExpires).getTime() + 2 * 24 * 60 * 60 * 1000).toISOString();
    action = 'trial_extend';
    previousValue = String(accountRes.rows[0].trial_expires_at ?? '');
    newValue = `${newTrialExpires} (+${days}d)`;
  }

  await db.execute({
    sql: `UPDATE accounts SET trial_expires_at = ?, grace_period_ends_at = ?, updated_at = ? WHERE id = ?`,
    args: [newTrialExpires, newGraceEnds, now.toISOString(), params.id],
  });

  await db.execute({
    sql: `INSERT INTO admin_audit_log (admin_user_id, account_id, action, previous_value, new_value) VALUES (?, ?, ?, ?, ?)`,
    args: [auth.userId, params.id, action, previousValue, newValue],
  });

  // Update tenant DB site_settings
  const tursoDbUrl = String(accountRes.rows[0].turso_db_url ?? '');
  const tursoAuthToken = String(accountRes.rows[0].turso_auth_token ?? '');
  if (tursoDbUrl && tursoAuthToken) {
    try {
      const tenantDb = createTenantDb(tursoDbUrl, tursoAuthToken);
      await Promise.all([
        tenantDb.execute({ sql: `INSERT OR REPLACE INTO site_settings (key, value) VALUES ('trial_expires_at', ?)`, args: [newTrialExpires] }),
        tenantDb.execute({ sql: `INSERT OR REPLACE INTO site_settings (key, value) VALUES ('grace_period_ends_at', ?)`, args: [newGraceEnds] }),
      ]);
    } catch { /* tenant DB unavailable */ }
  }

  return NextResponse.json({ success: true, trialExpiresAt: newTrialExpires, gracePeriodEndsAt: newGraceEnds });
}
