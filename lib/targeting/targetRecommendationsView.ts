import type { AttendeeBuyerFitScore, CompanyTargetScore, RecommendedTargetAction } from '@/lib/targeting/targetPriority';

export type TargetingCompanyRecommendation = CompanyTargetScore & {
  target_priority_tier_key?: string;
};

export interface TargetingApiResponse {
  conference_id?: number;
  generated_at?: string;
  scoring_config?: {
    recommended_actions?: RecommendedTargetAction[];
    target_company_type_id?: number | null;
  };
  companies?: TargetingCompanyRecommendation[];
  pagination?: {
    offset: number;
    limit: number;
    total_companies: number;
    returned: number;
    has_more: boolean;
    next_offset: number | null;
  };
  unavailable_reason?: string;
  error?: string;
}

export interface TitleReviewItem extends AttendeeBuyerFitScore {
  company_id: number;
  company_name: string;
}

export interface TargetBucket {
  key: string;
  label: string;
  description: string;
  companies: TargetingCompanyRecommendation[];
}

export interface TargetRecommendationSummary {
  mustTarget: number | null;
  highPriority: number | null;
  worthEngaging: number | null;
  needsTitleReview: number;
  avgTargetPriority: number | null;
}

const STRONG_SCORE = 75;
const WEAK_SCORE = 50;

export function stableKey(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

export function titleNeedsReview(attendee: Partial<AttendeeBuyerFitScore>): boolean {
  const matchType = stableKey(attendee.title_match_type);
  const confidence = stableKey(attendee.title_match_confidence);
  const role = stableKey(attendee.buyer_role_classification);

  return (
    matchType === 'fuzzy' ||
    matchType === 'no_match' ||
    confidence === 'low' ||
    role === 'unknown' ||
    !attendee.function_label ||
    !attendee.seniority_label
  );
}

export function companyNeedsTitleReview(company: TargetingCompanyRecommendation): boolean {
  const confidenceReasons = (company.confidence_reasons ?? []).join(' ').toLowerCase();
  return (
    stableKey(company.confidence_level) === 'low' && confidenceReasons.includes('title')
  ) || (company.top_attendees ?? []).some(titleNeedsReview);
}

export function getTierKey(company: TargetingCompanyRecommendation): string {
  return stableKey(company.target_priority_tier_key || company.target_priority_tier);
}

export function scoreOrNull(value: unknown): number | null {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

export function buildActionLabelMap(actions: RecommendedTargetAction[] = []): Map<string, string> {
  return new Map(actions.map(action => [action.key, action.label]));
}

export function summarizeTargetRecommendations(companies: TargetingCompanyRecommendation[]): TargetRecommendationSummary {
  const scored = companies
    .map(company => scoreOrNull(company.target_priority_score))
    .filter((score): score is number => score !== null);

  return {
    mustTarget: companies.filter(company => getTierKey(company) === 'must_target').length,
    highPriority: companies.filter(company => getTierKey(company) === 'high_priority').length,
    worthEngaging: companies.filter(company => getTierKey(company) === 'worth_engaging').length,
    needsTitleReview: collectTitleReviewItems(companies).length,
    avgTargetPriority: scored.length ? Math.round(scored.reduce((sum, score) => sum + score, 0) / scored.length) : null,
  };
}

export function sortCompaniesByPriority(companies: TargetingCompanyRecommendation[]): TargetingCompanyRecommendation[] {
  return [...companies].sort((a, b) => (scoreOrNull(b.target_priority_score) ?? -1) - (scoreOrNull(a.target_priority_score) ?? -1));
}

export function collectTitleReviewItems(companies: TargetingCompanyRecommendation[]): TitleReviewItem[] {
  const seen = new Set<number>();
  const items: TitleReviewItem[] = [];

  for (const company of companies) {
    for (const attendee of company.top_attendees ?? []) {
      if (!titleNeedsReview(attendee) || seen.has(attendee.attendee_id)) continue;
      seen.add(attendee.attendee_id);
      items.push({
        ...attendee,
        company_id: company.company_id,
        company_name: company.company_name,
      });
    }
  }

  return items.sort((a, b) => (scoreOrNull(b.buyer_fit_score) ?? -1) - (scoreOrNull(a.buyer_fit_score) ?? -1));
}

export function buildTargetBuckets(companies: TargetingCompanyRecommendation[]): TargetBucket[] {
  const sorted = sortCompaniesByPriority(companies);
  const buckets: TargetBucket[] = [
    {
      key: 'must_target',
      label: 'Must Target',
      description: 'Highest Target Priority tier.',
      companies: sorted.filter(company => getTierKey(company) === 'must_target'),
    },
    {
      key: 'warm_path',
      label: 'Warm Path Targets',
      description: 'Strong relationship leverage score.',
      companies: sorted.filter(company => (scoreOrNull(company.relationship_leverage_score) ?? 0) >= STRONG_SCORE),
    },
    {
      key: 'high_icp_weak_relationship',
      label: 'High ICP / Weak Relationship',
      description: 'Strong ICP fit but limited relationship leverage.',
      companies: sorted.filter(company => (scoreOrNull(company.icp_fit_score) ?? 0) >= STRONG_SCORE && (scoreOrNull(company.relationship_leverage_score) ?? 0) < WEAK_SCORE),
    },
    {
      key: 'buyer_access',
      label: 'Buyer Access Opportunities',
      description: 'Strong buyer access score from attendees.',
      companies: sorted.filter(company => (scoreOrNull(company.buyer_access_score) ?? 0) >= STRONG_SCORE),
    },
    {
      key: 'known_relationship',
      label: 'Known Relationship Targets',
      description: 'Relationship signals are present in the scoring foundation.',
      companies: sorted.filter(company => (scoreOrNull(company.relationship_leverage_score) ?? 0) >= WEAK_SCORE),
    },
    {
      key: 'monitor',
      label: 'Monitor Only',
      description: 'Monitor-tier companies to keep on the radar.',
      companies: sorted.filter(company => getTierKey(company) === 'monitor'),
    },
  ];

  return buckets;
}

export function countRecommendedActions(
  companies: TargetingCompanyRecommendation[],
  actionLabelMap: Map<string, string> = new Map()
): Array<{ key: string; label: string; count: number }> {
  const counts = new Map<string, { label: string; count: number }>();
  for (const company of companies) {
    const key = company.recommended_action_key || company.recommended_action?.recommended_action_key || stableKey(company.recommended_action_label);
    if (!key) continue;
    const label = actionLabelMap.get(key) || company.recommended_action_label || company.recommended_action?.recommended_action_label || key;
    const existing = counts.get(key);
    counts.set(key, { label, count: (existing?.count ?? 0) + 1 });
  }

  return Array.from(counts.entries())
    .map(([key, value]) => ({ key, ...value }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}
