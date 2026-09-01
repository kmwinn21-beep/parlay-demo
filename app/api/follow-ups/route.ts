import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getDb } from '@/lib/getDb';
import { getConfigIdByEmail, parseNotifIds, resolveUserIds, createNotifications } from '@/lib/notifications';
import { validateConferenceStage } from '@/lib/validate-conference-stage';
import { trackEvent } from '@/lib/trackEvent';

export async function GET(request: NextRequest) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const db = await getDb(authResult?.accountId);
  try {
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
          fu.follow_up_action,
          fu.completed,
          fu.assigned_rep,
          fu.created_at,
          a.first_name,
          a.last_name,
          a.title,
          a.email,
          a.photo_url,
          a.company_id,
          co.name AS company_name,
          c.name AS conference_name,
          c.start_date,
          COALESCE(nc.notes_count, 0) AS entity_notes_count
        FROM follow_ups fu
        JOIN attendees a ON fu.attendee_id = a.id
        LEFT JOIN companies co ON a.company_id = co.id
        JOIN conferences c ON fu.conference_id = c.id
        -- Counted per conference, matching what the row's notes popover shows:
        -- it filters to the conference in the row's Conference column.
        LEFT JOIN (
          SELECT entity_id, conference_name, COUNT(*) as notes_count
          FROM entity_notes
          WHERE entity_type = 'attendee'
          GROUP BY entity_id, conference_name
        ) nc ON a.id = nc.entity_id AND nc.conference_name = c.name
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
        follow_up_action: r.follow_up_action != null ? String(r.follow_up_action) : null,
        completed: Number(r.completed ?? 0) === 1,
        created_at: r.created_at != null ? String(r.created_at) : '',
        first_name: String(r.first_name ?? ''),
        last_name: String(r.last_name ?? ''),
        title: r.title != null ? String(r.title) : null,
        email: r.email != null ? String(r.email) : null,
        photo_url: r.photo_url != null ? String(r.photo_url) : null,
        company_id: r.company_id != null ? Number(r.company_id) : null,
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
  const db = await getDb(authResult?.accountId);
  try {
    const { id } = await request.json();

    if (id == null) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }

    const fuRow = await db.execute({
      sql: 'SELECT conference_id FROM follow_ups WHERE id = ?',
      args: [id],
    });
    if (fuRow.rows[0]?.conference_id != null) {
      const stageBlock = await validateConferenceStage(request, Number(fuRow.rows[0].conference_id), 'canDeleteFollowUp');
      if (stageBlock) return stageBlock;
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

/**
 * Reassign a set of follow-ups in one go, notifying each newly-assigned rep
 * once for the whole batch.
 *
 * A rep counts as newly assigned only for the rows they weren't already on, so
 * adding someone to a selection they already partly own tells them about the
 * rows that actually changed hands. A batch that turns out to move a single row
 * for a given rep sends that rep the ordinary single-follow-up notification,
 * pointing at the attendee; a genuine batch points at the follow-ups list,
 * since the rows can span attendees and conferences.
 */
async function batchAssignRep(
  db: Awaited<ReturnType<typeof getDb>>,
  user: { id: number; email: string },
  idList: number[],
  assignedRep: string | null,
): Promise<void> {
  const ph = idList.map(() => '?').join(',');

  const before = await db.execute({
    sql: `SELECT fu.id, fu.assigned_rep, fu.attendee_id, a.first_name, a.last_name
            FROM follow_ups fu LEFT JOIN attendees a ON fu.attendee_id = a.id
           WHERE fu.id IN (${ph})`,
    args: idList,
  });

  await db.execute({
    sql: `UPDATE follow_ups SET assigned_rep = ? WHERE id IN (${ph})`,
    args: [assignedRep, ...idList],
  });

  if (!assignedRep) return;

  // Per rep: the rows they were not already assigned to.
  const newIds = parseNotifIds(assignedRep);
  const gained = new Map<number, { id: number; attendeeId: number | null; attendeeName: string }[]>();
  for (const row of before.rows) {
    const prev = new Set(parseNotifIds(row.assigned_rep as string | null));
    const name = `${row.first_name ?? ''} ${row.last_name ?? ''}`.trim();
    for (const repId of newIds) {
      if (prev.has(repId)) continue;
      const list = gained.get(repId) ?? [];
      list.push({
        id: Number(row.id),
        attendeeId: row.attendee_id != null ? Number(row.attendee_id) : null,
        attendeeName: name,
      });
      gained.set(repId, list);
    }
  }
  if (gained.size === 0) return;

  const changedByConfigId = await getConfigIdByEmail(user.email, db);

  for (const [repId, rows] of Array.from(gained.entries())) {
    const userIds = await resolveUserIds(String(repId), changedByConfigId);
    if (userIds.length === 0) continue;

    const single = rows.length === 1 && rows[0].attendeeId != null;
    await createNotifications({
      userIds,
      type: 'attendee',
      recordId: rows[0].id,
      recordName: single ? rows[0].attendeeName : `${rows.length} follow-ups`,
      message: single
        ? `You've been assigned to a follow-up for ${rows[0].attendeeName}`
        : `You've been assigned to ${rows.length} follow-ups`,
      changedByEmail: user.email,
      changedByConfigId,
      // A batch has no single attendee to land on, so it opens the list.
      entityType: single ? 'attendee' : 'follow_up',
      entityId: single ? rows[0].attendeeId! : rows[0].id,
      prefKey: 'follow_up_assigned',
    });
  }
}

export async function PATCH(request: NextRequest) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const user = authResult;
  const db = await getDb(user?.accountId);
  try {
    const body = await request.json();
    const { id, ids, completed, assigned_rep, next_steps, follow_up_action } = body;

    // Batch reassignment. Taking the rows together is what lets one rep get a
    // single "you've been assigned to N follow-ups" instead of N separate
    // notifications and N separate emails.
    const idList = Array.isArray(ids)
      ? Array.from(new Set(ids.map(Number).filter((n: number) => Number.isInteger(n) && n > 0)))
      : null;

    if (idList) {
      if (idList.length === 0) {
        return NextResponse.json({ error: 'ids must contain at least one id' }, { status: 400 });
      }
      if (!('assigned_rep' in body)) {
        return NextResponse.json({ error: 'ids is only supported with assigned_rep' }, { status: 400 });
      }
      await batchAssignRep(db, user, idList, assigned_rep ?? null);
      return NextResponse.json({ success: true, updated: idList.length });
    }

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

    if ('next_steps' in body && next_steps != null) {
      setClauses.push('next_steps = ?');
      args.push(String(next_steps));
    }

    // Stored by full name; '' clears it back to "no action chosen yet".
    if ('follow_up_action' in body) {
      setClauses.push('follow_up_action = ?');
      args.push(follow_up_action ? String(follow_up_action) : null);
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
          sql: `SELECT fu.attendee_id, a.first_name, a.last_name
                  FROM follow_ups fu JOIN attendees a ON fu.attendee_id = a.id
                 WHERE fu.id = ?`,
          args: [id],
        });
        if (fuRow.rows.length > 0) {
          const a = fuRow.rows[0];
          const attendeeName = `${a.first_name} ${a.last_name}`.trim();
          const changedByConfigId = await getConfigIdByEmail(user.email, db);
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
            // The attendee the follow-up is about. This used to be the
            // follow-up's own id, which sent the reader to whichever unrelated
            // attendee happened to share that number.
            entityId: Number(a.attendee_id),
            prefKey: 'follow_up_assigned',
          });
        }
      }
    }

    if (completed === 1 || completed === true) {
      trackEvent(user?.accountId, 'followup_completed', user?.id).catch(() => {});
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('PATCH /api/follow-ups error:', error);
    return NextResponse.json({ error: 'Failed to update follow-up' }, { status: 500 });
  }
}
