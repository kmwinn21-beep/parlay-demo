import { NextRequest, NextResponse } from 'next/server';
import { db, dbReady } from '@/lib/db';

export const dynamic = 'force-dynamic';

// Shared CTEs parameterised on conference_id (passed as positional args).
// Because libSQL doesn't support named params mixed with positional in subqueries,
// we embed the conferenceId directly via template — it is always a validated integer.
function buildCTEs(cid: number): string {
  return `
  conf_companies AS (
    SELECT DISTINCT a.company_id, co.name, co.wse, co.icp, co.status, co.company_type
    FROM conference_attendees ca
    JOIN attendees a  ON ca.attendee_id = a.id
    JOIN companies co ON a.company_id   = co.id
    WHERE ca.conference_id = ${cid} AND a.company_id IS NOT NULL
  ),
  company_meetings AS (
    SELECT a.company_id,
      COUNT(DISTINCT m.id) AS meetings_scheduled,
      COUNT(DISTINCT CASE WHEN cop.action_key = 'meeting_held' THEN m.id END) AS meetings_held
    FROM meetings m
    JOIN attendees a ON m.attendee_id = a.id
    LEFT JOIN config_options cop ON cop.category = 'action'
      AND LOWER(m.outcome) = LOWER(cop.value)
    WHERE m.conference_id = ${cid}
    GROUP BY a.company_id
  ),
  company_touchpoints AS (
    SELECT a.company_id, COUNT(DISTINCT atp.id) AS touchpoints
    FROM attendee_touchpoints atp
    JOIN attendees a ON atp.attendee_id = a.id
    WHERE atp.conference_id = ${cid}
    GROUP BY a.company_id
  ),
  company_hosted_attendance AS (
    SELECT a.company_id, COUNT(DISTINCT rsvp.social_event_id) AS hosted_events_attended
    FROM social_event_rsvps rsvp
    JOIN social_events se   ON rsvp.social_event_id = se.id
    JOIN attendees a        ON rsvp.attendee_id = a.id
    WHERE se.conference_id = ${cid}
      AND rsvp.rsvp_status = 'attended'
      AND se.event_type    = 'Company Hosted'
    GROUP BY a.company_id
  ),
  company_followups AS (
    SELECT a.company_id,
      COUNT(DISTINCT f.id)                                          AS followups_created,
      COUNT(DISTINCT CASE WHEN f.completed = 1 THEN f.id END)       AS followups_completed
    FROM follow_ups f
    JOIN attendees a ON f.attendee_id = a.id
    WHERE f.conference_id = ${cid}
    GROUP BY a.company_id
  ),
  eff AS (
    SELECT
      MAX(CASE WHEN key = 'follow_up_meeting_conversion_rate'     THEN CAST(value AS REAL)/100 END) AS follow_up_rate,
      MAX(CASE WHEN key = 'touchpoint_conversion_rate'            THEN CAST(value AS REAL)/100 END) AS touchpoint_rate,
      MAX(CASE WHEN key = 'hosted_event_attendee_conversion_rate' THEN CAST(value AS REAL)/100 END) AS hosted_rate,
      MAX(CASE WHEN key = 'avg_cost_per_unit'                     THEN CAST(value AS REAL) END)     AS cost_per_unit,
      MAX(CASE WHEN key = 'avg_annual_deal_size'                  THEN CAST(value AS REAL) END)     AS deal_size,
      MAX(CASE WHEN key = 'meetings_held_conversion_rate'         THEN CAST(value AS REAL)/100 END) AS meetings_held_rate,
      MAX(CASE WHEN key = 'expected_return_on_event_cost'         THEN CAST(value AS REAL) END)     AS expected_return
    FROM effectiveness_defaults
  ),
  company_engagement AS (
    SELECT
      cc.company_id, cc.name, cc.wse, cc.icp, cc.status,
      COALESCE(cm.meetings_scheduled, 0)        AS meetings_scheduled,
      COALESCE(cm.meetings_held, 0)             AS meetings_held,
      COALESCE(ct.touchpoints, 0)               AS touchpoints,
      COALESCE(cha.hosted_events_attended, 0)   AS hosted_events,
      COALESCE(cf.followups_created, 0)         AS followups_created,
      COALESCE(cf.followups_completed, 0)       AS followups_completed,
      (COALESCE(cm.meetings_held, 0) +
       COALESCE(ct.touchpoints, 0) +
       COALESCE(cha.hosted_events_attended, 0)) AS total_interactions,
      CASE WHEN COALESCE(cm.meetings_scheduled,0)
                + COALESCE(ct.touchpoints,0)
                + COALESCE(cha.hosted_events_attended,0) > 0
           THEN 1 ELSE 0 END                    AS is_engaged
    FROM conf_companies cc
    LEFT JOIN company_meetings          cm  ON cc.company_id = cm.company_id
    LEFT JOIN company_touchpoints       ct  ON cc.company_id = ct.company_id
    LEFT JOIN company_hosted_attendance cha ON cc.company_id = cha.company_id
    LEFT JOIN company_followups         cf  ON cc.company_id = cf.company_id
  ),
  company_with_multiplier AS (
    SELECT *,
      CASE
        WHEN total_interactions >= 3 THEN 1.50
        WHEN total_interactions  = 2 THEN 1.25
        ELSE                              1.00
      END AS multi_touch_mult
    FROM company_engagement
  ),
  pipeline_influence AS (
    SELECT
      cwm.*,
      CASE
        WHEN cwm.meetings_held > 0   THEN e.follow_up_rate
        WHEN cwm.touchpoints   > 0   THEN e.touchpoint_rate
        WHEN cwm.hosted_events > 0   THEN e.hosted_rate
        ELSE                              0
      END AS base_conv_rate,
      MIN(
        CASE
          WHEN cwm.meetings_held > 0 THEN e.follow_up_rate
          WHEN cwm.touchpoints   > 0 THEN e.touchpoint_rate
          WHEN cwm.hosted_events > 0 THEN e.hosted_rate
          ELSE 0
        END * cwm.multi_touch_mult,
        0.95
      ) AS adj_conv_rate,
      CASE
        WHEN COALESCE(cwm.wse, 0) > 0 THEN cwm.wse * e.cost_per_unit
        ELSE                                e.deal_size
      END AS company_deal_value,
      MIN(
        CASE
          WHEN cwm.meetings_held > 0 THEN e.follow_up_rate
          WHEN cwm.touchpoints   > 0 THEN e.touchpoint_rate
          WHEN cwm.hosted_events > 0 THEN e.hosted_rate
          ELSE 0
        END * cwm.multi_touch_mult,
        0.95
      ) * CASE
            WHEN COALESCE(cwm.wse, 0) > 0 THEN cwm.wse * e.cost_per_unit
            ELSE                                e.deal_size
          END AS pipeline_influence_value
    FROM company_with_multiplier cwm
    CROSS JOIN eff e
    WHERE cwm.is_engaged = 1
  )`;
}

function scoreLowerIsBetter(value: number, eliteMax: number, strongMax: number, healthyMax: number, weakMax: number): { score: number; tier: string } {
  if (value < eliteMax) {
    const pct = eliteMax > 0 ? value / eliteMax : 0;
    return { score: Math.round(100 - pct * 5), tier: 'Elite' };
  }
  if (value <= strongMax) {
    const pct = (value - eliteMax) / Math.max(strongMax - eliteMax, 1);
    return { score: Math.round(94 - pct * 14), tier: 'Strong' };
  }
  if (value <= healthyMax) {
    const pct = (value - strongMax) / Math.max(healthyMax - strongMax, 1);
    return { score: Math.round(79 - pct * 14), tier: 'Healthy' };
  }
  if (value <= weakMax) {
    const pct = (value - healthyMax) / Math.max(weakMax - healthyMax, 1);
    return { score: Math.round(64 - pct * 14), tier: 'Weak' };
  }
  const pct = Math.min((value - weakMax) / Math.max(weakMax, 1), 1);
  return { score: Math.max(35, Math.round(49 - pct * 14)), tier: 'Poor' };
}

function scoreHigherIsBetter(value: number, eliteMin: number, strongMin: number, healthyMin: number, weakMin: number): { score: number; tier: string } {
  if (value >= eliteMin) {
    const pct = Math.min((value - eliteMin) / Math.max(eliteMin, 1), 1);
    return { score: Math.min(100, Math.round(95 + pct * 5)), tier: 'Elite' };
  }
  if (value >= strongMin) {
    const pct = (value - strongMin) / Math.max(eliteMin - strongMin, 1);
    return { score: Math.round(80 + pct * 14), tier: 'Strong' };
  }
  if (value >= healthyMin) {
    const pct = (value - healthyMin) / Math.max(strongMin - healthyMin, 1);
    return { score: Math.round(65 + pct * 14), tier: 'Healthy' };
  }
  if (value >= weakMin) {
    const pct = (value - weakMin) / Math.max(healthyMin - weakMin, 1);
    return { score: Math.round(50 + pct * 14), tier: 'Weak' };
  }
  const pct = Math.min(value / Math.max(weakMin, 1), 1);
  return { score: Math.max(35, Math.round(35 + pct * 14)), tier: 'Poor' };
}

function cesInterpretation(score: number): string {
  if (score >= 90) return 'Exceptional efficiency';
  if (score >= 75) return 'Strong efficiency';
  if (score >= 60) return 'Acceptable efficiency';
  if (score >= 50) return 'Weak efficiency';
  return 'Inefficient';
}

function cesTier(score: number): string {
  if (score >= 90) return 'Exceptional';
  if (score >= 75) return 'Strong';
  if (score >= 60) return 'Acceptable';
  if (score >= 50) return 'Weak';
  return 'Inefficient';
}

async function runQuery(sql: string): Promise<Record<string, unknown>[]> {
  const result = await db.execute({ sql, args: [] });
  return result.rows.map((r: Record<string, unknown>) => {
    const obj: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(r)) obj[k] = v;
    return obj;
  });
}

async function scalar(sql: string): Promise<unknown> {
  const rows = await runQuery(sql);
  if (!rows.length) return null;
  const vals = Object.values(rows[0]);
  return vals.length ? vals[0] : null;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await dbReady;
    const cid = Number(params.id);
    if (!cid || isNaN(cid)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

    const ctes = buildCTEs(cid);
    const w = `WITH ${ctes}`;

    // Fetch conference year for annual budget lookup
    const confRow = await runQuery(
      `SELECT name, start_date, end_date, location FROM conferences WHERE id = ${cid}`
    );
    const confInfo = confRow[0] ?? {};

    // Fetch conf event type and cost efficiency modifier
    const confModifierRow = await runQuery(
      `SELECT conf_event_type, cost_efficiency_modifier, cost_efficiency_modifier_reason FROM conferences WHERE id = ${cid}`
    );
    const confModifierInfo = confModifierRow[0] ?? {};
    const confEventType = String(confModifierInfo.conf_event_type ?? 'other');
    const confModifierOverride = confModifierInfo.cost_efficiency_modifier != null
      ? Number(confModifierInfo.cost_efficiency_modifier)
      : null;
    const confModifierReason = String(confModifierInfo.cost_efficiency_modifier_reason ?? '');

    // Total effective spend from conference_budget line_items JSON
    // (actual if set/nonzero, else budget per line item)
    const totalSpendRow = await runQuery(
      `SELECT
         COALESCE(SUM(
           COALESCE(NULLIF(CAST(json_extract(li.value, '$.actual') AS REAL), 0),
                    COALESCE(CAST(json_extract(li.value, '$.budget') AS REAL), 0), 0)
         ), 0) AS total_spend,
         json_group_array(json_object(
           'id', json_extract(li.value, '$.id'),
           'label', json_extract(li.value, '$.label'),
           'budget', json_extract(li.value, '$.budget'),
           'actual', json_extract(li.value, '$.actual'),
           'effective', COALESCE(NULLIF(CAST(json_extract(li.value, '$.actual') AS REAL), 0),
                                 COALESCE(CAST(json_extract(li.value, '$.budget') AS REAL), 0), 0)
         )) AS line_items_json
       FROM conference_budget cb, json_each(cb.line_items) li
       WHERE cb.conference_id = ${cid}`
    );
    const totalSpend = Number(totalSpendRow[0]?.total_spend ?? 0);
    let lineItems: unknown[] = [];
    try { lineItems = JSON.parse(String(totalSpendRow[0]?.line_items_json ?? '[]')); } catch { /* empty */ }

    // Annual budget for this conference's year
    const confYear = confInfo.start_date ? String(confInfo.start_date).substring(0, 4) : null;
    const annualBudgetRow = confYear
      ? await runQuery(`SELECT amount FROM annual_budgets WHERE year = ${confYear}`)
      : [];
    const annualBudget = annualBudgetRow.length ? Number(annualBudgetRow[0].amount) : null;

    // Effectiveness defaults
    const effRow = await runQuery(`SELECT key, value FROM effectiveness_defaults`);
    const effDefaults: Record<string, string> = {};
    for (const r of effRow) effDefaults[String(r.key)] = String(r.value ?? '');

    // CES benchmarks
    const DEFAULT_BENCHMARKS = {
      cost_per_company: { elite_max: 350, strong_max: 650, healthy_max: 1000, weak_max: 1600 },
      cost_per_meeting:  { elite_max: 400, strong_max: 700, healthy_max: 1100, weak_max: 1800 },
      pipeline_per_1k:  { elite_min: 10000, strong_min: 6000, healthy_min: 3500, weak_min: 1500 },
    };
    const benchmarkRow = await runQuery(`SELECT value FROM effectiveness_defaults WHERE key = 'ces_benchmarks'`);
    const cesBenchmarks = (() => {
      try { return { ...DEFAULT_BENCHMARKS, ...JSON.parse(String(benchmarkRow[0]?.value ?? '{}')) }; }
      catch { return DEFAULT_BENCHMARKS; }
    })();

    const DEFAULT_MODIFIERS: Record<string, number> = { flagship_industry_event: 5, regional_operator_conference: 0, vendor_heavy_trade_show: -5, other: 0 };
    const modifierRow = await runQuery(`SELECT value FROM effectiveness_defaults WHERE key = 'ces_event_type_modifiers'`);
    const eventModifiers: Record<string, number> = (() => {
      try { return { ...DEFAULT_MODIFIERS, ...JSON.parse(String(modifierRow[0]?.value ?? '{}')) }; }
      catch { return DEFAULT_MODIFIERS; }
    })();

    // ── Events Coordinator Metrics ──────────────────────────────────────────
    const [engagementSummary] = await runQuery(
      `${w} SELECT
        COUNT(*) AS total_companies,
        COUNT(CASE WHEN is_engaged=1 THEN 1 END) AS companies_engaged,
        ROUND(COUNT(CASE WHEN is_engaged=1 THEN 1 END)*100.0/NULLIF(COUNT(*),0),1) AS engagement_rate_pct,
        SUM(meetings_scheduled) AS total_scheduled,
        SUM(meetings_held) AS total_held,
        ROUND(SUM(meetings_held)*100.0/NULLIF(SUM(meetings_scheduled),0),1) AS hold_rate_pct,
        COUNT(CASE WHEN touchpoints>=2 AND is_engaged=1 THEN 1 END) AS multi_touch_companies,
        ROUND(COUNT(CASE WHEN touchpoints>=2 AND is_engaged=1 THEN 1 END)*100.0/NULLIF(COUNT(CASE WHEN is_engaged=1 THEN 1 END),0),1) AS multi_touch_rate_pct,
        COUNT(CASE WHEN meetings_held>0 AND followups_created>0 THEN 1 END) AS companies_meeting_with_fu,
        ROUND(COUNT(CASE WHEN meetings_held>0 AND followups_created>0 THEN 1 END)*100.0/NULLIF(COUNT(CASE WHEN meetings_held>0 THEN 1 END),0),1) AS fu_scheduling_rate_pct,
        SUM(followups_created) AS total_followups_created,
        SUM(followups_completed) AS total_followups_completed,
        ROUND(SUM(followups_completed)*100.0/NULLIF(SUM(followups_created),0),1) AS followup_completion_rate_pct
       FROM company_engagement`
    ) ?? {};

    const targetEngagement = (await runQuery(
      `${w}
       SELECT
         COUNT(DISTINCT ct.attendee_id) AS targets_total,
         COUNT(DISTINCT CASE WHEN ce.is_engaged=1 THEN a.company_id END) AS target_companies_engaged,
         ROUND(COUNT(DISTINCT CASE WHEN ce.is_engaged=1 THEN ct.attendee_id END)*100.0
               / NULLIF(COUNT(DISTINCT ct.attendee_id),0), 1) AS target_engagement_pct
       FROM conference_targets ct
       JOIN attendees a ON ct.attendee_id = a.id
       LEFT JOIN company_engagement ce ON a.company_id = ce.company_id
       WHERE ct.conference_id = ${cid}`
    ))[0] ?? {};

    const hostedAttendance = (await runQuery(
      `SELECT
         COUNT(DISTINCT rsvp.attendee_id) AS total_invited,
         COUNT(DISTINCT CASE WHEN rsvp.rsvp_status='attended' THEN rsvp.attendee_id END) AS attended,
         ROUND(COUNT(DISTINCT CASE WHEN rsvp.rsvp_status='attended' THEN rsvp.attendee_id END)*100.0
               /NULLIF(COUNT(DISTINCT rsvp.attendee_id),0),1) AS attendance_rate_pct
       FROM social_event_rsvps rsvp
       JOIN social_events se ON rsvp.social_event_id=se.id
       WHERE se.conference_id=${cid} AND se.event_type='Company Hosted'`
    ))[0] ?? {};

    // Contacts engaged at Operator companies
    const contactsEngagementRow = (await runQuery(
      `${w}
       SELECT
         COUNT(DISTINCT ca.attendee_id) AS operator_contacts_total,
         COUNT(DISTINCT CASE WHEN ce.is_engaged=1 THEN ca.attendee_id END) AS contacts_engaged
       FROM conference_attendees ca
       JOIN attendees a ON ca.attendee_id = a.id
       JOIN companies co ON a.company_id = co.id
       LEFT JOIN company_engagement ce ON a.company_id = ce.company_id
       WHERE ca.conference_id = ${cid}
         AND (
           co.company_type = (SELECT CAST(id AS TEXT) FROM config_options WHERE category='company_type' AND LOWER(value)='operator' LIMIT 1)
           OR LOWER(co.company_type) = 'operator'
         )`
    ))[0] ?? {};

    const repActivity = await runQuery(
      `SELECT
         m.scheduled_by AS rep_raw,
         COUNT(DISTINCT CASE WHEN cop.action_key='meeting_held' THEN m.id END) AS meetings_held,
         COUNT(DISTINCT m.id) AS meetings_scheduled,
         COUNT(DISTINCT a.company_id) AS unique_companies_met
       FROM meetings m
       JOIN attendees a ON m.attendee_id = a.id
       LEFT JOIN config_options cop ON cop.category='action' AND LOWER(m.outcome)=LOWER(cop.value)
       WHERE m.conference_id=${cid}
       GROUP BY m.scheduled_by
       ORDER BY meetings_held DESC`
    );

    // ── Rep name resolution ─────────────────────────────────────────────────
    const userConfigRows = await runQuery(
      `SELECT co.id, COALESCE(u.display_name, co.value) AS display_name
       FROM config_options co
       LEFT JOIN users u ON u.config_id = co.id
       WHERE co.category = 'user'`
    );
    const repNameMap = new Map<string, string>();
    for (const r of userConfigRows) repNameMap.set(String(r.id), String(r.display_name ?? r.id));
    const resolveRep = (raw: unknown): string[] =>
      String(raw ?? '').split(',').map(s => s.trim()).filter(Boolean)
        .map(id => repNameMap.get(id) ?? id);

    // ── Seniority priority from site_settings ──────────────────────────────
    const senioritySettingRow = await runQuery(
      `SELECT value FROM site_settings WHERE key = 'icp_seniority_priority'`
    );
    const seniorityPriority: Record<string, string> = (() => {
      try { return JSON.parse(String(senioritySettingRow[0]?.value ?? '{}')); } catch { return {}; }
    })();
    const PRIORITY_WEIGHT: Record<string, number> = { High: 50, Medium: 35, Low: 15, Ignore: 0 };
    const PRIORITY_RANK: Record<string, number> = { High: 3, Medium: 2, Low: 1, Ignore: 0 };

    // ── Internal attendees at this conference ───────────────────────────────
    const confDetailRow = await runQuery(`SELECT internal_attendees FROM conferences WHERE id = ${cid}`);
    const internalAttendeeIds = new Set<string>(
      String(confDetailRow[0]?.internal_attendees ?? '').split(',').map(s => s.trim()).filter(Boolean)
    );

    // ── Company assigned users ──────────────────────────────────────────────
    const companyAssignedRows = await runQuery(
      `${w}
       SELECT cc.company_id, co.assigned_user
       FROM conf_companies cc
       JOIN companies co ON cc.company_id = co.id`
    );
    const companyAssignedMap = new Map<number, string[]>();
    for (const r of companyAssignedRows) {
      companyAssignedMap.set(Number(r.company_id),
        String(r.assigned_user ?? '').split(',').map(s => s.trim()).filter(Boolean));
    }

    // ── Per-company-rep meeting engagements with seniority ──────────────────
    const meetingEngagements = await runQuery(
      `SELECT
         a.company_id, m.scheduled_by,
         a.seniority,
         COUNT(CASE WHEN cop.action_key='meeting_held' THEN m.id END) AS held_count,
         COUNT(m.id) AS scheduled_count
       FROM meetings m
       JOIN attendees a ON m.attendee_id = a.id
       LEFT JOIN config_options cop ON cop.category='action' AND LOWER(m.outcome)=LOWER(cop.value)
       WHERE m.conference_id = ${cid} AND a.company_id IS NOT NULL AND m.scheduled_by IS NOT NULL
       GROUP BY a.company_id, m.scheduled_by, a.seniority`
    );

    // ── Company-level touchpoints and social event counts ───────────────────
    const companyTouchpointMap = new Map<number, number>();
    for (const r of await runQuery(
      `SELECT a.company_id, COUNT(DISTINCT atp.id) AS tp_count
       FROM attendee_touchpoints atp
       JOIN attendees a ON atp.attendee_id = a.id
       WHERE atp.conference_id = ${cid} AND a.company_id IS NOT NULL
       GROUP BY a.company_id`
    )) companyTouchpointMap.set(Number(r.company_id), Number(r.tp_count ?? 0));

    const companySocialMap = new Map<number, number>();
    for (const r of await runQuery(
      `SELECT a.company_id, COUNT(DISTINCT rsvp.attendee_id) AS ev_count
       FROM social_event_rsvps rsvp
       JOIN social_events se ON rsvp.social_event_id = se.id
       JOIN attendees a ON rsvp.attendee_id = a.id
       WHERE se.conference_id = ${cid} AND rsvp.rsvp_status = 'attended' AND a.company_id IS NOT NULL
       GROUP BY a.company_id`
    )) companySocialMap.set(Number(r.company_id), Number(r.ev_count ?? 0));

    // ── Sales / Pipeline Metrics ────────────────────────────────────────────
    const pipelineSummary = (await runQuery(
      `${w}
       SELECT
         COUNT(*) AS companies_influencing,
         ROUND(SUM(pipeline_influence_value),2) AS total_pipeline_influence,
         COUNT(CASE WHEN icp='Yes' THEN 1 END) AS icp_companies_engaged,
         ROUND(SUM(CASE WHEN icp='Yes' THEN pipeline_influence_value END),2) AS icp_pipeline_influence,
         ROUND(SUM(CASE WHEN icp='Yes' THEN pipeline_influence_value END)*100.0/NULLIF(SUM(pipeline_influence_value),0),1) AS icp_pct_of_total,
         COUNT(CASE WHEN total_interactions>=3 THEN 1 END) AS high_engagement_companies,
         ROUND(SUM(CASE WHEN total_interactions>=3 THEN pipeline_influence_value END),2) AS high_engagement_influence,
         ROUND(SUM(CASE WHEN total_interactions>=3 THEN pipeline_influence_value END)*100.0/NULLIF(SUM(pipeline_influence_value),0),1) AS high_engagement_pct,
         COUNT(CASE WHEN total_interactions=2 THEN 1 END) AS two_touch_companies,
         COUNT(CASE WHEN total_interactions=1 THEN 1 END) AS single_touch_companies
       FROM pipeline_influence`
    ))[0] ?? {};

    const netNewLogos = (await runQuery(
      `${w},
       prior_companies AS (
         SELECT DISTINCT a.company_id FROM conference_attendees ca
         JOIN attendees a ON ca.attendee_id=a.id WHERE ca.conference_id != ${cid}
       )
       SELECT
         COUNT(DISTINCT CASE WHEN pi.company_id NOT IN (SELECT company_id FROM prior_companies) THEN pi.company_id END) AS net_new_logos,
         ROUND(SUM(CASE WHEN pi.company_id NOT IN (SELECT company_id FROM prior_companies) THEN pi.pipeline_influence_value END),2) AS net_new_pipeline_influence,
         ROUND(COUNT(DISTINCT CASE WHEN pi.company_id NOT IN (SELECT company_id FROM prior_companies) THEN pi.company_id END)*100.0/NULLIF(COUNT(DISTINCT pi.company_id),0),1) AS net_new_rate_pct
       FROM pipeline_influence pi`
    ))[0] ?? {};

    // Per-company pipeline detail (also used for rep attribution loop below)
    const companyPipeline = await runQuery(
      `${w}
       SELECT
         pi.company_id, pi.name, pi.icp, pi.wse, pi.status,
         pi.meetings_held, pi.touchpoints, pi.hosted_events, pi.total_interactions,
         ROUND(pi.adj_conv_rate*100,1) AS adj_conv_rate_pct,
         ROUND(pi.company_deal_value,2) AS company_deal_value,
         ROUND(pi.pipeline_influence_value,2) AS pipeline_influence_value,
         pi.multi_touch_mult
       FROM pipeline_influence pi
       ORDER BY pipeline_influence_value DESC`
    );

    // ── Supporting sets for Rep CES dimensions ─────────────────────────────
    const icpCompanyRows = await runQuery(
      `SELECT DISTINCT a.company_id FROM conference_attendees ca
       JOIN attendees a  ON ca.attendee_id = a.id
       JOIN companies co ON a.company_id = co.id
       WHERE ca.conference_id = ${cid} AND co.icp = 'Yes' AND a.company_id IS NOT NULL`
    );
    const icpCompanyIdSet = new Set<number>(icpCompanyRows.map(r => Number(r.company_id)));

    const netNewCompanyRows = await runQuery(
      `SELECT DISTINCT a.company_id FROM conference_attendees ca
       JOIN attendees a ON ca.attendee_id = a.id
       WHERE ca.conference_id = ${cid} AND a.company_id IS NOT NULL
         AND a.company_id NOT IN (
           SELECT DISTINCT a2.company_id FROM conference_attendees ca2
           JOIN attendees a2 ON ca2.attendee_id = a2.id
           WHERE ca2.conference_id != ${cid} AND a2.company_id IS NOT NULL
         )`
    );
    const netNewCompanyIdSet = new Set<number>(netNewCompanyRows.map(r => Number(r.company_id)));

    const targetCompanyRows = await runQuery(
      `SELECT DISTINCT a.company_id FROM conference_targets ct
       JOIN attendees a ON ct.attendee_id = a.id
       WHERE ct.conference_id = ${cid} AND a.company_id IS NOT NULL`
    );
    const targetCompanyIdSet = new Set<number>(targetCompanyRows.map(r => Number(r.company_id)));

    const companyFollowupRows = await runQuery(
      `SELECT a.company_id,
         COUNT(DISTINCT f.id) AS followups_created,
         COUNT(DISTINCT CASE WHEN f.completed = 1 THEN f.id END) AS followups_completed
       FROM follow_ups f
       JOIN attendees a ON f.attendee_id = a.id
       WHERE f.conference_id = ${cid} AND a.company_id IS NOT NULL
       GROUP BY a.company_id`
    );
    const companyFollowupMap = new Map<number, { created: number; completed: number }>();
    for (const r of companyFollowupRows) {
      companyFollowupMap.set(Number(r.company_id), {
        created: Number(r.followups_created ?? 0),
        completed: Number(r.followups_completed ?? 0),
      });
    }

    // ── Rep attribution (TypeScript logic, company-level) ──────────────────
    interface RepAcc {
      companies: Set<number>;
      icpCompanies: Set<number>;
      netNewCompanies: Set<number>;
      targetCompanies: Set<number>;
      meetingCompanies: Set<number>;
      pipelineInfluence: number;
      meetingsHeld: number;
      meetingsScheduled: number;
      touchpoints: number;
      eventAttendees: number;
      followupsCreated: number;
      followupsCompleted: number;
    }
    const repAccMap = new Map<string, RepAcc>();
    const getAcc = (name: string): RepAcc => {
      if (!repAccMap.has(name)) repAccMap.set(name, {
        companies: new Set(), icpCompanies: new Set(), netNewCompanies: new Set(),
        targetCompanies: new Set(), meetingCompanies: new Set(),
        pipelineInfluence: 0, meetingsHeld: 0, meetingsScheduled: 0,
        touchpoints: 0, eventAttendees: 0, followupsCreated: 0, followupsCompleted: 0,
      });
      return repAccMap.get(name)!;
    };

    // Group meeting engagements by company (use resolved names)
    type EngRow = { repNames: string[]; seniority: string; heldCount: number; scheduledCount: number };
    const compEngByCompany = new Map<number, EngRow[]>();
    for (const me of meetingEngagements) {
      const compId = Number(me.company_id);
      const repNames = resolveRep(me.scheduled_by);
      const row: EngRow = { repNames, seniority: String(me.seniority ?? ''), heldCount: Number(me.held_count ?? 0), scheduledCount: Number(me.scheduled_count ?? 0) };
      if (!compEngByCompany.has(compId)) compEngByCompany.set(compId, []);
      compEngByCompany.get(compId)!.push(row);
    }

    // Resolved internal attendee names
    const internalAttendeeNames = new Set<string>(
      Array.from(internalAttendeeIds).map(id => repNameMap.get(id) ?? id)
    );

    for (const pi of companyPipeline) {
      const compId = Number(pi.company_id);
      const piValue = Number(pi.pipeline_influence_value ?? 0);
      const engagements = compEngByCompany.get(compId) ?? [];
      const assignedRawIds = companyAssignedMap.get(compId) ?? [];
      const assignedNames = assignedRawIds.map(id => repNameMap.get(id) ?? id);

      // Which assigned reps are internal attendees at this conference?
      const assignedAtConf = assignedNames.filter(n => internalAttendeeNames.has(n));

      // All reps who engaged
      const allEngagingReps = new Set<string>();
      for (const eng of engagements) for (const n of eng.repNames) allEngagingReps.add(n);

      // Meeting/sched counts (split equally among co-schedulers)
      for (const eng of engagements) {
        const share = eng.repNames.length > 0 ? 1 / eng.repNames.length : 0;
        for (const n of eng.repNames) {
          const acc = getAcc(n);
          acc.companies.add(compId);
          if (icpCompanyIdSet.has(compId)) acc.icpCompanies.add(compId);
          if (netNewCompanyIdSet.has(compId)) acc.netNewCompanies.add(compId);
          if (targetCompanyIdSet.has(compId)) acc.targetCompanies.add(compId);
          if (eng.heldCount > 0) acc.meetingCompanies.add(compId);
          acc.meetingsHeld += eng.heldCount * share;
          acc.meetingsScheduled += eng.scheduledCount * share;
        }
      }

      // Touchpoints / social events attributed by meeting-engagement presence
      const tp = companyTouchpointMap.get(compId) ?? 0;
      const ev = companySocialMap.get(compId) ?? 0;
      if (allEngagingReps.size > 0) {
        const perRep = 1 / allEngagingReps.size;
        Array.from(allEngagingReps).forEach(n => {
          getAcc(n).touchpoints += tp * perRep;
          getAcc(n).eventAttendees += ev * perRep;
        });
      }

      if (piValue === 0) continue;

      let attribution: Map<string, number>;

      if (assignedAtConf.length === 0) {
        // No assigned reps at this conf → credit whoever engaged
        const reps = allEngagingReps.size > 0 ? Array.from(allEngagingReps) : assignedNames;
        const share = piValue / (reps.length || 1);
        attribution = new Map(reps.map(n => [n, share]));
      } else {
        // Seniority-based attribution among assigned reps who are at the conference
        const repBestPriority = new Map<string, string>();
        for (const eng of engagements) {
          for (const repName of eng.repNames) {
            if (!assignedAtConf.includes(repName)) continue;
            const priority = seniorityPriority[eng.seniority] ?? 'Low';
            const cur = repBestPriority.get(repName);
            if (!cur || (PRIORITY_RANK[priority] ?? 0) > (PRIORITY_RANK[cur] ?? 0)) {
              repBestPriority.set(repName, priority);
            }
          }
        }

        if (repBestPriority.size === 0) {
          const share = piValue / (allEngagingReps.size || 1);
          attribution = new Map(Array.from(allEngagingReps).map(n => [n, share]));
        } else {
          const tierReps: Record<string, string[]> = { High: [], Medium: [], Low: [] };
          Array.from(repBestPriority.entries()).forEach(([n, p]) => {
            if (p === 'Ignore' || p === 'ignore') return;
            (tierReps[p] = tierReps[p] ?? []).push(n);
          });
          const activeTiers = (['High', 'Medium', 'Low'] as const).filter(t => tierReps[t]?.length > 0);
          const totalW = activeTiers.reduce((s, t) => s + (PRIORITY_WEIGHT[t] ?? 0), 0);
          attribution = new Map();
          for (const tier of activeTiers) {
            const tierPI = (PRIORITY_WEIGHT[tier] / (totalW || 1)) * piValue;
            const perRep = tierPI / tierReps[tier].length;
            for (const n of tierReps[tier]) attribution.set(n, (attribution.get(n) ?? 0) + perRep);
          }
        }
      }

      Array.from(attribution.entries()).forEach(([n, share]) => { getAcc(n).pipelineInfluence += share; });
    }

    // Second pass: attribute follow-ups to reps via company portfolio (equal share)
    const companyToRepsMap = new Map<number, Set<string>>();
    Array.from(repAccMap.entries()).forEach(([name, acc]) => {
      Array.from(acc.companies).forEach(compId => {
        if (!companyToRepsMap.has(compId)) companyToRepsMap.set(compId, new Set());
        companyToRepsMap.get(compId)!.add(name);
      });
    });
    Array.from(companyFollowupMap.entries()).forEach(([compId, fu]) => {
      const repsForComp = companyToRepsMap.get(compId);
      if (!repsForComp || repsForComp.size === 0) return;
      const share = 1 / repsForComp.size;
      Array.from(repsForComp).forEach(repName => {
        const acc = repAccMap.get(repName);
        if (!acc) return;
        acc.followupsCreated += fu.created * share;
        acc.followupsCompleted += fu.completed * share;
      });
    });

    const totalRepPI = Array.from(repAccMap.values()).reduce((s, r) => s + r.pipelineInfluence, 0);
    const repAttribution = Array.from(repAccMap.entries())
      .sort(([, a], [, b]) => b.pipelineInfluence - a.pipelineInfluence)
      .map(([name, acc]) => ({
        rep: name,
        meetings_held: Math.round(acc.meetingsHeld),
        meetings_scheduled: Math.round(acc.meetingsScheduled),
        unique_companies_met: acc.companies.size,
        touchpoints: Math.round(acc.touchpoints),
        event_attendees: Math.round(acc.eventAttendees),
        pipeline_influence_attributed: Math.round(acc.pipelineInfluence),
        contribution_pct: totalRepPI > 0 ? Math.round(acc.pipelineInfluence / totalRepPI * 1000) / 10 : 0,
      }));

    // ── Audience / CMO Metrics ──────────────────────────────────────────────
    const icpCoverage = (await runQuery(
      `${w}
       SELECT
         COUNT(DISTINCT CASE WHEN ce.icp='Yes' THEN ce.company_id END) AS icp_companies_total,
         COUNT(DISTINCT CASE WHEN ce.icp='Yes' AND ce.is_engaged=1 THEN ce.company_id END) AS icp_companies_engaged,
         (SELECT COUNT(DISTINCT ca2.attendee_id) FROM conference_attendees ca2 WHERE ca2.conference_id = ${cid}) AS total_attendees,
         (SELECT COUNT(DISTINCT ca2.attendee_id) FROM conference_attendees ca2
           JOIN attendees a2 ON ca2.attendee_id = a2.id
           JOIN companies co2 ON a2.company_id = co2.id
           WHERE ca2.conference_id = ${cid} AND co2.icp = 'Yes') AS icp_attendees,
         ROUND(
           (SELECT COUNT(DISTINCT ca2.attendee_id) FROM conference_attendees ca2
             JOIN attendees a2 ON ca2.attendee_id = a2.id
             JOIN companies co2 ON a2.company_id = co2.id
             WHERE ca2.conference_id = ${cid} AND co2.icp = 'Yes') * 100.0
           / NULLIF((SELECT COUNT(DISTINCT ca2.attendee_id) FROM conference_attendees ca2 WHERE ca2.conference_id = ${cid}), 0),
         1) AS icp_attendee_coverage_pct,
         ROUND(
           COUNT(DISTINCT CASE WHEN ce.icp='Yes' AND ce.is_engaged=1 THEN ce.company_id END)*100.0
           / NULLIF(COUNT(DISTINCT CASE WHEN ce.icp='Yes' THEN ce.company_id END), 0),
         1) AS icp_company_engagement_pct
       FROM company_engagement ce`
    ))[0] ?? {};

    const seniorityMix = await runQuery(
      `${w}
       SELECT
         a.seniority,
         COUNT(DISTINCT ca.attendee_id) AS total_count,
         COUNT(DISTINCT CASE WHEN ce.is_engaged=1 THEN ca.attendee_id END) AS engaged_count,
         ROUND(COUNT(DISTINCT CASE WHEN ce.is_engaged=1 THEN ca.attendee_id END)*100.0/NULLIF(COUNT(DISTINCT ca.attendee_id),0),1) AS engagement_pct
       FROM conference_attendees ca
       JOIN attendees a ON ca.attendee_id=a.id
       LEFT JOIN company_engagement ce ON a.company_id=ce.company_id
       WHERE ca.conference_id=${cid}
       GROUP BY a.seniority ORDER BY engaged_count DESC`
    );

    const accountPenetration = (await runQuery(
      `${w}
       SELECT
         COUNT(DISTINCT ca.attendee_id) AS total_attendees,
         COUNT(DISTINCT a.company_id) AS unique_companies,
         ROUND(COUNT(DISTINCT ca.attendee_id)*1.0/NULLIF(COUNT(DISTINCT a.company_id),0),2) AS avg_contacts_per_company,
         COUNT(DISTINCT CASE WHEN ce.is_engaged=1 THEN ca.attendee_id END) AS engaged_attendees,
         COUNT(DISTINCT CASE WHEN ce.is_engaged=1 THEN a.company_id END) AS engaged_companies,
         ROUND(COUNT(DISTINCT CASE WHEN ce.is_engaged=1 THEN ca.attendee_id END)*1.0/NULLIF(COUNT(DISTINCT CASE WHEN ce.is_engaged=1 THEN a.company_id END),0),2) AS avg_engaged_contacts_per_company
       FROM conference_attendees ca
       JOIN attendees a ON ca.attendee_id=a.id
       LEFT JOIN company_engagement ce ON a.company_id=ce.company_id
       WHERE ca.conference_id=${cid}`
    ))[0] ?? {};

    const personaDistribution = await runQuery(
      `${w}
       SELECT
         a.function,
         COUNT(DISTINCT ca.attendee_id) AS total,
         COUNT(DISTINCT CASE WHEN ce.is_engaged=1 THEN ca.attendee_id END) AS engaged
       FROM conference_attendees ca
       JOIN attendees a ON ca.attendee_id=a.id
       LEFT JOIN company_engagement ce ON a.company_id=ce.company_id
       WHERE ca.conference_id=${cid} AND a.function IS NOT NULL
       GROUP BY a.function ORDER BY engaged DESC`
    );

    // ICP Quality Index (seniority-weighted engaged contacts at ICP companies)
    const icpQuality = (await runQuery(
      `${w}
       SELECT
         SUM(CASE a.seniority
           WHEN 'C-Suite'   THEN 4 WHEN 'BOD'      THEN 4
           WHEN 'VP/SVP'    THEN 3 WHEN 'VP Level'  THEN 3
           WHEN 'ED'        THEN 2 WHEN 'Director'  THEN 2
           ELSE 1
         END * CASE WHEN ce.is_engaged=1 THEN 1 ELSE 0 END) AS weighted_icp_score,
         COUNT(DISTINCT CASE WHEN co.icp='Yes' AND ce.is_engaged=1 THEN a.company_id END) AS icp_companies_engaged
       FROM conference_attendees ca
       JOIN attendees a   ON ca.attendee_id=a.id
       JOIN companies co  ON a.company_id=co.id AND co.icp='Yes'
       JOIN company_engagement ce ON a.company_id=ce.company_id
       WHERE ca.conference_id=${cid}`
    ))[0] ?? {};

    // ── Tier-Based Cost Efficiency Score ──────────────────────────────────────
    const unavailableMetrics: string[] = [];

    // Raw metrics
    const companiesEngaged = Number(engagementSummary.companies_engaged ?? 0);
    const meetingsHeld = Number(engagementSummary.total_held ?? 0);
    const totalPI = Number(pipelineSummary.total_pipeline_influence ?? 0);

    const costPerCompanyEngaged = (totalSpend > 0 && companiesEngaged > 0)
      ? totalSpend / companiesEngaged : null;
    const costPerMeetingHeld = (totalSpend > 0 && meetingsHeld > 0)
      ? totalSpend / meetingsHeld : null;
    const pipelinePer1k = (totalSpend > 0)
      ? totalPI / (totalSpend / 1000) : null;

    if (costPerCompanyEngaged == null) unavailableMetrics.push('cost_per_company_engaged');
    if (costPerMeetingHeld == null) unavailableMetrics.push('cost_per_meeting_held');
    if (pipelinePer1k == null) unavailableMetrics.push('pipeline_per_1k');

    // Component scores
    const bCPC = cesBenchmarks.cost_per_company;
    const companyScore = costPerCompanyEngaged != null
      ? scoreLowerIsBetter(costPerCompanyEngaged, bCPC.elite_max, bCPC.strong_max, bCPC.healthy_max, bCPC.weak_max)
      : null;

    const bCPM = cesBenchmarks.cost_per_meeting;
    const meetingScore = costPerMeetingHeld != null
      ? scoreLowerIsBetter(costPerMeetingHeld, bCPM.elite_max, bCPM.strong_max, bCPM.healthy_max, bCPM.weak_max)
      : null;

    const bPI = cesBenchmarks.pipeline_per_1k;
    const pipelineScore = pipelinePer1k != null
      ? scoreHigherIsBetter(pipelinePer1k, bPI.elite_min, bPI.strong_min, bPI.healthy_min, bPI.weak_min)
      : null;

    // Weighted raw score (handle unavailable metrics by redistributing weights)
    let rawWeight = 0;
    let rawScore = 0;
    if (pipelineScore != null) { rawScore += pipelineScore.score * 0.50; rawWeight += 0.50; }
    if (companyScore != null)  { rawScore += companyScore.score * 0.30;  rawWeight += 0.30; }
    if (meetingScore != null)  { rawScore += meetingScore.score * 0.20;  rawWeight += 0.20; }

    const costEfficiencyScoreRaw = rawWeight > 0 ? Math.round(rawScore / rawWeight) : 0;
    const calculationConfidence = rawWeight >= 1.0 ? 'full' : rawWeight >= 0.5 ? 'partial' : 'low';

    // Event type modifier
    const defaultModifier = eventModifiers[confEventType] ?? 0;
    const modifier = confModifierOverride != null ? confModifierOverride : defaultModifier;
    const modifierReason = confModifierReason || (confModifierOverride != null
      ? 'Manual override'
      : `Default for ${confEventType.replace(/_/g, ' ')}`);

    const adjustedScore = Math.max(0, Math.min(100, costEfficiencyScoreRaw + modifier));

    const costEfficiency = {
      total_spend: totalSpend,
      cost_per_company_engaged: costPerCompanyEngaged != null ? Math.round(costPerCompanyEngaged) : null,
      cost_per_meeting_held: costPerMeetingHeld != null ? Math.round(costPerMeetingHeld) : null,
      pipeline_influence_per_1k_spent: pipelinePer1k != null ? Math.round(pipelinePer1k) : null,
      cost_per_icp_interaction: (totalSpend > 0 && Number(icpCoverage.icp_companies_engaged ?? 0) > 0)
        ? Math.round(totalSpend / Number(icpCoverage.icp_companies_engaged))
        : null,
      // Component scores
      company_engaged_score: companyScore?.score ?? null,
      company_engaged_tier: companyScore?.tier ?? null,
      meeting_held_score: meetingScore?.score ?? null,
      meeting_held_tier: meetingScore?.tier ?? null,
      pipeline_influence_score: pipelineScore?.score ?? null,
      pipeline_influence_tier: pipelineScore?.tier ?? null,
      // Final scores
      cost_efficiency_score_raw: costEfficiencyScoreRaw,
      adjusted_cost_efficiency_score: adjustedScore,
      cost_efficiency_score: adjustedScore,  // alias for backward compat
      // Event type info
      event_type: confEventType,
      cost_efficiency_modifier: modifier,
      cost_efficiency_modifier_reason: modifierReason,
      // Interpretation
      cost_efficiency_tier: cesTier(adjustedScore),
      cost_efficiency_interpretation: cesInterpretation(adjustedScore),
      // Diagnostics
      unavailable_metrics: unavailableMetrics,
      calculation_confidence: calculationConfidence,
    };

    // dim7: use adjusted score
    const dim7CostEfficiency = adjustedScore;

    // ── Rep Cost Efficiency Scoring (equal-share allocation) ───────────────
    const numReps = repAttribution.length;
    const repAllocatedCost = numReps > 0 ? totalSpend / numReps : 0;
    const repCostEfficiency = repAttribution.map(rep => {
      const repUnavailable: string[] = [];

      const repCPCE = (repAllocatedCost > 0 && rep.unique_companies_met > 0)
        ? repAllocatedCost / rep.unique_companies_met : null;
      const repCPMH = (repAllocatedCost > 0 && rep.meetings_held > 0)
        ? repAllocatedCost / rep.meetings_held : null;
      const repPIper1k = (repAllocatedCost > 0)
        ? rep.pipeline_influence_attributed / (repAllocatedCost / 1000) : null;

      if (repCPCE == null) repUnavailable.push('cost_per_company_engaged');
      if (repCPMH == null) repUnavailable.push('cost_per_meeting_held');
      if (repPIper1k == null) repUnavailable.push('pipeline_per_1k');

      const repCompanyScore = repCPCE != null
        ? scoreLowerIsBetter(repCPCE, bCPC.elite_max, bCPC.strong_max, bCPC.healthy_max, bCPC.weak_max)
        : null;
      const repMeetingScore = repCPMH != null
        ? scoreLowerIsBetter(repCPMH, bCPM.elite_max, bCPM.strong_max, bCPM.healthy_max, bCPM.weak_max)
        : null;
      const repPipelineScore = repPIper1k != null
        ? scoreHigherIsBetter(repPIper1k, bPI.elite_min, bPI.strong_min, bPI.healthy_min, bPI.weak_min)
        : null;

      let rW = 0, rS = 0;
      if (repPipelineScore != null) { rS += repPipelineScore.score * 0.50; rW += 0.50; }
      if (repCompanyScore != null)  { rS += repCompanyScore.score  * 0.30; rW += 0.30; }
      if (repMeetingScore != null)  { rS += repMeetingScore.score  * 0.20; rW += 0.20; }
      const repRawScore = rW > 0 ? Math.max(0, Math.min(100, Math.round(rS / rW))) : 0;

      return {
        rep: rep.rep,
        rep_allocated_cost: Math.round(repAllocatedCost),
        unique_companies_engaged_by_rep: rep.unique_companies_met,
        meetings_held_by_rep: rep.meetings_held,
        rep_pipeline_influenced_amount: rep.pipeline_influence_attributed,
        rep_cost_per_company_engaged: repCPCE != null ? Math.round(repCPCE) : null,
        rep_cost_per_meeting_held: repCPMH != null ? Math.round(repCPMH) : null,
        rep_pipeline_influence_per_1000: repPIper1k != null ? Math.round(repPIper1k) : null,
        rep_company_score: repCompanyScore?.score ?? null,
        rep_company_score_tier: repCompanyScore?.tier ?? null,
        rep_meeting_score: repMeetingScore?.score ?? null,
        rep_meeting_score_tier: repMeetingScore?.tier ?? null,
        rep_pipeline_score: repPipelineScore?.score ?? null,
        rep_pipeline_score_tier: repPipelineScore?.tier ?? null,
        rep_cost_efficiency_score_raw: repRawScore,
        rep_cost_efficiency_tier: cesTier(repRawScore),
        rep_cost_efficiency_interpretation: cesInterpretation(repRawScore),
        unavailable_metrics: repUnavailable,
        calculation_confidence: rW >= 1.0 ? 'full' : rW >= 0.5 ? 'partial' : 'low',
      };
    });

    // ── Rep Conference Effectiveness Score (CES by Rep) ─────────────────────
    const totalCompaniesAtConf = Number(engagementSummary.total_companies ?? 0);
    const totalIcpAtConf = Number(icpCoverage.icp_companies_total ?? 0);
    const totalTargetAtConf = targetCompanyIdSet.size || Number(targetEngagement.targets_total ?? 0);
    const expectedReturnForRepCES = Number(effDefaults.expected_return_on_event_cost ?? 0);

    const repCES = repAttribution.map((rep) => {
      const acc = repAccMap.get(rep.rep);
      if (!acc) return null;

      const repCostEffRow = repCostEfficiency.find(r => r.rep === rep.rep);
      const dim5CostEff = repCostEffRow ? Number(repCostEffRow.rep_cost_efficiency_score_raw ?? 0) : null;

      const repCompaniesEngaged = acc.companies.size;
      const repIcpEngaged = acc.icpCompanies.size;
      const repNetNew = acc.netNewCompanies.size;
      const repTargetEngaged = acc.targetCompanies.size;
      const repMeetingComps = acc.meetingCompanies.size;
      const repFollowupsCreated = acc.followupsCreated;
      const repFollowupsCompleted = acc.followupsCompleted;

      // Companies with meeting held AND follow-up
      const meetingAndFuCount = Array.from(acc.meetingCompanies)
        .filter(compId => { const fu = companyFollowupMap.get(compId); return fu != null && fu.created > 0; })
        .length;

      // Dim 1: ICP & Target Quality
      const icpRate = totalIcpAtConf > 0 ? repIcpEngaged / totalIcpAtConf * 100 : null;
      const targetRate = totalTargetAtConf > 0 ? repTargetEngaged / totalTargetAtConf * 100 : null;
      let dim1: number | null;
      if (icpRate != null && targetRate != null) dim1 = icpRate * 0.5 + targetRate * 0.5;
      else dim1 = icpRate ?? targetRate ?? null;

      // Dim 2: Meeting Execution
      const holdRate = rep.meetings_scheduled > 0 ? rep.meetings_held / rep.meetings_scheduled * 100 : null;
      const fuSchedRate = repMeetingComps > 0 ? meetingAndFuCount / repMeetingComps * 100 : null;
      let dim2: number | null;
      if (holdRate != null && fuSchedRate != null) dim2 = holdRate * 0.5 + fuSchedRate * 0.5;
      else dim2 = holdRate ?? fuSchedRate ?? null;

      // Dim 3: Pipeline Influence Index
      const dim3 = (repAllocatedCost > 0 && expectedReturnForRepCES > 0)
        ? Math.min(rep.pipeline_influence_attributed / (repAllocatedCost * expectedReturnForRepCES) * 100, 100)
        : null;

      // Dim 4: Engagement Breadth
      const dim4 = totalCompaniesAtConf > 0 ? repCompaniesEngaged / totalCompaniesAtConf * 100 : null;

      // Dim 5: Cost Efficiency (from repCostEfficiency)
      const dim5 = dim5CostEff;

      // Dim 6: Follow-up Execution
      const dim6 = repFollowupsCreated > 0 ? repFollowupsCompleted / repFollowupsCreated * 100 : null;

      // Dim 7: Net-New Engaged
      const dim7 = repCompaniesEngaged > 0 ? repNetNew / repCompaniesEngaged * 100 : null;

      const dims = [
        { key: 'icp_target_quality', val: dim1, w: 0.20 },
        { key: 'meeting_execution',  val: dim2, w: 0.20 },
        { key: 'pipeline_influence', val: dim3, w: 0.30 },
        { key: 'engagement_breadth', val: dim4, w: 0.05 },
        { key: 'cost_efficiency',    val: dim5, w: 0.10 },
        { key: 'followup_execution', val: dim6, w: 0.10 },
        { key: 'net_new_engaged',    val: dim7, w: 0.05 },
      ];

      const available = dims.filter(d => d.val != null);
      const unavailableComponents = dims.filter(d => d.val == null).map(d => d.key);
      const totalAvailableWeight = available.reduce((s, d) => s + d.w, 0);

      let score = 0;
      const effectiveWeights: Record<string, number> = {};
      for (const d of available) {
        const eff = d.w / (totalAvailableWeight || 1);
        effectiveWeights[d.key] = Math.round(eff * 100);
        score += (d.val ?? 0) * eff;
      }
      const finalScore = Math.max(0, Math.min(100, Math.round(score)));

      return {
        rep: rep.rep,
        rep_ces_score: finalScore,
        rep_ces_tier: cesTier(finalScore),
        rep_ces_interpretation: cesInterpretation(finalScore),
        rep_dim1_icp_target: dim1 != null ? Math.round(dim1 * 10) / 10 : null,
        rep_dim2_meeting_exec: dim2 != null ? Math.round(dim2 * 10) / 10 : null,
        rep_dim3_pipeline_index: dim3 != null ? Math.round(dim3 * 10) / 10 : null,
        rep_dim4_breadth: dim4 != null ? Math.round(dim4 * 10) / 10 : null,
        rep_dim5_cost_efficiency: dim5,
        rep_dim6_followup: dim6 != null ? Math.round(dim6 * 10) / 10 : null,
        rep_dim7_net_new: dim7 != null ? Math.round(dim7 * 10) / 10 : null,
        rep_pipeline_influenced: rep.pipeline_influence_attributed,
        rep_companies_engaged: repCompaniesEngaged,
        unavailable_components: unavailableComponents,
        effective_weights: effectiveWeights,
        calculation_confidence: totalAvailableWeight >= 1.0 ? 'full' : totalAvailableWeight >= 0.5 ? 'partial' : 'low',
        supporting_metrics: {
          rep_icp_companies_engaged: repIcpEngaged,
          rep_target_accounts_engaged: repTargetEngaged,
          rep_companies_engaged: repCompaniesEngaged,
          rep_meetings_scheduled: rep.meetings_scheduled,
          rep_meetings_held: rep.meetings_held,
          rep_meeting_companies: repMeetingComps,
          rep_meeting_and_fu_companies: meetingAndFuCount,
          rep_followups_created: Math.round(repFollowupsCreated),
          rep_followups_completed: Math.round(repFollowupsCompleted),
          rep_net_new_logos_engaged: repNetNew,
        },
      };
    }).filter(Boolean);

    // ── Conference Effectiveness Score (CES) ────────────────────────────────
    const dim1IcpTarget =
      (Number(icpCoverage.icp_company_engagement_pct ?? 0) * 0.5) +
      (Number(targetEngagement.target_engagement_pct ?? 0) * 0.5);

    const dim2MeetingExec =
      (Number(engagementSummary.hold_rate_pct ?? 0) * 0.5) +
      (Number(engagementSummary.fu_scheduling_rate_pct ?? 0) * 0.5);

    const expectedReturn = Number(effDefaults.expected_return_on_event_cost ?? 0);
    const targetInfluence = totalSpend > 0 && expectedReturn > 0
      ? totalSpend * expectedReturn
      : null;
    const dim3PipelineIndex = targetInfluence
      ? Math.min(Number(pipelineSummary.total_pipeline_influence ?? 0) / targetInfluence * 100, 100)
      : 0;

    const dim4Breadth = Number(engagementSummary.engagement_rate_pct ?? 0);

    const dim5Followup = Number(engagementSummary.followup_completion_rate_pct ?? 0);

    const totalEngaged = Number(engagementSummary.companies_engaged ?? 0);
    const dim6NetNew = totalEngaged > 0
      ? Math.min(Number(netNewLogos.net_new_logos ?? 0) / totalEngaged * 100, 100)
      : 0;

    const ces = Math.round(
      (dim1IcpTarget * 0.20) +
      (dim2MeetingExec * 0.20) +
      (dim3PipelineIndex * 0.30) +
      (dim4Breadth * 0.05) +
      (dim7CostEfficiency * 0.10) +
      (dim5Followup * 0.10) +
      (dim6NetNew * 0.05)
    );

    // Conference rank by cost efficiency score
    let confRank = 1;
    let totalConferences = 1;
    try {
      const rankRows = await runQuery(
        `WITH all_meetings AS (
           SELECT m.conference_id, a.company_id,
             COUNT(CASE WHEN cop.action_key='meeting_held' THEN m.id END) AS mtg
           FROM meetings m JOIN attendees a ON m.attendee_id = a.id
           LEFT JOIN config_options cop ON cop.category='action' AND LOWER(m.outcome) = LOWER(cop.value)
           GROUP BY m.conference_id, a.company_id
         ),
         all_tp AS (
           SELECT atp.conference_id, a.company_id, COUNT(DISTINCT atp.id) AS tp
           FROM attendee_touchpoints atp JOIN attendees a ON atp.attendee_id = a.id
           GROUP BY atp.conference_id, a.company_id
         ),
         all_he AS (
           SELECT se.conference_id, a.company_id, COUNT(DISTINCT rsvp.social_event_id) AS he
           FROM social_event_rsvps rsvp
           JOIN social_events se ON rsvp.social_event_id = se.id
           JOIN attendees a ON rsvp.attendee_id = a.id
           WHERE rsvp.rsvp_status='attended' AND se.event_type='Company Hosted'
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
             COALESCE(am.mtg,0) AS mtg, COALESCE(at2.tp,0) AS tp, COALESCE(ah.he,0) AS he,
             COALESCE(am.mtg,0)+COALESCE(at2.tp,0)+COALESCE(ah.he,0) AS ti
           FROM all_cc acc
           LEFT JOIN all_meetings am ON acc.conference_id=am.conference_id AND acc.company_id=am.company_id
           LEFT JOIN all_tp at2 ON acc.conference_id=at2.conference_id AND acc.company_id=at2.company_id
           LEFT JOIN all_he ah ON acc.conference_id=ah.conference_id AND acc.company_id=ah.company_id
           WHERE COALESCE(am.mtg,0)+COALESCE(at2.tp,0)+COALESCE(ah.he,0) > 0
         ),
         eff_d AS (
           SELECT
             MAX(CASE WHEN key='follow_up_meeting_conversion_rate' THEN CAST(value AS REAL)/100 END) AS fur,
             MAX(CASE WHEN key='touchpoint_conversion_rate' THEN CAST(value AS REAL)/100 END) AS tpr,
             MAX(CASE WHEN key='hosted_event_attendee_conversion_rate' THEN CAST(value AS REAL)/100 END) AS her,
             MAX(CASE WHEN key='avg_cost_per_unit' THEN CAST(value AS REAL) END) AS cpu,
             MAX(CASE WHEN key='avg_annual_deal_size' THEN CAST(value AS REAL) END) AS ds,
             MAX(CASE WHEN key='expected_return_on_event_cost' THEN CAST(value AS REAL) END) AS er
           FROM effectiveness_defaults
         ),
         all_pi AS (
           SELECT ae.conference_id,
             SUM(MIN(
               CASE WHEN ae.mtg>0 THEN ed.fur WHEN ae.tp>0 THEN ed.tpr WHEN ae.he>0 THEN ed.her ELSE 0 END
               * CASE WHEN ae.ti>=3 THEN 1.5 WHEN ae.ti=2 THEN 1.25 ELSE 1.0 END,
               0.95
             ) * CASE WHEN COALESCE(ae.wse,0)>0 THEN ae.wse*ed.cpu ELSE ed.ds END) AS total_pi
           FROM all_eng ae CROSS JOIN eff_d ed
           GROUP BY ae.conference_id
         ),
         all_spend AS (
           SELECT cb.conference_id,
             COALESCE(SUM(COALESCE(NULLIF(CAST(json_extract(li.value,'$.actual') AS REAL),0),
               COALESCE(CAST(json_extract(li.value,'$.budget') AS REAL),0),0)),0) AS eff_spend
           FROM conference_budget cb, json_each(cb.line_items) li
           GROUP BY cb.conference_id
         ),
         conf_ces AS (
           SELECT ap.conference_id,
             CASE WHEN COALESCE(asp.eff_spend,0)>0 AND ed.er>0
               THEN MIN(ap.total_pi/(asp.eff_spend*ed.er),1.0)*100
               ELSE 0
             END AS ces_score
           FROM all_pi ap
           LEFT JOIN all_spend asp ON ap.conference_id=asp.conference_id
           CROSS JOIN eff_d ed
         )
         SELECT COUNT(*) AS total_confs,
           SUM(CASE WHEN ces_score > ${costEfficiencyScoreRaw} THEN 1 ELSE 0 END)+1 AS rank
         FROM conf_ces`
      );
      confRank = Number(rankRows[0]?.rank ?? 1);
      totalConferences = Number(rankRows[0]?.total_confs ?? 1);
    } catch { /* ranking is optional */ }

    return NextResponse.json({
      conference: { ...confInfo, conf_event_type: confEventType },
      ces: {
        score: ces,
        dim1_icp_target: Math.round(dim1IcpTarget * 10) / 10,
        dim2_meeting_exec: Math.round(dim2MeetingExec * 10) / 10,
        dim3_pipeline_index: Math.round(dim3PipelineIndex * 10) / 10,
        dim4_breadth: Math.round(dim4Breadth * 10) / 10,
        dim5_followup: Math.round(dim5Followup * 10) / 10,
        dim6_net_new: Math.round(dim6NetNew * 10) / 10,
        dim7_cost_efficiency: dim7CostEfficiency,
        target_pipeline_influence: targetInfluence,
      },
      engagement: {
        ...engagementSummary,
        ...targetEngagement,
        hosted_attendance: hostedAttendance,
        contacts_engaged: Number(contactsEngagementRow.contacts_engaged ?? 0),
        operator_contacts_total: Number(contactsEngagementRow.operator_contacts_total ?? 0),
      },
      pipeline: {
        ...pipelineSummary,
        ...netNewLogos,
        rep_attribution: repAttribution,
        company_pipeline: companyPipeline,
      },
      audience: {
        icp_coverage: icpCoverage,
        icp_quality: icpQuality,
        seniority_mix: seniorityMix,
        account_penetration: accountPenetration,
        persona_distribution: personaDistribution,
        net_new_logos: netNewLogos,
      },
      operational: {
        line_items: lineItems,
        cost_efficiency: costEfficiency,
        annual_budget: annualBudget,
        annual_budget_year: confYear ? Number(confYear) : null,
        rep_activity: repActivity.map(r => ({ ...r, rep: resolveRep(r.rep_raw).join(', ') })),
        conf_efficiency_rank: confRank,
        conf_efficiency_total: totalConferences,
        rep_cost_efficiency: repCostEfficiency,
        rep_allocated_cost: Math.round(repAllocatedCost),
        rep_ces: repCES,
      },
      effectiveness_defaults: effDefaults,
    });
  } catch (error) {
    console.error('GET /api/conferences/[id]/effectiveness error:', error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
