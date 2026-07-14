import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getDb } from '@/lib/getDb';
import { validateConferenceStage } from '@/lib/validate-conference-stage';

export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const db = await getDb(authResult?.accountId);
  try {
    const formRow = await db.execute({
      sql: 'SELECT conference_id FROM conference_forms WHERE id = ?',
      args: [params.id],
    });
    if (formRow.rows[0]?.conference_id != null) {
      const stageBlock = await validateConferenceStage(request, Number(formRow.rows[0].conference_id), 'canSubmitForm');
      if (stageBlock) return stageBlock;
    }
    const { name, conference_logo_url, background_color,
            accent_color, accent_gradient, image_url, image_max_width, html_content,
            image_offset_y, html_offset_y, form_width, form_height, form_offset_y, form_x,
            form_z_index, background_image_url, background_image_opacity,
            panel_logo_url } = await request.json();
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
    if (image_offset_y !== undefined) { sets.push('image_offset_y = ?'); args.push(image_offset_y != null ? Number(image_offset_y) : null); }
    if (html_offset_y !== undefined) { sets.push('html_offset_y = ?'); args.push(html_offset_y != null ? Number(html_offset_y) : null); }
    if (form_width !== undefined) { sets.push('form_width = ?'); args.push(form_width != null ? Number(form_width) : null); }
    if (form_height !== undefined) { sets.push('form_height = ?'); args.push(form_height != null ? Number(form_height) : null); }
    if (form_offset_y !== undefined) { sets.push('form_offset_y = ?'); args.push(form_offset_y != null ? Number(form_offset_y) : null); }
    if (form_x !== undefined) { sets.push('form_x = ?'); args.push(form_x != null ? Number(form_x) : null); }
    if (form_z_index !== undefined) { sets.push('form_z_index = ?'); args.push(Number(form_z_index)); }
    if (background_image_url !== undefined) { sets.push('background_image_url = ?'); args.push(background_image_url || null); }
    if (background_image_opacity !== undefined) { sets.push('background_image_opacity = ?'); args.push(background_image_opacity != null ? Number(background_image_opacity) : null); }
    if (panel_logo_url !== undefined) { sets.push('panel_logo_url = ?'); args.push(panel_logo_url || null); }
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
  const db = await getDb(authResult?.accountId);
  try {
    await db.execute({ sql: `DELETE FROM conference_forms WHERE id = ?`, args: [params.id] });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('DELETE /api/conference-forms/[id] error:', error);
    return NextResponse.json({ error: 'Failed to delete form' }, { status: 500 });
  }
}
