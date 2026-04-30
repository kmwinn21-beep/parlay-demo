// Types and metadata for upload column mapping — no server-only deps so this
// file is safe to import from both client and server components.

export type SystemFieldKey =
  | 'first_name' | 'last_name' | 'full_name' | 'title' | 'company'
  | 'email' | 'website' | 'company_type' | 'assigned_user' | 'wse'
  | 'services' | 'icp' | 'function' | 'product';

export interface ColumnMapping {
  first_name: string | null;
  last_name: string | null;
  full_name: string | null;
  title: string | null;
  company: string | null;
  email: string | null;
  website: string | null;
  company_type: string | null;
  assigned_user: string | null;
  wse: string | null;
  services: string | null;
  icp: string | null;
  function: string | null;
  product: string | null;
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
  website:       { label: 'Website',             description: 'Company website URL' },
  company_type:  { label: 'Company Type',        description: 'e.g. Operator, Vendor, Capital' },
  assigned_user: { label: 'Assigned Rep',        description: 'Sales rep assigned to this company — matched by name' },
  wse:           { label: 'Employee Count (WSE)', description: 'Number of worksite employees' },
  services:      { label: 'Services',            description: 'Care types: AL, MC, IL, SNF, CCRC' },
  icp:           { label: 'ICP',                 description: 'Ideal Customer Profile — Yes / No' },
  function:      { label: 'Function',            description: 'Attendee department/function (e.g. Finance, Operations)' },
  product:       { label: 'Product',             description: 'Product(s) associated with this contact (comma-separated)' },
};

export const FIELD_ORDER: SystemFieldKey[] = [
  'first_name', 'last_name', 'full_name', 'title', 'company',
  'email', 'website', 'company_type', 'assigned_user', 'wse', 'services', 'icp',
  'function', 'product',
];
