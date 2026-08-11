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
      sql: `SELECT qn.id, qn.content, qn.created_at, qn.created_by, qn.tag, qn.secondary_tag, qn.product_suggestions,
                   qn.conference_id, c.name as conference_name
            FROM quick_notes qn
            LEFT JOIN conferences c ON c.id = qn.conference_id
            WHERE qn.created_by = ? ORDER BY qn.created_at DESC`,
      args: [user.email],
    });
    return NextResponse.json(result.rows.map(r => ({
      id: Number(r.id),
      content: String(r.content),
      created_at: String(r.created_at),
      created_by: r.created_by ? String(r.created_by) : null,
      tag: r.tag ? String(r.tag) : null,
      secondary_tag: r.secondary_tag ? String(r.secondary_tag) : null,
      product_suggestions: r.product_suggestions ? String(r.product_suggestions) : null,
      conference_id: r.conference_id != null ? Number(r.conference_id) : null,
      conference_name: r.conference_name ? String(r.conference_name) : null,
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
    const { content, tag, secondary_tag, product_suggestions, conference_id } = await request.json() as {
      content: string; tag?: string | null; secondary_tag?: string | null; product_suggestions?: string | null; conference_id?: number | null;
    };
    if (!content?.trim()) return NextResponse.json({ error: 'Content is required' }, { status: 400 });
    const result = await db.execute({
      sql: `INSERT INTO quick_notes (content, created_by, tag, secondary_tag, product_suggestions, conference_id)
            VALUES (?, ?, ?, ?, ?, ?)
            RETURNING id, content, created_at, created_by, tag, secondary_tag, product_suggestions, conference_id`,
      args: [content.trim(), user.email ?? null, tag ?? null, secondary_tag ?? null, product_suggestions ?? null, conference_id ?? null],
    });
    const row = result.rows[0];
    let conferenceName: string | null = null;
    if (row.conference_id != null) {
      const cRow = await db.execute({ sql: 'SELECT name FROM conferences WHERE id = ?', args: [row.conference_id] });
      conferenceName = cRow.rows.length > 0 ? String(cRow.rows[0].name) : null;
    }
    return NextResponse.json({
      id: Number(row.id),
      content: String(row.content),
      created_at: String(row.created_at),
      created_by: row.created_by ? String(row.created_by) : null,
      tag: row.tag ? String(row.tag) : null,
      secondary_tag: row.secondary_tag ? String(row.secondary_tag) : null,
      product_suggestions: row.product_suggestions ? String(row.product_suggestions) : null,
      conference_id: row.conference_id != null ? Number(row.conference_id) : null,
      conference_name: conferenceName,
    }, { status: 201 });
  } catch (error) {
    console.error('POST /api/quick-notes error:', error);
    return NextResponse.json({ error: 'Failed to create quick note' }, { status: 500 });
  }
}
