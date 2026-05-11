import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { db, dbReady } from '@/lib/db';

export const dynamic = 'force-dynamic';

// Determined by auditing the codebase — do not change without updating the source
const HISTORICAL_CONFERENCE_TYPE = 1;
const ACTIVE_CONFERENCE_TYPE = 0;

type Row = Record<string, unknown>;

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
  })
  ]);

  const settings: Record<string,string> = {}; for (const x of settingsRes.rows as Row[]) settings[String(x.key)] = String(x.value ?? '');
  const actions = actionsRes.rows as Row[];
  const conferences = (res.rows as Row[]).map((r) => {
    const totalCompanies = Number(r.total_companies ?? 0);
    const icpCompanies = Number(r.icp_companies ?? 0);
    const attendeeCount = Number(r.attendee_count ?? 0);
    const endDate = new Date(String(r.end_date));
    const dataAge = Math.max(0, (Date.now() - endDate.getTime()) / (365.25 * 24 * 60 * 60 * 1000));
    const mustConv = Number(settings['tier_must_target_conversion'] ?? '25') / 100 || 0.25;
    const highConv = Number(settings['tier_high_priority_conversion'] ?? '15') / 100 || 0.15;
    const worthConv = Number(settings['tier_worth_engaging_conversion'] ?? '7.5') / 100 || 0.075;
    const score = totalCompanies > 0 ? Math.round(Math.min((icpCompanies / totalCompanies) / 0.15, 1) * 100) : null;
    const actionableCount = actions.filter(a => Number(a.is_actionable ?? 0) === 1).length;
    const recommendationTier = score == null
      ? 'evaluate_before_committing'
      : score >= 85 ? 'attend_invest_more'
      : score >= 70 ? 'attend_maintain'
      : score >= 55 ? 'attend_reconsider_format'
      : score < 40 ? (Number(r.is_historical) === HISTORICAL_CONFERENCE_TYPE ? 'do_not_prioritize' : 'remove_from_calendar')
      : 'evaluate_before_committing';

    return {
      conferenceId: Number(r.id),
      conferenceName: String(r.name ?? ''),
      conferenceYear: endDate.getUTCFullYear(),
      conferenceType: Number(r.is_historical) === HISTORICAL_CONFERENCE_TYPE ? 'historical' : 'active',
      attendeeCount,
      totalCompanies,
      icpCompanies,
      icpDensityPct: totalCompanies > 0 ? (icpCompanies / totalCompanies) * 100 : 0,
      calendarRecommendationScore: score,
      recommendationTier,
      confidenceLevel: attendeeCount < 50 || dataAge > 4 ? 'low' : dataAge > 2 ? 'medium' : 'high',
      dataAge,
      recommendationReason: [
        `ICP density is ${(totalCompanies > 0 ? (icpCompanies / totalCompanies) * 100 : 0).toFixed(1)}% based on ${totalCompanies} companies.`,
      ],
      confidenceFactors: attendeeCount < 50 ? ['Attendee sample under 50 lowers confidence.'] : [],
      tierProbabilityFactors: { must: mustConv, high: highConv, worth: worthConv },
      actionableActionTypesConfigured: actionableCount,
    };
  });

  for (const c of conferences) {
    await db.execute({
      sql: `INSERT INTO calendar_intelligence_scores (conference_id, score_payload, calculated_at) VALUES (?, ?, datetime('now'))
            ON CONFLICT(conference_id) DO UPDATE SET score_payload = excluded.score_payload, calculated_at = excluded.calculated_at`,
      args: [c.conferenceId, JSON.stringify(c)],
    }).catch(() => {});
  }
  return NextResponse.json({ conferences, conferenceTypeConstants: { HISTORICAL_CONFERENCE_TYPE, ACTIVE_CONFERENCE_TYPE } });
}
