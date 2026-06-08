import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getDb } from '@/lib/getDb';
import { getSeriesYoYData } from '@/lib/get-series-yoy-data';
import { generateExecutiveBriefHTML } from '@/lib/generate-executive-brief-html';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const db = await getDb(authResult.accountId);

  const conferenceId = Number(params.id);
  if (!Number.isFinite(conferenceId)) {
    return NextResponse.json({ error: 'Invalid conference id' }, { status: 400 });
  }

  // Fetch snapshot
  const snapRes = await db.execute({
    sql: `SELECT * FROM conference_snapshots WHERE conference_id = ? ORDER BY snapshot_taken_at DESC LIMIT 1`,
    args: [conferenceId],
  });
  if (snapRes.rows.length === 0) {
    return NextResponse.json({ error: 'No snapshot found' }, { status: 404 });
  }
  const snapshot = snapRes.rows[0];

  // Fetch conference record
  const confRes = await db.execute({
    sql: `SELECT id, name, start_date, end_date, internal_attendees, series_id FROM conferences WHERE id = ?`,
    args: [conferenceId],
  });
  if (confRes.rows.length === 0) {
    return NextResponse.json({ error: 'Conference not found' }, { status: 404 });
  }
  const conference = confRes.rows[0];

  // Fetch series YoY if series_id exists
  let seriesYoY = null;
  if (conference.series_id) {
    try {
      seriesYoY = await getSeriesYoYData(String(conference.series_id), db);
    } catch {
      // Non-fatal — proceed without YoY
    }
  }

  const proto = request.headers.get('x-forwarded-proto') ?? 'https';
  const host = request.headers.get('host') ?? '';
  const baseUrl = host ? `${proto}://${host}` : '';

  const html = generateExecutiveBriefHTML({ conference, snapshot, seriesYoY, baseUrl });
  return NextResponse.json({ html });
}
