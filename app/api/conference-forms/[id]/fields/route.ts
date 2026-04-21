import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { db, dbReady } from '@/lib/db';

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  try {
    await dbReady;
    const { field_type, label, placeholder, required, sort_order, options_source, options } = await request.json();
    if (!field_type || !label?.trim()) return NextResponse.json({ error: 'field_type and label required' }, { status: 400 });

    const result = await db.execute({
      sql: `INSERT INTO form_fields (conference_form_id, field_type, label, placeholder, required, sort_order, options_source)
            VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id`,
      args: [params.id, field_type, label.trim(), placeholder || null, required ? 1 : 0, sort_order ?? 99, options_source || null],
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

    return NextResponse.json({ id: fieldId }, { status: 201 });
  } catch (error) {
    console.error('POST /api/conference-forms/[id]/fields error:', error);
    return NextResponse.json({ error: 'Failed to add field' }, { status: 500 });
  }
}
