import { NextRequest, NextResponse } from 'next/server';
import { db, dbReady } from '@/lib/db';
import { requireAuth } from '@/lib/auth';

export const dynamic = 'force-dynamic';

// Returns all conferences scored and ranked by their cost efficiency score,
// using the same formula as the per-conference effectiveness endpoint.
export async function GET(request: NextRequest) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;

  try {
    await dbReady;

    const rows = await db.execute({
      sql: `
        WITH all_meetings AS (
          SELECT m.conference_id, a.company_id,
            COUNT(CASE WHEN cop.action_key = 'meeting_held' THEN m.id END) AS mtg
          FROM meetings m
          JOIN attendees a ON m.attendee_id = a.id
          LEFT JOIN config_options cop
            ON cop.category = 'action' AND LOWER(m.outcome) = LOWER(cop.value)
          GROUP BY m.conference_id, a.company_id
        ),
        all_tp AS (
          SELECT atp.conference_id, a.company_id, COUNT(DISTINCT atp.id) AS tp
          FROM attendee_touchpoints atp
          JOIN attendees a ON atp.attendee_id = a.id
          GROUP BY atp.conference_id, a.company_id
        ),
        all_he AS (
          SELECT se.conference_id, a.company_id,
            COUNT(DISTINCT rsvp.social_event_id) AS he
          FROM social_event_rsvps rsvp
          JOIN social_events se ON rsvp.social_event_id = se.id
          JOIN attendees a ON rsvp.attendee_id = a.id
          WHERE rsvp.rsvp_status = 'attended' AND se.event_type = 'Company Hosted'
          GROUP BY se.conference_id, a.company_id
        ),
        all_cc AS (
          SELECT DISTINCT ca.conference_id, a.company_id, co.wse
          FROM conference_attendees ca
          JOIN attendees a ON ca.attendee_id = a.id
          JOIN companies co ON a.company_id = co.id
          WHERE a.company_id IS NOT NULL
        ),
        all_eng AS (
          SELECT acc.conference_id, acc.company_id, acc.wse,
            COALESCE(am.mtg, 0) AS mtg,
            COALESCE(at2.tp, 0) AS tp,
            COALESCE(ah.he, 0) AS he,
            COALESCE(am.mtg, 0) + COALESCE(at2.tp, 0) + COALESCE(ah.he, 0) AS ti
          FROM all_cc acc
          LEFT JOIN all_meetings am
            ON acc.conference_id = am.conference_id AND acc.company_id = am.company_id
          LEFT JOIN all_tp at2
            ON acc.conference_id = at2.conference_id AND acc.company_id = at2.company_id
          LEFT JOIN all_he ah
            ON acc.conference_id = ah.conference_id AND acc.company_id = ah.company_id
          WHERE COALESCE(am.mtg, 0) + COALESCE(at2.tp, 0) + COALESCE(ah.he, 0) > 0
        ),
        eff_d AS (
          SELECT
            MAX(CASE WHEN key = 'follow_up_meeting_conversion_rate' THEN CAST(value AS REAL)/100 END) AS fur,
            MAX(CASE WHEN key = 'touchpoint_conversion_rate'        THEN CAST(value AS REAL)/100 END) AS tpr,
            MAX(CASE WHEN key = 'hosted_event_attendee_conversion_rate' THEN CAST(value AS REAL)/100 END) AS her,
            MAX(CASE WHEN key = 'avg_cost_per_unit'           THEN CAST(value AS REAL) END) AS cpu,
            MAX(CASE WHEN key = 'avg_annual_deal_size'         THEN CAST(value AS REAL) END) AS ds,
            MAX(CASE WHEN key = 'expected_return_on_event_cost' THEN CAST(value AS REAL) END) AS er
          FROM effectiveness_defaults
        ),
        all_pi AS (
          SELECT ae.conference_id,
            SUM(
              MIN(
                CASE
                  WHEN ae.mtg > 0 THEN ed.fur
                  WHEN ae.tp  > 0 THEN ed.tpr
                  WHEN ae.he  > 0 THEN ed.her
                  ELSE 0
                END
                * CASE WHEN ae.ti >= 3 THEN 1.5 WHEN ae.ti = 2 THEN 1.25 ELSE 1.0 END,
                0.95
              )
              * CASE WHEN COALESCE(ae.wse, 0) > 0 THEN ae.wse * ed.cpu ELSE ed.ds END
            ) AS total_pi
          FROM all_eng ae CROSS JOIN eff_d ed
          GROUP BY ae.conference_id
        ),
        all_spend AS (
          SELECT cb.conference_id,
            COALESCE(SUM(
              COALESCE(
                NULLIF(CAST(json_extract(li.value, '$.actual') AS REAL), 0),
                COALESCE(CAST(json_extract(li.value, '$.budget') AS REAL), 0),
                0
              )
            ), 0) AS eff_spend
          FROM conference_budget cb, json_each(cb.line_items) li
          GROUP BY cb.conference_id
        ),
        conf_ces AS (
          SELECT ap.conference_id,
            ROUND(
              CASE WHEN COALESCE(asp.eff_spend, 0) > 0 AND ed.er > 0
                THEN MIN(ap.total_pi / (asp.eff_spend * ed.er), 1.0) * 100
                ELSE 0
              END
            ) AS ces_score
          FROM all_pi ap
          LEFT JOIN all_spend asp ON ap.conference_id = asp.conference_id
          CROSS JOIN eff_d ed
        )
        SELECT
          c.id,
          c.name,
          c.start_date,
          c.end_date,
          COALESCE(cc.ces_score, 0) AS score,
          RANK() OVER (ORDER BY COALESCE(cc.ces_score, 0) DESC) AS rank
        FROM conferences c
        LEFT JOIN conf_ces cc ON c.id = cc.conference_id
        ORDER BY rank ASC, c.start_date DESC
      `,
      args: [],
    });

    return NextResponse.json(
      rows.rows.map(r => ({
        id:         Number(r.id),
        name:       String(r.name),
        start_date: String(r.start_date),
        end_date:   String(r.end_date),
        score:      Number(r.score),
        rank:       Number(r.rank),
      }))
    );
  } catch (error) {
    console.error('GET /api/conferences/rankings error:', error);
    return NextResponse.json({ error: 'Failed to load rankings' }, { status: 500 });
  }
}
