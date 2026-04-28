import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { db, dbReady } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const user = authResult;

  try {
    await dbReady;

    const result = await db.execute({
      sql: `SELECT id, email, display_name
            FROM users
            WHERE id != ? AND email_verified = 1
            ORDER BY COALESCE(display_name, email) ASC`,
      args: [user.id],
    });

    return NextResponse.json(
      result.rows.map((r) => ({
        id: Number(r.id),
        email: String(r.email),
        display_name: r.display_name != null ? String(r.display_name) : null,
      }))
    );
  } catch (error) {
    console.error('GET /api/chat/users error:', error);
    return NextResponse.json({ error: 'Failed to fetch users' }, { status: 500 });
  }
}
