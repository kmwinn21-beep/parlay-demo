import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { db, dbReady } from '@/lib/db';
import { reweight } from '@/lib/effectiveness/salesExecution';

export const dynamic = 'force-dynamic';

// ── Scoring helpers (mirrors effectiveness/route.ts) ────────────────────────

function scoreLowerIsBetter(
  value: number,
  eliteMax: number,
  strongMax: number,
  healthyMax: number,
  weakMax: number,
): number {
  if (value < eliteMax) return Math.round(100 - (value / eliteMax) * 5);
  if (value <= strongMax) return Math.round(94 - ((value - eliteMax) / (strongMax - eliteMax)) * 14);
  if (value <= healthyMax) return Math.round(79 - ((value - strongMax) / (healthyMax - strongMax)) * 14);
  if (value <= weakMax) return Math.round(64 - ((value - healthyMax) / (weakMax - healthyMax)) * 14);
  return Math.max(35, Math.round(49 - ((value - weakMax) / weakMax) * 14));
}

function scoreHigherIsBetter(
  value: number,
  eliteMin: number,
  strongMin: number,
  healthyMin: number,
  weakMin: number,
): number {
  if (value >= eliteMin) return Math.min(100, Math.round(95 + ((value - eliteMin) / eliteMin) * 5));
  if (value >= strongMin) return Math.round(80 + ((value - strongMin) / (eliteMin - strongMin)) * 14);
  if (value >= healthyMin) return Math.round(65 + ((value - healthyMin) / (strongMin - healthyMin)) * 14);
  if (value >= weakMin) return Math.round(50 + ((value - weakMin) / (healthyMin - weakMin)) * 14);
  return Math.max(35, Math.round(35 + (value / weakMin) * 14));
}

function pct(num: number, den: number): number | null {
  if (!den) return null;
  return Math.max(0, Math.min(100, (num / den) * 100));
}

interface EffDefs {
  fu_rate: number;
  tp_rate: number;
  he_rate: number;
  cpu: number;
  deal_size: number;
  exp_return: number;
}

interface RawRow {
  id: number;
  name: string;
  conf_date: string;
  strategy_label: string | null;
  total_companies: number;
  icp_total: number;
  companies_engaged: number;
  icp_companies_engaged: number;
  meetings_scheduled: number;
  meetings_held: number;
  companies_with_meeting: number;
  companies_with_meeting_and_fu: number;
  followups_created: number;
  followups_completed: number;
  pipeline_influenced: number;
  total_spend: number;
  req_pipeline: number | null;
  return_on_cost: number;
  targets_total: number;
  targets_engaged: number;
}

function computeScores(r: RawRow, ed: EffDefs) {
  // ── Dim 1: ICP + Target Quality ────────────────────────────────────────────
  const icpRate = r.icp_total > 0 ? pct(r.icp_companies_engaged, r.icp_total) : null;
  const targetRate = r.targets_total > 0 ? pct(r.targets_engaged, r.targets_total) : null;
  const dim1 =
    icpRate != null && targetRate != null
      ? icpRate * 0.5 + targetRate * 0.5
      : (icpRate ?? targetRate ?? null);

  // ── Dim 2: Meeting Execution ──────────────────────────────────────────────
  const holdRate = pct(r.meetings_held, r.meetings_scheduled);
  const fuSchedRate = pct(r.companies_with_meeting_and_fu, r.companies_with_meeting);
  const dim2 =
    holdRate != null && fuSchedRate != null
      ? holdRate * 0.5 + fuSchedRate * 0.5
      : (holdRate ?? fuSchedRate ?? null);

  // ── Dim 3: Pipeline Influence Index ──────────────────────────────────────
  const targetInfluence =
    r.req_pipeline ??
    (r.total_spend > 0 && ed.exp_return > 0 ? r.total_spend * ed.exp_return : null);
  const dim3 = targetInfluence
    ? Math.min((r.pipeline_influenced / targetInfluence) * 100, 100)
    : 0;

  // ── Dim 4: Engagement Breadth ─────────────────────────────────────────────
  const dim4 = r.total_companies > 0 ? (r.companies_engaged / r.total_companies) * 100 : 0;

  // ── Dim 5: Follow-up Execution ────────────────────────────────────────────
  const dim5 = r.followups_created > 0 ? (r.followups_completed / r.followups_created) * 100 : null;

  // ── Dim 6: Net-New (not computable in multi-conf query) ───────────────────
  const dim6 = null;

  // ── Dim 7: Cost Efficiency ────────────────────────────────────────────────
  let dim7: number | null = null;
  if (r.total_spend > 0 && r.companies_engaged > 0) {
    const costPerCompany = r.total_spend / r.companies_engaged;
    const costPerMeeting = r.meetings_held > 0 ? r.total_spend / r.meetings_held : null;
    const pipelinePer1k = r.total_spend > 0 ? (r.pipeline_influenced / r.total_spend) * 1000 : null;

    const cpcScore = scoreLowerIsBetter(costPerCompany, 350, 650, 1000, 1600);
    const cpmScore = costPerMeeting != null ? scoreLowerIsBetter(costPerMeeting, 400, 700, 1100, 1800) : null;
    const p1kScore = pipelinePer1k != null ? scoreHigherIsBetter(pipelinePer1k, 10000, 6000, 3500, 1500) : null;

    const parts = [
      p1kScore != null ? { val: p1kScore, w: 0.50 } : null,
      { val: cpcScore, w: 0.30 },
      cpmScore != null ? { val: cpmScore, w: 0.20 } : null,
    ].filter((p): p is { val: number; w: number } => p != null);

    const totalW = parts.reduce((s, p) => s + p.w, 0);
    if (totalW > 0) {
      dim7 = Math.round(parts.reduce((s, p) => s + (p.val * p.w) / totalW, 0));
    }
  }

  // ── CES ────────────────────────────────────────────────────────────────────
  const dims = [
    { val: dim1, w: 0.20 },
    { val: dim2, w: 0.20 },
    { val: dim3, w: 0.30 },
    { val: dim4, w: 0.05 },
    { val: dim7, w: 0.10 },
    { val: dim5, w: 0.10 },
    { val: dim6, w: 0.05 },
  ];
  const available = dims.filter((d) => d.val != null);
  let ces: number | null = null;
  if (available.length > 0) {
    const totalW = available.reduce((s, d) => s + d.w, 0);
    ces = Math.round(available.reduce((s, d) => s + ((d.val ?? 0) * d.w) / totalW, 0));
    ces = Math.max(0, Math.min(100, ces));
  }

  // ── Sales Execution Score (simplified — no rep productivity) ─────────────
  const salesComponents = [
    { key: 'meeting_execution', score: dim2 != null ? Math.round(dim2) : null, weight: 0.25 },
    { key: 'followup_execution', score: dim5 != null ? Math.round(dim5) : null, weight: 0.20 },
    { key: 'pipeline_influence', score: Math.round(dim3), weight: 0.25 },
    { key: 'target_account', score: targetRate != null ? Math.round(targetRate) : null, weight: 0.15 },
  ];
  const salesWeighted = reweight(salesComponents);

  // ── Cost Efficiency Score ─────────────────────────────────────────────────
  const cost_efficiency_score = dim7;

  // ── Audience Signal (ICP quality only — partial) ──────────────────────────
  const audience_messaging_score = dim1 != null ? Math.round(dim1) : null;

  return {
    ces_score: ces,
    ces_components: {
      dim1_icp_target: dim1 != null ? Math.round(dim1 * 10) / 10 : null,
      dim2_meeting_exec: dim2 != null ? Math.round(dim2 * 10) / 10 : null,
      dim3_pipeline_index: Math.round(dim3 * 10) / 10,
      dim4_breadth: Math.round(dim4 * 10) / 10,
      dim5_followup: dim5 != null ? Math.round(dim5 * 10) / 10 : null,
      dim6_net_new: null,
      dim7_cost_efficiency: dim7,
    },
    sales_execution_score: salesWeighted.score != null ? Math.round(salesWeighted.score) : null,
    audience_messaging_score,
    cost_efficiency_score,
    pipeline_influenced: r.pipeline_influenced,
    total_spend: r.total_spend > 0 ? r.total_spend : null,
  };
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;

  try {
    await dbReady;

    const { searchParams } = request.nextUrl;
    const startDate = searchParams.get('startDate') ?? `${new Date().getFullYear()}-01-01`;
    const endDate = searchParams.get('endDate') ?? `${new Date().getFullYear()}-12-31`;

    // Fetch effectiveness defaults once
    const edRows = await db.execute({
      sql: `SELECT key, value FROM effectiveness_defaults`,
      args: [],
    });
    const edMap: Record<string, number> = {};
    for (const row of edRows.rows) edMap[String(row.key)] = Number(row.value ?? 0);
    const ed: EffDefs = {
      fu_rate: (edMap['follow_up_meeting_conversion_rate'] ?? 30) / 100,
      tp_rate: (edMap['touchpoint_conversion_rate'] ?? 15) / 100,
      he_rate: (edMap['hosted_event_attendee_conversion_rate'] ?? 10) / 100,
      cpu: edMap['avg_cost_per_unit'] ?? 100,
      deal_size: edMap['avg_annual_deal_size'] ?? 25000,
      exp_return: edMap['expected_return_on_event_cost'] ?? 3,
    };

    // Check whether the companies table has an icp column
    let hasIcpCol = false;
    try {
      const pragma = await db.execute({ sql: `PRAGMA table_info(companies)`, args: [] });
      hasIcpCol = pragma.rows.some((r) => String(r.name ?? '').toLowerCase() === 'icp');
    } catch { /* ignore */ }

    const icpExpr = hasIcpCol ? `COALESCE(co.icp, 0)` : `0`;

    // Main multi-conference metrics query
    const result = await db.execute({
      sql: `
        WITH tc AS (
          SELECT c.id, c.name, COALESCE(c.end_date, c.start_date) AS conf_date,
                 c.conference_strategy_type_id
          FROM conferences c
          WHERE COALESCE(c.end_date, c.start_date) >= ? AND COALESCE(c.end_date, c.start_date) <= ?
        ),
        cc AS (
          SELECT ca.conference_id,
            COUNT(DISTINCT a.company_id) AS total,
            COUNT(DISTINCT CASE WHEN ${icpExpr} = 1 THEN a.company_id END) AS icp_total
          FROM conference_attendees ca
          JOIN attendees a ON ca.attendee_id = a.id
          LEFT JOIN companies co ON co.id = a.company_id
          WHERE ca.conference_id IN (SELECT id FROM tc) AND a.company_id IS NOT NULL
          GROUP BY ca.conference_id
        ),
        ce AS (
          SELECT t.cid,
            COUNT(DISTINCT t.coid) AS engaged,
            COUNT(DISTINCT CASE WHEN t.is_icp = 1 THEN t.coid END) AS icp_engaged
          FROM (
            SELECT m.conference_id AS cid, a.company_id AS coid, ${icpExpr} AS is_icp
            FROM meetings m JOIN attendees a ON m.attendee_id = a.id
            LEFT JOIN companies co ON co.id = a.company_id
            WHERE m.conference_id IN (SELECT id FROM tc) AND a.company_id IS NOT NULL
            UNION
            SELECT atp.conference_id, a.company_id, ${icpExpr}
            FROM attendee_touchpoints atp JOIN attendees a ON atp.attendee_id = a.id
            LEFT JOIN companies co ON co.id = a.company_id
            WHERE atp.conference_id IN (SELECT id FROM tc) AND a.company_id IS NOT NULL
            UNION
            SELECT se.conference_id, a.company_id, ${icpExpr}
            FROM social_event_rsvps r JOIN social_events se ON r.social_event_id = se.id
            JOIN attendees a ON r.attendee_id = a.id
            LEFT JOIN companies co ON co.id = a.company_id
            WHERE r.rsvp_status = 'attended' AND se.event_type = 'Company Hosted'
              AND se.conference_id IN (SELECT id FROM tc) AND a.company_id IS NOT NULL
          ) t
          GROUP BY t.cid
        ),
        cm AS (
          SELECT m.conference_id,
            COUNT(*) AS scheduled,
            COUNT(CASE WHEN LOWER(COALESCE(cop.action_key, '')) = 'meeting_held' THEN 1 END) AS held,
            COUNT(DISTINCT CASE WHEN LOWER(COALESCE(cop.action_key, '')) = 'meeting_held' THEN a.company_id END) AS co_with_mtg
          FROM meetings m
          JOIN attendees a ON m.attendee_id = a.id
          LEFT JOIN config_options cop ON cop.category = 'action' AND LOWER(m.outcome) = LOWER(cop.value)
          WHERE m.conference_id IN (SELECT id FROM tc)
          GROUP BY m.conference_id
        ),
        cfu AS (
          SELECT fu.conference_id,
            COUNT(*) AS created,
            SUM(CASE WHEN CAST(fu.completed AS TEXT) IN ('1', 'true') THEN 1 ELSE 0 END) AS completed,
            COUNT(DISTINCT CASE WHEN m2.id IS NOT NULL THEN a.company_id END) AS co_with_mtg_fu
          FROM follow_ups fu
          JOIN attendees a ON fu.attendee_id = a.id
          LEFT JOIN meetings m2 ON m2.conference_id = fu.conference_id AND m2.attendee_id = fu.attendee_id
          WHERE fu.conference_id IN (SELECT id FROM tc)
          GROUP BY fu.conference_id
        ),
        cpb AS (
          SELECT ca.conference_id, a.company_id, MAX(COALESCE(co.wse, 0)) AS wse,
            MAX(CASE WHEN LOWER(COALESCE(cop.action_key, '')) = 'meeting_held' THEN 1 ELSE 0 END) AS had_mtg,
            COUNT(DISTINCT atp.id) AS tp_ct
          FROM conference_attendees ca
          JOIN attendees a ON ca.attendee_id = a.id
          LEFT JOIN companies co ON co.id = a.company_id
          LEFT JOIN meetings m ON m.conference_id = ca.conference_id AND m.attendee_id = ca.attendee_id
          LEFT JOIN config_options cop ON cop.category = 'action' AND LOWER(COALESCE(m.outcome, '')) = LOWER(cop.value)
          LEFT JOIN attendee_touchpoints atp ON atp.conference_id = ca.conference_id AND atp.attendee_id = ca.attendee_id
          WHERE ca.conference_id IN (SELECT id FROM tc) AND a.company_id IS NOT NULL
          GROUP BY ca.conference_id, a.company_id
        ),
        cp AS (
          SELECT b.conference_id,
            SUM(
              MIN(
                CASE WHEN b.had_mtg = 1 THEN ${ed.fu_rate}
                     WHEN b.tp_ct > 0  THEN ${ed.tp_rate}
                     ELSE 0 END *
                CASE WHEN b.had_mtg + b.tp_ct >= 3 THEN 1.5
                     WHEN b.had_mtg + b.tp_ct >= 2 THEN 1.25
                     ELSE 1.0 END,
                0.95
              ) * CASE WHEN b.wse > 0 THEN b.wse * ${ed.cpu} ELSE ${ed.deal_size} END
            ) AS total_pi
          FROM cpb b
          WHERE b.had_mtg = 1 OR b.tp_ct > 0
          GROUP BY b.conference_id
        ),
        cs AS (
          SELECT cb.conference_id,
            SUM(COALESCE(
              NULLIF(CAST(json_extract(li.value, '$.actual') AS REAL), 0),
              CAST(json_extract(li.value, '$.budget') AS REAL), 0
            )) AS spend
          FROM conference_budget cb, json_each(cb.line_items) li
          WHERE cb.conference_id IN (SELECT id FROM tc)
            AND cb.line_items IS NOT NULL
            AND cb.line_items NOT IN ('', '[]', 'null')
            AND json_valid(cb.line_items) = 1
          GROUP BY cb.conference_id
        ),
        crp AS (
          SELECT cb.conference_id,
            CASE
              WHEN CAST(cb.required_pipeline_amount AS REAL) > 0
                THEN CAST(cb.required_pipeline_amount AS REAL)
              WHEN cb.required_pipeline_multiple IS NOT NULL AND COALESCE(cs2.spend, 0) > 0
                THEN CAST(cb.required_pipeline_multiple AS REAL) * cs2.spend
              ELSE NULL
            END AS req_pipeline,
            COALESCE(CAST(cb.return_on_cost AS REAL), 0) AS return_on_cost
          FROM conference_budget cb
          LEFT JOIN cs cs2 ON cs2.conference_id = cb.conference_id
          WHERE cb.conference_id IN (SELECT id FROM tc)
        ),
        cta AS (
          SELECT ctar.conference_id,
            COUNT(DISTINCT ctar.attendee_id) AS targets_total,
            COUNT(DISTINCT CASE WHEN (
              EXISTS (SELECT 1 FROM meetings mx WHERE mx.conference_id = ctar.conference_id AND mx.attendee_id = ctar.attendee_id)
              OR EXISTS (SELECT 1 FROM attendee_touchpoints atx WHERE atx.conference_id = ctar.conference_id AND atx.attendee_id = ctar.attendee_id)
            ) THEN ctar.attendee_id END) AS targets_engaged
          FROM conference_targets ctar
          WHERE ctar.conference_id IN (SELECT id FROM tc)
          GROUP BY ctar.conference_id
        )
        SELECT
          tc.id, tc.name, tc.conf_date,
          col.label AS strategy_label,
          COALESCE(cc.total, 0)                    AS total_companies,
          COALESCE(cc.icp_total, 0)                AS icp_total,
          COALESCE(ce.engaged, 0)                  AS companies_engaged,
          COALESCE(ce.icp_engaged, 0)              AS icp_companies_engaged,
          COALESCE(cm.scheduled, 0)                AS meetings_scheduled,
          COALESCE(cm.held, 0)                     AS meetings_held,
          COALESCE(cm.co_with_mtg, 0)              AS companies_with_meeting,
          COALESCE(cfu.co_with_mtg_fu, 0)          AS companies_with_meeting_and_fu,
          COALESCE(cfu.created, 0)                 AS followups_created,
          COALESCE(cfu.completed, 0)               AS followups_completed,
          COALESCE(cp.total_pi, 0)                 AS pipeline_influenced,
          COALESCE(cs.spend, 0)                    AS total_spend,
          crp.req_pipeline,
          COALESCE(crp.return_on_cost, 0)          AS return_on_cost,
          COALESCE(cta.targets_total, 0)           AS targets_total,
          COALESCE(cta.targets_engaged, 0)         AS targets_engaged
        FROM tc
        LEFT JOIN cc  ON cc.conference_id  = tc.id
        LEFT JOIN ce  ON ce.cid            = tc.id
        LEFT JOIN cm  ON cm.conference_id  = tc.id
        LEFT JOIN cfu ON cfu.conference_id = tc.id
        LEFT JOIN cp  ON cp.conference_id  = tc.id
        LEFT JOIN cs  ON cs.conference_id  = tc.id
        LEFT JOIN crp ON crp.conference_id = tc.id
        LEFT JOIN cta ON cta.conference_id = tc.id
        LEFT JOIN config_options col ON col.id = tc.conference_strategy_type_id
        ORDER BY tc.conf_date ASC
      `,
      args: [startDate, endDate],
    });

    const conferences = result.rows.map((row) => {
      const r: RawRow = {
        id: Number(row.id),
        name: String(row.name ?? ''),
        conf_date: String(row.conf_date ?? ''),
        strategy_label: row.strategy_label ? String(row.strategy_label) : null,
        total_companies: Number(row.total_companies ?? 0),
        icp_total: Number(row.icp_total ?? 0),
        companies_engaged: Number(row.companies_engaged ?? 0),
        icp_companies_engaged: Number(row.icp_companies_engaged ?? 0),
        meetings_scheduled: Number(row.meetings_scheduled ?? 0),
        meetings_held: Number(row.meetings_held ?? 0),
        companies_with_meeting: Number(row.companies_with_meeting ?? 0),
        companies_with_meeting_and_fu: Number(row.companies_with_meeting_and_fu ?? 0),
        followups_created: Number(row.followups_created ?? 0),
        followups_completed: Number(row.followups_completed ?? 0),
        pipeline_influenced: Number(row.pipeline_influenced ?? 0),
        total_spend: Number(row.total_spend ?? 0),
        req_pipeline: row.req_pipeline != null ? Number(row.req_pipeline) : null,
        return_on_cost: Number(row.return_on_cost ?? 0),
        targets_total: Number(row.targets_total ?? 0),
        targets_engaged: Number(row.targets_engaged ?? 0),
      };

      const scores = computeScores(r, ed);

      return {
        conference_id: r.id,
        conference_name: r.name,
        conference_date: r.conf_date,
        conference_strategy: r.strategy_label,
        ...scores,
      };
    });

    return NextResponse.json({ conferences });
  } catch (error) {
    console.error('GET /api/program-intelligence/performance error:', error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
