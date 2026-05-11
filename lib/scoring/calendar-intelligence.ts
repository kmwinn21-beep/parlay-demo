export const DEFAULT_WEIGHTS = {
  audienceFit: 0.25,
  targetOpportunity: 0.20,
  engagementCapture: 0.15,
  commercialPotential: 0.15,
  costJustification: 0.15,
  strategicValue: 0.10,
} as const;

type WeightKey = keyof typeof DEFAULT_WEIGHTS;

export function reweightComponents(weights: typeof DEFAULT_WEIGHTS, nullComponents: WeightKey[]) {
  const totalNullWeight = nullComponents.reduce((sum, k) => sum + weights[k], 0);
  const available = (Object.keys(weights) as WeightKey[]).filter((k) => !nullComponents.includes(k));
  const totalAvailable = available.reduce((sum, k) => sum + weights[k], 0);
  const reweighted = { ...weights } as Record<WeightKey, number>;
  for (const n of nullComponents) reweighted[n] = 0;
  for (const k of available) reweighted[k] = weights[k] + (weights[k] / totalAvailable) * totalNullWeight;
  const total = (Object.values(reweighted) as number[]).reduce((a, b) => a + b, 0);
  if (total !== 1 && total > 0) {
    for (const k of Object.keys(reweighted) as WeightKey[]) reweighted[k] = reweighted[k] / total;
  }
  return reweighted as typeof DEFAULT_WEIGHTS;
}

export function assembleFinalScore(componentScores: Record<WeightKey, number | null>) {
  const nulls = (Object.keys(componentScores) as WeightKey[]).filter((k) => componentScores[k] == null);
  const calculable = (Object.keys(componentScores) as WeightKey[]).filter((k) => componentScores[k] != null).length;
  const appliedWeights = reweightComponents(DEFAULT_WEIGHTS, nulls);
  if (calculable < 3) return { score: null, appliedWeights };
  const raw = (Object.keys(componentScores) as WeightKey[]).reduce((sum, k) => sum + ((componentScores[k] ?? 0) * appliedWeights[k]), 0);
  return { score: Math.max(0, Math.min(100, raw)), appliedWeights };
}
