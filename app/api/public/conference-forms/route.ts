import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/getDb';

export const dynamic = 'force-dynamic';

// Public endpoint — no auth. Gated entirely by the form's own public_token + is_public flag,
// same "no session, resolve tenant from an aid query param" shape as /api/input/respond.
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get('token');
    const aid = searchParams.get('aid');
    if (!token || !aid) return NextResponse.json({ error: 'token and aid required' }, { status: 400 });

    const db = await getDb(aid === 'master' ? undefined : aid).catch(() => null);
    if (!db) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const formRes = await db.execute({
      sql: `SELECT cf.id, cf.conference_id, cf.template_id, cf.name, cf.conference_logo_url, cf.background_color,
                   cf.accent_color, cf.accent_gradient, cf.form_width, cf.form_height, cf.form_offset_y, cf.form_x,
                   cf.form_z_index, cf.background_image_url, cf.background_image_opacity,
                   cf.background_video_url, cf.background_video_opacity,
                   cf.eyebrow_color, cf.submit_button_color, cf.field_background_color, cf.panel_logo_url,
                   c.name as conference_name
            FROM conference_forms cf
            JOIN conferences c ON c.id = cf.conference_id
            WHERE cf.public_token = ? AND cf.is_public = 1`,
      args: [token],
    });
    const f = formRes.rows[0];
    if (!f) return NextResponse.json({ error: 'This form is not available' }, { status: 404 });

    let templateFields: object[] = [];
    if (f.template_id) {
      const tfRes = await db.execute({
        sql: `SELECT id, field_type, field_key, label, placeholder, required, sort_order, options_source
              FROM form_fields WHERE template_id = ? AND conference_form_id IS NULL ORDER BY sort_order`,
        args: [f.template_id as number],
      });
      templateFields = await Promise.all(tfRes.rows.map(async (tf) => {
        const optsRes = await db.execute({
          sql: `SELECT id, value, sort_order FROM form_field_options WHERE field_id = ? ORDER BY sort_order`,
          args: [tf.id as number],
        });
        return {
          id: Number(tf.id),
          field_type: String(tf.field_type),
          field_key: tf.field_key ? String(tf.field_key) : null,
          label: String(tf.label),
          placeholder: tf.placeholder ? String(tf.placeholder) : null,
          required: Number(tf.required) === 1,
          sort_order: Number(tf.sort_order),
          options_source: tf.options_source ? String(tf.options_source) : null,
          options: optsRes.rows.map(o => ({ id: Number(o.id), value: String(o.value) })),
        };
      }));
    }
    const cfFieldsRes = await db.execute({
      sql: `SELECT id, field_type, field_key, label, placeholder, required, sort_order, options_source
            FROM form_fields WHERE conference_form_id = ? ORDER BY sort_order`,
      args: [f.id as number],
    });
    const extraFields = await Promise.all(cfFieldsRes.rows.map(async (ef) => {
      const optsRes = await db.execute({
        sql: `SELECT id, value, sort_order FROM form_field_options WHERE field_id = ? ORDER BY sort_order`,
        args: [ef.id as number],
      });
      return {
        id: Number(ef.id),
        field_type: String(ef.field_type),
        field_key: ef.field_key ? String(ef.field_key) : null,
        label: String(ef.label),
        placeholder: ef.placeholder ? String(ef.placeholder) : null,
        required: Number(ef.required) === 1,
        sort_order: Number(ef.sort_order),
        options_source: ef.options_source ? String(ef.options_source) : null,
        options: optsRes.rows.map(o => ({ id: Number(o.id), value: String(o.value) })),
      };
    }));
    const allFields = [...templateFields, ...extraFields].sort((a: any, b: any) => a.sort_order - b.sort_order);

    const elementsRes = await db.execute({
      sql: `SELECT id, element_type, x, y, width, height, z_index, content, object_fit, focal_x, focal_y, corner_style
            FROM form_elements WHERE conference_form_id = ? ORDER BY z_index, id`,
      args: [f.id as number],
    });
    const elements = elementsRes.rows.map(r => ({
      id: Number(r.id),
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
      corner_style: r.corner_style ? String(r.corner_style) : 'rounded',
    }));

    return NextResponse.json({
      id: Number(f.id),
      conference_id: Number(f.conference_id),
      conference_name: String(f.conference_name),
      name: String(f.name),
      conference_logo_url: f.conference_logo_url ? String(f.conference_logo_url) : null,
      background_color: f.background_color ? String(f.background_color) : null,
      accent_color: f.accent_color ? String(f.accent_color) : null,
      accent_gradient: f.accent_gradient ? String(f.accent_gradient) : null,
      form_width: f.form_width != null ? Number(f.form_width) : null,
      form_height: f.form_height != null ? Number(f.form_height) : null,
      form_offset_y: f.form_offset_y != null ? Number(f.form_offset_y) : null,
      form_x: f.form_x != null ? Number(f.form_x) : null,
      form_z_index: Number(f.form_z_index),
      background_image_url: f.background_image_url ? String(f.background_image_url) : null,
      background_image_opacity: f.background_image_opacity != null ? Number(f.background_image_opacity) : null,
      background_video_url: f.background_video_url ? String(f.background_video_url) : null,
      background_video_opacity: f.background_video_opacity != null ? Number(f.background_video_opacity) : null,
      eyebrow_color: f.eyebrow_color ? String(f.eyebrow_color) : null,
      submit_button_color: f.submit_button_color ? String(f.submit_button_color) : null,
      field_background_color: f.field_background_color ? String(f.field_background_color) : null,
      panel_logo_url: f.panel_logo_url ? String(f.panel_logo_url) : null,
      fields: allFields,
      elements,
    });
  } catch (error) {
    console.error('GET /api/public/conference-forms error:', error);
    return NextResponse.json({ error: 'Failed to load form' }, { status: 500 });
  }
}
