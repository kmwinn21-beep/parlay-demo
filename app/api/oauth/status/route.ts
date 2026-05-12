import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getDb } from '@/lib/getDb';

export async function GET(request: NextRequest) {
  const user = await requireAuth(request);
  if (user instanceof NextResponse) return user;

  const db = await getDb(user.accountId);
  const rows = await db.execute({
    sql: 'SELECT provider, provider_email FROM oauth_connections WHERE user_id = ?',
    args: [user.id],
  });

  const connected: Record<string, { email: string | null }> = {};
  for (const row of rows.rows) {
    connected[String(row.provider)] = { email: row.provider_email ? String(row.provider_email) : null };
  }

  return NextResponse.json({ connected });
}
