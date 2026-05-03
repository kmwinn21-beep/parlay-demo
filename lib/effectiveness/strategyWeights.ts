export type StrategyKey =
  | 'pipeline_generation'
  | 'pipeline_acceleration'
  | 'customer_retention'
  | 'market_presence'
  | 'strategic_account_relationship_building'
  | 'partner_ecosystem_development'
  | 'competitive_defense'
  | 'thought_leadership';

export const DEFAULT_STRATEGY_KEY: StrategyKey = 'pipeline_generation';

type ScoreGroup = 'conference_effectiveness'|'sales_effectiveness'|'marketing_audience_signal'|'cost_efficiency';
type Weights = Record<string, number>;

export const STRATEGY_PRESETS: Record<ScoreGroup, Record<StrategyKey, Weights>> = {
  conference_effectiveness: {
    pipeline_generation:{icp_target_quality:.2,meeting_execution:.2,pipeline_influence_index:.3,engagement_breadth:.05,cost_efficiency:.1,followup_execution:.1,net_new_engaged:.05},
    pipeline_acceleration:{icp_target_quality:.25,meeting_execution:.2,pipeline_influence_index:.3,engagement_breadth:.05,cost_efficiency:.05,followup_execution:.15,net_new_engaged:0},
    customer_retention:{icp_target_quality:.25,meeting_execution:.2,pipeline_influence_index:.1,engagement_breadth:.15,cost_efficiency:.05,followup_execution:.2,net_new_engaged:.05},
    market_presence:{icp_target_quality:.25,meeting_execution:.1,pipeline_influence_index:.05,engagement_breadth:.25,cost_efficiency:.05,followup_execution:.1,net_new_engaged:.2},
    strategic_account_relationship_building:{icp_target_quality:.3,meeting_execution:.2,pipeline_influence_index:.2,engagement_breadth:.05,cost_efficiency:.05,followup_execution:.15,net_new_engaged:.05},
    partner_ecosystem_development:{icp_target_quality:.2,meeting_execution:.15,pipeline_influence_index:.15,engagement_breadth:.2,cost_efficiency:.05,followup_execution:.15,net_new_engaged:.1},
    competitive_defense:{icp_target_quality:.25,meeting_execution:.15,pipeline_influence_index:.1,engagement_breadth:.2,cost_efficiency:.05,followup_execution:.2,net_new_engaged:.05},
    thought_leadership:{icp_target_quality:.25,meeting_execution:.1,pipeline_influence_index:.05,engagement_breadth:.25,cost_efficiency:.05,followup_execution:.1,net_new_engaged:.2},
  },
  sales_effectiveness: {
    pipeline_generation:{meeting_execution:.25,followup_execution:.2,pipeline_influence_execution:.25,target_account_execution:.15,rep_productivity:.15},
    pipeline_acceleration:{meeting_execution:.25,followup_execution:.25,pipeline_influence_execution:.25,target_account_execution:.2,rep_productivity:.05},
    customer_retention:{meeting_execution:.25,followup_execution:.3,pipeline_influence_execution:.1,target_account_execution:.2,rep_productivity:.15},
    market_presence:{meeting_execution:.15,followup_execution:.2,pipeline_influence_execution:.1,target_account_execution:.2,rep_productivity:.35},
    strategic_account_relationship_building:{meeting_execution:.25,followup_execution:.25,pipeline_influence_execution:.15,target_account_execution:.25,rep_productivity:.1},
    partner_ecosystem_development:{meeting_execution:.2,followup_execution:.25,pipeline_influence_execution:.15,target_account_execution:.15,rep_productivity:.25},
    competitive_defense:{meeting_execution:.2,followup_execution:.3,pipeline_influence_execution:.1,target_account_execution:.25,rep_productivity:.15},
    thought_leadership:{meeting_execution:.15,followup_execution:.2,pipeline_influence_execution:.1,target_account_execution:.15,rep_productivity:.4},
  },
  marketing_audience_signal: {
    pipeline_generation:{icp_target_quality:.3,buyer_role_access:.25,net_new_market_reach:.2,engagement_depth:.15,message_resonance_proxy:.1},
    pipeline_acceleration:{icp_target_quality:.35,buyer_role_access:.3,net_new_market_reach:.05,engagement_depth:.15,message_resonance_proxy:.15},
    customer_retention:{icp_target_quality:.25,buyer_role_access:.3,net_new_market_reach:.05,engagement_depth:.25,message_resonance_proxy:.15},
    market_presence:{icp_target_quality:.25,buyer_role_access:.15,net_new_market_reach:.3,engagement_depth:.2,message_resonance_proxy:.1},
    strategic_account_relationship_building:{icp_target_quality:.35,buyer_role_access:.3,net_new_market_reach:.05,engagement_depth:.2,message_resonance_proxy:.1},
    partner_ecosystem_development:{icp_target_quality:.2,buyer_role_access:.25,net_new_market_reach:.2,engagement_depth:.2,message_resonance_proxy:.15},
    competitive_defense:{icp_target_quality:.3,buyer_role_access:.25,net_new_market_reach:.05,engagement_depth:.25,message_resonance_proxy:.15},
    thought_leadership:{icp_target_quality:.25,buyer_role_access:.15,net_new_market_reach:.3,engagement_depth:.2,message_resonance_proxy:.1},
  },
  cost_efficiency: {
    pipeline_generation:{pipeline_influence_per_1k:.5,cost_per_company_engaged:.3,cost_per_meeting_held:.2}, pipeline_acceleration:{pipeline_influence_per_1k:.55,cost_per_company_engaged:.25,cost_per_meeting_held:.2}, customer_retention:{pipeline_influence_per_1k:.25,cost_per_company_engaged:.45,cost_per_meeting_held:.3}, market_presence:{pipeline_influence_per_1k:.2,cost_per_company_engaged:.55,cost_per_meeting_held:.25}, strategic_account_relationship_building:{pipeline_influence_per_1k:.35,cost_per_company_engaged:.35,cost_per_meeting_held:.3}, partner_ecosystem_development:{pipeline_influence_per_1k:.3,cost_per_company_engaged:.45,cost_per_meeting_held:.25}, competitive_defense:{pipeline_influence_per_1k:.25,cost_per_company_engaged:.5,cost_per_meeting_held:.25}, thought_leadership:{pipeline_influence_per_1k:.2,cost_per_company_engaged:.55,cost_per_meeting_held:.25},
  }
};

export function resolveStrategyKey(rawKey: string | null | undefined): StrategyKey {
  const k = String(rawKey ?? '').trim().toLowerCase() as StrategyKey;
  return (Object.keys(STRATEGY_PRESETS.conference_effectiveness) as StrategyKey[]).includes(k) ? k : DEFAULT_STRATEGY_KEY;
}

export function getPreset(group: ScoreGroup, key: string | null | undefined): Weights {
  return STRATEGY_PRESETS[group][resolveStrategyKey(key)];
}
