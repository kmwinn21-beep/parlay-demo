import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getDb } from '@/lib/getDb';

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const db = await getDb(authResult.accountId);

  try {
    const conferenceId = Number(params.id);

    // Check if global agenda exists
    const confRow = await db.execute({
      sql: `SELECT global_agenda_uploaded_at, global_agenda_uploaded_by_name FROM conferences WHERE id = ?`,
      args: [conferenceId],
    });
    const conf = confRow.rows[0];
    if (!conf?.global_agenda_uploaded_at) {
      return NextResponse.json({ exists: false, days: null });
    }

    const result = await db.execute({
      sql: `SELECT id, day_label, start_time, end_time, session_type, title, description, location
            FROM conference_agenda_items
            WHERE conference_id = ?
            ORDER BY sort_order ASC`,
      args: [conferenceId],
    });

    const dayMap = new Map<string, { id: number; start_time: string | null; end_time: string | null; session_type: string | null; title: string; description: string | null; location: string | null }[]>();
    for (const row of result.rows) {
      const label = String(row.day_label);
      if (!dayMap.has(label)) dayMap.set(label, []);
      dayMap.get(label)!.push({
        id: Number(row.id),
        start_time: row.start_time ? String(row.start_time) : null,
        end_time: row.end_time ? String(row.end_time) : null,
        session_type: row.session_type ? String(row.session_type) : null,
        title: String(row.title),
        description: row.description ? String(row.description) : null,
        location: row.location ? String(row.location) : null,
      });
    }

    const days = Array.from(dayMap.entries()).map(([day_label, items]) => ({ day_label, items }));
    return NextResponse.json({
      exists: true,
      days,
      uploadedAt: String(conf.global_agenda_uploaded_at),
      uploadedByName: conf.global_agenda_uploaded_by_name ? String(conf.global_agenda_uploaded_by_name) : null,
    });
  } catch (error) {
    console.error('GET /api/conferences/[id]/agenda/global/preview error:', error);
    return NextResponse.json({ error: 'Failed to fetch preview' }, { status: 500 });
  }
}
