import type { Client } from '@libsql/client';

export type ConferenceYoYRow = {
  conferenceId: number;
  conferenceName: string;
  year: string;
  startDate: string;
  endDate: string;
  strategy: string | null;
  trackName: string | null;
  totalCost: number | null;
  cesScore: number | null;
  costEfficiencyScore: number | null;
  pipelineInfluenced: number | null;
  pipelineNetNew: number | null;
  pipelineContinuedEngagement: number | null;
  pipelinePerK: number | null;
  costPerCompany: number | null;
  costPerMeeting: number | null;
  icpCompaniesTotal: number | null;
  icpCompaniesEngaged: number | null;
  icpEngagementRate: number | null;
  buyingCommitteeCoverageRate: number | null;
  decisionMakersEngaged: number | null;
  meetingHoldRate: number | null;
  followupSchedulingRate: number | null;
  followupCompletionRate: number | null;
  avgHealthScoreEngaged: number | null;
  returningAttendeeRate: number | null;
  companies3PlusInstances: number | null;
  hasSnapshot: boolean;
  snapshotTakenAt: string | null;
  strategyName: string | null;
  sponsorshipLevel: string | null;
  boothPresent: boolean | null;
  boothWidth: number | null;
  boothLength: number | null;
  boothNumber: string | null;
  boothHall: string | null;
  budgetTotal: number | null;
  actualTotal: number | null;
  budgetVariance: number | null;
  budgetLineItems: string | null;
  requiredPipelineMultiple: number | null;
  requiredPipelineAmount: number | null;
  expectedReturnAmount: number | null;
  stageOverride: string | null;
};

export type SeriesYoYData = {
  seriesId: string;
  seriesName: string;
  industryFocus: string | null;
  conferenceType: string | null;
  instances: ConferenceYoYRow[];
  instanceCount: number;
  instancesWithSnapshots: number;
};

function num(val: unknown): number | null {
  if (val == null) return null;
  const n = Number(val);
  return isNaN(n) ? null : n;
}

export async function getSeriesYoYData(
  seriesId: string,
  db: Client,
): Promise<SeriesYoYData> {
  const seriesCheck = await db.execute({
    sql: `SELECT id, display_name, industry_focus, conference_type FROM conference_series WHERE id = ?`,
    args: [seriesId],
  });
  if (seriesCheck.rows.length === 0) {
    throw new Error(`Series not found: ${seriesId}`);
  }
  const seriesRow = seriesCheck.rows[0];

  const res = await db.execute({
    sql: `SELECT
            c.id AS conference_id,
            c.name AS conference_name,
            c.start_date,
            c.end_date,
            co.value AS strategy,
            cs_track.season_name AS track_name,
            snap.snapshot_taken_at,
            snap.ces_score,
            snap.cost_efficiency_score,
            snap.total_cost,
            snap.pipeline_influenced,
            snap.pipeline_net_new,
            snap.pipeline_continued_engagement,
            snap.pipeline_per_1k,
            snap.cost_per_company_engaged,
            snap.cost_per_meeting_held,
            snap.icp_companies_total,
            snap.icp_companies_engaged,
            snap.icp_engagement_rate,
            snap.buying_committee_coverage_rate,
            snap.decision_makers_engaged,
            snap.meeting_hold_rate,
            snap.followup_scheduling_rate,
            snap.followup_completion_rate,
            snap.avg_health_score_engaged,
            snap.returning_attendee_rate,
            snap.companies_3plus_instances,
            snap.strategy_name,
            snap.sponsorship_level,
            snap.booth_present,
            snap.booth_width,
            snap.booth_length,
            snap.booth_number,
            snap.booth_hall,
            snap.budget_total,
            snap.actual_total,
            snap.budget_variance,
            snap.budget_line_items,
            snap.required_pipeline_multiple,
            snap.required_pipeline_amount,
            snap.expected_return_amount,
            c.stage_override
          FROM conferences c
          LEFT JOIN conference_seasons cs_track ON cs_track.id = c.season_id
          LEFT JOIN config_options co ON co.id = c.conference_strategy_type_id
          LEFT JOIN conference_snapshots snap ON snap.conference_id = c.id
          WHERE c.series_id = ?
          ORDER BY c.start_date ASC`,
    args: [seriesId],
  });

  const instances: ConferenceYoYRow[] = res.rows.map(row => {
    const startDate = String(row.start_date ?? '');
    const year = startDate ? new Date(startDate).getFullYear().toString() : '';
    return {
      conferenceId: Number(row.conference_id),
      conferenceName: String(row.conference_name ?? ''),
      year,
      startDate,
      endDate: String(row.end_date ?? ''),
      strategy: row.strategy != null ? String(row.strategy) : null,
      trackName: row.track_name != null ? String(row.track_name) : null,
      totalCost: num(row.total_cost),
      cesScore: num(row.ces_score),
      costEfficiencyScore: num(row.cost_efficiency_score),
      pipelineInfluenced: num(row.pipeline_influenced),
      pipelineNetNew: num(row.pipeline_net_new),
      pipelineContinuedEngagement: num(row.pipeline_continued_engagement),
      pipelinePerK: num(row.pipeline_per_1k),
      costPerCompany: num(row.cost_per_company_engaged),
      costPerMeeting: num(row.cost_per_meeting_held),
      icpCompaniesTotal: num(row.icp_companies_total),
      icpCompaniesEngaged: num(row.icp_companies_engaged),
      icpEngagementRate: num(row.icp_engagement_rate),
      buyingCommitteeCoverageRate: num(row.buying_committee_coverage_rate),
      decisionMakersEngaged: num(row.decision_makers_engaged),
      meetingHoldRate: num(row.meeting_hold_rate),
      followupSchedulingRate: num(row.followup_scheduling_rate),
      followupCompletionRate: num(row.followup_completion_rate),
      avgHealthScoreEngaged: num(row.avg_health_score_engaged),
      returningAttendeeRate: num(row.returning_attendee_rate),
      companies3PlusInstances: num(row.companies_3plus_instances),
      hasSnapshot: row.snapshot_taken_at != null,
      snapshotTakenAt: row.snapshot_taken_at != null ? String(row.snapshot_taken_at) : null,
      strategyName: row.strategy_name != null ? String(row.strategy_name) : null,
      sponsorshipLevel: row.sponsorship_level != null ? String(row.sponsorship_level) : null,
      boothPresent: row.booth_present != null ? Number(row.booth_present) === 1 : null,
      boothWidth: num(row.booth_width),
      boothLength: num(row.booth_length),
      boothNumber: row.booth_number != null ? String(row.booth_number) : null,
      boothHall: row.booth_hall != null ? String(row.booth_hall) : null,
      budgetTotal: num(row.budget_total),
      actualTotal: num(row.actual_total),
      budgetVariance: num(row.budget_variance),
      budgetLineItems: row.budget_line_items != null ? String(row.budget_line_items) : null,
      requiredPipelineMultiple: num(row.required_pipeline_multiple),
      requiredPipelineAmount: num(row.required_pipeline_amount),
      expectedReturnAmount: num(row.expected_return_amount),
      stageOverride: row.stage_override != null ? String(row.stage_override) : null,
    };
  });

  return {
    seriesId,
    seriesName: String(seriesRow.display_name ?? ''),
    industryFocus: seriesRow.industry_focus != null ? String(seriesRow.industry_focus) : null,
    conferenceType: seriesRow.conference_type != null ? String(seriesRow.conference_type) : null,
    instances,
    instanceCount: instances.length,
    instancesWithSnapshots: instances.filter(i => i.hasSnapshot).length,
  };
}
