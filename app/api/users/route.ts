import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getDb } from '@/lib/getDb';

export async function GET(request: NextRequest) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const db = await getDb(authResult?.accountId);

  const result = await db.execute({
    sql: `SELECT id, display_name, first_name, last_name FROM users WHERE active = 1 AND email_verified = 1 ORDER BY COALESCE(display_name, first_name, '')`,
    args: [],
  });

  return NextResponse.json(result.rows.map(r => ({
    id: Number(r.id),
    value: r.display_name
      ? String(r.display_name)
      : [r.first_name, r.last_name].filter(Boolean).join(' ') || `User ${r.id}`,
  })));
}
