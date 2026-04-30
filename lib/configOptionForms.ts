export interface FormChoice {
  key: string;
  label: string;
}

export const CATEGORY_FORM_USAGE: Record<string, FormChoice[]> = {
  company_type: [
    { key: 'attendee_table', label: 'Attendee Table' },
    { key: 'company_table', label: 'Company Table' },
    { key: 'company_detail', label: 'Company Detail' },
    { key: 'conference_detail', label: 'Conference Details' },
    { key: 'relationships_page', label: 'Relationships Page' },
  ],
  status: [
    { key: 'attendee_table', label: 'Attendee Table' },
    { key: 'company_table', label: 'Company Table' },
    { key: 'attendee_detail', label: 'Attendee Detail' },
    { key: 'company_detail', label: 'Company Detail' },
    { key: 'conference_detail', label: 'Conference Details' },
  ],
  seniority: [
    { key: 'attendee_table', label: 'Attendee Table' },
    { key: 'attendee_detail', label: 'Attendee Detail' },
    { key: 'conference_detail', label: 'Conference Details' },
  ],
  action: [
    { key: 'attendee_detail', label: 'Attendee Detail' },
    { key: 'company_detail', label: 'Company Detail' },
    { key: 'conference_detail', label: 'Conference Details' },
    { key: 'follow_ups_page', label: 'Follow Ups Page' },
  ],
  next_steps: [
    { key: 'attendee_detail', label: 'Attendee Detail' },
    { key: 'conference_detail', label: 'Conference Details' },
    { key: 'follow_ups_page', label: 'Follow Ups Page' },
  ],
  event_type: [
    { key: 'conference_detail', label: 'Conference Details' },
    { key: 'conference_form', label: 'Conference Form' },
  ],
  user: [
    { key: 'attendee_detail', label: 'Attendee Detail' },
    { key: 'company_detail', label: 'Company Detail' },
    { key: 'conference_detail', label: 'Conference Details' },
    { key: 'conference_form', label: 'Conference Form' },
    { key: 'follow_ups_page', label: 'Follow Ups Page' },
    { key: 'relationships_page', label: 'Relationships Page' },
  ],
  services: [
    { key: 'company_detail', label: 'Company Detail' },
  ],
  entity_structure: [
    { key: 'company_detail', label: 'Company Detail' },
  ],
  profit_type: [
    { key: 'company_table', label: 'Company Table' },
    { key: 'company_detail', label: 'Company Detail' },
  ],
  icp: [
    { key: 'company_table', label: 'Company Table' },
    { key: 'company_detail', label: 'Company Detail' },
  ],
  rep_relationship_type: [
    { key: 'attendee_detail', label: 'Attendee Detail' },
    { key: 'company_detail', label: 'Company Detail' },
    { key: 'relationships_page', label: 'Relationships Page' },
  ],
  cost_type: [],
};

export function getCategoryFormKeys(category: string): string[] {
  return (CATEGORY_FORM_USAGE[category] ?? []).map(f => f.key);
}
