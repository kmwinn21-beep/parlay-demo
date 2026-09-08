import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/getDb';
import { getSessionUser } from '@/lib/auth';
import { isInvalidRank, normalizeRank } from '@/lib/guestRank';

/**
 * PUT /api/social-events/[id]/rank — set one guest's rep and team rank.
 *
 * Ranks live on `social_event_rsvps`, which is also where the RSVP lives, so a
 * guest who has never been RSVP'd has no row yet. This upserts one, defaulting
 * `rsvp_status` to the column's own default rather than inventing a status —
 * ranking somebody is not a statement about whether they are coming.
 *
 * Either field may be omitted to leave it alone, or sent as null to clear it.
 * Those are different: `{ team_rank: null }` unranks, `{}` changes nothing.
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const user = await getSessionUser(request);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const db = await getDb(user.accountId);

    const body = await request.json() as Record<string, unknown>;
    const attendeeId = Number(body.attendee_id);
    if (!Number.isInteger(attendeeId) || attendeeId <= 0) {
      return NextResponse.json({ error: 'attendee_id is required' }, { status: 400 });
    }

    // Out of range is rejected rather than clamped. A 26 is a bug in the caller,
    // and silently storing 25 would hide it.
    for (const field of ['rep_rank', 'team_rank'] as const) {
      if (field in body && isInvalidRank(body[field])) {
        return NextResponse.json(
          { error: `${field} must be a whole number from 1 to 25, or null` },
          { status: 400 },
        );
      }
    }

    const updates: string[] = [];
    const values: Array<number | null> = [];
    if ('rep_rank' in body) { updates.push('rep_rank'); values.push(normalizeRank(body.rep_rank)); }
    if ('team_rank' in body) { updates.push('team_rank'); values.push(normalizeRank(body.team_rank)); }
    if (updates.length === 0) {
      return NextResponse.json({ error: 'rep_rank or team_rank is required' }, { status: 400 });
    }

    // The guest must actually belong to this event. Without this check any
    // attendee id would create an RSVP row against any event.
    const event = await db.execute({
      sql: 'SELECT prospect_attendees FROM social_events WHERE id = ?',
      args: [params.id],
    });
    if (event.rows.length === 0) {
      return NextResponse.json({ error: 'Social event not found' }, { status: 404 });
    }
    const invited = String(event.rows[0].prospect_attendees ?? '')
      .split(',').map(s => Number(s.trim())).filter(n => Number.isInteger(n) && n > 0);
    if (!invited.includes(attendeeId)) {
      return NextResponse.json({ error: 'That attendee is not on this guest list' }, { status: 400 });
    }

    // One statement, so a guest with no RSVP row gets one and a guest who has
    // one keeps their status. `excluded` carries the values from the VALUES
    // clause, so the untouched field of the two is written back as itself.
    await db.execute({
      sql: `INSERT INTO social_event_rsvps (social_event_id, attendee_id, rsvp_status, rep_rank, team_rank, updated_at)
            VALUES (?, ?, 'maybe', ?, ?, datetime('now'))
            ON CONFLICT (social_event_id, attendee_id) DO UPDATE SET
              ${updates.map(c => `${c} = excluded.${c}`).join(', ')},
              updated_at = excluded.updated_at`,
      args: [
        params.id,
        attendeeId,
        'rep_rank' in body ? normalizeRank(body.rep_rank) : null,
        'team_rank' in body ? normalizeRank(body.team_rank) : null,
      ],
    });

    const saved = await db.execute({
      sql: 'SELECT rep_rank, team_rank FROM social_event_rsvps WHERE social_event_id = ? AND attendee_id = ?',
      args: [params.id, attendeeId],
    });
    const row = saved.rows[0];
    return NextResponse.json({
      success: true,
      rep_rank: row?.rep_rank != null ? Number(row.rep_rank) : null,
      team_rank: row?.team_rank != null ? Number(row.team_rank) : null,
    });
  } catch (error) {
    console.error('PUT /api/social-events/[id]/rank error:', error);
    return NextResponse.json({ error: 'Failed to update rank' }, { status: 500 });
  }
}
