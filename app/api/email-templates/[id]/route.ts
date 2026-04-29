import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { db, dbReady } from '@/lib/db';

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireAdmin(request);
  if (user instanceof NextResponse) return user;

  const { id } = await params;
  const body = await request.json();
  const { name, subject, body: templateBody } = body as { name?: string; subject?: string; body?: string };

  if (!name?.trim() || !subject?.trim() || !templateBody?.trim()) {
    return NextResponse.json({ error: 'name, subject, and body are required.' }, { status: 400 });
  }

  await dbReady;
  await db.execute({
    sql: 'UPDATE email_templates SET name = ?, subject = ?, body = ? WHERE id = ?',
    args: [name.trim(), subject.trim(), templateBody.trim(), parseInt(id, 10)],
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireAdmin(request);
  if (user instanceof NextResponse) return user;

  const { id } = await params;

  await dbReady;
  await db.execute({
    sql: 'DELETE FROM email_templates WHERE id = ?',
    args: [parseInt(id, 10)],
  });

  return NextResponse.json({ ok: true });
}
