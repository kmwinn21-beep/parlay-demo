// All schema migrations, run in order by initDb() and seedFreshDb().
// ALTER TABLE statements fail silently on fresh DBs (columns already present
// in the full-schema CREATE TABLE); CREATE TABLE IF NOT EXISTS / CREATE INDEX IF NOT EXISTS
// are always idempotent.
export const migrations: string[] = [
  `ALTER TABLE attendees ADD COLUMN action TEXT`,
  `ALTER TABLE attendees ADD COLUMN next_steps TEXT`,
  `ALTER TABLE attendees ADD COLUMN next_steps_notes TEXT`,
  `ALTER TABLE attendees ADD COLUMN status TEXT DEFAULT 'Unknown'`,
  `ALTER TABLE companies ADD COLUMN status TEXT DEFAULT 'Unknown'`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_config_unique ON config_options(category, value)`,
  `ALTER TABLE conference_attendee_details ADD COLUMN completed INTEGER DEFAULT 0`,
  `CREATE TABLE IF NOT EXISTS entity_notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      entity_type TEXT NOT NULL,
      entity_id INTEGER NOT NULL,
      content TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    )`,
  `ALTER TABLE attendees ADD COLUMN seniority TEXT`,
  `ALTER TABLE config_options ADD COLUMN color TEXT`,
  // Seed default colors for existing options
  `UPDATE config_options SET color = 'yellow' WHERE category = 'status' AND value = 'Client' AND color IS NULL`,
  `UPDATE config_options SET color = 'red' WHERE category = 'status' AND value = 'Priority' AND color IS NULL`,
  `UPDATE config_options SET color = 'green' WHERE category = 'status' AND value = 'Interested' AND color IS NULL`,
  `UPDATE config_options SET color = 'dark' WHERE category = 'status' AND value = 'Not Interested' AND color IS NULL`,
  `UPDATE config_options SET color = 'gray' WHERE category = 'status' AND value = 'Unknown' AND color IS NULL`,
  `UPDATE config_options SET color = 'blue' WHERE category = 'status' AND value = 'Active Op.' AND color IS NULL`,
  `UPDATE config_options SET color = 'orange' WHERE category = 'status' AND value = 'Nurturing' AND color IS NULL`,
  `UPDATE config_options SET color = 'purple' WHERE category = 'status' AND value = 'DNC' AND color IS NULL`,
  `UPDATE config_options SET color = 'dark-blue' WHERE category = 'seniority' AND value = 'C-Suite' AND color IS NULL`,
  `UPDATE config_options SET color = 'blue' WHERE category = 'seniority' AND value = 'VP Level' AND color IS NULL`,
  `UPDATE config_options SET color = 'yellow' WHERE category = 'seniority' AND value = 'VP/SVP' AND color IS NULL`,
  `UPDATE config_options SET color = 'dark' WHERE category = 'seniority' AND value = 'Director' AND color IS NULL`,
  `UPDATE config_options SET color = 'orange' WHERE category = 'seniority' AND value = 'Manager' AND color IS NULL`,
  `UPDATE config_options SET color = 'teal' WHERE category = 'seniority' AND value = 'ED' AND color IS NULL`,
  `UPDATE config_options SET color = 'gray' WHERE category = 'seniority' AND value = 'Other' AND color IS NULL`,
  `UPDATE config_options SET color = 'purple' WHERE category = 'seniority' AND value = 'BOD' AND color IS NULL`,
  `UPDATE config_options SET color = 'green' WHERE category = 'seniority' AND value = 'Associate' AND color IS NULL`,
  `UPDATE config_options SET color = 'red' WHERE category = 'seniority' AND value = 'Admin' AND color IS NULL`,
  `UPDATE config_options SET color = 'dark-blue' WHERE category = 'company_type' AND value = 'Capital' AND color IS NULL`,
  `UPDATE config_options SET color = 'blue' WHERE category = 'company_type' AND value = 'Own/Op' AND color IS NULL`,
  `UPDATE config_options SET color = 'purple' WHERE category = 'company_type' AND value = 'Pr. Vendor' AND color IS NULL`,
  `UPDATE config_options SET color = 'teal' WHERE category = 'company_type' AND value = 'OpCo' AND color IS NULL`,
  `UPDATE config_options SET color = 'orange' WHERE category = 'company_type' AND value = 'PropCo' AND color IS NULL`,
  `UPDATE config_options SET color = 'red' WHERE category = 'company_type' AND value = 'CCRC' AND color IS NULL`,
  `UPDATE config_options SET color = 'yellow' WHERE category = 'company_type' AND value = 'Vendor' AND color IS NULL`,
  `UPDATE config_options SET color = 'gray' WHERE category = 'company_type' AND value = 'Other' AND color IS NULL`,
  `UPDATE config_options SET color = 'dark-blue' WHERE category = 'entity_structure' AND value = 'Parent' AND color IS NULL`,
  `UPDATE config_options SET color = 'teal' WHERE category = 'entity_structure' AND value = 'Child' AND color IS NULL`,
  `UPDATE config_options SET color = 'green' WHERE category = 'profit_type' AND value = 'For-Profit' AND color IS NULL`,
  `UPDATE config_options SET color = 'blue' WHERE category = 'profit_type' AND value = 'Non-Profit' AND color IS NULL`,
  `UPDATE config_options SET color = 'blue' WHERE category = 'action' AND (value = 'Scheduled' OR value = 'Meeting Scheduled') AND color IS NULL`,
  `UPDATE config_options SET color = 'green' WHERE category = 'action' AND (value = 'Held' OR value = 'Meeting Held') AND color IS NULL`,
  `UPDATE config_options SET color = 'purple' WHERE category = 'action' AND value = 'Social Conversation' AND color IS NULL`,
  `UPDATE config_options SET color = 'orange' WHERE category = 'action' AND value = 'Rescheduled' AND color IS NULL`,
  `UPDATE config_options SET color = 'red' WHERE category = 'action' AND (value = 'No-Show' OR value = 'Meeting No-Show') AND color IS NULL`,
  `UPDATE config_options SET color = 'yellow' WHERE category = 'action' AND value = 'Pending' AND color IS NULL`,
  `UPDATE config_options SET color = 'blue' WHERE category = 'next_steps' AND value = 'Meeting' AND color IS NULL`,
  `UPDATE config_options SET color = 'green' WHERE category = 'next_steps' AND value = 'Nurture' AND color IS NULL`,
  `UPDATE config_options SET color = 'gray' WHERE category = 'next_steps' AND value = 'Other' AND color IS NULL`,
  `ALTER TABLE companies ADD COLUMN assigned_user TEXT`,
  `ALTER TABLE conferences ADD COLUMN internal_attendees TEXT`,
  `CREATE TABLE IF NOT EXISTS meetings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      attendee_id INTEGER NOT NULL,
      conference_id INTEGER NOT NULL,
      meeting_date TEXT NOT NULL,
      meeting_time TEXT NOT NULL,
      location TEXT,
      scheduled_by TEXT,
      additional_attendees TEXT,
      outcome TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (attendee_id) REFERENCES attendees(id) ON DELETE CASCADE,
      FOREIGN KEY (conference_id) REFERENCES conferences(id) ON DELETE CASCADE
    )`,
  `ALTER TABLE conference_attendee_details ADD COLUMN assigned_rep TEXT`,
  `ALTER TABLE companies ADD COLUMN parent_company_id INTEGER REFERENCES companies(id)`,
  `ALTER TABLE companies ADD COLUMN entity_structure TEXT`,
  `ALTER TABLE companies ADD COLUMN wse INTEGER`,
  `ALTER TABLE companies ADD COLUMN services TEXT`,
  `ALTER TABLE companies ADD COLUMN icp TEXT DEFAULT 'No'`,
  `ALTER TABLE entity_notes ADD COLUMN conference_name TEXT`,
  `ALTER TABLE entity_notes ADD COLUMN rep TEXT`,
  // Event Type default colors
  `UPDATE config_options SET color = 'blue' WHERE category = 'event_type' AND value = 'Sponsored Event' AND color IS NULL`,
  `UPDATE config_options SET color = 'orange' WHERE category = 'event_type' AND value = 'Lunch' AND color IS NULL`,
  `UPDATE config_options SET color = 'purple' WHERE category = 'event_type' AND value = 'Dinner' AND color IS NULL`,
  `UPDATE config_options SET color = 'teal' WHERE category = 'event_type' AND value = 'Company Hosted' AND color IS NULL`,
  `UPDATE config_options SET color = 'green' WHERE category = 'event_type' AND value = 'Partner' AND color IS NULL`,
  `UPDATE config_options SET color = 'yellow' WHERE category = 'event_type' AND value = 'Conference Event' AND color IS NULL`,
  `CREATE TABLE IF NOT EXISTS company_relationships (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id_1 INTEGER NOT NULL,
      company_id_2 INTEGER NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (company_id_1) REFERENCES companies(id) ON DELETE CASCADE,
      FOREIGN KEY (company_id_2) REFERENCES companies(id) ON DELETE CASCADE
    )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_company_rel_unique ON company_relationships(company_id_1, company_id_2)`,
  `CREATE TABLE IF NOT EXISTS social_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      conference_id INTEGER NOT NULL,
      entered_by TEXT,
      internal_attendees TEXT,
      event_type TEXT,
      host TEXT,
      location TEXT,
      event_date TEXT,
      event_time TEXT,
      invite_only TEXT DEFAULT 'No',
      prospect_attendees TEXT,
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (conference_id) REFERENCES conferences(id) ON DELETE CASCADE
    )`,
  // Add action_key column for stable identification of meeting-related actions
  `ALTER TABLE config_options ADD COLUMN action_key TEXT`,
  `ALTER TABLE config_options ADD COLUMN status_key TEXT`,
  // Seed action_key for known meeting actions (match by category + known default values)
  `UPDATE config_options SET action_key = 'meeting_scheduled' WHERE category = 'action' AND (value = 'Scheduled' OR value = 'Meeting Scheduled') AND action_key IS NULL`,
  `UPDATE config_options SET action_key = 'meeting_held' WHERE category = 'action' AND (value = 'Held' OR value = 'Meeting Held') AND action_key IS NULL`,
  `UPDATE config_options SET action_key = 'rescheduled' WHERE category = 'action' AND value = 'Rescheduled' AND action_key IS NULL`,
  `UPDATE config_options SET action_key = 'cancelled' WHERE category = 'action' AND value = 'Cancelled' AND action_key IS NULL`,
  `UPDATE config_options SET action_key = 'no_show' WHERE category = 'action' AND (value = 'No-Show' OR value = 'Meeting No-Show') AND action_key IS NULL`,
  `UPDATE config_options SET action_key = 'pending' WHERE category = 'action' AND value = 'Pending' AND action_key IS NULL`,
  `UPDATE config_options SET status_key = 'priority' WHERE category = 'status' AND value = 'Priority' AND status_key IS NULL`,
  `CREATE TABLE IF NOT EXISTS company_priority_marks (
      company_id INTEGER NOT NULL,
      marked_by_config_id INTEGER NOT NULL,
      priority_option_id INTEGER NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      PRIMARY KEY (company_id, marked_by_config_id),
      FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
      FOREIGN KEY (priority_option_id) REFERENCES config_options(id) ON DELETE CASCADE
    )`,
  `CREATE INDEX IF NOT EXISTS idx_company_priority_marks_marker ON company_priority_marks(marked_by_config_id)`,
  `CREATE TABLE IF NOT EXISTS pinned_notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      note_id INTEGER NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id INTEGER NOT NULL,
      pinned_by TEXT NOT NULL,
      conference_name TEXT,
      attendee_name TEXT,
      attendee_id INTEGER,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (note_id) REFERENCES entity_notes(id) ON DELETE CASCADE
    )`,
  `CREATE TABLE IF NOT EXISTS internal_relationships (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL,
      rep_ids TEXT,
      contact_ids TEXT,
      relationship_status TEXT NOT NULL,
      description TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
    )`,
  // Performance indexes
  `CREATE INDEX IF NOT EXISTS idx_attendees_company_id ON attendees(company_id)`,
  `CREATE INDEX IF NOT EXISTS idx_conference_attendees_attendee_id ON conference_attendees(attendee_id)`,
  `CREATE INDEX IF NOT EXISTS idx_conference_attendees_conference_id ON conference_attendees(conference_id)`,
  `CREATE INDEX IF NOT EXISTS idx_entity_notes_type_entity_id ON entity_notes(entity_type, entity_id)`,
  `CREATE INDEX IF NOT EXISTS idx_conference_attendee_details_attendee_id ON conference_attendee_details(attendee_id)`,
  `CREATE INDEX IF NOT EXISTS idx_conference_attendee_details_conference_id ON conference_attendee_details(conference_id)`,
  `CREATE INDEX IF NOT EXISTS idx_meetings_attendee_id ON meetings(attendee_id)`,
  `CREATE INDEX IF NOT EXISTS idx_meetings_conference_id ON meetings(conference_id)`,
  `CREATE INDEX IF NOT EXISTS idx_meetings_attendee_conference ON meetings(attendee_id, conference_id)`,
  `ALTER TABLE entity_notes ADD COLUMN attendee_name TEXT`,
  `ALTER TABLE entity_notes ADD COLUMN company_name TEXT`,
  // New dedicated follow_ups table to support multiple follow-ups per attendee/conference
  `CREATE TABLE IF NOT EXISTS follow_ups (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      attendee_id INTEGER NOT NULL,
      conference_id INTEGER NOT NULL,
      next_steps TEXT,
      next_steps_notes TEXT,
      assigned_rep TEXT,
      completed INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (attendee_id) REFERENCES attendees(id) ON DELETE CASCADE,
      FOREIGN KEY (conference_id) REFERENCES conferences(id) ON DELETE CASCADE
    )`,
  `CREATE INDEX IF NOT EXISTS idx_follow_ups_attendee_id ON follow_ups(attendee_id)`,
  `CREATE INDEX IF NOT EXISTS idx_follow_ups_conference_id ON follow_ups(conference_id)`,
  `CREATE INDEX IF NOT EXISTS idx_follow_ups_attendee_conference ON follow_ups(attendee_id, conference_id)`,
  `ALTER TABLE companies ADD COLUMN updated_at TEXT`,
  `ALTER TABLE attendees ADD COLUMN updated_at TEXT`,
  `ALTER TABLE conferences ADD COLUMN updated_at TEXT`,
  `CREATE TABLE IF NOT EXISTS social_event_rsvps (
      social_event_id INTEGER NOT NULL,
      attendee_id INTEGER NOT NULL,
      rsvp_status TEXT NOT NULL DEFAULT 'maybe',
      updated_at TEXT DEFAULT (datetime('now')),
      PRIMARY KEY (social_event_id, attendee_id),
      FOREIGN KEY (social_event_id) REFERENCES social_events(id) ON DELETE CASCADE,
      FOREIGN KEY (attendee_id) REFERENCES attendees(id) ON DELETE CASCADE
    )`,
  `ALTER TABLE social_events ADD COLUMN event_name TEXT`,
  // Notifications system
  `ALTER TABLE users ADD COLUMN config_id INTEGER REFERENCES config_options(id)`,
  `CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      type TEXT NOT NULL,
      record_id INTEGER NOT NULL,
      record_name TEXT NOT NULL,
      message TEXT NOT NULL,
      changed_by_config_id INTEGER,
      changed_by_email TEXT,
      entity_type TEXT NOT NULL,
      entity_id INTEGER NOT NULL,
      is_read INTEGER NOT NULL DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )`,
  `CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_notifications_user_read ON notifications(user_id, is_read)`,
  `ALTER TABLE entity_notes ADD COLUMN tagged_users TEXT`,
  `CREATE TABLE IF NOT EXISTS site_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)`,
  `INSERT OR IGNORE INTO site_settings (key, value) VALUES ('allow_attendee_upload', 'true')`,
  `INSERT OR IGNORE INTO site_settings (key, value) VALUES ('font_key', 'default')`,
  `INSERT OR IGNORE INTO site_settings (key, value) VALUES ('tagline', '')`,
  `INSERT OR IGNORE INTO site_settings (key, value) VALUES ('prior_overlap_company_type', 'Operator')`,
  `CREATE TABLE IF NOT EXISTS table_column_config (table_name TEXT NOT NULL, column_key TEXT NOT NULL, visible INTEGER NOT NULL DEFAULT 1, PRIMARY KEY (table_name, column_key))`,
  `ALTER TABLE table_column_config ADD COLUMN sort_order INTEGER`,
  `CREATE TABLE IF NOT EXISTS section_config (page TEXT NOT NULL, section_key TEXT NOT NULL, label TEXT NOT NULL, sort_order INTEGER NOT NULL DEFAULT 0, visible INTEGER NOT NULL DEFAULT 1, PRIMARY KEY (page, section_key))`,
  `CREATE TABLE IF NOT EXISTS config_option_visibility (option_id INTEGER NOT NULL, form_key TEXT NOT NULL, visible INTEGER NOT NULL DEFAULT 1, PRIMARY KEY (option_id, form_key), FOREIGN KEY (option_id) REFERENCES config_options(id) ON DELETE CASCADE)`,
  // Rename 'Procare Hosted' event type to generic 'Company Hosted'
  `UPDATE config_options SET value = 'Company Hosted' WHERE category = 'event_type' AND value = 'Procare Hosted'`,
  `CREATE TABLE IF NOT EXISTS quick_notes (id INTEGER PRIMARY KEY AUTOINCREMENT, content TEXT NOT NULL, created_at TEXT DEFAULT (datetime('now')), created_by TEXT)`,
  // Account management additions
  `ALTER TABLE users ADD COLUMN display_name TEXT`,
  `ALTER TABLE users ADD COLUMN email_pending TEXT`,
  `ALTER TABLE users ADD COLUMN email_change_token TEXT`,
  `ALTER TABLE users ADD COLUMN email_change_expires INTEGER`,
  `CREATE TABLE IF NOT EXISTS notification_preferences (
      user_id INTEGER PRIMARY KEY,
      company_status_change INTEGER NOT NULL DEFAULT 1,
      follow_up_assigned INTEGER NOT NULL DEFAULT 1,
      note_tagged INTEGER NOT NULL DEFAULT 1,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )`,
  `CREATE TABLE IF NOT EXISTS custom_columns (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      table_name TEXT NOT NULL,
      column_key TEXT NOT NULL,
      label TEXT NOT NULL,
      data_key TEXT NOT NULL,
      config_category TEXT,
      is_user_field INTEGER NOT NULL DEFAULT 0,
      display_type TEXT NOT NULL DEFAULT 'text_value',
      display_config TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      visible INTEGER NOT NULL DEFAULT 1,
      UNIQUE(table_name, column_key)
    )`,
  // Scope column on config_options — 'global' (default) or 'user' (only visible to the user who set it)
  `ALTER TABLE config_options ADD COLUMN scope TEXT DEFAULT 'global'`,
  // Seed scope='user' for the existing Priority status option
  `UPDATE config_options SET scope = 'user' WHERE category = 'status' AND (status_key = 'priority' OR LOWER(value) = 'priority') AND (scope IS NULL OR scope != 'user')`,
  // General user-scoped status marks table — replaces company_priority_marks for all user-scoped statuses
  `CREATE TABLE IF NOT EXISTS company_user_statuses (
      company_id INTEGER NOT NULL,
      status_option_id INTEGER NOT NULL,
      marked_by_config_id INTEGER NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      PRIMARY KEY (company_id, status_option_id, marked_by_config_id),
      FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
      FOREIGN KEY (status_option_id) REFERENCES config_options(id) ON DELETE CASCADE,
      FOREIGN KEY (marked_by_config_id) REFERENCES config_options(id) ON DELETE CASCADE
    )`,
  `CREATE INDEX IF NOT EXISTS idx_company_user_statuses_marker ON company_user_statuses(marked_by_config_id)`,
  `CREATE INDEX IF NOT EXISTS idx_company_user_statuses_option ON company_user_statuses(status_option_id)`,
  // Migrate existing priority marks into the general table
  `INSERT OR IGNORE INTO company_user_statuses (company_id, status_option_id, marked_by_config_id, created_at)
     SELECT company_id, priority_option_id, marked_by_config_id, created_at FROM company_priority_marks`,
  // Configurable ICP rules engine
  `CREATE TABLE IF NOT EXISTS icp_rules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category TEXT NOT NULL,
      sort_order INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    )`,
  `CREATE TABLE IF NOT EXISTS icp_rule_conditions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      rule_id INTEGER NOT NULL,
      option_value TEXT NOT NULL,
      operator TEXT NOT NULL DEFAULT 'OR',
      FOREIGN KEY (rule_id) REFERENCES icp_rules(id) ON DELETE CASCADE
    )`,
  `ALTER TABLE meetings ADD COLUMN meeting_type TEXT`,
  // Target Priority recommended actions use stable action_key values; labels remain editable in config_options.
  `INSERT OR IGNORE INTO config_options (category, value, sort_order, action_key) VALUES ('target_recommended_action', 'Book Meeting', 0, 'book_meeting')`,
  `INSERT OR IGNORE INTO config_options (category, value, sort_order, action_key) VALUES ('target_recommended_action', 'Route to Account Owner', 1, 'route_to_account_owner')`,
  `INSERT OR IGNORE INTO config_options (category, value, sort_order, action_key) VALUES ('target_recommended_action', 'Invite to Hosted Event', 2, 'invite_to_hosted_event')`,
  `INSERT OR IGNORE INTO config_options (category, value, sort_order, action_key) VALUES ('target_recommended_action', 'Rep Floor Outreach', 3, 'rep_floor_outreach')`,
  `INSERT OR IGNORE INTO config_options (category, value, sort_order, action_key) VALUES ('target_recommended_action', 'Research Before Outreach', 4, 'research_before_outreach')`,
  `INSERT OR IGNORE INTO config_options (category, value, sort_order, action_key) VALUES ('target_recommended_action', 'Monitor Only', 5, 'monitor_only')`,
  `INSERT OR IGNORE INTO config_options (category, value, sort_order, action_key) VALUES ('target_recommended_action', 'Add to Nurture', 6, 'add_to_nurture')`,
  `INSERT OR IGNORE INTO config_options (category, value, sort_order, action_key)
     VALUES ('company_type', 'Prospect', (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM config_options WHERE category = 'company_type'), 'prospect')`,
  `UPDATE config_options SET action_key = 'prospect' WHERE category = 'company_type' AND value = 'Prospect' AND action_key IS NULL`,
  `INSERT OR IGNORE INTO config_options (category, value, sort_order, action_key) VALUES ('target_recommended_action', 'Do Not Prioritize', 7, 'do_not_prioritize')`,
  // Form Builder tables
  `CREATE TABLE IF NOT EXISTS form_templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      created_by TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )`,
  `CREATE TABLE IF NOT EXISTS form_fields (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      template_id INTEGER REFERENCES form_templates(id) ON DELETE CASCADE,
      conference_form_id INTEGER REFERENCES conference_forms(id) ON DELETE CASCADE,
      field_type TEXT NOT NULL,
      field_key TEXT,
      label TEXT NOT NULL,
      placeholder TEXT,
      required INTEGER DEFAULT 0,
      sort_order INTEGER DEFAULT 0,
      options_source TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )`,
  `CREATE TABLE IF NOT EXISTS form_field_options (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      field_id INTEGER NOT NULL REFERENCES form_fields(id) ON DELETE CASCADE,
      value TEXT NOT NULL,
      sort_order INTEGER DEFAULT 0
    )`,
  `CREATE TABLE IF NOT EXISTS conference_forms (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      conference_id INTEGER NOT NULL REFERENCES conferences(id) ON DELETE CASCADE,
      template_id INTEGER REFERENCES form_templates(id),
      name TEXT NOT NULL,
      conference_logo_url TEXT,
      background_color TEXT,
      created_by TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )`,
  `CREATE TABLE IF NOT EXISTS form_submissions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      conference_form_id INTEGER NOT NULL REFERENCES conference_forms(id) ON DELETE CASCADE,
      conference_id INTEGER NOT NULL REFERENCES conferences(id) ON DELETE CASCADE,
      attendee_id INTEGER REFERENCES attendees(id),
      submitted_at TEXT DEFAULT (datetime('now')),
      status_option_id INTEGER REFERENCES config_options(id)
    )`,
  `CREATE TABLE IF NOT EXISTS form_submission_values (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      submission_id INTEGER NOT NULL REFERENCES form_submissions(id) ON DELETE CASCADE,
      field_id INTEGER,
      field_label TEXT NOT NULL,
      field_value TEXT
    )`,
  `CREATE TABLE IF NOT EXISTS form_template_permissions (
      template_id INTEGER NOT NULL REFERENCES form_templates(id) ON DELETE CASCADE,
      user_config_id INTEGER NOT NULL REFERENCES config_options(id) ON DELETE CASCADE,
      PRIMARY KEY (template_id, user_config_id)
    )`,
  `CREATE INDEX IF NOT EXISTS idx_form_fields_template ON form_fields(template_id)`,
  `CREATE INDEX IF NOT EXISTS idx_form_fields_conf_form ON form_fields(conference_form_id)`,
  `CREATE INDEX IF NOT EXISTS idx_conference_forms_conf ON conference_forms(conference_id)`,
  `CREATE INDEX IF NOT EXISTS idx_form_submissions_form ON form_submissions(conference_form_id)`,
  `CREATE INDEX IF NOT EXISTS idx_form_submission_values_sub ON form_submission_values(submission_id)`,
  `ALTER TABLE conference_forms ADD COLUMN accent_color TEXT`,
  `ALTER TABLE conference_forms ADD COLUMN accent_gradient TEXT`,
  `ALTER TABLE conference_forms ADD COLUMN image_url TEXT`,
  `ALTER TABLE conference_forms ADD COLUMN image_max_width INTEGER`,
  `ALTER TABLE conference_forms ADD COLUMN html_content TEXT`,
  `ALTER TABLE conference_forms ADD COLUMN image_offset_y INTEGER`,
  `ALTER TABLE conference_forms ADD COLUMN html_offset_y INTEGER`,
  `ALTER TABLE conference_forms ADD COLUMN form_width INTEGER`,
  `ALTER TABLE conference_forms ADD COLUMN form_height INTEGER`,
  `ALTER TABLE conference_forms ADD COLUMN form_offset_y INTEGER`,
  `ALTER TABLE conference_forms ADD COLUMN panel_logo_url TEXT`,
  `ALTER TABLE config_options ADD COLUMN auto_follow_up INTEGER DEFAULT 1`,
  `CREATE TABLE IF NOT EXISTS attendee_touchpoints (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      attendee_id INTEGER NOT NULL,
      conference_id INTEGER NOT NULL,
      option_id INTEGER NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    )`,
  `INSERT OR IGNORE INTO config_options (category, value, sort_order) VALUES ('touchpoints', 'Booth Stop', 1)`,
  `INSERT OR IGNORE INTO config_options (category, value, sort_order) VALUES ('touchpoints', 'Coffee', 2)`,
  `INSERT OR IGNORE INTO config_options (category, value, sort_order) VALUES ('touchpoints', 'Dinner', 3)`,
  `INSERT OR IGNORE INTO config_options (category, value, sort_order) VALUES ('touchpoints', 'Event', 4)`,
  `INSERT OR IGNORE INTO config_options (category, value, sort_order) VALUES ('touchpoints', 'Breakfast/Lunch', 5)`,
  `INSERT OR IGNORE INTO config_options (category, value, sort_order) VALUES ('touchpoints', 'Other', 6)`,
  `CREATE TABLE IF NOT EXISTS conference_targets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      attendee_id INTEGER NOT NULL,
      conference_id INTEGER NOT NULL,
      tier TEXT NOT NULL DEFAULT 'unassigned',
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(attendee_id, conference_id),
      FOREIGN KEY (attendee_id) REFERENCES attendees(id) ON DELETE CASCADE,
      FOREIGN KEY (conference_id) REFERENCES conferences(id) ON DELETE CASCADE
    )`,
  `INSERT OR IGNORE INTO config_options (category, value, sort_order) VALUES ('attendee_conference_status', 'Target', 1)`,
  `ALTER TABLE quick_notes ADD COLUMN tag TEXT`,
  `CREATE TABLE IF NOT EXISTS conference_agenda_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      conference_id INTEGER NOT NULL,
      day_label TEXT NOT NULL,
      start_time TEXT,
      end_time TEXT,
      session_type TEXT,
      title TEXT NOT NULL,
      description TEXT,
      location TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (conference_id) REFERENCES conferences(id) ON DELETE CASCADE
    )`,
  `CREATE INDEX IF NOT EXISTS idx_agenda_conference ON conference_agenda_items(conference_id, sort_order)`,
  `INSERT OR IGNORE INTO section_config (page, section_key, label, sort_order) VALUES ('conference_details', 'agenda', 'Agenda', 9)`,
  `CREATE TABLE IF NOT EXISTS conference_my_agenda_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      conference_id INTEGER NOT NULL,
      user_email TEXT NOT NULL,
      source_type TEXT NOT NULL DEFAULT 'agenda',
      agenda_item_id INTEGER,
      meeting_id INTEGER,
      day_label TEXT NOT NULL,
      start_time TEXT,
      end_time TEXT,
      session_type TEXT,
      title TEXT NOT NULL,
      description TEXT,
      location TEXT,
      note_content TEXT,
      entity_note_ids TEXT,
      attendee_id INTEGER,
      company_id INTEGER,
      attendee_name TEXT,
      company_name TEXT,
      conference_name TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (conference_id) REFERENCES conferences(id) ON DELETE CASCADE
    )`,
  `CREATE INDEX IF NOT EXISTS idx_my_agenda_conference_user ON conference_my_agenda_items(conference_id, user_email)`,
  `ALTER TABLE attendees ADD COLUMN linkedin_url TEXT`,
  `ALTER TABLE attendees ADD COLUMN phone TEXT`,
  `INSERT OR IGNORE INTO config_options (category, value, sort_order, action_key) VALUES ('next_steps', 'Post-Mtg', 10, 'post_mtg')`,
  `UPDATE config_options SET action_key = 'post_mtg' WHERE category = 'next_steps' AND LOWER(value) LIKE '%post%mtg%' AND (action_key IS NULL OR action_key = '')`,
  `ALTER TABLE notification_preferences ADD COLUMN email_notifications INTEGER NOT NULL DEFAULT 1`,
  `ALTER TABLE notification_preferences ADD COLUMN company_status_change_email INTEGER NOT NULL DEFAULT 1`,
  `ALTER TABLE notification_preferences ADD COLUMN follow_up_assigned_email INTEGER NOT NULL DEFAULT 1`,
  `ALTER TABLE notification_preferences ADD COLUMN note_tagged_email INTEGER NOT NULL DEFAULT 1`,
  // Note comments, reactions, let's talk
  `CREATE TABLE IF NOT EXISTS note_comments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      note_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      content TEXT NOT NULL,
      tagged_users TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (note_id) REFERENCES entity_notes(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )`,
  `CREATE INDEX IF NOT EXISTS idx_note_comments_note_id ON note_comments(note_id)`,
  `CREATE TABLE IF NOT EXISTS note_reactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      note_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      reaction_type TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(note_id, user_id),
      FOREIGN KEY (note_id) REFERENCES entity_notes(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )`,
  `CREATE TABLE IF NOT EXISTS comment_reactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      comment_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      reaction_type TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(comment_id, user_id),
      FOREIGN KEY (comment_id) REFERENCES note_comments(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )`,
  `ALTER TABLE entity_notes ADD COLUMN lets_talk INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE entity_notes ADD COLUMN author_user_id INTEGER`,
  // New opt-in notification prefs (DEFAULT 0 = opted out by default)
  `ALTER TABLE notification_preferences ADD COLUMN note_comment_received INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE notification_preferences ADD COLUMN note_comment_received_email INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE notification_preferences ADD COLUMN note_comment_thread INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE notification_preferences ADD COLUMN note_comment_thread_email INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE notification_preferences ADD COLUMN note_reaction_received INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE notification_preferences ADD COLUMN note_reaction_received_email INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE notification_preferences ADD COLUMN note_lets_talk INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE notification_preferences ADD COLUMN note_lets_talk_email INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE notification_preferences ADD COLUMN comment_reaction_received INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE notification_preferences ADD COLUMN comment_reaction_received_email INTEGER NOT NULL DEFAULT 0`,
  `CREATE TABLE IF NOT EXISTS direct_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sender_id INTEGER NOT NULL,
      receiver_id INTEGER NOT NULL,
      content TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      read_at TEXT,
      FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (receiver_id) REFERENCES users(id) ON DELETE CASCADE
    )`,
  `CREATE INDEX IF NOT EXISTS idx_direct_messages_sender ON direct_messages(sender_id)`,
  `CREATE INDEX IF NOT EXISTS idx_direct_messages_receiver ON direct_messages(receiver_id)`,
  `CREATE INDEX IF NOT EXISTS idx_direct_messages_conversation ON direct_messages(sender_id, receiver_id)`,
  // Invite-only user management
  `ALTER TABLE users ADD COLUMN active INTEGER NOT NULL DEFAULT 1`,
  `ALTER TABLE users ADD COLUMN invite_token TEXT`,
  `ALTER TABLE users ADD COLUMN invite_expires INTEGER`,
  `ALTER TABLE users ADD COLUMN first_name TEXT`,
  `ALTER TABLE users ADD COLUMN last_name TEXT`,
  // Email outreach: per-user OAuth connections (Google / Microsoft)
  `CREATE TABLE IF NOT EXISTS oauth_connections (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      provider TEXT NOT NULL CHECK (provider IN ('google', 'microsoft')),
      provider_email TEXT,
      access_token TEXT NOT NULL,
      refresh_token TEXT,
      token_expires_at INTEGER,
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE (user_id, provider),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )`,
  // Email outreach: admin-managed reusable templates
  `CREATE TABLE IF NOT EXISTS email_templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      subject TEXT NOT NULL,
      body TEXT NOT NULL,
      created_by INTEGER,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
    )`,
  // Per-user email signature (rich HTML)
  `ALTER TABLE users ADD COLUMN signature_html TEXT`,
  // Group chat tables
  `CREATE TABLE IF NOT EXISTS group_conversations (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      name       TEXT NOT NULL,
      created_by INTEGER NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE
    )`,
  `CREATE TABLE IF NOT EXISTS group_conversation_members (
      group_id     INTEGER NOT NULL,
      user_id      INTEGER NOT NULL,
      last_read_at TEXT,
      joined_at    TEXT DEFAULT (datetime('now')),
      PRIMARY KEY (group_id, user_id),
      FOREIGN KEY (group_id) REFERENCES group_conversations(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id)  REFERENCES users(id) ON DELETE CASCADE
    )`,
  `CREATE TABLE IF NOT EXISTS group_messages (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      group_id   INTEGER NOT NULL,
      sender_id  INTEGER NOT NULL,
      content    TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (group_id)  REFERENCES group_conversations(id) ON DELETE CASCADE,
      FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE
    )`,
  `CREATE INDEX IF NOT EXISTS idx_group_members_user_id        ON group_conversation_members(user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_group_members_group_id       ON group_conversation_members(group_id)`,
  `CREATE INDEX IF NOT EXISTS idx_group_messages_group_created ON group_messages(group_id, created_at)`,
  // Protect system-seeded config options from deletion
  `ALTER TABLE config_options ADD COLUMN is_system INTEGER NOT NULL DEFAULT 0`,
  // Attendee function (department/role) and product selections
  `ALTER TABLE attendees ADD COLUMN function TEXT`,
  `ALTER TABLE attendees ADD COLUMN products TEXT`,
  // Section config entries for new attendee and company sections
  `INSERT OR IGNORE INTO section_config (page, section_key, label, sort_order) VALUES ('attendee', 'function', 'Function', 7)`,
  `INSERT OR IGNORE INTO section_config (page, section_key, label, sort_order) VALUES ('attendee', 'products', 'Products', 8)`,
  `INSERT OR IGNORE INTO section_config (page, section_key, label, sort_order) VALUES ('company', 'products', 'Products', 6)`,
  // Effectiveness defaults key-value store
  `CREATE TABLE IF NOT EXISTS effectiveness_defaults (key TEXT PRIMARY KEY, value TEXT)`,
  // Conference budget vs actual
  `CREATE TABLE IF NOT EXISTS conference_budget (
      conference_id INTEGER PRIMARY KEY,
      line_items TEXT NOT NULL DEFAULT '[]',
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (conference_id) REFERENCES conferences(id) ON DELETE CASCADE
    )`,
  `ALTER TABLE conference_budget ADD COLUMN return_on_cost TEXT`,
  `ALTER TABLE conference_budget ADD COLUMN required_pipeline_multiple TEXT`,
  `ALTER TABLE conference_budget ADD COLUMN required_pipeline_amount REAL`,
  // Annual conference budget targets (per year, for global reporting)
  `CREATE TABLE IF NOT EXISTS annual_budgets (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      year       INTEGER NOT NULL UNIQUE,
      amount     REAL    NOT NULL,
      created_at TEXT    DEFAULT (datetime('now'))
    )`,
  `ALTER TABLE conferences ADD COLUMN conf_event_type TEXT`,
  `ALTER TABLE conferences ADD COLUMN conference_strategy_type_id INTEGER REFERENCES config_options(id)`,
  `ALTER TABLE conferences ADD COLUMN cost_efficiency_modifier REAL`,
  `ALTER TABLE conferences ADD COLUMN cost_efficiency_modifier_reason TEXT`,
  `ALTER TABLE conferences ADD COLUMN is_historical INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE config_options ADD COLUMN is_actionable INTEGER NOT NULL DEFAULT 0`,
  `UPDATE config_options SET is_actionable = 1 WHERE category = 'target_recommended_action' AND action_key IN ('book_meeting','route_to_account_owner','invite_to_hosted_event','rep_floor_outreach')`,
  `UPDATE config_options SET is_actionable = COALESCE(is_actionable, 0) WHERE category = 'target_recommended_action'`,
  `ALTER TABLE conferences ADD COLUMN calendar_score_invalidated_at TEXT`,
  `CREATE TABLE IF NOT EXISTS calendar_intelligence_scores (
      conference_id INTEGER PRIMARY KEY REFERENCES conferences(id) ON DELETE CASCADE,
      score_payload TEXT NOT NULL,
      calculated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`,
  `INSERT OR IGNORE INTO effectiveness_defaults (key, value) VALUES ('ces_benchmarks', '{"cost_per_company":{"elite_max":350,"strong_max":650,"healthy_max":1000,"weak_max":1600},"cost_per_meeting":{"elite_max":400,"strong_max":700,"healthy_max":1100,"weak_max":1800},"pipeline_per_1k":{"elite_min":10000,"strong_min":6000,"healthy_min":3500,"weak_min":1500}}')`,
  `INSERT OR IGNORE INTO effectiveness_defaults (key, value) VALUES ('ces_event_type_modifiers', '{"flagship_industry_event":5,"regional_operator_conference":0,"vendor_heavy_trade_show":-5,"other":0}')`,
  // Usage tracking
  `ALTER TABLE users ADD COLUMN last_seen_at TEXT`,
  `CREATE TABLE IF NOT EXISTS user_sessions (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TEXT    DEFAULT (datetime('now')),
      ip_address TEXT,
      user_agent TEXT
    )`,
  `CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id ON user_sessions(user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_user_sessions_created  ON user_sessions(created_at)`,
  `INSERT OR IGNORE INTO site_settings (key, value) VALUES ('role_capabilities', '{"sales_rep":{"view_data":true,"create_activity":true,"view_rep_metrics":true,"view_effectiveness":false,"view_financials":false,"view_pre_post_conference":false,"manage_conference_data":false,"delete_merge":false,"manage_system_config":false,"manage_users":false,"manage_role_scope":false},"manager":{"view_data":true,"create_activity":true,"view_rep_metrics":true,"view_effectiveness":true,"view_financials":false,"view_pre_post_conference":true,"manage_conference_data":false,"delete_merge":false,"manage_system_config":false,"manage_users":false,"manage_role_scope":false},"analyst":{"view_data":true,"create_activity":false,"view_rep_metrics":true,"view_effectiveness":true,"view_financials":true,"view_pre_post_conference":true,"manage_conference_data":false,"delete_merge":false,"manage_system_config":false,"manage_users":false,"manage_role_scope":false},"conference_coordinator":{"view_data":true,"create_activity":false,"view_rep_metrics":false,"view_effectiveness":false,"view_financials":false,"view_pre_post_conference":false,"manage_conference_data":true,"delete_merge":true,"manage_system_config":false,"manage_users":false,"manage_role_scope":false},"user":{"view_data":true,"create_activity":true,"view_rep_metrics":true,"view_effectiveness":true,"view_financials":true,"view_pre_post_conference":true,"manage_conference_data":true,"delete_merge":true,"manage_system_config":false,"manage_users":false,"manage_role_scope":false},"administrator":{"view_data":true,"create_activity":true,"view_rep_metrics":true,"view_effectiveness":true,"view_financials":true,"view_pre_post_conference":true,"manage_conference_data":true,"delete_merge":true,"manage_system_config":true,"manage_users":true,"manage_role_scope":true}}')`,
  `CREATE TABLE IF NOT EXISTS conference_crm_mappings (
      conference_id INTEGER NOT NULL,
      provider TEXT NOT NULL,
      crm_campaign_name TEXT NOT NULL,
      updated_at TEXT DEFAULT (datetime('now')),
      PRIMARY KEY (conference_id, provider)
    )`,
  `ALTER TABLE config_options ADD COLUMN is_primary INTEGER NOT NULL DEFAULT 0`,
  // Rename action display names to shorter canonical forms — cascade to meetings.outcome
  // and conference_attendee_details.action (comma-separated). Safe to run repeatedly.
  `UPDATE config_options SET value = 'Scheduled' WHERE category = 'action' AND value = 'Meeting Scheduled'`,
  `UPDATE config_options SET value = 'Held' WHERE category = 'action' AND value = 'Meeting Held'`,
  `UPDATE config_options SET value = 'No-Show' WHERE category = 'action' AND value = 'Meeting No-Show'`,
  `UPDATE meetings SET outcome = 'Scheduled' WHERE outcome = 'Meeting Scheduled'`,
  `UPDATE meetings SET outcome = 'Held' WHERE outcome = 'Meeting Held'`,
  `UPDATE meetings SET outcome = 'No-Show' WHERE outcome = 'Meeting No-Show'`,
  `UPDATE conference_attendee_details SET action = TRIM(REPLACE(',' || COALESCE(action,'') || ',', ',Meeting Scheduled,', ',Scheduled,'), ',') WHERE ',' || COALESCE(action,'') || ',' LIKE '%,Meeting Scheduled,%'`,
  `UPDATE conference_attendee_details SET action = TRIM(REPLACE(',' || COALESCE(action,'') || ',', ',Meeting Held,', ',Held,'), ',') WHERE ',' || COALESCE(action,'') || ',' LIKE '%,Meeting Held,%'`,
  `UPDATE conference_attendee_details SET action = TRIM(REPLACE(',' || COALESCE(action,'') || ',', ',Meeting No-Show,', ',No-Show,'), ',') WHERE ',' || COALESCE(action,'') || ',' LIKE '%,Meeting No-Show,%'`,
  `INSERT OR IGNORE INTO site_settings (key, value) VALUES ('plan_id', 'trial')`,
  `INSERT OR IGNORE INTO site_settings (key, value) VALUES ('trial_expires_at', '')`,
  `INSERT OR IGNORE INTO site_settings (key, value) VALUES ('grace_period_ends_at', '')`,
  `INSERT OR IGNORE INTO site_settings (key, value) VALUES ('plan_capabilities', '')`,
  `INSERT OR IGNORE INTO site_settings (key, value) VALUES ('onboarding_track', '')`,
  `INSERT OR IGNORE INTO site_settings (key, value) VALUES ('onboarding_completed', 'false')`,
  `INSERT OR IGNORE INTO site_settings (key, value) VALUES ('trial_reminder_12_sent', 'false')`,
  `INSERT OR IGNORE INTO site_settings (key, value) VALUES ('trial_reminder_13_sent', 'false')`,
  `INSERT OR IGNORE INTO site_settings (key, value) VALUES ('trial_reminder_14_sent', 'false')`,
  `INSERT OR IGNORE INTO site_settings (key, value) VALUES ('activated_plan_at', '')`,
  `ALTER TABLE users ADD COLUMN is_admin INTEGER NOT NULL DEFAULT 0`,
  `CREATE TABLE IF NOT EXISTS accounts (
      id TEXT PRIMARY KEY,
      company_name TEXT NOT NULL,
      admin_email TEXT NOT NULL,
      admin_first_name TEXT,
      admin_last_name TEXT,
      plan_id TEXT NOT NULL DEFAULT 'trial',
      trial_expires_at TEXT,
      grace_period_ends_at TEXT,
      activated_plan_at TEXT,
      onboarding_track TEXT,
      onboarding_completed INTEGER DEFAULT 0,
      turso_db_url TEXT,
      turso_auth_token TEXT,
      deployment_url TEXT,
      signup_role TEXT,
      signup_industry TEXT,
      signup_team_size TEXT,
      signup_conferences_per_year TEXT,
      signup_primary_goal TEXT,
      signup_current_tool TEXT,
      last_active_at TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )`,
  `CREATE TABLE IF NOT EXISTS admin_audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      admin_user_id INTEGER NOT NULL,
      account_id TEXT NOT NULL,
      action TEXT NOT NULL,
      previous_value TEXT,
      new_value TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )`,
  `CREATE TABLE IF NOT EXISTS impersonation_sessions (
      id TEXT PRIMARY KEY,
      admin_user_id INTEGER NOT NULL,
      account_id TEXT NOT NULL,
      started_at TEXT DEFAULT (datetime('now')),
      ended_at TEXT,
      last_active_at TEXT DEFAULT (datetime('now'))
    )`,
  `ALTER TABLE conferences ADD COLUMN post_conference_days INTEGER DEFAULT 10`,
  `ALTER TABLE conferences ADD COLUMN stage_override TEXT`,
  `ALTER TABLE conferences ADD COLUMN stage_override_by TEXT`,
  `ALTER TABLE conferences ADD COLUMN stage_override_at INTEGER`,
  `ALTER TABLE conferences ADD COLUMN stage_override_reason TEXT`,
  `CREATE TABLE IF NOT EXISTS conference_stage_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      conference_id INTEGER NOT NULL REFERENCES conferences(id) ON DELETE CASCADE,
      from_stage TEXT,
      to_stage TEXT NOT NULL,
      triggered_by TEXT NOT NULL,
      user_id INTEGER REFERENCES users(id),
      reason TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )`,
  // Calendar Intelligence — account-level and user-level conference decisions
  `CREATE TABLE IF NOT EXISTS conference_decisions (
      conference_id INTEGER PRIMARY KEY REFERENCES conferences(id) ON DELETE CASCADE,
      decision TEXT NOT NULL DEFAULT 'pending_approval',
      updated_by INTEGER REFERENCES users(id),
      updated_at TEXT DEFAULT (datetime('now'))
    )`,
  `CREATE TABLE IF NOT EXISTS user_conference_decisions (
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      conference_id INTEGER NOT NULL REFERENCES conferences(id) ON DELETE CASCADE,
      decision TEXT NOT NULL,
      note TEXT,
      updated_at TEXT DEFAULT (datetime('now')),
      PRIMARY KEY (user_id, conference_id)
    )`,
  // Calendar notes — separate from entity_notes, conference-scoped, threaded, immutable
  `CREATE TABLE IF NOT EXISTS calendar_notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      conference_id INTEGER NOT NULL REFERENCES conferences(id) ON DELETE CASCADE,
      author_user_id INTEGER NOT NULL REFERENCES users(id),
      content TEXT NOT NULL,
      decision_state TEXT,
      parent_note_id INTEGER REFERENCES calendar_notes(id) ON DELETE CASCADE,
      created_at TEXT DEFAULT (datetime('now'))
    )`,
  `CREATE INDEX IF NOT EXISTS idx_calendar_notes_conference ON calendar_notes(conference_id)`,
  `CREATE INDEX IF NOT EXISTS idx_calendar_notes_parent ON calendar_notes(parent_note_id)`,
  // Strategic Lens saved weight presets
  `CREATE TABLE IF NOT EXISTS calendar_lenses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      weights TEXT NOT NULL,
      created_by_user_id INTEGER REFERENCES users(id),
      is_account_default INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    )`,
  `CREATE TABLE IF NOT EXISTS user_lens_preferences (
      user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      default_lens_id INTEGER REFERENCES calendar_lenses(id) ON DELETE SET NULL
    )`,
  `DROP TABLE IF EXISTS user_lens_preferences`,
  `DROP TABLE IF EXISTS calendar_lenses`,
  // Competitor company type (system-locked) + per-company competitor_type field
  `ALTER TABLE companies ADD COLUMN competitor_type TEXT`,
  `CREATE TABLE IF NOT EXISTS competitor_settings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_name TEXT NOT NULL,
      website TEXT NOT NULL,
      competitor_type TEXT NOT NULL DEFAULT 'Unknown',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )`,
  `INSERT OR IGNORE INTO config_options (category, value, sort_order, is_system, color) VALUES ('company_type', 'Competitor', 999, 1, '#dc2626')`,
  `UPDATE config_options SET color = '#dc2626' WHERE category = 'company_type' AND LOWER(TRIM(value)) = 'competitor' AND (color = 'red' OR color IS NULL)`,
  `ALTER TABLE attendees ADD COLUMN consent TEXT NOT NULL DEFAULT 'Consent Not Recorded'`,
  `CREATE TABLE IF NOT EXISTS meeting_notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      meeting_id INTEGER NOT NULL UNIQUE REFERENCES meetings(id) ON DELETE CASCADE,
      notes_text TEXT,
      transcript TEXT,
      audio_file_path TEXT,
      summary TEXT,
      created_by INTEGER REFERENCES users(id),
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )`,
  `CREATE TABLE IF NOT EXISTS meeting_insights (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      meeting_id INTEGER NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
      conference_id INTEGER,
      company_id INTEGER,
      attendee_id INTEGER,
      insight_type TEXT NOT NULL,
      content TEXT NOT NULL,
      quote TEXT,
      timestamp_seconds INTEGER,
      icp_match_id INTEGER,
      confidence TEXT DEFAULT 'medium',
      confirmed INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )`,
  `CREATE INDEX IF NOT EXISTS idx_meeting_insights_meeting ON meeting_insights(meeting_id)`,
  `CREATE TABLE IF NOT EXISTS meeting_tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      meeting_id INTEGER NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
      insight_id INTEGER REFERENCES meeting_insights(id),
      task_text TEXT NOT NULL,
      assigned_to INTEGER REFERENCES users(id),
      due_date TEXT,
      status TEXT DEFAULT 'pending',
      created_by INTEGER REFERENCES users(id),
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )`,
  `CREATE TABLE IF NOT EXISTS debrief_notifications_sent (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      conference_id INTEGER NOT NULL REFERENCES conferences(id) ON DELETE CASCADE,
      sent_at TEXT DEFAULT (datetime('now')),
      UNIQUE(user_id, conference_id)
    )`,
  `ALTER TABLE config_options ADD COLUMN category_id INTEGER`,
  `ALTER TABLE config_options ADD COLUMN description TEXT`,
  `INSERT OR IGNORE INTO config_options (category, value, sort_order, is_system) VALUES ('product_category', 'General', 1, 1)`,
  `ALTER TABLE config_options ADD COLUMN metadata TEXT`,
  `ALTER TABLE quick_notes ADD COLUMN secondary_tag TEXT`,
  `CREATE INDEX IF NOT EXISTS idx_quick_notes_secondary_tag ON quick_notes(secondary_tag)`,
  `INSERT OR IGNORE INTO config_options (category, value, sort_order, is_system) VALUES ('meeting_type', 'Booth Demo', 1, 0)`,
  `INSERT OR IGNORE INTO config_options (category, value, sort_order, is_system) VALUES ('meeting_type', 'Booth Meeting', 2, 0)`,
  `ALTER TABLE quick_notes ADD COLUMN product_suggestions TEXT`,
  `ALTER TABLE meeting_insights ADD COLUMN source TEXT DEFAULT 'ai'`,
  `CREATE TABLE IF NOT EXISTS account_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    account_id TEXT NOT NULL,
    event_type TEXT NOT NULL,
    user_id INTEGER,
    metadata TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  )`,
  `CREATE INDEX IF NOT EXISTS idx_account_events_account ON account_events(account_id, created_at)`,
  `CREATE INDEX IF NOT EXISTS idx_account_events_type ON account_events(account_id, event_type)`,
  `CREATE TABLE IF NOT EXISTS account_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    account_id TEXT NOT NULL,
    user_id INTEGER,
    ip_address TEXT,
    started_at TEXT DEFAULT (datetime('now'))
  )`,
  `CREATE INDEX IF NOT EXISTS idx_account_sessions_account ON account_sessions(account_id, started_at)`,
  `CREATE TABLE IF NOT EXISTS account_feature_usage (
    account_id TEXT NOT NULL,
    user_id INTEGER NOT NULL DEFAULT -1,
    feature_key TEXT NOT NULL,
    last_used_at TEXT DEFAULT (datetime('now')),
    use_count INTEGER DEFAULT 1,
    PRIMARY KEY (account_id, user_id, feature_key)
  )`,
  // Industry field on companies
  `ALTER TABLE companies ADD COLUMN industry TEXT`,
  // Seed default industry options (skipped if already exist via IGNORE)
  `INSERT OR IGNORE INTO config_options (category, value, sort_order) VALUES ('industries', 'Industrial Manufacturing', 1)`,
  `INSERT OR IGNORE INTO config_options (category, value, sort_order) VALUES ('industries', 'Aerospace & Defense', 2)`,
  `INSERT OR IGNORE INTO config_options (category, value, sort_order) VALUES ('industries', 'Automotive', 3)`,
  `INSERT OR IGNORE INTO config_options (category, value, sort_order) VALUES ('industries', 'Food & Beverage', 4)`,
  `INSERT OR IGNORE INTO config_options (category, value, sort_order) VALUES ('industries', 'Chemicals', 5)`,
  `INSERT OR IGNORE INTO config_options (category, value, sort_order) VALUES ('industries', 'Construction & Engineering', 6)`,
  `INSERT OR IGNORE INTO config_options (category, value, sort_order) VALUES ('industries', 'Distribution', 7)`,
  `INSERT OR IGNORE INTO config_options (category, value, sort_order) VALUES ('industries', 'Fashion & Apparel', 8)`,
  `INSERT OR IGNORE INTO config_options (category, value, sort_order) VALUES ('industries', 'Machinery & Equipment', 9)`,
  `INSERT OR IGNORE INTO config_options (category, value, sort_order) VALUES ('industries', 'Logistics', 10)`,
  `INSERT OR IGNORE INTO config_options (category, value, sort_order) VALUES ('industries', 'Healthcare', 11)`,
  `INSERT OR IGNORE INTO config_options (category, value, sort_order) VALUES ('industries', 'Hospitality', 12)`,
  `INSERT OR IGNORE INTO config_options (category, value, sort_order) VALUES ('industries', 'Public Sector', 13)`,
  `INSERT OR IGNORE INTO config_options (category, value, sort_order) VALUES ('industries', 'Utilities', 14)`,
  `INSERT OR IGNORE INTO config_options (category, value, sort_order) VALUES ('industries', 'Professional Services', 15)`,
  `INSERT OR IGNORE INTO config_options (category, value, sort_order) VALUES ('industries', 'Financial Services', 16)`,
  `INSERT OR IGNORE INTO config_options (category, value, sort_order) VALUES ('industries', 'Retail', 17)`,
  `INSERT OR IGNORE INTO config_options (category, value, sort_order) VALUES ('industries', 'Technology', 18)`,
  // Persisted product-ICP signal table for server-side computation
  `CREATE TABLE IF NOT EXISTS attendee_product_signals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      attendee_id INTEGER NOT NULL REFERENCES attendees(id) ON DELETE CASCADE,
      conference_id INTEGER NOT NULL REFERENCES conferences(id) ON DELETE CASCADE,
      product_name TEXT NOT NULL,
      buyer_role TEXT,
      function_match TEXT,
      industry_match INTEGER DEFAULT 0,
      keyword_matches TEXT,
      computed_at TEXT DEFAULT (datetime('now')),
      UNIQUE(attendee_id, conference_id, product_name)
    )`,
  `CREATE INDEX IF NOT EXISTS idx_attendee_product_signals_conf ON attendee_product_signals(conference_id)`,
  `CREATE INDEX IF NOT EXISTS idx_attendee_product_signals_attendee ON attendee_product_signals(attendee_id)`,
  `ALTER TABLE companies ADD COLUMN products TEXT`,
  `CREATE TABLE IF NOT EXISTS title_normalization_rules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      organization_id INTEGER,
      raw_title TEXT NOT NULL,
      raw_title_key TEXT NOT NULL,
      normalized_title TEXT NOT NULL,
      function_id INTEGER REFERENCES config_options(id),
      seniority_id INTEGER REFERENCES config_options(id),
      buyer_role TEXT NOT NULL CHECK (buyer_role IN ('decision_maker', 'influencer', 'target_title', 'ignore')),
      source TEXT NOT NULL DEFAULT 'user_confirmed' CHECK (source IN ('user_confirmed', 'system_alias', 'fuzzy_match', 'imported')),
      confidence TEXT NOT NULL DEFAULT 'high' CHECK (confidence IN ('high', 'medium', 'low')),
      notes TEXT,
      created_by INTEGER REFERENCES users(id),
      updated_by INTEGER REFERENCES users(id),
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_title_norm_scope_raw ON title_normalization_rules(COALESCE(organization_id, 0), raw_title_key)`,
  `CREATE INDEX IF NOT EXISTS idx_title_norm_raw_key ON title_normalization_rules(raw_title_key)`,
  `ALTER TABLE company_relationships ADD COLUMN notes TEXT`,
  `ALTER TABLE conferences ADD COLUMN intel_refresh_count INTEGER DEFAULT 0`,
  `ALTER TABLE conferences ADD COLUMN intel_last_refresh_at TEXT`,
  `CREATE TABLE IF NOT EXISTS conference_company_intel (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    conference_id INTEGER NOT NULL REFERENCES conferences(id) ON DELETE CASCADE,
    company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    company_name TEXT NOT NULL,
    tier TEXT NOT NULL,
    summary TEXT,
    pain_point_signals TEXT,
    trigger_events TEXT,
    buying_signals TEXT,
    opening_angles TEXT,
    used_icp_fallback INTEGER DEFAULT 0,
    generated_at TEXT DEFAULT (datetime('now')),
    UNIQUE(conference_id, company_id)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_conf_company_intel_conf ON conference_company_intel(conference_id)`,
  `ALTER TABLE conferences ADD COLUMN intel_job_status TEXT`,
  `ALTER TABLE conferences ADD COLUMN intel_job_completed INTEGER DEFAULT 0`,
  `ALTER TABLE conferences ADD COLUMN intel_job_total INTEGER DEFAULT 0`,
  `ALTER TABLE conference_company_intel ADD COLUMN is_fallback INTEGER DEFAULT 0`,
  `ALTER TABLE entity_notes ADD COLUMN note_type TEXT DEFAULT 'note'`,
  `ALTER TABLE entity_notes ADD COLUMN meeting_id INTEGER`,
  `ALTER TABLE entity_notes ADD COLUMN insight_counts TEXT`,
  `ALTER TABLE follow_ups ADD COLUMN meeting_id INTEGER REFERENCES meetings(id)`,
  `ALTER TABLE meeting_notes ADD COLUMN analysis_status TEXT DEFAULT 'idle'`,
  `CREATE TABLE IF NOT EXISTS conference_series (
    id TEXT PRIMARY KEY,
    account_id TEXT NOT NULL,
    display_name TEXT NOT NULL,
    series_key TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(account_id, series_key)
  )`,
  `CREATE TABLE IF NOT EXISTS conference_seasons (
    id TEXT PRIMARY KEY,
    series_id TEXT NOT NULL,
    account_id TEXT NOT NULL,
    season_name TEXT NOT NULL,
    season_key TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (series_id) REFERENCES conference_series(id),
    UNIQUE(series_id, season_key)
  )`,
  `ALTER TABLE conferences ADD COLUMN series_id TEXT REFERENCES conference_series(id)`,
  `ALTER TABLE conferences ADD COLUMN season_id TEXT REFERENCES conference_seasons(id)`,
  // Conference saturation tracking
  `CREATE TABLE IF NOT EXISTS contact_conference_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    attendee_id INTEGER NOT NULL REFERENCES attendees(id) ON DELETE CASCADE,
    conference_id INTEGER NOT NULL REFERENCES conferences(id) ON DELETE CASCADE,
    series_id TEXT NOT NULL,
    recorded_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(attendee_id, conference_id)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_contact_conf_history_series ON contact_conference_history(series_id, attendee_id)`,
  `CREATE TABLE IF NOT EXISTS conference_saturation_snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    conference_id INTEGER NOT NULL REFERENCES conferences(id) ON DELETE CASCADE,
    series_id TEXT NOT NULL,
    saturation_score INTEGER NOT NULL DEFAULT 0,
    contacts_total INTEGER NOT NULL DEFAULT 0,
    contacts_net_new INTEGER NOT NULL DEFAULT 0,
    contacts_returning INTEGER NOT NULL DEFAULT 0,
    meetings_held INTEGER NOT NULL DEFAULT 0,
    substitutable_count INTEGER NOT NULL DEFAULT 0,
    health_green INTEGER NOT NULL DEFAULT 0,
    health_amber INTEGER NOT NULL DEFAULT 0,
    health_red INTEGER NOT NULL DEFAULT 0,
    companies_total INTEGER NOT NULL DEFAULT 0,
    companies_returning INTEGER NOT NULL DEFAULT 0,
    computed_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(conference_id)
  )`,
  `ALTER TABLE conferences ADD COLUMN total_registered INTEGER`,
  `ALTER TABLE conferences ADD COLUMN total_addressable INTEGER`,
  // Relationship health: add health_score storage column to attendees (computed on post-conference processing)
  `ALTER TABLE attendees ADD COLUMN health_score INTEGER`,
  // Relationship health: upgrade rep_relationship_type options with action_keys and colors
  `UPDATE config_options SET action_key = 'strong', color = '#3B6D11', is_system = 1 WHERE category = 'rep_relationship_type' AND value = 'Strong'`,
  `INSERT OR IGNORE INTO config_options (category, value, sort_order, action_key, is_system, color) VALUES ('rep_relationship_type', 'Trusted', 2, 'trusted', 1, '#185FA5')`,
  `INSERT OR IGNORE INTO config_options (category, value, sort_order, action_key, is_system, color) VALUES ('rep_relationship_type', 'Personal', 3, 'personal', 1, '#854F0B')`,
  `INSERT OR IGNORE INTO config_options (category, value, sort_order, action_key, is_system, color) VALUES ('rep_relationship_type', 'Family', 4, 'family', 1, '#A32D2D')`,
  // Relationship health: floor score cache on attendees
  `ALTER TABLE attendees ADD COLUMN relationship_floor INTEGER NOT NULL DEFAULT 0`,
  // Saturation v2: drop old wrong-schema tables
  `DROP TABLE IF EXISTS contact_conference_history`,
  `DROP TABLE IF EXISTS conference_saturation_snapshots`,
  // Saturation v2: contact_conference_history — one row per attendee per series, tracks interaction count
  `CREATE TABLE IF NOT EXISTS contact_conference_history (
    id TEXT PRIMARY KEY,
    account_id TEXT NOT NULL,
    attendee_id INTEGER NOT NULL,
    series_id TEXT NOT NULL,
    first_interaction_conference_id INTEGER NOT NULL,
    interaction_count INTEGER NOT NULL DEFAULT 1,
    last_interaction_conference_id INTEGER NOT NULL,
    last_meeting_outcome TEXT,
    cumulative_meetings INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(account_id, attendee_id, series_id),
    FOREIGN KEY (attendee_id) REFERENCES attendees(id),
    FOREIGN KEY (series_id) REFERENCES conference_series(id)
  )`,
  // Saturation v2: conference_saturation_snapshots — rich per-conference metrics
  `CREATE TABLE IF NOT EXISTS conference_saturation_snapshots (
    id TEXT PRIMARY KEY,
    account_id TEXT NOT NULL,
    conference_id INTEGER NOT NULL,
    series_id TEXT NOT NULL,
    season_id TEXT,
    snapshot_date TEXT NOT NULL,
    total_registered INTEGER,
    total_addressable INTEGER,
    contacts_ever_touched INTEGER NOT NULL DEFAULT 0,
    contacts_touched_this_conf INTEGER NOT NULL DEFAULT 0,
    contacts_net_new INTEGER NOT NULL DEFAULT 0,
    contacts_returning INTEGER NOT NULL DEFAULT 0,
    companies_ever_touched INTEGER NOT NULL DEFAULT 0,
    companies_net_new INTEGER NOT NULL DEFAULT 0,
    companies_returning INTEGER NOT NULL DEFAULT 0,
    meetings_held INTEGER NOT NULL DEFAULT 0,
    meetings_with_outcome INTEGER NOT NULL DEFAULT 0,
    contacts_high_health INTEGER NOT NULL DEFAULT 0,
    contacts_mid_health INTEGER NOT NULL DEFAULT 0,
    contacts_low_health INTEGER NOT NULL DEFAULT 0,
    contacts_droppable INTEGER NOT NULL DEFAULT 0,
    saturation_score INTEGER NOT NULL DEFAULT 0,
    new_contact_rate REAL NOT NULL DEFAULT 0,
    droppable_rate REAL NOT NULL DEFAULT 0,
    total_cost INTEGER,
    cost_per_new_contact INTEGER,
    cost_per_held_meeting INTEGER,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (conference_id) REFERENCES conferences(id),
    FOREIGN KEY (series_id) REFERENCES conference_series(id),
    FOREIGN KEY (season_id) REFERENCES conference_seasons(id)
  )`,
  // Fix: ensure rep_relationship_type options have action_keys set (INSERT OR IGNORE didn't update pre-existing rows)
  `UPDATE config_options SET action_key = 'strong',   color = '#3B6D11', is_system = 1 WHERE category = 'rep_relationship_type' AND LOWER(value) = 'strong'`,
  `UPDATE config_options SET action_key = 'trusted',  color = '#185FA5', is_system = 1 WHERE category = 'rep_relationship_type' AND LOWER(value) = 'trusted'`,
  `UPDATE config_options SET action_key = 'personal', color = '#854F0B', is_system = 1 WHERE category = 'rep_relationship_type' AND LOWER(value) = 'personal'`,
  `UPDATE config_options SET action_key = 'family',   color = '#A32D2D', is_system = 1 WHERE category = 'rep_relationship_type' AND LOWER(value) = 'family'`,
  `INSERT OR IGNORE INTO config_options (category, value, sort_order, action_key, is_system, color) VALUES ('rep_relationship_type', 'Strong',   1, 'strong',   1, '#3B6D11')`,
  `INSERT OR IGNORE INTO config_options (category, value, sort_order, action_key, is_system, color) VALUES ('rep_relationship_type', 'Trusted',  2, 'trusted',  1, '#185FA5')`,
  `INSERT OR IGNORE INTO config_options (category, value, sort_order, action_key, is_system, color) VALUES ('rep_relationship_type', 'Personal', 3, 'personal', 1, '#854F0B')`,
  `INSERT OR IGNORE INTO config_options (category, value, sort_order, action_key, is_system, color) VALUES ('rep_relationship_type', 'Family',   4, 'family',   1, '#A32D2D')`,
  // Buying committee: backfill default config into existing product metadata rows
  `UPDATE config_options SET metadata = json_patch(metadata, '{"buying_committee": {"decision_maker": true, "influencer": true, "target_title": true}}') WHERE category = 'products' AND metadata IS NOT NULL AND json_extract(metadata, '$.buying_committee') IS NULL`,
  // Seniority: lock existing options as system-managed (classifySeniority() can only output these nine strings)
  `UPDATE config_options SET is_system = 1 WHERE category = 'seniority' AND value IN ('C-Suite', 'VP/SVP', 'BOD', 'ED', 'Director', 'Manager', 'Associate', 'Admin', 'Other')`,
  `INSERT OR IGNORE INTO config_options (category, value, sort_order, is_system, color) VALUES ('seniority', 'C-Suite',   1, 1, 'dark-blue')`,
  `INSERT OR IGNORE INTO config_options (category, value, sort_order, is_system, color) VALUES ('seniority', 'VP/SVP',    2, 1, 'yellow')`,
  `INSERT OR IGNORE INTO config_options (category, value, sort_order, is_system, color) VALUES ('seniority', 'BOD',       3, 1, 'purple')`,
  `INSERT OR IGNORE INTO config_options (category, value, sort_order, is_system, color) VALUES ('seniority', 'ED',        4, 1, 'teal')`,
  `INSERT OR IGNORE INTO config_options (category, value, sort_order, is_system, color) VALUES ('seniority', 'Director',  5, 1, 'dark')`,
  `INSERT OR IGNORE INTO config_options (category, value, sort_order, is_system, color) VALUES ('seniority', 'Manager',   6, 1, 'orange')`,
  `INSERT OR IGNORE INTO config_options (category, value, sort_order, is_system, color) VALUES ('seniority', 'Associate', 7, 1, 'green')`,
  `INSERT OR IGNORE INTO config_options (category, value, sort_order, is_system, color) VALUES ('seniority', 'Admin',     8, 1, 'red')`,
  `INSERT OR IGNORE INTO config_options (category, value, sort_order, is_system, color) VALUES ('seniority', 'Other',     9, 1, 'gray')`,
  // Seniority: backfill NULL seniority on existing attendees using SQL approximation of classifySeniority()
  `UPDATE attendees SET seniority = CASE
    WHEN lower(title) LIKE '%vice president%'
      OR lower(title) LIKE '% svp %' OR lower(title) LIKE 'svp %' OR lower(title) LIKE '% svp' OR lower(title) = 'svp'
      OR lower(title) LIKE '% evp %' OR lower(title) LIKE 'evp %' OR lower(title) LIKE '% evp' OR lower(title) = 'evp'
      OR lower(title) LIKE '% avp %' OR lower(title) LIKE 'avp %' OR lower(title) LIKE '% avp' OR lower(title) = 'avp'
      OR lower(title) = 'vp' OR lower(title) LIKE 'vp %' OR lower(title) LIKE '% vp %' OR lower(title) LIKE '% vp'
      OR lower(title) LIKE '%controller%'
      THEN 'VP/SVP'
    WHEN lower(title) LIKE '%chief%'
      OR lower(title) LIKE '%president%'
      OR lower(title) LIKE '%founder%'
      OR lower(title) LIKE '%owner%'
      OR lower(title) LIKE '%principal%'
      OR lower(title) = 'ceo' OR lower(title) LIKE 'ceo %' OR lower(title) LIKE '% ceo %' OR lower(title) LIKE '% ceo'
      OR lower(title) = 'cfo' OR lower(title) LIKE 'cfo %' OR lower(title) LIKE '% cfo %' OR lower(title) LIKE '% cfo'
      OR lower(title) = 'coo' OR lower(title) LIKE 'coo %' OR lower(title) LIKE '% coo %' OR lower(title) LIKE '% coo'
      OR lower(title) = 'cto' OR lower(title) LIKE 'cto %' OR lower(title) LIKE '% cto %' OR lower(title) LIKE '% cto'
      OR lower(title) = 'cmo' OR lower(title) LIKE 'cmo %' OR lower(title) LIKE '% cmo %' OR lower(title) LIKE '% cmo'
      OR lower(title) = 'cio' OR lower(title) LIKE 'cio %' OR lower(title) LIKE '% cio %' OR lower(title) LIKE '% cio'
      OR lower(title) = 'chro' OR lower(title) LIKE 'chro %' OR lower(title) LIKE '% chro %' OR lower(title) LIKE '% chro'
      OR lower(title) = 'cpo' OR lower(title) LIKE 'cpo %' OR lower(title) LIKE '% cpo %' OR lower(title) LIKE '% cpo'
      OR lower(title) = 'cdo' OR lower(title) LIKE 'cdo %' OR lower(title) LIKE '% cdo %' OR lower(title) LIKE '% cdo'
      THEN 'C-Suite'
    WHEN lower(title) LIKE '%board%'
      OR lower(title) LIKE '%chairman%'
      OR lower(title) LIKE '%chairwoman%'
      OR lower(title) LIKE '%executive chairman%'
      THEN 'BOD'
    WHEN lower(title) LIKE '%executive director%'
      THEN 'ED'
    WHEN lower(title) LIKE '%director%'
      THEN 'Director'
    WHEN lower(title) LIKE '%manager%'
      THEN 'Manager'
    WHEN lower(title) LIKE '%associate%'
      THEN 'Associate'
    WHEN lower(title) LIKE '%assistant administrator%'
      THEN 'Admin'
    ELSE 'Other'
  END
  WHERE seniority IS NULL`,
  `ALTER TABLE meetings ADD COLUMN source TEXT DEFAULT 'rep'`,
  `ALTER TABLE follow_ups ADD COLUMN source TEXT DEFAULT 'rep'`,
  `ALTER TABLE attendee_touchpoints ADD COLUMN source TEXT DEFAULT 'rep'`,
  `CREATE TABLE IF NOT EXISTS user_agenda_preferences (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_email TEXT NOT NULL,
    conference_id INTEGER NOT NULL,
    preference TEXT NOT NULL DEFAULT 'auto',
    pending_global_notification INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(user_email, conference_id),
    FOREIGN KEY (conference_id) REFERENCES conferences(id)
  )`,
  `ALTER TABLE conferences ADD COLUMN global_agenda_uploaded_at TEXT`,
  `ALTER TABLE conferences ADD COLUMN global_agenda_uploaded_by_name TEXT`,
  // 404
  `ALTER TABLE conference_series ADD COLUMN industry_focus TEXT`,
  // 405
  `ALTER TABLE conference_series ADD COLUMN conference_type TEXT`,
  // 406
  `ALTER TABLE conferences ADD COLUMN industry_focus TEXT`,
  // 407
  `ALTER TABLE conferences ADD COLUMN conference_type TEXT`,
  // 408
  `ALTER TABLE conferences ADD COLUMN website TEXT`,
  // 409
  `ALTER TABLE conferences ADD COLUMN sponsorship_level TEXT`,
  // 410
  `ALTER TABLE conferences ADD COLUMN booth_present INTEGER NOT NULL DEFAULT 0`,
  // 411
  `ALTER TABLE conferences ADD COLUMN booth_width INTEGER`,
  // 412
  `ALTER TABLE conferences ADD COLUMN booth_height INTEGER`,
  // 413 — seed system sponsorship levels
  `INSERT OR IGNORE INTO config_options (category, value, sort_order, action_key, is_system, color) VALUES
    ('sponsorship_level', 'None',         0, 'none',     1, '#B4B2A9'),
    ('sponsorship_level', 'Bronze',       1, 'bronze',   1, '#BA7517'),
    ('sponsorship_level', 'Silver',       2, 'silver',   1, '#888780'),
    ('sponsorship_level', 'Gold',         3, 'gold',     1, '#EF9F27'),
    ('sponsorship_level', 'Platinum',     4, 'platinum', 1, '#185FA5'),
    ('sponsorship_level', 'Title Sponsor',5, 'title',    1, '#534AB7')`,
  // 414
  `ALTER TABLE conferences RENAME COLUMN booth_height TO booth_length`,
  // 415
  `ALTER TABLE conferences ADD COLUMN booth_number TEXT`,
  // 416
  `ALTER TABLE conferences ADD COLUMN booth_hall TEXT`,
  // 417 — ensure 'Partner' and 'Vendor' company_type options exist on all tenant DBs.
  // 'Prospect' was seeded via a prior migration; 'Partner' and 'Vendor' were only in the
  // initial seed (runs once on empty DBs) so older accounts may be missing them.
  `INSERT OR IGNORE INTO config_options (category, value, sort_order, action_key)
     VALUES ('company_type', 'Partner', (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM config_options WHERE category = 'company_type'), 'partner')`,
  `INSERT OR IGNORE INTO config_options (category, value, sort_order, action_key)
     VALUES ('company_type', 'Vendor', (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM config_options WHERE category = 'company_type'), 'vendor')`,
  // 418 — ensure 'Competitor' company_type option exists on all tenant DBs.
  // Competitor was only seeded via an earlier migration in this array which may have failed
  // silently on some tenant DBs (e.g. parlay-infor). It is not covered by migrateTenantDb
  // baseSeeds, so we re-seed it here with INSERT OR IGNORE to be safe.
  `INSERT OR IGNORE INTO config_options (category, value, sort_order, is_system, action_key, color)
     VALUES ('company_type', 'Competitor', 999, 1, 'competitor', '#dc2626')`,
  // 419 — force-correct the Competitor row in case the INSERT OR IGNORE above was skipped
  // (row already existed) but had stale/missing values from the earlier migration.
  `UPDATE config_options SET is_system = 1, action_key = 'competitor', color = '#dc2626'
     WHERE category = 'company_type' AND LOWER(TRIM(value)) = 'competitor'`,
  // 420 — background upload job tracking
  `CREATE TABLE IF NOT EXISTS upload_jobs (
    id TEXT PRIMARY KEY,
    conference_id INTEGER NOT NULL,
    conference_name TEXT NOT NULL DEFAULT '',
    account_id TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'processing',
    total_rows INTEGER NOT NULL DEFAULT 0,
    processed_rows INTEGER NOT NULL DEFAULT 0,
    new_count INTEGER,
    updated_count INTEGER,
    skipped_count INTEGER,
    error_message TEXT,
    created_by_user_id INTEGER,
    created_by_email TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    completed_at TEXT
  )`,
  // 421 — conference YoY snapshot store
  `CREATE TABLE IF NOT EXISTS conference_snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    conference_id INTEGER NOT NULL UNIQUE,
    series_id TEXT,
    snapshot_taken_at TEXT NOT NULL DEFAULT (datetime('now')),
    ces_score REAL,
    cost_efficiency_score REAL,
    total_cost REAL,
    pipeline_influenced REAL,
    pipeline_net_new REAL,
    pipeline_continued_engagement REAL,
    pipeline_per_1k REAL,
    cost_per_company_engaged REAL,
    cost_per_meeting_held REAL,
    icp_companies_total INTEGER,
    icp_companies_engaged INTEGER,
    icp_engagement_rate REAL,
    buying_committee_coverage_rate REAL,
    decision_makers_engaged INTEGER,
    meeting_hold_rate REAL,
    followup_scheduling_rate REAL,
    followup_completion_rate REAL,
    avg_health_score_engaged REAL,
    returning_attendee_rate REAL,
    companies_3plus_instances INTEGER,
    FOREIGN KEY (conference_id) REFERENCES conferences(id)
  )`,
  // 422 — conference_snapshots: strategy name
  `ALTER TABLE conference_snapshots ADD COLUMN strategy_name TEXT`,
  // 423 — conference_snapshots: sponsorship level
  `ALTER TABLE conference_snapshots ADD COLUMN sponsorship_level TEXT`,
  // 424 — conference_snapshots: booth presence flag
  `ALTER TABLE conference_snapshots ADD COLUMN booth_present INTEGER`,
  // 425 — conference_snapshots: booth width
  `ALTER TABLE conference_snapshots ADD COLUMN booth_width INTEGER`,
  // 426 — conference_snapshots: booth length
  `ALTER TABLE conference_snapshots ADD COLUMN booth_length INTEGER`,
  // 427 — conference_snapshots: booth number
  `ALTER TABLE conference_snapshots ADD COLUMN booth_number TEXT`,
  // 428 — conference_snapshots: booth hall
  `ALTER TABLE conference_snapshots ADD COLUMN booth_hall TEXT`,
  // 429 — conference_snapshots: raw budget total
  `ALTER TABLE conference_snapshots ADD COLUMN budget_total REAL`,
  // 430 — conference_snapshots: raw actual total
  `ALTER TABLE conference_snapshots ADD COLUMN actual_total REAL`,
  // 431 — conference_snapshots: budget variance (actual - budget)
  `ALTER TABLE conference_snapshots ADD COLUMN budget_variance REAL`,
  // 432 — conference_snapshots: raw line_items JSON string
  `ALTER TABLE conference_snapshots ADD COLUMN budget_line_items TEXT`,
  // 433 — conference_snapshots: required pipeline multiple
  `ALTER TABLE conference_snapshots ADD COLUMN required_pipeline_multiple REAL`,
  // 434 — conference_snapshots: required pipeline amount
  `ALTER TABLE conference_snapshots ADD COLUMN required_pipeline_amount REAL`,
  // 435 — conference_snapshots: expected return (actual_total × required_pipeline_multiple)
  `ALTER TABLE conference_snapshots ADD COLUMN expected_return_amount REAL`,
  // 436 — conference_snapshots: allocated cost per internal attendee (total_spend / num_internal_attendees)
  `ALTER TABLE conference_snapshots ADD COLUMN cost_per_internal_attendee REAL`,
  // 437 — conference_snapshots: pipeline influenced per meeting held
  `ALTER TABLE conference_snapshots ADD COLUMN pipeline_per_meeting REAL`,
  // 438 — conference_snapshots: pipeline influenced per company engaged
  `ALTER TABLE conference_snapshots ADD COLUMN pipeline_per_company REAL`,
  // 439 — conference_snapshots: pipeline influence execution score (0–100, = dim3PipelineIndex)
  `ALTER TABLE conference_snapshots ADD COLUMN pipeline_influence_execution_score REAL`,
  // 440 — conference_snapshots: meeting execution score (0–100, = dim2MeetingExec)
  `ALTER TABLE conference_snapshots ADD COLUMN meeting_execution_score REAL`,
  // 441 — conference_snapshots: followup execution score (0–100, = followup completion rate)
  `ALTER TABLE conference_snapshots ADD COLUMN followup_execution_score REAL`,
  // 442 — conference_snapshots: target account execution score (0–100, = target engagement pct)
  `ALTER TABLE conference_snapshots ADD COLUMN target_account_execution_score REAL`,
  // 443 — conference_snapshots: rep productivity score (0–100, weighted proxy)
  `ALTER TABLE conference_snapshots ADD COLUMN rep_productivity_score REAL`,
  // 444 — conference_snapshots: overall sales effectiveness score (0–100, weighted avg of components)
  `ALTER TABLE conference_snapshots ADD COLUMN sales_effectiveness_score REAL`,
  // 445 — conference_snapshots: overall pre-conference marketing audience signal score (0–100)
  `ALTER TABLE conference_snapshots ADD COLUMN marketing_audience_signal_score REAL`,
  // 446 — conference_snapshots: ICP coverage rate component score (weight 0.25)
  `ALTER TABLE conference_snapshots ADD COLUMN icp_coverage_rate_score REAL`,
  // 447 — conference_snapshots: buyer access quality component score (weight 0.25)
  `ALTER TABLE conference_snapshots ADD COLUMN buyer_access_quality_score REAL`,
  // 448 — conference_snapshots: conversation quality signal component score (weight 0.20)
  `ALTER TABLE conference_snapshots ADD COLUMN conversation_quality_signal_score REAL`,
  // 449 — conference_snapshots: market intelligence yield component score (weight 0.15)
  `ALTER TABLE conference_snapshots ADD COLUMN market_intelligence_yield_score REAL`,
  // 450 — conference_snapshots: engagement momentum component score (weight 0.15)
  `ALTER TABLE conference_snapshots ADD COLUMN engagement_momentum_score REAL`,
  // 451 — conference_snapshots: conference type (Trade show, Summit, etc.)
  `ALTER TABLE conference_snapshots ADD COLUMN conference_type TEXT`,
  // 452 — conference_snapshots: total attendee count at snapshot time
  `ALTER TABLE conference_snapshots ADD COLUMN attendee_count INTEGER`,
  // 453 — users: Clerk user ID for SSO integration
  `ALTER TABLE users ADD COLUMN clerk_id TEXT`,
  // 454 — users: unique index on clerk_id
  `CREATE UNIQUE INDEX IF NOT EXISTS users_clerk_id_idx ON users(clerk_id)`,
  // 455 — config_options: seed 'Booth' cost type for existing tenants
  `INSERT OR IGNORE INTO config_options (category, value, sort_order) VALUES ('cost_type', 'Booth', 10)`,
  // 456 — effectiveness_defaults: seed conference_cost_types if not already set
  `INSERT OR IGNORE INTO effectiveness_defaults (key, value) VALUES ('conference_cost_types', '["Registration","Sponsorship","Swag","Booth","Booth Setup","Travel","Lodging","Entertainment","Meals","Other"]')`,
  // 457 — closed_deals: track closed/won deals linked to companies
  `CREATE TABLE IF NOT EXISTS closed_deals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    deal_name TEXT NOT NULL,
    close_date TEXT NOT NULL,
    amount REAL,
    currency TEXT DEFAULT 'USD',
    notes TEXT,
    created_by_user_id INTEGER REFERENCES users(id),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  // 458 — closed_deal_products: products/services on each closed deal
  `CREATE TABLE IF NOT EXISTS closed_deal_products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    deal_id INTEGER NOT NULL REFERENCES closed_deals(id) ON DELETE CASCADE,
    product_name TEXT NOT NULL,
    quantity INTEGER DEFAULT 1,
    unit_price REAL,
    sort_order INTEGER DEFAULT 0
  )`,
  // 459 — closed_deals: external CRM opportunity ID
  `ALTER TABLE closed_deals ADD COLUMN opportunity_id TEXT`,
  // 460 — closed_deals: deal type (New Business, Upsell, Renewal, etc.)
  `ALTER TABLE closed_deals ADD COLUMN deal_type TEXT`,
  // 461 — closed_deals: contact / signor name
  `ALTER TABLE closed_deals ADD COLUMN contact_signor TEXT`,
  // 462 — closed_deals: attributed conference name
  `ALTER TABLE closed_deals ADD COLUMN attributed_conference TEXT`,
  // 463 — closed_deals: attribution type (Direct Source, Influenced, etc.)
  `ALTER TABLE closed_deals ADD COLUMN attribution_type TEXT`,
  // 464 — closed_deals: attributed sales rep name
  `ALTER TABLE closed_deals ADD COLUMN attributed_rep TEXT`,
  // 465 — closed_deals: attendee ID of the contact/signor (null for custom "Other" entry)
  `ALTER TABLE closed_deals ADD COLUMN contact_signor_attendee_id INTEGER`,
  // 466 — closed_deals: contact/signor job title
  `ALTER TABLE closed_deals ADD COLUMN contact_signor_title TEXT`,
  // 467 — closed_deals: contact/signor function (from config_options category=function)
  `ALTER TABLE closed_deals ADD COLUMN contact_signor_function TEXT`,
  // 468 — closed_deals: contact/signor seniority (from config_options category=seniority)
  `ALTER TABLE closed_deals ADD COLUMN contact_signor_seniority TEXT`,
  // 469 — closed_deals: attribution percentage (0–100) used to split deal value across attributed conferences
  `ALTER TABLE closed_deals ADD COLUMN attribution_pct REAL`,
  // 470 — company_type: Customer (seeded, name locked, form visibility editable)
  `INSERT OR IGNORE INTO config_options (category, value, sort_order, is_system) VALUES ('company_type', 'Customer', 9, 1)`,
  // 471 — company_type: Former Customer (seeded, name locked, form visibility editable)
  `INSERT OR IGNORE INTO config_options (category, value, sort_order, is_system) VALUES ('company_type', 'Former Customer', 10, 1)`,
  // 472 — remove seeded Client status option (replaced by Customer company type)
  `DELETE FROM config_options WHERE category = 'status' AND value = 'Client' AND is_system = 1`,
  // 473 — conference_plans: planning decisions and budget targets per conference per year
  `CREATE TABLE IF NOT EXISTS conference_plans (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    conference_id INTEGER NOT NULL REFERENCES conferences(id) ON DELETE CASCADE,
    plan_year INTEGER NOT NULL,
    decision TEXT CHECK(decision IN ('attend','reduce','cut','evaluating','new')),
    planned_budget REAL,
    planned_headcount INTEGER,
    planned_pipeline_target REAL,
    notes TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    UNIQUE(conference_id, plan_year)
  )`,
  // 474 — input_request_tokens: one-time tokenised links sent in input-request emails
  `CREATE TABLE IF NOT EXISTS input_request_tokens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    token TEXT NOT NULL UNIQUE,
    account_id TEXT NOT NULL,
    conference_id INTEGER NOT NULL REFERENCES conferences(id) ON DELETE CASCADE,
    requester_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    recipient_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    recipient_email TEXT NOT NULL,
    recipient_name TEXT NOT NULL,
    recipient_title TEXT,
    expires_at TEXT NOT NULL,
    used_at TEXT,
    decision_logged TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  )`,
  // 475 — input_requests: tracks outstanding/responded requests per conference + recipient
  `CREATE TABLE IF NOT EXISTS input_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    conference_id INTEGER NOT NULL REFERENCES conferences(id) ON DELETE CASCADE,
    requester_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    recipient_email TEXT NOT NULL,
    recipient_name TEXT NOT NULL,
    recipient_title TEXT,
    recipient_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','responded','expired')),
    created_at TEXT DEFAULT (datetime('now')),
    UNIQUE(conference_id, recipient_email)
  )`,
  // 476 — input_request_reminders: log of reminder emails sent per request
  `CREATE TABLE IF NOT EXISTS input_request_reminders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    account_id TEXT NOT NULL,
    conference_id INTEGER NOT NULL,
    recipient_email TEXT NOT NULL,
    sent_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  // 477 — attendee_touchpoints.logged_by: config_option id of the rep who logged the touchpoint
  // (same format as meetings.scheduled_by / follow_ups.assigned_rep). Historical and simulated
  // rows predate this column and remain NULL.
  `ALTER TABLE attendee_touchpoints ADD COLUMN logged_by TEXT`,
  // 478 — follow_ups.touchpoint_id: links a follow-up back to the touchpoint that auto-created it,
  // mirroring the existing follow_ups.meeting_id link for meeting-originated follow-ups.
  `ALTER TABLE follow_ups ADD COLUMN touchpoint_id INTEGER REFERENCES attendee_touchpoints(id)`,
  // 479 — conferences: structured location data captured via the Google Places autocomplete
  // field, alongside the existing free-text `location` display value. Supports location
  // aggregation and (future) timezone-aware calendar invites. All nullable since historical
  // rows and free-typed locations won't have structured data.
  `ALTER TABLE conferences ADD COLUMN location_place_id TEXT`,
  `ALTER TABLE conferences ADD COLUMN location_lat REAL`,
  `ALTER TABLE conferences ADD COLUMN location_lng REAL`,
  `ALTER TABLE conferences ADD COLUMN location_city TEXT`,
  `ALTER TABLE conferences ADD COLUMN location_state TEXT`,
  `ALTER TABLE conferences ADD COLUMN location_country TEXT`,
  `ALTER TABLE conferences ADD COLUMN location_timezone TEXT`,
  // 480 — form_elements: free-position/resize canvas elements (images, rich-text blocks) for
  // the revamped Conference Form editor. Replaces the old single image_url/html_content
  // fields on conference_forms with an unbounded, drag/resize-positioned set of elements.
  `CREATE TABLE IF NOT EXISTS form_elements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    conference_form_id INTEGER NOT NULL REFERENCES conference_forms(id) ON DELETE CASCADE,
    element_type TEXT NOT NULL CHECK(element_type IN ('image','text')),
    x REAL NOT NULL DEFAULT 40,
    y REAL NOT NULL DEFAULT 40,
    width REAL NOT NULL DEFAULT 280,
    height REAL NOT NULL DEFAULT 200,
    z_index INTEGER NOT NULL DEFAULT 0,
    content TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  )`,
  `CREATE INDEX IF NOT EXISTS idx_form_elements_form ON form_elements(conference_form_id)`,
  // 481 — conference_forms.form_x: the form card's own free x position on the new canvas
  // (form_offset_y is reused as its y position; form_width/form_height as its size).
  `ALTER TABLE conference_forms ADD COLUMN form_x REAL`,
  // 482 — backfill: migrate each existing form's single image_url/html_content into the new
  // form_elements canvas model so nothing is lost when the editor switches to free elements.
  `INSERT INTO form_elements (conference_form_id, element_type, x, y, width, height, z_index, content)
   SELECT id, 'image', 40, 40, 320, 240, 0, image_url FROM conference_forms
   WHERE image_url IS NOT NULL AND TRIM(image_url) != ''`,
  `INSERT INTO form_elements (conference_form_id, element_type, x, y, width, height, z_index, content)
   SELECT id, 'text', 40, 300, 320, 320, 1, html_content FROM conference_forms
   WHERE html_content IS NOT NULL AND TRIM(html_content) != ''`,
  // 483 — conference_forms: optional full-bleed background image, drawn beneath the page
  // background color/gradient with an adjustable opacity. Distinct from the per-element
  // image blocks on the canvas (form_elements).
  `ALTER TABLE conference_forms ADD COLUMN background_image_url TEXT`,
  `ALTER TABLE conference_forms ADD COLUMN background_image_opacity REAL`,
  // 484 — form_elements: per-image fit mode + focal point. Images default to 'contain' so
  // resizing the element to any aspect ratio never crops the picture; users can opt into
  // 'cover' (crop) and drag to choose which part of the image shows via focal_x/focal_y
  // (0-100, used as CSS object-position).
  `ALTER TABLE form_elements ADD COLUMN object_fit TEXT NOT NULL DEFAULT 'contain'`,
  `ALTER TABLE form_elements ADD COLUMN focal_x REAL NOT NULL DEFAULT 50`,
  `ALTER TABLE form_elements ADD COLUMN focal_y REAL NOT NULL DEFAULT 50`,
  // 485 — conference_forms.form_z_index: lets the form card itself participate in the same
  // front/back layering stack as its canvas elements (images/text), instead of always
  // rendering above them. Defaults high so existing forms keep their prior on-top behavior.
  `ALTER TABLE conference_forms ADD COLUMN form_z_index INTEGER NOT NULL DEFAULT 1000`,
  // 486 — form_elements: widen element_type to allow 'video' alongside 'image'/'text'.
  // SQLite can't alter an existing CHECK constraint in place, so the table is recreated
  // with the wider constraint and its rows copied across (RENAME preserves the
  // AUTOINCREMENT sequence, so existing element ids are unaffected).
  `CREATE TABLE form_elements_new (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    conference_form_id INTEGER NOT NULL REFERENCES conference_forms(id) ON DELETE CASCADE,
    element_type TEXT NOT NULL CHECK(element_type IN ('image','text','video')),
    x REAL NOT NULL DEFAULT 40,
    y REAL NOT NULL DEFAULT 40,
    width REAL NOT NULL DEFAULT 280,
    height REAL NOT NULL DEFAULT 200,
    z_index INTEGER NOT NULL DEFAULT 0,
    content TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    object_fit TEXT NOT NULL DEFAULT 'contain',
    focal_x REAL NOT NULL DEFAULT 50,
    focal_y REAL NOT NULL DEFAULT 50
  )`,
  `INSERT INTO form_elements_new
     (id, conference_form_id, element_type, x, y, width, height, z_index, content, created_at, object_fit, focal_x, focal_y)
   SELECT id, conference_form_id, element_type, x, y, width, height, z_index, content, created_at, object_fit, focal_x, focal_y
   FROM form_elements`,
  `DROP TABLE form_elements`,
  `ALTER TABLE form_elements_new RENAME TO form_elements`,
  `CREATE INDEX IF NOT EXISTS idx_form_elements_form ON form_elements(conference_form_id)`,
  // 487 — conference_forms: optional full-bleed background video (parallel to
  // background_image_url), with its own opacity so switching between a background image
  // and a background video doesn't clobber either one's saved settings. If both are set,
  // the video takes precedence.
  `ALTER TABLE conference_forms ADD COLUMN background_video_url TEXT`,
  `ALTER TABLE conference_forms ADD COLUMN background_video_opacity REAL`,
  // 488 — conference_forms: optional overrides for the small "eyebrow" caption text under
  // the form name and for the submit button's background color. Null means "use the
  // automatic default" (matches the form card's text color / auto-contrasts it), same
  // fallback behavior as before these were configurable.
  `ALTER TABLE conference_forms ADD COLUMN eyebrow_color TEXT`,
  `ALTER TABLE conference_forms ADD COLUMN submit_button_color TEXT`,
  // 489 — form_elements: square vs rounded corners for image/video elements.
  `ALTER TABLE form_elements ADD COLUMN corner_style TEXT NOT NULL DEFAULT 'rounded'`,
];
