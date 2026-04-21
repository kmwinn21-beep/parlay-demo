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
  ];
  // Split into DDL (schema) and DML (data) so data ops don't race against column creation.
  // Each group runs in parallel; groups stay sequential relative to each other.
  const ddlMigrations = migrations.filter(sql => /^\s*(CREATE|ALTER)/i.test(sql));
  const dmlMigrations = migrations.filter(sql => /^\s*(UPDATE|INSERT|DELETE)/i.test(sql));
  await Promise.all(ddlMigrations.map(sql => db.execute({ sql, args: [] }).catch(() => {})));
  await Promise.all(dmlMigrations.map(sql => db.execute({ sql, args: [] }).catch(() => {})));

  // Ensure unit_type config option exists (can't use INSERT OR IGNORE without a unique constraint)
  const utCheck = await db.execute({ sql: "SELECT COUNT(*) as cnt FROM config_options WHERE category = 'unit_type'", args: [] });
  if (Number(utCheck.rows[0].cnt) === 0) {
    await db.execute({ sql: "INSERT INTO config_options (category, value, sort_order) VALUES ('unit_type', 'WSE', 0)", args: [] });
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
  ];
  await Promise.all(newCategorySeeds.map(seed =>
    db.execute({
      sql: 'INSERT OR IGNORE INTO config_options (category, value, sort_order) VALUES (?, ?, ?)',
      args: [seed.category, seed.value, seed.sort_order],
    }).catch(() => {})
  ));

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
