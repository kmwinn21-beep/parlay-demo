export type DisplayType = 'pill_value' | 'text_value' | 'icon_tooltip' | 'user_icon_pill';

export interface AvailableColumnDef {
  key: string;
  label: string;
  data_key: string;
  config_category: string | null;
  is_user_field: boolean;
  default_display_type: DisplayType;
  source: string;
}

const attendeeColumns: AvailableColumnDef[] = [
  { key: 'email',               label: 'Email',              data_key: 'email',                    config_category: null,               is_user_field: false, default_display_type: 'text_value',    source: 'Attendee' },
  { key: 'action',              label: 'Action',             data_key: 'action',                   config_category: 'action',           is_user_field: false, default_display_type: 'pill_value',    source: 'Attendee' },
  { key: 'next_steps',          label: 'Next Steps',         data_key: 'next_steps',               config_category: 'next_steps',       is_user_field: false, default_display_type: 'pill_value',    source: 'Attendee' },
  { key: 'co_website',          label: 'Co. Website',        data_key: 'company_website',          config_category: null,               is_user_field: false, default_display_type: 'text_value',    source: 'Company' },
  { key: 'co_assigned_user',    label: 'Co. SF Owner',       data_key: 'company_assigned_user',    config_category: null,               is_user_field: true,  default_display_type: 'user_icon_pill', source: 'Company' },
  { key: 'co_icp',              label: 'Co. ICP',            data_key: 'company_icp',              config_category: 'icp',              is_user_field: false, default_display_type: 'pill_value',    source: 'Company' },
  { key: 'co_services',         label: 'Co. Services',       data_key: 'company_services',         config_category: 'services',         is_user_field: false, default_display_type: 'pill_value',    source: 'Company' },
  { key: 'co_profit_type',      label: 'Co. Profit Type',    data_key: 'company_profit_type',      config_category: 'profit_type',      is_user_field: false, default_display_type: 'pill_value',    source: 'Company' },
  { key: 'co_entity_structure', label: 'Co. Entity Structure', data_key: 'company_entity_structure', config_category: 'entity_structure', is_user_field: false, default_display_type: 'pill_value', source: 'Company' },
];

const companyColumns: AvailableColumnDef[] = [
  { key: 'icp',              label: 'ICP',              data_key: 'icp',              config_category: 'icp',              is_user_field: false, default_display_type: 'pill_value',    source: 'Company' },
  { key: 'services',         label: 'Services',         data_key: 'services',         config_category: 'services',         is_user_field: false, default_display_type: 'pill_value',    source: 'Company' },
  { key: 'entity_structure', label: 'Entity Structure', data_key: 'entity_structure', config_category: 'entity_structure', is_user_field: false, default_display_type: 'pill_value',    source: 'Company' },
  { key: 'profit_type',      label: 'Profit Type',      data_key: 'profit_type',      config_category: 'profit_type',      is_user_field: false, default_display_type: 'pill_value',    source: 'Company' },
  { key: 'website',          label: 'Website',          data_key: 'website',          config_category: null,               is_user_field: false, default_display_type: 'text_value',    source: 'Company' },
  { key: 'assigned_user',    label: 'SF Owner',         data_key: 'assigned_user',    config_category: null,               is_user_field: true,  default_display_type: 'user_icon_pill', source: 'Company' },
];

const followUpsColumns: AvailableColumnDef[] = [
  { key: 'co_website',       label: 'Co. Website',  data_key: 'company_website',       config_category: null,  is_user_field: false, default_display_type: 'text_value',    source: 'Company' },
  { key: 'co_icp',           label: 'Co. ICP',      data_key: 'company_icp',           config_category: 'icp', is_user_field: false, default_display_type: 'pill_value',    source: 'Company' },
  { key: 'co_assigned_user', label: 'Co. SF Owner', data_key: 'company_assigned_user', config_category: null,  is_user_field: true,  default_display_type: 'user_icon_pill', source: 'Company' },
];

const meetingsColumns: AvailableColumnDef[] = [
  { key: 'co_website',       label: 'Co. Website',  data_key: 'company_website',       config_category: null,  is_user_field: false, default_display_type: 'text_value',    source: 'Company' },
  { key: 'co_icp',           label: 'Co. ICP',      data_key: 'company_icp',           config_category: 'icp', is_user_field: false, default_display_type: 'pill_value',    source: 'Company' },
  { key: 'co_assigned_user', label: 'Co. SF Owner', data_key: 'company_assigned_user', config_category: null,  is_user_field: true,  default_display_type: 'user_icon_pill', source: 'Company' },
];

export const AVAILABLE_COLUMNS: Record<string, AvailableColumnDef[]> = {
  attendees:            attendeeColumns,
  conference_attendees: attendeeColumns,
  companies:            companyColumns,
  conference_companies: companyColumns,
  follow_ups:           followUpsColumns,
  meetings:             meetingsColumns,
  social_events:        [],
};

export const DISPLAY_TYPE_LABELS: Record<DisplayType, string> = {
  pill_value:    'Pill + Value',
  text_value:    'Text Value',
  icon_tooltip:  'Icon w/ Tooltip',
  user_icon_pill: 'User Icon + Pill',
};
