import type { Client } from '@libsql/client';

interface CesBenchmarks {
  pipeline_per_1k: { elite_min: number; strong_min: number; healthy_min: number; weak_min: number };
  cost_per_company: { elite_max: number; strong_max: number; healthy_max: number; weak_max: number };
  cost_per_meeting: { elite_max: number; strong_max: number; healthy_max: number; weak_max: number };
}

function scorePipelinePerK(val: number, b: CesBenchmarks): number {
  if (val >= b.pipeline_per_1k.elite_min) return 100;
  if (val >= b.pipeline_per_1k.strong_min) return 75;
  if (val >= b.pipeline_per_1k.healthy_min) return 50;
  if (val >= b.pipeline_per_1k.weak_min) return 25;
  return 10;
}

function scoreCostPerCompany(val: number, b: CesBenchmarks): number {
  if (val <= b.cost_per_company.elite_max) return 100;
  if (val <= b.cost_per_company.strong_max) return 75;
  if (val <= b.cost_per_company.healthy_max) return 50;
  if (val <= b.cost_per_company.weak_max) return 25;
  return 10;
}

function scoreCostPerMeeting(val: number, b: CesBenchmarks): number {
  if (val <= b.cost_per_meeting.elite_max) return 100;
  if (val <= b.cost_per_meeting.strong_max) return 75;
  if (val <= b.cost_per_meeting.healthy_max) return 50;
  if (val <= b.cost_per_meeting.weak_max) return 25;
  return 10;
}

// CTE fragment shared by both the per-company pipeline query and CES score query.
// Each sub-CTE is filtered to a single conference via ? parameters.
// Parameter order: conferenceId × 4 (meetings, tp, he, cc)
const ENGAGEMENT_CTES = `
  all_meetings AS (
    SELECT m.conference_id, a.company_id,
      COUNT(CASE WHEN cop.action_key='meeting_held' THEN m.id END) AS mtg
    FROM meetings m
    JOIN attendees a ON m.attendee_id = a.id
    LEFT JOIN config_options cop ON cop.category='action' AND LOWER(m.outcome) = LOWER(cop.value)
    WHERE m.conference_id = ?
    GROUP BY m.conference_id, a.company_id
  ),
  all_tp AS (
    SELECT atp.conference_id, a.company_id, COUNT(DISTINCT atp.id) AS tp
    FROM attendee_touchpoints atp JOIN attendees a ON atp.attendee_id = a.id
    WHERE atp.conference_id = ?
    GROUP BY atp.conference_id, a.company_id
  ),
  all_he AS (
    SELECT se.conference_id, a.company_id, COUNT(DISTINCT rsvp.social_event_id) AS he
    FROM social_event_rsvps rsvp
    JOIN social_events se ON rsvp.social_event_id = se.id
    JOIN attendees a ON rsvp.attendee_id = a.id
    WHERE rsvp.rsvp_status='attended' AND se.event_type='Company Hosted' AND se.conference_id = ?
    GROUP BY se.conference_id, a.company_id
  ),
  all_cc AS (
    SELECT DISTINCT ca.conference_id, a.company_id, co.wse
    FROM conference_attendees ca
    JOIN attendees a ON ca.attendee_id = a.id
    JOIN companies co ON a.company_id = co.id
    WHERE a.company_id IS NOT NULL AND ca.conference_id = ?
  ),
  all_eng AS (
    SELECT acc.conference_id, acc.company_id, acc.wse,
      COALESCE(am.mtg,0) AS mtg,
      COALESCE(at2.tp,0) AS tp,
      COALESCE(ah.he,0) AS he,
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
  )`;

export async function computeConferenceSnapshot(
  conferenceId: number,
  db: Client,
): Promise<void> {
  try {
    // Step 1 — conference record
    const confRes = await db.execute({
      sql: `SELECT id, series_id, start_date, end_date, cost_efficiency_modifier FROM conferences WHERE id = ?`,
      args: [conferenceId],
    });
    if (confRes.rows.length === 0) throw new Error(`Conference ${conferenceId} not found`);
    const conf = confRes.rows[0] as Record<string, unknown>;
    const seriesId = conf.series_id ? String(conf.series_id) : null;
    const startDate = String(conf.start_date ?? '');
    const costEfficiencyModifier = conf.cost_efficiency_modifier != null
      ? Number(conf.cost_efficiency_modifier) : 0;

    // Step 2 — total cost from conference_budget.line_items
    const budgetRes = await db.execute({
      sql: `SELECT line_items FROM conference_budget WHERE conference_id = ?`,
      args: [conferenceId],
    });
    let totalCost: number | null = null;
    if (budgetRes.rows.length > 0) {
      type LineItem = { actual?: number | null; budget?: number | null };
      const lineItems: LineItem[] = JSON.parse(String(budgetRes.rows[0].line_items ?? '[]'));
      const sum = lineItems.reduce((acc, item) => acc + (item.actual ?? item.budget ?? 0), 0);
      if (sum > 0) totalCost = sum;
    }

    // Step 3 — per-company pipeline contributions (CES all_pi logic, filtered to this conference)
    const piRes = await db.execute({
      sql: `WITH ${ENGAGEMENT_CTES}
            SELECT ae.company_id,
              MIN(
                CASE WHEN ae.mtg>0 THEN ed.fur WHEN ae.tp>0 THEN ed.tpr WHEN ae.he>0 THEN ed.her ELSE 0 END
                * CASE WHEN ae.ti>=3 THEN 1.5 WHEN ae.ti=2 THEN 1.25 ELSE 1.0 END,
                0.95
              ) * CASE WHEN COALESCE(ae.wse,0)>0 THEN ae.wse*ed.cpu ELSE ed.ds END AS company_pi
            FROM all_eng ae CROSS JOIN eff_d ed`,
      args: [conferenceId, conferenceId, conferenceId, conferenceId],
    });

    const companiesEngaged = piRes.rows.length;

    // Step 4 — prior companies for net-new vs continued split
    const priorRes = await db.execute({
      sql: `SELECT DISTINCT a.company_id
            FROM attendees a
            JOIN conference_attendees ca ON ca.attendee_id = a.id
            JOIN conferences c ON c.id = ca.conference_id
            WHERE a.company_id IS NOT NULL
              AND c.end_date < ?
              AND ca.conference_id != ?`,
      args: [startDate, conferenceId],
    });
    const priorCompanyIds = new Set(priorRes.rows.map(r => Number(r.company_id)));

    let totalPi = 0;
    let pipelineNetNew = 0;
    let pipelineContinued = 0;
    for (const row of piRes.rows) {
      const cid = Number(row.company_id);
      const pi = Number(row.company_pi ?? 0);
      totalPi += pi;
      if (priorCompanyIds.has(cid)) pipelineContinued += pi;
      else pipelineNetNew += pi;
    }
    const pipelineInfluenced = totalPi > 0 ? totalPi : null;
    const pipelineNetNewVal = pipelineInfluenced != null ? pipelineNetNew : null;
    const pipelineContinuedVal = pipelineInfluenced != null ? pipelineContinued : null;

    // Step 5 — meetings held count (for cost_per_meeting)
    const meetingsHeldRes = await db.execute({
      sql: `SELECT COUNT(*) as n
            FROM meetings m
            LEFT JOIN config_options cop ON cop.category='action' AND LOWER(m.outcome) = LOWER(cop.value)
            WHERE m.conference_id = ? AND cop.action_key = 'meeting_held'`,
      args: [conferenceId],
    });
    const meetingsHeld = Number(meetingsHeldRes.rows[0]?.n ?? 0);

    // Step 6 — cost efficiency sub-metrics
    const pipelinePerK = totalCost && totalCost > 0 ? (totalPi / totalCost) * 1000 : null;
    const costPerCompany = totalCost && companiesEngaged > 0 ? totalCost / companiesEngaged : null;
    const costPerMeeting = totalCost && meetingsHeld > 0 ? totalCost / meetingsHeld : null;

    // Step 7 — cost efficiency score (weighted blend of three sub-metrics vs benchmark tiers)
    let costEfficiencyScore: number | null = null;
    const benchmarksRes = await db.execute({
      sql: `SELECT value FROM effectiveness_defaults WHERE key = 'ces_benchmarks'`,
      args: [],
    });
    if (benchmarksRes.rows.length > 0) {
      try {
        const benchmarks = JSON.parse(String(benchmarksRes.rows[0].value)) as CesBenchmarks;
        const subScores: { score: number; weight: number }[] = [];
        if (pipelinePerK != null) subScores.push({ score: scorePipelinePerK(pipelinePerK, benchmarks), weight: 0.50 });
        if (costPerCompany != null) subScores.push({ score: scoreCostPerCompany(costPerCompany, benchmarks), weight: 0.30 });
        if (costPerMeeting != null) subScores.push({ score: scoreCostPerMeeting(costPerMeeting, benchmarks), weight: 0.20 });
        if (subScores.length > 0) {
          const totalWeight = subScores.reduce((a, b) => a + b.weight, 0);
          const raw = subScores.reduce((acc, s) => acc + s.score * (s.weight / totalWeight), 0);
          costEfficiencyScore = Math.min(100, Math.max(0, raw + costEfficiencyModifier * 10));
        }
      } catch { /* malformed benchmarks — leave null */ }
    }

    // Step 8 — CES score (full CES CTE replicated with conference filter)
    const cesRes = await db.execute({
      sql: `WITH ${ENGAGEMENT_CTES},
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
              WHERE cb.conference_id = ?
              GROUP BY cb.conference_id
            )
            SELECT
              CASE WHEN COALESCE(asp.eff_spend,0)>0 AND ed.er>0
                THEN ROUND(MIN(ap.total_pi/(asp.eff_spend*ed.er),1.0)*100)
                ELSE NULL
              END AS ces_score
            FROM all_pi ap
            LEFT JOIN all_spend asp ON ap.conference_id=asp.conference_id
            CROSS JOIN eff_d ed`,
      args: [conferenceId, conferenceId, conferenceId, conferenceId, conferenceId],
    });
    const cesScore = cesRes.rows.length > 0 && cesRes.rows[0].ces_score != null
      ? Number(cesRes.rows[0].ces_score) : null;

    // Step 9 — ICP companies (using pre-computed companies.icp = 'Yes')
    const icpTotalRes = await db.execute({
      sql: `SELECT COUNT(DISTINCT a.company_id) as n
            FROM attendees a
            JOIN conference_attendees ca ON ca.attendee_id = a.id AND ca.conference_id = ?
            JOIN companies co ON co.id = a.company_id
            WHERE a.company_id IS NOT NULL AND co.icp = 'Yes'`,
      args: [conferenceId],
    });
    const icpTotal = Number(icpTotalRes.rows[0]?.n ?? 0);

    const icpEngagedRes = await db.execute({
      sql: `SELECT COUNT(DISTINCT a.company_id) as n
            FROM attendees a
            JOIN conference_attendees ca ON ca.attendee_id = a.id AND ca.conference_id = ?
            JOIN companies co ON co.id = a.company_id
            WHERE a.company_id IS NOT NULL AND co.icp = 'Yes'
              AND (
                EXISTS (SELECT 1 FROM meetings m WHERE m.attendee_id = a.id AND m.conference_id = ? AND m.source != 'simulated')
                OR EXISTS (SELECT 1 FROM follow_ups f WHERE f.attendee_id = a.id AND f.conference_id = ? AND f.source != 'simulated')
                OR EXISTS (SELECT 1 FROM attendee_touchpoints t WHERE t.attendee_id = a.id AND t.conference_id = ?)
              )`,
      args: [conferenceId, conferenceId, conferenceId, conferenceId],
    });
    const icpEngaged = Number(icpEngagedRes.rows[0]?.n ?? 0);
    const icpEngagementRate = icpTotal > 0 ? icpEngaged / icpTotal : null;

    // Step 10 — buying committee coverage rate
    // Reads required roles from product config_options metadata.buying_committee
    let buyingCommitteeCoverageRate: number | null = null;
    const productMetaRes = await db.execute({
      sql: `SELECT metadata FROM config_options WHERE category = 'product' AND metadata IS NOT NULL AND metadata != ''`,
      args: [],
    });
    const allRequiredRoles = new Set<string>();
    for (const row of productMetaRes.rows) {
      try {
        const meta = JSON.parse(String(row.metadata ?? '{}')) as Record<string, unknown>;
        if (Array.isArray(meta.buying_committee)) {
          for (const role of meta.buying_committee as string[]) allRequiredRoles.add(role);
        }
      } catch { /* skip malformed */ }
    }
    if (allRequiredRoles.size > 0 && icpEngaged > 0) {
      const engagedIcpCoRes = await db.execute({
        sql: `SELECT DISTINCT a.company_id
              FROM attendees a
              JOIN conference_attendees ca ON ca.attendee_id = a.id AND ca.conference_id = ?
              JOIN companies co ON co.id = a.company_id
              WHERE a.company_id IS NOT NULL AND co.icp = 'Yes'
                AND (
                  EXISTS (SELECT 1 FROM meetings m WHERE m.attendee_id = a.id AND m.conference_id = ? AND m.source != 'simulated')
                  OR EXISTS (SELECT 1 FROM follow_ups f WHERE f.attendee_id = a.id AND f.conference_id = ? AND f.source != 'simulated')
                  OR EXISTS (SELECT 1 FROM attendee_touchpoints t WHERE t.attendee_id = a.id AND t.conference_id = ?)
                )`,
        args: [conferenceId, conferenceId, conferenceId, conferenceId],
      });
      let fullCommitteeCount = 0;
      for (const coRow of engagedIcpCoRes.rows) {
        const companyId = Number(coRow.company_id);
        const coAttendeesRes = await db.execute({
          sql: `SELECT a.function, a.seniority
                FROM attendees a
                JOIN conference_attendees ca ON ca.attendee_id = a.id AND ca.conference_id = ?
                WHERE a.company_id = ?`,
          args: [conferenceId, companyId],
        });
        const presentRoles = new Set<string>();
        for (const r of coAttendeesRes.rows) {
          if (r.function) presentRoles.add(String(r.function));
          if (r.seniority) presentRoles.add(String(r.seniority));
        }
        if (Array.from(allRequiredRoles).every(role => presentRoles.has(role))) fullCommitteeCount++;
      }
      buyingCommitteeCoverageRate = icpEngaged > 0 ? fullCommitteeCount / icpEngaged : null;
    }

    // Step 11 — decision makers engaged (C-Suite/VP/SVP seniority or decision_maker buyer_role)
    // Note: attendees has no conference_id column — must join through conference_attendees
    const dmRes = await db.execute({
      sql: `SELECT COUNT(DISTINCT a.id) as n
            FROM attendees a
            JOIN conference_attendees ca ON ca.attendee_id = a.id AND ca.conference_id = ?
            WHERE (
              a.seniority IN ('C-Suite', 'VP/SVP')
              OR EXISTS (
                SELECT 1 FROM title_normalization_rules tnr
                WHERE tnr.raw_title = a.title AND tnr.buyer_role = 'decision_maker'
              )
            )
            AND (
              EXISTS (SELECT 1 FROM meetings m WHERE m.attendee_id = a.id AND m.conference_id = ? AND m.source != 'simulated')
              OR EXISTS (SELECT 1 FROM follow_ups f WHERE f.attendee_id = a.id AND f.conference_id = ? AND f.source != 'simulated')
              OR EXISTS (SELECT 1 FROM attendee_touchpoints t WHERE t.attendee_id = a.id AND t.conference_id = ?)
            )`,
      args: [conferenceId, conferenceId, conferenceId, conferenceId],
    });
    const decisionMakersEngaged = Number(dmRes.rows[0]?.n ?? 0);

    // Step 12 — meeting hold rate
    const scheduledRes = await db.execute({
      sql: `SELECT COUNT(*) as n FROM meetings WHERE conference_id = ? AND source != 'simulated'`,
      args: [conferenceId],
    });
    const heldRes = await db.execute({
      sql: `SELECT COUNT(*) as n FROM meetings WHERE conference_id = ? AND outcome IS NOT NULL AND outcome != 'No Show' AND source != 'simulated'`,
      args: [conferenceId],
    });
    const scheduledCount = Number(scheduledRes.rows[0]?.n ?? 0);
    const heldCount = Number(heldRes.rows[0]?.n ?? 0);
    const meetingHoldRate = scheduledCount > 0 ? heldCount / scheduledCount : null;

    // Step 13 — follow-up scheduling rate
    // = companies that had a held meeting AND at least one follow-up / companies with a held meeting
    const coWithHeldRes = await db.execute({
      sql: `SELECT DISTINCT a.company_id
            FROM meetings m
            JOIN attendees a ON a.id = m.attendee_id
            WHERE m.conference_id = ? AND m.source != 'simulated'
              AND m.outcome IS NOT NULL AND m.outcome != 'No Show'
              AND a.company_id IS NOT NULL`,
      args: [conferenceId],
    });
    const coWithHeld = new Set(coWithHeldRes.rows.map(r => Number(r.company_id)));
    let coWithFollowUpCount = 0;
    if (coWithHeld.size > 0) {
      const fuCoRes = await db.execute({
        sql: `SELECT DISTINCT a.company_id
              FROM follow_ups f
              JOIN attendees a ON a.id = f.attendee_id
              WHERE f.conference_id = ? AND f.source != 'simulated'
                AND a.company_id IS NOT NULL`,
        args: [conferenceId],
      });
      for (const r of fuCoRes.rows) {
        if (coWithHeld.has(Number(r.company_id))) coWithFollowUpCount++;
      }
    }
    const followupSchedulingRate = coWithHeld.size > 0 ? coWithFollowUpCount / coWithHeld.size : null;

    // Step 14 — follow-up completion rate
    const fuCreatedRes = await db.execute({
      sql: `SELECT COUNT(*) as n FROM follow_ups WHERE conference_id = ? AND source != 'simulated'`,
      args: [conferenceId],
    });
    const fuCompletedRes = await db.execute({
      sql: `SELECT COUNT(*) as n FROM follow_ups WHERE conference_id = ? AND completed = 1 AND source != 'simulated'`,
      args: [conferenceId],
    });
    const fuCreated = Number(fuCreatedRes.rows[0]?.n ?? 0);
    const fuCompleted = Number(fuCompletedRes.rows[0]?.n ?? 0);
    const followupCompletionRate = fuCreated > 0 ? fuCompleted / fuCreated : null;

    // Step 15 — average health score of engaged attendees
    const avgHealthRes = await db.execute({
      sql: `SELECT AVG(a.health_score) as avg_hs
            FROM attendees a
            JOIN conference_attendees ca ON ca.attendee_id = a.id AND ca.conference_id = ?
            WHERE a.health_score IS NOT NULL
              AND (
                EXISTS (SELECT 1 FROM meetings m WHERE m.attendee_id = a.id AND m.conference_id = ? AND m.source != 'simulated')
                OR EXISTS (SELECT 1 FROM follow_ups f WHERE f.attendee_id = a.id AND f.conference_id = ? AND f.source != 'simulated')
                OR EXISTS (SELECT 1 FROM attendee_touchpoints t WHERE t.attendee_id = a.id AND t.conference_id = ?)
              )`,
      args: [conferenceId, conferenceId, conferenceId, conferenceId],
    });
    const avgHealthScore = avgHealthRes.rows[0]?.avg_hs != null
      ? Number(avgHealthRes.rows[0].avg_hs) : null;

    // Step 16 — returning attendee rate (requires contact_conference_history to be populated)
    let returningAttendeeRate: number | null = null;
    if (seriesId) {
      const returningRes = await db.execute({
        sql: `SELECT COUNT(*) as n
              FROM contact_conference_history cch
              WHERE cch.series_id = ?
                AND cch.interaction_count > 1
                AND cch.attendee_id IN (
                  SELECT DISTINCT a.id
                  FROM attendees a
                  JOIN conference_attendees ca ON ca.attendee_id = a.id AND ca.conference_id = ?
                  WHERE (
                    EXISTS (SELECT 1 FROM meetings m WHERE m.attendee_id = a.id AND m.conference_id = ? AND m.source != 'simulated')
                    OR EXISTS (SELECT 1 FROM follow_ups f WHERE f.attendee_id = a.id AND f.conference_id = ? AND f.source != 'simulated')
                    OR EXISTS (SELECT 1 FROM attendee_touchpoints t WHERE t.attendee_id = a.id AND t.conference_id = ?)
                  )
                )`,
        args: [seriesId, conferenceId, conferenceId, conferenceId, conferenceId],
      });
      const totalEngagedRes = await db.execute({
        sql: `SELECT COUNT(DISTINCT a.id) as n
              FROM attendees a
              JOIN conference_attendees ca ON ca.attendee_id = a.id AND ca.conference_id = ?
              WHERE (
                EXISTS (SELECT 1 FROM meetings m WHERE m.attendee_id = a.id AND m.conference_id = ? AND m.source != 'simulated')
                OR EXISTS (SELECT 1 FROM follow_ups f WHERE f.attendee_id = a.id AND f.conference_id = ? AND f.source != 'simulated')
                OR EXISTS (SELECT 1 FROM attendee_touchpoints t WHERE t.attendee_id = a.id AND t.conference_id = ?)
              )`,
        args: [conferenceId, conferenceId, conferenceId, conferenceId],
      });
      const totalEngaged = Number(totalEngagedRes.rows[0]?.n ?? 0);
      const returningCount = Number(returningRes.rows[0]?.n ?? 0);
      if (totalEngaged > 0) returningAttendeeRate = returningCount / totalEngaged;
    }

    // Step 17 — companies engaged at 3+ instances of this series
    let companies3Plus: number | null = null;
    if (seriesId) {
      const c3Res = await db.execute({
        sql: `SELECT COUNT(DISTINCT a.company_id) as n
              FROM attendees a
              JOIN contact_conference_history cch ON cch.attendee_id = a.id AND cch.series_id = ?
              WHERE cch.interaction_count >= 3
                AND a.company_id IS NOT NULL`,
        args: [seriesId],
      });
      companies3Plus = Number(c3Res.rows[0]?.n ?? 0);
    }

    // Step 18 — upsert into conference_snapshots
    await db.execute({
      sql: `INSERT INTO conference_snapshots (
              conference_id, series_id, snapshot_taken_at,
              ces_score, cost_efficiency_score,
              total_cost, pipeline_influenced, pipeline_net_new, pipeline_continued_engagement,
              pipeline_per_1k, cost_per_company_engaged, cost_per_meeting_held,
              icp_companies_total, icp_companies_engaged, icp_engagement_rate,
              buying_committee_coverage_rate, decision_makers_engaged,
              meeting_hold_rate, followup_scheduling_rate, followup_completion_rate,
              avg_health_score_engaged, returning_attendee_rate, companies_3plus_instances
            ) VALUES (?, ?, datetime('now'), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(conference_id) DO UPDATE SET
              snapshot_taken_at = datetime('now'),
              series_id = excluded.series_id,
              ces_score = excluded.ces_score,
              cost_efficiency_score = excluded.cost_efficiency_score,
              total_cost = excluded.total_cost,
              pipeline_influenced = excluded.pipeline_influenced,
              pipeline_net_new = excluded.pipeline_net_new,
              pipeline_continued_engagement = excluded.pipeline_continued_engagement,
              pipeline_per_1k = excluded.pipeline_per_1k,
              cost_per_company_engaged = excluded.cost_per_company_engaged,
              cost_per_meeting_held = excluded.cost_per_meeting_held,
              icp_companies_total = excluded.icp_companies_total,
              icp_companies_engaged = excluded.icp_companies_engaged,
              icp_engagement_rate = excluded.icp_engagement_rate,
              buying_committee_coverage_rate = excluded.buying_committee_coverage_rate,
              decision_makers_engaged = excluded.decision_makers_engaged,
              meeting_hold_rate = excluded.meeting_hold_rate,
              followup_scheduling_rate = excluded.followup_scheduling_rate,
              followup_completion_rate = excluded.followup_completion_rate,
              avg_health_score_engaged = excluded.avg_health_score_engaged,
              returning_attendee_rate = excluded.returning_attendee_rate,
              companies_3plus_instances = excluded.companies_3plus_instances`,
      args: [
        conferenceId,
        seriesId,
        cesScore,
        costEfficiencyScore,
        totalCost,
        pipelineInfluenced,
        pipelineNetNewVal,
        pipelineContinuedVal,
        pipelinePerK,
        costPerCompany,
        costPerMeeting,
        icpTotal > 0 ? icpTotal : null,
        icpEngaged > 0 ? icpEngaged : null,
        icpEngagementRate,
        buyingCommitteeCoverageRate,
        decisionMakersEngaged > 0 ? decisionMakersEngaged : null,
        meetingHoldRate,
        followupSchedulingRate,
        followupCompletionRate,
        avgHealthScore,
        returningAttendeeRate,
        companies3Plus,
      ],
    });
  } catch (err) {
    console.error(`[computeConferenceSnapshot] conferenceId=${conferenceId}`, err);
    throw err;
  }
}
