export type CheckoutPlanId = 'essentials' | 'professional' | 'enterprise' | 'custom';
export type BillingInterval = 'monthly' | 'annual';
export type BundleId =
  | 'intelligence_core'
  | 'floor_capture'
  | 'team_collaboration'
  | 'revenue_intelligence'
  | 'program_intelligence'
  | 'org_infrastructure'
  | 'crm_export';

export const QA_TEST_EMAIL = 'admin@procarecfhub.com';

// Standard tier Price IDs
export const STRIPE_TIER_PRICES: Record<
  Exclude<CheckoutPlanId, 'custom'>,
  Record<BillingInterval, string>
> = {
  essentials: {
    monthly: process.env.STRIPE_PRICE_ESSENTIALS_MONTHLY!,
    annual: process.env.STRIPE_PRICE_ESSENTIALS_ANNUAL!,
  },
  professional: {
    monthly: process.env.STRIPE_PRICE_PROFESSIONAL_MONTHLY!,
    annual: process.env.STRIPE_PRICE_PROFESSIONAL_ANNUAL!,
  },
  enterprise: {
    monthly: process.env.STRIPE_PRICE_ENTERPRISE_MONTHLY!,
    annual: process.env.STRIPE_PRICE_ENTERPRISE_ANNUAL!,
  },
};

// Bundle Price IDs
export const STRIPE_BUNDLE_PRICES: Record<
  BundleId,
  Record<BillingInterval, string>
> = {
  intelligence_core: {
    monthly: process.env.STRIPE_PRICE_INTELLIGENCE_CORE_MONTHLY!,
    annual: process.env.STRIPE_PRICE_INTELLIGENCE_CORE_ANNUAL!,
  },
  floor_capture: {
    monthly: process.env.STRIPE_PRICE_FLOOR_CAPTURE_MONTHLY!,
    annual: process.env.STRIPE_PRICE_FLOOR_CAPTURE_ANNUAL!,
  },
  team_collaboration: {
    monthly: process.env.STRIPE_PRICE_TEAM_COLLABORATION_MONTHLY!,
    annual: process.env.STRIPE_PRICE_TEAM_COLLABORATION_ANNUAL!,
  },
  revenue_intelligence: {
    monthly: process.env.STRIPE_PRICE_REVENUE_INTELLIGENCE_MONTHLY!,
    annual: process.env.STRIPE_PRICE_REVENUE_INTELLIGENCE_ANNUAL!,
  },
  program_intelligence: {
    monthly: process.env.STRIPE_PRICE_PROGRAM_INTELLIGENCE_MONTHLY!,
    annual: process.env.STRIPE_PRICE_PROGRAM_INTELLIGENCE_ANNUAL!,
  },
  org_infrastructure: {
    monthly: process.env.STRIPE_PRICE_ORG_INFRASTRUCTURE_MONTHLY!,
    annual: process.env.STRIPE_PRICE_ORG_INFRASTRUCTURE_ANNUAL!,
  },
  crm_export: {
    monthly: process.env.STRIPE_PRICE_CRM_EXPORT_MONTHLY!,
    annual: process.env.STRIPE_PRICE_CRM_EXPORT_ANNUAL!,
  },
};

// Maps a Price ID back to its bundle ID — used in webhook handler
export const PRICE_ID_TO_BUNDLE: Record<string, BundleId> = {
  [process.env.STRIPE_PRICE_INTELLIGENCE_CORE_MONTHLY!]: 'intelligence_core',
  [process.env.STRIPE_PRICE_INTELLIGENCE_CORE_ANNUAL!]: 'intelligence_core',
  [process.env.STRIPE_PRICE_FLOOR_CAPTURE_MONTHLY!]: 'floor_capture',
  [process.env.STRIPE_PRICE_FLOOR_CAPTURE_ANNUAL!]: 'floor_capture',
  [process.env.STRIPE_PRICE_TEAM_COLLABORATION_MONTHLY!]: 'team_collaboration',
  [process.env.STRIPE_PRICE_TEAM_COLLABORATION_ANNUAL!]: 'team_collaboration',
  [process.env.STRIPE_PRICE_REVENUE_INTELLIGENCE_MONTHLY!]: 'revenue_intelligence',
  [process.env.STRIPE_PRICE_REVENUE_INTELLIGENCE_ANNUAL!]: 'revenue_intelligence',
  [process.env.STRIPE_PRICE_PROGRAM_INTELLIGENCE_MONTHLY!]: 'program_intelligence',
  [process.env.STRIPE_PRICE_PROGRAM_INTELLIGENCE_ANNUAL!]: 'program_intelligence',
  [process.env.STRIPE_PRICE_ORG_INFRASTRUCTURE_MONTHLY!]: 'org_infrastructure',
  [process.env.STRIPE_PRICE_ORG_INFRASTRUCTURE_ANNUAL!]: 'org_infrastructure',
  [process.env.STRIPE_PRICE_CRM_EXPORT_MONTHLY!]: 'crm_export',
  [process.env.STRIPE_PRICE_CRM_EXPORT_ANNUAL!]: 'crm_export',
};

// Maps a Price ID back to its standard tier plan ID
export const PRICE_ID_TO_PLAN: Record<string, Exclude<CheckoutPlanId, 'custom'>> = {
  [process.env.STRIPE_PRICE_ESSENTIALS_MONTHLY!]: 'essentials',
  [process.env.STRIPE_PRICE_ESSENTIALS_ANNUAL!]: 'essentials',
  [process.env.STRIPE_PRICE_PROFESSIONAL_MONTHLY!]: 'professional',
  [process.env.STRIPE_PRICE_PROFESSIONAL_ANNUAL!]: 'professional',
  [process.env.STRIPE_PRICE_ENTERPRISE_MONTHLY!]: 'enterprise',
  [process.env.STRIPE_PRICE_ENTERPRISE_ANNUAL!]: 'enterprise',
};

// Key bundle requires the listed bundles to also be active
export const BUNDLE_DEPENDENCIES: Partial<Record<BundleId, BundleId[]>> = {
  program_intelligence: ['revenue_intelligence'],
};
