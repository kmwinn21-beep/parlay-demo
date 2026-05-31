import { createClient, type Client } from '@libsql/client';
import { migrations } from '@/lib/db-migrations';

export const db = createClient({
  url: process.env.TURSO_DATABASE_URL!,
  authToken: process.env.TURSO_AUTH_TOKEN!,
});

async function ensureConfigOptionsColumns(client: Client): Promise<void> {
  const configCols = await client.execute({ sql: 'PRAGMA table_info(config_options)', args: [] });
  const configColNames = new Set(configCols.rows.map(r => String(r.name)));
  const requiredConfigColumns: Array<[string, string]> = [
    ['color', 'ALTER TABLE config_options ADD COLUMN color TEXT'],
    ['action_key', 'ALTER TABLE config_options ADD COLUMN action_key TEXT'],
    ['status_key', 'ALTER TABLE config_options ADD COLUMN status_key TEXT'],
    ['scope', "ALTER TABLE config_options ADD COLUMN scope TEXT NOT NULL DEFAULT 'global'"],
    ['auto_follow_up', 'ALTER TABLE config_options ADD COLUMN auto_follow_up INTEGER NOT NULL DEFAULT 1'],
    ['is_system', 'ALTER TABLE config_options ADD COLUMN is_system INTEGER NOT NULL DEFAULT 0'],
    ['is_primary', 'ALTER TABLE config_options ADD COLUMN is_primary INTEGER NOT NULL DEFAULT 0'],
  ];
  await Promise.all(
    requiredConfigColumns
      .filter(([col]) => !configColNames.has(col))
      .map(([, sql]) => client.execute({ sql, args: [] }).catch(() => {}))
  );
}

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

  // Schema version tracking — only run migrations not yet applied to this DB.
  // Reduces warm cold-start from 345 sequential round-trips to 3.
  await db.execute({
    sql: `CREATE TABLE IF NOT EXISTS _schema_version (version INTEGER NOT NULL DEFAULT 0)`,
    args: [],
  }).catch(() => {});

  const versionRow = await db.execute({
    sql: `SELECT version FROM _schema_version LIMIT 1`,
    args: [],
  }).catch(() => ({ rows: [] as Array<Record<string, unknown>> }));

  const currentVersion = versionRow.rows.length > 0 ? Number(versionRow.rows[0].version) : 0;
  const pendingMigrations = migrations.slice(currentVersion);

  for (const sql of pendingMigrations) {
    await db.execute({ sql, args: [] }).catch(() => {});
  }

  if (pendingMigrations.length > 0) {
    if (currentVersion === 0) {
      await db.execute({
        sql: `INSERT INTO _schema_version (version) VALUES (?)`,
        args: [migrations.length],
      }).catch(() => {});
    } else {
      await db.execute({
        sql: `UPDATE _schema_version SET version = ?`,
        args: [migrations.length],
      }).catch(() => {});
    }
  }

  // Expand role CHECK constraint to include new roles (SQLite requires table recreation)
  try {
    const masterRow = await db.execute({
      sql: `SELECT sql FROM sqlite_master WHERE type='table' AND name='users'`,
      args: [],
    });
    const currentSql = masterRow.rows.length > 0 ? String(masterRow.rows[0].sql ?? '') : '';
    if (currentSql.includes('sales_rep') && currentSql.includes('stakeholder')) {
      // Already migrated — skip entirely
    } else {
      await db.execute({ sql: `PRAGMA foreign_keys = OFF`, args: [] });
      try {
        await db.execute({ sql: `CREATE TABLE IF NOT EXISTS users_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          email TEXT UNIQUE NOT NULL,
          password_hash TEXT NOT NULL,
          role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user','administrator','sales_rep','manager','analyst','conference_coordinator','stakeholder')),
          email_verified INTEGER NOT NULL DEFAULT 0,
          verification_token TEXT, reset_token TEXT, reset_token_expires INTEGER,
          created_at TEXT DEFAULT (datetime('now')),
          config_id INTEGER REFERENCES config_options(id),
          display_name TEXT, email_pending TEXT, email_change_token TEXT, email_change_expires INTEGER,
          active INTEGER NOT NULL DEFAULT 1,
          invite_token TEXT, invite_expires INTEGER, first_name TEXT, last_name TEXT,
          signature_html TEXT, last_seen_at TEXT
        )`, args: [] });
        await db.execute({ sql: `DELETE FROM users_new`, args: [] });
        await db.execute({ sql: `INSERT INTO users_new SELECT id,email,password_hash,role,email_verified,verification_token,reset_token,reset_token_expires,created_at,config_id,display_name,email_pending,email_change_token,email_change_expires,active,invite_token,invite_expires,first_name,last_name,signature_html,last_seen_at FROM users`, args: [] });
        await db.execute({ sql: `DROP TABLE users`, args: [] });
        await db.execute({ sql: `ALTER TABLE users_new RENAME TO users`, args: [] });
      } catch (e) {
        console.error('[migration] role constraint migration failed:', e);
      } finally {
        await db.execute({ sql: `PRAGMA foreign_keys = ON`, args: [] }).catch(() => {});
      }
    }
  } catch (e) { console.error('[migration] role constraint check failed:', e); }

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
    await ensureConfigOptionsColumns(db);
    // Ensure accounts table has multi-tenant columns (added after initial schema deployment)
    try {
      const accountCols = await db.execute({ sql: 'PRAGMA table_info(accounts)', args: [] });
      const accountColNames = new Set(accountCols.rows.map(r => String(r.name)));
      const accountMigrations: Array<[string, string]> = [
        ['turso_db_url', 'ALTER TABLE accounts ADD COLUMN turso_db_url TEXT'],
        ['turso_auth_token', 'ALTER TABLE accounts ADD COLUMN turso_auth_token TEXT'],
        ['deployment_url', 'ALTER TABLE accounts ADD COLUMN deployment_url TEXT'],
        ['updated_at', "ALTER TABLE accounts ADD COLUMN updated_at TEXT DEFAULT (datetime('now'))"],
        ['last_active_at', 'ALTER TABLE accounts ADD COLUMN last_active_at TEXT'],
        ['onboarding_completed', 'ALTER TABLE accounts ADD COLUMN onboarding_completed INTEGER DEFAULT 0'],
        ['activated_plan_at', 'ALTER TABLE accounts ADD COLUMN activated_plan_at TEXT'],
        ['signup_role', 'ALTER TABLE accounts ADD COLUMN signup_role TEXT'],
        ['signup_industry', 'ALTER TABLE accounts ADD COLUMN signup_industry TEXT'],
        ['signup_team_size', 'ALTER TABLE accounts ADD COLUMN signup_team_size TEXT'],
        ['signup_conferences_per_year', 'ALTER TABLE accounts ADD COLUMN signup_conferences_per_year TEXT'],
        ['signup_primary_goal', 'ALTER TABLE accounts ADD COLUMN signup_primary_goal TEXT'],
        ['signup_current_tool', 'ALTER TABLE accounts ADD COLUMN signup_current_tool TEXT'],
        ['onboarding_progress', 'ALTER TABLE accounts ADD COLUMN onboarding_progress TEXT'],
        ['stripe_customer_id', 'ALTER TABLE accounts ADD COLUMN stripe_customer_id TEXT'],
        ['stripe_subscription_id', 'ALTER TABLE accounts ADD COLUMN stripe_subscription_id TEXT'],
        ['stripe_price_id', 'ALTER TABLE accounts ADD COLUMN stripe_price_id TEXT'],
        ['billing_interval', 'ALTER TABLE accounts ADD COLUMN billing_interval TEXT'],
        ['purchased_bundles', 'ALTER TABLE accounts ADD COLUMN purchased_bundles TEXT'],
      ];
      await Promise.all(accountMigrations
        .filter(([col]) => !accountColNames.has(col))
        .map(([, sql]) => db.execute({ sql, args: [] }).catch(() => {})));
    } catch { /* accounts table may not exist yet */ }
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
      { category: 'company_type', value: 'Prospect Company Type', sort_order: 1 },
      { category: 'company_type', value: 'Owner', sort_order: 2 },
      { category: 'company_type', value: 'Capital Partner', sort_order: 3 },
      { category: 'company_type', value: 'Vendor', sort_order: 4 },
      { category: 'company_type', value: 'Partner', sort_order: 5 },
      { category: 'company_type', value: 'Other', sort_order: 6 },
      { category: 'status', value: 'Client', sort_order: 1 },
      { category: 'status', value: 'Priority', sort_order: 2 },
      { category: 'status', value: 'Interested', sort_order: 3 },
      { category: 'status', value: 'Not Interested', sort_order: 4 },
      { category: 'status', value: 'Unknown', sort_order: 5 },
      { category: 'action', value: 'Scheduled', sort_order: 1 },
      { category: 'action', value: 'Held', sort_order: 2 },
      { category: 'action', value: 'Rescheduled', sort_order: 3 },
      { category: 'action', value: 'Cancelled', sort_order: 4 },
      { category: 'action', value: 'No-Show', sort_order: 5 },
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
    { category: 'services', value: 'Other', sort_order: 1 },
    { category: 'services', value: 'N/A', sort_order: 2 },
    { category: 'event_type', value: 'Sponsored Event', sort_order: 1 },
    { category: 'event_type', value: 'Lunch', sort_order: 2 },
    { category: 'event_type', value: 'Dinner', sort_order: 3 },
    { category: 'event_type', value: 'Company Hosted', sort_order: 4 },
    { category: 'event_type', value: 'Partner', sort_order: 5 },
    { category: 'event_type', value: 'Conference Event', sort_order: 6 },
    { category: 'conference_strategy_type', value: 'Pipeline Generation', sort_order: 1 },
    { category: 'conference_strategy_type', value: 'Pipeline Acceleration', sort_order: 2 },
    { category: 'conference_strategy_type', value: 'Customer Retention / Customer Nurture', sort_order: 3 },
    { category: 'conference_strategy_type', value: 'Market Presence / Brand Visibility', sort_order: 4 },
    { category: 'conference_strategy_type', value: 'Strategic Account Relationship Building', sort_order: 5 },
    { category: 'conference_strategy_type', value: 'Partner / Ecosystem Development', sort_order: 6 },
    { category: 'conference_strategy_type', value: 'Competitive Defense', sort_order: 7 },
    { category: 'conference_strategy_type', value: 'Thought Leadership', sort_order: 8 },
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
    { category: 'company_type', value: 'Prospect Company Type' },
    { category: 'company_type', value: 'Owner' },
    { category: 'company_type', value: 'Capital Partner' },
    { category: 'company_type', value: 'Vendor' },
    { category: 'company_type', value: 'Partner' },
    { category: 'company_type', value: 'Other' },
    { category: 'company_type', value: 'Capital' },
    { category: 'company_type', value: 'Operator' },
    { category: 'company_type', value: 'Prospect' },
    { category: 'status', value: 'Client' },
    { category: 'status', value: 'Priority' },
    { category: 'status', value: 'Interested' },
    { category: 'status', value: 'Not Interested' },
    { category: 'status', value: 'Unknown' },
    { category: 'action', value: 'Scheduled' },
    { category: 'action', value: 'Held' },
    { category: 'action', value: 'Rescheduled' },
    { category: 'action', value: 'Cancelled' },
    { category: 'action', value: 'No-Show' },
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
    { category: 'services', value: 'Other' },
    { category: 'services', value: 'N/A' },
    { category: 'event_type', value: 'Sponsored Event' },
    { category: 'event_type', value: 'Lunch' },
    { category: 'event_type', value: 'Dinner' },
    { category: 'event_type', value: 'Company Hosted' },
    { category: 'event_type', value: 'Partner' },
    { category: 'event_type', value: 'Conference Event' },
    { category: 'conference_strategy_type', value: 'Pipeline Generation' },
    { category: 'conference_strategy_type', value: 'Pipeline Acceleration' },
    { category: 'conference_strategy_type', value: 'Customer Retention / Customer Nurture' },
    { category: 'conference_strategy_type', value: 'Market Presence / Brand Visibility' },
    { category: 'conference_strategy_type', value: 'Strategic Account Relationship Building' },
    { category: 'conference_strategy_type', value: 'Partner / Ecosystem Development' },
    { category: 'conference_strategy_type', value: 'Competitive Defense' },
    { category: 'conference_strategy_type', value: 'Thought Leadership' },
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

  // Unlock legacy healthcare-specific service options so they can be deleted in Admin Settings.
  // These were previously seeded with is_system=1, but services are fully user-configurable.
  try {
    await db.execute({
      sql: "UPDATE config_options SET is_system = 0 WHERE category = 'services' AND value IN ('IL', 'AL', 'MC', 'SNF', 'CCRC')",
      args: [],
    });
  } catch { /* ignore */ }

  // Strip any stale product values from attendees/companies that no longer exist in config_options.
  // Runs every startup so data stays clean after manual deletions.
  try {
    const validProductRows = await db.execute({
      sql: "SELECT value FROM config_options WHERE category = 'products'",
      args: [],
    });
    const validProducts = new Set(validProductRows.rows.map(r => String(r.value)));
    const stripStale = (csv: string) =>
      csv.split(',').map(s => s.trim()).filter(s => s && validProducts.has(s)).join(',');

    const staleAttendees = await db.execute({
      sql: "SELECT id, products FROM attendees WHERE products IS NOT NULL AND products != ''",
      args: [],
    });
    for (const row of staleAttendees.rows) {
      const cleaned = stripStale(String(row.products ?? ''));
      const original = String(row.products ?? '');
      if (cleaned !== original) {
        await db.execute({
          sql: 'UPDATE attendees SET products = ? WHERE id = ?',
          args: [cleaned || null, row.id],
        });
      }
    }

    const staleCompanies = await db.execute({
      sql: "SELECT id, products FROM companies WHERE products IS NOT NULL AND products != ''",
      args: [],
    });
    for (const row of staleCompanies.rows) {
      const cleaned = stripStale(String(row.products ?? ''));
      const original = String(row.products ?? '');
      if (cleaned !== original) {
        await db.execute({
          sql: 'UPDATE companies SET products = ? WHERE id = ?',
          args: [cleaned || null, row.id],
        });
      }
    }
  } catch { /* non-fatal */ }

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

// Tracks the last initDb failure so getDb can surface it as a 503
export let dbInitError: Error | null = null;

async function initDbWithRetry(): Promise<void> {
  const TIMEOUT_MS = 10_000;
  const isNetworkError = (e: unknown) => {
    const msg = e instanceof Error ? e.message : String(e);
    return msg.includes('ETIMEDOUT') || msg.includes('ECONNREFUSED') || msg.includes('ECONNRESET') || msg.includes('fetch failed') || msg.includes('[db-init] connection timeout');
  };

  const attempt = () => Promise.race([
    initDb(),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('[db-init] connection timeout after 10s')), TIMEOUT_MS)
    ),
  ]);

  try {
    await attempt();
    dbInitError = null;
  } catch (firstErr) {
    if (isNetworkError(firstErr)) {
      await new Promise(r => setTimeout(r, 1000));
      try {
        await attempt();
        dbInitError = null;
      } catch (secondErr) {
        const err = secondErr instanceof Error ? secondErr : new Error(String(secondErr));
        console.error(`[db-init] failed after 2 attempts: ${err.message}`);
        dbInitError = err;
      }
    } else {
      const err = firstErr instanceof Error ? firstErr : new Error(String(firstErr));
      console.error('[db-init] non-network error:', err.message);
      dbInitError = err;
    }
  }
}

// Run initDb once at module load so tables exist before any query.
// Always resolves (never rejects) to keep backward-compat with 50+ callers.
// Check dbInitError after awaiting if you need to distinguish success vs failure.
export const dbReady: Promise<void> = initDbWithRetry().catch((err) => {
  console.error('Failed to initialize database schema:', err);
});

// Seed a brand-new tenant DB with the full schema and default config data.
// ALTER TABLE statements fail silently (columns already present in the full CREATE TABLE).
// Role constraint migration is skipped — users table is created with the full constraint.
export async function seedFreshDb(client: Client): Promise<void> {
  // Base tables
  await client.executeMultiple(`
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

  await client.executeMultiple(`
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

  // Users with full role constraint (fresh DB — no need for the constraint migration)
  await client.execute({
    sql: `CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user','administrator','sales_rep','manager','analyst','conference_coordinator','stakeholder')),
      email_verified INTEGER NOT NULL DEFAULT 0,
      verification_token TEXT,
      reset_token TEXT,
      reset_token_expires INTEGER,
      created_at TEXT DEFAULT (datetime('now')),
      config_id INTEGER REFERENCES config_options(id),
      display_name TEXT,
      email_pending TEXT,
      email_change_token TEXT,
      email_change_expires INTEGER,
      active INTEGER NOT NULL DEFAULT 1,
      invite_token TEXT,
      invite_expires INTEGER,
      first_name TEXT,
      last_name TEXT,
      signature_html TEXT,
      last_seen_at TEXT,
      is_admin INTEGER NOT NULL DEFAULT 0
    )`,
    args: [],
  });

  // Run migrations in order — sequential is required because later migrations ALTER tables
  // created by earlier ones (e.g. ALTER TABLE conference_budget must follow CREATE TABLE
  // conference_budget). Parallel Promise.all has a race that silently drops columns.
  for (const sql of migrations) {
    await client.execute({ sql, args: [] }).catch(() => {});
  }
  await ensureConfigOptionsColumns(client);

  // Unit type seed
  const utCheck = await client.execute({ sql: "SELECT id FROM config_options WHERE category = 'unit_type' ORDER BY id", args: [] });
  if (utCheck.rows.length === 0) {
    await client.execute({ sql: "INSERT INTO config_options (category, value, sort_order) VALUES ('unit_type', 'Units', 0)", args: [] });
  }

  // Base config seeds — always INSERT OR IGNORE (fresh DB may have some rows from migrations)
  const baseSeeds: Array<{ category: string; value: string; sort_order: number }> = [
    { category: 'company_type', value: 'Prospect Company Type', sort_order: 1 },
    { category: 'company_type', value: 'Owner', sort_order: 2 },
    { category: 'company_type', value: 'Capital Partner', sort_order: 3 },
    { category: 'company_type', value: 'Vendor', sort_order: 4 },
    { category: 'company_type', value: 'Partner', sort_order: 5 },
    { category: 'company_type', value: 'Other', sort_order: 6 },
    { category: 'status', value: 'Client', sort_order: 1 },
    { category: 'status', value: 'Priority', sort_order: 2 },
    { category: 'status', value: 'Interested', sort_order: 3 },
    { category: 'status', value: 'Not Interested', sort_order: 4 },
    { category: 'status', value: 'Unknown', sort_order: 5 },
    { category: 'action', value: 'Scheduled', sort_order: 1 },
    { category: 'action', value: 'Held', sort_order: 2 },
    { category: 'action', value: 'Rescheduled', sort_order: 3 },
    { category: 'action', value: 'Cancelled', sort_order: 4 },
    { category: 'action', value: 'No-Show', sort_order: 5 },
    { category: 'action', value: 'Social Conversation', sort_order: 6 },
    { category: 'action', value: 'Pending', sort_order: 7 },
    { category: 'next_steps', value: 'Schedule Follow Up Meeting', sort_order: 1 },
    { category: 'next_steps', value: 'General Follow Up', sort_order: 2 },
    { category: 'next_steps', value: 'Other', sort_order: 3 },
    // ICP boolean type options — system values, cannot be removed by users
    { category: 'icp', value: 'Yes', sort_order: 1 },
    { category: 'icp', value: 'No', sort_order: 2 },
  ];
  const categorySeeds: Array<{ category: string; value: string; sort_order: number }> = [
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
    { category: 'services', value: 'Other', sort_order: 1 },
    { category: 'services', value: 'N/A', sort_order: 2 },
    { category: 'event_type', value: 'Sponsored Event', sort_order: 1 },
    { category: 'event_type', value: 'Lunch', sort_order: 2 },
    { category: 'event_type', value: 'Dinner', sort_order: 3 },
    { category: 'event_type', value: 'Company Hosted', sort_order: 4 },
    { category: 'event_type', value: 'Partner', sort_order: 5 },
    { category: 'event_type', value: 'Conference Event', sort_order: 6 },
    { category: 'conference_strategy_type', value: 'Pipeline Generation', sort_order: 1 },
    { category: 'conference_strategy_type', value: 'Pipeline Acceleration', sort_order: 2 },
    { category: 'conference_strategy_type', value: 'Customer Retention / Customer Nurture', sort_order: 3 },
    { category: 'conference_strategy_type', value: 'Market Presence / Brand Visibility', sort_order: 4 },
    { category: 'conference_strategy_type', value: 'Strategic Account Relationship Building', sort_order: 5 },
    { category: 'conference_strategy_type', value: 'Partner / Ecosystem Development', sort_order: 6 },
    { category: 'conference_strategy_type', value: 'Competitive Defense', sort_order: 7 },
    { category: 'conference_strategy_type', value: 'Thought Leadership', sort_order: 8 },
    { category: 'rep_relationship_type', value: 'Strong', sort_order: 1 },
    { category: 'rep_relationship_type', value: 'Former Client', sort_order: 2 },
    { category: 'rep_relationship_type', value: 'Other', sort_order: 3 },
    { category: 'meeting_type', value: 'Pre-Scheduled', sort_order: 1 },
    { category: 'meeting_type', value: 'Speed', sort_order: 2 },
    { category: 'function', value: 'Operations', sort_order: 1 },
    { category: 'function', value: 'Finance', sort_order: 2 },
    { category: 'function', value: 'Sales', sort_order: 3 },
    { category: 'function', value: 'Marketing', sort_order: 4 },
    { category: 'function', value: 'HR', sort_order: 5 },
    { category: 'function', value: 'Legal', sort_order: 6 },
    { category: 'function', value: 'IT', sort_order: 7 },
    { category: 'function', value: 'Accounting', sort_order: 8 },
    { category: 'products', value: 'Product', sort_order: 1 },
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
  await Promise.all([...baseSeeds, ...categorySeeds].map(seed =>
    client.execute({
      sql: 'INSERT OR IGNORE INTO config_options (category, value, sort_order) VALUES (?, ?, ?)',
      args: [seed.category, seed.value, seed.sort_order],
    }).catch(() => {})
  ));

  // Mark system-seeded options as protected
  const systemSeeds: Array<{ category: string; value: string }> = [
    { category: 'company_type', value: 'Prospect Company Type' },
    { category: 'company_type', value: 'Owner' },
    { category: 'company_type', value: 'Capital Partner' },
    { category: 'company_type', value: 'Vendor' },
    { category: 'company_type', value: 'Partner' },
    { category: 'company_type', value: 'Other' },
    { category: 'company_type', value: 'Capital' },
    { category: 'company_type', value: 'Operator' },
    { category: 'company_type', value: 'Prospect' },
    { category: 'status', value: 'Client' },
    { category: 'status', value: 'Priority' },
    { category: 'status', value: 'Interested' },
    { category: 'status', value: 'Not Interested' },
    { category: 'status', value: 'Unknown' },
    { category: 'action', value: 'Scheduled' },
    { category: 'action', value: 'Held' },
    { category: 'action', value: 'Rescheduled' },
    { category: 'action', value: 'Cancelled' },
    { category: 'action', value: 'No-Show' },
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
    { category: 'event_type', value: 'Sponsored Event' },
    { category: 'event_type', value: 'Lunch' },
    { category: 'event_type', value: 'Dinner' },
    { category: 'event_type', value: 'Company Hosted' },
    { category: 'event_type', value: 'Partner' },
    { category: 'event_type', value: 'Conference Event' },
    { category: 'touchpoints', value: 'Booth Stop' },
    { category: 'touchpoints', value: 'Coffee' },
    { category: 'touchpoints', value: 'Dinner' },
    { category: 'touchpoints', value: 'Event' },
    { category: 'touchpoints', value: 'Breakfast/Lunch' },
    { category: 'touchpoints', value: 'Other' },
    { category: 'attendee_conference_status', value: 'Target' },
    // ICP boolean values — locked so users can't delete them
    { category: 'icp', value: 'Yes' },
    { category: 'icp', value: 'No' },
  ];
  await Promise.all(systemSeeds.map(seed =>
    client.execute({
      sql: 'UPDATE config_options SET is_system = 1 WHERE category = ? AND value = ?',
      args: [seed.category, seed.value],
    }).catch(() => {})
  ));

  // Remove erroneous "Prospect Company Type" seed entry if it exists from a previous provisioning bug
  await client.execute({
    sql: "DELETE FROM config_options WHERE category = 'company_type' AND value = 'Prospect Company Type'",
    args: [],
  }).catch(() => {});

  // Seed default Lead Capture form template
  try {
    const tmplCount = await client.execute({ sql: 'SELECT COUNT(*) as cnt FROM form_templates', args: [] });
    if (Number(tmplCount.rows[0].cnt) === 0) {
      const tmplResult = await client.execute({
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
        await client.execute({
          sql: `INSERT INTO form_fields (template_id, field_type, field_key, label, sort_order, required) VALUES (?, ?, ?, ?, ?, ?)`,
          args: [tmplId, f.field_type, f.field_key, f.label, f.sort_order, f.required],
        });
      }
    }
  } catch { /* ignore */ }

  // Ensure action_key is set for meeting-related actions
  const actionKeySeeds: Array<{ key: string; pattern: string }> = [
    { key: 'meeting_scheduled', pattern: '%scheduled%' },
    { key: 'meeting_held', pattern: '%held%' },
    { key: 'rescheduled', pattern: '%reschedul%' },
    { key: 'cancelled', pattern: '%cancel%' },
    { key: 'no_show', pattern: '%no%show%' },
    { key: 'pending', pattern: '%pending%' },
  ];
  await Promise.all(actionKeySeeds.map(({ key, pattern }) =>
    client.execute({
      sql: "UPDATE config_options SET action_key = ? WHERE category = 'action' AND LOWER(value) LIKE ? AND (action_key IS NULL OR action_key = '')",
      args: [key, pattern],
    }).catch(() => {})
  ));

  // conference_company_intel table
  await client.execute({
    sql: `CREATE TABLE IF NOT EXISTS conference_company_intel (
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
    args: [],
  }).catch(() => {});
  await client.execute({
    sql: `CREATE INDEX IF NOT EXISTS idx_conf_company_intel_conf ON conference_company_intel(conference_id)`,
    args: [],
  }).catch(() => {});

  // Stamp _schema_version so first getDb() call knows this DB is fully migrated
  await client.execute({
    sql: `CREATE TABLE IF NOT EXISTS _schema_version (version INTEGER NOT NULL DEFAULT 0)`,
    args: [],
  }).catch(() => {});
  await client.execute({
    sql: `INSERT OR REPLACE INTO _schema_version (version) VALUES (?)`,
    args: [migrations.length],
  }).catch(() => {});
}

export async function migrateTenantDb(client: Client): Promise<void> {
  await client.execute({
    sql: `CREATE TABLE IF NOT EXISTS _schema_version (version INTEGER NOT NULL DEFAULT 0)`,
    args: [],
  }).catch(() => {});

  const versionRow = await client.execute({
    sql: `SELECT version FROM _schema_version LIMIT 1`,
    args: [],
  }).catch(() => ({ rows: [] as { version: unknown }[] }));

  const currentVersion = versionRow.rows.length > 0 ? Number(versionRow.rows[0].version) : 0;
  const pending = migrations.slice(currentVersion);

  for (const sql of pending) {
    await client.execute({ sql, args: [] }).catch(() => {});
  }

  if (pending.length > 0) {
    if (currentVersion === 0) {
      await client.execute({
        sql: `INSERT INTO _schema_version (version) VALUES (?)`,
        args: [migrations.length],
      }).catch(() => {});
    } else {
      await client.execute({
        sql: `UPDATE _schema_version SET version = ?`,
        args: [migrations.length],
      }).catch(() => {});
    }
  }
}

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
  industry?: string;
  function?: string;
  product?: string;
  consent?: string;
}

/**
 * Server-side helper: fetch all values for a config category directly from DB.
 * Use this in API routes that need to validate classifier output against live admin options.
 */
export async function getConfigOptionValues(category: string, client?: import('@libsql/client').Client): Promise<string[]> {
  await dbReady;
  const result = await (client ?? db).execute({
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
