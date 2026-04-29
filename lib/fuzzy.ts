import { db, dbReady } from './db';
import {
  matchCompany,
  matchAttendee,
  confirmAttendeeMatch,
} from './matching';

export async function findMatchingAttendee(
  firstName: string,
  lastName: string,
  email?: string | null,
  website?: string | null,
  companyName?: string | null,
): Promise<{ id: number; first_name: string; last_name: string } | null> {
  await dbReady;
  const result = await db.execute({
    sql: `SELECT a.id, a.first_name, a.last_name, a.email,
                 c.name AS company_name, c.website AS company_website
          FROM attendees a
          LEFT JOIN companies c ON a.company_id = c.id`,
    args: [],
  });

  const attendees = result.rows.map((r) => ({
    id: Number(r.id),
    first_name: String(r.first_name ?? ''),
    last_name: String(r.last_name ?? ''),
    full_name: `${r.first_name ?? ''} ${r.last_name ?? ''}`.trim(),
    email: r.email ? String(r.email) : null,
    website: r.company_website ? String(r.company_website) : null,
    company_name: r.company_name ? String(r.company_name) : null,
  }));

  if (attendees.length === 0) return null;

  const confirmFn = (candidate: typeof attendees[number]) =>
    confirmAttendeeMatch(candidate, email, website, companyName);

  const hit = matchAttendee(firstName, lastName, attendees, undefined, confirmFn);
  if (hit) {
    return { id: hit.match.id, first_name: hit.match.first_name, last_name: hit.match.last_name };
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
  email?: string,
  companyName?: string,
): Promise<number> {
  await dbReady;

  // Resolve company name for secondary matching when only an ID is provided
  let resolvedCompanyName = companyName;
  if (!resolvedCompanyName && companyId) {
    const coRow = await db.execute({
      sql: 'SELECT name FROM companies WHERE id = ?',
      args: [companyId],
    });
    if (coRow.rows.length) resolvedCompanyName = String(coRow.rows[0].name);
  }

  const match = await findMatchingAttendee(firstName, lastName, email, undefined, resolvedCompanyName);

  if (match) {
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
