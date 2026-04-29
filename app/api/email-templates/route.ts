import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, requireAdmin } from '@/lib/auth';
import { db, dbReady } from '@/lib/db';

export async function GET(request: NextRequest) {
  const user = await requireAuth(request);
  if (user instanceof NextResponse) return user;

  await dbReady;
  const rows = await db.execute({
    sql: 'SELECT id, name, subject, body, created_at FROM email_templates ORDER BY name ASC',
    args: [],
  });

  return NextResponse.json(rows.rows);
}

export async function POST(request: NextRequest) {
  const user = await requireAdmin(request);
  if (user instanceof NextResponse) return user;

  const body = await request.json();
  const { name, subject, body: templateBody } = body as { name?: string; subject?: string; body?: string };

  if (!name?.trim() || !subject?.trim() || !templateBody?.trim()) {
    return NextResponse.json({ error: 'name, subject, and body are required.' }, { status: 400 });
  }

  await dbReady;
  const result = await db.execute({
    sql: 'INSERT INTO email_templates (name, subject, body, created_by) VALUES (?, ?, ?, ?) RETURNING id',
    args: [name.trim(), subject.trim(), templateBody.trim(), user.id],
  });

  return NextResponse.json({ id: result.rows[0].id }, { status: 201 });
}
