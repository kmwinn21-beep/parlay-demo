import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getDb } from '@/lib/getDb';

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const user = authResult;
  const db = await getDb(user?.accountId);
  try {
    const { conference_ids } = await request.json() as { conference_ids?: number[] };
    if (!Array.isArray(conference_ids) || conference_ids.length === 0) {
      return NextResponse.json({ error: 'conference_ids required' }, { status: 400 });
    }

    const formRes = await db.execute({ sql: 'SELECT * FROM conference_forms WHERE id = ?', args: [params.id] });
    const source = formRes.rows[0];
    if (!source) return NextResponse.json({ error: 'Form not found' }, { status: 404 });

    const fieldsRes = await db.execute({
      sql: `SELECT id, field_type, field_key, label, placeholder, required, sort_order, options_source
            FROM form_fields WHERE conference_form_id = ?`,
      args: [params.id],
    });
    const fieldsWithOptions = await Promise.all(fieldsRes.rows.map(async (f) => {
      const optsRes = await db.execute({
        sql: 'SELECT value, sort_order FROM form_field_options WHERE field_id = ?',
        args: [f.id as number],
      });
      return { field: f, options: optsRes.rows };
    }));

    const elementsRes = await db.execute({
      sql: `SELECT element_type, x, y, width, height, z_index, content, object_fit, focal_x, focal_y, corner_style
            FROM form_elements WHERE conference_form_id = ?`,
      args: [params.id],
    });

    const newIds: number[] = [];
    for (const conferenceId of conference_ids) {
      const insertRes = await db.execute({
        sql: `INSERT INTO conference_forms
                (conference_id, template_id, name, conference_logo_url, background_color,
                 accent_color, accent_gradient, image_url, image_max_width, html_content,
                 image_offset_y, html_offset_y, form_width, form_height, form_offset_y, form_x,
                 form_z_index, background_image_url, background_image_opacity,
                 background_video_url, background_video_opacity, eyebrow_color, submit_button_color,
                 field_background_color, panel_logo_url, created_by)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
        args: [
          conferenceId, source.template_id, source.name, source.conference_logo_url, source.background_color,
          source.accent_color, source.accent_gradient, source.image_url, source.image_max_width, source.html_content,
          source.image_offset_y, source.html_offset_y, source.form_width, source.form_height, source.form_offset_y, source.form_x,
          source.form_z_index, source.background_image_url, source.background_image_opacity,
          source.background_video_url, source.background_video_opacity, source.eyebrow_color, source.submit_button_color,
          source.field_background_color, source.panel_logo_url, user.email,
        ],
      });
      const newFormId = Number(insertRes.rows[0].id);
      newIds.push(newFormId);

      for (const { field, options } of fieldsWithOptions) {
        const fieldRes = await db.execute({
          sql: `INSERT INTO form_fields (conference_form_id, field_type, field_key, label, placeholder, required, sort_order, options_source)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
          args: [
            newFormId, field.field_type, field.field_key, field.label,
            field.placeholder, field.required, field.sort_order, field.options_source,
          ],
        });
        const newFieldId = Number(fieldRes.rows[0].id);
        for (const opt of options) {
          await db.execute({
            sql: 'INSERT INTO form_field_options (field_id, value, sort_order) VALUES (?, ?, ?)',
            args: [newFieldId, opt.value, opt.sort_order],
          });
        }
      }

      for (const el of elementsRes.rows) {
        await db.execute({
          sql: `INSERT INTO form_elements (conference_form_id, element_type, x, y, width, height, z_index, content, object_fit, focal_x, focal_y, corner_style)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          args: [
            newFormId, el.element_type, el.x, el.y, el.width, el.height,
            el.z_index, el.content, el.object_fit, el.focal_x, el.focal_y, el.corner_style,
          ],
        });
      }
    }

    return NextResponse.json({ ids: newIds }, { status: 201 });
  } catch (error) {
    console.error('POST /api/conference-forms/[id]/duplicate error:', error);
    return NextResponse.json({ error: 'Failed to duplicate form' }, { status: 500 });
  }
}
