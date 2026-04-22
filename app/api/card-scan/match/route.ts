import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { db, dbReady } from '@/lib/db';

export async function POST(request: NextRequest) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;

  try {
    const { first_name, last_name, company, email } = await request.json() as {
      first_name?: string; last_name?: string; company?: string; email?: string;
    };

    await dbReady;

    const attendeeMatches: {
      id: number; first_name: string; last_name: string;
      title: string | null; company_name: string | null; company_id: number | null;
      email: string | null; matchType: 'email' | 'name';
    }[] = [];
    const seenAttendeeIds = new Set<number>();

    // 1. Email match (highest confidence)
    if (email && email.trim()) {
      const emailRows = await db.execute({
        sql: `SELECT a.id, a.first_name, a.last_name, a.title, a.email, a.company_id,
                     c.name as company_name
              FROM attendees a
              LEFT JOIN companies c ON c.id = a.company_id
              WHERE LOWER(a.email) = LOWER(?)
              LIMIT 3`,
        args: [email.trim()],
      });
      for (const r of emailRows.rows) {
        const aid = Number(r.id);
        if (!seenAttendeeIds.has(aid)) {
          seenAttendeeIds.add(aid);
          attendeeMatches.push({
            id: aid, first_name: String(r.first_name), last_name: String(r.last_name),
            title: r.title ? String(r.title) : null,
            company_name: r.company_name ? String(r.company_name) : null,
            company_id: r.company_id ? Number(r.company_id) : null,
            email: r.email ? String(r.email) : null,
            matchType: 'email',
          });
        }
      }
    }

    // 2. Name match
    if (first_name && last_name && first_name.trim() && last_name.trim()) {
      const nameRows = await db.execute({
        sql: `SELECT a.id, a.first_name, a.last_name, a.title, a.email, a.company_id,
                     c.name as company_name
              FROM attendees a
              LEFT JOIN companies c ON c.id = a.company_id
              WHERE LOWER(a.first_name) LIKE LOWER(?) AND LOWER(a.last_name) LIKE LOWER(?)
              LIMIT 5`,
        args: [`%${first_name.trim()}%`, `%${last_name.trim()}%`],
      });
      for (const r of nameRows.rows) {
        const aid = Number(r.id);
        if (!seenAttendeeIds.has(aid)) {
          seenAttendeeIds.add(aid);
          attendeeMatches.push({
            id: aid, first_name: String(r.first_name), last_name: String(r.last_name),
            title: r.title ? String(r.title) : null,
            company_name: r.company_name ? String(r.company_name) : null,
            company_id: r.company_id ? Number(r.company_id) : null,
            email: r.email ? String(r.email) : null,
            matchType: 'name',
          });
        }
      }
    }

    // 3. Company match (fallback)
    const companyMatches: { id: number; name: string; company_type: string | null }[] = [];
    if (company && company.trim()) {
      const compRows = await db.execute({
        sql: `SELECT id, name, company_type FROM companies
              WHERE LOWER(name) LIKE LOWER(?)
              ORDER BY name ASC LIMIT 5`,
        args: [`%${company.trim()}%`],
      });
      for (const r of compRows.rows) {
        companyMatches.push({
          id: Number(r.id),
          name: String(r.name),
          company_type: r.company_type ? String(r.company_type) : null,
        });
      }
    }

    return NextResponse.json({ attendeeMatches, companyMatches });
  } catch (error) {
    console.error('POST /api/card-scan/match error:', error);
    return NextResponse.json({ error: 'Match lookup failed' }, { status: 500 });
  }
}
