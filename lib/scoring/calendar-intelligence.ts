export const DEFAULT_WEIGHTS = {
  audienceFit: 0.30,
  targetOpportunity: 0.24,
  commercialPotential: 0.18,
  costJustification: 0.18,
  strategicValue: 0.10,
} as const;

type WeightKey = keyof typeof DEFAULT_WEIGHTS;

export interface ComponentScores {
  audienceFit: number | null;
  targetOpportunity: number | null;
  commercialPotential: number | null;
  costJustification: number | null;
  strategicValue: number | null;
}

export interface ScoreResult {
  score: number | null;
  confidenceMultiplier: number;
  availableComponentCount: number;
  totalComponentCount: number;
  maxPossibleScore: number;
}

export function assembleFinalScore(componentScores: ComponentScores): ScoreResult {
  const TOTAL_COMPONENTS = 5;

  const availableComponentCount = (Object.keys(DEFAULT_WEIGHTS) as WeightKey[]).filter(
    (k) => componentScores[k] !== null,
  ).length;

  const availableWeight = (Object.entries(DEFAULT_WEIGHTS) as [WeightKey, number][]).reduce(
    (sum, [key, weight]) => (componentScores[key] !== null ? sum + weight : sum),
    0,
  );

  const maxPossibleScore = Math.round(availableWeight * 100);
  const confidenceMultiplier = availableComponentCount / TOTAL_COMPONENTS;

  // Require at least 40% of total scoring weight to generate a score.
  // Audience Fit + Target Opportunity (0.30 + 0.24 = 0.54) is the minimum meaningful pair.
  if (availableWeight < 0.40) {
    return {
      score: null,
      confidenceMultiplier,
      availableComponentCount,
      totalComponentCount: TOTAL_COMPONENTS,
      maxPossibleScore,
    };
  }

  // Null components contribute 0 — their weight simply disappears from the sum.
  // This naturally penalizes the final score when data is missing without reweighting.
  const rawScore = (Object.entries(DEFAULT_WEIGHTS) as [WeightKey, number][]).reduce(
    (sum, [key, weight]) => {
      const s = componentScores[key];
      return s !== null ? sum + s * weight : sum;
    },
    0,
  );

  return {
    score: Math.round(Math.min(100, Math.max(0, rawScore))),
    confidenceMultiplier,
    availableComponentCount,
    totalComponentCount: TOTAL_COMPONENTS,
    maxPossibleScore,
  };
}

// ─── Strategy fit scoring ────────────────────────────────────────────────────
// Separate from lib/strategyAssessment.ts's STRATEGY_WEIGHT_PROFILES (that one
// is Pre-Conference Review-specific, keyed off a different 7-component score set).
// This profile table is keyed off Calendar Intelligence's 5 components and lives
// here, co-located with its own scoring engine.

export interface CalendarStrategyWeightProfile {
  audienceFit: number;
  targetOpportunity: number;
  commercialPotential: number;
  costJustification: number;
  strategicValue: number;
}

// Keys must match the exact conference_strategy_type config_options values seeded in lib/db.ts
export const CALENDAR_STRATEGY_PROFILES: Record<string, CalendarStrategyWeightProfile> = {
  'Pipeline Generation':                    { audienceFit: 0.25, targetOpportunity: 0.30, commercialPotential: 0.25, costJustification: 0.15, strategicValue: 0.05 },
  'Pipeline Acceleration':                  { audienceFit: 0.20, targetOpportunity: 0.25, commercialPotential: 0.20, costJustification: 0.15, strategicValue: 0.20 },
  'Strategic Account Relationship Building': { audienceFit: 0.15, targetOpportunity: 0.15, commercialPotential: 0.20, costJustification: 0.10, strategicValue: 0.40 },
  'Customer Retention / Customer Nurture':  { audienceFit: 0.10, targetOpportunity: 0.05, commercialPotential: 0.10, costJustification: 0.10, strategicValue: 0.65 },
  'Market Presence / Brand Visibility':     { audienceFit: 0.40, targetOpportunity: 0.20, commercialPotential: 0.10, costJustification: 0.20, strategicValue: 0.10 },
  'Competitive Defense':                    { audienceFit: 0.20, targetOpportunity: 0.10, commercialPotential: 0.10, costJustification: 0.10, strategicValue: 0.50 },
  'Thought Leadership':                     { audienceFit: 0.35, targetOpportunity: 0.25, commercialPotential: 0.15, costJustification: 0.15, strategicValue: 0.10 },
  'Partner / Ecosystem Development':        { audienceFit: 0.20, targetOpportunity: 0.15, commercialPotential: 0.15, costJustification: 0.10, strategicValue: 0.40 },
};

export interface CalendarStrategyScore {
  strategy: string;
  score: number;
}

// Null component scores contribute 0 to the weighted sum — same "missing data
// silently lowers the ceiling" philosophy as assembleFinalScore above.
export function computeCalendarStrategyScores(componentScores: ComponentScores): CalendarStrategyScore[] {
  const s = {
    audienceFit: componentScores.audienceFit ?? 0,
    targetOpportunity: componentScores.targetOpportunity ?? 0,
    commercialPotential: componentScores.commercialPotential ?? 0,
    costJustification: componentScores.costJustification ?? 0,
    strategicValue: componentScores.strategicValue ?? 0,
  };
  return Object.entries(CALENDAR_STRATEGY_PROFILES)
    .map(([strategy, p]) => ({
      strategy,
      score: Math.round(
        s.audienceFit * p.audienceFit +
        s.targetOpportunity * p.targetOpportunity +
        s.commercialPotential * p.commercialPotential +
        s.costJustification * p.costJustification +
        s.strategicValue * p.strategicValue,
      ),
    }))
    .sort((a, b) => b.score - a.score);
}

export function buildStrategyRationale(
  recommendedStrategy: string,
  scores: { audienceFit: number; targetOpportunity: number; commercialPotential: number; costJustification: number; strategicValue: number },
): string {
  const strengths: string[] = [];
  const weaknesses: string[] = [];

  if (scores.audienceFit >= 70) strengths.push(`high audience fit (${scores.audienceFit})`);
  if (scores.targetOpportunity >= 70) strengths.push(`strong target opportunity (${scores.targetOpportunity})`);
  if (scores.commercialPotential >= 70) strengths.push(`commercial potential (${scores.commercialPotential})`);
  if (scores.costJustification >= 70) strengths.push(`cost justification (${scores.costJustification})`);
  if (scores.strategicValue >= 70) strengths.push(`strategic value (${scores.strategicValue})`);

  if (scores.strategicValue < 40) weaknesses.push(`low strategic value (${scores.strategicValue}) — few existing relationships`);
  if (scores.targetOpportunity < 40) weaknesses.push(`low target opportunity (${scores.targetOpportunity})`);
  if (scores.audienceFit < 40) weaknesses.push(`low audience fit (${scores.audienceFit})`);

  if (strengths.length === 0 && weaknesses.length === 0) {
    return `The audience profile shows moderate fit across all dimensions. ${recommendedStrategy} scores highest under current attendee data.`;
  }

  const strengthStr = strengths.length > 0
    ? `${strengths.slice(0, 2).join(' and ')} make this conference well-suited for ${recommendedStrategy.toLowerCase()}.`
    : `The overall audience profile points toward ${recommendedStrategy.toLowerCase()}.`;

  const weaknessStr = weaknesses.length > 0
    ? ` ${weaknesses[0].charAt(0).toUpperCase() + weaknesses[0].slice(1)} points away from relationship or retention plays.`
    : '';

  return strengthStr + weaknessStr;
}
