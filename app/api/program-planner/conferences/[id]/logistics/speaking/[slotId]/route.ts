import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getDb } from '@/lib/getDb';

const FIELD_MAP: Record<string, { column: string; boolean?: boolean }> = {
  speakerUserId: { column: 'speaker_user_id' },
  speakerName: { column: 'speaker_name' },
  sessionTitle: { column: 'session_title' },
  sessionType: { column: 'session_type' },
  sessionDate: { column: 'session_date' },
  sessionTime: { column: 'session_time' },
  roomStage: { column: 'room_stage' },
  slidesSubmitted: { column: 'slides_submitted', boolean: true },
  bioSubmitted: { column: 'bio_submitted', boolean: true },
  notes: { column: 'notes' },
};

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; slotId: string }> }
) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const db = await getDb(authResult?.accountId);

  const { slotId } = await params;
  const id = parseInt(slotId, 10);
  if (isNaN(id)) return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });

  const body = await request.json();
  const entries = Object.entries(body).filter(([key]) => key in FIELD_MAP);
  if (entries.length === 0) return NextResponse.json({ error: 'No valid fields provided' }, { status: 400 });

  const setClauses: string[] = [];
  const args: (string | number | null)[] = [];
  for (const [key, value] of entries) {
    const { column, boolean } = FIELD_MAP[key];
    setClauses.push(`${column} = ?`);
    args.push(boolean ? (value ? 1 : 0) : ((value ?? null) as string | number | null));
  }

  try {
    await db.execute({
      sql: `UPDATE conference_plan_speaking_slots SET ${setClauses.join(', ')} WHERE id = ?`,
      args: [...args, id],
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('PATCH .../logistics/speaking/[slotId] error:', error);
    return NextResponse.json({ error: 'Failed to update speaking slot' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; slotId: string }> }
) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const db = await getDb(authResult?.accountId);

  const { slotId } = await params;
  const id = parseInt(slotId, 10);
  if (isNaN(id)) return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });

  try {
    await db.execute({ sql: `DELETE FROM conference_plan_speaking_slots WHERE id = ?`, args: [id] });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('DELETE .../logistics/speaking/[slotId] error:', error);
    return NextResponse.json({ error: 'Failed to delete speaking slot' }, { status: 500 });
  }
}
