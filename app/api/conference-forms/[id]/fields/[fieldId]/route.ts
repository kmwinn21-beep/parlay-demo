import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { db, dbReady } from '@/lib/db';

export async function PUT(request: NextRequest, { params }: { params: { id: string; fieldId: string } }) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  try {
    await dbReady;
    const { label, placeholder, required, sort_order, options_source, options } = await request.json();
    const sets: string[] = [];
    const args: (string | number | null)[] = [];
    if (label !== undefined) { sets.push('label = ?'); args.push(label.trim()); }
    if (placeholder !== undefined) { sets.push('placeholder = ?'); args.push(placeholder || null); }
    if (required !== undefined) { sets.push('required = ?'); args.push(required ? 1 : 0); }
    if (sort_order !== undefined) { sets.push('sort_order = ?'); args.push(sort_order); }
    if (options_source !== undefined) { sets.push('options_source = ?'); args.push(options_source || null); }
    if (sets.length > 0) {
      args.push(params.fieldId);
      await db.execute({ sql: `UPDATE form_fields SET ${sets.join(', ')} WHERE id = ?`, args });
    }
    if (Array.isArray(options)) {
      await db.execute({ sql: `DELETE FROM form_field_options WHERE field_id = ?`, args: [params.fieldId] });
      for (let i = 0; i < options.length; i++) {
        if (options[i]?.trim()) {
          await db.execute({
            sql: `INSERT INTO form_field_options (field_id, value, sort_order) VALUES (?, ?, ?)`,
            args: [params.fieldId, options[i].trim(), i],
          });
        }
      }
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('PUT /api/conference-forms/[id]/fields/[fieldId] error:', error);
    return NextResponse.json({ error: 'Failed to update field' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string; fieldId: string } }) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  try {
    await dbReady;
    await db.execute({ sql: `DELETE FROM form_fields WHERE id = ? AND conference_form_id = ?`, args: [params.fieldId, params.id] });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('DELETE /api/conference-forms/[id]/fields/[fieldId] error:', error);
    return NextResponse.json({ error: 'Failed to delete field' }, { status: 500 });
  }
}
