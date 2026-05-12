import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { db, dbReady } from '@/lib/db';
import { reweight, pct } from '@/lib/effectiveness/salesExecution';
import type { InValue } from '@libsql/client';

export const dynamic = 'force-dynamic';

type Row = Record<string, unknown>;
async function runQuery(sql: string, args: InValue[] = []): Promise<Row[]> {
  await dbReady;
  const r = await db.execute({ sql, args });
  return r.rows as Row[];
}

function resolveRepIds(raw: unknown): string[] {
  return String(raw ?? '').split(',').map(s => s.trim()).filter(Boolean);
}

function dateMsOffset(dateStr: string, offsetMs: number): string {
  const d = new Date(dateStr);
  d.setTime(d.getTime() + offsetMs);
  return d.toISOString().slice(0, 10);
}

function scoreLowerIsBetter(value: number, eliteMax: number, strongMax: number, healthyMax: number, weakMax: number): number {
  if (value <= eliteMax) return Math.round(100 - (value / eliteMax) * 5);
  if (value <= strongMax) return Math.round(94 - ((value - eliteMax) / (strongMax - eliteMax)) * 14);
  if (value <= healthyMax) return Math.round(79 - ((value - strongMax) / (healthyMax - strongMax)) * 14);
  if (value <= weakMax) return Math.round(64 - ((value - healthyMax) / (weakMax - healthyMax)) * 14);
  return Math.max(35, Math.round(49 - ((value - weakMax) / weakMax) * 14));
}

interface RepConfData {
  meetingsScheduled: number;
  meetingsHeld: number;
  companiesWithMeeting: number;
  coWithMtgFu: number;
  followupsCreated: number;
  followupsCompleted: number;
  targetsMet: number;
  targetsFu: number;
  touchpoints: number;
}

interface EffSettings {
  followUpRate: number;   // conversion rate for meetings → pipeline (0..1)
  touchpointRate: number; // conversion rate for touchpoints → pipeline
  dealSize: number;       // avg deal size in $
  expectedReturn: number; // expected ROI multiplier on spend
  expectedActivities: number;  // total expected meetings+touchpoints per conference
  expectedCompanies: number;   // total expected companies engaged per conference
}

function computeSES(
  d: RepConfData,
  totalTargets: number,
  repPipelineDenominator: number | null,
  repExpectedActivities: number,
  repExpectedCompanies: number,
  eff: EffSettings,
): {
  sesScore: number | null;
  approxPipeline: number;
  components: {
    meeting_execution: number | null;
    followup_execution: number | null;
    pipeline_influence: number | null;
    target_account_execution: number | null;
    rep_productivity: number | null;
  };
} {
  const holdRate = pct(d.meetingsHeld, d.meetingsScheduled);
  const fuAttachRate = d.companiesWithMeeting > 0 ? pct(d.coWithMtgFu, d.companiesWithMeeting) : null;
  let meeting_execution: number | null = null;
  if (holdRate != null && fuAttachRate != null) meeting_execution = Math.round(holdRate * 0.5 + fuAttachRate * 0.5);
  else if (holdRate != null) meeting_execution = Math.round(holdRate);
  else if (fuAttachRate != null) meeting_execution = Math.round(fuAttachRate);

  const fu = pct(d.followupsCompleted, d.followupsCreated);
  const followup_execution = fu != null ? Math.round(fu) : null;

  let target_account_execution: number | null = null;
  if (totalTargets > 0) {
    target_account_execution = Math.round(Math.min(100, ((d.targetsMet + d.targetsFu) / totalTargets) * 100));
  }

  // Company-level attribution: each unique company engaged by this rep contributes
  // one deal at the meeting conversion rate. Touchpoints to companies without a
  // meeting also contribute at the lower touchpoint rate — approximated here as
  // (total companies with meeting × followUpRate) since we don't separately track
  // touchpoint-only companies per rep.
  const approxPipeline = d.companiesWithMeeting * eff.followUpRate * eff.dealSize;

  let pipeline_influence: number | null = null;
  if (repPipelineDenominator != null && repPipelineDenominator > 0 && approxPipeline > 0) {
    pipeline_influence = Math.round(Math.min((approxPipeline / repPipelineDenominator) * 100, 100));
  }

  // Rep productivity: activity volume + company coverage vs per-rep expected benchmarks
  let rep_productivity: number | null = null;
  const activities = d.meetingsHeld + d.touchpoints;
  const activityScore = repExpectedActivities > 0 ? Math.min((activities / repExpectedActivities) * 100, 100) : null;
  const coverageScore = repExpectedCompanies > 0 ? Math.min((d.companiesWithMeeting / repExpectedCompanies) * 100, 100) : null;
  if (activityScore != null || coverageScore != null) {
    const parts = [activityScore, coverageScore].filter((v): v is number => v != null);
    rep_productivity = Math.round(parts.reduce((a, b) => a + b, 0) / parts.length);
  }

  const { score } = reweight([
    { key: 'meeting_execution', score: meeting_execution, weight: 0.25 },
    { key: 'followup_execution', score: followup_execution, weight: 0.20 },
    { key: 'pipeline_influence', score: pipeline_influence, weight: 0.25 },
    { key: 'target_account_execution', score: target_account_execution, weight: 0.15 },
    { key: 'rep_productivity', score: rep_productivity, weight: 0.15 },
  ]);

  return {
    sesScore: score,
    approxPipeline,
    components: { meeting_execution, followup_execution, pipeline_influence, target_account_execution, rep_productivity },
  };
}

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAuth(req);
    if (auth instanceof NextResponse) return auth;

    const { searchParams } = new URL(req.url);
    const startDate = searchParams.get('startDate') ?? '';
    const endDate = searchParams.get('endDate') ?? '';

    if (!startDate || !endDate) {
      return NextResponse.json({ error: 'startDate and endDate required' }, { status: 400 });
    }

    // 1. Fetch conferences in range
    const confRows = await runQuery(
      `SELECT c.id, c.name, COALESCE(c.end_date, c.start_date) AS conf_date
       FROM conferences c
       WHERE COALESCE(c.end_date, c.start_date) >= ? AND COALESCE(c.end_date, c.start_date) <= ?
       ORDER BY conf_date ASC`,
      [startDate, endDate],
    );

    if (confRows.length === 0) {
      return NextResponse.json({ conferences: [], reps: [], priorAvg: {} });
    }

    const confIds = confRows.map(r => Number(r.id));
    const placeholders = confIds.map(() => '?').join(',');

    // 2. Fetch rep name map
    const repNameRows = await runQuery(
      `SELECT co.id, COALESCE(u.display_name, co.value) AS display_name, u.role
       FROM config_options co
       LEFT JOIN users u ON u.config_id = co.id
       WHERE co.category = 'user'`,
    );
    const repNameMap = new Map<string, { name: string; role: string | null }>();
    for (const r of repNameRows) {
      repNameMap.set(String(r.id), {
        name: String(r.display_name ?? r.id),
        role: r.role != null ? String(r.role) : null,
      });
    }

    // 3. Run parallel queries
    const [
      meetingRows,
      fuAttachRows,
      followupRows,
      targetTotalRows,
      targetMeetingRows,
      targetFuRows,
      budgetRows,
      confTotalsRows,
      confSpendRows,
      touchpointRows,
      effDefaultsRows,
    ] = await Promise.all([
      // a. Meetings by rep
      runQuery(
        `SELECT m.conference_id, m.scheduled_by AS rep_raw,
                COUNT(*) AS meetings_scheduled,
                COUNT(CASE WHEN LOWER(COALESCE(cop.action_key,''))='meeting_held' THEN 1 END) AS meetings_held,
                COUNT(DISTINCT CASE WHEN LOWER(COALESCE(cop.action_key,''))='meeting_held' THEN a.company_id END) AS companies_with_meeting
         FROM meetings m
         JOIN attendees a ON m.attendee_id=a.id
         LEFT JOIN config_options cop ON cop.category='action' AND LOWER(m.outcome)=LOWER(cop.value)
         WHERE m.conference_id IN (${placeholders}) AND m.scheduled_by IS NOT NULL AND m.scheduled_by != ''
         GROUP BY m.conference_id, m.scheduled_by`,
        confIds,
      ),
      // b. Follow-up attachments by rep
      runQuery(
        `SELECT m.conference_id, m.scheduled_by AS rep_raw,
                COUNT(DISTINCT CASE WHEN fu.id IS NOT NULL THEN a.company_id END) AS co_with_mtg_fu
         FROM meetings m
         JOIN attendees a ON m.attendee_id=a.id
         LEFT JOIN config_options cop ON cop.category='action' AND LOWER(m.outcome)=LOWER(cop.value)
         LEFT JOIN follow_ups fu ON fu.conference_id=m.conference_id AND fu.attendee_id=m.attendee_id
                                  AND fu.next_steps IS NOT NULL AND fu.next_steps!=''
         WHERE m.conference_id IN (${placeholders})
           AND LOWER(COALESCE(cop.action_key,''))='meeting_held'
           AND m.scheduled_by IS NOT NULL AND m.scheduled_by!=''
         GROUP BY m.conference_id, m.scheduled_by`,
        confIds,
      ),
      // c. Follow-ups by rep
      runQuery(
        `SELECT fu.conference_id, fu.assigned_rep AS rep_raw,
                COUNT(*) AS followups_created,
                SUM(CASE WHEN CAST(fu.completed AS TEXT) IN ('1','true') THEN 1 ELSE 0 END) AS followups_completed
         FROM follow_ups fu
         WHERE fu.conference_id IN (${placeholders})
           AND fu.next_steps IS NOT NULL AND fu.next_steps!=''
           AND fu.assigned_rep IS NOT NULL AND fu.assigned_rep!=''
         GROUP BY fu.conference_id, fu.assigned_rep`,
        confIds,
      ),
      // d. Target totals per conference
      runQuery(
        `SELECT conference_id, COUNT(DISTINCT attendee_id) AS total_targets
         FROM conference_targets
         WHERE conference_id IN (${placeholders})
         GROUP BY conference_id`,
        confIds,
      ),
      // e. Target meetings by rep
      runQuery(
        `SELECT m.conference_id, m.scheduled_by AS rep_raw, COUNT(DISTINCT m.attendee_id) AS targets_met
         FROM meetings m
         LEFT JOIN config_options cop ON cop.category='action' AND LOWER(m.outcome)=LOWER(cop.value)
         WHERE m.conference_id IN (${placeholders})
           AND LOWER(COALESCE(cop.action_key,''))='meeting_held'
           AND m.attendee_id IN (SELECT attendee_id FROM conference_targets WHERE conference_id=m.conference_id)
           AND m.scheduled_by IS NOT NULL AND m.scheduled_by!=''
         GROUP BY m.conference_id, m.scheduled_by`,
        confIds,
      ),
      // f. Target followups by rep
      runQuery(
        `SELECT fu.conference_id, fu.assigned_rep AS rep_raw, COUNT(DISTINCT fu.attendee_id) AS targets_fu
         FROM follow_ups fu
         WHERE fu.conference_id IN (${placeholders})
           AND fu.next_steps IS NOT NULL AND fu.next_steps!=''
           AND fu.attendee_id IN (SELECT attendee_id FROM conference_targets WHERE conference_id=fu.conference_id)
           AND fu.assigned_rep IS NOT NULL AND fu.assigned_rep!=''
         GROUP BY fu.conference_id, fu.assigned_rep`,
        confIds,
      ),
      // g. Required pipeline
      runQuery(
        `SELECT conference_id, CAST(required_pipeline_amount AS REAL) AS req_pipeline
         FROM conference_budget
         WHERE conference_id IN (${placeholders})
           AND required_pipeline_amount IS NOT NULL
           AND CAST(required_pipeline_amount AS REAL) > 0`,
        confIds,
      ).catch(() => [] as Row[]),
      // h. Total companies + companies engaged per conference (for CES breadth)
      runQuery(
        `SELECT ca.conference_id,
                COUNT(DISTINCT a.company_id) AS total_companies,
                COUNT(DISTINCT CASE WHEN m_held.company_id IS NOT NULL THEN a.company_id END) AS companies_engaged
         FROM conference_attendees ca
         JOIN attendees a ON ca.attendee_id=a.id AND a.company_id IS NOT NULL
         LEFT JOIN (
           SELECT m.conference_id, a2.company_id
           FROM meetings m
           JOIN attendees a2 ON m.attendee_id=a2.id
           LEFT JOIN config_options cop ON cop.category='action' AND LOWER(m.outcome)=LOWER(cop.value)
           WHERE LOWER(COALESCE(cop.action_key,''))='meeting_held'
         ) m_held ON m_held.conference_id=ca.conference_id AND m_held.company_id=a.company_id
         WHERE ca.conference_id IN (${placeholders})
         GROUP BY ca.conference_id`,
        confIds,
      ).catch(() => [] as Row[]),
      // i. Total spend per conference (for cost efficiency)
      runQuery(
        `SELECT cb.conference_id,
                SUM(COALESCE(
                  NULLIF(CAST(json_extract(li.value, '$.actual') AS REAL), 0),
                  CAST(json_extract(li.value, '$.budget') AS REAL), 0
                )) AS total_spend
         FROM conference_budget cb, json_each(cb.line_items) li
         WHERE cb.conference_id IN (${placeholders})
           AND cb.line_items IS NOT NULL
           AND cb.line_items NOT IN ('', '[]', 'null')
           AND json_valid(cb.line_items)=1
         GROUP BY cb.conference_id`,
        confIds,
      ).catch(() => [] as Row[]),
      // j. Touchpoints per rep per conference (via meetings → attendees)
      runQuery(
        `SELECT m.conference_id, m.scheduled_by AS rep_raw,
                COUNT(DISTINCT atp.id) AS touchpoints
         FROM meetings m
         JOIN attendees a ON m.attendee_id = a.id
         JOIN attendee_touchpoints atp ON atp.attendee_id = a.id
         WHERE m.conference_id IN (${placeholders})
           AND m.scheduled_by IS NOT NULL AND m.scheduled_by != ''
         GROUP BY m.conference_id, m.scheduled_by`,
        confIds,
      ).catch(() => [] as Row[]),
      // k. Effectiveness defaults for pipeline influence + productivity scoring
      runQuery(
        `SELECT key, value FROM effectiveness_defaults
         WHERE key IN (
           'follow_up_meeting_conversion_rate',
           'touchpoint_conversion_rate',
           'avg_annual_deal_size',
           'expected_return_on_event_cost',
           'expected_sales_activities',
           'expected_companies_engaged'
         )`,
      ).catch(() => [] as Row[]),
    ]);

    // Build lookup maps
    const targetTotalMap = new Map<number, number>();
    for (const r of targetTotalRows) targetTotalMap.set(Number(r.conference_id), Number(r.total_targets ?? 0));

    // Parse effectiveness defaults
    const effLookup = new Map<string, number>();
    for (const r of effDefaultsRows) effLookup.set(String(r.key), Number(r.value ?? 0));
    const effSettings: EffSettings = {
      followUpRate: effLookup.get('follow_up_meeting_conversion_rate') != null
        ? effLookup.get('follow_up_meeting_conversion_rate')! / 100
        : 0.30,
      touchpointRate: effLookup.get('touchpoint_conversion_rate') != null
        ? effLookup.get('touchpoint_conversion_rate')! / 100
        : 0.15,
      dealSize: effLookup.get('avg_annual_deal_size') || 50000,
      expectedReturn: effLookup.get('expected_return_on_event_cost') || 3,
      expectedActivities: effLookup.get('expected_sales_activities') || 60,
      expectedCompanies: effLookup.get('expected_companies_engaged') || 30,
    };

    // Touchpoints per rep per conference
    const touchpointMap = new Map<string, Map<number, number>>();
    for (const r of touchpointRows) {
      const reps = resolveRepIds(r.rep_raw);
      if (!reps.length) continue;
      const confId = Number(r.conference_id);
      const tp = Number(r.touchpoints ?? 0);
      for (const repId of reps) {
        if (!touchpointMap.has(repId)) touchpointMap.set(repId, new Map());
        touchpointMap.get(repId)!.set(confId, (touchpointMap.get(repId)!.get(confId) ?? 0) + tp / reps.length);
      }
    }

    const confTotalsMap = new Map<number, { totalCompanies: number; companiesEngaged: number }>();
    for (const r of confTotalsRows) {
      confTotalsMap.set(Number(r.conference_id), {
        totalCompanies: Number(r.total_companies ?? 0),
        companiesEngaged: Number(r.companies_engaged ?? 0),
      });
    }

    const confSpendMap = new Map<number, number>();
    for (const r of confSpendRows) {
      if (r.total_spend != null) confSpendMap.set(Number(r.conference_id), Number(r.total_spend));
    }

    const reqPipelineMap = new Map<number, number>();
    for (const r of budgetRows) {
      if (r.req_pipeline != null) reqPipelineMap.set(Number(r.conference_id), Number(r.req_pipeline));
    }

    // 4. Build repConfMap: repId -> confId -> RepConfData
    const repConfMap = new Map<string, Map<number, RepConfData>>();

    const getOrCreate = (repId: string, confId: number): RepConfData => {
      if (!repConfMap.has(repId)) repConfMap.set(repId, new Map());
      const confMap = repConfMap.get(repId)!;
      if (!confMap.has(confId)) {
        confMap.set(confId, { meetingsScheduled: 0, meetingsHeld: 0, companiesWithMeeting: 0, coWithMtgFu: 0, followupsCreated: 0, followupsCompleted: 0, targetsMet: 0, targetsFu: 0, touchpoints: 0 });
      }
      return confMap.get(confId)!;
    };

    for (const r of meetingRows) {
      const reps = resolveRepIds(r.rep_raw);
      if (!reps.length) continue;
      const confId = Number(r.conference_id);
      for (const repId of reps) {
        const d = getOrCreate(repId, confId);
        d.meetingsScheduled += Number(r.meetings_scheduled ?? 0) / reps.length;
        d.meetingsHeld += Number(r.meetings_held ?? 0) / reps.length;
        d.companiesWithMeeting += Number(r.companies_with_meeting ?? 0) / reps.length;
      }
    }
    for (const r of fuAttachRows) {
      const reps = resolveRepIds(r.rep_raw);
      if (!reps.length) continue;
      const confId = Number(r.conference_id);
      for (const repId of reps) getOrCreate(repId, confId).coWithMtgFu += Number(r.co_with_mtg_fu ?? 0) / reps.length;
    }
    for (const r of followupRows) {
      const reps = resolveRepIds(r.rep_raw);
      if (!reps.length) continue;
      const confId = Number(r.conference_id);
      for (const repId of reps) {
        const d = getOrCreate(repId, confId);
        d.followupsCreated += Number(r.followups_created ?? 0) / reps.length;
        d.followupsCompleted += Number(r.followups_completed ?? 0) / reps.length;
      }
    }
    for (const r of targetMeetingRows) {
      const reps = resolveRepIds(r.rep_raw);
      if (!reps.length) continue;
      const confId = Number(r.conference_id);
      for (const repId of reps) getOrCreate(repId, confId).targetsMet += Number(r.targets_met ?? 0) / reps.length;
    }
    for (const r of targetFuRows) {
      const reps = resolveRepIds(r.rep_raw);
      if (!reps.length) continue;
      const confId = Number(r.conference_id);
      for (const repId of reps) getOrCreate(repId, confId).targetsFu += Number(r.targets_fu ?? 0) / reps.length;
    }

    // 5. Compute per-rep CES (conference effectiveness) per conference
    // dim2 = rep's hold rate * 0.5 + fu attachment * 0.5
    // dim4 = rep's companies with meeting / total companies at conference (rep's engagement breadth)
    // dim5 = rep's followup completion rate
    const computeRepCES = (d: RepConfData, totalCompanies: number): {
      score: number | null;
      components: { meeting_execution: number | null; engagement_breadth: number | null; followup_execution: number | null };
    } => {
      const holdRate = pct(d.meetingsHeld, d.meetingsScheduled);
      const fuAttach = d.companiesWithMeeting > 0 ? pct(d.coWithMtgFu, d.companiesWithMeeting) : null;
      const dim2 = holdRate != null && fuAttach != null ? holdRate * 0.5 + fuAttach * 0.5 : (holdRate ?? fuAttach ?? null);
      const dim4 = totalCompanies > 0 ? (d.companiesWithMeeting / totalCompanies) * 100 : null;
      const dim5 = pct(d.followupsCompleted, d.followupsCreated);
      const meeting_execution = dim2 != null ? Math.round(dim2) : null;
      const engagement_breadth = dim4 != null ? Math.round(dim4) : null;
      const followup_execution = dim5 != null ? Math.round(dim5) : null;
      const { score } = reweight([
        { key: 'dim2_meeting_exec', score: meeting_execution, weight: 0.20 },
        { key: 'dim4_breadth', score: engagement_breadth, weight: 0.05 },
        { key: 'dim5_followup', score: followup_execution, weight: 0.10 },
      ]);
      return { score, components: { meeting_execution, engagement_breadth, followup_execution } };
    };

    // 6. Compute cost efficiency per rep per conference
    // Active reps per conference = reps with at least 1 meeting held
    const activeRepsPerConf = new Map<number, number>();
    for (const [, confMap] of Array.from(repConfMap.entries())) {
      for (const [confId, d] of Array.from(confMap.entries())) {
        if (d.meetingsHeld >= 1) {
          activeRepsPerConf.set(confId, (activeRepsPerConf.get(confId) ?? 0) + 1);
        }
      }
    }

    interface CostSubScores {
      score: number | null;
      cpmScore: number | null;
      cpcScore: number | null;
    }

    const costEffScoreMap = new Map<string, Map<number, CostSubScores>>();
    for (const [repId, confMap] of Array.from(repConfMap.entries())) {
      const repCostMap = new Map<number, CostSubScores>();
      for (const [confId, d] of Array.from(confMap.entries())) {
        const totalSpend = confSpendMap.get(confId) ?? 0;
        const numReps = Math.max(activeRepsPerConf.get(confId) ?? 1, 1);
        const repSpend = totalSpend / numReps;

        let score: number | null = null;
        let cpmScore: number | null = null;
        let cpcScore: number | null = null;
        if (repSpend > 0 && d.meetingsHeld >= 1) {
          const cpm = repSpend / d.meetingsHeld;
          const cpc = d.companiesWithMeeting > 0 ? repSpend / d.companiesWithMeeting : null;

          cpmScore = scoreLowerIsBetter(cpm, 400, 700, 1100, 1800);
          cpcScore = cpc != null ? scoreLowerIsBetter(cpc, 350, 650, 1000, 1600) : null;

          const parts: { val: number; w: number }[] = [{ val: cpmScore, w: 0.50 }];
          if (cpcScore != null) parts.push({ val: cpcScore, w: 0.50 });
          const totalW = parts.reduce((s, p) => s + p.w, 0);
          score = Math.round(parts.reduce((s, p) => s + p.val * p.w, 0) / totalW);
        }
        repCostMap.set(confId, { score, cpmScore, cpcScore });
      }
      costEffScoreMap.set(repId, repCostMap);
    }

    // 7. Build rep results
    type RepConfScore = {
      sesScore: number | null;
      cesScore: number | null;
      costEffScore: number | null;
      approxPipeline: number;       // company-level pipeline $ (companiesWithMeeting × convRate × dealSize)
      pipelineGoalShare: number;    // rep's proportionate share of the conference pipeline goal
      components: {
        meeting_execution: number | null;
        followup_execution: number | null;
        pipeline_influence: number | null;
        target_account_execution: number | null;
        rep_productivity: number | null;
      };
      ces_components: {
        meeting_execution: number | null;
        engagement_breadth: number | null;
        followup_execution: number | null;
      };
      cost_components: {
        cpm_score: number | null;   // cost per meeting scored
        cpc_score: number | null;   // cost per company scored
      };
    };

    const repResults: {
      repId: string;
      repName: string;
      role: string | null;
      conferences: Record<number, RepConfScore>;
    }[] = [];

    for (const [repId, confMap] of Array.from(repConfMap.entries())) {
      const info = repNameMap.get(repId);
      if (!info) continue;

      const conferences: Record<number, RepConfScore> = {};
      for (const [confId, d] of Array.from(confMap.entries())) {
        // Populate touchpoints from separate query
        d.touchpoints = touchpointMap.get(repId)?.get(confId) ?? 0;

        const totalTargets = targetTotalMap.get(confId) ?? 0;
        const numActiveReps = Math.max(activeRepsPerConf.get(confId) ?? 1, 1);
        const totalSpend = confSpendMap.get(confId) ?? 0;
        const requiredPipeline = reqPipelineMap.get(confId) ?? null;

        // Per-rep pipeline denominator: required pipeline / reps, or spend * expected return / reps
        const confPipelineDenominator = requiredPipeline != null && requiredPipeline > 0
          ? requiredPipeline / numActiveReps
          : totalSpend > 0
            ? (totalSpend * effSettings.expectedReturn) / numActiveReps
            : null;

        // Per-rep expected activity benchmarks (conference totals divided by active reps)
        const repExpectedActivities = effSettings.expectedActivities / numActiveReps;
        const repExpectedCompanies = effSettings.expectedCompanies / numActiveReps;

        const ses = computeSES(d, totalTargets, confPipelineDenominator, repExpectedActivities, repExpectedCompanies, effSettings);
        const totalCompanies = confTotalsMap.get(confId)?.totalCompanies ?? 0;
        const ces = computeRepCES(d, totalCompanies);
        const costData = costEffScoreMap.get(repId)?.get(confId);
        conferences[confId] = {
          sesScore: ses.sesScore,
          cesScore: ces.score,
          costEffScore: costData?.score ?? null,
          approxPipeline: ses.approxPipeline,
          pipelineGoalShare: confPipelineDenominator ?? 0,
          components: ses.components,
          ces_components: ces.components,
          cost_components: {
            cpm_score: costData?.cpmScore ?? null,
            cpc_score: costData?.cpcScore ?? null,
          },
        };
      }

      if (Object.keys(conferences).length > 0) {
        repResults.push({ repId, repName: info.name, role: info.role, conferences });
      }
    }

    // 8. Prior period trend
    const startMs = new Date(startDate).getTime();
    const endMs = new Date(endDate).getTime();
    const durationMs = endMs - startMs;
    const priorStart = dateMsOffset(startDate, -durationMs);
    const priorEnd = dateMsOffset(endDate, -durationMs);

    let priorAvg: Record<string, number> = {};
    try {
      const priorConfRows = await runQuery(
        `SELECT c.id FROM conferences c
         WHERE COALESCE(c.end_date, c.start_date) >= ? AND COALESCE(c.end_date, c.start_date) <= ?`,
        [priorStart, priorEnd],
      );

      if (priorConfRows.length > 0) {
        const priorConfIds = priorConfRows.map(r => Number(r.id));
        const priorPlaceholders = priorConfIds.map(() => '?').join(',');

        const priorTotalTargetRows = await runQuery(
          `SELECT conference_id, COUNT(DISTINCT attendee_id) AS total_targets
           FROM conference_targets WHERE conference_id IN (${priorPlaceholders}) GROUP BY conference_id`,
          priorConfIds,
        ).catch(() => [] as Row[]);
        const priorTargetTotalMap = new Map<number, number>();
        for (const r of priorTotalTargetRows) priorTargetTotalMap.set(Number(r.conference_id), Number(r.total_targets ?? 0));

        const [priorMtgRows, priorFuAttachRows, priorFuRows, priorTgtMtgRows, priorTgtFuRows] = await Promise.all([
          runQuery(
            `SELECT m.conference_id, m.scheduled_by AS rep_raw,
                    COUNT(*) AS meetings_scheduled,
                    COUNT(CASE WHEN LOWER(COALESCE(cop.action_key,''))='meeting_held' THEN 1 END) AS meetings_held,
                    COUNT(DISTINCT CASE WHEN LOWER(COALESCE(cop.action_key,''))='meeting_held' THEN a.company_id END) AS companies_with_meeting
             FROM meetings m JOIN attendees a ON m.attendee_id=a.id
             LEFT JOIN config_options cop ON cop.category='action' AND LOWER(m.outcome)=LOWER(cop.value)
             WHERE m.conference_id IN (${priorPlaceholders}) AND m.scheduled_by IS NOT NULL AND m.scheduled_by != ''
             GROUP BY m.conference_id, m.scheduled_by`,
            priorConfIds,
          ),
          runQuery(
            `SELECT m.conference_id, m.scheduled_by AS rep_raw,
                    COUNT(DISTINCT CASE WHEN fu.id IS NOT NULL THEN a.company_id END) AS co_with_mtg_fu
             FROM meetings m JOIN attendees a ON m.attendee_id=a.id
             LEFT JOIN config_options cop ON cop.category='action' AND LOWER(m.outcome)=LOWER(cop.value)
             LEFT JOIN follow_ups fu ON fu.conference_id=m.conference_id AND fu.attendee_id=m.attendee_id
                                      AND fu.next_steps IS NOT NULL AND fu.next_steps!=''
             WHERE m.conference_id IN (${priorPlaceholders})
               AND LOWER(COALESCE(cop.action_key,''))='meeting_held'
               AND m.scheduled_by IS NOT NULL AND m.scheduled_by!=''
             GROUP BY m.conference_id, m.scheduled_by`,
            priorConfIds,
          ),
          runQuery(
            `SELECT fu.conference_id, fu.assigned_rep AS rep_raw,
                    COUNT(*) AS followups_created,
                    SUM(CASE WHEN CAST(fu.completed AS TEXT) IN ('1','true') THEN 1 ELSE 0 END) AS followups_completed
             FROM follow_ups fu
             WHERE fu.conference_id IN (${priorPlaceholders})
               AND fu.next_steps IS NOT NULL AND fu.next_steps!=''
               AND fu.assigned_rep IS NOT NULL AND fu.assigned_rep!=''
             GROUP BY fu.conference_id, fu.assigned_rep`,
            priorConfIds,
          ),
          runQuery(
            `SELECT m.conference_id, m.scheduled_by AS rep_raw, COUNT(DISTINCT m.attendee_id) AS targets_met
             FROM meetings m LEFT JOIN config_options cop ON cop.category='action' AND LOWER(m.outcome)=LOWER(cop.value)
             WHERE m.conference_id IN (${priorPlaceholders})
               AND LOWER(COALESCE(cop.action_key,''))='meeting_held'
               AND m.attendee_id IN (SELECT attendee_id FROM conference_targets WHERE conference_id=m.conference_id)
               AND m.scheduled_by IS NOT NULL AND m.scheduled_by!=''
             GROUP BY m.conference_id, m.scheduled_by`,
            priorConfIds,
          ),
          runQuery(
            `SELECT fu.conference_id, fu.assigned_rep AS rep_raw, COUNT(DISTINCT fu.attendee_id) AS targets_fu
             FROM follow_ups fu
             WHERE fu.conference_id IN (${priorPlaceholders})
               AND fu.next_steps IS NOT NULL AND fu.next_steps!=''
               AND fu.attendee_id IN (SELECT attendee_id FROM conference_targets WHERE conference_id=fu.conference_id)
               AND fu.assigned_rep IS NOT NULL AND fu.assigned_rep!=''
             GROUP BY fu.conference_id, fu.assigned_rep`,
            priorConfIds,
          ),
        ]);

        const priorRepConfMap = new Map<string, Map<number, RepConfData>>();
        const getP = (repId: string, confId: number): RepConfData => {
          if (!priorRepConfMap.has(repId)) priorRepConfMap.set(repId, new Map());
          const cm = priorRepConfMap.get(repId)!;
          if (!cm.has(confId)) cm.set(confId, { meetingsScheduled: 0, meetingsHeld: 0, companiesWithMeeting: 0, coWithMtgFu: 0, followupsCreated: 0, followupsCompleted: 0, targetsMet: 0, targetsFu: 0, touchpoints: 0 });
          return cm.get(confId)!;
        };

        for (const r of priorMtgRows) {
          const reps = resolveRepIds(r.rep_raw);
          if (!reps.length) continue;
          const confId = Number(r.conference_id);
          for (const repId of reps) {
            const d = getP(repId, confId);
            d.meetingsScheduled += Number(r.meetings_scheduled ?? 0) / reps.length;
            d.meetingsHeld += Number(r.meetings_held ?? 0) / reps.length;
            d.companiesWithMeeting += Number(r.companies_with_meeting ?? 0) / reps.length;
          }
        }
        for (const r of priorFuAttachRows) {
          const reps = resolveRepIds(r.rep_raw);
          if (!reps.length) continue;
          for (const repId of reps) getP(repId, Number(r.conference_id)).coWithMtgFu += Number(r.co_with_mtg_fu ?? 0) / reps.length;
        }
        for (const r of priorFuRows) {
          const reps = resolveRepIds(r.rep_raw);
          if (!reps.length) continue;
          const confId = Number(r.conference_id);
          for (const repId of reps) {
            const d = getP(repId, confId);
            d.followupsCreated += Number(r.followups_created ?? 0) / reps.length;
            d.followupsCompleted += Number(r.followups_completed ?? 0) / reps.length;
          }
        }
        for (const r of priorTgtMtgRows) {
          const reps = resolveRepIds(r.rep_raw);
          if (!reps.length) continue;
          for (const repId of reps) getP(repId, Number(r.conference_id)).targetsMet += Number(r.targets_met ?? 0) / reps.length;
        }
        for (const r of priorTgtFuRows) {
          const reps = resolveRepIds(r.rep_raw);
          if (!reps.length) continue;
          for (const repId of reps) getP(repId, Number(r.conference_id)).targetsFu += Number(r.targets_fu ?? 0) / reps.length;
        }

        for (const [repId, confMap] of Array.from(priorRepConfMap.entries())) {
          const scores: number[] = [];
          for (const [confId, d] of Array.from(confMap.entries())) {
            const { sesScore } = computeSES(d, priorTargetTotalMap.get(confId) ?? 0, null, effSettings.expectedActivities, effSettings.expectedCompanies, effSettings);
            if (sesScore != null) scores.push(sesScore);
          }
          if (scores.length > 0) priorAvg[repId] = Math.round(scores.reduce((s, v) => s + v, 0) / scores.length);
        }
      }
    } catch {
      priorAvg = {};
    }

    // 9. Build response
    const conferences = confRows.map(r => ({
      id: Number(r.id),
      name: String(r.name),
      date: String(r.conf_date),
    }));

    return NextResponse.json({ conferences, reps: repResults, priorAvg });
  } catch (err) {
    console.error('[rep-performance]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
