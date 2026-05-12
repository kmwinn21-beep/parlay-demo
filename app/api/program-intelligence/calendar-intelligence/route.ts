import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { db, dbReady } from '@/lib/db';
import type { InValue } from '@libsql/client';
import { assembleFinalScore } from '@/lib/scoring/calendar-intelligence';
import type { ComponentScores } from '@/lib/scoring/calendar-intelligence';

export const dynamic = 'force-dynamic';

// Determined by auditing the codebase — do not change without updating the source
const HISTORICAL_CONFERENCE_TYPE = 1;
const ACTIVE_CONFERENCE_TYPE = 0;

type Row = Record<string, unknown>;

async function tableExists(name: string): Promise<boolean> {
  try {
    const res = await db.execute({ sql: `SELECT name FROM sqlite_master WHERE type='table' AND name=?`, args: [name] });
    return (res.rows as Row[]).length > 0;
  } catch {
    return false;
  }
}

async function runLoggedQuery(label: string, sql: string, args: InValue[] = []): Promise<Row[]> {
  const result = await db.execute({ sql, args });
  const rows = result.rows as Row[];
  console.info(`[calendar-intelligence] ${label} rows`, rows.length);
  if (rows.length) console.info(`[calendar-intelligence] ${label} first_row`, rows[0]);
  return rows;
}

function determineRecommendationTier(
  score: number | null,
  componentScores: ComponentScores,
  confidenceMultiplier: number,
  dataAge: number,
  hasEngagementData: boolean,
): string {
  if (score === null) return 'evaluate_before_committing';
  if (dataAge > 3) return 'evaluate_before_committing';

  if (confidenceMultiplier < 0.67) {
    return score < 30 ? 'do_not_prioritize' : 'evaluate_before_committing';
  }

  const af = componentScores.audienceFit ?? 0;
  const to = componentScores.targetOpportunity ?? 0;
  const cj = componentScores.costJustification ?? 0;

  if (score >= 85 && af >= 75 && to >= 75 && cj >= 60) return 'attend_invest_more';
  if (score >= 70 && af >= 65 && to >= 60) return 'attend_maintain';
  if (af >= 65 && to >= 60 && cj < 60) return 'attend_reconsider_format';
  if (score < 40 || ((componentScores.audienceFit ?? 100) < 45 && (componentScores.targetOpportunity ?? 100) < 45)) {
    return hasEngagementData ? 'remove_from_calendar' : 'do_not_prioritize';
  }
  return 'evaluate_before_committing';
}

export async function GET(request: NextRequest) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  await dbReady;

  const [settingsRes, actionsRes, res] = await Promise.all([
    db.execute({ sql: `SELECT key, value FROM site_settings WHERE key IN ('tier_must_target_conversion','tier_high_priority_conversion','tier_worth_engaging_conversion')`, args: [] }),
    db.execute({ sql: "SELECT id, action_key, is_actionable FROM config_options WHERE category='target_recommended_action' ORDER BY sort_order, id", args: [] }).catch(() => ({ rows: [] as Row[] })),
    db.execute({
      sql: `WITH conf AS (
              SELECT c.id, c.name, c.end_date, COALESCE(c.is_historical, 0) AS is_historical,
                     COUNT(ca.attendee_id) AS attendee_count
              FROM conferences c
              LEFT JOIN conference_attendees ca ON ca.conference_id = c.id
              WHERE date(c.end_date) <= date('now')
              GROUP BY c.id
            ), cmp AS (
              SELECT ca.conference_id,
                     COUNT(DISTINCT a.company_id) AS total_companies,
                     COUNT(DISTINCT CASE WHEN LOWER(COALESCE(co.value, c.icp, '')) IN ('yes','true') THEN a.company_id END) AS icp_companies
              FROM conference_attendees ca
              JOIN attendees a ON a.id = ca.attendee_id
              LEFT JOIN companies c ON c.id = a.company_id
              LEFT JOIN config_options co ON co.id = c.icp
              GROUP BY ca.conference_id
            )
            SELECT conf.*, COALESCE(cmp.total_companies,0) AS total_companies,
                   COALESCE(cmp.icp_companies,0) AS icp_companies
            FROM conf
            LEFT JOIN cmp ON cmp.conference_id = conf.id
            ORDER BY date(conf.end_date) DESC`,
      args: [],
    }),
  ]);

  const settings: Record<string, string> = {};
  for (const x of settingsRes.rows as Row[]) settings[String(x.key)] = String(x.value ?? '');
  const actions = actionsRes.rows as Row[];
  const actionableCount = actions.filter(a => Number(a.is_actionable ?? 0) === 1).length;

  const mustConv = Number(settings['tier_must_target_conversion'] ?? '25') / 100 || 0.25;
  const highConv = Number(settings['tier_high_priority_conversion'] ?? '15') / 100 || 0.15;
  const worthConv = Number(settings['tier_worth_engaging_conversion'] ?? '7.5') / 100 || 0.075;

  const avgCostRows = await db.execute({ sql: `SELECT value FROM effectiveness_defaults WHERE key = 'avg_cost_per_unit'`, args: [] }).catch(() => ({ rows: [] as Row[] }));
  const avgCostPerUnit = Number((avgCostRows as { rows: Row[] }).rows[0]?.value ?? 0) || 0;

  const budgetTable = await tableExists('conference_budget') ? 'conference_budget' : (await tableExists('conference_budgets') ? 'conference_budgets' : null);

  const conferences = await Promise.all((res.rows as Row[]).map(async (r) => {
    const totalCompanies = Number(r.total_companies ?? 0);
    const icpCompanies = Number(r.icp_companies ?? 0);
    const attendeeCount = Number(r.attendee_count ?? 0);
    const endDate = new Date(String(r.end_date));
    const dataAge = Math.max(0, (Date.now() - endDate.getTime()) / (365.25 * 24 * 60 * 60 * 1000));
    const conferenceId = Number(r.id);

    // --- Component 1: Audience Fit ---
    const audienceFitScore: number | null = totalCompanies > 0
      ? Math.round(Math.min((icpCompanies / totalCompanies) / 0.15, 1) * 100)
      : null;

    // --- Component 2: Target Opportunity — computed by per-conference scoring endpoint ---
    const targetOpportunityScore: number | null = null;

    // --- Component 3: Engagement Capture ---
    const meetingsRows = await runLoggedQuery('engagement-meetings', `SELECT COUNT(*) AS total_meetings FROM meetings WHERE conference_id = ?`, [conferenceId]).catch(() => []);
    const followUpRows = await runLoggedQuery('engagement-followups', `SELECT COUNT(*) AS total_followups, SUM(CASE WHEN COALESCE(completed,0)=1 THEN 1 ELSE 0 END) AS completed_followups FROM follow_ups WHERE conference_id = ?`, [conferenceId]).catch(() => []);
    const emRow = meetingsRows[0];
    const efRow = followUpRows[0];
    const totalMeetings = Number(emRow?.total_meetings ?? 0);
    const totalFollowups = Number(efRow?.total_followups ?? 0);
    const completedFollowups = Number(efRow?.completed_followups ?? 0);
    const meetingRate = attendeeCount > 0 ? totalMeetings / attendeeCount : 0;
    const followupRate = totalFollowups > 0 ? completedFollowups / totalFollowups : null;
    const engagementCaptureScore: number | null = emRow != null
      ? Math.min(Math.round((meetingRate / 0.3) * 70 + (followupRate != null ? followupRate * 30 : 15)), 100)
      : null;

    // --- Commercial Potential: projected pipeline via target WSE * avg_cost_per_unit ---
    const TIER_PRIORITY: Record<string, number> = { '1': 0, '2': 1, '3': 2, 'unassigned': 3 };
    const companyBestTier = new Map<number, { tier: string; wse: number }>();
    const commercialByCompany = await runLoggedQuery('commercial-by-company', `
      SELECT ct.tier, a.company_id, MAX(CAST(c.wse AS REAL)) AS wse
      FROM conference_targets ct
      JOIN attendees a ON a.id = ct.attendee_id
      JOIN companies c ON c.id = a.company_id
      WHERE ct.conference_id = ? AND c.wse IS NOT NULL AND c.wse > 0
      GROUP BY a.company_id, ct.tier`, [conferenceId]).catch(() => []);
    for (const row of commercialByCompany as Row[]) {
      const compId = Number(row.company_id);
      const tier = String(row.tier ?? 'unassigned');
      const wse = Number(row.wse ?? 0);
      const existing = companyBestTier.get(compId);
      if (!existing || (TIER_PRIORITY[tier] ?? 99) < (TIER_PRIORITY[existing.tier] ?? 99)) {
        companyBestTier.set(compId, { tier, wse });
      }
    }
    let mustWse = 0, highWse = 0, worthWse = 0;
    for (const { tier, wse } of Array.from(companyBestTier.values())) {
      if (tier === '1') mustWse += wse;
      else if (tier === '2') highWse += wse;
      else if (tier === '3') worthWse += wse;
    }
    const projectedPipeline = avgCostPerUnit > 0
      ? Math.round((mustWse * mustConv + highWse * highConv + worthWse * worthConv) * avgCostPerUnit)
      : null;

    // --- Component 4: Cost Justification + Component 5: Commercial Potential ---
    const budgetRows = budgetTable ? await runLoggedQuery('cost-budget', `SELECT line_items, return_on_cost, required_pipeline_amount, required_pipeline_multiple FROM ${budgetTable} WHERE conference_id = ? LIMIT 1`, [conferenceId]).catch(() => []) : [];
    const budgetRow = budgetRows[0];
    const reqPipeline = Number(budgetRow?.required_pipeline_amount ?? 0);
    const commercialPotentialScore: number | null = projectedPipeline != null && reqPipeline > 0
      ? Math.min(Math.round((projectedPipeline / reqPipeline) * 100), 100)
      : null;
    const costJustificationScore: number | null = budgetRow != null && reqPipeline > 0
      ? Math.min(Math.round((projectedPipeline ?? 0) / reqPipeline * 100), 100)
      : (budgetRow != null ? 50 : null);

    // --- Component 6: Strategic Value — computed by per-conference scoring endpoint ---
    const strategicValueScore: number | null = null;

    const componentScores: ComponentScores = {
      audienceFit: audienceFitScore,
      targetOpportunity: targetOpportunityScore,
      engagementCapture: engagementCaptureScore,
      commercialPotential: commercialPotentialScore,
      costJustification: costJustificationScore,
      strategicValue: strategicValueScore,
    };

    const { score: finalScore, confidenceMultiplier, availableComponentCount, totalComponentCount, maxPossibleScore } =
      assembleFinalScore(componentScores);

    const hasEngagementData = emRow != null && totalMeetings > 0;
    const recommendationTier = determineRecommendationTier(
      finalScore,
      componentScores,
      confidenceMultiplier,
      dataAge,
      hasEngagementData,
    );

    return {
      conferenceId,
      conferenceName: String(r.name ?? ''),
      conferenceYear: endDate.getUTCFullYear(),
      conferenceType: Number(r.is_historical) === HISTORICAL_CONFERENCE_TYPE ? 'historical' : 'active',
      attendeeCount,
      totalCompanies,
      icpCompanies,
      icpDensityPct: totalCompanies > 0 ? (icpCompanies / totalCompanies) * 100 : 0,
      calendarRecommendationScore: finalScore,
      componentScores,
      confidenceMultiplier,
      availableComponentCount,
      totalComponentCount,
      maxPossibleScore,
      recommendationTier,
      confidenceLevel: attendeeCount < 50 || dataAge > 4 ? 'low' : dataAge > 2 ? 'medium' : 'high',
      dataAge,
      recommendationReason: [
        `ICP density is ${(totalCompanies > 0 ? (icpCompanies / totalCompanies) * 100 : 0).toFixed(1)}% based on ${totalCompanies} companies.`,
      ],
      confidenceFactors: [
        ...(attendeeCount < 50 ? ['Attendee sample under 50 lowers confidence.'] : []),
        ...(availableComponentCount < 4 ? [`Score based on ${availableComponentCount} of 6 components — insufficient data for a high-confidence recommendation.`] : []),
      ],
      tierProbabilityFactors: { must: mustConv, high: highConv, worth: worthConv },
      actionableActionTypesConfigured: actionableCount,
      // targetingScored: false signals the UI that per-conference scoring is still pending
      targetingScored: false,
      diagnostics: {
        targetingEngine: null,
        engagementMeetings: meetingsRows[0] ?? null,
        engagementFollowUps: followUpRows[0] ?? null,
        budget: budgetRows[0] ?? null,
        commercialPotential: projectedPipeline != null ? { projected_pipeline: projectedPipeline, must_wse: mustWse, high_wse: highWse, worth_wse: worthWse, avg_cost_per_unit: avgCostPerUnit } : null,
      },
    };
  }));

  return NextResponse.json({ conferences, conferenceTypeConstants: { HISTORICAL_CONFERENCE_TYPE, ACTIVE_CONFERENCE_TYPE } });
}
