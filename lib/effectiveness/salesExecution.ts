export type Confidence = 'High' | 'Medium' | 'Low';
export type Tier = 'Exceptional' | 'Strong' | 'Acceptable' | 'Needs Work' | 'Weak';

type Component = { key: string; score: number | null; weight: number };

export const DEFAULT_SALES_WEIGHTS = {
  meeting_execution: 0.25,
  followup_execution: 0.2,
  pipeline_influence_execution: 0.25,
  target_account_execution: 0.15,
  rep_productivity: 0.15,
} as const;

export function pct(n: number, d: number): number | null {
  if (d <= 0) return null;
  return Math.max(0, Math.min(100, (n / d) * 100));
}

export function tierFromScore(score: number | null): Tier | null {
  if (score == null) return null;
  if (score >= 90) return 'Exceptional';
  if (score >= 75) return 'Strong';
  if (score >= 60) return 'Acceptable';
  if (score >= 50) return 'Needs Work';
  return 'Weak';
}

export function reweight(components: Component[]) {
  const available = components.filter((c) => c.score != null);
  const total = available.reduce((s, c) => s + c.weight, 0);
  const effectiveWeights: Record<string, number> = {};
  const originalWeights: Record<string, number> = {};
  let weighted = 0;
  for (const c of components) originalWeights[c.key] = c.weight;
  for (const c of available) {
    const eff = total > 0 ? c.weight / total : 0;
    effectiveWeights[c.key] = eff;
    weighted += (c.score ?? 0) * eff;
  }
  const unavailable = components.filter((c) => c.score == null).map((c) => c.key);
  const confidence: Confidence = total >= 0.85 ? 'High' : total >= 0.5 ? 'Medium' : 'Low';
  return {
    score: available.length ? Math.round(weighted) : null,
    unavailable,
    effectiveWeights,
    originalWeights,
    confidence,
  };
}
