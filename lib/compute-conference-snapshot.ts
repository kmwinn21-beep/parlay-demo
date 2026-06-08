import type { Client } from '@libsql/client';

interface CesBenchmarks {
  cost_per_company: { elite_max: number; strong_max: number; healthy_max: number; weak_max: number };
  cost_per_meeting:  { elite_max: number; strong_max: number; healthy_max: number; weak_max: number };
  pipeline_per_1k:  { elite_min: number; strong_min: number; healthy_min: number; weak_min: number };
}

const DEFAULT_BENCHMARKS: CesBenchmarks = {
  cost_per_company: { elite_max: 350, strong_max: 650, healthy_max: 1000, weak_max: 1600 },
  cost_per_meeting:  { elite_max: 400, strong_max: 700, healthy_max: 1100, weak_max: 1800 },
  pipeline_per_1k:  { elite_min: 10000, strong_min: 6000, healthy_min: 3500, weak_min: 1500 },
};

const DEFAULT_EVENT_MODIFIERS: Record<string, number> = {
  flagship_industry_event: 5,
  regional_operator_conference: 0,
  vendor_heavy_trade_show: -5,
  other: 0,
};

// Matches effectiveness route scoreLowerIsBetter exactly
function scoreLowerIsBetter(value: number, eliteMax: number, strongMax: number, healthyMax: number, weakMax: number): number {
  if (value < eliteMax) {
    const pct = eliteMax > 0 ? value / eliteMax : 0;
    return Math.round(100 - pct * 5);
  }
  if (value <= strongMax) {
    const pct = (value - eliteMax) / Math.max(strongMax - eliteMax, 1);
    return Math.round(94 - pct * 14);
  }
  if (value <= healthyMax) {
    const pct = (value - strongMax) / Math.max(healthyMax - strongMax, 1);
    return Math.round(79 - pct * 14);
  }
  if (value <= weakMax) {
    const pct = (value - healthyMax) / Math.max(weakMax - healthyMax, 1);
    return Math.round(64 - pct * 14);
  }
  const pct = Math.min((value - weakMax) / Math.max(weakMax, 1), 1);
  return Math.max(35, Math.round(49 - pct * 14));
}

// Matches effectiveness route scoreHigherIsBetter exactly
function scoreHigherIsBetter(value: number, eliteMin: number, strongMin: number, healthyMin: number, weakMin: number): number {
  if (value >= eliteMin) {
    const pct = Math.min((value - eliteMin) / Math.max(eliteMin, 1), 1);
    return Math.min(100, Math.round(95 + pct * 5));
  }
  if (value >= strongMin) {
    const pct = (value - strongMin) / Math.max(eliteMin - strongMin, 1);
    return Math.round(80 + pct * 14);
  }
  if (value >= healthyMin) {
    const pct = (value - healthyMin) / Math.max(strongMin - healthyMin, 1);
    return Math.round(65 + pct * 14);
  }
  if (value >= weakMin) {
    const pct = (value - weakMin) / Math.max(healthyMin - weakMin, 1);
    return Math.round(50 + pct * 14);
  }
  const pct = Math.min(value / Math.max(weakMin, 1), 1);
  return Math.max(35, Math.round(35 + pct * 14));
}

// Shared CTE fragment — 4 positional params: conferenceId × 4
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
    // Step 1 — conference record (includes conf_event_type, strategy_key, booth, sponsorship)
    const confRes = await db.execute({
      sql: `SELECT c.id, c.series_id, c.start_date, c.conf_event_type, c.cost_efficiency_modifier,
                   c.booth_present, c.booth_width, c.booth_length, c.booth_number, c.booth_hall,
                   c.sponsorship_level, c.internal_attendees,
                   co.action_key AS strategy_key
            FROM conferences c
            LEFT JOIN config_options co ON co.id = c.conference_strategy_type_id
            WHERE c.id = ?`,
      args: [conferenceId],
    });
    if (confRes.rows.length === 0) throw new Error(`Conference ${conferenceId} not found`);
    const conf = confRes.rows[0] as Record<string, unknown>;
    const seriesId = conf.series_id ? String(conf.series_id) : null;
    const confEventType = String(conf.conf_event_type ?? 'other');
    const confModifierOverride = conf.cost_efficiency_modifier != null
      ? Number(conf.cost_efficiency_modifier) : null;

    // Step 1b — budget line items + strategy display name (parallel)
    const [budgetLineRes, strategyRes] = await Promise.all([
      db.execute({
        sql: `SELECT line_items, required_pipeline_multiple, required_pipeline_amount
              FROM conference_budget WHERE conference_id = ?`,
        args: [conferenceId],
      }),
      db.execute({
        sql: `SELECT co.value AS strategy_name
              FROM conferences c
              LEFT JOIN config_options co ON co.id = c.conference_strategy_type_id
              WHERE c.id = ?`,
        args: [conferenceId],
      }),
    ]);

    // Budget totals (strip non-numeric — budget/actual stored as strings)
    const parseDollar = (v: unknown): number =>
      Number(String(v ?? '').replace(/[^0-9.]/g, '')) || 0;
    const lineItemsRaw = String(budgetLineRes.rows[0]?.line_items ?? '[]');
    let lineItems: Array<Record<string, unknown>> = [];
    try { lineItems = JSON.parse(lineItemsRaw); } catch { /* empty */ }
    const budgetTotal = lineItems.length > 0
      ? lineItems.reduce((sum, item) => sum + parseDollar(item.budget), 0) || null
      : null;
    const actualTotal = lineItems.length > 0
      ? lineItems.reduce((sum, item) => sum + parseDollar(item.actual), 0) || null
      : null;
    const budgetVariance = budgetTotal != null && actualTotal != null
      ? actualTotal - budgetTotal : null;

    const snapRequiredPipelineMultiple = budgetLineRes.rows[0]?.required_pipeline_multiple != null
      ? Number(budgetLineRes.rows[0].required_pipeline_multiple) : null;
    const snapRequiredPipelineAmount = budgetLineRes.rows[0]?.required_pipeline_amount != null
      ? Number(budgetLineRes.rows[0].required_pipeline_amount) : null;
    const snapExpectedReturnAmount = (actualTotal && snapRequiredPipelineMultiple)
      ? actualTotal * snapRequiredPipelineMultiple
      : snapRequiredPipelineAmount ?? null;

    const strategyName = strategyRes.rows[0]?.strategy_name != null
      ? String(strategyRes.rows[0].strategy_name) : null;

    // Booth and sponsorship from conf record
    const boothPresent = conf.booth_present != null ? Number(conf.booth_present) : null;
    const boothWidth = conf.booth_width != null ? Number(conf.booth_width) : null;
    const boothLength = conf.booth_length != null ? Number(conf.booth_length) : null;
    const boothNumber = conf.booth_number != null ? String(conf.booth_number) : null;
    const boothHall = conf.booth_hall != null ? String(conf.booth_hall) : null;
    const sponsorshipLevel = conf.sponsorship_level != null ? String(conf.sponsorship_level) : null;
    const numInternalAttendees = conf.internal_attendees
      ? String(conf.internal_attendees).split(',').map(s => s.trim()).filter(Boolean).length
      : 0;

    // Step 2 — total spend via SQL (correct: actual if nonzero, else budget per line item)
    const spendRes = await db.execute({
      sql: `SELECT COALESCE(SUM(
               COALESCE(NULLIF(CAST(json_extract(li.value,'$.actual') AS REAL),0),
                        COALESCE(CAST(json_extract(li.value,'$.budget') AS REAL),0),0)
             ),0) AS total_spend
            FROM conference_budget cb, json_each(cb.line_items) li
            WHERE cb.conference_id = ?`,
      args: [conferenceId],
    });
    const totalSpend = Number(spendRes.rows[0]?.total_spend ?? 0);
    const totalCost = totalSpend > 0 ? totalSpend : null;

    // Step 3 — budget settings (used for pipeline index dimension)
    const budgetSettingsRes = await db.execute({
      sql: `SELECT return_on_cost, required_pipeline_multiple, required_pipeline_amount
            FROM conference_budget WHERE conference_id = ? LIMIT 1`,
      args: [conferenceId],
    });
    const bsRow = budgetSettingsRes.rows[0] as Record<string, unknown> | undefined;
    const returnOnCostMultiple = Number(bsRow?.return_on_cost ?? 0);
    const requiredPipelineMultiple = Number(bsRow?.required_pipeline_multiple ?? 3.5) > 0
      ? Number(bsRow?.required_pipeline_multiple ?? 3.5) : 3.5;
    const persistedRequiredPipelineAmount = bsRow?.required_pipeline_amount != null
      ? Number(bsRow.required_pipeline_amount) : null;

    // Step 4 — effectiveness defaults, CES benchmarks, event type modifiers
    const effDefaultsRes = await db.execute({ sql: `SELECT key, value FROM effectiveness_defaults`, args: [] });
    const effDefaults: Record<string, string> = {};
    for (const r of effDefaultsRes.rows) effDefaults[String(r.key)] = String(r.value ?? '');
    const expectedReturn = Number(effDefaults.expected_return_on_event_cost ?? 0);

    let benchmarks = DEFAULT_BENCHMARKS;
    try { benchmarks = { ...DEFAULT_BENCHMARKS, ...JSON.parse(effDefaults.ces_benchmarks ?? '{}') }; } catch { /* use defaults */ }

    let eventModifiers = DEFAULT_EVENT_MODIFIERS;
    try { eventModifiers = { ...DEFAULT_EVENT_MODIFIERS, ...JSON.parse(effDefaults.ces_event_type_modifiers ?? '{}') }; } catch { /* use defaults */ }

    // Step 5 — per-company pipeline contribution (ENGAGEMENT_CTES, no source filters)
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

    // Step 6 — prior companies (any other conference) for net-new split
    const priorRes = await db.execute({
      sql: `SELECT DISTINCT a.company_id
            FROM attendees a
            JOIN conference_attendees ca ON ca.attendee_id = a.id
            WHERE a.company_id IS NOT NULL AND ca.conference_id != ?`,
      args: [conferenceId],
    });
    const priorCompanyIds = new Set(priorRes.rows.map(r => Number(r.company_id)));

    let totalPi = 0;
    let pipelineNetNew = 0;
    let pipelineContinued = 0;
    let netNewLogos = 0;
    for (const row of piRes.rows) {
      const cid = Number(row.company_id);
      const pi = Number(row.company_pi ?? 0);
      totalPi += pi;
      if (priorCompanyIds.has(cid)) { pipelineContinued += pi; }
      else { pipelineNetNew += pi; netNewLogos++; }
    }
    const pipelineInfluenced = totalPi > 0 ? totalPi : null;
    const pipelineNetNewVal = pipelineInfluenced != null ? pipelineNetNew : null;
    const pipelineContinuedVal = pipelineInfluenced != null ? pipelineContinued : null;

    // Step 7 — engagement summary: total companies, companies_engaged, ICP coverage
    const engSummaryRes = await db.execute({
      sql: `WITH ${ENGAGEMENT_CTES}
            SELECT
              (SELECT COUNT(DISTINCT acc2.company_id) FROM all_cc acc2) AS total_companies,
              COUNT(DISTINCT ae.company_id) AS companies_engaged,
              (SELECT COUNT(DISTINCT acc3.company_id)
               FROM all_cc acc3
               JOIN companies co3 ON co3.id = acc3.company_id
               WHERE co3.icp = 'Yes') AS icp_companies_total,
              COUNT(DISTINCT CASE WHEN co.icp = 'Yes' THEN ae.company_id END) AS icp_companies_engaged
            FROM all_eng ae
            JOIN companies co ON co.id = ae.company_id`,
      args: [conferenceId, conferenceId, conferenceId, conferenceId],
    });
    const engRow = engSummaryRes.rows[0] as Record<string, unknown>;
    const totalCompanies = Number(engRow?.total_companies ?? 0);
    const companiesEngaged = Number(engRow?.companies_engaged ?? 0);
    const icpTotal = Number(engRow?.icp_companies_total ?? 0);
    const icpEngaged = Number(engRow?.icp_companies_engaged ?? 0);
    const engagementRatePct = totalCompanies > 0 ? companiesEngaged / totalCompanies * 100 : 0;
    const icpEngagementRatePct = icpTotal > 0 ? icpEngaged / icpTotal * 100 : 0;
    const icpEngagementRate = icpTotal > 0 ? icpEngaged / icpTotal : null;

    // Step 8 — meeting hold rate (scheduled = all meetings, held = action_key='meeting_held')
    const mtgRes = await db.execute({
      sql: `SELECT
              COUNT(DISTINCT m.id) AS total_scheduled,
              COUNT(DISTINCT CASE WHEN cop.action_key='meeting_held' THEN m.id END) AS total_held
            FROM meetings m
            LEFT JOIN config_options cop ON cop.category='action' AND LOWER(m.outcome)=LOWER(cop.value)
            WHERE m.conference_id = ?`,
      args: [conferenceId],
    });
    const mtgRow = mtgRes.rows[0] as Record<string, unknown>;
    const totalScheduled = Number(mtgRow?.total_scheduled ?? 0);
    const totalHeld = Number(mtgRow?.total_held ?? 0);
    const meetingHoldRate = totalScheduled > 0 ? totalHeld / totalScheduled : null;
    const holdRatePct = totalScheduled > 0 ? totalHeld / totalScheduled * 100 : 0;
    const meetingsHeld = totalHeld;

    // Step 9 — follow-up scheduling rate and completion rate (no source filters)
    const fuRatesRes = await db.execute({
      sql: `SELECT
              COUNT(DISTINCT CASE WHEN cm.meetings_held > 0 THEN cm.company_id END) AS companies_with_held,
              COUNT(DISTINCT CASE WHEN cm.meetings_held > 0 AND COALESCE(cf.followups_created,0) > 0 THEN cm.company_id END) AS companies_meeting_with_fu,
              (SELECT COUNT(DISTINCT f.id) FROM follow_ups f WHERE f.conference_id = ?) AS fu_total_created,
              (SELECT COUNT(DISTINCT f.id) FROM follow_ups f WHERE f.conference_id = ? AND COALESCE(f.completed,0) = 1) AS fu_total_completed
            FROM (
              SELECT a.company_id,
                COUNT(DISTINCT CASE WHEN cop.action_key='meeting_held' THEN m.id END) AS meetings_held
              FROM meetings m
              JOIN attendees a ON m.attendee_id = a.id
              LEFT JOIN config_options cop ON cop.category='action' AND LOWER(m.outcome)=LOWER(cop.value)
              WHERE m.conference_id = ?
              GROUP BY a.company_id
            ) cm
            LEFT JOIN (
              SELECT a.company_id, COUNT(DISTINCT f.id) AS followups_created
              FROM follow_ups f JOIN attendees a ON f.attendee_id = a.id
              WHERE f.conference_id = ? AND a.company_id IS NOT NULL
              GROUP BY a.company_id
            ) cf ON cm.company_id = cf.company_id`,
      args: [conferenceId, conferenceId, conferenceId, conferenceId],
    });
    const fuRow = fuRatesRes.rows[0] as Record<string, unknown>;
    const companiesWithHeld = Number(fuRow?.companies_with_held ?? 0);
    const companiesMeetingWithFu = Number(fuRow?.companies_meeting_with_fu ?? 0);
    const fuTotalCreated = Number(fuRow?.fu_total_created ?? 0);
    const fuTotalCompleted = Number(fuRow?.fu_total_completed ?? 0);
    const fuSchedulingRatePct = companiesWithHeld > 0 ? companiesMeetingWithFu / companiesWithHeld * 100 : 0;
    const followupSchedulingRate = companiesWithHeld > 0 ? companiesMeetingWithFu / companiesWithHeld : null;
    const followupCompletionRate = fuTotalCreated > 0 ? fuTotalCompleted / fuTotalCreated : null;
    const followupCompletionRatePct = fuTotalCreated > 0 ? fuTotalCompleted / fuTotalCreated * 100 : 0;

    // Step 10 — conference target engagement (for dim1 target_engagement_pct)
    const targetsRes = await db.execute({
      sql: `SELECT
              COUNT(DISTINCT ct.attendee_id) AS targets_total,
              COUNT(DISTINCT CASE
                WHEN mh.meeting_held = 1 OR tp.has_tp = 1 OR fu.has_fu = 1 OR se.has_se = 1
                THEN ct.attendee_id
              END) AS targets_engaged
            FROM conference_targets ct
            LEFT JOIN (
              SELECT m.attendee_id, 1 AS meeting_held
              FROM meetings m
              LEFT JOIN config_options cop ON cop.category='action' AND LOWER(m.outcome)=LOWER(cop.value)
              WHERE m.conference_id = ? AND cop.action_key='meeting_held'
              GROUP BY m.attendee_id
            ) mh ON mh.attendee_id = ct.attendee_id
            LEFT JOIN (
              SELECT attendee_id, 1 AS has_tp
              FROM attendee_touchpoints WHERE conference_id = ?
              GROUP BY attendee_id
            ) tp ON tp.attendee_id = ct.attendee_id
            LEFT JOIN (
              SELECT attendee_id, 1 AS has_fu
              FROM follow_ups
              WHERE conference_id = ? AND next_steps IS NOT NULL AND next_steps != ''
              GROUP BY attendee_id
            ) fu ON fu.attendee_id = ct.attendee_id
            LEFT JOIN (
              SELECT rsvp.attendee_id, 1 AS has_se
              FROM social_event_rsvps rsvp
              JOIN social_events se ON se.id = rsvp.social_event_id
              WHERE se.conference_id = ? AND rsvp.rsvp_status='attended'
              GROUP BY rsvp.attendee_id
            ) se ON se.attendee_id = ct.attendee_id
            WHERE ct.conference_id = ?`,
      args: [conferenceId, conferenceId, conferenceId, conferenceId, conferenceId],
    });
    const targetsRow = targetsRes.rows[0] as Record<string, unknown>;
    const targetsTotal = Number(targetsRow?.targets_total ?? 0);
    const targetsEngaged = Number(targetsRow?.targets_engaged ?? 0);
    const targetEngagementPct = targetsTotal > 0 ? targetsEngaged / targetsTotal * 100 : 0;

    // Step 11 — cost efficiency sub-metrics
    const pipelinePerK = totalSpend > 0 ? totalPi / (totalSpend / 1000) : null;
    const costPerCompany = totalSpend > 0 && companiesEngaged > 0 ? totalSpend / companiesEngaged : null;
    const costPerMeeting = totalSpend > 0 && meetingsHeld > 0 ? totalSpend / meetingsHeld : null;
    const costPerInternalAttendee = totalSpend > 0 && numInternalAttendees > 0
      ? totalSpend / numInternalAttendees : null;

    // Step 12 — cost efficiency score (interpolated, with event type modifier — matches effectiveness route)
    const bCPC = benchmarks.cost_per_company;
    const bCPM = benchmarks.cost_per_meeting;
    const bPI = benchmarks.pipeline_per_1k;

    let rawCEScore = 0;
    let rawCEWeight = 0;
    if (pipelinePerK != null) {
      rawCEScore += scoreHigherIsBetter(pipelinePerK, bPI.elite_min, bPI.strong_min, bPI.healthy_min, bPI.weak_min) * 0.50;
      rawCEWeight += 0.50;
    }
    if (costPerCompany != null) {
      rawCEScore += scoreLowerIsBetter(costPerCompany, bCPC.elite_max, bCPC.strong_max, bCPC.healthy_max, bCPC.weak_max) * 0.30;
      rawCEWeight += 0.30;
    }
    if (costPerMeeting != null) {
      rawCEScore += scoreLowerIsBetter(costPerMeeting, bCPM.elite_max, bCPM.strong_max, bCPM.healthy_max, bCPM.weak_max) * 0.20;
      rawCEWeight += 0.20;
    }
    const costEfficiencyScoreRaw = rawCEWeight > 0 ? Math.round(rawCEScore / rawCEWeight) : 0;
    const defaultModifier = eventModifiers[confEventType] ?? 0;
    const modifier = confModifierOverride != null ? confModifierOverride : defaultModifier;
    const adjustedCEScore = Math.max(0, Math.min(100, costEfficiencyScoreRaw + modifier));
    const costEfficiencyScore = rawCEWeight > 0 ? adjustedCEScore : null;

    // Step 13 — 7-dimensional CES (matches effectiveness route exactly)
    // dim1: ICP target quality
    const dim1IcpTarget = (icpEngagementRatePct * 0.5) + (targetEngagementPct * 0.5);

    // dim2: Meeting execution
    const dim2MeetingExec = (holdRatePct * 0.5) + (fuSchedulingRatePct * 0.5);

    // dim3: Pipeline influence index
    const expectedReturnAmount = totalSpend > 0 && returnOnCostMultiple > 0 ? totalSpend * returnOnCostMultiple : null;
    const computedRequiredPipelineAmount = expectedReturnAmount != null ? expectedReturnAmount * requiredPipelineMultiple : null;
    const requiredPipelineAmount = persistedRequiredPipelineAmount ?? computedRequiredPipelineAmount;
    const targetInfluence = requiredPipelineAmount ??
      (totalSpend > 0 && expectedReturn > 0 ? totalSpend * expectedReturn : null);
    const dim3PipelineIndex = targetInfluence && targetInfluence > 0
      ? Math.min(totalPi / targetInfluence * 100, 100) : 0;

    // dim4: Engagement breadth
    const dim4Breadth = engagementRatePct;

    // dim5: Follow-up execution (completion rate)
    const dim5Followup = followupCompletionRatePct;

    // dim6: Net-new engaged
    const dim6NetNew = companiesEngaged > 0 ? Math.min(netNewLogos / companiesEngaged * 100, 100) : 0;

    // dim7: Cost efficiency
    const dim7CostEfficiency = costEfficiencyScore ?? 0;

    const cesScore = Math.round(
      (dim1IcpTarget  * 0.20) +
      (dim2MeetingExec * 0.20) +
      (dim3PipelineIndex * 0.30) +
      (dim4Breadth     * 0.05) +
      (dim7CostEfficiency * 0.10) +
      (dim5Followup    * 0.10) +
      (dim6NetNew      * 0.05)
    );

    // Step 14 — buying committee coverage rate
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
        sql: `WITH ${ENGAGEMENT_CTES}
              SELECT DISTINCT ae.company_id
              FROM all_eng ae
              JOIN companies co ON co.id = ae.company_id
              WHERE co.icp = 'Yes'`,
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

    // Step 15 — decision makers engaged at this conference (no source filter)
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
              EXISTS (
                SELECT 1 FROM meetings m
                LEFT JOIN config_options cop ON cop.category='action' AND LOWER(m.outcome)=LOWER(cop.value)
                WHERE m.attendee_id = a.id AND m.conference_id = ? AND cop.action_key='meeting_held'
              )
              OR EXISTS (SELECT 1 FROM follow_ups f WHERE f.attendee_id = a.id AND f.conference_id = ?)
              OR EXISTS (SELECT 1 FROM attendee_touchpoints t WHERE t.attendee_id = a.id AND t.conference_id = ?)
            )`,
      args: [conferenceId, conferenceId, conferenceId, conferenceId],
    });
    const decisionMakersEngaged = Number(dmRes.rows[0]?.n ?? 0);

    // Step 16 — average health score of engaged attendees (no source filter)
    const avgHealthRes = await db.execute({
      sql: `SELECT AVG(a.health_score) as avg_hs
            FROM attendees a
            JOIN conference_attendees ca ON ca.attendee_id = a.id AND ca.conference_id = ?
            WHERE a.health_score IS NOT NULL
              AND (
                EXISTS (
                  SELECT 1 FROM meetings m
                  LEFT JOIN config_options cop ON cop.category='action' AND LOWER(m.outcome)=LOWER(cop.value)
                  WHERE m.attendee_id = a.id AND m.conference_id = ? AND cop.action_key='meeting_held'
                )
                OR EXISTS (SELECT 1 FROM follow_ups f WHERE f.attendee_id = a.id AND f.conference_id = ?)
                OR EXISTS (SELECT 1 FROM attendee_touchpoints t WHERE t.attendee_id = a.id AND t.conference_id = ?)
              )`,
      args: [conferenceId, conferenceId, conferenceId, conferenceId],
    });
    const avgHealthScore = avgHealthRes.rows[0]?.avg_hs != null
      ? Number(avgHealthRes.rows[0].avg_hs) : null;

    // Step 17 — returning attendee rate (no source filter)
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
                    EXISTS (
                      SELECT 1 FROM meetings m
                      LEFT JOIN config_options cop ON cop.category='action' AND LOWER(m.outcome)=LOWER(cop.value)
                      WHERE m.attendee_id = a.id AND m.conference_id = ? AND cop.action_key='meeting_held'
                    )
                    OR EXISTS (SELECT 1 FROM follow_ups f WHERE f.attendee_id = a.id AND f.conference_id = ?)
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
                EXISTS (
                  SELECT 1 FROM meetings m
                  LEFT JOIN config_options cop ON cop.category='action' AND LOWER(m.outcome)=LOWER(cop.value)
                  WHERE m.attendee_id = a.id AND m.conference_id = ? AND cop.action_key='meeting_held'
                )
                OR EXISTS (SELECT 1 FROM follow_ups f WHERE f.attendee_id = a.id AND f.conference_id = ?)
                OR EXISTS (SELECT 1 FROM attendee_touchpoints t WHERE t.attendee_id = a.id AND t.conference_id = ?)
              )`,
        args: [conferenceId, conferenceId, conferenceId, conferenceId],
      });
      const totalEngaged = Number(totalEngagedRes.rows[0]?.n ?? 0);
      const returningCount = Number(returningRes.rows[0]?.n ?? 0);
      if (totalEngaged > 0) returningAttendeeRate = returningCount / totalEngaged;
    }

    // Step 18 — companies engaged 3+ instances of this series
    let companies3Plus: number | null = null;
    if (seriesId) {
      const c3Res = await db.execute({
        sql: `SELECT COUNT(DISTINCT a.company_id) as n
              FROM attendees a
              JOIN contact_conference_history cch ON cch.attendee_id = a.id AND cch.series_id = ?
              WHERE cch.interaction_count >= 3 AND a.company_id IS NOT NULL`,
        args: [seriesId],
      });
      companies3Plus = Number(c3Res.rows[0]?.n ?? 0);
    }

    // Step 19 — upsert into conference_snapshots
    await db.execute({
      sql: `INSERT INTO conference_snapshots (
              conference_id, series_id, snapshot_taken_at,
              ces_score, cost_efficiency_score,
              total_cost, pipeline_influenced, pipeline_net_new, pipeline_continued_engagement,
              pipeline_per_1k, cost_per_company_engaged, cost_per_meeting_held,
              icp_companies_total, icp_companies_engaged, icp_engagement_rate,
              buying_committee_coverage_rate, decision_makers_engaged,
              meeting_hold_rate, followup_scheduling_rate, followup_completion_rate,
              avg_health_score_engaged, returning_attendee_rate, companies_3plus_instances,
              strategy_name, sponsorship_level,
              booth_present, booth_width, booth_length, booth_number, booth_hall,
              budget_total, actual_total, budget_variance, budget_line_items,
              required_pipeline_multiple, required_pipeline_amount, expected_return_amount,
              cost_per_internal_attendee
            ) VALUES (?, ?, datetime('now'), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
              companies_3plus_instances = excluded.companies_3plus_instances,
              strategy_name = excluded.strategy_name,
              sponsorship_level = excluded.sponsorship_level,
              booth_present = excluded.booth_present,
              booth_width = excluded.booth_width,
              booth_length = excluded.booth_length,
              booth_number = excluded.booth_number,
              booth_hall = excluded.booth_hall,
              budget_total = excluded.budget_total,
              actual_total = excluded.actual_total,
              budget_variance = excluded.budget_variance,
              budget_line_items = excluded.budget_line_items,
              required_pipeline_multiple = excluded.required_pipeline_multiple,
              required_pipeline_amount = excluded.required_pipeline_amount,
              expected_return_amount = excluded.expected_return_amount,
              cost_per_internal_attendee = excluded.cost_per_internal_attendee`,
      args: [
        conferenceId,
        seriesId,
        cesScore || null,
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
        strategyName,
        sponsorshipLevel,
        boothPresent,
        boothWidth,
        boothLength,
        boothNumber,
        boothHall,
        budgetTotal,
        actualTotal,
        budgetVariance,
        lineItemsRaw,
        snapRequiredPipelineMultiple,
        snapRequiredPipelineAmount,
        snapExpectedReturnAmount,
        costPerInternalAttendee,
      ],
    });
  } catch (err) {
    console.error(`[computeConferenceSnapshot] conferenceId=${conferenceId}`, err);
    throw err;
  }
}
