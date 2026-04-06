import { db, dbReady } from './db';
import {
  matchCompany,
  matchAttendee,
} from './matching';

export async function findMatchingAttendee(
  firstName: string,
  lastName: string
): Promise<{ id: number; first_name: string; last_name: string } | null> {
  await dbReady;
  const result = await db.execute({
    sql: 'SELECT id, first_name, last_name FROM attendees',
    args: [],
  });

  const attendees = result.rows.map((r) => ({
    id: Number(r.id),
    first_name: String(r.first_name ?? ''),
    last_name: String(r.last_name ?? ''),
  }));

  if (attendees.length === 0) return null;

  const searchList = attendees.map((a) => ({
    ...a,
    full_name: `${a.first_name} ${a.last_name}`,
  }));

  const hit = matchAttendee(firstName, lastName, searchList);
  if (hit) {
    return { id: hit.match.id, first_name: hit.match.full_name.split(' ')[0] ?? '', last_name: hit.match.full_name.split(' ').slice(1).join(' ') };
  }

  return null;
}

export async function findMatchingCompany(
  companyName: string
): Promise<{ id: number; name: string } | null> {
  await dbReady;
  const result = await db.execute({
    sql: 'SELECT id, name, website FROM companies',
    args: [],
  });

  const companies = result.rows.map((r) => ({
    id: Number(r.id),
    name: String(r.name ?? ''),
    website: r.website ? String(r.website) : null,
  }));

  if (companies.length === 0) return null;

  const hit = matchCompany(companyName, companies);
  if (hit) {
    return hit.match;
  }

  return null;
}

export async function getOrCreateCompany(companyName: string): Promise<number> {
  if (!companyName || !companyName.trim()) return 0;

  await dbReady;
  const match = await findMatchingCompany(companyName.trim());

  if (match) {
    return match.id;
  }

  const result = await db.execute({
    sql: 'INSERT INTO companies (name) VALUES (?) RETURNING id',
    args: [companyName.trim()],
  });

  return Number(result.rows[0].id);
}

export async function getOrCreateAttendee(
  firstName: string,
  lastName: string,
  title?: string,
  companyId?: number,
  email?: string
): Promise<number> {
  await dbReady;
  const match = await findMatchingAttendee(firstName, lastName);

  if (match) {
    // Update with any new info if provided
    const updates: string[] = [];
    const params: (string | number | null)[] = [];

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
      await db.execute({
        sql: `UPDATE attendees SET ${updates.join(', ')} WHERE id = ?`,
        args: params,
      });
    }
    return match.id;
  }

  const result = await db.execute({
    sql: 'INSERT INTO attendees (first_name, last_name, title, company_id, email) VALUES (?, ?, ?, ?, ?) RETURNING id',
    args: [firstName, lastName, title ?? null, companyId ?? null, email ?? null],
  });

  return Number(result.rows[0].id);
}
