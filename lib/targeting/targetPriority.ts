import { normalizeTitleKey, type BuyerRoleKey, type TitleMatchConfidence, type TitleMatchMetadata, type TitleMatchType } from '@/lib/titleNormalization';
import type { IcpConfig } from '@/lib/icpRulesEval';

export type ConfidenceLevel = 'High' | 'Medium' | 'Low';
export type PriorityValue = 'High' | 'Medium' | 'Low' | 'Ignore';

export interface TargetPriorityWeights {
  icp_fit: number;
  buyer_access: number;
  relationship_leverage: number;
  conference_opportunity: number;
}

export interface TierThreshold {
  key: string;
  label: string;
  min: number;
}

export interface RecommendedTargetAction {
  key: string;
  label: string;
  when: string;
  active: boolean;
}

export interface TargetingScoringConfig {
  target_priority_weights: TargetPriorityWeights;
  tier_thresholds: TierThreshold[];
  recommended_actions: RecommendedTargetAction[];
  relationship_signal_weights: Record<string, number>;
  conference_opportunity_weights: Record<string, number>;
  seniority_priority: Record<string, PriorityValue>;
  function_priority: Record<string, PriorityValue>;
  function_product_mapping: Record<string, string[]>;
  target_titles: string[];
  decision_maker_titles: string[];
  influencer_titles: string[];
  exclusion_description?: string;
  include_new_companies?: boolean;
  icp_config?: IcpConfig;
}

export interface TargetingCompanyInput {
  id: number;
  name: string;
  company_type?: string | null;
  services?: string | null;
  status?: string | null;
  icp?: string | null;
  wse?: number | null;
  assigned_user?: string | null;
}

export interface TargetingAttendeeInput {
  id: number;
  first_name?: string | null;
  last_name?: string | null;
  name?: string | null;
  title?: string | null;
  seniority?: string | number | null;
  company_id?: number | null;
  normalized_title_metadata?: TitleMatchMetadata | null;
}

export interface TargetingCompanySignals {
  internal_relationship_count?: number;
  relationship_notes?: string[];
  associated_reps?: string[];
  prior_meeting_count?: number;
  scheduled_meeting_count?: number;
  prior_touchpoint_count?: number;
  prior_conference_overlap_count?: number;
  recent_note_count?: number;
  hosted_event_count?: number;
  is_known_prospect?: boolean;
  has_existing_status?: boolean;
}

export interface CompanyTargetScore {
  company_id: number;
  company_name: string;
  wse: number | null;
  target_priority_score: number;
  target_priority_tier: string;
  target_priority_tier_key: string;
  recommended_action: {
    recommended_action_key: string;
    recommended_action_label: string;
    recommended_action_reason: string;
  };
  recommended_action_key: string;
  recommended_action_label: string;
  recommended_action_reason: string;
  icp_fit_score: number;
  buyer_access_score: number;
  relationship_leverage_score: number;
  conference_opportunity_score: number;
  confidence_level: ConfidenceLevel;
  confidence_reasons: string[];
  why_this_target: string[];
  matched_icp_reasons: string[];
  failed_icp_reasons: string[];
  relationship_reasons: string[];
  opportunity_reasons: string[];
  attendee_count: number;
  high_priority_attendee_count: number;
  scheduled_meeting_count: number;
  top_attendees: AttendeeBuyerFitScore[];
  unavailable_reason?: string;
}

export interface AttendeeBuyerFitScore {
  attendee_id: number;
  attendee_name: string;
  title: string | null;
  normalized_title: string | null;
  function_id: number | null;
  function_label: string | null;
  seniority_id: number | null;
  seniority_label: string | null;
  buyer_fit_score: number;
  buyer_role_classification: BuyerRoleKey | 'unknown';
  title_match_type: TitleMatchType;
  title_match_confidence: TitleMatchConfidence;
  recommended_action: string;
  why_this_attendee: string[];
  confidence_level: ConfidenceLevel;
  confidence_reasons: string[];
}

export const DEFAULT_TARGET_PRIORITY_WEIGHTS: TargetPriorityWeights = {
  icp_fit: 40,
  buyer_access: 30,
  relationship_leverage: 20,
  conference_opportunity: 10,
};

export const DEFAULT_TIER_THRESHOLDS: TierThreshold[] = [
  { key: 'must_target', label: 'Must Target', min: 90 },
  { key: 'high_priority', label: 'High Priority', min: 75 },
  { key: 'worth_engaging', label: 'Worth Engaging', min: 60 },
  { key: 'monitor', label: 'Monitor', min: 40 },
  { key: 'low_priority', label: 'Low Priority', min: 0 },
];

export const DEFAULT_RECOMMENDED_ACTIONS: RecommendedTargetAction[] = [
  { key: 'book_meeting', label: 'Book Meeting', active: true, when: 'High target score with strong ICP fit and buyer access.' },
  { key: 'route_to_account_owner', label: 'Route to Account Owner', active: true, when: 'Warm relationship or known owner should coordinate outreach.' },
  { key: 'invite_to_hosted_event', label: 'Invite to Hosted Event', active: true, when: 'Strong fit and event opportunity with relevant buyers present.' },
  { key: 'rep_floor_outreach', label: 'Rep Floor Outreach', active: true, when: 'Good fit and buyer access, but no meeting is scheduled yet.' },
  { key: 'research_before_outreach', label: 'Research Before Outreach', active: true, when: 'Some fit exists, but buyer access or relationship data is weak.' },
  { key: 'monitor_only', label: 'Monitor Only', active: true, when: 'Mid-range target priority score.' },
  { key: 'add_to_nurture', label: 'Add to Nurture', active: true, when: 'Decent ICP fit but weak conference opportunity or buyer access.' },
  { key: 'do_not_prioritize', label: 'Do Not Prioritize', active: true, when: 'Low score or exclusion signals are present.' },
];

export const DEFAULT_RELATIONSHIP_SIGNAL_WEIGHTS = {
  internal_relationship: 35,
  prior_engagement: 25,
  assigned_owner: 15,
  known_prospect: 15,
  recent_interaction: 10,
};

export const DEFAULT_CONFERENCE_OPPORTUNITY_WEIGHTS = {
  high_priority_attendee: 30,
  multiple_attendees: 20,
  scheduled_meeting: 20,
  hosted_event: 15,
  net_new_or_expansion: 15,
};

const PRIORITY_SCORE: Record<PriorityValue, number> = { High: 100, Medium: 70, Low: 40, Ignore: 0 };

function clampScore(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

function weighted(parts: Array<[number, number]>): number {
  const totalWeight = parts.reduce((sum, [, w]) => sum + w, 0);
  if (totalWeight <= 0) return 0;
  return clampScore(parts.reduce((sum, [score, w]) => sum + score * w, 0) / totalWeight);
}

function listFromCsv(value: string | null | undefined): string[] {
  return String(value ?? '').split(',').map(s => s.trim()).filter(Boolean);
}

function valueMatchesConfigured(raw: string | null | undefined, configured: string[]): boolean {
  const rawKey = normalizeTitleKey(raw ?? '');
  if (!rawKey) return false;
  return configured.some(v => {
    const key = normalizeTitleKey(v);
    return key && (rawKey === key || rawKey.includes(key) || key.includes(rawKey));
  });
}

function priorityFor(id: number | null | undefined, label: string | null | undefined, priorities: Record<string, PriorityValue>): PriorityValue {
  const byId = id != null ? priorities[String(id)] : undefined;
  if (byId) return byId;
  const byLabel = label ? priorities[label] : undefined;
  return byLabel ?? 'Medium';
}

function confidenceFromReasons(highSignals: number, mediumSignals: number, lowSignals: number, reasons: string[]): ConfidenceLevel {
  if (lowSignals >= highSignals + mediumSignals) return 'Low';
  if (highSignals >= 3 && lowSignals === 0) return 'High';
  if (highSignals + mediumSignals >= 2) return 'Medium';
  reasons.push('Limited structured data was available for this score.');
  return 'Low';
}

function actionLabel(config: TargetingScoringConfig, key: string): string {
  return config.recommended_actions.find(a => a.key === key)?.label ?? DEFAULT_RECOMMENDED_ACTIONS.find(a => a.key === key)?.label ?? key;
}

function classifyTier(score: number, thresholds: TierThreshold[]): TierThreshold {
  const sorted = [...thresholds].sort((a, b) => b.min - a.min);
  return sorted.find(t => score >= t.min) ?? { key: 'low_priority', label: 'Low Priority', min: 0 };
}

export function validateTargetPriorityWeights(weights: TargetPriorityWeights): string | null {
  const values = Object.values(weights);
  if (values.some(v => typeof v !== 'number' || !Number.isFinite(v) || v < 0)) return 'Weights must be non-negative numbers.';
  const total = values.reduce((sum, v) => sum + v, 0);
  return total === 100 ? null : 'Target priority weights must total 100.';
}

export function buildTargetingScoringConfig(input?: Partial<TargetingScoringConfig>): TargetingScoringConfig {
  return {
    target_priority_weights: input?.target_priority_weights ?? DEFAULT_TARGET_PRIORITY_WEIGHTS,
    tier_thresholds: input?.tier_thresholds ?? DEFAULT_TIER_THRESHOLDS,
    recommended_actions: input?.recommended_actions ?? DEFAULT_RECOMMENDED_ACTIONS,
    relationship_signal_weights: input?.relationship_signal_weights ?? DEFAULT_RELATIONSHIP_SIGNAL_WEIGHTS,
    conference_opportunity_weights: input?.conference_opportunity_weights ?? DEFAULT_CONFERENCE_OPPORTUNITY_WEIGHTS,
    seniority_priority: input?.seniority_priority ?? {},
    function_priority: input?.function_priority ?? {},
    function_product_mapping: input?.function_product_mapping ?? {},
    target_titles: input?.target_titles ?? [],
    decision_maker_titles: input?.decision_maker_titles ?? [],
    influencer_titles: input?.influencer_titles ?? [],
    exclusion_description: input?.exclusion_description ?? '',
    include_new_companies: input?.include_new_companies ?? true,
    icp_config: input?.icp_config,
  };
}

export function scoreAttendeeBuyerFit(input: {
  attendee: TargetingAttendeeInput;
  config: TargetingScoringConfig;
  functionLabels?: Map<number, string>;
  seniorityLabels?: Map<number, string>;
}): AttendeeBuyerFitScore {
  const { attendee, config } = input;
  const meta = attendee.normalized_title_metadata ?? null;
  const title = attendee.title ?? null;
  const functionLabel = meta?.function_id ? input.functionLabels?.get(meta.function_id) ?? null : null;
  const seniorityLabel = meta?.seniority_id ? input.seniorityLabels?.get(meta.seniority_id) ?? null : (attendee.seniority != null ? String(attendee.seniority) : null);
  let role: BuyerRoleKey | 'unknown' = meta?.buyer_role ?? 'unknown';

  if (role === 'unknown' && valueMatchesConfigured(title, config.decision_maker_titles)) role = 'decision_maker';
  if (role === 'unknown' && valueMatchesConfigured(title, config.influencer_titles)) role = 'influencer';
  if (role === 'unknown' && valueMatchesConfigured(title, config.target_titles)) role = 'target_title';

  const roleScore = role === 'decision_maker' ? 100 : role === 'influencer' ? 75 : role === 'target_title' ? 65 : role === 'ignore' ? 0 : 25;
  const seniorityScore = PRIORITY_SCORE[priorityFor(meta?.seniority_id ?? null, seniorityLabel, config.seniority_priority)];
  const functionScore = PRIORITY_SCORE[priorityFor(meta?.function_id ?? null, functionLabel, config.function_priority)];
  const exactOrConfirmed = meta?.match_type === 'confirmed' || meta?.match_type === 'configured_alias' || meta?.match_type === 'system_alias' || meta?.match_type === 'exact';
  const fuzzyMedium = meta?.match_type === 'fuzzy' || meta?.match_confidence === 'medium';
  const targetTitleScore = valueMatchesConfigured(meta?.normalized_title ?? title, config.target_titles) || (role === 'target_title' && exactOrConfirmed) ? 100 : fuzzyMedium ? 50 : 0;
  const productMappingScore = functionLabel && (config.function_product_mapping[String(meta?.function_id ?? '')]?.length || config.function_product_mapping[functionLabel]?.length) ? 100 : 0;

  const buyer_fit_score = weighted([[roleScore, 35], [seniorityScore, 25], [functionScore, 20], [targetTitleScore, 15], [productMappingScore, 5]]);
  const why: string[] = [];
  if (meta?.normalized_title) why.push(`Title normalized to ${meta.normalized_title}.`);
  if (role !== 'unknown') why.push(`Buyer role classified as ${role.replace(/_/g, ' ')}.`);
  if (functionLabel) why.push(`Function mapped to ${functionLabel}.`);
  if (seniorityLabel) why.push(`Seniority mapped to ${seniorityLabel}.`);
  if (targetTitleScore >= 100) why.push('Matches a configured target title.');
  if (why.length === 0) why.push('No confident title normalization match yet.');

  const confidence_reasons: string[] = [];
  const high = (meta?.match_type === 'confirmed' || meta?.match_confidence === 'high' ? 1 : 0) + (meta?.function_id ? 1 : 0) + (meta?.seniority_id ? 1 : 0);
  const medium = meta?.match_confidence === 'medium' ? 1 : 0;
  const low = !meta || meta.match_type === 'none' || meta.match_confidence === 'low' ? 2 : 0;
  const confidence_level = confidenceFromReasons(high, medium, low, confidence_reasons);

  return {
    attendee_id: attendee.id,
    attendee_name: attendee.name ?? `${attendee.first_name ?? ''} ${attendee.last_name ?? ''}`.trim(),
    title,
    normalized_title: meta?.normalized_title ?? null,
    function_id: meta?.function_id ?? null,
    function_label: functionLabel,
    seniority_id: meta?.seniority_id ?? null,
    seniority_label: seniorityLabel,
    buyer_fit_score,
    buyer_role_classification: role,
    title_match_type: meta?.match_type ?? 'none',
    title_match_confidence: meta?.match_confidence ?? 'low',
    recommended_action: buyer_fit_score >= 75 ? actionLabel(config, 'book_meeting') : buyer_fit_score >= 50 ? actionLabel(config, 'rep_floor_outreach') : actionLabel(config, 'research_before_outreach'),
    why_this_attendee: why,
    confidence_level,
    confidence_reasons,
  };
}

function scoreIcpFit(company: TargetingCompanyInput, config: TargetingScoringConfig) {
  const matched: string[] = [];
  const failed: string[] = [];
  const companyValues = { company_type: company.company_type ?? '', services: company.services ?? '', status: company.status ?? '', wse: company.wse == null ? '' : String(company.wse), icp: company.icp ?? '' };
  const rules = config.icp_config?.rules ?? [];
  const unitReq = config.icp_config?.unitTypeReq;

  let firmographic = 50;
  if (unitReq?.operator) {
    const wse = company.wse;
    const v1 = unitReq.value1;
    const v2 = unitReq.value2;
    const pass = wse != null && (unitReq.operator === 'between' ? (v1 == null || wse >= v1) && (v2 == null || wse <= v2) : unitReq.operator === 'gt' ? v1 == null || wse > v1 : unitReq.operator === 'gte' ? v1 == null || wse >= v1 : unitReq.operator === 'lt' ? v1 == null || wse < v1 : unitReq.operator === 'lte' ? v1 == null || wse <= v1 : v1 == null || wse === v1);
    firmographic = pass ? 100 : 0;
    (pass ? matched : failed).push(pass ? 'Matches configured unit requirement.' : 'Does not match configured unit requirement.');
  } else if (company.company_type || company.wse != null) {
    firmographic = 70;
    matched.push('Firmographic data is available for review.');
  }

  const serviceRules = rules.filter(r => r.category === 'services' || r.category === 'products');
  const serviceValues = new Set(listFromCsv(company.services));
  const serviceProduct = serviceRules.length === 0 ? (serviceValues.size > 0 ? 65 : 50) : serviceRules.some(r => r.conditions.some(c => serviceValues.has(c.option_value))) ? 100 : 0;
  if (serviceProduct >= 100) matched.push('Matches configured service/product fit.');
  if (serviceRules.length > 0 && serviceProduct === 0) failed.push('Does not match configured service/product fit.');

  const otherRules = rules.filter(r => r.category !== 'services' && r.category !== 'products');
  let useCase = otherRules.length === 0 ? 50 : 100;
  for (const r of otherRules) {
    const values = new Set(listFromCsv(companyValues[r.category as keyof typeof companyValues]));
    const ands = r.conditions.filter(c => c.operator === 'AND');
    const ors = r.conditions.filter(c => c.operator === 'OR');
    const pass = (ands.length === 0 || ands.every(c => values.has(c.option_value))) && (ors.length === 0 || ors.some(c => values.has(c.option_value)));
    if (!pass) useCase = Math.min(useCase, 0);
    (pass ? matched : failed).push(pass ? `Matches configured ${r.category} ICP parameter.` : `Does not match configured ${r.category} ICP parameter.`);
  }

  const exclusionTerms = normalizeTitleKey(config.exclusion_description ?? '').split(' ').filter(t => t.length >= 4);
  const companyBlob = normalizeTitleKey(`${company.name} ${company.company_type ?? ''} ${company.services ?? ''} ${company.status ?? ''}`);
  const exclusionMatch = exclusionTerms.length >= 2 && exclusionTerms.some(t => companyBlob.includes(t));
  const exclusion = exclusionMatch ? 0 : 100;
  if (exclusionMatch) failed.push('Company may match configured exclusion language.');

  const score = weighted([[firmographic, 40], [serviceProduct, 25], [useCase, 20], [exclusion, 15]]);
  return { score, matched, failed, exclusionMatch, confidenceSignals: [unitReq?.operator ? 1 : 0, rules.length > 0 ? 1 : 0, company.company_type || company.services || company.wse != null ? 1 : 0].filter(Boolean).length };
}

function scoreBuyerAccess(attendees: AttendeeBuyerFitScore[], config: TargetingScoringConfig) {
  const decisionMaker = attendees.some(a => a.buyer_role_classification === 'decision_maker' && a.title_match_confidence !== 'low') ? 100 : 0;
  const influencer = attendees.some(a => a.buyer_role_classification === 'influencer' && a.title_match_confidence !== 'low') ? 100 : 0;
  const seniority = attendees.reduce((max, a) => Math.max(max, PRIORITY_SCORE[priorityFor(a.seniority_id, a.seniority_label, config.seniority_priority)]), 0);
  const fn = attendees.reduce((max, a) => Math.max(max, PRIORITY_SCORE[priorityFor(a.function_id, a.function_label, config.function_priority)]), 0);
  const targetTitle = attendees.some(a => a.buyer_role_classification === 'target_title' || a.why_this_attendee.some(r => r.includes('configured target title'))) ? 100 : 0;
  const score = weighted([[decisionMaker, 35], [influencer, 20], [seniority, 20], [fn, 15], [targetTitle, 10]]);
  const reasons: string[] = [];
  if (decisionMaker) reasons.push('Decision maker attendee present.');
  if (influencer) reasons.push('Influencer attendee present.');
  const top = attendees[0];
  if (top) reasons.push(`Top buyer attendee: ${top.attendee_name} (${top.buyer_fit_score}).`);
  if (reasons.length === 0) reasons.push('No high-confidence buyer access found yet.');
  return { score, reasons };
}

function scoreRelationship(company: TargetingCompanyInput, signals: TargetingCompanySignals, config: TargetingScoringConfig) {
  const w = config.relationship_signal_weights;
  const internal = signals.internal_relationship_count ? 100 : 0;
  const prior = (signals.prior_meeting_count ?? 0) + (signals.prior_touchpoint_count ?? 0) + (signals.prior_conference_overlap_count ?? 0) > 0 ? 100 : 0;
  const owner = company.assigned_user || (signals.associated_reps?.length ?? 0) > 0 ? 100 : 0;
  const known = signals.is_known_prospect || signals.has_existing_status || internal > 0 ? 100 : 0;
  const recent = signals.recent_note_count ? 100 : 0;
  const reasons: string[] = [];
  if (internal) reasons.push('Internal relationship exists.');
  if (prior) reasons.push('Prior engagement exists.');
  if (owner) reasons.push('Assigned owner or familiar rep exists.');
  if (known) reasons.push('Company has known prospect or relationship history.');
  if (recent) reasons.push('Recent notes are available.');
  return { score: weighted([[internal, w.internal_relationship ?? 35], [prior, w.prior_engagement ?? 25], [owner, w.assigned_owner ?? 15], [known, w.known_prospect ?? 15], [recent, w.recent_interaction ?? 10]]), reasons };
}

function scoreOpportunity(attendees: AttendeeBuyerFitScore[], signals: TargetingCompanySignals, config: TargetingScoringConfig) {
  const w = config.conference_opportunity_weights;
  const highPriorityCount = attendees.filter(a => a.buyer_fit_score >= 70).length;
  const high = highPriorityCount > 0 ? 100 : 0;
  const multi = attendees.length > 1 ? 100 : attendees.length === 1 ? 50 : 0;
  const meeting = signals.scheduled_meeting_count ? 100 : 0;
  const hosted = signals.hosted_event_count ? 100 : 0;
  const netNewExpansion = signals.is_known_prospect ? 80 : config.include_new_companies ? 100 : 40;
  const reasons: string[] = [];
  if (high) reasons.push(`${highPriorityCount} high-priority buyer attendee${highPriorityCount === 1 ? '' : 's'} present.`);
  if (attendees.length > 1) reasons.push(`${attendees.length} attendees from this company are registered.`);
  if (meeting) reasons.push('Scheduled meeting already exists.');
  if (hosted) reasons.push('Hosted or social event opportunity exists.');
  return { score: weighted([[high, w.high_priority_attendee ?? 30], [multi, w.multiple_attendees ?? 20], [meeting, w.scheduled_meeting ?? 20], [hosted, w.hosted_event ?? 15], [netNewExpansion, w.net_new_or_expansion ?? 15]]), reasons, highPriorityCount };
}

function recommendAction(args: { targetScore: number; icp: number; buyer: number; relationship: number; opportunity: number; signals: TargetingCompanySignals; exclusionMatch: boolean; config: TargetingScoringConfig }) {
  const { targetScore, icp, buyer, relationship, opportunity, signals, exclusionMatch, config } = args;
  let key = 'research_before_outreach';
  let reason = 'Research the account before outreach because fit or relationship data is incomplete.';
  if (targetScore < 40 || exclusionMatch) {
    key = 'do_not_prioritize'; reason = exclusionMatch ? 'Exclusion signals are present.' : 'Target Priority Score is below 40.';
  } else if (targetScore >= 75 && buyer >= 70 && icp >= 70) {
    key = 'book_meeting'; reason = 'Strong ICP fit, buyer access, and overall target priority.';
  } else if (relationship >= 70 && ((signals.internal_relationship_count ?? 0) > 0 || (signals.associated_reps?.length ?? 0) > 0)) {
    key = 'route_to_account_owner'; reason = 'Relationship leverage is high and an internal relationship or owner exists.';
  } else if (icp >= 70 && buyer >= 60 && opportunity >= 60) {
    key = 'invite_to_hosted_event'; reason = 'Strong ICP fit, buyer access, and conference opportunity.';
  } else if (icp >= 70 && buyer >= 50 && !signals.scheduled_meeting_count) {
    key = 'rep_floor_outreach'; reason = 'Good ICP fit and buyer access, with no scheduled meeting yet.';
  } else if (targetScore >= 40 && targetScore <= 59) {
    key = 'monitor_only'; reason = 'Target Priority Score is in the monitor range.';
  } else if (icp >= 60 && (buyer < 50 || opportunity < 50)) {
    key = 'add_to_nurture'; reason = 'ICP fit is decent, but buyer access or event opportunity is weak.';
  }
  return { recommended_action_key: key, recommended_action_label: actionLabel(config, key), recommended_action_reason: reason };
}

export function scoreCompanyTarget(input: {
  company: TargetingCompanyInput;
  attendees: TargetingAttendeeInput[];
  signals?: TargetingCompanySignals;
  config: TargetingScoringConfig;
  functionLabels?: Map<number, string>;
  seniorityLabels?: Map<number, string>;
}): CompanyTargetScore {
  const config = input.config;
  const attendeeScores = input.attendees.map(attendee => scoreAttendeeBuyerFit({ attendee, config, functionLabels: input.functionLabels, seniorityLabels: input.seniorityLabels })).sort((a, b) => b.buyer_fit_score - a.buyer_fit_score);
  const icp = scoreIcpFit(input.company, config);
  const buyer = scoreBuyerAccess(attendeeScores, config);
  const relationship = scoreRelationship(input.company, input.signals ?? {}, config);
  const opportunity = scoreOpportunity(attendeeScores, input.signals ?? {}, config);
  const weights = config.target_priority_weights;
  const target_priority_score = weighted([[icp.score, weights.icp_fit], [buyer.score, weights.buyer_access], [relationship.score, weights.relationship_leverage], [opportunity.score, weights.conference_opportunity]]);
  const recommended_action = recommendAction({ targetScore: target_priority_score, icp: icp.score, buyer: buyer.score, relationship: relationship.score, opportunity: opportunity.score, signals: input.signals ?? {}, exclusionMatch: icp.exclusionMatch, config });
  const tier = classifyTier(target_priority_score, config.tier_thresholds);
  const confidence_reasons: string[] = [];
  const highSignals = icp.confidenceSignals + (attendeeScores.some(a => a.title_match_confidence === 'high') ? 1 : 0) + (input.attendees.length > 0 ? 1 : 0) + (relationship.reasons.length > 0 ? 1 : 0);
  const lowSignals = (input.attendees.length === 0 ? 2 : 0) + (attendeeScores.some(a => a.title_match_confidence === 'low') ? 1 : 0);
  const confidence_level = confidenceFromReasons(highSignals, attendeeScores.length, lowSignals, confidence_reasons);
  const why = [...icp.matched, ...buyer.reasons, ...relationship.reasons, ...opportunity.reasons].slice(0, 8);
  if (icp.failed.length > 0) why.push(...icp.failed.slice(0, 2));

  return {
    company_id: input.company.id,
    company_name: input.company.name,
    wse: input.company.wse ?? null,
    target_priority_score,
    target_priority_tier: tier.label,
    target_priority_tier_key: tier.key,
    recommended_action,
    ...recommended_action,
    icp_fit_score: icp.score,
    buyer_access_score: buyer.score,
    relationship_leverage_score: relationship.score,
    conference_opportunity_score: opportunity.score,
    confidence_level,
    confidence_reasons,
    why_this_target: why.length > 0 ? why : ['Not enough structured signals are available yet.'],
    matched_icp_reasons: icp.matched,
    failed_icp_reasons: icp.failed,
    relationship_reasons: relationship.reasons,
    opportunity_reasons: opportunity.reasons,
    attendee_count: input.attendees.length,
    high_priority_attendee_count: opportunity.highPriorityCount,
    scheduled_meeting_count: input.signals?.scheduled_meeting_count ?? 0,
    top_attendees: attendeeScores.slice(0, 5),
    unavailable_reason: input.attendees.length === 0 ? 'No attendees from this company are registered for this conference.' : undefined,
  };
}
