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

  const conferences = await db.execute({
    sql: `SELECT c.id, c.name, c.end_date, COALESCE(c.is_historical, 0) as is_historical,
                 cb.required_pipeline_amount,
                 (SELECT SUM(CAST(json_extract(li.value, '$.cost') AS REAL))
                    FROM conference_budget b, json_each(b.line_items) li
                   WHERE b.conference_id = c.id) as planning_spend
          FROM conferences c
          LEFT JOIN conference_budget cb ON cb.conference_id = c.id
          WHERE date(c.end_date) <= date('now')
          ORDER BY date(c.end_date) DESC`,
    args: [],
  });

  const rows = await Promise.all((conferences.rows as Row[]).map(async (c) => {
    const cid = Number(c.id);
    const comp = await db.execute({
      sql: `SELECT COUNT(DISTINCT a.company_id) as total_companies,
                   COUNT(DISTINCT CASE WHEN LOWER(COALESCE(co.value, '')) = 'true' THEN a.company_id END) as icp_companies,
                   COUNT(*) as attendees,
                   COUNT(CASE WHEN t.needs_review = 1 THEN 1 END) as title_review_needed
            FROM conference_attendees ca
            JOIN attendees a ON a.id = ca.attendee_id
            LEFT JOIN companies x ON x.id = a.company_id
            LEFT JOIN config_options co ON co.id = x.icp
            LEFT JOIN attendee_titles t ON t.attendee_id = a.id
            WHERE ca.conference_id = ?`,
      args: [cid],
    }).catch(() => ({ rows: [{ total_companies: 0, icp_companies: 0, attendees: 0, title_review_needed: 0 }] as Row[] }));

    const totalCompanies = Number(comp.rows[0]?.total_companies ?? 0);
    const icpCompanies = Number(comp.rows[0]?.icp_companies ?? 0);
    const attendees = Number(comp.rows[0]?.attendees ?? 0);
    const endDate = new Date(String(c.end_date));
    const dataAge = Math.max(0, (Date.now() - endDate.getTime()) / (365.25 * 24 * 60 * 60 * 1000));
    const audienceFit = totalCompanies > 0 ? Math.min((icpCompanies / totalCompanies) / 0.15, 1) * 100 : null;
    const score = audienceFit == null ? null : Math.max(0, Math.min(100, Math.round(audienceFit)));
    const tier = score == null ? 'evaluate_before_committing' : score >= 85 ? 'attend_invest_more' : score >= 70 ? 'attend_maintain' : score < 40 ? (Number(c.is_historical) === HISTORICAL_CONFERENCE_TYPE ? 'do_not_prioritize' : 'remove_from_calendar') : 'evaluate_before_committing';

    return {
      conferenceId: cid,
      conferenceName: String(c.name ?? ''),
      conferenceYear: endDate.getUTCFullYear(),
      conferenceType: Number(c.is_historical) === HISTORICAL_CONFERENCE_TYPE ? 'historical' : 'active',
      attendeeCount: attendees,
      totalCompanies,
      icpCompanies,
      icpDensityPct: totalCompanies > 0 ? (icpCompanies / totalCompanies) * 100 : 0,
      calendarRecommendationScore: score,
      recommendationTier: tier,
      confidenceLevel: attendees < 50 || dataAge > 4 ? 'low' : dataAge > 2 ? 'medium' : 'high',
      dataAge,
      planningSpend: Number(c.planning_spend ?? 0),
      requiredPipelineAmount: Number(c.required_pipeline_amount ?? 0),
    };
  }));

  return NextResponse.json({ conferences: rows, conferenceTypeConstants: { HISTORICAL_CONFERENCE_TYPE, ACTIVE_CONFERENCE_TYPE } });
}

