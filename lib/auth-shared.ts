// Client-safe auth constants and types.
// Import from here (not lib/auth) in client components and 'use client' files.
// lib/auth.ts re-exports everything here for server-side backward compat.

export type UserRole = 'user' | 'administrator' | 'sales_rep' | 'manager' | 'analyst' | 'conference_coordinator' | 'stakeholder';

export const ALL_ROLES: UserRole[] = ['sales_rep', 'manager', 'analyst', 'conference_coordinator', 'user', 'administrator', 'stakeholder'];
export const VALID_ROLES = new Set<string>(ALL_ROLES);

export const ROLE_DISPLAY_LABELS: Record<string, string> = {
  sales_rep: 'Sales Rep',
  manager: 'Manager',
  analyst: 'Analyst',
  conference_coordinator: 'Coordinator',
  user: 'User',
  administrator: 'Administrator',
  stakeholder: 'Stakeholder',
};

export type CapabilityKey =
  | 'view_data'
  | 'create_activity'
  | 'view_rep_metrics'
  | 'view_effectiveness'
  | 'view_financials'
  | 'view_pre_post_conference'
  | 'crm_export'
  | 'manage_conference_data'
  | 'delete_merge'
  | 'manage_system_config'
  | 'manage_users'
  | 'manage_role_scope'
  | 'view_calendar_intelligence'
  | 'use_calendar_tools';

export type RoleCapabilityMap = Record<CapabilityKey, boolean>;
export type RoleCapabilities = Record<UserRole, RoleCapabilityMap>;

export const CAPABILITY_LABELS: Record<CapabilityKey, string> = {
  view_data: 'View conferences, companies & attendees',
  create_activity: 'Create notes, meetings & follow-ups',
  view_rep_metrics: 'View rep activity metrics',
  view_effectiveness: 'Conference Effectiveness (non-financial tabs)',
  view_financials: 'Budget, cost efficiency & ROI data',
  view_pre_post_conference: 'Pre/Post-Conference Review',
  crm_export: 'Export CRM import files',
  manage_conference_data: 'Upload attendees, edit agendas & forms',
  delete_merge: 'Delete or merge companies & attendees',
  manage_system_config: 'ICP rules, scoring config & branding',
  manage_users: 'User management & invitations',
  manage_role_scope: 'Role Scope',
  view_calendar_intelligence: 'View Calendar Intelligence',
  use_calendar_tools: 'Use Path to Tier & Strategic Lens tools',
};

export const LOCKED_ADMIN_CAPS: CapabilityKey[] = [
  'manage_system_config', 'manage_users', 'manage_role_scope',
];

export const DEFAULT_ROLE_CAPABILITIES: RoleCapabilities = {
  sales_rep:              { view_data: true,  create_activity: true,  view_rep_metrics: true,  view_effectiveness: false, view_financials: false, view_pre_post_conference: false, crm_export: false, manage_conference_data: false, delete_merge: false, manage_system_config: false, manage_users: false, manage_role_scope: false, view_calendar_intelligence: true,  use_calendar_tools: false },
  manager:                { view_data: true,  create_activity: true,  view_rep_metrics: true,  view_effectiveness: true,  view_financials: false, view_pre_post_conference: true,  crm_export: true,  manage_conference_data: false, delete_merge: false, manage_system_config: false, manage_users: false, manage_role_scope: false, view_calendar_intelligence: true,  use_calendar_tools: true  },
  analyst:                { view_data: true,  create_activity: false, view_rep_metrics: true,  view_effectiveness: true,  view_financials: true,  view_pre_post_conference: true,  crm_export: true,  manage_conference_data: false, delete_merge: false, manage_system_config: false, manage_users: false, manage_role_scope: false, view_calendar_intelligence: true,  use_calendar_tools: true  },
  conference_coordinator: { view_data: true,  create_activity: false, view_rep_metrics: false, view_effectiveness: false, view_financials: false, view_pre_post_conference: false, crm_export: true,  manage_conference_data: true,  delete_merge: true,  manage_system_config: false, manage_users: false, manage_role_scope: false, view_calendar_intelligence: true,  use_calendar_tools: false },
  user:                   { view_data: true,  create_activity: true,  view_rep_metrics: true,  view_effectiveness: true,  view_financials: true,  view_pre_post_conference: true,  crm_export: false, manage_conference_data: true,  delete_merge: true,  manage_system_config: false, manage_users: false, manage_role_scope: false, view_calendar_intelligence: true,  use_calendar_tools: true  },
  administrator:          { view_data: true,  create_activity: true,  view_rep_metrics: true,  view_effectiveness: true,  view_financials: true,  view_pre_post_conference: true,  crm_export: true,  manage_conference_data: true,  delete_merge: true,  manage_system_config: true,  manage_users: true,  manage_role_scope: true,  view_calendar_intelligence: true,  use_calendar_tools: true  },
  stakeholder:            { view_data: false, create_activity: false, view_rep_metrics: false, view_effectiveness: false, view_financials: false, view_pre_post_conference: false, crm_export: false, manage_conference_data: false, delete_merge: false, manage_system_config: false, manage_users: false, manage_role_scope: false, view_calendar_intelligence: true,  use_calendar_tools: false },
};

export function resolveCapabilities(role: UserRole, stored: Partial<RoleCapabilities>): RoleCapabilityMap {
  if (role === 'administrator') return DEFAULT_ROLE_CAPABILITIES['administrator'];
  const defaults = DEFAULT_ROLE_CAPABILITIES[role] ?? DEFAULT_ROLE_CAPABILITIES['user'];
  const overrides = (stored[role] ?? {}) as Partial<RoleCapabilityMap>;
  const merged = { ...defaults, ...overrides };
  LOCKED_ADMIN_CAPS.forEach(k => { merged[k] = false; });
  return merged;
}

export interface SessionUser {
  id: number;
  email: string;
  role: UserRole;
  emailVerified: boolean;
  accountId?: string;
}
