import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getDb } from '@/lib/getDb';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const db = await getDb(authResult?.accountId);

  const { id } = await params;
  const confId = parseInt(id, 10);
  if (isNaN(confId)) return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });

  const url = new URL(request.url);
  const year = parseInt(url.searchParams.get('year') ?? '', 10);
  if (isNaN(year)) return NextResponse.json({ error: 'year is required' }, { status: 400 });

  const body = await request.json();
  const speakerUserId = body.speakerUserId != null ? Number(body.speakerUserId) : null;
  const speakerName = body.speakerName || null;
  const sessionTitle = body.sessionTitle || null;
  const sessionType = body.sessionType || null;
  const sessionDate = body.sessionDate || null;
  const sessionTime = body.sessionTime || null;
  const roomStage = body.roomStage || null;
  const notes = body.notes || null;

  try {
    const result = await db.execute({
      sql: `INSERT INTO conference_plan_speaking_slots
              (conference_id, plan_year, speaker_user_id, speaker_name, session_title, session_type,
               session_date, session_time, room_stage, notes)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
      args: [confId, year, speakerUserId, speakerName, sessionTitle, sessionType, sessionDate, sessionTime, roomStage, notes],
    });
    const newId = Number(result.rows[0].id);

    // Speakers are picked from the assigned-reps roster, which is sourced from
    // config_options (category='user'), not `users` logins.
    let speakerDisplayName: string | null = null;
    if (speakerUserId != null) {
      const optRes = await db.execute({ sql: `SELECT value FROM config_options WHERE category = 'user' AND id = ?`, args: [speakerUserId] });
      if (optRes.rows[0]?.value) speakerDisplayName = String(optRes.rows[0].value);
    }

    return NextResponse.json({
      id: newId, speakerUserId, speakerName, speakerDisplayName, sessionTitle, sessionType,
      sessionDate, sessionTime, roomStage, slidesSubmitted: false, bioSubmitted: false, notes,
    }, { status: 201 });
  } catch (error) {
    console.error('POST /api/program-planner/conferences/[id]/logistics/speaking error:', error);
    return NextResponse.json({ error: 'Failed to create speaking slot' }, { status: 500 });
  }
}
