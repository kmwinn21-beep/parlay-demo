import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { db, dbReady } from '@/lib/db';

// GET /api/attendees/[id]/touchpoints?conference_id=X
// With conference_id: returns { counts: Record<optionId, count> } for that conference
// Without conference_id: returns { total, byConference } across all conferences
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
  const conferenceIdParam = searchParams.get('conference_id');

  await dbReady;

  // Single-conference mode
  if (conferenceIdParam) {
    const conferenceId = parseInt(conferenceIdParam, 10);
    if (isNaN(conferenceId)) return NextResponse.json({ error: 'Invalid conference_id' }, { status: 400 });

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

  // All-conferences mode — return full breakdown
  const rows = await db.execute({
    sql: `SELECT at.conference_id, c.name as conference_name, c.start_date,
                 at.option_id, co.value, co.color, COUNT(*) as count
          FROM attendee_touchpoints at
          JOIN config_options co ON co.id = at.option_id
          JOIN conferences c ON c.id = at.conference_id
          WHERE at.attendee_id = ?
          GROUP BY at.conference_id, at.option_id
          ORDER BY c.start_date ASC`,
    args: [attendeeId],
  });

  let total = 0;
  const confMap = new Map<number, { conference_id: number; conference_name: string; options: { option_id: number; value: string; color: string | null; count: number }[] }>();

  for (const row of rows.rows) {
    const cid = Number(row.conference_id);
    const cnt = Number(row.count);
    total += cnt;
    if (!confMap.has(cid)) {
      confMap.set(cid, {
        conference_id: cid,
        conference_name: String(row.conference_name),
        options: [],
      });
    }
    confMap.get(cid)!.options.push({
      option_id: Number(row.option_id),
      value: String(row.value),
      color: row.color ? String(row.color) : null,
      count: cnt,
    });
  }

  return NextResponse.json({ total, byConference: Array.from(confMap.values()) });
}

// POST /api/attendees/[id]/touchpoints
// Body: { conference_id, option_id }
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

  const optRow = await db.execute({
    sql: `SELECT value, auto_follow_up FROM config_options WHERE id = ?`,
    args: [option_id],
  });

  let followUpId: number | null = null;
  if (optRow.rows.length > 0) {
    const opt = optRow.rows[0];
    const autoFu = opt.auto_follow_up === null || opt.auto_follow_up === undefined ? 1 : Number(opt.auto_follow_up);
    if (autoFu === 1) {
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
