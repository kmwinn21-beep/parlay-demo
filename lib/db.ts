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
  ];
  for (const sql of migrations) {
    try { await db.execute({ sql, args: [] }); } catch { /* already exists */ }
  }

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
      { category: 'status', value: 'Hot Prospect', sort_order: 2 },
      { category: 'status', value: 'Interested', sort_order: 3 },
      { category: 'status', value: 'Not Interested', sort_order: 4 },
      { category: 'status', value: 'Unknown', sort_order: 5 },
      { category: 'action', value: 'Meeting Scheduled', sort_order: 1 },
      { category: 'action', value: 'Meeting Held', sort_order: 2 },
      { category: 'action', value: 'Social Conversation', sort_order: 3 },
      { category: 'action', value: 'Meeting No-Show', sort_order: 4 },
      { category: 'next_steps', value: 'Schedule Follow Up Meeting', sort_order: 1 },
      { category: 'next_steps', value: 'General Follow Up', sort_order: 2 },
      { category: 'next_steps', value: 'Other', sort_order: 3 },
    ];
    for (const seed of seeds) {
      try {
        await db.execute({
          sql: 'INSERT OR IGNORE INTO config_options (category, value, sort_order) VALUES (?, ?, ?)',
          args: [seed.category, seed.value, seed.sort_order],
        });
      } catch { /* ignore */ }
    }
  }

  // Always ensure seniority and profit_type seeds exist (for existing DBs)
  const newCategorySeeds: Array<{ category: string; value: string; sort_order: number }> = [
    { category: 'seniority', value: 'C-Suite', sort_order: 1 },
    { category: 'seniority', value: 'VP Level', sort_order: 2 },
    { category: 'seniority', value: 'Director', sort_order: 3 },
    { category: 'seniority', value: 'Manager', sort_order: 4 },
    { category: 'seniority', value: 'Other', sort_order: 5 },
    { category: 'profit_type', value: 'For-Profit', sort_order: 1 },
    { category: 'profit_type', value: 'Non-Profit', sort_order: 2 },
  ];
  for (const seed of newCategorySeeds) {
    try {
      await db.execute({
        sql: 'INSERT OR IGNORE INTO config_options (category, value, sort_order) VALUES (?, ?, ?)',
        args: [seed.category, seed.value, seed.sort_order],
      });
    } catch { /* ignore */ }
  }
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
}
