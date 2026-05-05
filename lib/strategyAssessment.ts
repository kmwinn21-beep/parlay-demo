export interface StrategyAssessmentInput {
  totalAttendees: number;
  totalCompanies: number;
  icpCount: number;
  clientCompanyCount: number;
  seniorityBreakdown: { label: string; count: number }[];
  internalRelationshipCount: number;
  scheduledMeetingCount: number;
  internalRepCount: number;
  conferenceStrategyType: string | null;
  budgetTotal: number;
  requiredPipeline: number | null;
  avgCostPerUnit: number;
  icpCompanies: { wse: number | null }[];
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

// Classify ICP companies into tier proxies based on WSE size
function classifyTiers(icpCompanies: { wse: number | null }[]): {
  mustProxy: number;
  highProxy: number;
  worthProxy: number;
} {
  let mustProxy = 0;
  let highProxy = 0;
  let worthProxy = 0;
  for (const c of icpCompanies) {
    const w = c.wse ?? 0;
    if (w >= 2000) mustProxy++;
    else if (w >= 400) highProxy++;
    else worthProxy++;
  }
  return { mustProxy, highProxy, worthProxy };
}

function computeRealisticPipeline(
  icpCompanies: { wse: number | null }[],
  mustProxy: number,
  highProxy: number,
  worthProxy: number,
  avgCostPerUnit: number,
  buyerAccess: number,
  relLeverage: number,
): number {
  if (avgCostPerUnit <= 0) return 0;
  const sorted = [...icpCompanies].sort((a, b) => (b.wse ?? 0) - (a.wse ?? 0));
  let goal = 0;
  let mustRemaining = mustProxy;
  let highRemaining = highProxy;
  let worthRemaining = worthProxy;
  for (const c of sorted) {
    const wse = c.wse ?? 0;
    let prob: number;
    if (mustRemaining > 0) { prob = 0.25; mustRemaining--; }
    else if (highRemaining > 0) { prob = 0.15; highRemaining--; }
    else if (worthRemaining > 0) { prob = 0.075; worthRemaining--; }
    else { prob = 0.025; }
    goal += wse * avgCostPerUnit * prob;
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
      if (mustProxy + highProxy > 0) reasons.push(`${mustProxy + highProxy} high-priority target companies identified`);
      if (realisticGoal > 0) reasons.push(`Realistic pipeline goal: ${fmt$(realisticGoal)} (${coverageRate.toFixed(1)}% of required)`);
      break;
    case 'Pipeline Acceleration':
      if (input.internalRelationshipCount > 0) reasons.push(`${input.internalRelationshipCount} companies with existing internal relationships`);
      if (input.scheduledMeetingCount > 0) reasons.push(`${input.scheduledMeetingCount} meetings already scheduled`);
      if (input.clientCompanyCount > 0) reasons.push(`${input.clientCompanyCount} client companies attending`);
      break;
    case 'Strategic Account Relationship Building':
      if (mustProxy > 0) reasons.push(`${mustProxy} must-target companies attending`);
      if (highProxy > 0) reasons.push(`${highProxy} high-priority companies attending`);
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

  if (icpOpp >= 65 && targetAcc >= 65 && buyerAccess >= 60 && customerPresence < 50)
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
  if (icpOpp >= 50 && targetAcc >= 50) return 'Pipeline Generation';
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

export function computeStrategyAssessment(input: StrategyAssessmentInput): StrategyAssessment {
  const { totalAttendees, totalCompanies, icpCount, clientCompanyCount } = input;

  const safeTotal = Math.max(totalCompanies, 1);
  const safeTotalAtt = Math.max(totalAttendees, 1);
  const safeIcp = Math.max(icpCount, 1);

  // Tier proxies
  const { mustProxy, highProxy, worthProxy } = classifyTiers(input.icpCompanies);

  // A. ICP Opportunity Score
  const icpRate = icpCount / safeTotal;
  const icpRateScore = Math.min(icpRate / 0.25, 1) * 100;
  const highDensScore = Math.min((mustProxy + highProxy) / safeTotal / 0.15, 1) * 100;
  const icpOpportunityScore = clamp(icpRateScore * 0.5 + highDensScore * 0.5);

  // B. Target Account Opportunity Score
  const mustScore = Math.min(mustProxy / 10, 1) * 100;
  const highScore = Math.min(highProxy / 25, 1) * 100;
  const totalTierCount = Math.max(mustProxy + highProxy + worthProxy, 1);
  const avgTierScore = (mustProxy * 100 + highProxy * 75 + worthProxy * 50) / totalTierCount;
  const targetAccountOpportunityScore = clamp(mustScore * 0.3 + highScore * 0.3 + avgTierScore * 0.4);

  // C. Buyer Access Score — seniority proxy
  const seniorDecisionLabels = new Set(['c-suite', 'director', 'vp/svp', 'ed', 'c suite', 'vp', 'svp']);
  const decisionMakerCount = input.seniorityBreakdown
    .filter(s => seniorDecisionLabels.has(s.label.toLowerCase()))
    .reduce((sum, s) => sum + s.count, 0);
  const decisionMakerRate = decisionMakerCount / safeTotalAtt;
  const rawBuyerAccess = Math.min(decisionMakerRate / 0.55, 1) * 100;
  const icpAlignBonus = icpCount > 0 ? Math.min((icpCount / safeTotal) * 10, 10) : 0;
  const buyerAccessScore = clamp(rawBuyerAccess + icpAlignBonus);

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
    input.avgCostPerUnit, buyerAccessScore, relLeverageScore,
  );
  const pipelinePotentialScore = input.requiredPipeline && input.requiredPipeline > 0
    ? clamp((realisticPipelineGoal / input.requiredPipeline) * 100)
    : clamp((realisticPipelineGoal / 1_000_000) * 100);

  const pipelineCoverageRate = input.requiredPipeline && input.requiredPipeline > 0
    ? Math.min((realisticPipelineGoal / input.requiredPipeline) * 100, 100)
    : 0;

  // G. Event Economics Fit Score
  const costPerICP = input.budgetTotal > 0 ? input.budgetTotal / safeIcp : 0;
  const coverageScore = input.requiredPipeline && input.requiredPipeline > 0
    ? Math.min((realisticPipelineGoal / input.requiredPipeline), 1) * 100
    : 50;
  const costScore = costPerICP > 0 ? Math.min(5000 / costPerICP, 1) * 100 : 50;
  const eventEconomicsFitScore = clamp(coverageScore * 0.5 + costScore * 0.5);

  // Final weighted score
  const strategyFitScore = Math.round(
    icpOpportunityScore * 0.20 +
    targetAccountOpportunityScore * 0.20 +
    buyerAccessScore * 0.15 +
    relLeverageScore * 0.15 +
    customerPresenceScore * 0.10 +
    pipelinePotentialScore * 0.15 +
    eventEconomicsFitScore * 0.05,
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

  // Staffing
  const staffingBase = mustProxy * 0.5 + highProxy * 0.25 + input.scheduledMeetingCount * 0.5;
  const recommendedRepMin = Math.max(1, Math.ceil(staffingBase / 10));
  const recommendedRepMax = recommendedRepMin + 1;

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
    currentRepCount: input.internalRepCount,
  };
}
