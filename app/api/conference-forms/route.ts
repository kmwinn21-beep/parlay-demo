import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { db, dbReady } from '@/lib/db';

export async function GET(request: NextRequest) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  try {
    await dbReady;
    const { searchParams } = new URL(request.url);
    const conferenceId = searchParams.get('conference_id');
    if (!conferenceId) return NextResponse.json({ error: 'conference_id required' }, { status: 400 });

    const formsRes = await db.execute({
      sql: `SELECT id, conference_id, template_id, name, conference_logo_url, background_color,
                   accent_color, accent_gradient, image_url, image_max_width, html_content,
                   image_offset_y, html_offset_y, form_width, created_by, created_at
            FROM conference_forms WHERE conference_id = ? ORDER BY created_at DESC`,
      args: [conferenceId],
    });

    const forms = await Promise.all(formsRes.rows.map(async (f) => {
      // Template fields
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
            options: optsRes.rows.map(o => ({ id: Number(o.id), value: String(o.value), sort_order: Number(o.sort_order) })),
            is_template_field: true,
          };
        }));
      }
      // Extra conference-form-specific fields
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
          options: optsRes.rows.map(o => ({ id: Number(o.id), value: String(o.value), sort_order: Number(o.sort_order) })),
          is_template_field: false,
        };
      }));

      // Submission count
      const subCount = await db.execute({
        sql: `SELECT COUNT(*) as cnt FROM form_submissions WHERE conference_form_id = ?`,
        args: [f.id as number],
      });

      const allFields = [...templateFields, ...extraFields].sort((a: any, b: any) => a.sort_order - b.sort_order);

      return {
        id: Number(f.id),
        conference_id: Number(f.conference_id),
        template_id: f.template_id ? Number(f.template_id) : null,
        name: String(f.name),
        conference_logo_url: f.conference_logo_url ? String(f.conference_logo_url) : null,
        background_color: f.background_color ? String(f.background_color) : null,
        accent_color: f.accent_color ? String(f.accent_color) : null,
        accent_gradient: f.accent_gradient ? String(f.accent_gradient) : null,
        image_url: f.image_url ? String(f.image_url) : null,
        image_max_width: f.image_max_width != null ? Number(f.image_max_width) : null,
        html_content: f.html_content ? String(f.html_content) : null,
        image_offset_y: f.image_offset_y != null ? Number(f.image_offset_y) : null,
        html_offset_y: f.html_offset_y != null ? Number(f.html_offset_y) : null,
        form_width: f.form_width != null ? Number(f.form_width) : null,
        created_by: f.created_by ? String(f.created_by) : null,
        created_at: String(f.created_at),
        submission_count: Number(subCount.rows[0].cnt),
        fields: allFields,
      };
    }));

    return NextResponse.json(forms);
  } catch (error) {
    console.error('GET /api/conference-forms error:', error);
    return NextResponse.json({ error: 'Failed to fetch conference forms' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const user = authResult;
  try {
    await dbReady;
    const { conference_id, template_id, name, conference_logo_url, background_color,
            accent_color, accent_gradient, image_url, image_max_width, html_content,
            image_offset_y, html_offset_y, form_width } = await request.json();
    if (!conference_id || !name?.trim()) return NextResponse.json({ error: 'conference_id and name required' }, { status: 400 });

    const result = await db.execute({
      sql: `INSERT INTO conference_forms
              (conference_id, template_id, name, conference_logo_url, background_color,
               accent_color, accent_gradient, image_url, image_max_width, html_content,
               image_offset_y, html_offset_y, form_width, created_by)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
      args: [
        conference_id, template_id || null, name.trim(),
        conference_logo_url || null, background_color || null,
        accent_color || null, accent_gradient || null,
        image_url || null, image_max_width != null ? Number(image_max_width) : null,
        html_content || null,
        image_offset_y != null ? Number(image_offset_y) : null,
        html_offset_y != null ? Number(html_offset_y) : null,
        form_width != null ? Number(form_width) : null,
        user.email,
      ],
    });
    return NextResponse.json({ id: Number(result.rows[0].id) }, { status: 201 });
  } catch (error) {
    console.error('POST /api/conference-forms error:', error);
    return NextResponse.json({ error: 'Failed to create conference form' }, { status: 500 });
  }
}
