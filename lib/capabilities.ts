export type PlanId = 'trial' | 'essentials' | 'professional' | 'enterprise' | 'custom' | 'read_only' | 'expired';

export interface PlanCapabilities {
  core: {
    csv_import: boolean;
    pre_post_conference_review: boolean;
    meetings_tracking: boolean;
    followup_tracking: boolean;
    social_event_management: boolean;
    touchpoint_logging: boolean;
    standard_notes: boolean;
    conference_agenda: boolean;
    my_agenda: boolean;
    notifications_all_types: boolean;
    admin_configuration_panel: boolean;
    user_management: boolean;
  };
  intelligence_core: {
    icp_rules_engine: boolean;
    target_priority_scoring: boolean;
    prospect_recommendations: boolean;
    internal_relationship_mapping: boolean;
  };
  floor_capture: {
    ai_card_scanning: boolean;
    ai_batch_card_scanning: boolean;
    floor_notes: boolean;
    auto_followup_triggers: boolean;
  };
  team_collaboration: {
    direct_messaging: boolean;
    group_messaging: boolean;
    rich_notes_mentions: boolean;
    rich_notes_comments: boolean;
    rich_notes_reactions: boolean;
  };
  revenue: {
    email_integration_google: boolean;
    email_integration_microsoft: boolean;
    crm_export: boolean;
  };
  revenue_intelligence: {
    effectiveness_analytics: boolean;
    effectiveness_tab_summary: boolean;
    effectiveness_tab_sales_execution: boolean;
    effectiveness_tab_audience_messaging: boolean;
    effectiveness_tab_cost_efficiency: boolean;
    effectiveness_tab_definitions: boolean;
    budget_tracking: boolean;
    roi_modeling: boolean;
    effectiveness_benchmarks: boolean;
  };
  program_intelligence: {
    global_reporting: boolean;
    cross_conference_trends: boolean;
    configurable_benchmarks: boolean;
  };
  org_infrastructure: {
    brand_customization: boolean;
    white_label: boolean;
    form_builder: boolean;
    lead_capture: boolean;
    role_scope_matrix: boolean;
  };
  custom_only: {
    native_crm_integration: boolean;
    multi_team_architecture: boolean;
    multi_org_architecture: boolean;
    api_access: boolean;
    custom_sla: boolean;
    custom_data_migration: boolean;
    dedicated_onboarding: boolean;
  };
}

// Check a dot-notation capability path: "intelligence_core.icp_rules_engine"
export function hasCapability(caps: PlanCapabilities, path: string): boolean {
  const dot = path.indexOf('.');
  if (dot === -1) return false;
  const bundle = path.slice(0, dot) as keyof PlanCapabilities;
  const flag = path.slice(dot + 1);
  const group = caps[bundle] as Record<string, boolean> | undefined;
  return group?.[flag] === true;
}

// Enforce bundle dependencies for custom plan provisioning
export function enforceBundleDependencies(caps: PlanCapabilities): PlanCapabilities {
  const c = structuredClone(caps);
  if (c.program_intelligence.global_reporting || c.program_intelligence.cross_conference_trends) {
    c.revenue_intelligence.effectiveness_analytics = true;
    c.revenue_intelligence.budget_tracking = true;
  }
  return c;
}

const CORE_ALL_TRUE = {
  csv_import: true, pre_post_conference_review: true, meetings_tracking: true,
  followup_tracking: true, social_event_management: true, touchpoint_logging: true,
  standard_notes: true, conference_agenda: true, my_agenda: true,
  notifications_all_types: true, admin_configuration_panel: true, user_management: true,
};
const CORE_ALL_FALSE = {
  csv_import: false, pre_post_conference_review: false, meetings_tracking: false,
  followup_tracking: false, social_event_management: false, touchpoint_logging: false,
  standard_notes: false, conference_agenda: false, my_agenda: false,
  notifications_all_types: false, admin_configuration_panel: false, user_management: false,
};
const INTEL_ALL_TRUE = { icp_rules_engine: true, target_priority_scoring: true, prospect_recommendations: true, internal_relationship_mapping: true };
const INTEL_ALL_FALSE = { icp_rules_engine: false, target_priority_scoring: false, prospect_recommendations: false, internal_relationship_mapping: false };
const FLOOR_ALL_TRUE = { ai_card_scanning: true, ai_batch_card_scanning: true, floor_notes: true, auto_followup_triggers: true };
const FLOOR_ALL_FALSE = { ai_card_scanning: false, ai_batch_card_scanning: false, floor_notes: false, auto_followup_triggers: false };
const COLLAB_ALL_TRUE = { direct_messaging: true, group_messaging: true, rich_notes_mentions: true, rich_notes_comments: true, rich_notes_reactions: true };
const COLLAB_ALL_FALSE = { direct_messaging: false, group_messaging: false, rich_notes_mentions: false, rich_notes_comments: false, rich_notes_reactions: false };
const REVENUE_ALL_TRUE = { email_integration_google: true, email_integration_microsoft: true, crm_export: true };
const REVENUE_ALL_FALSE = { email_integration_google: false, email_integration_microsoft: false, crm_export: false };
const REV_INTEL_ALL_TRUE = {
  effectiveness_analytics: true, effectiveness_tab_summary: true, effectiveness_tab_sales_execution: true,
  effectiveness_tab_audience_messaging: true, effectiveness_tab_cost_efficiency: true,
  effectiveness_tab_definitions: true, budget_tracking: true, roi_modeling: true, effectiveness_benchmarks: true,
};
const REV_INTEL_ALL_FALSE = {
  effectiveness_analytics: false, effectiveness_tab_summary: false, effectiveness_tab_sales_execution: false,
  effectiveness_tab_audience_messaging: false, effectiveness_tab_cost_efficiency: false,
  effectiveness_tab_definitions: false, budget_tracking: false, roi_modeling: false, effectiveness_benchmarks: false,
};
const PROG_INTEL_ALL_TRUE = { global_reporting: true, cross_conference_trends: true, configurable_benchmarks: true };
const PROG_INTEL_ALL_FALSE = { global_reporting: false, cross_conference_trends: false, configurable_benchmarks: false };
const ORG_ALL_TRUE = { brand_customization: true, white_label: true, form_builder: true, lead_capture: true, role_scope_matrix: true };
const ORG_ALL_FALSE = { brand_customization: false, white_label: false, form_builder: false, lead_capture: false, role_scope_matrix: false };
const CUSTOM_ONLY_ALL_TRUE = { native_crm_integration: true, multi_team_architecture: true, multi_org_architecture: true, api_access: true, custom_sla: true, custom_data_migration: true, dedicated_onboarding: true };
const CUSTOM_ONLY_ALL_FALSE = { native_crm_integration: false, multi_team_architecture: false, multi_org_architecture: false, api_access: false, custom_sla: false, custom_data_migration: false, dedicated_onboarding: false };

// Builds a capability map for a custom bundle plan.
// Starts with Essentials as the base and layers on each bundle's capabilities.
export function buildCustomPlanCapabilities(
  purchasedBundles: string[]
): PlanCapabilities {
  const resolvedBundles = new Set(purchasedBundles);

  // Enforce dependencies: program_intelligence requires revenue_intelligence
  if (resolvedBundles.has('program_intelligence')) {
    resolvedBundles.add('revenue_intelligence');
  }

  const capabilities = structuredClone(PLAN_CAPABILITIES.essentials);

  for (const bundle of Array.from(resolvedBundles)) {
    switch (bundle) {
      case 'intelligence_core':
        capabilities.intelligence_core.icp_rules_engine = true;
        capabilities.intelligence_core.target_priority_scoring = true;
        capabilities.intelligence_core.prospect_recommendations = true;
        capabilities.intelligence_core.internal_relationship_mapping = true;
        break;
      case 'floor_capture':
        capabilities.floor_capture.ai_card_scanning = true;
        capabilities.floor_capture.ai_batch_card_scanning = true;
        capabilities.floor_capture.floor_notes = true;
        capabilities.floor_capture.auto_followup_triggers = true;
        break;
      case 'team_collaboration':
        capabilities.team_collaboration.direct_messaging = true;
        capabilities.team_collaboration.group_messaging = true;
        capabilities.team_collaboration.rich_notes_mentions = true;
        capabilities.team_collaboration.rich_notes_comments = true;
        capabilities.team_collaboration.rich_notes_reactions = true;
        break;
      case 'revenue_intelligence':
        capabilities.revenue_intelligence.effectiveness_analytics = true;
        capabilities.revenue_intelligence.effectiveness_tab_summary = true;
        capabilities.revenue_intelligence.effectiveness_tab_sales_execution = true;
        capabilities.revenue_intelligence.effectiveness_tab_audience_messaging = true;
        capabilities.revenue_intelligence.effectiveness_tab_cost_efficiency = true;
        capabilities.revenue_intelligence.effectiveness_tab_definitions = true;
        capabilities.revenue_intelligence.budget_tracking = true;
        capabilities.revenue_intelligence.roi_modeling = true;
        capabilities.revenue_intelligence.effectiveness_benchmarks = true;
        capabilities.revenue.crm_export = true;
        capabilities.revenue.email_integration_google = true;
        capabilities.revenue.email_integration_microsoft = true;
        break;
      case 'program_intelligence':
        capabilities.program_intelligence.global_reporting = true;
        capabilities.program_intelligence.cross_conference_trends = true;
        capabilities.program_intelligence.configurable_benchmarks = true;
        break;
      case 'org_infrastructure':
        capabilities.org_infrastructure.brand_customization = true;
        capabilities.org_infrastructure.white_label = true;
        capabilities.org_infrastructure.form_builder = true;
        capabilities.org_infrastructure.lead_capture = true;
        capabilities.org_infrastructure.role_scope_matrix = true;
        break;
      case 'crm_export':
        capabilities.revenue.crm_export = true;
        break;
    }
  }

  return capabilities;
}

export const PLAN_CAPABILITIES: Record<PlanId, PlanCapabilities> = {
  trial: {
    core: CORE_ALL_TRUE,
    intelligence_core: INTEL_ALL_TRUE,
    floor_capture: FLOOR_ALL_TRUE,
    team_collaboration: COLLAB_ALL_TRUE,
    revenue: REVENUE_ALL_TRUE,
    revenue_intelligence: REV_INTEL_ALL_TRUE,
    program_intelligence: PROG_INTEL_ALL_TRUE,
    org_infrastructure: ORG_ALL_TRUE,
    custom_only: CUSTOM_ONLY_ALL_FALSE,
  },
  essentials: {
    core: CORE_ALL_TRUE,
    intelligence_core: INTEL_ALL_FALSE,
    floor_capture: FLOOR_ALL_FALSE,
    team_collaboration: COLLAB_ALL_FALSE,
    revenue: REVENUE_ALL_FALSE,
    revenue_intelligence: REV_INTEL_ALL_FALSE,
    program_intelligence: PROG_INTEL_ALL_FALSE,
    org_infrastructure: ORG_ALL_FALSE,
    custom_only: CUSTOM_ONLY_ALL_FALSE,
  },
  professional: {
    core: CORE_ALL_TRUE,
    intelligence_core: INTEL_ALL_TRUE,
    floor_capture: FLOOR_ALL_TRUE,
    team_collaboration: COLLAB_ALL_TRUE,
    revenue: REVENUE_ALL_TRUE,
    revenue_intelligence: REV_INTEL_ALL_TRUE,
    program_intelligence: PROG_INTEL_ALL_FALSE,
    org_infrastructure: ORG_ALL_FALSE,
    custom_only: CUSTOM_ONLY_ALL_FALSE,
  },
  enterprise: {
    core: CORE_ALL_TRUE,
    intelligence_core: INTEL_ALL_TRUE,
    floor_capture: FLOOR_ALL_TRUE,
    team_collaboration: COLLAB_ALL_TRUE,
    revenue: REVENUE_ALL_TRUE,
    revenue_intelligence: REV_INTEL_ALL_TRUE,
    program_intelligence: PROG_INTEL_ALL_TRUE,
    org_infrastructure: ORG_ALL_TRUE,
    custom_only: CUSTOM_ONLY_ALL_FALSE,
  },
  custom: {
    // Maximum possible set — actual caps for custom accounts are stored in site_settings.plan_capabilities
    core: CORE_ALL_TRUE,
    intelligence_core: INTEL_ALL_TRUE,
    floor_capture: FLOOR_ALL_TRUE,
    team_collaboration: COLLAB_ALL_TRUE,
    revenue: REVENUE_ALL_TRUE,
    revenue_intelligence: REV_INTEL_ALL_TRUE,
    program_intelligence: PROG_INTEL_ALL_TRUE,
    org_infrastructure: ORG_ALL_TRUE,
    custom_only: CUSTOM_ONLY_ALL_TRUE,
  },
  read_only: {
    // Grace period — view existing data only, no writes
    core: {
      csv_import: false, pre_post_conference_review: true, meetings_tracking: false,
      followup_tracking: false, social_event_management: false, touchpoint_logging: false,
      standard_notes: false, conference_agenda: true, my_agenda: true,
      notifications_all_types: true, admin_configuration_panel: false, user_management: false,
    },
    intelligence_core: INTEL_ALL_FALSE,
    floor_capture: FLOOR_ALL_FALSE,
    team_collaboration: COLLAB_ALL_FALSE,
    revenue: REVENUE_ALL_FALSE,
    revenue_intelligence: {
      effectiveness_analytics: true, effectiveness_tab_summary: true,
      effectiveness_tab_sales_execution: true, effectiveness_tab_audience_messaging: true,
      effectiveness_tab_cost_efficiency: true, effectiveness_tab_definitions: true,
      budget_tracking: false, roi_modeling: false, effectiveness_benchmarks: false,
    },
    program_intelligence: PROG_INTEL_ALL_FALSE,
    org_infrastructure: ORG_ALL_FALSE,
    custom_only: CUSTOM_ONLY_ALL_FALSE,
  },
  expired: {
    core: CORE_ALL_FALSE,
    intelligence_core: INTEL_ALL_FALSE,
    floor_capture: FLOOR_ALL_FALSE,
    team_collaboration: COLLAB_ALL_FALSE,
    revenue: REVENUE_ALL_FALSE,
    revenue_intelligence: REV_INTEL_ALL_FALSE,
    program_intelligence: PROG_INTEL_ALL_FALSE,
    org_infrastructure: ORG_ALL_FALSE,
    custom_only: CUSTOM_ONLY_ALL_FALSE,
  },
};
