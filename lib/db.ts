import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const DATA_DIR = path.join(process.cwd(), 'data');
const DB_PATH = path.join(DATA_DIR, 'conference_hub.db');

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (db) return db;

  // Ensure data directory exists
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  initializeSchema(db);
  return db;
}

function initializeSchema(database: Database.Database): void {
  database.exec(`
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
