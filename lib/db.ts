import { createClient } from '@libsql/client';

export const db = createClient({
  url: process.env.TURSO_DATABASE_URL!,
  authToken: process.env.TURSO_AUTH_TOKEN!,
});

export async function initDb(): Promise<void> {
  await db.executeMultiple(`
    CREATE TABLE IF NOT EXISTS conferences (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      location TEXT NOT NULL,
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS companies (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      website TEXT,
      profit_type TEXT,
      company_type TEXT,
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS attendees (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      first_name TEXT NOT NULL,
      last_name TEXT NOT NULL,
      title TEXT,
      company_id INTEGER REFERENCES companies(id),
      email TEXT,
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS conference_attendees (
      conference_id INTEGER REFERENCES conferences(id) ON DELETE CASCADE,
      attendee_id INTEGER REFERENCES attendees(id) ON DELETE CASCADE,
      PRIMARY KEY (conference_id, attendee_id)
    );
  `);

  // New tables
  await db.executeMultiple(`
    CREATE TABLE IF NOT EXISTS conference_attendee_details (
      attendee_id INTEGER NOT NULL,
      conference_id INTEGER NOT NULL,
      action TEXT,
      next_steps TEXT,
      next_steps_notes TEXT,
      notes TEXT,
      PRIMARY KEY (attendee_id, conference_id),
      FOREIGN KEY (attendee_id) REFERENCES attendees(id) ON DELETE CASCADE,
      FOREIGN KEY (conference_id) REFERENCES conferences(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS config_options (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category TEXT NOT NULL,
      value TEXT NOT NULL,
      sort_order INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );
  `);

  // Users table for authentication
  await db.execute({
    sql: `CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'administrator')),
      email_verified INTEGER NOT NULL DEFAULT 0,
      verification_token TEXT,
      reset_token TEXT,
      reset_token_expires INTEGER,
      created_at TEXT DEFAULT (datetime('now'))
    )`,
    args: [],
  });

  // Run migrations — ignore errors if columns already exist
  const migrations = [
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
    `UPDATE config_options SET color = 'blue' WHERE category = 'action' AND value = 'Meeting Scheduled' AND color IS NULL`,
    `UPDATE config_options SET color = 'green' WHERE category = 'action' AND value = 'Meeting Held' AND color IS NULL`,
    `UPDATE config_options SET color = 'purple' WHERE category = 'action' AND value = 'Social Conversation' AND color IS NULL`,
    `UPDATE config_options SET color = 'orange' WHERE category = 'action' AND value = 'Rescheduled' AND color IS NULL`,
    `UPDATE config_options SET color = 'red' WHERE category = 'action' AND value = 'Meeting No-Show' AND color IS NULL`,
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
    `UPDATE config_options SET action_key = 'meeting_scheduled' WHERE category = 'action' AND value = 'Meeting Scheduled' AND action_key IS NULL`,
    `UPDATE config_options SET action_key = 'meeting_held' WHERE category = 'action' AND value = 'Meeting Held' AND action_key IS NULL`,
    `UPDATE config_options SET action_key = 'rescheduled' WHERE category = 'action' AND value = 'Rescheduled' AND action_key IS NULL`,
    `UPDATE config_options SET action_key = 'cancelled' WHERE category = 'action' AND value = 'Cancelled' AND action_key IS NULL`,
    `UPDATE config_options SET action_key = 'no_show' WHERE category = 'action' AND value = 'Meeting No-Show' AND action_key IS NULL`,
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
    // Annual conference budget targets (per year, for global reporting)
    `CREATE TABLE IF NOT EXISTS annual_budgets (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      year       INTEGER NOT NULL UNIQUE,
      amount     REAL    NOT NULL,
      created_at TEXT    DEFAULT (datetime('now'))
    )`,
  ];
  // Split into DDL (schema) and DML (data) so data ops don't race against column creation.
  // Each group runs in parallel; groups stay sequential relative to each other.
  const ddlMigrations = migrations.filter(sql => /^\s*(CREATE|ALTER)/i.test(sql));
  const dmlMigrations = migrations.filter(sql => /^\s*(UPDATE|INSERT|DELETE)/i.test(sql));
  await Promise.all(ddlMigrations.map(sql => db.execute({ sql, args: [] }).catch(() => {})));
  await Promise.all(dmlMigrations.map(sql => db.execute({ sql, args: [] }).catch(() => {})));

  // Belt-and-suspenders: explicitly verify critical columns exist and add them if missing.
  // This catches cases where ALTER TABLE silently failed or code was deployed without migrations.
  try {
    const attendeeCols = await db.execute({ sql: 'PRAGMA table_info(attendees)', args: [] });
    const attendeeColNames = new Set(attendeeCols.rows.map(r => String(r.name)));
    if (!attendeeColNames.has('function')) {
      await db.execute({ sql: 'ALTER TABLE attendees ADD COLUMN "function" TEXT', args: [] }).catch(() => {});
    }
    if (!attendeeColNames.has('products')) {
      await db.execute({ sql: 'ALTER TABLE attendees ADD COLUMN products TEXT', args: [] }).catch(() => {});
    }
    const companyCols = await db.execute({ sql: 'PRAGMA table_info(companies)', args: [] });
    const companyColNames = new Set(companyCols.rows.map(r => String(r.name)));
    if (!companyColNames.has('products')) {
      await db.execute({ sql: 'ALTER TABLE companies ADD COLUMN products TEXT', args: [] }).catch(() => {});
    }
    const configCols = await db.execute({ sql: 'PRAGMA table_info(config_options)', args: [] });
    const configColNames = new Set(configCols.rows.map(r => String(r.name)));
    if (!configColNames.has('is_system')) {
      await db.execute({ sql: 'ALTER TABLE config_options ADD COLUMN is_system INTEGER NOT NULL DEFAULT 0', args: [] }).catch(() => {});
    }
  } catch { /* PRAGMA not supported — skip */ }

  // Ensure exactly one unit_type row exists; seed with 'Units' for new installs
  const utCheck = await db.execute({ sql: "SELECT id FROM config_options WHERE category = 'unit_type' ORDER BY id", args: [] });
  if (utCheck.rows.length === 0) {
    await db.execute({ sql: "INSERT INTO config_options (category, value, sort_order) VALUES ('unit_type', 'Units', 0)", args: [] });
  } else if (utCheck.rows.length > 1) {
    // Remove duplicates, keep oldest row
    const dupeIds = utCheck.rows.slice(1).map(r => Number(r.id));
    for (const id of dupeIds) {
      await db.execute({ sql: 'DELETE FROM config_options WHERE id = ?', args: [id] }).catch(() => {});
    }
  }

  // Migrate existing follow-up data from conference_attendee_details to follow_ups table
  try {
    const existing = await db.execute({
      sql: `SELECT COUNT(*) as cnt FROM follow_ups`,
      args: [],
    });
    if (Number(existing.rows[0].cnt) === 0) {
      await db.execute({
        sql: `INSERT INTO follow_ups (attendee_id, conference_id, next_steps, next_steps_notes, assigned_rep, completed)
              SELECT attendee_id, conference_id, next_steps, next_steps_notes, assigned_rep, COALESCE(completed, 0)
              FROM conference_attendee_details
              WHERE next_steps IS NOT NULL AND next_steps != ''`,
        args: [],
      });
    }
  } catch { /* table may not exist yet or migration already done */ }

  // Seed config_options if empty
  const configCount = await db.execute({ sql: 'SELECT COUNT(*) as cnt FROM config_options', args: [] });
  if (Number(configCount.rows[0].cnt) === 0) {
    const seeds: Array<{ category: string; value: string; sort_order: number }> = [
      { category: 'company_type', value: '3rd Party Operator', sort_order: 1 },
      { category: 'company_type', value: 'Owner/Operator', sort_order: 2 },
      { category: 'company_type', value: 'Capital Partner', sort_order: 3 },
      { category: 'company_type', value: 'Vendor', sort_order: 4 },
      { category: 'company_type', value: 'Partner', sort_order: 5 },
      { category: 'company_type', value: 'Other', sort_order: 6 },
      { category: 'status', value: 'Client', sort_order: 1 },
      { category: 'status', value: 'Priority', sort_order: 2 },
      { category: 'status', value: 'Interested', sort_order: 3 },
      { category: 'status', value: 'Not Interested', sort_order: 4 },
      { category: 'status', value: 'Unknown', sort_order: 5 },
      { category: 'action', value: 'Meeting Scheduled', sort_order: 1 },
      { category: 'action', value: 'Meeting Held', sort_order: 2 },
      { category: 'action', value: 'Rescheduled', sort_order: 3 },
      { category: 'action', value: 'Cancelled', sort_order: 4 },
      { category: 'action', value: 'Meeting No-Show', sort_order: 5 },
      { category: 'action', value: 'Social Conversation', sort_order: 6 },
      { category: 'action', value: 'Pending', sort_order: 7 },
      { category: 'next_steps', value: 'Schedule Follow Up Meeting', sort_order: 1 },
      { category: 'next_steps', value: 'General Follow Up', sort_order: 2 },
      { category: 'next_steps', value: 'Other', sort_order: 3 },
    ];
    await Promise.all(seeds.map(seed =>
      db.execute({
        sql: 'INSERT OR IGNORE INTO config_options (category, value, sort_order) VALUES (?, ?, ?)',
        args: [seed.category, seed.value, seed.sort_order],
      }).catch(() => {})
    ));
  }

  // Always ensure seniority and profit_type seeds exist (for existing DBs)
  const newCategorySeeds: Array<{ category: string; value: string; sort_order: number }> = [
    { category: 'seniority', value: 'C-Suite', sort_order: 1 },
    { category: 'seniority', value: 'BOD', sort_order: 2 },
    { category: 'seniority', value: 'VP/SVP', sort_order: 3 },
    { category: 'seniority', value: 'VP Level', sort_order: 4 },
    { category: 'seniority', value: 'ED', sort_order: 5 },
    { category: 'seniority', value: 'Director', sort_order: 6 },
    { category: 'seniority', value: 'Manager', sort_order: 7 },
    { category: 'seniority', value: 'Associate', sort_order: 8 },
    { category: 'seniority', value: 'Admin', sort_order: 9 },
    { category: 'seniority', value: 'Other', sort_order: 10 },
    { category: 'profit_type', value: 'For-Profit', sort_order: 1 },
    { category: 'profit_type', value: 'Non-Profit', sort_order: 2 },
    { category: 'action', value: 'Rescheduled', sort_order: 3 },
    { category: 'action', value: 'Cancelled', sort_order: 4 },
    { category: 'action', value: 'Pending', sort_order: 5 },
    { category: 'company_type', value: 'Capital', sort_order: 7 },
    { category: 'company_type', value: 'Operator', sort_order: 8 },
    { category: 'entity_structure', value: 'Parent', sort_order: 1 },
    { category: 'entity_structure', value: 'Child', sort_order: 2 },
    { category: 'services', value: 'IL', sort_order: 1 },
    { category: 'services', value: 'AL', sort_order: 2 },
    { category: 'services', value: 'MC', sort_order: 3 },
    { category: 'services', value: 'SNF', sort_order: 4 },
    { category: 'services', value: 'CCRC', sort_order: 5 },
    { category: 'services', value: 'Other', sort_order: 6 },
    { category: 'services', value: 'N/A', sort_order: 7 },
    { category: 'event_type', value: 'Sponsored Event', sort_order: 1 },
    { category: 'event_type', value: 'Lunch', sort_order: 2 },
    { category: 'event_type', value: 'Dinner', sort_order: 3 },
    { category: 'event_type', value: 'Company Hosted', sort_order: 4 },
    { category: 'event_type', value: 'Partner', sort_order: 5 },
    { category: 'event_type', value: 'Conference Event', sort_order: 6 },
    { category: 'rep_relationship_type', value: 'Strong', sort_order: 1 },
    { category: 'rep_relationship_type', value: 'Former Client', sort_order: 2 },
    { category: 'rep_relationship_type', value: 'Other', sort_order: 3 },
    { category: 'meeting_type', value: 'Pre-Scheduled', sort_order: 1 },
    { category: 'meeting_type', value: 'Speed', sort_order: 2 },
    // Attendee function (department/role)
    { category: 'function', value: 'Operations', sort_order: 1 },
    { category: 'function', value: 'Finance', sort_order: 2 },
    { category: 'function', value: 'Sales', sort_order: 3 },
    { category: 'function', value: 'Marketing', sort_order: 4 },
    { category: 'function', value: 'HR', sort_order: 5 },
    { category: 'function', value: 'Legal', sort_order: 6 },
    { category: 'function', value: 'IT', sort_order: 7 },
    { category: 'function', value: 'Accounting', sort_order: 8 },
    // Products
    { category: 'products', value: 'Product', sort_order: 1 },
    // Cost Types
    { category: 'cost_type', value: 'Registration', sort_order: 1 },
    { category: 'cost_type', value: 'Sponsorship', sort_order: 2 },
    { category: 'cost_type', value: 'Swag', sort_order: 3 },
    { category: 'cost_type', value: 'Booth Setup', sort_order: 4 },
    { category: 'cost_type', value: 'Travel', sort_order: 5 },
    { category: 'cost_type', value: 'Lodging', sort_order: 6 },
    { category: 'cost_type', value: 'Entertainment', sort_order: 7 },
    { category: 'cost_type', value: 'Meals', sort_order: 8 },
    { category: 'cost_type', value: 'Other', sort_order: 9 },
  ];

  // For categories that are entirely new to the app (not backfills of pre-existing categories),
  // only seed if the category currently has zero options. This prevents re-inserting the original
  // seeded value after an admin renames it (which would create a duplicate).
  const newOnlyCats = new Set(['function', 'products', 'cost_type']);
  const newOnlySeeds = newCategorySeeds.filter(s => newOnlyCats.has(s.category));
  const backfillSeeds = newCategorySeeds.filter(s => !newOnlyCats.has(s.category));

  // Backfill seeds: run INSERT OR IGNORE unconditionally (ensures missing values for existing DBs)
  await Promise.all(backfillSeeds.map(seed =>
    db.execute({
      sql: 'INSERT OR IGNORE INTO config_options (category, value, sort_order) VALUES (?, ?, ?)',
      args: [seed.category, seed.value, seed.sort_order],
    }).catch(() => {})
  ));

  // New-category seeds: only seed when the category has no options yet (fresh install)
  for (const cat of Array.from(newOnlyCats)) {
    const countRow = await db.execute({ sql: 'SELECT COUNT(*) as cnt FROM config_options WHERE category = ?', args: [cat] }).catch(() => null);
    if (countRow && Number(countRow.rows[0]?.cnt ?? 1) === 0) {
      const seeds = newOnlySeeds.filter(s => s.category === cat);
      await Promise.all(seeds.map(seed =>
        db.execute({
          sql: 'INSERT OR IGNORE INTO config_options (category, value, sort_order) VALUES (?, ?, ?)',
          args: [seed.category, seed.value, seed.sort_order],
        }).catch(() => {})
      ));
    }
  }

  // Mark all system-seeded config_options as protected from deletion (runs every startup; safe)
  const systemSeeds: Array<{ category: string; value: string }> = [
    { category: 'company_type', value: '3rd Party Operator' },
    { category: 'company_type', value: 'Owner/Operator' },
    { category: 'company_type', value: 'Capital Partner' },
    { category: 'company_type', value: 'Vendor' },
    { category: 'company_type', value: 'Partner' },
    { category: 'company_type', value: 'Other' },
    { category: 'company_type', value: 'Capital' },
    { category: 'company_type', value: 'Operator' },
    { category: 'status', value: 'Client' },
    { category: 'status', value: 'Priority' },
    { category: 'status', value: 'Interested' },
    { category: 'status', value: 'Not Interested' },
    { category: 'status', value: 'Unknown' },
    { category: 'action', value: 'Meeting Scheduled' },
    { category: 'action', value: 'Meeting Held' },
    { category: 'action', value: 'Rescheduled' },
    { category: 'action', value: 'Cancelled' },
    { category: 'action', value: 'Meeting No-Show' },
    { category: 'action', value: 'Social Conversation' },
    { category: 'action', value: 'Pending' },
    { category: 'next_steps', value: 'Schedule Follow Up Meeting' },
    { category: 'next_steps', value: 'General Follow Up' },
    { category: 'next_steps', value: 'Other' },
    { category: 'next_steps', value: 'Post-Mtg' },
    { category: 'seniority', value: 'C-Suite' },
    { category: 'seniority', value: 'BOD' },
    { category: 'seniority', value: 'VP/SVP' },
    { category: 'seniority', value: 'VP Level' },
    { category: 'seniority', value: 'ED' },
    { category: 'seniority', value: 'Director' },
    { category: 'seniority', value: 'Manager' },
    { category: 'seniority', value: 'Associate' },
    { category: 'seniority', value: 'Admin' },
    { category: 'seniority', value: 'Other' },
    { category: 'profit_type', value: 'For-Profit' },
    { category: 'profit_type', value: 'Non-Profit' },
    { category: 'entity_structure', value: 'Parent' },
    { category: 'entity_structure', value: 'Child' },
    { category: 'services', value: 'IL' },
    { category: 'services', value: 'AL' },
    { category: 'services', value: 'MC' },
    { category: 'services', value: 'SNF' },
    { category: 'services', value: 'CCRC' },
    { category: 'services', value: 'Other' },
    { category: 'services', value: 'N/A' },
    { category: 'event_type', value: 'Sponsored Event' },
    { category: 'event_type', value: 'Lunch' },
    { category: 'event_type', value: 'Dinner' },
    { category: 'event_type', value: 'Company Hosted' },
    { category: 'event_type', value: 'Partner' },
    { category: 'event_type', value: 'Conference Event' },
    { category: 'rep_relationship_type', value: 'Strong' },
    { category: 'rep_relationship_type', value: 'Former Client' },
    { category: 'rep_relationship_type', value: 'Other' },
    { category: 'meeting_type', value: 'Pre-Scheduled' },
    { category: 'meeting_type', value: 'Speed' },
    { category: 'touchpoints', value: 'Booth Stop' },
    { category: 'touchpoints', value: 'Coffee' },
    { category: 'touchpoints', value: 'Dinner' },
    { category: 'touchpoints', value: 'Event' },
    { category: 'touchpoints', value: 'Breakfast/Lunch' },
    { category: 'touchpoints', value: 'Other' },
    { category: 'attendee_conference_status', value: 'Target' },
    { category: 'function', value: 'Operations' },
    { category: 'function', value: 'Finance' },
    { category: 'function', value: 'Sales' },
    { category: 'function', value: 'Marketing' },
    { category: 'function', value: 'HR' },
    { category: 'function', value: 'Legal' },
    { category: 'function', value: 'IT' },
    { category: 'function', value: 'Accounting' },
    { category: 'products', value: 'Product' },
    { category: 'cost_type', value: 'Registration' },
    { category: 'cost_type', value: 'Sponsorship' },
    { category: 'cost_type', value: 'Swag' },
    { category: 'cost_type', value: 'Booth Setup' },
    { category: 'cost_type', value: 'Travel' },
    { category: 'cost_type', value: 'Lodging' },
    { category: 'cost_type', value: 'Entertainment' },
    { category: 'cost_type', value: 'Meals' },
    { category: 'cost_type', value: 'Other' },
  ];
  await Promise.all(systemSeeds.map(seed =>
    db.execute({
      sql: 'UPDATE config_options SET is_system = 1 WHERE category = ? AND value = ?',
      args: [seed.category, seed.value],
    }).catch(() => {})
  ));

  // Seed default Lead Capture form template if no templates exist
  try {
    const tmplCount = await db.execute({ sql: 'SELECT COUNT(*) as cnt FROM form_templates', args: [] });
    if (Number(tmplCount.rows[0].cnt) === 0) {
      const tmplResult = await db.execute({
        sql: `INSERT INTO form_templates (name, created_by) VALUES ('Lead Capture', 'system') RETURNING id`,
        args: [],
      });
      const tmplId = Number(tmplResult.rows[0].id);
      const defaultFields = [
        { field_type: 'attendee_picker', field_key: 'attendee_name', label: 'Name', sort_order: 1, required: 1 },
        { field_type: 'text_single', field_key: 'title', label: 'Title', sort_order: 2, required: 0 },
        { field_type: 'text_single', field_key: 'company', label: 'Company', sort_order: 3, required: 0 },
        { field_type: 'text_single', field_key: 'email', label: 'Email Address', sort_order: 4, required: 0 },
        { field_type: 'text_paragraph', field_key: 'notes', label: 'Notes', sort_order: 5, required: 0 },
      ];
      for (const f of defaultFields) {
        await db.execute({
          sql: `INSERT INTO form_fields (template_id, field_type, field_key, label, sort_order, required) VALUES (?, ?, ?, ?, ?, ?)`,
          args: [tmplId, f.field_type, f.field_key, f.label, f.sort_order, f.required],
        });
      }
    }
  } catch { /* ignore if tables not yet created on first run — will seed on next startup */ }

  // Remove legacy "True"/"False" ICP config options if they exist
  try {
    await db.execute({
      sql: "DELETE FROM config_options WHERE category = 'icp' AND value IN ('True', 'False')",
      args: [],
    });
  } catch { /* ignore */ }

  // Always ensure action_key is set for meeting-related actions (runs every startup)
  // Uses LIKE pattern matching so renamed values (e.g. "No-Show" vs "Meeting No-Show") are still identified
  const actionKeySeeds: Array<{ key: string; pattern: string }> = [
    { key: 'meeting_scheduled', pattern: '%scheduled%' },
    { key: 'meeting_held', pattern: '%held%' },
    { key: 'rescheduled', pattern: '%reschedul%' },
    { key: 'cancelled', pattern: '%cancel%' },
    { key: 'no_show', pattern: '%no%show%' },
    { key: 'pending', pattern: '%pending%' },
  ];
  await Promise.all(actionKeySeeds.map(({ key, pattern }) =>
    db.execute({
      sql: "UPDATE config_options SET action_key = ? WHERE category = 'action' AND LOWER(value) LIKE ? AND (action_key IS NULL OR action_key = '')",
      args: [key, pattern],
    }).catch(() => {})
  ));
}

// Run initDb once at module load so tables exist before any query
export const dbReady: Promise<void> = initDb().catch((err) => {
  console.error('Failed to initialize database schema:', err);
});

export interface Conference {
  id: number;
  name: string;
  start_date: string;
  end_date: string;
  location: string;
  notes?: string;
  internal_attendees?: string;
  created_at: string;
  attendee_count?: number;
}

export interface Company {
  id: number;
  name: string;
  website?: string;
  profit_type?: string;
  company_type?: string;
  notes?: string;
  status?: string;
  assigned_user?: string;
  parent_company_id?: number;
  entity_structure?: string;
  wse?: number;
  services?: string[];
  icp?: string;
  created_at: string;
  attendee_count?: number;
}

export interface Attendee {
  id: number;
  first_name: string;
  last_name: string;
  title?: string;
  company_id?: number;
  company_name?: string;
  company_type?: string;
  email?: string;
  notes?: string;
  action?: string;
  next_steps?: string;
  next_steps_notes?: string;
  status?: string;
  seniority?: string;
  created_at: string;
  conference_count?: number;
  conferences?: Array<{ id: number; name: string }>;
}

export interface AttendeeInput {
  first_name: string;
  last_name: string;
  title?: string;
  company_id?: number;
  email?: string;
  notes?: string;
}

export interface ParsedAttendee {
  first_name: string;
  last_name: string;
  title?: string;
  company?: string;
  email?: string;
  website?: string;
  company_type?: string;
  assigned_user?: string;
  wse?: string;
  services?: string;
  icp?: string;
  function?: string;
  product?: string;
}

/**
 * Server-side helper: fetch all values for a config category directly from DB.
 * Use this in API routes that need to validate classifier output against live admin options.
 */
export async function getConfigOptionValues(category: string): Promise<string[]> {
  await dbReady;
  const result = await db.execute({
    sql: 'SELECT value FROM config_options WHERE category = ? ORDER BY sort_order, value',
    args: [category],
  });
  const values = result.rows.map((r) => String(r.value));
  // Strip legacy "True"/"False" literals from ICP options
  if (category === 'icp') {
    return values.filter((v) => v !== 'True' && v !== 'False');
  }
  return values;
}
