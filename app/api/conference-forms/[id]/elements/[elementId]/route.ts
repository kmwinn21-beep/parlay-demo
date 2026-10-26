import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getDb } from '@/lib/getDb';

export async function PUT(request: NextRequest, { params }: { params: { id: string; elementId: string } }) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const db = await getDb(authResult?.accountId);
  try {
    const { x, y, width, height, content, z_index, object_fit, focal_x, focal_y, corner_style,
            background_color, background_opacity } = await request.json();
    const sets: string[] = [];
    // Nullable because clearing a fill is a write of null, not an omission.
    const args: (string | number | null)[] = [];
    if (x !== undefined) { sets.push('x = ?'); args.push(Number(x)); }
    if (y !== undefined) { sets.push('y = ?'); args.push(Number(y)); }
    if (width !== undefined) { sets.push('width = ?'); args.push(Number(width)); }
    if (height !== undefined) { sets.push('height = ?'); args.push(Number(height)); }
    if (z_index !== undefined) { sets.push('z_index = ?'); args.push(Number(z_index)); }
    if (content !== undefined) { sets.push('content = ?'); args.push(content ?? ''); }
    if (object_fit !== undefined) { sets.push('object_fit = ?'); args.push(String(object_fit)); }
    if (focal_x !== undefined) { sets.push('focal_x = ?'); args.push(Number(focal_x)); }
    if (focal_y !== undefined) { sets.push('focal_y = ?'); args.push(Number(focal_y)); }
    if (corner_style !== undefined) { sets.push('corner_style = ?'); args.push(String(corner_style)); }
    /* Null clears the fill — "no background" is a value here, not a missing
       field, which is why these are written when they arrive as null and
       left alone only when they are absent. */
    if (background_color !== undefined) { sets.push('background_color = ?'); args.push(background_color || null); }
    if (background_opacity !== undefined) {
      sets.push('background_opacity = ?');
      args.push(background_opacity != null ? Number(background_opacity) : null);
    }
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
