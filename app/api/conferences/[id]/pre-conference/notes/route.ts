import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { db, dbReady } from '@/lib/db';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const user = authResult;

  const { id } = await params;
  const confId = parseInt(id, 10);
  if (isNaN(confId)) return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });

  await dbReady;

  const body = await request.json();
  const { entity_type, entity_id, content, conference_name, tagged_users, attendee_name, company_name } = body;

  if (!entity_type || !entity_id || !content?.trim()) {
    return NextResponse.json({ error: 'entity_type, entity_id, and content are required' }, { status: 400 });
  }

  const rep = typeof user === 'object' && user !== null && 'email' in user
    ? (user as { email: string }).email
    : String(user);

  const result = await db.execute({
    sql: `INSERT INTO entity_notes (entity_type, entity_id, content, rep, conference_name, tagged_users, attendee_name, company_name)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING *`,
    args: [
      entity_type,
      entity_id,
      content.trim(),
      rep,
      conference_name ?? null,
      tagged_users ?? null,
      attendee_name ?? null,
      company_name ?? null,
    ],
  });

  return NextResponse.json(result.rows[0], { status: 201 });
}
