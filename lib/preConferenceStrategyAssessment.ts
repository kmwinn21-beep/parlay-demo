export type ConfidenceLevel = 'High' | 'Medium' | 'Low';

export interface TargetRecommendationCompany {
  company_id?: number | string | null;
  id?: number | string | null;
  company_name?: string | null;
  name?: string | null;
  target_priority_tier?: string | null;
  buyer_access_score?: number | null;
  relationship_leverage_score?: number | null;
  scheduled_meeting_count?: number | null;
  confidence_level?: ConfidenceLevel | string | null;
  companyWse?: number | null;
  company_wse?: number | null;
  wse?: number | null;
  open_opportunity_amount?: number | null;
  pipeline_potential?: number | null;
}

export function getTargetTierRank(tier: string | null | undefined): number { /* ... */
  switch (tier) { case 'Must Target': return 1; case 'High Priority': return 2; case 'Worth Engaging': return 3; case 'Monitor': return 4; case 'Low Priority': return 5; default: return 99; }
}
export function dedupeCompaniesByIdOrName<T extends object>(companies: T[]): T[] { const map = new Map<string, T>(); for (const company of companies) { const c = company as any; const raw = c.company_id ?? c.id ?? c.company_name ?? c.name; if (raw == null) continue; const key = String(raw).trim().toLowerCase(); if (!key) continue; const existing = map.get(key); if (!existing) { map.set(key, company); continue; } if (getTargetTierRank(String((c.target_priority_tier) ?? "")) < getTargetTierRank(String(((existing as any).target_priority_tier) ?? ""))) map.set(key, company);} return Array.from(map.values()); }
export function getBasePipelineProbabilityFactor(tier: string | null | undefined): number { switch (tier) { case 'Must Target': return 0.25; case 'High Priority': return 0.15; case 'Worth Engaging': return 0.075; case 'Monitor': return 0.025; case 'Low Priority': return 0; default: return 0; } }
export function calculateCompanyPipelineProbabilityFactor(company: TargetRecommendationCompany): number { let factor = getBasePipelineProbabilityFactor(company.target_priority_tier); if ((company.buyer_access_score ?? 0) >= 80) factor += 0.05; if ((company.relationship_leverage_score ?? 0) >= 80) factor += 0.05; if ((company.scheduled_meeting_count ?? 0) > 0) factor += 0.05; if ((company.buyer_access_score ?? 100) < 40) factor -= 0.05; if (company.confidence_level === 'Low') factor -= 0.05; return Math.max(0, Math.min(factor, 0.35)); }

function firstValid(...vals: Array<number | null | undefined>): number | null { for (const v of vals){ if (v != null && Number.isFinite(v) && v > 0) return Number(v);} return null; }

export function calculateRealisticPipelineGoal({ companies, avgCostPerUnit }: { companies: TargetRecommendationCompany[]; avgCostPerUnit: number; }): number | null {
  if (!Array.isArray(companies) || companies.length === 0) return null;
  if (!Number.isFinite(avgCostPerUnit) || avgCostPerUnit <= 0) return null;
  const deduped = dedupeCompaniesByIdOrName(companies);
  let total = 0; let used = 0;
  for (const c of deduped) {
    const wse = firstValid(Number(c.companyWse ?? NaN), Number(c.company_wse ?? NaN), Number(c.wse ?? NaN));
    const baseValue = wse != null ? wse * avgCostPerUnit : firstValid(Number(c.open_opportunity_amount ?? NaN), Number(c.pipeline_potential ?? NaN));
    if (baseValue == null) continue;
    total += baseValue * calculateCompanyPipelineProbabilityFactor(c);
    used += 1;
  }
  return used > 0 ? total : null;
}
export function weightedAverageAvailable(components: Array<{score:number|null;weight:number}>): number | null { const available=components.filter(c=>c.score!=null&&Number.isFinite(c.score)); const tw=available.reduce((s,c)=>s+c.weight,0); if(tw<=0) return null; return available.reduce((s,c)=>s+Number(c.score)*(c.weight/tw),0); }
export const scoreCostPerHighPriorityTarget = (value:number|null):number|null => value==null||!Number.isFinite(value)?null:value<=1500?100:value<=3000?100-((value-1500)/1500)*40:value<=6000?60-((value-3000)/3000)*30:20;
export const scoreCostPerIcpCompany = (value:number|null):number|null => value==null||!Number.isFinite(value)?null:value<=500?100:value<=1000?100-((value-500)/500)*30:value<=2000?70-((value-1000)/1000)*30:20;
