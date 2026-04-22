import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { db, dbReady } from '@/lib/db';
import { classifyCompanyType } from '@/lib/parsers';

export async function POST(request: NextRequest) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;

  try {
    const body = await request.json() as {
      first_name: string; last_name: string;
      title?: string; email?: string; phone?: string;
      company_name?: string; company_id?: number;
      conference_id: number;
    };
    const { first_name, last_name, title, email, company_name, conference_id } = body;
    let { company_id } = body;

    if (!first_name || !last_name || !conference_id) {
      return NextResponse.json({ error: 'first_name, last_name, and conference_id required' }, { status: 400 });
    }

    await dbReady;

    // Create company if name provided and no existing company selected
    if (!company_id && company_name && company_name.trim()) {
      const companyType = classifyCompanyType(company_name.trim());
      const compResult = await db.execute({
        sql: `INSERT INTO companies (name, company_type) VALUES (?, ?) RETURNING id`,
        args: [company_name.trim(), companyType ?? null],
      });
      company_id = Number(compResult.rows[0].id);
    }

    // Create attendee
    const attResult = await db.execute({
      sql: `INSERT INTO attendees (first_name, last_name, title, company_id, email)
            VALUES (?, ?, ?, ?, ?) RETURNING id`,
      args: [
        first_name.trim(),
        last_name.trim(),
        title?.trim() ?? null,
        company_id ?? null,
        email?.trim() ?? null,
      ],
    });
    const attendee_id = Number(attResult.rows[0].id);

    // Associate with conference
    await db.execute({
      sql: 'INSERT OR IGNORE INTO conference_attendees (conference_id, attendee_id) VALUES (?, ?)',
      args: [conference_id, attendee_id],
    });

    // Find "Bus. Card" next_steps option
    const busCardRow = await db.execute({
      sql: `SELECT value FROM config_options
            WHERE category = 'next_steps' AND (LOWER(value) LIKE '%bus%card%' OR LOWER(value) LIKE '%business%card%')
            LIMIT 1`,
      args: [],
    });
    const nextStepsValue = busCardRow.rows[0] ? String(busCardRow.rows[0].value) : 'Bus. Card';

    // Create follow-up
    const fuResult = await db.execute({
      sql: `INSERT INTO follow_ups (attendee_id, conference_id, next_steps, next_steps_notes)
            VALUES (?, ?, ?, ?)`,
      args: [attendee_id, conference_id, nextStepsValue, 'Follow up from business card scan'],
    });

    return NextResponse.json({
      success: true,
      attendee_id,
      company_id: company_id ?? null,
      follow_up_id: Number(fuResult.lastInsertRowid),
    });
  } catch (error) {
    console.error('POST /api/card-scan/add-new error:', error);
    return NextResponse.json({ error: 'Failed to create attendee' }, { status: 500 });
  }
}
