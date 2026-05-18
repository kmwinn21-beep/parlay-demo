import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getDb } from '@/lib/getDb';

async function getMeetingForAccount(db: Awaited<ReturnType<typeof getDb>>, meetingId: number) {
  const result = await db.execute({
    sql: `SELECT m.id, m.attendee_id, m.conference_id FROM meetings m
          JOIN attendees a ON m.attendee_id = a.id
          WHERE m.id = ?`,
    args: [meetingId],
  });
  return result.rows[0] ?? null;
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const user = authResult;
  const db = await getDb(user.accountId);
  const { id } = await params;
  const meetingId = Number(id);

  try {
    const meeting = await getMeetingForAccount(db, meetingId);
    if (!meeting) {
      return NextResponse.json({ error: 'Meeting not found' }, { status: 404 });
    }

    const notesResult = await db.execute({
      sql: `SELECT notes_text, transcript, audio_file_path, summary FROM meeting_notes WHERE meeting_id = ?`,
      args: [meetingId],
    });

    const insightsResult = await db.execute({
      sql: `SELECT id, insight_type, content, quote, timestamp_seconds, confidence, confirmed
            FROM meeting_insights WHERE meeting_id = ? ORDER BY id ASC`,
      args: [meetingId],
    });

    const notes = notesResult.rows[0] ?? null;

    return NextResponse.json({
      notes_text: notes ? String(notes.notes_text ?? '') : '',
      transcript: notes ? String(notes.transcript ?? '') : '',
      audio_file_path: notes ? (notes.audio_file_path ? String(notes.audio_file_path) : null) : null,
      summary: notes ? String(notes.summary ?? '') : '',
      insights: insightsResult.rows.map(r => ({
        id: Number(r.id),
        insight_type: String(r.insight_type),
        content: String(r.content),
        quote: r.quote ? String(r.quote) : null,
        timestamp_seconds: r.timestamp_seconds != null ? Number(r.timestamp_seconds) : null,
        confidence: String(r.confidence ?? 'medium'),
        confirmed: Number(r.confirmed) === 1,
      })),
    });
  } catch (error) {
    console.error('GET /api/meetings/[id]/notes error:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const user = authResult;
  const db = await getDb(user.accountId);
  const { id } = await params;
  const meetingId = Number(id);

  try {
    const meeting = await getMeetingForAccount(db, meetingId);
    if (!meeting) {
      return NextResponse.json({ error: 'Meeting not found' }, { status: 404 });
    }

    const body = await request.json();
    const { notes_text, transcript, audio_file_path, summary } = body;

    const existing = await db.execute({
      sql: `SELECT id FROM meeting_notes WHERE meeting_id = ?`,
      args: [meetingId],
    });

    if (existing.rows.length > 0) {
      await db.execute({
        sql: `UPDATE meeting_notes SET
                notes_text = COALESCE(?, notes_text),
                transcript = COALESCE(?, transcript),
                audio_file_path = COALESCE(?, audio_file_path),
                summary = COALESCE(?, summary),
                updated_at = datetime('now')
              WHERE meeting_id = ?`,
        args: [
          notes_text ?? null,
          transcript ?? null,
          audio_file_path ?? null,
          summary ?? null,
          meetingId,
        ],
      });
    } else {
      await db.execute({
        sql: `INSERT INTO meeting_notes (meeting_id, notes_text, transcript, audio_file_path, summary, created_by)
              VALUES (?, ?, ?, ?, ?, ?)`,
        args: [
          meetingId,
          notes_text ?? null,
          transcript ?? null,
          audio_file_path ?? null,
          summary ?? null,
          user.id ?? null,
        ],
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('PUT /api/meetings/[id]/notes error:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
