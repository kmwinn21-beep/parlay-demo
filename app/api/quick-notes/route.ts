import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { db, dbReady } from '@/lib/db';

export async function GET(request: NextRequest) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  try {
    await dbReady;
    const result = await db.execute({
      sql: 'SELECT id, content, created_at, created_by FROM quick_notes ORDER BY created_at DESC',
      args: [],
    });
    return NextResponse.json(result.rows.map(r => ({
      id: Number(r.id),
      content: String(r.content),
      created_at: String(r.created_at),
      created_by: r.created_by ? String(r.created_by) : null,
    })));
  } catch (error) {
    console.error('GET /api/quick-notes error:', error);
    return NextResponse.json({ error: 'Failed to fetch quick notes' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const user = authResult;
  try {
    await dbReady;
    const { content } = await request.json() as { content: string };
    if (!content?.trim()) return NextResponse.json({ error: 'Content is required' }, { status: 400 });
    const result = await db.execute({
      sql: 'INSERT INTO quick_notes (content, created_by) VALUES (?, ?) RETURNING id, content, created_at, created_by',
      args: [content.trim(), user.email ?? null],
    });
    const row = result.rows[0];
    return NextResponse.json({
      id: Number(row.id),
      content: String(row.content),
      created_at: String(row.created_at),
      created_by: row.created_by ? String(row.created_by) : null,
    }, { status: 201 });
  } catch (error) {
    console.error('POST /api/quick-notes error:', error);
    return NextResponse.json({ error: 'Failed to create quick note' }, { status: 500 });
  }
}
