import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getDb } from '@/lib/getDb';

async function ensureMeetingTables(db: Awaited<ReturnType<typeof getDb>>) {
  await db.executeMultiple(`
    CREATE TABLE IF NOT EXISTS meeting_notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      meeting_id INTEGER NOT NULL UNIQUE REFERENCES meetings(id) ON DELETE CASCADE,
      notes_text TEXT, transcript TEXT, audio_file_path TEXT, summary TEXT,
      created_by INTEGER REFERENCES users(id),
      created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS meeting_insights (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      meeting_id INTEGER NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
      conference_id INTEGER, company_id INTEGER, attendee_id INTEGER,
      insight_type TEXT NOT NULL, content TEXT NOT NULL,
      quote TEXT, timestamp_seconds INTEGER, icp_match_id INTEGER,
      confidence TEXT DEFAULT 'medium', confirmed INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_meeting_insights_meeting ON meeting_insights(meeting_id);
    CREATE TABLE IF NOT EXISTS meeting_tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      meeting_id INTEGER NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
      insight_id INTEGER REFERENCES meeting_insights(id),
      task_text TEXT NOT NULL, assigned_to INTEGER REFERENCES users(id),
      due_date TEXT, status TEXT DEFAULT 'pending',
      created_by INTEGER REFERENCES users(id),
      created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now'))
    );
  `);
}

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
    await ensureMeetingTables(db);
    const meeting = await getMeetingForAccount(db, meetingId);
    if (!meeting) {
      return NextResponse.json({ error: 'Meeting not found' }, { status: 404 });
    }

    const notesResult = await db.execute({
      sql: `SELECT notes_text, transcript, audio_file_path, summary FROM meeting_notes WHERE meeting_id = ?`,
      args: [meetingId],
    });

    const insightsResult = await db.execute({
      sql: `SELECT id, insight_type, content, quote, timestamp_seconds, confidence, confirmed, source
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
        source: String(r.source ?? 'ai') as 'ai' | 'manual',
      })),
    });
  } catch (error) {
    console.error('GET /api/meetings/[id]/notes error:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const user = authResult;
  const db = await getDb(user.accountId);
  const { id } = await params;
  const meetingId = Number(id);

  try {
    await ensureMeetingTables(db);
    const meeting = await getMeetingForAccount(db, meetingId);
    if (!meeting) {
      return NextResponse.json({ error: 'Meeting not found' }, { status: 404 });
    }

    await db.execute({ sql: `DELETE FROM meeting_insights WHERE meeting_id = ?`, args: [meetingId] });
    await db.execute({ sql: `DELETE FROM meeting_tasks WHERE meeting_id = ?`, args: [meetingId] });
    await db.execute({ sql: `DELETE FROM meeting_notes WHERE meeting_id = ?`, args: [meetingId] });
    try {
      await db.execute({ sql: `DELETE FROM follow_ups WHERE meeting_id = ?`, args: [meetingId] });
    } catch { }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('DELETE /api/meetings/[id]/notes error:', error);
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
    await ensureMeetingTables(db);
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
