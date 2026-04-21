import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { db, dbReady } from '@/lib/db';

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  try {
    await dbReady;
    const { field_type, field_key, label, placeholder, required, sort_order, options_source, options } = await request.json();
    if (!field_type || !label?.trim()) return NextResponse.json({ error: 'field_type and label required' }, { status: 400 });

    const result = await db.execute({
      sql: `INSERT INTO form_fields (template_id, field_type, field_key, label, placeholder, required, sort_order, options_source)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
      args: [params.id, field_type, field_key || null, label.trim(), placeholder || null, required ? 1 : 0, sort_order ?? 0, options_source || null],
    });
    const fieldId = Number(result.rows[0].id);

    if (Array.isArray(options) && options.length > 0) {
      for (let i = 0; i < options.length; i++) {
        if (options[i]?.trim()) {
          await db.execute({
            sql: `INSERT INTO form_field_options (field_id, value, sort_order) VALUES (?, ?, ?)`,
            args: [fieldId, options[i].trim(), i],
          });
        }
      }
    }

    const optsRes = await db.execute({
      sql: `SELECT id, value, sort_order FROM form_field_options WHERE field_id = ? ORDER BY sort_order`,
      args: [fieldId],
    });

    return NextResponse.json({
      id: fieldId,
      field_type,
      field_key: field_key || null,
      label: label.trim(),
      placeholder: placeholder || null,
      required: !!required,
      sort_order: sort_order ?? 0,
      options_source: options_source || null,
      options: optsRes.rows.map(o => ({ id: Number(o.id), value: String(o.value), sort_order: Number(o.sort_order) })),
    }, { status: 201 });
  } catch (error) {
    console.error('POST /api/form-templates/[id]/fields error:', error);
    return NextResponse.json({ error: 'Failed to add field' }, { status: 500 });
  }
}
