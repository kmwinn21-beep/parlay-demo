import { db, dbReady } from '@/lib/db';
import { PLAN_CAPABILITIES, type PlanCapabilities, type PlanId } from '@/lib/capabilities';

export type TrialState = 'active' | 'grace' | 'expired' | 'activated';

export interface PlanState {
  planId: PlanId;
  trialState: TrialState;
  daysRemaining: number | null;
  planCapabilities: PlanCapabilities;
}

export async function resolvePlanState(): Promise<PlanState> {
  await dbReady;
  const rows = await db.execute({
    sql: `SELECT key, value FROM site_settings WHERE key IN ('plan_id','trial_expires_at','grace_period_ends_at','plan_capabilities','activated_plan_at')`,
    args: [],
  });
  const s = Object.fromEntries(rows.rows.map(r => [String(r.key), String(r.value ?? '')]));

  const rawPlanId = (s['plan_id'] || 'trial') as PlanId;
  const trialExpiresAt = s['trial_expires_at'] || null;
  const gracePeriodEndsAt = s['grace_period_ends_at'] || null;
  const activatedPlanAt = s['activated_plan_at'] || null;

  // For custom plans, read per-account capability overrides from DB
  let planCapabilities = PLAN_CAPABILITIES[rawPlanId] ?? PLAN_CAPABILITIES['trial'];
  if (rawPlanId === 'custom' && s['plan_capabilities']) {
    try {
      planCapabilities = JSON.parse(s['plan_capabilities']) as PlanCapabilities;
    } catch { /* fall back to default custom caps */ }
  }

  // Existing accounts with no trial_expires_at = pre-trial-system, treat as activated
  if (!trialExpiresAt || activatedPlanAt) {
    return { planId: rawPlanId, trialState: 'activated', daysRemaining: null, planCapabilities };
  }

  const now = new Date();
  const expires = new Date(trialExpiresAt);
  const grace = gracePeriodEndsAt ? new Date(gracePeriodEndsAt) : null;

  if (now < expires) {
    const ms = expires.getTime() - now.getTime();
    const daysRemaining = Math.ceil(ms / (1000 * 60 * 60 * 24));
    return { planId: rawPlanId, trialState: 'active', daysRemaining, planCapabilities };
  } else if (grace && now < grace) {
    return {
      planId: 'read_only',
      trialState: 'grace',
      daysRemaining: 0,
      planCapabilities: PLAN_CAPABILITIES['read_only'],
    };
  } else {
    return {
      planId: 'expired',
      trialState: 'expired',
      daysRemaining: null,
      planCapabilities: PLAN_CAPABILITIES['expired'],
    };
  }
}
