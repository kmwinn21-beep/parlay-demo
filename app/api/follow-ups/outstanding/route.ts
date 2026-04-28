import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { db, dbReady } from '@/lib/db';

export async function GET(request: NextRequest) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;

  try {
    await dbReady;

    const userRow = await db.execute({
      sql: 'SELECT config_id FROM users WHERE id = ?',
      args: [authResult.id],
    });
    const configId = userRow.rows[0]?.config_id != null ? Number(userRow.rows[0].config_id) : null;
    if (!configId) return NextResponse.json([]);

    const result = await db.execute({
      sql: `
        SELECT
          fu.id, fu.attendee_id, fu.conference_id, fu.assigned_rep,
          fu.next_steps_notes,
          COALESCE(ns_opt.value, fu.next_steps) AS next_steps,
          a.first_name, a.last_name, a.title,
          co.name AS company_name,
          c.name AS conference_name, c.start_date, c.end_date
        FROM follow_ups fu
        JOIN attendees a ON fu.attendee_id = a.id
        LEFT JOIN companies co ON a.company_id = co.id
        JOIN conferences c ON fu.conference_id = c.id
        LEFT JOIN config_options ns_opt
          ON ns_opt.id = CAST(fu.next_steps AS INTEGER)
          AND ns_opt.category = 'next_steps'
        WHERE fu.completed = 0
          AND fu.next_steps IS NOT NULL AND fu.next_steps != ''
          AND (',' || COALESCE(fu.assigned_rep, '') || ',') LIKE ?
        ORDER BY c.end_date ASC, a.last_name, a.first_name
      `,
      args: [`%,${configId},%`],
    });

    return NextResponse.json(
      result.rows.map(r => ({
        id: Number(r.id),
        attendee_id: Number(r.attendee_id),
        conference_id: Number(r.conference_id),
        next_steps: String(r.next_steps ?? ''),
        next_steps_notes: r.next_steps_notes != null ? String(r.next_steps_notes) : null,
        assigned_rep: r.assigned_rep != null ? String(r.assigned_rep) : null,
        first_name: String(r.first_name ?? ''),
        last_name: String(r.last_name ?? ''),
        title: r.title != null ? String(r.title) : null,
        company_name: r.company_name != null ? String(r.company_name) : null,
        conference_name: String(r.conference_name ?? ''),
        start_date: String(r.start_date ?? ''),
        end_date: String(r.end_date ?? ''),
      })),
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (err) {
    console.error('GET /api/follow-ups/outstanding error:', err);
    return NextResponse.json({ error: 'Failed to fetch' }, { status: 500 });
  }
}
