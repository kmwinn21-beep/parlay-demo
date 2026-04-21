import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, requireAdmin } from '@/lib/auth';
import { db, dbReady } from '@/lib/db';

export async function GET(request: NextRequest) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  try {
    await dbReady;
    const result = await db.execute({
      sql: `SELECT id, name, created_by, created_at FROM form_templates ORDER BY created_at DESC`,
      args: [],
    });
    const templates = await Promise.all(result.rows.map(async (r) => {
      const fieldsRes = await db.execute({
        sql: `SELECT id, field_type, field_key, label, placeholder, required, sort_order, options_source
              FROM form_fields WHERE template_id = ? AND conference_form_id IS NULL ORDER BY sort_order`,
        args: [r.id as number],
      });
      const fields = await Promise.all(fieldsRes.rows.map(async (f) => {
        const optsRes = await db.execute({
          sql: `SELECT id, value, sort_order FROM form_field_options WHERE field_id = ? ORDER BY sort_order`,
          args: [f.id as number],
        });
        return {
          id: Number(f.id),
          field_type: String(f.field_type),
          field_key: f.field_key ? String(f.field_key) : null,
          label: String(f.label),
          placeholder: f.placeholder ? String(f.placeholder) : null,
          required: Number(f.required) === 1,
          sort_order: Number(f.sort_order),
          options_source: f.options_source ? String(f.options_source) : null,
          options: optsRes.rows.map(o => ({ id: Number(o.id), value: String(o.value), sort_order: Number(o.sort_order) })),
        };
      }));
      return {
        id: Number(r.id),
        name: String(r.name),
        created_by: r.created_by ? String(r.created_by) : null,
        created_at: String(r.created_at),
        fields,
      };
    }));
    return NextResponse.json(templates);
  } catch (error) {
    console.error('GET /api/form-templates error:', error);
    return NextResponse.json({ error: 'Failed to fetch templates' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const authResult = await requireAdmin(request);
  if (authResult instanceof NextResponse) return authResult;
  const user = authResult;
  try {
    await dbReady;
    const { name } = await request.json();
    if (!name?.trim()) return NextResponse.json({ error: 'name is required' }, { status: 400 });
    const result = await db.execute({
      sql: `INSERT INTO form_templates (name, created_by) VALUES (?, ?) RETURNING id, name, created_by, created_at`,
      args: [name.trim(), user.email],
    });
    const row = result.rows[0];
    return NextResponse.json({ id: Number(row.id), name: String(row.name), created_by: String(row.created_by), created_at: String(row.created_at), fields: [] }, { status: 201 });
  } catch (error) {
    console.error('POST /api/form-templates error:', error);
    return NextResponse.json({ error: 'Failed to create template' }, { status: 500 });
  }
}
