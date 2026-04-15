import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { db, dbReady } from '@/lib/db';
import { getConfigIdByEmail, parseNotifIds, resolveUserIds, createNotifications } from '@/lib/notifications';

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

    const conditions = ["fu.next_steps IS NOT NULL AND fu.next_steps != ''"];
    const args: (string | number)[] = [];

    if (attendeeId) {
      conditions.push('fu.attendee_id = ?');
      args.push(attendeeId);
    }
    if (conferenceId) {
      conditions.push('fu.conference_id = ?');
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
          fu.id,
          fu.attendee_id,
          fu.conference_id,
          fu.next_steps,
          fu.next_steps_notes,
          fu.completed,
          fu.assigned_rep,
          a.first_name,
          a.last_name,
          a.title,
          co.name AS company_name,
          c.name AS conference_name,
          c.start_date,
          COALESCE(nc.notes_count, 0) AS entity_notes_count
        FROM follow_ups fu
        JOIN attendees a ON fu.attendee_id = a.id
        LEFT JOIN companies co ON a.company_id = co.id
        JOIN conferences c ON fu.conference_id = c.id
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
        id: Number(r.id),
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
      { headers: { 'Cache-Control': 'no-store' } }
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
    const { id } = await request.json();

    if (id == null) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }

    await db.execute({
      sql: 'DELETE FROM follow_ups WHERE id = ?',
      args: [id],
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
  const user = authResult;
  try {
    await dbReady;
    const body = await request.json();
    const { id, completed, assigned_rep } = body;

    if (id == null) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }

    // Fetch current state before update (for notification diff)
    let prevAssignedRep: string | null = null;
    if ('assigned_rep' in body) {
      const currentRow = await db.execute({ sql: 'SELECT assigned_rep FROM follow_ups WHERE id = ?', args: [id] });
      if (currentRow.rows.length > 0) prevAssignedRep = currentRow.rows[0].assigned_rep as string | null;
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

    args.push(id);

    await db.execute({
      sql: `UPDATE follow_ups SET ${setClauses.join(', ')} WHERE id = ?`,
      args,
    });

    // Notify newly assigned reps (best-effort)
    if ('assigned_rep' in body && assigned_rep) {
      const prevIds = new Set(parseNotifIds(prevAssignedRep));
      const newIds = parseNotifIds(assigned_rep);
      const addedIds = newIds.filter(repId => !prevIds.has(repId));
      if (addedIds.length > 0) {
        const fuRow = await db.execute({
          sql: `SELECT a.first_name, a.last_name FROM follow_ups fu JOIN attendees a ON fu.attendee_id = a.id WHERE fu.id = ?`,
          args: [id],
        });
        if (fuRow.rows.length > 0) {
          const a = fuRow.rows[0];
          const attendeeName = `${a.first_name} ${a.last_name}`.trim();
          const changedByConfigId = await getConfigIdByEmail(user.email);
          const userIds = await resolveUserIds(addedIds.join(','), changedByConfigId);
          createNotifications({
            userIds,
            type: 'attendee',
            recordId: id,
            recordName: attendeeName,
            message: `You've been assigned to a follow-up for ${attendeeName}`,
            changedByEmail: user.email,
            changedByConfigId,
            entityType: 'attendee',
            entityId: id,
          });
        }
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('PATCH /api/follow-ups error:', error);
    return NextResponse.json({ error: 'Failed to update follow-up' }, { status: 500 });
  }
}
