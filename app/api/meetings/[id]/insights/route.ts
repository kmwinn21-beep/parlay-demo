import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getDb } from '@/lib/getDb';

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const user = authResult;
  const db = await getDb(user.accountId);
  const { id } = await params;
  const meetingId = Number(id);

  try {
    const body = await request.json() as { insight_type?: string; content?: string; source?: string };
    const { insight_type, content, source = 'manual' } = body;

    if (!insight_type || !content?.trim()) {
      return NextResponse.json({ error: 'insight_type and content are required' }, { status: 400 });
    }
    if (!['pain_point', 'buying_signal'].includes(insight_type)) {
      return NextResponse.json({ error: 'insight_type must be pain_point or buying_signal' }, { status: 400 });
    }

    // Verify the meeting belongs to this account
    const meetingCheck = await db.execute({
      sql: `SELECT m.id FROM meetings m JOIN attendees a ON m.attendee_id = a.id WHERE m.id = ?`,
      args: [meetingId],
    });
    if (meetingCheck.rows.length === 0) {
      return NextResponse.json({ error: 'Meeting not found' }, { status: 404 });
    }

    // Get conference_id and attendee_id from meeting
    const mtgRow = await db.execute({
      sql: `SELECT conference_id, attendee_id FROM meetings WHERE id = ?`,
      args: [meetingId],
    });
    const mtg = mtgRow.rows[0];

    const result = await db.execute({
      sql: `INSERT INTO meeting_insights (meeting_id, conference_id, attendee_id, insight_type, content, confidence, confirmed, source)
            VALUES (?, ?, ?, ?, ?, 'high', 0, ?) RETURNING id, insight_type, content, quote, timestamp_seconds, confidence, confirmed, source`,
      args: [
        meetingId,
        mtg ? Number(mtg.conference_id) : null,
        mtg ? Number(mtg.attendee_id) : null,
        insight_type,
        content.trim(),
        source,
      ],
    });

    const row = result.rows[0];
    if (!row) throw new Error('Insert failed');

    return NextResponse.json({
      id: Number(row.id),
      insight_type: String(row.insight_type),
      content: String(row.content),
      quote: null,
      timestamp_seconds: null,
      confidence: 'high',
      confirmed: false,
      source: String(row.source ?? 'manual') as 'ai' | 'manual',
    });
  } catch (error) {
    console.error('POST /api/meetings/[id]/insights error:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
