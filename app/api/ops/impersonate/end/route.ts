import { NextRequest, NextResponse } from 'next/server';
import { db, dbReady } from '@/lib/db';
import { getSessionUser } from '@/lib/auth';

export async function POST(request: NextRequest) {
  const user = await getSessionUser(request);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const impersonationId = request.cookies.get('ops_impersonation')?.value;
  if (!impersonationId) {
    return NextResponse.json({ success: true, accountId: null });
  }

  await dbReady;

  const sessionRes = await db.execute({
    sql: `SELECT account_id FROM impersonation_sessions WHERE id = ? AND ended_at IS NULL`,
    args: [impersonationId],
  });

  const accountId = sessionRes.rows[0] ? String(sessionRes.rows[0].account_id) : null;

  await db.execute({
    sql: `UPDATE impersonation_sessions SET ended_at = datetime('now') WHERE id = ?`,
    args: [impersonationId],
  });

  if (accountId) {
    await db.execute({
      sql: `INSERT INTO admin_audit_log (admin_user_id, account_id, action) VALUES (?, ?, 'impersonation_end')`,
      args: [user.id, accountId],
    }).catch(() => {});
  }

  const response = NextResponse.json({ success: true, accountId });
  response.cookies.set({
    name: 'ops_impersonation',
    value: '',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });
  return response;
}
