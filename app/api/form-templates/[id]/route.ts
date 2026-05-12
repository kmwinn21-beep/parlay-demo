import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, requireAdmin } from '@/lib/auth';
import { db } from '@/lib/db';
import { getDb } from '@/lib/getDb';

export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  const authResult = await requireAdmin(request);
  if (authResult instanceof NextResponse) return authResult;
  const db = await getDb(authResult?.accountId);
  try {
    const { name } = await request.json();
    if (!name?.trim()) return NextResponse.json({ error: 'name is required' }, { status: 400 });
    await db.execute({
      sql: `UPDATE form_templates SET name = ? WHERE id = ?`,
      args: [name.trim(), params.id],
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('PUT /api/form-templates/[id] error:', error);
    return NextResponse.json({ error: 'Failed to update template' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  const authResult = await requireAdmin(request);
  if (authResult instanceof NextResponse) return authResult;
  const db = await getDb(authResult?.accountId);
  try {
    await db.execute({ sql: `DELETE FROM form_templates WHERE id = ?`, args: [params.id] });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('DELETE /api/form-templates/[id] error:', error);
    return NextResponse.json({ error: 'Failed to delete template' }, { status: 500 });
  }
}
