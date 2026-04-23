import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { db, dbReady } from '@/lib/db';

// GET /api/attendees/[id]/touchpoints?conference_id=X
// Returns counts of each touchpoint option for the attendee+conference
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;

  const { id } = await params;
  const attendeeId = parseInt(id, 10);
  if (isNaN(attendeeId)) return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });

  const { searchParams } = new URL(request.url);
  const conferenceId = parseInt(searchParams.get('conference_id') ?? '', 10);
  if (isNaN(conferenceId)) return NextResponse.json({ error: 'conference_id required' }, { status: 400 });

  await dbReady;

  const rows = await db.execute({
    sql: `SELECT option_id, COUNT(*) as count
          FROM attendee_touchpoints
          WHERE attendee_id = ? AND conference_id = ?
          GROUP BY option_id`,
    args: [attendeeId, conferenceId],
  });

  const counts: Record<number, number> = {};
  for (const row of rows.rows) {
    counts[Number(row.option_id)] = Number(row.count);
  }

  return NextResponse.json({ counts });
}

// POST /api/attendees/[id]/touchpoints
// Body: { conference_id, option_id }
// Records one touchpoint and optionally creates a follow-up
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;

  const { id } = await params;
  const attendeeId = parseInt(id, 10);
  if (isNaN(attendeeId)) return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });

  await dbReady;

  const body = await request.json();
  const { conference_id, option_id } = body as { conference_id: number; option_id: number };
  if (!conference_id || !option_id) {
    return NextResponse.json({ error: 'conference_id and option_id required' }, { status: 400 });
  }

  const insertRes = await db.execute({
    sql: `INSERT INTO attendee_touchpoints (attendee_id, conference_id, option_id) VALUES (?, ?, ?) RETURNING id`,
    args: [attendeeId, conference_id, option_id],
  });
  const touchpointId = Number(insertRes.rows[0].id);

  // Check auto_follow_up setting for this option
  const optRow = await db.execute({
    sql: `SELECT value, auto_follow_up FROM config_options WHERE id = ?`,
    args: [option_id],
  });

  let followUpId: number | null = null;
  if (optRow.rows.length > 0) {
    const opt = optRow.rows[0];
    const autoFu = opt.auto_follow_up === null || opt.auto_follow_up === undefined ? 1 : Number(opt.auto_follow_up);
    if (autoFu === 1) {
      // Find "Bus. Card" or use the touchpoint value as next_steps text
      const optValue = String(opt.value);
      const fuRes = await db.execute({
        sql: `INSERT INTO follow_ups (attendee_id, conference_id, next_steps, next_steps_notes, completed)
              VALUES (?, ?, ?, ?, 0) RETURNING id`,
        args: [attendeeId, conference_id, optValue, `Auto-created from touchpoint: ${optValue}`],
      });
      followUpId = Number(fuRes.rows[0].id);
    }
  }

  return NextResponse.json({ success: true, touchpoint_id: touchpointId, follow_up_id: followUpId }, { status: 201 });
}

// DELETE /api/attendees/[id]/touchpoints
// Body: { conference_id, option_id }
// Removes the most recently added touchpoint of this type for the attendee+conference
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;

  const { id } = await params;
  const attendeeId = parseInt(id, 10);
  if (isNaN(attendeeId)) return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });

  await dbReady;

  const body = await request.json();
  const { conference_id, option_id } = body as { conference_id: number; option_id: number };
  if (!conference_id || !option_id) {
    return NextResponse.json({ error: 'conference_id and option_id required' }, { status: 400 });
  }

  // Delete the most recently inserted touchpoint
  const latest = await db.execute({
    sql: `SELECT id FROM attendee_touchpoints
          WHERE attendee_id = ? AND conference_id = ? AND option_id = ?
          ORDER BY id DESC LIMIT 1`,
    args: [attendeeId, conference_id, option_id],
  });

  if (latest.rows.length === 0) {
    return NextResponse.json({ error: 'No touchpoint found' }, { status: 404 });
  }

  await db.execute({
    sql: `DELETE FROM attendee_touchpoints WHERE id = ?`,
    args: [latest.rows[0].id],
  });

  return NextResponse.json({ success: true });
}
