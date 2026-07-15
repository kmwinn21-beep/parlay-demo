import type { Client } from '@libsql/client';

// Shared by the authenticated and public form-submission routes' manual-entry ("Other"/
// self-serve) path. Without this, every submission for a person already in the system
// created a second attendee record instead of reusing theirs.
export async function resolveOrCreateAttendee(db: Client, params: {
  firstName: string;
  lastName: string;
  title?: string | null;
  email?: string | null;
  companyId?: number | null;
}): Promise<number> {
  const { firstName, lastName, title, email, companyId } = params;

  const existing = await db.execute({
    sql: `SELECT id, company_id FROM attendees WHERE LOWER(first_name) = LOWER(?) AND LOWER(last_name) = LOWER(?)`,
    args: [firstName.trim(), lastName.trim()],
  });
  if (existing.rows.length > 0) {
    if (companyId != null) {
      const sameCompany = existing.rows.find(r => r.company_id != null && Number(r.company_id) === companyId);
      if (sameCompany) return Number(sameCompany.id);
    }
    // Same name, no matching company (or no company given either way) — still the same
    // person far more often than not, so reuse rather than create a duplicate.
    return Number(existing.rows[0].id);
  }

  const newAtt = await db.execute({
    sql: `INSERT INTO attendees (first_name, last_name, title, company_id, email) VALUES (?, ?, ?, ?, ?) RETURNING id`,
    args: [firstName.trim(), lastName.trim(), title || null, companyId ?? null, email || null],
  });
  return Number(newAtt.rows[0].id);
}
