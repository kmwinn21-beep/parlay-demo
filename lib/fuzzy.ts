import Fuse from 'fuse.js';
import { getDb } from './db';

export function findMatchingAttendee(
  firstName: string,
  lastName: string
): { id: number; first_name: string; last_name: string } | null {
  const db = getDb();
  const attendees = db
    .prepare('SELECT id, first_name, last_name FROM attendees')
    .all() as Array<{ id: number; first_name: string; last_name: string }>;

  if (attendees.length === 0) return null;

  const searchList = attendees.map((a) => ({
    ...a,
    full_name: `${a.first_name} ${a.last_name}`,
  }));

  const fuse = new Fuse(searchList, {
    keys: ['full_name'],
    threshold: 0.3,
    includeScore: true,
  });

  const fullName = `${firstName} ${lastName}`;
  const results = fuse.search(fullName);

  if (results.length > 0 && results[0].score !== undefined && results[0].score <= 0.3) {
    return results[0].item;
  }

  return null;
}

export function findMatchingCompany(
  companyName: string
): { id: number; name: string } | null {
  const db = getDb();
  const companies = db
    .prepare('SELECT id, name FROM companies')
    .all() as Array<{ id: number; name: string }>;

  if (companies.length === 0) return null;

  const fuse = new Fuse(companies, {
    keys: ['name'],
    threshold: 0.3,
    includeScore: true,
  });

  const results = fuse.search(companyName);

  if (results.length > 0 && results[0].score !== undefined && results[0].score <= 0.3) {
    return results[0].item;
  }

  return null;
}

export function getOrCreateCompany(companyName: string): number {
  if (!companyName || !companyName.trim()) return 0;

  const db = getDb();
  const match = findMatchingCompany(companyName.trim());

  if (match) {
    return match.id;
  }

  const result = db
    .prepare('INSERT INTO companies (name) VALUES (?) RETURNING id')
    .get(companyName.trim()) as { id: number };

  return result.id;
}

export function getOrCreateAttendee(
  firstName: string,
  lastName: string,
  title?: string,
  companyId?: number,
  email?: string
): number {
  const db = getDb();
  const match = findMatchingAttendee(firstName, lastName);

  if (match) {
    // Update with any new info if provided
    if (title || companyId || email) {
      const updates: string[] = [];
      const params: (string | number)[] = [];

      if (title) {
        updates.push('title = COALESCE(title, ?)');
        params.push(title);
      }
      if (companyId) {
        updates.push('company_id = COALESCE(company_id, ?)');
        params.push(companyId);
      }
      if (email) {
        updates.push('email = COALESCE(email, ?)');
        params.push(email);
      }

      if (updates.length > 0) {
        params.push(match.id);
        db.prepare(`UPDATE attendees SET ${updates.join(', ')} WHERE id = ?`).run(...params);
      }
    }
    return match.id;
  }

  const result = db
    .prepare(
      'INSERT INTO attendees (first_name, last_name, title, company_id, email) VALUES (?, ?, ?, ?, ?) RETURNING id'
    )
    .get(
      firstName,
      lastName,
      title || null,
      companyId || null,
      email || null
    ) as { id: number };

  return result.id;
}
