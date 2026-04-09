import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { db, dbReady } from '@/lib/db';

export async function GET(request: NextRequest) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  try {
    await dbReady;
    const result = await db.execute({
      sql: `SELECT a.id, a.first_name, a.last_name, a.title, a.company_id, a.email,
                   a.notes, a.action, a.next_steps, a.next_steps_notes,
                   COALESCE(a.status, 'Unknown') as status,
                   a.seniority,
                   a.created_at,
                   co.name as company_name, co.company_type, co.wse as company_wse,
                   COALESCE(conf_agg.conference_count, 0) as conference_count,
                   conf_agg.conference_names,
                   COALESCE(fu.has_pending, 0) as has_pending_follow_ups,
                   COALESCE(nc.notes_count, 0) as notes_count,
                   rn.recent_notes_concat
            FROM attendees a
            LEFT JOIN companies co ON a.company_id = co.id
            LEFT JOIN (
              SELECT ca.attendee_id,
                     COUNT(DISTINCT ca.conference_id) as conference_count,
                     GROUP_CONCAT(DISTINCT c.name) as conference_names
              FROM conference_attendees ca
              JOIN conferences c ON ca.conference_id = c.id
              GROUP BY ca.attendee_id
            ) conf_agg ON a.id = conf_agg.attendee_id
            LEFT JOIN (
              SELECT cad.attendee_id, 1 as has_pending
              FROM conference_attendee_details cad
              WHERE cad.next_steps IS NOT NULL AND cad.next_steps != ''
                AND (cad.completed IS NULL OR cad.completed = 0)
              GROUP BY cad.attendee_id
            ) fu ON a.id = fu.attendee_id
            LEFT JOIN (
              SELECT entity_id, COUNT(*) as notes_count
              FROM entity_notes
              WHERE entity_type = 'attendee'
              GROUP BY entity_id
            ) nc ON a.id = nc.entity_id
            LEFT JOIN (
              SELECT entity_id, GROUP_CONCAT(content, '|||') as recent_notes_concat
              FROM (
                SELECT entity_id, content
                FROM entity_notes
                WHERE entity_type = 'attendee'
                ORDER BY created_at DESC
              )
              GROUP BY entity_id
            ) rn ON a.id = rn.entity_id
            ORDER BY a.last_name, a.first_name`,
      args: [],
    });

    const attendees = result.rows.map((r) => ({ ...r }));
    return NextResponse.json(attendees, {
      headers: { 'Cache-Control': 'private, max-age=30, stale-while-revalidate=60' },
    });
  } catch (error) {
    console.error('GET /api/attendees error:', error);
    return NextResponse.json({ error: 'Failed to fetch attendees' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  try {
    await dbReady;
    const body = await request.json();
    const { first_name, last_name, title, company_id, email, notes } = body;

    if (!first_name || !last_name) {
      return NextResponse.json({ error: 'First name and last name are required' }, { status: 400 });
    }

    const result = await db.execute({
      sql: 'INSERT INTO attendees (first_name, last_name, title, company_id, email, notes) VALUES (?, ?, ?, ?, ?, ?) RETURNING *',
      args: [first_name, last_name, title || null, company_id || null, email || null, notes || null],
    });

    return NextResponse.json(result.rows[0], { status: 201 });
  } catch (error) {
    console.error('POST /api/attendees error:', error);
    return NextResponse.json({ error: 'Failed to create attendee' }, { status: 500 });
  }
}
