import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { db, dbReady } from '@/lib/db';

export async function GET(request: NextRequest) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  try {
    await dbReady;
    const { searchParams } = new URL(request.url);
    const attendeeId = searchParams.get('attendee_id');
    const conferenceId = searchParams.get('conference_id');
    const companyId = searchParams.get('company_id');
    const companyIds = searchParams.get('company_ids'); // comma-separated list

    const conditions = ["cad.next_steps IS NOT NULL AND cad.next_steps != ''"];
    const args: (string | number)[] = [];

    if (attendeeId) {
      conditions.push('cad.attendee_id = ?');
      args.push(attendeeId);
    }
    if (conferenceId) {
      conditions.push('cad.conference_id = ?');
      args.push(conferenceId);
    }
    if (companyIds) {
      const ids = companyIds.split(',').map(id => id.trim()).filter(Boolean);
      if (ids.length > 0) {
        conditions.push(`a.company_id IN (${ids.map(() => '?').join(',')})`);
        args.push(...ids);
      }
    } else if (companyId) {
      conditions.push('a.company_id = ?');
      args.push(companyId);
    }

    const result = await db.execute({
      sql: `
        SELECT
          cad.attendee_id,
          cad.conference_id,
          cad.next_steps,
          cad.next_steps_notes,
          cad.completed,
          cad.assigned_rep,
          a.first_name,
          a.last_name,
          a.title,
          co.name AS company_name,
          c.name AS conference_name,
          c.start_date,
          COALESCE(nc.notes_count, 0) AS entity_notes_count
        FROM conference_attendee_details cad
        JOIN attendees a ON cad.attendee_id = a.id
        LEFT JOIN companies co ON a.company_id = co.id
        JOIN conferences c ON cad.conference_id = c.id
        LEFT JOIN (
          SELECT entity_id, COUNT(*) as notes_count
          FROM entity_notes
          WHERE entity_type = 'attendee'
          GROUP BY entity_id
        ) nc ON a.id = nc.entity_id
        WHERE ${conditions.join(' AND ')}
        ORDER BY c.start_date DESC, a.last_name, a.first_name
      `,
      args,
    });

    return NextResponse.json(
      result.rows.map((r) => ({
        attendee_id: Number(r.attendee_id),
        conference_id: Number(r.conference_id),
        next_steps: String(r.next_steps ?? ''),
        next_steps_notes: r.next_steps_notes != null ? String(r.next_steps_notes) : null,
        completed: Number(r.completed ?? 0) === 1,
        first_name: String(r.first_name ?? ''),
        last_name: String(r.last_name ?? ''),
        title: r.title != null ? String(r.title) : null,
        company_name: r.company_name != null ? String(r.company_name) : null,
        conference_name: String(r.conference_name ?? ''),
        start_date: String(r.start_date ?? ''),
        entity_notes_count: Number(r.entity_notes_count ?? 0),
        assigned_rep: r.assigned_rep != null ? String(r.assigned_rep) : null,
      })),
      { headers: { 'Cache-Control': 'private, max-age=15, stale-while-revalidate=30' } }
    );
  } catch (error) {
    console.error('GET /api/follow-ups error:', error);
    return NextResponse.json({ error: 'Failed to fetch follow-ups' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  try {
    await dbReady;
    const { attendee_id, conference_id } = await request.json();

    if (attendee_id == null || conference_id == null) {
      return NextResponse.json({ error: 'attendee_id and conference_id are required' }, { status: 400 });
    }

    await db.execute({
      sql: 'UPDATE conference_attendee_details SET next_steps = NULL, next_steps_notes = NULL, completed = 0, assigned_rep = NULL WHERE attendee_id = ? AND conference_id = ?',
      args: [attendee_id, conference_id],
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('DELETE /api/follow-ups error:', error);
    return NextResponse.json({ error: 'Failed to delete follow-up' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  try {
    await dbReady;
    const body = await request.json();
    const { attendee_id, conference_id, completed, assigned_rep } = body;

    if (attendee_id == null || conference_id == null) {
      return NextResponse.json({ error: 'attendee_id and conference_id are required' }, { status: 400 });
    }

    const setClauses: string[] = [];
    const args: (string | number | null)[] = [];

    if (completed != null) {
      setClauses.push('completed = ?');
      args.push(completed ? 1 : 0);
    }

    if ('assigned_rep' in body) {
      setClauses.push('assigned_rep = ?');
      args.push(assigned_rep ?? null);
    }

    if (setClauses.length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
    }

    args.push(attendee_id, conference_id);

    await db.execute({
      sql: `UPDATE conference_attendee_details SET ${setClauses.join(', ')} WHERE attendee_id = ? AND conference_id = ?`,
      args,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('PATCH /api/follow-ups error:', error);
    return NextResponse.json({ error: 'Failed to update follow-up' }, { status: 500 });
  }
}
