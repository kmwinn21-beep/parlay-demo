export type TierOperator = 'eq' | 'gt' | 'lt' | 'gte' | 'lte' | 'between' | '';

export interface TierThresholdConfig {
  mustTargetOp: TierOperator;
  mustTargetMin: number;
  mustTargetMax: number;
  highPriorityOp: TierOperator;
  highPriorityMin: number;
  highPriorityMax: number;
  worthEngagingOp: TierOperator;
  worthEngagingMin: number;
  worthEngagingMax: number;
  mustTargetConversion: number;
  highPriorityConversion: number;
  worthEngagingConversion: number;
}

export function buildDefaultTierConfig(avgAnnualDealSize = 25000, avgCostPerUnit = 100): TierThresholdConfig {
  const avgUnitCount = avgCostPerUnit > 0 ? avgAnnualDealSize / avgCostPerUnit : 250;
  const highPriorityMin = Math.round(avgUnitCount * 0.8);
  const highPriorityMax = Math.round(avgUnitCount * 2);
  return {
    mustTargetOp: 'gte',
    mustTargetMin: highPriorityMax + 1,
    mustTargetMax: 0,
    highPriorityOp: 'between',
    highPriorityMin,
    highPriorityMax,
    worthEngagingOp: 'between',
    worthEngagingMin: Math.round(highPriorityMin * 0.5),
    worthEngagingMax: highPriorityMin - 1,
    mustTargetConversion: 0.25,
    highPriorityConversion: 0.15,
    worthEngagingConversion: 0.075,
  };
}

export function matchesOp(w: number, op: TierOperator, v1: number, v2: number): boolean {
  switch (op) {
    case 'eq':      return w === v1;
    case 'gt':      return w > v1;
    case 'lt':      return w < v1;
    case 'gte':     return w >= v1;
    case 'lte':     return w <= v1;
    case 'between': return w >= v1 && w <= v2;
    default:        return false;
  }
}

export interface StrategyAssessmentInput {
  totalAttendees: number;
  totalCompanies: number;
  icpCount: number;
  clientCompanyCount: number;
  seniorityBreakdown: { label: string; count: number }[];
  internalRelationshipCount: number;
  scheduledMeetingCount: number;
  internalRepCount: number;
  totalCompanyReps: number;
  conferenceStrategyType: string | null;
  budgetTotal: number;
  requiredPipeline: number | null;
  avgCostPerUnit: number;
  avgAnnualDealSize?: number;
  icpCompanies: { wse: number | null; company_id?: number | null }[];
  icpTierCompanies?: { company_id: number; wse: number | null }[];
  attendeesForBuyerAccess?: Array<{ title: string | null; company_id: number | null; icp: string | null; function: string | null; seniority: string | null }>;
  titleMetadataByKey?: Record<string, { buyer_role: 'decision_maker' | 'influencer' | 'target_title' | 'ignore' | null; match_type: 'confirmed' | 'configured_alias' | 'system_alias' | 'seniority_config' | 'exact' | 'fuzzy' | 'none' }>;
  functionPriorityMap?: Record<string, 'High' | 'Medium' | 'Low' | 'Ignore'>;
  seniorityPriorityMap?: Record<string, 'High' | 'Medium' | 'Low' | 'Ignore'>;
  organizationId?: number | null;
  tierConfig?: TierThresholdConfig;
}

export interface StrategyWeightProfile {
  icpOpportunity: number;
  targetAccountOpportunity: number;
  buyerAccess: number;
  relationshipLeverage: number;
  customerPresence: number;
  pipelinePotential: number;
  eventEconomicsFit: number;
}

export interface StrategyAssessment {
  strategyFitScore: number;
  strategyFitInterpretation: string;

  icpOpportunityScore: number;
  targetAccountOpportunityScore: number;
  buyerAccessScore: number;
  relationshipLeverageScore: number;
  customerPresenceScore: number;
  pipelinePotentialScore: number;
  eventEconomicsFitScore: number;

  appliedStrategyWeights: StrategyWeightProfile;
  strategyAlignment: 'aligned' | 'partial' | 'misaligned' | 'unset';
  strategyAlignmentMessage: string | null;
  recommendedStrategy: string;
  selectedStrategy: string | null;

  primaryStrategy: string;
  primaryStrategyReasons: string[];
  secondaryStrategy: string | null;
  secondaryStrategyReasons: string[];

  requiredPipeline: number | null;
  realisticPipelineGoal: number;
  pipelineCoverageRate: number;

  mustTargetProxyCount: number;
  highPriorityProxyCount: number;
  worthEngagingProxyCount: number;

  hostedEventRecommendation: string;
  hostedEventFitScore: number;
  sponsorshipRecommendation: string;
  sponsorshipFitScore: number;

  recommendedRepMin: number;
  recommendedRepMax: number;
  idealizedRepMin: number;
  idealizedRepMax: number;
  isStaffingConstrained: boolean;
  totalCompanyReps: number;
  alreadyCommittedReps: number;
  currentRepCount: number;
}

function clamp(v: number): number {
  return Math.max(0, Math.min(100, v));
}

function fmt$(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${Math.round(n / 1_000)}K`;
  return `$${Math.round(n).toLocaleString('en-US')}`;
}

const STRATEGY_LABELS = [
  'Pipeline Generation',
  'Pipeline Acceleration',
  'Strategic Account Relationship Building',
  'Customer Retention / Customer Nurture',
  'Market Presence / Brand Visibility',
  'Competitive Defense',
  'Thought Leadership',
] as const;

type StrategyLabel = typeof STRATEGY_LABELS[number];

function interpretScore(score: number): string {
  if (score >= 75) return 'Strong Fit';
  if (score >= 60) return 'Good Fit';
  if (score >= 45) return 'Moderate Fit';
  return 'Weak Fit';
}

function componentTier(score: number): string {
  if (score >= 75) return 'Strong';
  if (score >= 60) return 'Good';
  if (score >= 45) return 'Moderate';
  return 'Weak';
}

// Classify ICP companies into tier proxies based on configured WSE thresholds + operators
function classifyTiers(
  icpCompanies: { wse: number | null }[],
  cfg: TierThresholdConfig,
): { mustProxy: number; highProxy: number; worthProxy: number } {
  let mustProxy = 0;
  let highProxy = 0;
  let worthProxy = 0;
  const mustOp  = cfg.mustTargetOp  || 'gte';
  const highOp  = cfg.highPriorityOp  || 'between';
  const worthOp = cfg.worthEngagingOp || 'between';
  for (const c of icpCompanies) {
    const w = c.wse ?? 0;
    if (mustOp  && matchesOp(w, mustOp,  cfg.mustTargetMin,    cfg.mustTargetMax))    mustProxy++;
    else if (highOp  && matchesOp(w, highOp,  cfg.highPriorityMin,  cfg.highPriorityMax))  highProxy++;
    else if (worthOp && matchesOp(w, worthOp, cfg.worthEngagingMin, cfg.worthEngagingMax)) worthProxy++;
    // else: falls through to 2.5% fallback probability in pipeline calc
  }
  return { mustProxy, highProxy, worthProxy };
}

function computeRealisticPipeline(
  icpCompanies: { wse: number | null; company_id?: number | null }[],
  mustProxy: number,
  highProxy: number,
  worthProxy: number,
  avgCostPerUnit: number,
  buyerAccess: number,
  relLeverage: number,
  cfg: TierThresholdConfig,
  buyerQuality: {
    bestAttendeeScoreByCompany: Map<number, number>;
    attendeeCountByCompany: Map<number, number>;
    eligibleAttendeeCountByCompany: Map<number, number>;
  },
): number {
  if (avgCostPerUnit <= 0) return 0;
  const sorted = [...icpCompanies].sort((a, b) => (b.wse ?? 0) - (a.wse ?? 0));
  let goal = 0;
  let mustRemaining = mustProxy;
  let highRemaining = highProxy;
  let worthRemaining = worthProxy;
  for (const c of sorted) {
    const wse = c.wse ?? 0;
    const companyId = c.company_id ?? null;
    let prob: number;
    if (mustRemaining > 0) { prob = cfg.mustTargetConversion; mustRemaining--; }
    else if (highRemaining > 0) { prob = cfg.highPriorityConversion; highRemaining--; }
    else if (worthRemaining > 0) { prob = cfg.worthEngagingConversion; worthRemaining--; }
    else { prob = 0.025; }
    let companyModifier = 1.0;
    if (companyId != null) {
      const totalAtt = buyerQuality.attendeeCountByCompany.get(companyId) ?? 0;
      const eligibleAtt = buyerQuality.eligibleAttendeeCountByCompany.get(companyId) ?? 0;
      if (totalAtt === 0) companyModifier = 1.0;
      else if (eligibleAtt === 0) companyModifier = 0.85;
      else {
        const bestAttendeeScore = buyerQuality.bestAttendeeScoreByCompany.get(companyId) ?? 0;
        if (bestAttendeeScore >= 0.7) companyModifier = 1.0;
        else if (bestAttendeeScore >= 0.4) companyModifier = 0.85;
        else if (bestAttendeeScore >= 0.1) companyModifier = 0.7;
        else companyModifier = 0.5;
      }
    }
    goal += wse * avgCostPerUnit * prob * companyModifier;
  }
  if (buyerAccess >= 80) goal *= 1.05;
  else if (buyerAccess < 40) goal *= 0.95;
  if (relLeverage >= 80) goal *= 1.05;
  return Math.round(goal);
}

function strategyReasons(
  strategy: StrategyLabel,
  input: StrategyAssessmentInput,
  mustProxy: number,
  highProxy: number,
  realisticGoal: number,
  coverageRate: number,
): string[] {
  const reasons: string[] = [];
  switch (strategy) {
    case 'Pipeline Generation':
      if (input.icpCount > 0) reasons.push(`${input.icpCount} ICP companies attending`);
      if (mustProxy + highProxy > 0) reasons.push(`${mustProxy + highProxy} high-value ICP target companies identified`);
      if (realisticGoal > 0) reasons.push(`Realistic pipeline goal: ${fmt$(realisticGoal)} (${coverageRate.toFixed(1)}% of required)`);
      break;
    case 'Pipeline Acceleration':
      if (input.internalRelationshipCount > 0) reasons.push(`${input.internalRelationshipCount} companies with existing internal relationships`);
      if (input.scheduledMeetingCount > 0) reasons.push(`${input.scheduledMeetingCount} meetings already scheduled`);
      if (input.clientCompanyCount > 0) reasons.push(`${input.clientCompanyCount} client companies attending`);
      break;
    case 'Strategic Account Relationship Building':
      if (mustProxy > 0) reasons.push(`${mustProxy} enterprise-value ICP accounts attending`);
      if (highProxy > 0) reasons.push(`${highProxy} high-value ICP companies attending`);
      if (input.internalRelationshipCount > 0) reasons.push(`Strong relationship leverage with ${input.internalRelationshipCount} known accounts`);
      break;
    case 'Customer Retention / Customer Nurture':
      if (input.clientCompanyCount > 0) reasons.push(`${input.clientCompanyCount} client companies attending`);
      if (input.internalRelationshipCount > 0) reasons.push(`${input.internalRelationshipCount} accounts with existing relationships`);
      if (realisticGoal > 0 && input.requiredPipeline && realisticGoal < input.requiredPipeline * 0.2)
        reasons.push(`Direct pipeline generation is limited — focus on retention and expansion`);
      break;
    case 'Market Presence / Brand Visibility':
      reasons.push(`${input.totalCompanies} companies attending — strong brand exposure opportunity`);
      if (input.icpCount > 0) reasons.push(`${input.icpCount} ICP companies represent brand-building targets`);
      reasons.push(`Buyer access and pipeline potential favor floor presence over meetings`);
      break;
    case 'Competitive Defense':
      if (input.clientCompanyCount > 0) reasons.push(`${input.clientCompanyCount} client companies attending — relationship defense is high priority`);
      if (input.internalRelationshipCount > 0) reasons.push(`${input.internalRelationshipCount} accounts require active coverage`);
      break;
    case 'Thought Leadership':
      reasons.push(`${input.totalAttendees} total attendees — large audience for messaging`);
      if (input.icpCount > 0) reasons.push(`${input.icpCount} ICP companies represent content engagement opportunities`);
      reasons.push(`Broad audience favors speaking, content, and market education`);
      break;
  }
  return reasons.slice(0, 4);
}

function recommendStrategy(
  scores: {
    icpOpp: number;
    targetAcc: number;
    buyerAccess: number;
    relLeverage: number;
    customerPresence: number;
    pipelinePotential: number;
  },
  input: StrategyAssessmentInput,
  mustProxy: number,
  highProxy: number,
): StrategyLabel {
  const { icpOpp, targetAcc, buyerAccess, relLeverage, customerPresence, pipelinePotential } = scores;

  if (icpOpp >= 65 && targetAcc >= 65 && buyerAccess >= 60 && customerPresence < 50 && pipelinePotential >= 40)
    return 'Pipeline Generation';
  if (relLeverage >= 65 && buyerAccess >= 60 && targetAcc >= 50 && customerPresence < 60)
    return 'Pipeline Acceleration';
  if (buyerAccess >= 70 && relLeverage >= 55 && mustProxy + highProxy >= 5)
    return 'Strategic Account Relationship Building';
  if (customerPresence >= 55 || input.clientCompanyCount >= 10)
    return 'Customer Retention / Customer Nurture';
  if (input.totalCompanies >= 800 && buyerAccess < 55 && pipelinePotential < 40)
    return 'Market Presence / Brand Visibility';
  if (customerPresence >= 45 && relLeverage >= 50)
    return 'Competitive Defense';
  if (input.totalAttendees >= 1500 && icpOpp >= 40 && buyerAccess < 60)
    return 'Thought Leadership';

  // Fallback: pick best match by dominant score
  if (icpOpp >= 50 && targetAcc >= 50 && buyerAccess >= 45) return 'Pipeline Generation';
  if (relLeverage >= 50) return 'Pipeline Acceleration';
  return 'Market Presence / Brand Visibility';
}

function recommendSecondaryStrategy(
  primary: StrategyLabel,
  scores: {
    icpOpp: number;
    targetAcc: number;
    buyerAccess: number;
    relLeverage: number;
    customerPresence: number;
    pipelinePotential: number;
  },
  input: StrategyAssessmentInput,
  mustProxy: number,
  highProxy: number,
): StrategyLabel | null {
  const remaining = STRATEGY_LABELS.filter(s => s !== primary);
  const { icpOpp, targetAcc, buyerAccess, relLeverage, customerPresence, pipelinePotential } = scores;

  // Score each remaining strategy loosely
  const scored: [StrategyLabel, number][] = remaining.map(s => {
    let score = 0;
    switch (s) {
      case 'Pipeline Generation':
        score = (icpOpp + targetAcc + buyerAccess) / 3 - (customerPresence * 0.3);
        break;
      case 'Pipeline Acceleration':
        score = (relLeverage + buyerAccess) / 2;
        break;
      case 'Strategic Account Relationship Building':
        score = (buyerAccess + relLeverage) / 2 + (mustProxy + highProxy >= 5 ? 20 : 0);
        break;
      case 'Customer Retention / Customer Nurture':
        score = customerPresence + (input.clientCompanyCount >= 10 ? 20 : 0);
        break;
      case 'Market Presence / Brand Visibility':
        score = 50 - buyerAccess * 0.3 + (input.totalCompanies >= 500 ? 20 : 0);
        break;
      case 'Competitive Defense':
        score = (customerPresence + relLeverage) / 2;
        break;
      case 'Thought Leadership':
        score = (input.totalAttendees >= 1500 ? 30 : 0) + icpOpp * 0.4;
        break;
    }
    return [s, score];
  });

  scored.sort((a, b) => b[1] - a[1]);
  const best = scored[0];
  if (!best || best[1] < 30) return null;
  return best[0];
}

// Keys must match exact conference_strategy_type config_options values seeded in lib/db.ts
const STRATEGY_WEIGHT_PROFILES: Record<string, StrategyWeightProfile> = {
  'Pipeline Generation': {
    icpOpportunity:           0.15,
    targetAccountOpportunity: 0.25,
    buyerAccess:              0.20,
    relationshipLeverage:     0.10,
    customerPresence:         0.05,
    pipelinePotential:        0.20,
    eventEconomicsFit:        0.05,
  },
  'Pipeline Acceleration': {
    icpOpportunity:           0.10,
    targetAccountOpportunity: 0.15,
    buyerAccess:              0.25,
    relationshipLeverage:     0.25,
    customerPresence:         0.05,
    pipelinePotential:        0.15,
    eventEconomicsFit:        0.05,
  },
  'Customer Retention / Customer Nurture': {
    icpOpportunity:           0.10,
    targetAccountOpportunity: 0.05,
    buyerAccess:              0.10,
    relationshipLeverage:     0.25,
    customerPresence:         0.40,
    pipelinePotential:        0.05,
    eventEconomicsFit:        0.05,
  },
  'Market Presence / Brand Visibility': {
    icpOpportunity:           0.30,
    targetAccountOpportunity: 0.10,
    buyerAccess:              0.05,
    relationshipLeverage:     0.10,
    customerPresence:         0.15,
    pipelinePotential:        0.10,
    eventEconomicsFit:        0.20,
  },
  'Strategic Account Relationship Building': {
    icpOpportunity:           0.10,
    targetAccountOpportunity: 0.10,
    buyerAccess:              0.10,
    relationshipLeverage:     0.35,
    customerPresence:         0.20,
    pipelinePotential:        0.10,
    eventEconomicsFit:        0.05,
  },
  'Partner / Ecosystem Development': {
    icpOpportunity:           0.15,
    targetAccountOpportunity: 0.05,
    buyerAccess:              0.15,
    relationshipLeverage:     0.35,
    customerPresence:         0.20,
    pipelinePotential:        0.05,
    eventEconomicsFit:        0.05,
  },
  'Competitive Defense': {
    icpOpportunity:           0.15,
    targetAccountOpportunity: 0.10,
    buyerAccess:              0.10,
    relationshipLeverage:     0.25,
    customerPresence:         0.30,
    pipelinePotential:        0.05,
    eventEconomicsFit:        0.05,
  },
  'Thought Leadership': {
    icpOpportunity:           0.30,
    targetAccountOpportunity: 0.15,
    buyerAccess:              0.05,
    relationshipLeverage:     0.10,
    customerPresence:         0.15,
    pipelinePotential:        0.05,
    eventEconomicsFit:        0.20,
  },
};

const DEFAULT_WEIGHTS: StrategyWeightProfile = {
  icpOpportunity:           0.20,
  targetAccountOpportunity: 0.20,
  buyerAccess:              0.15,
  relationshipLeverage:     0.15,
  customerPresence:         0.10,
  pipelinePotential:        0.15,
  eventEconomicsFit:        0.05,
};

export async function computeStrategyAssessment(input: StrategyAssessmentInput): Promise<StrategyAssessment> {
  const { totalAttendees, totalCompanies, icpCount, clientCompanyCount } = input;
  const weights = STRATEGY_WEIGHT_PROFILES[input.conferenceStrategyType ?? ''] ?? DEFAULT_WEIGHTS;

  const safeTotal = Math.max(totalCompanies, 1);
  const safeTotalAtt = Math.max(totalAttendees, 1);
  const safeIcp = Math.max(icpCount, 1);

  const cfg = input.tierConfig ?? buildDefaultTierConfig(input.avgAnnualDealSize ?? 25000, input.avgCostPerUnit);

  // Tier proxies
  const { mustProxy, highProxy, worthProxy } = classifyTiers(input.icpCompanies, cfg);

  // A. ICP Opportunity Score
  const icpRate = icpCount / safeTotal;
  const icpRateScore = Math.min(icpRate / 0.25, 1) * 100;
  const highDensScore = Math.min((mustProxy + highProxy) / safeTotal / 0.15, 1) * 100;
  const icpOpportunityScore = clamp(icpRateScore * 0.5 + highDensScore * 0.5);

  // B. Target Account Opportunity Score (base)
  const mustScore = Math.min(mustProxy / 10, 1) * 100;
  const highScore = Math.min(highProxy / 25, 1) * 100;
  const totalTierCount = Math.max(mustProxy + highProxy + worthProxy, 1);
  const avgTierScore = (mustProxy * 100 + highProxy * 75 + worthProxy * 50) / totalTierCount;
  let modifiedAvgTierScore = avgTierScore;

  // C. Buyer Access Score — qualified buyer model
  const weightForPriority = (p: string | undefined): number => {
    if (p === 'High') return 1.0;
    if (p === 'Medium') return 0.6;
    if (p === 'Low') return 0.2;
    return 0.0;
  };
  const fnPriority = input.functionPriorityMap ?? {};
  const senPriority = input.seniorityPriorityMap ?? {};
  const norm = (v: string | null | undefined) => String(v ?? '').trim().toLowerCase();
  const getPriority = (label: string | null | undefined, map: Record<string, 'High' | 'Medium' | 'Low' | 'Ignore'>) => {
    const n = norm(label);
    if (!n) return 0;
    const direct = map[label ?? ''] ?? map[n];
    if (direct) return weightForPriority(direct);
    const key = Object.keys(map).find(k => norm(k) === n);
    return weightForPriority(key ? map[key] : undefined);
  };
  const buyerRows = input.attendeesForBuyerAccess ?? [];
  const normalizeTitleKeyLocal = (title: string | null | undefined): string =>
    String(title ?? '')
      .toLowerCase()
      .replace(/&/g, ' and ')
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\b(the|of|and)\b/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  const titleMetaByKey = input.titleMetadataByKey ?? {};
  const icpRows = buyerRows.filter(a => String(a.icp ?? '').toLowerCase() === 'yes');
  const qualifiedByCompany = new Map<number, number>();
  const icpAttendeeCountByCompany = new Map<number, number>();
  const eligibleAttendeeCountByCompany = new Map<number, number>();
  let qualifiedBuyerSum = 0;
  let eligibleIcpCount = 0;
  let unresolvedIcpCount = 0;
  const seniorDecisionLabels = new Set(['c-suite', 'director', 'vp/svp', 'ed', 'c suite', 'vp', 'svp']);
  const decisionMakerCount = input.seniorityBreakdown
    .filter(s => seniorDecisionLabels.has(s.label.toLowerCase()))
    .reduce((sum, s) => sum + s.count, 0);
  const decisionMakerRate = decisionMakerCount / safeTotalAtt;
  for (const a of icpRows) {
    if (a.company_id != null) {
      icpAttendeeCountByCompany.set(a.company_id, (icpAttendeeCountByCompany.get(a.company_id) ?? 0) + 1);
    }
    const meta = titleMetaByKey[normalizeTitleKeyLocal(a.title)];
    const mt = meta?.match_type ?? 'none';
    if (mt === 'none' || mt === 'fuzzy') {
      unresolvedIcpCount++;
      continue;
    }
    const f = getPriority(a.function, fnPriority);
    const s = getPriority(a.seniority, senPriority);
    const base = f * s;
    let score = 0;
    if (meta?.buyer_role === 'ignore') score = 0;
    else if (meta?.buyer_role === 'decision_maker' && meta?.match_type === 'confirmed') score = f === 0 ? Math.min(base, 0.4) : Math.max(base, 0.75);
    else if (meta?.buyer_role === 'influencer' && meta?.match_type === 'confirmed') score = base * 0.7;
    else if (meta?.buyer_role === 'target_title' && meta?.match_type === 'confirmed') score = base * 0.5;
    else if (meta?.match_type === 'system_alias') score = base * 0.9;
    else if (meta?.match_type === 'exact') score = base * 0.7;
    else score = base;
    eligibleIcpCount++;
    if (a.company_id != null) {
      eligibleAttendeeCountByCompany.set(a.company_id, (eligibleAttendeeCountByCompany.get(a.company_id) ?? 0) + 1);
    }
    qualifiedBuyerSum += score;
    if (a.company_id != null) {
      const prev = qualifiedByCompany.get(a.company_id) ?? 0;
      qualifiedByCompany.set(a.company_id, Math.max(prev, score));
    }
  }
  const useFallback = eligibleIcpCount === 0;
  const qualifiedBuyerRate = useFallback ? decisionMakerRate : (qualifiedBuyerSum / Math.max(eligibleIcpCount, 1));
  const rawBuyerAccess = Math.min(qualifiedBuyerRate / 0.55, 1) * 100;
  const hasQualifiedPresence = Array.from(qualifiedByCompany.values()).some(v => v > 0.3);
  const icpAlignBonus = icpCount > 0
    ? (useFallback ? 0 : (hasQualifiedPresence ? Math.min((icpCount / safeTotal) * 10, 10) : -5))
    : 0;
  const buyerAccessScore = clamp(rawBuyerAccess + icpAlignBonus);

  // Apply per-company buyer-quality modifier to avgTierScore only
  const tierCompanies = input.icpTierCompanies ?? [];
  if (tierCompanies.length > 0) {
    const tierEntries = tierCompanies.flatMap(c => {
      const w = c.wse ?? 0;
      if (matchesOp(w, cfg.mustTargetOp || 'gte', cfg.mustTargetMin, cfg.mustTargetMax)) return [{ companyId: c.company_id, base: 100 }];
      if (matchesOp(w, cfg.highPriorityOp || 'between', cfg.highPriorityMin, cfg.highPriorityMax)) return [{ companyId: c.company_id, base: 75 }];
      if (matchesOp(w, cfg.worthEngagingOp || 'between', cfg.worthEngagingMin, cfg.worthEngagingMax)) return [{ companyId: c.company_id, base: 50 }];
      return [];
    });
    if (tierEntries.length > 0) {
      const weighted = tierEntries.map(t => {
        const totalAtt = icpAttendeeCountByCompany.get(t.companyId) ?? 0;
        const eligibleAtt = eligibleAttendeeCountByCompany.get(t.companyId) ?? 0;
        let modifier = 1.0;
        if (totalAtt === 0) modifier = 1.0;
        else if (eligibleAtt === 0) modifier = 0.85;
        else {
          const best = qualifiedByCompany.get(t.companyId) ?? 0;
          if (best >= 0.7) modifier = 1.0;
          else if (best >= 0.4) modifier = 0.85;
          else if (best >= 0.1) modifier = 0.7;
          else modifier = 0.5;
        }
        return t.base * modifier;
      });
      modifiedAvgTierScore = weighted.reduce((s, v) => s + v, 0) / tierEntries.length;
    }
  }

  let targetAccountOpportunityScore = clamp(mustScore * 0.3 + highScore * 0.3 + modifiedAvgTierScore * 0.4);

  // D. Relationship Leverage Score
  const relRate = input.internalRelationshipCount / safeIcp;
  const clientRate = clientCompanyCount / safeTotal;
  const relLeverageScore = clamp(
    Math.min(relRate / 0.40, 1) * 50 +
    Math.min(clientRate / 0.10, 1) * 30 +
    (input.scheduledMeetingCount > 0 ? 20 : 0),
  );

  // E. Customer Presence Score
  const customerPresenceScore = clamp(Math.min(clientRate / 0.12, 1) * 100);

  // F. Pipeline Potential Score
  const realisticPipelineGoal = computeRealisticPipeline(
    input.icpCompanies, mustProxy, highProxy, worthProxy,
    input.avgCostPerUnit, buyerAccessScore, relLeverageScore, cfg,
    {
      bestAttendeeScoreByCompany: qualifiedByCompany,
      attendeeCountByCompany: icpAttendeeCountByCompany,
      eligibleAttendeeCountByCompany: eligibleAttendeeCountByCompany,
    },
  );
  const coverageScore = input.requiredPipeline && input.requiredPipeline > 0
    ? clamp((realisticPipelineGoal / input.requiredPipeline) * 100)
    : clamp((realisticPipelineGoal / 1_000_000) * 100);
  const buyerQualityScore = eligibleIcpCount > 0
    ? clamp((qualifiedBuyerSum / eligibleIcpCount) * 100)
    : 50;
  const pipelinePotentialScore = Math.round(clamp(coverageScore * 0.6 + buyerQualityScore * 0.4));

  const pipelineCoverageRate = input.requiredPipeline && input.requiredPipeline > 0
    ? Math.min((realisticPipelineGoal / input.requiredPipeline) * 100, 100)
    : 0;

  // G. Event Economics Fit Score
  const costPerICP = input.budgetTotal > 0 ? input.budgetTotal / safeIcp : 0;
  const economicsCoverageScore = input.requiredPipeline && input.requiredPipeline > 0
    ? Math.min((realisticPipelineGoal / input.requiredPipeline), 1) * 100
    : 50;
  const costScore = costPerICP > 0 ? Math.min(5000 / costPerICP, 1) * 100 : 50;
  const eventEconomicsFitScore = clamp(economicsCoverageScore * 0.5 + costScore * 0.5);

  // Final weighted score — weights come from the conference's selected strategy profile
  const strategyFitScore = Math.round(
    icpOpportunityScore * weights.icpOpportunity +
    targetAccountOpportunityScore * weights.targetAccountOpportunity +
    buyerAccessScore * weights.buyerAccess +
    relLeverageScore * weights.relationshipLeverage +
    customerPresenceScore * weights.customerPresence +
    pipelinePotentialScore * weights.pipelinePotential +
    eventEconomicsFitScore * weights.eventEconomicsFit,
  );

  // Strategy recommendations
  const componentScores = {
    icpOpp: icpOpportunityScore,
    targetAcc: targetAccountOpportunityScore,
    buyerAccess: buyerAccessScore,
    relLeverage: relLeverageScore,
    customerPresence: customerPresenceScore,
    pipelinePotential: pipelinePotentialScore,
  };

  const primaryStrategy = recommendStrategy(componentScores, input, mustProxy, highProxy);
  const secondaryStrategy = recommendSecondaryStrategy(primaryStrategy, componentScores, input, mustProxy, highProxy);

  // Strategy alignment — does the conference's selected strategy match what the data recommends?
  const recommendedStrategy = primaryStrategy;
  const selectedNormalized = (input.conferenceStrategyType ?? '').trim().toLowerCase();
  const recommendedNormalized = recommendedStrategy.trim().toLowerCase();

  const strategyAlignment: 'aligned' | 'partial' | 'misaligned' | 'unset' =
    !input.conferenceStrategyType
      ? 'unset'
      : selectedNormalized === recommendedNormalized
      ? 'aligned'
      : STRATEGY_WEIGHT_PROFILES[input.conferenceStrategyType]
        ? 'partial'
        : 'misaligned';

  const strategyAlignmentMessage: string | null =
    strategyAlignment === 'aligned'
      ? null
      : strategyAlignment === 'partial'
      ? `Data suggests this conference fits better as ${recommendedStrategy}. Consider updating the strategy or adjusting expectations.`
      : strategyAlignment === 'unset'
      ? 'No strategy selected. Score uses default weights.'
      : null;

  const primaryStrategyReasons = strategyReasons(primaryStrategy, input, mustProxy, highProxy, realisticPipelineGoal, pipelineCoverageRate);
  const secondaryStrategyReasons = secondaryStrategy
    ? strategyReasons(secondaryStrategy, input, mustProxy, highProxy, realisticPipelineGoal, pipelineCoverageRate)
    : [];

  // Hosted Event Fit Score
  const hostedEventFitScore = clamp(
    Math.min((mustProxy + highProxy) / 15, 1) * 25 +
    Math.min(clientCompanyCount / 8, 1) * 20 +
    (buyerAccessScore / 100) * 20 +
    (relLeverageScore / 100) * 15 +
    Math.min(mustProxy / 8, 1) * 10 +
    (input.budgetTotal > 0 && realisticPipelineGoal > input.budgetTotal * 3 ? 10 : 5),
  );

  let hostedEventRecommendation: string;
  if (buyerAccessScore >= 75 && mustProxy >= 8 && relLeverageScore >= 50)
    hostedEventRecommendation = 'Host Executive Dinner';
  else if (customerPresenceScore >= 70)
    hostedEventRecommendation = 'Host Customer Dinner';
  else if (targetAccountOpportunityScore >= 70)
    hostedEventRecommendation = 'Host Prospect Reception';
  else if (icpOpportunityScore >= 55 && buyerAccessScore < 65)
    hostedEventRecommendation = 'Sponsor / Booth Presence';
  else if (primaryStrategy === 'Strategic Account Relationship Building')
    hostedEventRecommendation = 'Meeting Suite Only';
  else
    hostedEventRecommendation = 'Attend Only';

  // Sponsorship Fit Score
  const sponsorshipFitScore = clamp(
    (icpOpportunityScore / 100) * 35 +
    Math.min(totalCompanies / 500, 1) * 25 +
    (customerPresenceScore / 100) * 20 +
    (pipelinePotentialScore / 100) * 15 +
    (relLeverageScore < 40 ? 5 : 0),
  );

  let sponsorshipRecommendation: string;
  if (sponsorshipFitScore >= 75) sponsorshipRecommendation = 'Strong sponsorship fit';
  else if (sponsorshipFitScore >= 55) sponsorshipRecommendation = 'Selective sponsorship — speaking slot only';
  else if (sponsorshipFitScore >= 40) sponsorshipRecommendation = 'Limited sponsorship; prioritize meetings';
  else sponsorshipRecommendation = 'Do not sponsor';

  // Staffing — diminishing returns curve (sqrt) so large conferences don't produce unreachable numbers
  const staffingBase = mustProxy * 0.5 + highProxy * 0.25 + input.scheduledMeetingCount * 0.5;
  const idealizedRepMin = Math.max(1, Math.ceil(Math.sqrt(staffingBase / 2)));
  const idealizedRepMax = idealizedRepMin + 1;

  // Company-wide ceiling: cap the headline recommendation at total company headcount
  const totalCompanyReps = Math.max(input.totalCompanyReps, 0);
  const alreadyCommittedReps = input.internalRepCount;
  const maxTotalReps = totalCompanyReps > 0 ? totalCompanyReps : Infinity;
  const recommendedRepMin = Math.min(idealizedRepMin, maxTotalReps);
  const recommendedRepMax = Math.min(idealizedRepMax, maxTotalReps);
  const isStaffingConstrained = totalCompanyReps > 0 && idealizedRepMax > totalCompanyReps;

  return {
    strategyFitScore,
    strategyFitInterpretation: interpretScore(strategyFitScore),
    icpOpportunityScore: Math.round(icpOpportunityScore),
    targetAccountOpportunityScore: Math.round(targetAccountOpportunityScore),
    buyerAccessScore: Math.round(buyerAccessScore),
    relationshipLeverageScore: Math.round(relLeverageScore),
    customerPresenceScore: Math.round(customerPresenceScore),
    pipelinePotentialScore: Math.round(pipelinePotentialScore),
    eventEconomicsFitScore: Math.round(eventEconomicsFitScore),
    appliedStrategyWeights: weights,
    strategyAlignment,
    strategyAlignmentMessage,
    recommendedStrategy,
    selectedStrategy: input.conferenceStrategyType ?? null,
    primaryStrategy,
    primaryStrategyReasons,
    secondaryStrategy,
    secondaryStrategyReasons,
    requiredPipeline: input.requiredPipeline,
    realisticPipelineGoal,
    pipelineCoverageRate: Math.round(pipelineCoverageRate * 10) / 10,
    mustTargetProxyCount: mustProxy,
    highPriorityProxyCount: highProxy,
    worthEngagingProxyCount: worthProxy,
    hostedEventRecommendation,
    hostedEventFitScore: Math.round(hostedEventFitScore),
    sponsorshipRecommendation,
    sponsorshipFitScore: Math.round(sponsorshipFitScore),
    recommendedRepMin,
    recommendedRepMax,
    idealizedRepMin,
    idealizedRepMax,
    isStaffingConstrained,
    totalCompanyReps,
    alreadyCommittedReps,
    currentRepCount: input.internalRepCount,
  };
}
