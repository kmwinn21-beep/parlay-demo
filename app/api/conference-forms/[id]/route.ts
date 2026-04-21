import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { db, dbReady } from '@/lib/db';

export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  try {
    await dbReady;
    const { name, conference_logo_url, background_color,
            accent_color, accent_gradient, image_url, image_max_width, html_content } = await request.json();
    const sets: string[] = [];
    const args: (string | number | null)[] = [];
    if (name !== undefined) { sets.push('name = ?'); args.push(name.trim()); }
    if (conference_logo_url !== undefined) { sets.push('conference_logo_url = ?'); args.push(conference_logo_url || null); }
    if (background_color !== undefined) { sets.push('background_color = ?'); args.push(background_color || null); }
    if (accent_color !== undefined) { sets.push('accent_color = ?'); args.push(accent_color || null); }
    if (accent_gradient !== undefined) { sets.push('accent_gradient = ?'); args.push(accent_gradient || null); }
    if (image_url !== undefined) { sets.push('image_url = ?'); args.push(image_url || null); }
    if (image_max_width !== undefined) { sets.push('image_max_width = ?'); args.push(image_max_width != null ? Number(image_max_width) : null); }
    if (html_content !== undefined) { sets.push('html_content = ?'); args.push(html_content || null); }
    if (sets.length === 0) return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
    args.push(params.id);
    await db.execute({ sql: `UPDATE conference_forms SET ${sets.join(', ')} WHERE id = ?`, args });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('PUT /api/conference-forms/[id] error:', error);
    return NextResponse.json({ error: 'Failed to update form' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  try {
    await dbReady;
    await db.execute({ sql: `DELETE FROM conference_forms WHERE id = ?`, args: [params.id] });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('DELETE /api/conference-forms/[id] error:', error);
    return NextResponse.json({ error: 'Failed to delete form' }, { status: 500 });
  }
}
