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

    // Total actual spend from conference_budget line_items JSON
    const totalSpendRow = await runQuery(
      `SELECT COALESCE(SUM(CAST(json_extract(li.value, '$.actual') AS REAL)), 0) AS total_spend,
              json_group_array(json_object(
                'id', json_extract(li.value, '$.id'),
                'label', json_extract(li.value, '$.label'),
                'budget', json_extract(li.value, '$.budget'),
                'actual', json_extract(li.value, '$.actual')
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

    // ── Rep attribution (TypeScript logic, company-level) ──────────────────
    interface RepAcc {
      companies: Set<number>;
      pipelineInfluence: number;
      meetingsHeld: number;
      meetingsScheduled: number;
      touchpoints: number;
      eventAttendees: number;
    }
    const repAccMap = new Map<string, RepAcc>();
    const getAcc = (name: string): RepAcc => {
      if (!repAccMap.has(name)) repAccMap.set(name, { companies: new Set(), pipelineInfluence: 0, meetingsHeld: 0, meetingsScheduled: 0, touchpoints: 0, eventAttendees: 0 });
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

    // ── Cost Efficiency Metrics ─────────────────────────────────────────────
    const costEfficiency = {
      total_spend: totalSpend,
      cost_per_company_engaged: engagementSummary.companies_engaged
        ? Math.round(totalSpend / Number(engagementSummary.companies_engaged))
        : null,
      cost_per_meeting_held: engagementSummary.total_held
        ? Math.round(totalSpend / Number(engagementSummary.total_held))
        : null,
      pipeline_influence_per_1k_spent: totalSpend > 0
        ? Math.round(Number(pipelineSummary.total_pipeline_influence ?? 0) / (totalSpend / 1000))
        : null,
    };

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
      (dim1IcpTarget * 0.25) +
      (dim2MeetingExec * 0.20) +
      (dim3PipelineIndex * 0.20) +
      (dim4Breadth * 0.15) +
      (dim5Followup * 0.10) +
      (dim6NetNew * 0.10)
    );

    return NextResponse.json({
      conference: confInfo,
      ces: {
        score: ces,
        dim1_icp_target: Math.round(dim1IcpTarget * 10) / 10,
        dim2_meeting_exec: Math.round(dim2MeetingExec * 10) / 10,
        dim3_pipeline_index: Math.round(dim3PipelineIndex * 10) / 10,
        dim4_breadth: Math.round(dim4Breadth * 10) / 10,
        dim5_followup: Math.round(dim5Followup * 10) / 10,
        dim6_net_new: Math.round(dim6NetNew * 10) / 10,
        target_pipeline_influence: targetInfluence,
      },
      engagement: {
        ...engagementSummary,
        ...targetEngagement,
        hosted_attendance: hostedAttendance,
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
      },
      effectiveness_defaults: effDefaults,
    });
  } catch (error) {
    console.error('GET /api/conferences/[id]/effectiveness error:', error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
