import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getDb } from '@/lib/getDb';

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const db = await getDb(authResult?.accountId);
  try {
    const res = await db.execute({
      sql: `SELECT id, conference_form_id, element_type, x, y, width, height, z_index, content,
                   object_fit, focal_x, focal_y
            FROM form_elements WHERE conference_form_id = ? ORDER BY z_index, id`,
      args: [params.id],
    });
    const elements = res.rows.map(r => ({
      id: Number(r.id),
      conference_form_id: Number(r.conference_form_id),
      element_type: String(r.element_type),
      x: Number(r.x),
      y: Number(r.y),
      width: Number(r.width),
      height: Number(r.height),
      z_index: Number(r.z_index),
      content: r.content != null ? String(r.content) : null,
      object_fit: r.object_fit ? String(r.object_fit) : 'contain',
      focal_x: r.focal_x != null ? Number(r.focal_x) : 50,
      focal_y: r.focal_y != null ? Number(r.focal_y) : 50,
    }));
    return NextResponse.json(elements);
  } catch (error) {
    console.error('GET /api/conference-forms/[id]/elements error:', error);
    return NextResponse.json({ error: 'Failed to fetch form elements' }, { status: 500 });
  }
}

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const db = await getDb(authResult?.accountId);
  try {
    const { element_type, x, y, width, height, content, z_index } = await request.json();
    if (!['image', 'text', 'video'].includes(element_type)) {
      return NextResponse.json({ error: 'element_type must be image, text, or video' }, { status: 400 });
    }
    const result = await db.execute({
      sql: `INSERT INTO form_elements (conference_form_id, element_type, x, y, width, height, z_index, content)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
      args: [
        params.id,
        element_type,
        x != null ? Number(x) : 40,
        y != null ? Number(y) : 40,
        width != null ? Number(width) : 280,
        height != null ? Number(height) : (element_type === 'text' ? 200 : 240),
        z_index != null ? Number(z_index) : 0,
        content ?? null,
      ],
    });
    return NextResponse.json({ id: Number(result.rows[0].id) }, { status: 201 });
  } catch (error) {
    console.error('POST /api/conference-forms/[id]/elements error:', error);
    return NextResponse.json({ error: 'Failed to create form element' }, { status: 500 });
  }
}
