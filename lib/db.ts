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
