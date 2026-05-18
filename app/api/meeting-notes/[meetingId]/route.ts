import { NextRequest, NextResponse } from 'next/server';
import { getDbForRequest } from '@/lib/getDb';

export async function GET(_: NextRequest, { params }: { params: Promise<{ meetingId: string }> }) {
  const { meetingId } = await params;
  const id = Number(meetingId);
  if (!id) return NextResponse.json({ error: 'Invalid' }, { status: 400 });
  const db = await getDbForRequest();
  const res = await db.execute({ sql: `SELECT * FROM meeting_notes WHERE meeting_id = ? LIMIT 1`, args: [id] });
  return NextResponse.json(res.rows[0] || null);
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ meetingId: string }> }) {
  const { meetingId } = await params;
  const id = Number(meetingId);
  const body = await req.json() as { notes_text?: string; audio_file_path?: string; transcript?: string; summary?: string; created_by?: number | null };
  const db = await getDbForRequest();
  await db.execute({
    sql: `INSERT INTO meeting_notes (meeting_id, notes_text, audio_file_path, transcript, summary, created_by, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
          ON CONFLICT(meeting_id) DO UPDATE SET notes_text=excluded.notes_text, audio_file_path=excluded.audio_file_path, transcript=excluded.transcript, summary=excluded.summary, updated_at=datetime('now')`,
    args: [id, body.notes_text ?? '', body.audio_file_path ?? null, body.transcript ?? null, body.summary ?? null, body.created_by ?? null],
  });
  return NextResponse.json({ ok: true });
}
