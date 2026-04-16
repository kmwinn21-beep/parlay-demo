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
      sql: `SELECT u.config_id, co.value as display_name
            FROM users u
            LEFT JOIN config_options co ON u.config_id = co.id
            WHERE u.id = ?`,
      args: [user.id],
    });
    const configId = r.rows[0]?.config_id != null ? Number(r.rows[0].config_id) : null;
    const displayName = r.rows[0]?.display_name != null ? String(r.rows[0].display_name) : null;
    return NextResponse.json({ user: { ...user, configId, displayName } });
  } catch {
    return NextResponse.json({ user });
  }
}
