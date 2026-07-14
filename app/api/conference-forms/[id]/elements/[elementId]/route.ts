import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getDb } from '@/lib/getDb';

export async function PUT(request: NextRequest, { params }: { params: { id: string; elementId: string } }) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const db = await getDb(authResult?.accountId);
  try {
    const { x, y, width, height, content, z_index, object_fit, focal_x, focal_y } = await request.json();
    const sets: string[] = [];
    const args: (string | number)[] = [];
    if (x !== undefined) { sets.push('x = ?'); args.push(Number(x)); }
    if (y !== undefined) { sets.push('y = ?'); args.push(Number(y)); }
    if (width !== undefined) { sets.push('width = ?'); args.push(Number(width)); }
    if (height !== undefined) { sets.push('height = ?'); args.push(Number(height)); }
    if (z_index !== undefined) { sets.push('z_index = ?'); args.push(Number(z_index)); }
    if (content !== undefined) { sets.push('content = ?'); args.push(content ?? ''); }
    if (object_fit !== undefined) { sets.push('object_fit = ?'); args.push(String(object_fit)); }
    if (focal_x !== undefined) { sets.push('focal_x = ?'); args.push(Number(focal_x)); }
    if (focal_y !== undefined) { sets.push('focal_y = ?'); args.push(Number(focal_y)); }
    if (sets.length === 0) return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
    args.push(params.elementId, params.id);
    await db.execute({
      sql: `UPDATE form_elements SET ${sets.join(', ')} WHERE id = ? AND conference_form_id = ?`,
      args,
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('PUT /api/conference-forms/[id]/elements/[elementId] error:', error);
    return NextResponse.json({ error: 'Failed to update form element' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string; elementId: string } }) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const db = await getDb(authResult?.accountId);
  try {
    await db.execute({
      sql: `DELETE FROM form_elements WHERE id = ? AND conference_form_id = ?`,
      args: [params.elementId, params.id],
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('DELETE /api/conference-forms/[id]/elements/[elementId] error:', error);
    return NextResponse.json({ error: 'Failed to delete form element' }, { status: 500 });
  }
}
