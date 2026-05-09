import { NextRequest, NextResponse } from 'next/server';
import { requireOpsAdmin } from '@/lib/opsAuth';
import { db, dbReady } from '@/lib/db';

export async function GET(request: NextRequest) {
  const auth = await requireOpsAdmin(request);
  if (auth instanceof NextResponse) return auth;

  await dbReady;

  const [accountsRes, metricsRes] = await Promise.all([
    db.execute({
      sql: `SELECT id, company_name, admin_email, admin_first_name, admin_last_name,
                   plan_id, trial_expires_at, grace_period_ends_at, activated_plan_at,
                   onboarding_track, onboarding_completed, deployment_url,
                   last_active_at, created_at
            FROM accounts
            ORDER BY created_at DESC`,
      args: [],
    }),
    db.execute({
      sql: `SELECT
              COUNT(*) as total,
              SUM(CASE WHEN plan_id = 'trial' AND trial_expires_at > datetime('now') THEN 1 ELSE 0 END) as active_trials,
              SUM(CASE WHEN plan_id = 'trial' AND trial_expires_at < datetime('now') AND grace_period_ends_at > datetime('now') THEN 1 ELSE 0 END) as grace_period,
              SUM(CASE WHEN plan_id IN ('essentials','professional','enterprise') AND activated_plan_at IS NOT NULL AND activated_plan_at != '' THEN 1 ELSE 0 END) as converted
            FROM accounts`,
      args: [],
    }),
  ]);

  const metrics = metricsRes.rows[0];
  return NextResponse.json({
    accounts: accountsRes.rows,
    metrics: {
      total: Number(metrics?.total ?? 0),
      activeTrials: Number(metrics?.active_trials ?? 0),
      gracePeriod: Number(metrics?.grace_period ?? 0),
      converted: Number(metrics?.converted ?? 0),
    },
  });
}
