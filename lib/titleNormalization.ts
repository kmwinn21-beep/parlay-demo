export type BuyerRoleKey = 'decision_maker' | 'influencer' | 'target_title' | 'ignore';
export type TitleRuleSource = 'user_confirmed' | 'system_alias' | 'fuzzy_match' | 'imported';
export type TitleMatchType = 'confirmed' | 'configured_alias' | 'system_alias' | 'exact' | 'fuzzy' | 'none';
export type TitleMatchConfidence = 'high' | 'medium' | 'low';

export interface TitleNormalizationRuleLike {
  id?: number;
  organization_id?: number | null;
  raw_title: string;
  normalized_title: string;
  function_id: number | null;
  seniority_id: number | null;
  buyer_role: BuyerRoleKey;
  source: TitleRuleSource;
  confidence: TitleMatchConfidence;
}

export interface TitleMatchMetadata {
  original_title: string | null;
  normalized_title: string | null;
  function_id: number | null;
  seniority_id: number | null;
  buyer_role: BuyerRoleKey | null;
  match_type: TitleMatchType;
  match_confidence: TitleMatchConfidence;
  source: TitleRuleSource | 'configured_alias' | 'exact' | 'none';
  suggested_match?: string | null;
  needs_review: boolean;
  explanation?: string;
  buyer_fit_score: number;
  buyer_access_score: number;
  target_priority_score: number;
}

export const BUYER_ROLE_OPTIONS: Array<{ key: BuyerRoleKey; label: string }> = [
  { key: 'decision_maker', label: 'Decision Maker' },
  { key: 'influencer', label: 'Influencer' },
  { key: 'target_title', label: 'Target Title' },
  { key: 'ignore', label: 'Ignore' },
];

export function normalizeTitleKey(title: string | null | undefined): string {
  return String(title ?? '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\b(the|of|and)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function shouldWarnForTitleMetadata(meta: TitleMatchMetadata | null | undefined): boolean {
  if (!meta) return true;
  return meta.needs_review
    || meta.match_type === 'fuzzy'
    || meta.match_type === 'none'
    || meta.match_confidence === 'low'
    || meta.match_confidence === 'medium'
    || !meta.function_id
    || !meta.seniority_id
    || !meta.buyer_role;
}

export function computeTitleScore(meta: Pick<TitleMatchMetadata, 'buyer_role' | 'match_confidence' | 'function_id' | 'seniority_id'>): number {
  if (meta.buyer_role === 'ignore') return 0;
  const roleScore = meta.buyer_role === 'decision_maker' ? 100 : meta.buyer_role === 'influencer' ? 82 : meta.buyer_role === 'target_title' ? 70 : 35;
  const confidenceMultiplier = meta.match_confidence === 'high' ? 1 : meta.match_confidence === 'medium' ? 0.78 : 0.55;
  const completenessBonus = (meta.function_id ? 5 : 0) + (meta.seniority_id ? 5 : 0);
  return Math.max(0, Math.min(100, Math.round(roleScore * confidenceMultiplier + completenessBonus)));
}

export function buildTitleMetadata(input: {
  originalTitle: string | null | undefined;
  normalizedTitle?: string | null;
  functionId?: number | null;
  seniorityId?: number | null;
  buyerRole?: BuyerRoleKey | null;
  matchType: TitleMatchType;
  confidence: TitleMatchConfidence;
  source: TitleMatchMetadata['source'];
  suggestedMatch?: string | null;
  explanation?: string;
}): TitleMatchMetadata {
  const base = {
    original_title: input.originalTitle ? String(input.originalTitle) : null,
    normalized_title: input.normalizedTitle ?? null,
    function_id: input.functionId ?? null,
    seniority_id: input.seniorityId ?? null,
    buyer_role: input.buyerRole ?? null,
    match_type: input.matchType,
    match_confidence: input.confidence,
    source: input.source,
    suggested_match: input.suggestedMatch ?? null,
    explanation: input.explanation,
  };
  const needs_review = shouldWarnForTitleMetadata({ ...base, needs_review: false, buyer_fit_score: 0, buyer_access_score: 0, target_priority_score: 0 });
  const buyer_fit_score = computeTitleScore(base);
  return {
    ...base,
    needs_review,
    buyer_fit_score,
    buyer_access_score: buyer_fit_score,
    target_priority_score: buyer_fit_score,
  };
}

export function conservativeTitleSimilarity(a: string, b: string): number {
  const left = new Set(normalizeTitleKey(a).split(' ').filter(Boolean));
  const right = new Set(normalizeTitleKey(b).split(' ').filter(Boolean));
  if (left.size === 0 || right.size === 0) return 0;
  const overlap = Array.from(left).filter(token => right.has(token)).length;
  return overlap / Math.max(left.size, right.size);
}
