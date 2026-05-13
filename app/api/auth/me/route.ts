import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser, resolveCapabilities, DEFAULT_ROLE_CAPABILITIES } from '@/lib/auth';
import { db, dbReady } from '@/lib/db';
import { resolvePlanState } from '@/lib/trialState';
import { getDb } from '@/lib/getDb';
import { PLAN_CAPABILITIES, type PlanId } from '@/lib/capabilities';

export async function GET(request: NextRequest) {
  const user = await getSessionUser(request);
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });
  }

  // Check for active impersonation session (forwarded by middleware)
  const impersonationId = request.headers.get('x-ops-impersonation-id');
  if (impersonationId) {
    await dbReady;
    const sessionRow = await db.execute({
      sql: `SELECT account_id FROM impersonation_sessions WHERE id = ? AND ended_at IS NULL AND last_active_at > datetime('now', '-60 minutes')`,
      args: [impersonationId],
    });
    if (sessionRow.rows[0]) {
      const accountId = String(sessionRow.rows[0].account_id);
      db.execute({ sql: `UPDATE impersonation_sessions SET last_active_at = datetime('now') WHERE id = ?`, args: [impersonationId] }).catch(() => {});
      const accountRow = await db.execute({
        sql: `SELECT plan_id, trial_expires_at, grace_period_ends_at, activated_plan_at, company_name FROM accounts WHERE id = ?`,
        args: [accountId],
      });
      if (accountRow.rows[0]) {
        const row = accountRow.rows[0];
        const planId = (String(row.plan_id || 'trial')) as PlanId;
        const planCapabilities = PLAN_CAPABILITIES[planId] ?? PLAN_CAPABILITIES['trial'];
        const trialExpiresAt = row.trial_expires_at ? String(row.trial_expires_at) : null;
        const gracePeriodEndsAt = row.grace_period_ends_at ? String(row.grace_period_ends_at) : null;
        const activatedPlanAt = row.activated_plan_at ? String(row.activated_plan_at) : null;

        let trialState: 'active' | 'grace' | 'expired' | 'activated' = 'activated';
        let daysRemaining: number | null = null;
        if (!trialExpiresAt || activatedPlanAt) {
          trialState = 'activated';
        } else {
          const now = new Date();
          const expires = new Date(trialExpiresAt);
          const grace = gracePeriodEndsAt ? new Date(gracePeriodEndsAt) : null;
          if (now < expires) {
            const ms = expires.getTime() - now.getTime();
            daysRemaining = Math.ceil(ms / (1000 * 60 * 60 * 24));
            trialState = 'active';
          } else if (grace && now < grace) {
            trialState = 'grace';
          } else {
            trialState = 'expired';
          }
        }

        return NextResponse.json({
          user: {
            ...user,
            isImpersonating: true,
            impersonatedAccountId: accountId,
            impersonatedCompanyName: String(row.company_name || ''),
            planId,
            trialState,
            daysRemaining,
            planCapabilities,
          },
        });
      }
    }
    // Session expired/invalid — clear cookie
    const response = NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });
    response.cookies.set({ name: 'ops_impersonation', value: '', httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: 0 });
    return response;
  }

  try {
    const tenantDb = await getDb(user.accountId);
    const [r, capsRow, planState] = await Promise.all([
      tenantDb.execute({
        sql: `SELECT u.config_id, u.display_name, co.value as rep_name, u.created_at, u.first_name
              FROM users u
              LEFT JOIN config_options co ON u.config_id = co.id
              WHERE u.id = ?`,
        args: [user.id],
      }),
      tenantDb.execute({
        sql: `SELECT value FROM site_settings WHERE key = 'role_capabilities'`,
        args: [],
      }),
      resolvePlanState(tenantDb === db ? undefined : tenantDb),
    ]);
    const configId = r.rows[0]?.config_id != null ? Number(r.rows[0].config_id) : null;
    const displayName = r.rows[0]?.display_name != null ? String(r.rows[0].display_name) : null;
    const repName = r.rows[0]?.rep_name != null ? String(r.rows[0].rep_name) : null;
    const createdAt = r.rows[0]?.created_at != null ? String(r.rows[0].created_at) : null;
    const firstName = r.rows[0]?.first_name != null ? String(r.rows[0].first_name) : null;

    let stored = {};
    try { stored = capsRow.rows[0]?.value ? JSON.parse(String(capsRow.rows[0].value)) : {}; } catch { /* ignore */ }
    const capabilities = resolveCapabilities(user.role, stored);

    const bypassSecret = process.env.DEMO_BYPASS_SECRET;
    const bypassCookie = request.cookies.get('demo_bypass')?.value;
    const hasBypass = !!bypassSecret && bypassCookie === bypassSecret;
    const demoVisitor = process.env.NEXT_PUBLIC_DEMO_MODE === 'true' && !hasBypass;

    return NextResponse.json({
      user: {
        ...user,
        configId, displayName, repName, createdAt, firstName,
        capabilities, demoVisitor,
        planId: planState.planId,
        trialState: planState.trialState,
        daysRemaining: planState.daysRemaining,
        planCapabilities: planState.planCapabilities,
      },
    });
  } catch {
    const capabilities = DEFAULT_ROLE_CAPABILITIES[user.role] ?? DEFAULT_ROLE_CAPABILITIES['user'];
    return NextResponse.json({ user: { ...user, capabilities } });
  }
}
