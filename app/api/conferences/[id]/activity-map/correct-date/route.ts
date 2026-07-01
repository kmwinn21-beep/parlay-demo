import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getDb } from '@/lib/getDb';

// Pure UTC calendar-date arithmetic — avoids local-timezone drift that would
// otherwise creep in from `new Date('YYYY-MM-DD')`-style parsing.
function addCalendarDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(dt.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

// POST /api/conferences/[id]/activity-map/correct-date
// Body: { activityId: "touchpoint-42" | "follow_up-17", day: number }
// Rewrites the underlying record's created_at to the selected conference day,
// preserving the original time-of-day. Only touchpoints and unlinked
// follow-ups can be "approximate" (meetings always have a real scheduled day).
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const db = await getDb(authResult?.accountId);

  const { id } = await params;
  const confId = parseInt(id, 10);
  if (isNaN(confId)) return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });

  const body = await request.json().catch(() => ({}));
  const { activityId, day: dayInput } = body as { activityId?: string; day?: number };
  if (!activityId || typeof activityId !== 'string' || !Number.isInteger(dayInput)) {
    return NextResponse.json({ error: 'activityId and day are required' }, { status: 400 });
  }
  const day: number = dayInput as number;

  const dashIdx = activityId.indexOf('-');
  const type = dashIdx === -1 ? activityId : activityId.slice(0, dashIdx);
  const recordId = dashIdx === -1 ? NaN : parseInt(activityId.slice(dashIdx + 1), 10);
  if ((type !== 'touchpoint' && type !== 'follow_up') || isNaN(recordId)) {
    return NextResponse.json(
      { error: 'Only touchpoints and follow-ups support date correction' },
      { status: 400 },
    );
  }

  const confRow = await db.execute({
    sql: 'SELECT start_date, end_date FROM conferences WHERE id = ?',
    args: [confId],
  });
  if (confRow.rows.length === 0) return NextResponse.json({ error: 'Conference not found' }, { status: 404 });
  const confStart = String(confRow.rows[0].start_date);
  const confEnd = String(confRow.rows[0].end_date);
  const [sy, sm, sd] = confStart.split('-').map(Number);
  const [ey, em, ed] = confEnd.split('-').map(Number);
  const totalDays = Math.round(
    (Date.UTC(ey, em - 1, ed) - Date.UTC(sy, sm - 1, sd)) / 86400000,
  ) + 1;
  if (day < 1 || day > totalDays) {
    return NextResponse.json({ error: `day must be between 1 and ${totalDays}` }, { status: 400 });
  }

  const table = type === 'touchpoint' ? 'attendee_touchpoints' : 'follow_ups';
  const currentRow = await db.execute({
    sql: `SELECT created_at, conference_id FROM ${table} WHERE id = ?`,
    args: [recordId],
  });
  if (currentRow.rows.length === 0) return NextResponse.json({ error: 'Record not found' }, { status: 404 });
  if (Number(currentRow.rows[0].conference_id) !== confId) {
    return NextResponse.json({ error: 'Record does not belong to this conference' }, { status: 400 });
  }

  const currentCreatedAt = String(currentRow.rows[0].created_at ?? '');
  const timePart = currentCreatedAt.split(/[ T]/)[1] ?? '00:00:00';
  const newDateStr = addCalendarDays(confStart, day - 1);
  const newCreatedAt = `${newDateStr} ${timePart}`;

  await db.execute({
    sql: `UPDATE ${table} SET created_at = ? WHERE id = ?`,
    args: [newCreatedAt, recordId],
  });

  return NextResponse.json({ success: true, activityId, day, timestamp: newCreatedAt });
}
