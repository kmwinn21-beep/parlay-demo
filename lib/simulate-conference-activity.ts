import { createClient } from '@libsql/client';
import { db, dbReady } from '@/lib/db';

export type SimulationParams = {
  accountId: string
  conferenceId: number
  targetScoreMin: number
  targetScoreMax: number
  repIds: number[]
  attendeeCoverage: number
  density: 'light' | 'moderate' | 'heavy'
  dryRun: boolean
}

export type DimensionBreakdown = {
  dim1_icp_quality: number
  dim2_meeting_execution: number
  dim3_pipeline_influence: number
  dim4_breadth: number
  dim5_followup_execution: number
  dim6_net_new: number
  dim7_cost_efficiency: number
}

export type SimulationPlan = {
  meetingsScheduled: number
  meetingsHeld: number
  meetingsWithOutcomes: number
  followUpsCreated: number
  followUpsCompleted: number
  touchpoints: number
  companiesEngaged: number
  netNewLogos: number
  pipelineInfluenced: number
}

export type SimulationResult = {
  projectedScore: number
  projectedDimensions: DimensionBreakdown
  weightedContributions: DimensionBreakdown
  plan: SimulationPlan
  written: boolean
  recordsWritten?: {
    meetings: number
    followUps: number
    touchpoints: number
  }
  convergenceWarning?: string
  dim3Warning?: string
}

const densityPresets = {
  light:    { holdRate: 0.65, followUpRate: 0.55, completionRate: 0.60, touchesPerCompany: 1.2 },
  moderate: { holdRate: 0.78, followUpRate: 0.70, completionRate: 0.75, touchesPerCompany: 1.8 },
  heavy:    { holdRate: 0.90, followUpRate: 0.85, completionRate: 0.90, touchesPerCompany: 2.5 },
}

function clamp(val: number, min: number, max: number) {
  return Math.max(min, Math.min(max, val));
}

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function addDays(dateStr: string, days: number): Date {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

function toISOTimestamp(d: Date): string {
  return d.toISOString().replace('T', ' ').slice(0, 19);
}

function conferenceDates(startDate: string, endDate: string): Date[] {
  const dates: Date[] = [];
  const start = new Date(startDate + 'T00:00:00Z');
  const end = new Date(endDate + 'T00:00:00Z');
  const cur = new Date(start);
  while (cur <= end) {
    dates.push(new Date(cur));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return dates;
}

function businessTimestamp(date: Date, slotIndex: number, totalSlots: number): string {
  // Spread across 8am-6pm (10 hour window)
  const minuteOffset = Math.floor((slotIndex / Math.max(totalSlots, 1)) * 600);
  const startMinute = 8 * 60 + minuteOffset;
  const h = Math.floor(startMinute / 60);
  const m = startMinute % 60;
  const d = new Date(date);
  d.setUTCHours(h, m, 0, 0);
  return toISOTimestamp(d);
}

type AttendeeRow = {
  id: number
  first_name: string
  last_name: string
  title: string | null
  company_id: number | null
  seniority: string | null
  function: string | null
  health_score: number | null
}

type CompanyRow = {
  id: number
  name: string
  wse: number | null
  icp: string | null
}

type EffectivenessDefaults = {
  follow_up_meeting_conversion_rate: number
  touchpoint_conversion_rate: number
  hosted_event_attendee_conversion_rate: number
  avg_cost_per_unit: number
  avg_annual_deal_size: number
  meetings_held_conversion_rate: number
  expected_return_on_event_cost: number
}

function computeCES(dims: DimensionBreakdown): number {
  return Math.round(
    dims.dim1_icp_quality * 0.20 +
    dims.dim2_meeting_execution * 0.20 +
    dims.dim3_pipeline_influence * 0.30 +
    dims.dim4_breadth * 0.05 +
    dims.dim7_cost_efficiency * 0.10 +
    dims.dim5_followup_execution * 0.10 +
    dims.dim6_net_new * 0.05
  );
}

function computeWeightedContributions(dims: DimensionBreakdown): DimensionBreakdown {
  return {
    dim1_icp_quality: Math.round(dims.dim1_icp_quality * 0.20 * 10) / 10,
    dim2_meeting_execution: Math.round(dims.dim2_meeting_execution * 0.20 * 10) / 10,
    dim3_pipeline_influence: Math.round(dims.dim3_pipeline_influence * 0.30 * 10) / 10,
    dim4_breadth: Math.round(dims.dim4_breadth * 0.05 * 10) / 10,
    dim5_followup_execution: Math.round(dims.dim5_followup_execution * 0.10 * 10) / 10,
    dim6_net_new: Math.round(dims.dim6_net_new * 0.05 * 10) / 10,
    dim7_cost_efficiency: Math.round(dims.dim7_cost_efficiency * 0.10 * 10) / 10,
  };
}

export async function simulateConferenceActivity(params: SimulationParams): Promise<SimulationResult> {
  const {
    accountId,
    conferenceId,
    targetScoreMin,
    targetScoreMax,
    repIds,
    attendeeCoverage,
    density: densityKey,
    dryRun,
  } = params;

  const density = densityPresets[densityKey];
  const targetMid = (targetScoreMin + targetScoreMax) / 2;

  // Get tenant DB credentials
  await dbReady;
  const accountRow = await db.execute({
    sql: `SELECT turso_db_url, turso_auth_token, company_name FROM accounts WHERE id = ?`,
    args: [accountId],
  });
  if (!accountRow.rows[0]?.turso_db_url) {
    throw new Error(`No tenant DB found for account ${accountId}`);
  }
  const client = createClient({
    url: String(accountRow.rows[0].turso_db_url),
    authToken: String(accountRow.rows[0].turso_auth_token),
  });

  // Fetch conference record
  const confRes = await client.execute({
    sql: `SELECT c.id, c.name, c.start_date, c.end_date,
                 co.action_key AS strategy_key,
                 cb.line_items AS budget_line_items
          FROM conferences c
          LEFT JOIN config_options co ON co.id = c.conference_strategy_type_id
          LEFT JOIN conference_budget cb ON cb.conference_id = c.id
          WHERE c.id = ?`,
    args: [conferenceId],
  });
  if (!confRes.rows[0]) throw new Error(`Conference ${conferenceId} not found`);
  const conf = confRes.rows[0];
  const confName = String(conf.name);
  const confStartDate = String(conf.start_date);
  const confEndDate = String(conf.end_date);

  // Priority 1: conference_budget.line_items
  let totalCost = 0;
  try {
    const lineItems = JSON.parse(String(conf.budget_line_items ?? '[]'));
    if (Array.isArray(lineItems)) {
      totalCost = lineItems.reduce((sum: number, item: { amount?: number }) => sum + (Number(item.amount) || 0), 0);
    }
  } catch { /* no budget data */ }

  // Priority 2: conferences.total_cost column (may not exist in all tenant schemas)
  if (!totalCost) {
    const confCostRow = await client.execute({
      sql: `SELECT total_cost FROM conferences WHERE id = ?`,
      args: [conferenceId],
    }).catch(() => ({ rows: [] as Array<Record<string, unknown>> }));
    totalCost = Number(confCostRow.rows[0]?.total_cost ?? 0) || 0;
  }

  // Fetch all attendees at conference
  const attendeesRes = await client.execute({
    sql: `SELECT a.id, a.first_name, a.last_name, a.title, a.company_id, a.seniority, a."function", a.health_score
          FROM attendees a
          JOIN conference_attendees ca ON ca.attendee_id = a.id
          WHERE ca.conference_id = ?`,
    args: [conferenceId],
  });
  const allAttendees: AttendeeRow[] = attendeesRes.rows.map(r => ({
    id: Number(r.id),
    first_name: String(r.first_name),
    last_name: String(r.last_name),
    title: r.title ? String(r.title) : null,
    company_id: r.company_id != null ? Number(r.company_id) : null,
    seniority: r.seniority ? String(r.seniority) : null,
    function: r['function'] ? String(r['function']) : null,
    health_score: r.health_score != null ? Number(r.health_score) : null,
  }));

  // Fetch companies at conference
  const companiesRes = await client.execute({
    sql: `SELECT DISTINCT co.id, co.name, co.wse, co.icp
          FROM companies co
          JOIN attendees a ON a.company_id = co.id
          JOIN conference_attendees ca ON ca.attendee_id = a.id
          WHERE ca.conference_id = ?`,
    args: [conferenceId],
  });
  const allCompanies: CompanyRow[] = companiesRes.rows.map(r => ({
    id: Number(r.id),
    name: String(r.name),
    wse: r.wse != null ? Number(r.wse) : null,
    icp: r.icp ? String(r.icp) : null,
  }));

  const totalCompanies = allCompanies.length;
  const icpCompanies = allCompanies.filter(c => c.icp === 'Yes');
  const icpCompanyIds = new Set(icpCompanies.map(c => c.id));

  // Fetch conference targets (join attendees to get company_id)
  const targetsRes = await client.execute({
    sql: `SELECT DISTINCT a.company_id
          FROM conference_targets ct
          JOIN attendees a ON a.id = ct.attendee_id
          WHERE ct.conference_id = ? AND a.company_id IS NOT NULL`,
    args: [conferenceId],
  }).catch(() => ({ rows: [] as { company_id: unknown }[] }));
  const targetCompanyIds = new Set(targetsRes.rows.map(r => Number(r.company_id)));

  // Net-new logos computed later — after engagedCompanies is determined — so the
  // count is bounded to companies actually engaged in this simulation.

  // Effectiveness defaults
  const defaultsRes = await client.execute({
    sql: `SELECT key, value FROM effectiveness_defaults LIMIT 50`,
    args: [],
  }).catch(() => ({ rows: [] as { key: unknown; value: unknown }[] }));
  const defaultsMap: Record<string, number> = {};
  for (const r of defaultsRes.rows) {
    defaultsMap[String(r.key)] = Number(r.value);
  }
  const defaults: EffectivenessDefaults = {
    follow_up_meeting_conversion_rate: defaultsMap['follow_up_meeting_conversion_rate'] ?? 0.25,
    touchpoint_conversion_rate: defaultsMap['touchpoint_conversion_rate'] ?? 0.10,
    hosted_event_attendee_conversion_rate: defaultsMap['hosted_event_attendee_conversion_rate'] ?? 0.15,
    avg_cost_per_unit: defaultsMap['avg_cost_per_unit'] ?? 120000,
    avg_annual_deal_size: defaultsMap['avg_annual_deal_size'] ?? 50000,
    meetings_held_conversion_rate: defaultsMap['meetings_held_conversion_rate'] ?? 0.30,
    expected_return_on_event_cost: defaultsMap['expected_return_on_event_cost'] ?? 3.0,
  };
  // Dim3 weight handling — redistribute proportionally if no cost basis
  type DimKey = 'dim1' | 'dim2' | 'dim3' | 'dim4' | 'dim5' | 'dim6' | 'dim7';
  const baseWeights: Record<DimKey, number> = { dim1: 0.20, dim2: 0.20, dim3: 0.30, dim4: 0.05, dim5: 0.10, dim6: 0.05, dim7: 0.10 };
  const weights: Record<DimKey, number> = { ...baseWeights };
  let dim3Warning: string | undefined;
  if (!totalCost) {
    weights.dim3 = 0;
    const remainingDims: DimKey[] = ['dim1', 'dim2', 'dim4', 'dim5', 'dim6', 'dim7'];
    const totalRemainingWeight = remainingDims.reduce((sum, d) => sum + baseWeights[d], 0);
    for (const dim of remainingDims) {
      weights[dim] = baseWeights[dim] + (baseWeights[dim] / totalRemainingWeight) * 0.30;
    }
    dim3Warning = 'ℹ Dim3 excluded — no cost basis found. Pipeline weight (30%) redistributed proportionally across remaining dimensions.';
  }

  const targetInfluence = totalCost * defaults.expected_return_on_event_cost;

  // Dynamic CES using proportionally redistributed weights
  const computeScore = (dims: DimensionBreakdown): number => Math.round(
    dims.dim1_icp_quality * weights.dim1 +
    dims.dim2_meeting_execution * weights.dim2 +
    dims.dim3_pipeline_influence * weights.dim3 +
    dims.dim4_breadth * weights.dim4 +
    dims.dim7_cost_efficiency * weights.dim7 +
    dims.dim5_followup_execution * weights.dim5 +
    dims.dim6_net_new * weights.dim6
  );

  const computeDynamicWeightedContributions = (dims: DimensionBreakdown): DimensionBreakdown => ({
    dim1_icp_quality: Math.round(dims.dim1_icp_quality * weights.dim1 * 10) / 10,
    dim2_meeting_execution: Math.round(dims.dim2_meeting_execution * weights.dim2 * 10) / 10,
    dim3_pipeline_influence: Math.round(dims.dim3_pipeline_influence * weights.dim3 * 10) / 10,
    dim4_breadth: Math.round(dims.dim4_breadth * weights.dim4 * 10) / 10,
    dim5_followup_execution: Math.round(dims.dim5_followup_execution * weights.dim5 * 10) / 10,
    dim6_net_new: Math.round(dims.dim6_net_new * weights.dim6 * 10) / 10,
    dim7_cost_efficiency: Math.round(dims.dim7_cost_efficiency * weights.dim7 * 10) / 10,
  });

  // Config options: meeting_held value and touchpoint option_id
  const configRes = await client.execute({
    sql: `SELECT id, category, value, action_key FROM config_options WHERE (action_key = 'meeting_held' AND category = 'action') OR category = 'touchpoints' ORDER BY sort_order`,
    args: [],
  });
  let meetingHeldValue = 'Held';
  let touchpointOptionId: number | null = null;
  for (const r of configRes.rows) {
    if (String(r.action_key) === 'meeting_held') {
      meetingHeldValue = String(r.value);
    }
    if (String(r.category) === 'touchpoints' && touchpointOptionId === null) {
      touchpointOptionId = Number(r.id);
    }
  }

  // Rep info — IDs reference config_options.id (category='user'), not users.id
  let repNames: Map<number, string> = new Map();
  if (repIds.length > 0) {
    const repRes = await client.execute({
      sql: `SELECT id, value FROM config_options WHERE category = 'user' AND id IN (${repIds.map(() => '?').join(',')})`,
      args: repIds,
    }).catch(() => ({ rows: [] as { id: unknown; value: unknown }[] }));
    for (const r of repRes.rows) {
      repNames.set(Number(r.id), String(r.value ?? ''));
    }
  }
  // Fallback if no reps configured
  const effectiveRepIds = repIds.length > 0 ? repIds : [0];

  // Determine companies to engage
  const companiesEngagedCount = Math.max(1, Math.round(attendeeCoverage * icpCompanies.length));

  // Sort ICP companies: targets first, then by attendee health_score
  const companyHealthScore = new Map<number, number>();
  for (const att of allAttendees) {
    if (att.company_id && icpCompanyIds.has(att.company_id)) {
      const existing = companyHealthScore.get(att.company_id) ?? 0;
      companyHealthScore.set(att.company_id, Math.max(existing, att.health_score ?? 0));
    }
  }
  const sortedIcpCompanies = [...icpCompanies].sort((a, b) => {
    const aTarget = targetCompanyIds.has(a.id) ? 1 : 0;
    const bTarget = targetCompanyIds.has(b.id) ? 1 : 0;
    if (aTarget !== bTarget) return bTarget - aTarget;
    return (companyHealthScore.get(b.id) ?? 0) - (companyHealthScore.get(a.id) ?? 0);
  });
  const engagedCompanies = sortedIcpCompanies.slice(0, companiesEngagedCount);
  const engagedCompanyIds = engagedCompanies.map(c => c.id);

  // Net-new logos: how many engaged companies have never appeared in any prior conference.
  // Bounded to engagedCompanyIds.length — cannot exceed companies actually engaged here.
  let netNewCount = 0;
  if (engagedCompanyIds.length > 0) {
    const nnPlaceholders = engagedCompanyIds.map(() => '?').join(',');
    const netNewRes = await client.execute({
      sql: `SELECT co.id FROM companies co
            WHERE co.id IN (${nnPlaceholders})
              AND co.id NOT IN (
                SELECT DISTINCT a2.company_id
                FROM attendees a2
                JOIN conference_attendees ca2 ON ca2.attendee_id = a2.id
                WHERE ca2.conference_id != ? AND a2.company_id IS NOT NULL
              )`,
      args: [...engagedCompanyIds, conferenceId],
    }).catch(() => ({ rows: [] as { id: unknown }[] }));
    netNewCount = Math.min(netNewRes.rows.length, engagedCompanyIds.length);
  }

  // Build attendee map by company
  const attendeesByCompany = new Map<number, AttendeeRow[]>();
  for (const att of allAttendees) {
    if (att.company_id) {
      const list = attendeesByCompany.get(att.company_id) ?? [];
      list.push(att);
      attendeesByCompany.set(att.company_id, list);
    }
  }

  // Hard ceiling: cannot schedule more meetings than unique ICP attendees
  const icpMatchedAttendees = allAttendees.filter(a => a.company_id != null && icpCompanyIds.has(a.company_id));
  const maxMeetings = Math.max(icpMatchedAttendees.length, 1);

  // Compute fixed dimensions
  const dim4 = totalCompanies > 0 ? clamp((companiesEngagedCount / totalCompanies) * 100, 0, 100) : 0;
  const dim6 = totalCompanies > 0 ? clamp((netNewCount / totalCompanies) * 100, 0, 100) : 0;
  const dim7 = 65;

  // Solve for required controllable score using dynamic weights
  const fixedContribution = dim4 * weights.dim4 + dim7 * weights.dim7 + dim6 * weights.dim6;
  const remainingBudget = targetMid - fixedContribution;
  const controllableWeight = Math.max(weights.dim1 + weights.dim2 + weights.dim3 + weights.dim5, 0.01);
  const targetAvg = clamp(remainingBudget / controllableWeight, 0, 100);

  // Iterate to find activity counts that hit target CES
  let meetingsScheduled: number;
  let meetingsHeld: number;
  let followUpsCreated: number;
  let followUpsCompleted: number;
  let touchpointsCount: number;

  // Minimum activity floor — prevents the loop from accepting a perfect execution rate
  // on a trivially small sample (e.g. 2 meetings at 100% hold rate inflates Dim2 to 100).
  const minMeetingsRequired = Math.max(
    Math.floor(icpMatchedAttendees.length * (attendeeCoverage / 100) * density.holdRate),
    2,
  );

  // Initial estimates based on density
  const meetingsPerCompany = densityKey === 'light' ? 1 : densityKey === 'moderate' ? 1.5 : 2;
  let baseScheduled = Math.max(companiesEngagedCount, Math.round(companiesEngagedCount * meetingsPerCompany));

  let touchMultiplier = 1.0;
  let coverageMultiplier = 1.0;
  let completionRateOverride = density.completionRate;
  let convergenceWarning: string | undefined;

  let projectedDims: DimensionBreakdown;
  let projectedScore = 0;
  let pipelineInfluenced = 0;
  const icpEngagedForDim1 = icpCompanies.length > 0 ? clamp((companiesEngagedCount / icpCompanies.length) * 100, 0, 100) : 0;
  const targetEngaged = targetCompanyIds.size > 0
    ? clamp((engagedCompanies.filter(c => targetCompanyIds.has(c.id)).length / targetCompanyIds.size) * 100, 0, 100)
    : icpEngagedForDim1;

  for (let iter = 0; iter < 20; iter++) {
    meetingsScheduled = baseScheduled;
    meetingsHeld = Math.round(meetingsScheduled * density.holdRate);
    const estCompaniesWithHeld = Math.min(meetingsHeld, companiesEngagedCount);
    followUpsCreated = Math.round(estCompaniesWithHeld * density.followUpRate);
    followUpsCompleted = Math.round(followUpsCreated * completionRateOverride);
    touchpointsCount = Math.round(companiesEngagedCount * density.touchesPerCompany * touchMultiplier);

    // Compute pipeline influence
    pipelineInfluenced = 0;
    let totalEngagedForDim3 = engagedCompanies.length;
    for (const company of engagedCompanies) {
      const companyMeetingsHeld = Math.round(meetingsHeld / Math.max(companiesEngagedCount, 1));
      const companyTouchpoints = Math.round(touchpointsCount / Math.max(companiesEngagedCount, 1));
      const totalInteractions = companyMeetingsHeld + companyTouchpoints;

      const multiTouchMult = totalInteractions >= 3 ? 1.50 : totalInteractions === 2 ? 1.25 : 1.00;
      let baseConvRate: number;
      if (companyMeetingsHeld > 0) {
        baseConvRate = defaults.meetings_held_conversion_rate;
      } else if (companyTouchpoints > 0) {
        baseConvRate = defaults.touchpoint_conversion_rate;
      } else {
        baseConvRate = 0;
      }
      const adjConvRate = Math.min(baseConvRate * multiTouchMult, 0.95);
      const dealValue = (company.wse ?? 0) > 0
        ? (company.wse ?? 0) * defaults.avg_cost_per_unit
        : defaults.avg_annual_deal_size;
      pipelineInfluenced += adjConvRate * dealValue;
    }

    const dim3 = (weights.dim3 > 0 && targetInfluence > 0) ? clamp((pipelineInfluenced / targetInfluence) * 100, 0, 100) : 0;

    const dim1 = clamp(icpEngagedForDim1 * 0.5 + targetEngaged * 0.5, 0, 100);
    const holdRatePct = meetingsScheduled > 0 ? clamp((meetingsHeld / meetingsScheduled) * 100, 0, 100) : 0;
    const fuSchedulingRatePct = companiesEngagedCount > 0 ? clamp((followUpsCreated / companiesEngagedCount) * 100, 0, 100) : 0;
    const dim2 = clamp(holdRatePct * 0.5 + fuSchedulingRatePct * 0.5, 0, 100);
    const dim5 = followUpsCreated > 0 ? clamp((followUpsCompleted / followUpsCreated) * 100, 0, 100) : 0;

    projectedDims = {
      dim1_icp_quality: Math.round(dim1 * 10) / 10,
      dim2_meeting_execution: Math.round(dim2 * 10) / 10,
      dim3_pipeline_influence: Math.round(dim3 * 10) / 10,
      dim4_breadth: Math.round(dim4 * 10) / 10,
      dim5_followup_execution: Math.round(dim5 * 10) / 10,
      dim6_net_new: Math.round(dim6 * 10) / 10,
      dim7_cost_efficiency: Math.round(dim7 * 10) / 10,
    };

    projectedScore = computeScore(projectedDims);

    if (projectedScore >= targetScoreMin && projectedScore <= targetScoreMax) {
      // Only accept if activity volume is above the minimum floor — avoids locking in
      // perfect execution rates on trivially small samples (e.g. 2 meetings → Dim2=100)
      if (meetingsHeld >= minMeetingsRequired) break;
    }

    // Adjust activity counts to push CES toward target range
    if (projectedScore < targetScoreMin) {
      const dim3Gap = targetAvg - (projectedDims?.dim3_pipeline_influence ?? 0);
      const dim2Gap = targetAvg - (projectedDims?.dim2_meeting_execution ?? 0);
      const dim5Gap = targetAvg - (projectedDims?.dim5_followup_execution ?? 0);
      const dim4Gap = targetAvg - (projectedDims?.dim4_breadth ?? 0);

      if (dim3Gap > 10) {
        touchMultiplier = Math.min(touchMultiplier * 1.2, 3.0);
      }
      if (dim2Gap > 10) {
        baseScheduled = Math.min(Math.round(baseScheduled * 1.1), maxMeetings);
      }
      if (dim5Gap > 10) {
        completionRateOverride = Math.min(completionRateOverride * 1.1, density.completionRate);
      }
      if (dim4Gap > 10) {
        coverageMultiplier = Math.min(coverageMultiplier * 1.1, 2.0);
      }
      if (dim3Gap <= 10 && dim2Gap <= 10 && dim5Gap <= 10) {
        baseScheduled = Math.min(Math.round(baseScheduled * 1.15), maxMeetings);
      }
    } else {
      baseScheduled = Math.max(1, Math.round(baseScheduled * 0.92));
      touchMultiplier = Math.max(touchMultiplier * 0.92, 1.0);
    }
  }

  if (projectedScore < targetScoreMin || projectedScore > targetScoreMax) {
    if (projectedScore > targetScoreMax) {
      // Score stayed above target max — the achievable floor is higher than the requested ceiling
      const costBasisNote = !totalCost ? ' This conference has no cost basis, which raises the effective score floor.' : '';
      convergenceWarning = `Target range ${targetScoreMin}–${targetScoreMax} is below the minimum achievable score (${Math.round(projectedScore)}) for this conference configuration.${costBasisNote} Try a higher target range.`;
    } else {
      convergenceWarning = `Could not reach target range ${targetScoreMin}–${targetScoreMax}. Closest achieved: ${Math.round(projectedScore)}. Try adjusting density to Heavy or expanding coverage.`;
    }
  }

  meetingsScheduled = baseScheduled;
  meetingsHeld = Math.round(meetingsScheduled * density.holdRate);
  const estCompaniesWithHeldFinal = Math.min(meetingsHeld, companiesEngagedCount);
  followUpsCreated = Math.round(estCompaniesWithHeldFinal * density.followUpRate);
  followUpsCompleted = Math.round(followUpsCreated * completionRateOverride);
  touchpointsCount = Math.round(companiesEngagedCount * density.touchesPerCompany * touchMultiplier);

  const plan: SimulationPlan = {
    meetingsScheduled,
    meetingsHeld,
    meetingsWithOutcomes: meetingsScheduled,
    followUpsCreated,
    followUpsCompleted,
    touchpoints: touchpointsCount,
    companiesEngaged: companiesEngagedCount,
    netNewLogos: netNewCount,
    pipelineInfluenced: Math.round(pipelineInfluenced),
  };

  // Final dimension recomputation
  const finalDim3 = (weights.dim3 > 0 && targetInfluence > 0) ? clamp((pipelineInfluenced / targetInfluence) * 100, 0, 100) : 0;
  const finalDim1 = clamp(icpEngagedForDim1 * 0.5 + targetEngaged * 0.5, 0, 100);
  const holdRatePct = meetingsScheduled > 0 ? clamp((meetingsHeld / meetingsScheduled) * 100, 0, 100) : 0;
  const fuSchedulingRatePct = companiesEngagedCount > 0 ? clamp((followUpsCreated / companiesEngagedCount) * 100, 0, 100) : 0;
  const finalDim2 = clamp(holdRatePct * 0.5 + fuSchedulingRatePct * 0.5, 0, 100);
  const finalDim5 = followUpsCreated > 0 ? clamp((followUpsCompleted / followUpsCreated) * 100, 0, 100) : 0;

  const finalDims: DimensionBreakdown = {
    dim1_icp_quality: Math.round(finalDim1 * 10) / 10,
    dim2_meeting_execution: Math.round(finalDim2 * 10) / 10,
    dim3_pipeline_influence: Math.round(finalDim3 * 10) / 10,
    dim4_breadth: Math.round(dim4 * 10) / 10,
    dim5_followup_execution: Math.round(finalDim5 * 10) / 10,
    dim6_net_new: Math.round(dim6 * 10) / 10,
    dim7_cost_efficiency: Math.round(dim7 * 10) / 10,
  };

  const finalScore = computeScore(finalDims);
  const weightedContributions = computeDynamicWeightedContributions(finalDims);

  // Pre-return assertions — any failure throws so the caller receives an error
  // rather than silently returning a broken result.
  const assertions: Array<{ check: boolean; msg: string }> = [
    { check: plan.meetingsScheduled <= maxMeetings, msg: `meetingsScheduled (${plan.meetingsScheduled}) exceeds attendee count (${maxMeetings})` },
    { check: plan.followUpsCreated <= plan.companiesEngaged, msg: `followUpsCreated (${plan.followUpsCreated}) exceeds companiesEngaged (${plan.companiesEngaged})` },
    { check: plan.netNewLogos <= plan.companiesEngaged, msg: `netNewLogos (${plan.netNewLogos}) exceeds companiesEngaged (${plan.companiesEngaged})` },
    { check: !isNaN(finalScore) && finalScore >= 0 && finalScore <= 100, msg: `projectedScore out of range or NaN: ${finalScore}` },
  ];
  for (const { check, msg } of assertions) {
    if (!check) {
      throw new Error(`[simulate] assertion failed: ${msg}`);
    }
  }

  if (dryRun) {
    return {
      projectedScore: finalScore,
      projectedDimensions: finalDims,
      weightedContributions,
      plan,
      written: false,
      convergenceWarning,
      dim3Warning,
    };
  }

  // ---- Write records ----
  const confDates = conferenceDates(confStartDate, confEndDate);
  const today = new Date();
  const cappedEndDate = confDates[confDates.length - 1] > today ? today : confDates[confDates.length - 1];
  const effectiveEndDate = cappedEndDate;

  // Build per-company attendee assignments
  const outcomeDistribution: Array<{ outcome: string; note: string }> = [
    { outcome: meetingHeldValue, note: 'Strong interest indicated — next steps agreed.' },
    { outcome: meetingHeldValue, note: 'Strong interest indicated — next steps agreed.' },
    { outcome: meetingHeldValue, note: 'Strong interest indicated — next steps agreed.' },
    { outcome: meetingHeldValue, note: 'Strong interest indicated — next steps agreed.' },
    { outcome: meetingHeldValue, note: 'Further discovery needed — follow-up scheduled.' },
    { outcome: meetingHeldValue, note: 'Further discovery needed — follow-up scheduled.' },
    { outcome: meetingHeldValue, note: 'Further discovery needed — follow-up scheduled.' },
    { outcome: meetingHeldValue, note: 'Introductory conversation — relationship established.' },
    { outcome: meetingHeldValue, note: 'Introductory conversation — relationship established.' },
    { outcome: 'Not Interested', note: 'Not a fit at this time.' },
  ];

  const meetingRecords: Array<{
    attendeeId: number
    companyId: number
    companyName: string
    attendeeName: string
    attendeeFunction: string | null
    outcome: string
    outcomeNote: string
    repId: number
    repName: string
    timestamp: string
    isHeld: boolean
  }> = [];

  // Distribute meetings across companies and dates
  const repDayCount = new Map<string, number>(); // key: repId-dateStr

  let meetingIdx = 0;
  const perCompanyMeetings = Math.max(1, Math.round(meetingsScheduled / Math.max(companiesEngagedCount, 1)));

  const assignedAttendeeIds = new Set<number>();

  for (const company of engagedCompanies) {
    const atts = (attendeesByCompany.get(company.id) ?? []).slice(0, perCompanyMeetings);
    if (atts.length === 0) continue;

    for (let mi = 0; mi < Math.min(atts.length, perCompanyMeetings); mi++) {
      const availableAtts = atts.filter(a => !assignedAttendeeIds.has(a.id));
      if (availableAtts.length === 0) break;
      const att = availableAtts[0];
      assignedAttendeeIds.add(att.id);
      const dayIdx = meetingIdx % confDates.length;
      const confDay = confDates[dayIdx];

      // Cap to past dates
      const meetingDate = confDay > effectiveEndDate ? effectiveEndDate : confDay;
      const dateStr = meetingDate.toISOString().slice(0, 10);

      const repId = effectiveRepIds[meetingIdx % effectiveRepIds.length];
      const repKey = `${repId}-${dateStr}`;
      const dayCount = repDayCount.get(repKey) ?? 0;

      // Skip if rep already has 8 meetings that day
      if (dayCount >= 8) {
        meetingIdx++;
        continue;
      }
      repDayCount.set(repKey, dayCount + 1);

      const isHeld = meetingIdx < meetingsHeld;
      const outcome = isHeld
        ? outcomeDistribution[meetingIdx % outcomeDistribution.length]
        : { outcome: 'No Show', note: '' };

      const repName = repNames.get(repId) ?? 'Rep';
      const attendeeName = `${att.first_name} ${att.last_name}`.trim();

      meetingRecords.push({
        attendeeId: att.id,
        companyId: company.id,
        companyName: company.name,
        attendeeName,
        attendeeFunction: att.function,
        outcome: outcome.outcome,
        outcomeNote: outcome.note,
        repId,
        repName,
        timestamp: businessTimestamp(meetingDate, dayCount, 8),
        isHeld,
      });

      meetingIdx++;
    }
  }

  // Recompute follow-up counts based on actual companies with held meetings
  const companiesWithHeld = new Set(meetingRecords.filter(m => m.isHeld).map(m => m.companyId)).size;
  followUpsCreated = Math.round(companiesWithHeld * density.followUpRate);
  followUpsCompleted = Math.round(followUpsCreated * density.completionRate);

  // Write meetings
  const insertedMeetingIds: number[] = [];
  let meetingsWritten = 0;
  let notesMeetingIdx = 0;

  for (const m of meetingRecords) {
    const meetingDate = m.timestamp.slice(0, 10);
    const meetingTime = m.timestamp.slice(11, 19);
    const res = await client.execute({
      sql: `INSERT INTO meetings (attendee_id, conference_id, meeting_date, meeting_time, outcome, scheduled_by, source, created_at)
            VALUES (?, ?, ?, ?, ?, ?, 'simulated', ?)
            RETURNING id`,
      args: [m.attendeeId, conferenceId, meetingDate, meetingTime, m.outcome, m.repName, m.timestamp],
    }).catch(() => null);

    const meetingId = res?.rows?.[0]?.id != null ? Number(res.rows[0].id) : null;
    if (meetingId != null) {
      insertedMeetingIds.push(meetingId);
      meetingsWritten++;

      // Insert meeting notes for ~60% of held meetings
      if (m.isHeld && notesMeetingIdx % 5 < 3) {
        const productArea = 'solution';
        const functionArea = m.attendeeFunction ?? 'business';
        const noteText = `${m.repName} met with ${m.attendeeName} from ${m.companyName} at ${confName}. Discussion covered ${productArea} capabilities and alignment with their current ${functionArea} priorities. ${m.outcomeNote}`;
        await client.execute({
          sql: `INSERT INTO meeting_notes (meeting_id, notes_text, created_by, created_at)
                VALUES (?, ?, ?, ?)`,
          args: [meetingId, noteText, null, m.timestamp],
        }).catch(() => {});
      }
      notesMeetingIdx++;
    }
  }

  // Write follow-ups
  let followUpsWritten = 0;
  let fuIdx = 0;
  const nextStepsOptions = ['Schedule Follow Up Meeting', 'General Follow Up', 'Other'];

  for (const company of engagedCompanies) {
    if (fuIdx >= followUpsCreated) break;
    const atts = attendeesByCompany.get(company.id) ?? [];
    if (atts.length === 0) continue;
    const att = atts[0];

    const isCompleted = fuIdx < followUpsCompleted;
    const parentMeetingId = insertedMeetingIds[fuIdx] ?? null;

    // Follow-up date: conference_end + 2-10 days
    const fuDaysAfter = randInt(2, 10);
    const fuDate = addDays(confEndDate, fuDaysAfter);
    // Cap to today
    const fuTimestamp = toISOTimestamp(fuDate > today ? today : fuDate);

    const fuRepId = effectiveRepIds[fuIdx % effectiveRepIds.length];
    const fuRepName = repNames.get(fuRepId) ?? null;
    await client.execute({
      sql: `INSERT INTO follow_ups (attendee_id, conference_id, next_steps, assigned_rep, completed, meeting_id, source, created_at)
            VALUES (?, ?, ?, ?, ?, ?, 'simulated', ?)`,
      args: [att.id, conferenceId, nextStepsOptions[fuIdx % nextStepsOptions.length], fuRepName, isCompleted ? 1 : 0, parentMeetingId, fuTimestamp],
    }).catch(() => {});

    followUpsWritten++;
    fuIdx++;
  }

  // Write touchpoints
  let touchpointsWritten = 0;
  let tpIdx = 0;

  if (touchpointOptionId != null) {
    for (const company of engagedCompanies) {
      const tpPerCompany = Math.ceil(density.touchesPerCompany);
      for (let ti = 0; ti < tpPerCompany; ti++) {
        if (tpIdx >= touchpointsCount) break;
        const atts = attendeesByCompany.get(company.id) ?? [];
        if (atts.length === 0) continue;
        const att = atts[ti % atts.length];

        const dayIdx = tpIdx % confDates.length;
        const tpDate = confDates[dayIdx] > effectiveEndDate ? effectiveEndDate : confDates[dayIdx];
        const tpTimestamp = businessTimestamp(tpDate, ti, tpPerCompany);

        await client.execute({
          sql: `INSERT INTO attendee_touchpoints (attendee_id, conference_id, option_id, source, created_at)
                VALUES (?, ?, ?, 'simulated', ?)`,
          args: [att.id, conferenceId, touchpointOptionId, tpTimestamp],
        }).catch(() => {});

        touchpointsWritten++;
        tpIdx++;
      }
    }
  }

  return {
    projectedScore: finalScore,
    projectedDimensions: finalDims,
    weightedContributions,
    plan,
    written: true,
    recordsWritten: {
      meetings: meetingsWritten,
      followUps: followUpsWritten,
      touchpoints: touchpointsWritten,
    },
    convergenceWarning,
    dim3Warning,
  };
}
