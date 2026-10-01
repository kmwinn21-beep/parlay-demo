// Types and metadata for upload column mapping — no server-only deps so this
// file is safe to import from both client and server components.

export type SystemFieldKey =
  | 'first_name' | 'last_name' | 'full_name' | 'title' | 'company'
  | 'email' | 'website' | 'company_type' | 'assigned_user' | 'state' | 'wse'
  | 'services' | 'icp' | 'industry' | 'function' | 'product' | 'consent'
  | 'crm_link' | 'crm_contact_link' | 'linkedin_url'
  | 'phone' | 'hubspot_contact_id' | 'hubspot_company_id' | 'event_code';

export interface ColumnMapping {
  first_name: string | null;
  last_name: string | null;
  full_name: string | null;
  title: string | null;
  company: string | null;
  email: string | null;
  linkedin_url: string | null;
  website: string | null;
  company_type: string | null;
  assigned_user: string | null;
  state: string | null;
  wse: string | null;
  services: string | null;
  icp: string | null;
  industry: string | null;
  function: string | null;
  product: string | null;
  consent: string | null;
  crm_link: string | null;
  crm_contact_link: string | null;
  phone: string | null;
  /**
   * HubSpot's own record ids, the pairing key for the bridge.
   *
   * Distinct from crm_contact_link / crm_link, which hold a link to whatever
   * CRM a tenant uses. These are ids, and they are what an export pairs on.
   */
  hubspot_contact_id: string | null;
  hubspot_company_id: string | null;
  /**
   * The conference's event code, carried on every row of the file in.
   *
   * A conference-level fact arriving per person, because that is the shape
   * HubSpot exports. The upload reads it off the rows and stores it once.
   */
  event_code: string | null;
  /**
   * Company-only list: the file has no people in it. The parser stands in a
   * placeholder attendee per company so the company registers as present.
   */
  company_only?: boolean;
}

export interface SystemFieldMeta {
  label: string;
  description: string;
  required?: boolean;
}

export const SYSTEM_FIELD_LABELS: Record<SystemFieldKey, SystemFieldMeta> = {
  first_name:    { label: 'First Name',          description: 'Attendee first name',                          required: true },
  last_name:     { label: 'Last Name',           description: 'Attendee last name',                           required: true },
  full_name:     { label: 'Full Name',           description: 'Single column with the full name (first + last)' },
  title:         { label: 'Job Title',           description: 'Attendee job title or role' },
  company:       { label: 'Company',             description: 'Company or organization name' },
  email:         { label: 'Email',               description: 'Work email address' },
  linkedin_url:  { label: 'LinkedIn URL',        description: "Link to the attendee's LinkedIn profile" },
  website:       { label: 'Website',             description: 'Company website URL' },
  company_type:  { label: 'Company Type',        description: 'e.g. Operator, Vendor, Capital' },
  assigned_user: { label: 'Assigned Rep',        description: 'Sales rep assigned to this company — matched by name' },
  state:         { label: 'HQ State',            description: "Company headquarters state — used to assign a rep by territory when no rep is otherwise matched" },
  wse:           { label: 'Employee Count (WSE)', description: 'Number of worksite employees' },
  services:      { label: 'Services',            description: 'Care types: AL, MC, IL, SNF, CCRC' },
  icp:           { label: 'ICP',                 description: 'Ideal Customer Profile — Yes / No' },
  industry:      { label: 'Industry',            description: 'Company industry vertical (e.g. Healthcare, Technology)' },
  function:      { label: 'Function',            description: 'Attendee department/function (e.g. Finance, Operations)' },
  product:       { label: 'Product',             description: 'Product(s) associated with this contact (comma-separated)' },
  consent:       { label: 'Consent',             description: 'Opt-in / Opt-out / Consent Not Recorded' },
  crm_link:      { label: 'CRM Link',            description: 'Link to the company record in your CRM' },
  crm_contact_link: { label: 'CRM Contact Link', description: "Link to the attendee's contact record in your CRM" },
  phone:         { label: 'Phone',               description: "Attendee phone number — mobile where there is one" },
  hubspot_contact_id: { label: 'HubSpot Contact ID', description: "The contact's HubSpot record id, or a link to it" },
  hubspot_company_id: { label: 'HubSpot Company ID', description: "The company's HubSpot record id, or a link to it" },
  event_code:    { label: 'Event Code',          description: 'The conference code shared with HubSpot, e.g. NIC Fall - 202610 - US' },
};

export const FIELD_ORDER: SystemFieldKey[] = [
  'first_name', 'last_name', 'full_name', 'title', 'company',
  'email', 'linkedin_url', 'website', 'company_type', 'assigned_user', 'state', 'wse', 'services', 'icp',
  'industry', 'function', 'product', 'consent', 'phone', 'crm_link', 'crm_contact_link',
  'hubspot_contact_id', 'hubspot_company_id', 'event_code',
];
