import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { db } from '@/lib/db';
import { getDb } from '@/lib/getDb';

export async function GET(request: NextRequest) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const user = authResult;
  const db = await getDb(user?.accountId);

  const result = await db.execute({
    sql: `SELECT id, email, display_name FROM users WHERE id != ? AND email_verified = 1 ORDER BY COALESCE(display_name, email)`,
    args: [user.id],
  });

  return NextResponse.json(result.rows.map(r => ({
    id: Number(r.id),
    email: String(r.email),
    displayName: r.display_name ? String(r.display_name) : null,
  })));
}
