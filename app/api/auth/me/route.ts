import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { db } from '@/lib/db';

export async function GET(request: NextRequest) {
  const user = await getSessionUser(request);
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });
  }
  try {
    const r = await db.execute({
      sql: `SELECT u.config_id, u.display_name, co.value as rep_name, u.created_at
            FROM users u
            LEFT JOIN config_options co ON u.config_id = co.id
            WHERE u.id = ?`,
      args: [user.id],
    });
    const configId = r.rows[0]?.config_id != null ? Number(r.rows[0].config_id) : null;
    const displayName = r.rows[0]?.display_name != null ? String(r.rows[0].display_name) : null;
    const repName = r.rows[0]?.rep_name != null ? String(r.rows[0].rep_name) : null;
    const createdAt = r.rows[0]?.created_at != null ? String(r.rows[0].created_at) : null;
    return NextResponse.json({ user: { ...user, configId, displayName, repName, createdAt } });
  } catch {
    return NextResponse.json({ user });
  }
}
