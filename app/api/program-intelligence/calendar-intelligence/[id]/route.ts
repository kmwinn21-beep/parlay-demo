import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { db, dbReady } from '@/lib/db';
import type { InValue } from '@libsql/client';
import { assembleFinalScore } from '@/lib/scoring/calendar-intelligence';
import type { ComponentScores } from '@/lib/scoring/calendar-intelligence';
import { getIcpConfig } from '@/lib/icpRules';
import { buildDefaultTierConfig, type TierThresholdConfig } from '@/lib/strategyAssessment';
import { resolveAttendeeTitleMetadata } from '@/lib/titleNormalizationRules';
import {
  DEFAULT_RECOMMENDED_ACTIONS,
  buildTargetingScoringConfig,
  scoreCompanyTarget,
  type PriorityValue,
  type RecommendedTargetAction,
  type TargetPriorityWeights,
  type TargetingAttendeeInput,
  type TargetingCompanyInput,
  type TargetingCompanySignals,
  type TargetingScoringConfig,
} from '@/lib/targeting/targetPriority';

export const dynamic = 'force-dynamic';

const HISTORICAL_CONFERENCE_TYPE = 1;

type Row = Record<string, unknown>;

function parseJson<T>(raw: unknown, fallback: T): T {
  try { return raw ? JSON.parse(String(raw)) as T : fallback; } catch { return fallback; }
}

function parseCsvIds(raw: unknown): number[] {
  return String(raw ?? '').split(',').map(s => Number(s.trim())).filter(n => Number.isFinite(n) && n > 0);
}

function normalizePriorityMap(raw: Record<string, PriorityValue>, labels: Map<number, string>): Record<string, PriorityValue> {
  const out: Record<string, PriorityValue> = {};
  for (const [key, value] of Object.entries(raw ?? {})) {
    out[key] = value;
    const matchingId = Array.from(labels.entries()).find(([, label]) => label === key)?.[0];
    if (matchingId != null) out[String(matchingId)] = value;
  }
  return out;
}

function normalizeFunctionProductMap(raw: Record<string, string[]>, labels: Map<number, string>): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const [key, value] of Object.entries(raw ?? {})) {
    out[key] = value;
    const matchingId = Array.from(labels.entries()).find(([, label]) => label === key)?.[0];
    if (matchingId != null) out[String(matchingId)] = value;
  }
  return out;
}

function rowDateIsRecent(raw: unknown): boolean {
  if (!raw) return false;
  const t = new Date(String(raw)).getTime();
  if (!Number.isFinite(t)) return false;
  return Date.now() - t <= 1000 * 60 * 60 * 24 * 180;
}

async function tableExists(name: string): Promise<boolean> {
  try {
    const res = await db.execute({ sql: `SELECT name FROM sqlite_master WHERE type='table' AND name=?`, args: [name] });
    return (res.rows as Row[]).length > 0;
  } catch {
    return false;
  }
}

export interface TargetingAggregation {
  mustTargetCount: number;
  highPriorityCount: number;
  worthEngagingCount: number;
  monitorCount: number;
  lowPriorityCount: number;
  needsTitleReviewCount: number;
  totalScoredCompanies: number;
  avgTargetPriorityScore: number;
  avgBuyerAccessScore: number;
  avgRelationshipLeverageScore: number;
  actionableCount: number;
  isLargeConference: boolean;
  // WSE sums by tier — used for Commercial Potential pipeline projection
  mustTargetWse: number;
  highPriorityWse: number;
  worthEngagingWse: number;
  // First 5 scored companies for debug logging
  debugSample: Array<{ companyName: string; wse: number | null; tier: string }>;
}

const ACTIONABLE_KEYS = new Set(['book_meeting', 'route_to_account_owner', 'invite_to_hosted_event', 'rep_floor_outreach']);

async function runTargetingForConference(
  conferenceId: number,
  config: TargetingScoringConfig,
  prospectTypeIdValue: string | null,
  prospectTypeValue: string,
  seniorityLabels: Map<number, string>,
  functionLabels: Map<number, string>,
): Promise<TargetingAggregation | null> {
  if (!prospectTypeIdValue) return null;

  const attendeesRes = await db.execute({
    sql: `SELECT a.id, a.first_name, a.last_name, a.title, a.seniority, a.company_id,
                 c.name as company_name, c.company_type, c.services, c.status, c.icp, c.wse, c.assigned_user
          FROM conference_attendees ca
          JOIN attendees a ON a.id = ca.attendee_id
          JOIN companies c ON c.id = a.company_id
          WHERE ca.conference_id = ?
            AND (c.company_type = ? OR LOWER(c.company_type) = LOWER(?))
          ORDER BY c.name, a.last_name, a.first_name`,
    args: [conferenceId, prospectTypeIdValue, prospectTypeValue],
  });

  const rawCompanyMap = new Map<number, { company: TargetingCompanyInput; attendeeRows: Row[] }>();
  for (const r of attendeesRes.rows as Row[]) {
    const companyId = r.company_id == null ? 0 : Number(r.company_id);
    if (!companyId) continue;
    if (!rawCompanyMap.has(companyId)) {
      rawCompanyMap.set(companyId, {
        company: {
          id: companyId,
          name: String(r.company_name ?? 'Unknown Company'),
          company_type: r.company_type ? String(r.company_type) : null,
          services: r.services ? String(r.services) : null,
          status: r.status ? String(r.status) : null,
          icp: r.icp ? String(r.icp) : null,
          wse: r.wse == null ? null : Number(r.wse),
          assigned_user: r.assigned_user ? String(r.assigned_user) : null,
        },
        attendeeRows: [],
      });
    }
    rawCompanyMap.get(companyId)!.attendeeRows.push(r);
  }

  if (rawCompanyMap.size === 0) return null;

  const companyMap = new Map<number, { company: TargetingCompanyInput; attendees: TargetingAttendeeInput[] }>();
  await Promise.all(Array.from(rawCompanyMap.values()).map(async ({ company, attendeeRows }) => {
    const attendees = await Promise.all(attendeeRows.map(async (r): Promise<TargetingAttendeeInput> => {
      const titleMeta = await resolveAttendeeTitleMetadata(r.title ? String(r.title) : null, null);
      return {
        id: Number(r.id),
        first_name: r.first_name ? String(r.first_name) : '',
        last_name: r.last_name ? String(r.last_name) : '',
        title: r.title ? String(r.title) : null,
        seniority: r.seniority == null ? null : String(r.seniority),
        company_id: company.id,
        normalized_title_metadata: titleMeta,
      };
    }));
    companyMap.set(company.id, { company, attendees });
  }));

  const companyIds = Array.from(companyMap.keys());
  const attendeeIds = Array.from(companyMap.values()).flatMap(v => v.attendees.map((a: TargetingAttendeeInput) => a.id));
  const signalsByCompany = new Map<number, TargetingCompanySignals>();
  for (const cid of companyIds) signalsByCompany.set(cid, {});

  if (companyIds.length > 0) {
    const compPlaceholders = companyIds.map(() => '?').join(',');
    const [relsRes, notesRes] = await Promise.all([
      db.execute({ sql: `SELECT company_id, rep_ids, description FROM internal_relationships WHERE company_id IN (${compPlaceholders})`, args: companyIds }).catch(() => ({ rows: [] as Row[] })),
      db.execute({ sql: `SELECT entity_id as company_id, content, created_at FROM entity_notes WHERE entity_type = 'company' AND entity_id IN (${compPlaceholders})`, args: companyIds }).catch(() => ({ rows: [] as Row[] })),
    ]);
    for (const r of relsRes.rows as Row[]) {
      const cid = Number(r.company_id);
      const s = signalsByCompany.get(cid) ?? {};
      s.internal_relationship_count = (s.internal_relationship_count ?? 0) + 1;
      s.relationship_notes = [...(s.relationship_notes ?? []), String(r.description ?? '').trim()].filter(Boolean).slice(0, 3);
      s.associated_reps = Array.from(new Set([...(s.associated_reps ?? []), ...parseCsvIds(r.rep_ids).map(String)]));
      s.is_known_prospect = true;
      signalsByCompany.set(cid, s);
    }
    for (const r of notesRes.rows as Row[]) {
      const cid = Number(r.company_id);
      const s = signalsByCompany.get(cid) ?? {};
      s.recent_note_count = (s.recent_note_count ?? 0) + (rowDateIsRecent(r.created_at) ? 1 : 0);
      s.prior_touchpoint_count = (s.prior_touchpoint_count ?? 0) + 1;
      s.is_known_prospect = true;
      signalsByCompany.set(cid, s);
    }
  }

  if (attendeeIds.length > 0) {
    const attPlaceholders = attendeeIds.map(() => '?').join(',');
    const [meetingsRes, priorConfsRes, socialRes] = await Promise.all([
      db.execute({ sql: `SELECT a.company_id, m.conference_id, COUNT(m.id) as cnt FROM meetings m JOIN attendees a ON a.id = m.attendee_id WHERE m.attendee_id IN (${attPlaceholders}) GROUP BY a.company_id, m.conference_id`, args: attendeeIds }).catch(() => ({ rows: [] as Row[] })),
      db.execute({ sql: `SELECT a.company_id, ca.conference_id, COUNT(*) as cnt FROM conference_attendees ca JOIN attendees a ON a.id = ca.attendee_id WHERE ca.attendee_id IN (${attPlaceholders}) AND ca.conference_id != ? GROUP BY a.company_id, ca.conference_id`, args: [...attendeeIds, conferenceId] }).catch(() => ({ rows: [] as Row[] })),
      db.execute({ sql: `SELECT a.company_id, COUNT(*) as cnt FROM social_event_rsvps ser JOIN social_events se ON se.id = ser.social_event_id JOIN attendees a ON a.id = ser.attendee_id WHERE ser.attendee_id IN (${attPlaceholders}) AND se.conference_id = ? GROUP BY a.company_id`, args: [...attendeeIds, conferenceId] }).catch(() => ({ rows: [] as Row[] })),
    ]);
    for (const r of meetingsRes.rows as Row[]) {
      const cid = Number(r.company_id);
      const s = signalsByCompany.get(cid) ?? {};
      const cnt = Number(r.cnt ?? 0);
      if (Number(r.conference_id) === conferenceId) s.scheduled_meeting_count = (s.scheduled_meeting_count ?? 0) + cnt;
      else s.prior_meeting_count = (s.prior_meeting_count ?? 0) + cnt;
      s.is_known_prospect = true;
      signalsByCompany.set(cid, s);
    }
    for (const r of priorConfsRes.rows as Row[]) {
      const cid = Number(r.company_id);
      const s = signalsByCompany.get(cid) ?? {};
      s.prior_conference_overlap_count = (s.prior_conference_overlap_count ?? 0) + Number(r.cnt ?? 0);
      s.is_known_prospect = true;
      signalsByCompany.set(cid, s);
    }
    for (const r of socialRes.rows as Row[]) {
      const cid = Number(r.company_id);
      const s = signalsByCompany.get(cid) ?? {};
      s.hosted_event_count = (s.hosted_event_count ?? 0) + Number(r.cnt ?? 0);
      signalsByCompany.set(cid, s);
    }
  }

  const scores = Array.from(companyMap.values()).map(({ company, attendees }) => {
    const signals = signalsByCompany.get(company.id) ?? {};
    signals.has_existing_status = Boolean(company.status && company.status.trim().toLowerCase() !== 'unknown');
    return scoreCompanyTarget({ company, attendees, signals, config, functionLabels, seniorityLabels });
  });

  const totalScoredCompanies = scores.length;
  if (totalScoredCompanies === 0) return null;

  let mustTargetCount = 0, highPriorityCount = 0, worthEngagingCount = 0, monitorCount = 0, lowPriorityCount = 0;
  let needsTitleReviewCount = 0, actionableCount = 0;
  let sumPriorityScore = 0, sumBuyerAccessScore = 0, sumRelationshipScore = 0;
  let mustTargetWse = 0, highPriorityWse = 0, worthEngagingWse = 0;
  const debugSample: Array<{ companyName: string; wse: number | null; tier: string }> = [];

  for (const s of scores) {
    const wse = s.wse ?? 0;
    switch (s.target_priority_tier_key) {
      case 'must_target':    mustTargetCount++;    mustTargetWse    += wse; break;
      case 'high_priority':  highPriorityCount++;  highPriorityWse  += wse; break;
      case 'worth_engaging': worthEngagingCount++; worthEngagingWse += wse; break;
      case 'monitor':  monitorCount++;  break;
      default:         lowPriorityCount++; break;
    }
    if (s.confidence_level === 'Low') needsTitleReviewCount++;
    if (ACTIONABLE_KEYS.has(s.recommended_action_key)) actionableCount++;
    sumPriorityScore += s.target_priority_score;
    sumBuyerAccessScore += s.buyer_access_score;
    sumRelationshipScore += s.relationship_leverage_score;
    if (debugSample.length < 5) debugSample.push({ companyName: s.company_name, wse: s.wse, tier: s.target_priority_tier_key });
  }

  return {
    mustTargetCount,
    highPriorityCount,
    worthEngagingCount,
    monitorCount,
    lowPriorityCount,
    needsTitleReviewCount,
    totalScoredCompanies,
    avgTargetPriorityScore: sumPriorityScore / totalScoredCompanies,
    avgBuyerAccessScore: sumBuyerAccessScore / totalScoredCompanies,
    avgRelationshipLeverageScore: sumRelationshipScore / totalScoredCompanies,
    actionableCount,
    isLargeConference: totalScoredCompanies > 500,
    mustTargetWse,
    highPriorityWse,
    worthEngagingWse,
    debugSample,
  };
}

function computeTargetOpportunityScore(agg: TargetingAggregation): number {
  const { totalScoredCompanies, mustTargetCount, highPriorityCount, worthEngagingCount, avgTargetPriorityScore, actionableCount, isLargeConference } = agg;
  const mustBench = isLargeConference ? 0.15 : 0.10;
  const highBench = isLargeConference ? 0.30 : 0.20;
  const worthBench = isLargeConference ? 0.25 : 0.20;
  const mustScore = Math.min((mustTargetCount / totalScoredCompanies) / mustBench, 1) * 100;
  const highScore = Math.min((highPriorityCount / totalScoredCompanies) / highBench, 1) * 100;
  const worthScore = Math.min((worthEngagingCount / totalScoredCompanies) / worthBench, 1) * 100;
  const actionableRateScore = (actionableCount / totalScoredCompanies) * 100;
  return Math.min(Math.round(
    mustScore * 0.20 + highScore * 0.30 + worthScore * 0.15 + avgTargetPriorityScore * 0.25 + actionableRateScore * 0.10,
  ), 100);
}

function determineRecommendationTier(
  score: number | null,
  componentScores: ComponentScores,
  confidenceMultiplier: number,
  dataAge: number,
  hasEngagementData: boolean,
): string {
  if (score === null) return 'evaluate_before_committing';
  if (dataAge > 3) return 'evaluate_before_committing';
  if (confidenceMultiplier < 0.67) {
    return score < 30 ? 'do_not_prioritize' : 'evaluate_before_committing';
  }
  const af = componentScores.audienceFit ?? 0;
  const to = componentScores.targetOpportunity ?? 0;
  const cj = componentScores.costJustification ?? 0;
  if (score >= 85 && af >= 75 && to >= 75 && cj >= 60) return 'attend_invest_more';
  if (score >= 70 && af >= 65 && to >= 60) return 'attend_maintain';
  if (af >= 65 && to >= 60 && cj < 60) return 'attend_reconsider_format';
  if (score < 40 || ((componentScores.audienceFit ?? 100) < 45 && (componentScores.targetOpportunity ?? 100) < 45)) {
    return hasEngagementData ? 'remove_from_calendar' : 'do_not_prioritize';
  }
  return 'evaluate_before_committing';
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  await dbReady;

  const { id } = await params;
  const conferenceId = Number(id);
  if (!Number.isFinite(conferenceId) || conferenceId <= 0) {
    return NextResponse.json({ error: 'Invalid conference ID' }, { status: 400 });
  }

  // Load conference metadata + global config in parallel
  const [confRes, settingsRes, seniorityRes, functionRes, actionsRes, prospectTypeRes, effectivenessRes] = await Promise.all([
    db.execute({
      sql: `WITH cmp AS (
              SELECT ca.conference_id,
                     COUNT(DISTINCT a.company_id) AS total_companies,
                     COUNT(DISTINCT CASE WHEN LOWER(COALESCE(co.value, c.icp, '')) IN ('yes','true') THEN a.company_id END) AS icp_companies
              FROM conference_attendees ca
              JOIN attendees a ON a.id = ca.attendee_id
              LEFT JOIN companies c ON c.id = a.company_id
              LEFT JOIN config_options co ON co.id = c.icp
              WHERE ca.conference_id = ?
              GROUP BY ca.conference_id
            )
            SELECT c.id, c.name, c.end_date, COALESCE(c.is_historical, 0) AS is_historical,
                   COUNT(ca.attendee_id) AS attendee_count,
                   COALESCE(cmp.total_companies, 0) AS total_companies,
                   COALESCE(cmp.icp_companies, 0) AS icp_companies
            FROM conferences c
            LEFT JOIN conference_attendees ca ON ca.conference_id = c.id
            LEFT JOIN cmp ON cmp.conference_id = c.id
            WHERE c.id = ? AND date(c.end_date) <= date('now')
            GROUP BY c.id`,
      args: [conferenceId, conferenceId],
    }),
    db.execute({ sql: 'SELECT key, value FROM site_settings', args: [] }),
    db.execute({ sql: "SELECT id, value FROM config_options WHERE category = 'seniority'", args: [] }),
    db.execute({ sql: "SELECT id, value FROM config_options WHERE category = 'function'", args: [] }),
    db.execute({ sql: "SELECT id, value, action_key, is_actionable FROM config_options WHERE category='target_recommended_action' ORDER BY sort_order, id", args: [] }).catch(() => ({ rows: [] as Row[] })),
    db.execute({ sql: "SELECT id, value FROM config_options WHERE category = 'company_type' AND action_key = 'prospect' ORDER BY id LIMIT 1", args: [] }).catch(() => ({ rows: [] as Row[] })),
    db.execute({ sql: `SELECT key, value FROM effectiveness_defaults WHERE key IN ('avg_annual_deal_size','avg_cost_per_unit')`, args: [] }).catch(() => ({ rows: [] as Row[] })),
  ]);

  const confRow = (confRes.rows as Row[])[0];
  if (!confRow) return NextResponse.json({ error: 'Conference not found or not yet ended' }, { status: 404 });

  // Build settings map
  const settings: Record<string, string> = {};
  for (const r of settingsRes.rows as Row[]) settings[String(r.key)] = String(r.value ?? '');

  const seniorityLabels = new Map<number, string>((seniorityRes.rows as Row[]).map(r => [Number(r.id), String(r.value)]));
  const functionLabels = new Map<number, string>((functionRes.rows as Row[]).map(r => [Number(r.id), String(r.value)]));

  const actionLabelMap = new Map<string, string>();
  const actions = actionsRes.rows as Row[];
  for (const r of actions) {
    const key = r.action_key ? String(r.action_key) : '';
    if (key) actionLabelMap.set(key, String(r.value));
  }
  const recommendedActions: RecommendedTargetAction[] = DEFAULT_RECOMMENDED_ACTIONS.map(a => ({ ...a, label: actionLabelMap.get(a.key) ?? a.label }));
  const actionableCount = actions.filter(a => Number(a.is_actionable ?? 0) === 1).length;

  const prospectTypeId = (prospectTypeRes.rows as Row[]).length > 0 ? Number((prospectTypeRes.rows as Row[])[0].id) : null;
  const prospectTypeIdValue = prospectTypeId == null || !Number.isFinite(prospectTypeId) ? null : String(prospectTypeId);
  const prospectTypeValue = (prospectTypeRes.rows as Row[]).length > 0 ? String((prospectTypeRes.rows as Row[])[0].value ?? '') : '';

  const effMap: Record<string, string> = {};
  for (const r of (effectivenessRes.rows as Row[])) effMap[String(r.key)] = String(r.value);
  const avgAnnualDealSize = Number(effMap['avg_annual_deal_size'] ?? 25000) || 25000;
  const avgCostPerUnit = Number(effMap['avg_cost_per_unit'] ?? 0) || 0;

  const defaultCfg = buildDefaultTierConfig(avgAnnualDealSize, avgCostPerUnit || 100);
  const hasSavedTierConfig = !!(settings['tier_must_target_op'] || settings['tier_high_priority_op'] || settings['tier_worth_engaging_op']);
  const tierConfig: TierThresholdConfig = {
    mustTargetOp:            (settings['tier_must_target_op']    || defaultCfg.mustTargetOp)    as TierThresholdConfig['mustTargetOp'],
    mustTargetMin:           settings['tier_must_target_v1']    ? Number(settings['tier_must_target_v1'])    : defaultCfg.mustTargetMin,
    mustTargetMax:           settings['tier_must_target_v2']    ? Number(settings['tier_must_target_v2'])    : defaultCfg.mustTargetMax,
    highPriorityOp:          (settings['tier_high_priority_op']  || defaultCfg.highPriorityOp)  as TierThresholdConfig['highPriorityOp'],
    highPriorityMin:         settings['tier_high_priority_v1']  ? Number(settings['tier_high_priority_v1'])  : defaultCfg.highPriorityMin,
    highPriorityMax:         settings['tier_high_priority_v2']  ? Number(settings['tier_high_priority_v2'])  : defaultCfg.highPriorityMax,
    worthEngagingOp:         (settings['tier_worth_engaging_op'] || defaultCfg.worthEngagingOp) as TierThresholdConfig['worthEngagingOp'],
    worthEngagingMin:        settings['tier_worth_engaging_v1'] ? Number(settings['tier_worth_engaging_v1']) : defaultCfg.worthEngagingMin,
    worthEngagingMax:        settings['tier_worth_engaging_v2'] ? Number(settings['tier_worth_engaging_v2']) : defaultCfg.worthEngagingMax,
    mustTargetConversion:    settings['tier_must_target_conversion']    ? Number(settings['tier_must_target_conversion'])    / 100 : defaultCfg.mustTargetConversion,
    highPriorityConversion:  settings['tier_high_priority_conversion']  ? Number(settings['tier_high_priority_conversion'])  / 100 : defaultCfg.highPriorityConversion,
    worthEngagingConversion: settings['tier_worth_engaging_conversion'] ? Number(settings['tier_worth_engaging_conversion']) / 100 : defaultCfg.worthEngagingConversion,
  };

  const icpConfig = await getIcpConfig();
  const weights = parseJson<TargetPriorityWeights>(settings.icp_target_priority_weights, { icp_fit: 40, buyer_access: 30, relationship_leverage: 20, conference_opportunity: 10 });
  const targetingConfig = buildTargetingScoringConfig({
    target_priority_weights: weights,
    recommended_actions: recommendedActions,
    seniority_priority: normalizePriorityMap(parseJson(settings.icp_seniority_priority, {}), seniorityLabels),
    function_priority: normalizePriorityMap(parseJson(settings.icp_function_priority, {}), functionLabels),
    function_product_mapping: normalizeFunctionProductMap(parseJson(settings.icp_function_product_mapping, {}), functionLabels),
    target_titles: parseJson(settings.icp_target_titles, []),
    decision_maker_titles: parseJson(settings.icp_decision_maker_titles, []),
    influencer_titles: parseJson(settings.icp_influencer_titles, []),
    exclusion_description: settings.icp_exclusion_description ?? '',
    include_new_companies: settings.icp_include_new_companies !== 'false',
    icp_config: icpConfig,
    tierConfig: hasSavedTierConfig ? tierConfig : null,
  });

  // Read win probabilities from site_settings (set by Target Classification in ICP Settings).
  // Use truthiness check so a user-configured 0% is honoured rather than overridden by || fallback.
  const mustConv  = settings['tier_must_target_conversion']    ? Number(settings['tier_must_target_conversion'])    / 100 : 0.25;
  const highConv  = settings['tier_high_priority_conversion']  ? Number(settings['tier_high_priority_conversion'])  / 100 : 0.15;
  const worthConv = settings['tier_worth_engaging_conversion'] ? Number(settings['tier_worth_engaging_conversion']) / 100 : 0.075;

  const r = confRow;
  const totalCompanies = Number(r.total_companies ?? 0);
  const icpCompanies = Number(r.icp_companies ?? 0);
  const attendeeCount = Number(r.attendee_count ?? 0);
  const endDate = new Date(String(r.end_date));
  const dataAge = Math.max(0, (Date.now() - endDate.getTime()) / (365.25 * 24 * 60 * 60 * 1000));

  // --- Component 1: Audience Fit ---
  const audienceFitScore: number | null = totalCompanies > 0
    ? Math.round(Math.min((icpCompanies / totalCompanies) / 0.15, 1) * 100)
    : null;

  // --- Component 2: Target Opportunity (via targeting engine) ---
  const targetingAgg = await runTargetingForConference(
    conferenceId,
    targetingConfig,
    prospectTypeIdValue,
    prospectTypeValue,
    seniorityLabels,
    functionLabels,
  );
  const targetOpportunityScore: number | null = targetingAgg != null
    ? computeTargetOpportunityScore(targetingAgg)
    : null;

  // --- Component 3: Engagement Capture ---
  const [meetingsRows, followUpRows] = await Promise.all([
    db.execute({ sql: `SELECT COUNT(*) AS total_meetings FROM meetings WHERE conference_id = ?`, args: [conferenceId] }).then(r => r.rows as Row[]).catch(() => [] as Row[]),
    db.execute({ sql: `SELECT COUNT(*) AS total_followups, SUM(CASE WHEN COALESCE(completed,0)=1 THEN 1 ELSE 0 END) AS completed_followups FROM follow_ups WHERE conference_id = ?`, args: [conferenceId] }).then(r => r.rows as Row[]).catch(() => [] as Row[]),
  ]);
  const emRow = meetingsRows[0];
  const efRow = followUpRows[0];
  const totalMeetings = Number(emRow?.total_meetings ?? 0);
  const totalFollowups = Number(efRow?.total_followups ?? 0);
  const completedFollowups = Number(efRow?.completed_followups ?? 0);
  const meetingRate = attendeeCount > 0 ? totalMeetings / attendeeCount : 0;
  const followupRate = totalFollowups > 0 ? completedFollowups / totalFollowups : null;
  const engagementCaptureScore: number | null = emRow != null
    ? Math.min(Math.round((meetingRate / 0.3) * 70 + (followupRate != null ? followupRate * 30 : 15)), 100)
    : null;

  // --- Component 4 & 5: Commercial Potential + Cost Justification ---
  // WSE sums come from the scoring engine (same source as Target Recommendations tab),
  // not from conference_targets which is often empty for future conferences.
  const mustWse  = targetingAgg?.mustTargetWse  ?? 0;
  const highWse  = targetingAgg?.highPriorityWse ?? 0;
  const worthWse = targetingAgg?.worthEngagingWse ?? 0;

  // Debug log: first 5 scored companies showing WSE, tier, probability, and pipeline contribution
  if (targetingAgg?.debugSample && targetingAgg.debugSample.length > 0) {
    console.log(`[cal-intel ${conferenceId}] avgCostPerUnit=${avgCostPerUnit} mustConv=${mustConv} highConv=${highConv} worthConv=${worthConv}`);
    for (const c of targetingAgg.debugSample) {
      const probFactor = c.tier === 'must_target' ? mustConv : c.tier === 'high_priority' ? highConv : c.tier === 'worth_engaging' ? worthConv : 0;
      const pipelineContrib = c.wse != null && avgCostPerUnit > 0 ? Math.round(c.wse * probFactor * avgCostPerUnit) : 0;
      console.log(`[cal-intel ${conferenceId}]   company="${c.companyName}" wse=${c.wse ?? 'null'} pipeline_value=${c.wse != null && avgCostPerUnit > 0 ? Math.round(c.wse * avgCostPerUnit) : 'n/a'} tier=${c.tier} probFactor=${probFactor} pipelineContrib=${pipelineContrib}`);
    }
  }

  const projectedPipeline = targetingAgg != null && avgCostPerUnit > 0
    ? Math.round((mustWse * mustConv + highWse * highConv + worthWse * worthConv) * avgCostPerUnit)
    : null;

  const budgetTable = await tableExists('conference_budget') ? 'conference_budget' : (await tableExists('conference_budgets') ? 'conference_budgets' : null);
  const budgetRows = budgetTable
    ? await db.execute({ sql: `SELECT line_items, return_on_cost, required_pipeline_amount, required_pipeline_multiple FROM ${budgetTable} WHERE conference_id = ? LIMIT 1`, args: [conferenceId] }).then(r => r.rows as Row[]).catch(() => [] as Row[])
    : [];
  const budgetRow = budgetRows[0];
  const reqPipeline = Number(budgetRow?.required_pipeline_amount ?? 0);
  const commercialPotentialScore: number | null = projectedPipeline != null && reqPipeline > 0
    ? Math.min(Math.round((projectedPipeline / reqPipeline) * 100), 100)
    : null;
  const costJustificationScore: number | null = budgetRow != null && reqPipeline > 0
    ? Math.min(Math.round((projectedPipeline ?? 0) / reqPipeline * 100), 100)
    : (budgetRow != null ? 50 : null);

  // --- Component 6: Strategic Value (from relationship leverage) ---
  const strategicValueScore: number | null = targetingAgg != null
    ? Math.round(targetingAgg.avgRelationshipLeverageScore)
    : null;

  const componentScores: ComponentScores = {
    audienceFit: audienceFitScore,
    targetOpportunity: targetOpportunityScore,
    engagementCapture: engagementCaptureScore,
    commercialPotential: commercialPotentialScore,
    costJustification: costJustificationScore,
    strategicValue: strategicValueScore,
  };

  const { score: finalScore, confidenceMultiplier, availableComponentCount, totalComponentCount, maxPossibleScore } =
    assembleFinalScore(componentScores);

  const hasEngagementData = emRow != null && totalMeetings > 0;
  const recommendationTier = determineRecommendationTier(
    finalScore,
    componentScores,
    confidenceMultiplier,
    dataAge,
    hasEngagementData,
  );

  const conference = {
    conferenceId,
    conferenceName: String(r.name ?? ''),
    conferenceYear: endDate.getUTCFullYear(),
    conferenceType: Number(r.is_historical) === HISTORICAL_CONFERENCE_TYPE ? 'historical' : 'active',
    attendeeCount,
    totalCompanies,
    icpCompanies,
    icpDensityPct: totalCompanies > 0 ? (icpCompanies / totalCompanies) * 100 : 0,
    calendarRecommendationScore: finalScore,
    componentScores,
    confidenceMultiplier,
    availableComponentCount,
    totalComponentCount,
    maxPossibleScore,
    recommendationTier,
    confidenceLevel: attendeeCount < 50 || dataAge > 4 ? 'low' : dataAge > 2 ? 'medium' : 'high',
    dataAge,
    recommendationReason: [
      `ICP density is ${(totalCompanies > 0 ? (icpCompanies / totalCompanies) * 100 : 0).toFixed(1)}% based on ${totalCompanies} companies.`,
    ],
    confidenceFactors: [
      ...(attendeeCount < 50 ? ['Attendee sample under 50 lowers confidence.'] : []),
      ...(availableComponentCount < 4 ? [`Score based on ${availableComponentCount} of 6 components — insufficient data for a high-confidence recommendation.`] : []),
    ],
    tierProbabilityFactors: { must: mustConv, high: highConv, worth: worthConv },
    actionableActionTypesConfigured: actionableCount,
    targetingScored: true,
    diagnostics: {
      targetingEngine: targetingAgg,
      engagementMeetings: emRow ?? null,
      engagementFollowUps: efRow ?? null,
      budget: budgetRow ?? null,
      commercialPotential: projectedPipeline != null ? { projected_pipeline: projectedPipeline, must_wse: mustWse, high_wse: highWse, worth_wse: worthWse, avg_cost_per_unit: avgCostPerUnit } : null,
    },
  };

  // Persist to cache table
  await db.execute({
    sql: `INSERT INTO calendar_intelligence_scores (conference_id, score_payload, calculated_at) VALUES (?, ?, datetime('now'))
          ON CONFLICT(conference_id) DO UPDATE SET score_payload = excluded.score_payload, calculated_at = excluded.calculated_at`,
    args: [conferenceId, JSON.stringify(conference)],
  }).catch(() => {});

  return NextResponse.json({ conference });
}
