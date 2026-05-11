export const DEFAULT_WEIGHTS = {
  audienceFit: 0.25,
  targetOpportunity: 0.20,
  engagementCapture: 0.15,
  commercialPotential: 0.15,
  costJustification: 0.15,
  strategicValue: 0.10,
} as const;

type WeightKey = keyof typeof DEFAULT_WEIGHTS;

export interface ComponentScores {
  audienceFit: number | null;
  targetOpportunity: number | null;
  engagementCapture: number | null;
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
  const TOTAL_COMPONENTS = 6;

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
  // Audience Fit + Target Opportunity (0.25 + 0.20 = 0.45) is the minimum meaningful pair.
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
