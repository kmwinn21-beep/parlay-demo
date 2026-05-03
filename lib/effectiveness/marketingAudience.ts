import { pct, reweight, tierFromScore } from './salesExecution';

export const DEFAULT_MARKETING_AUDIENCE_WEIGHTS = {
  icp_target_quality: 0.30,
  buyer_role_access: 0.25,
  net_new_market_reach: 0.20,
  engagement_depth: 0.15,
  message_resonance_proxy: 0.10,
} as const;

export const PRIORITY_SCORE: Record<string, number> = { high: 100, medium: 70, low: 40 };

export function norm(v: unknown): string { return String(v ?? '').trim().toLowerCase(); }
export function titleMatch(title: string, list: string[]): boolean {
  const t = norm(title);
  return list.some((s) => t.includes(norm(s)) || norm(s).includes(t));
}

export { pct, reweight, tierFromScore };
