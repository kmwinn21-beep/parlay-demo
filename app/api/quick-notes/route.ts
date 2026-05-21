import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getDb } from '@/lib/getDb';

export async function GET(request: NextRequest) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const user = authResult;
  const db = await getDb(user?.accountId);
  try {
    const result = await db.execute({
      sql: 'SELECT id, content, created_at, created_by, tag, secondary_tag FROM quick_notes WHERE created_by = ? ORDER BY created_at DESC',
      args: [user.email],
    });
    return NextResponse.json(result.rows.map(r => ({
      id: Number(r.id),
      content: String(r.content),
      created_at: String(r.created_at),
      created_by: r.created_by ? String(r.created_by) : null,
      tag: r.tag ? String(r.tag) : null,
      secondary_tag: r.secondary_tag ? String(r.secondary_tag) : null,
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
  const db = await getDb(user?.accountId);
  try {
    const { content, tag, secondary_tag } = await request.json() as { content: string; tag?: string | null; secondary_tag?: string | null };
    if (!content?.trim()) return NextResponse.json({ error: 'Content is required' }, { status: 400 });
    const result = await db.execute({
      sql: 'INSERT INTO quick_notes (content, created_by, tag, secondary_tag) VALUES (?, ?, ?, ?) RETURNING id, content, created_at, created_by, tag, secondary_tag',
      args: [content.trim(), user.email ?? null, tag ?? null, secondary_tag ?? null],
    });
    const row = result.rows[0];
    return NextResponse.json({
      id: Number(row.id),
      content: String(row.content),
      created_at: String(row.created_at),
      created_by: row.created_by ? String(row.created_by) : null,
      tag: row.tag ? String(row.tag) : null,
      secondary_tag: row.secondary_tag ? String(row.secondary_tag) : null,
    }, { status: 201 });
  } catch (error) {
    console.error('POST /api/quick-notes error:', error);
    return NextResponse.json({ error: 'Failed to create quick note' }, { status: 500 });
  }
}
