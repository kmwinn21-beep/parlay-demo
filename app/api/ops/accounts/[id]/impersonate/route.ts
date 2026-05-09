import { NextRequest, NextResponse } from 'next/server';
import { requireOpsAdmin } from '@/lib/opsAuth';
import { db, dbReady } from '@/lib/db';
import { randomUUID } from 'crypto';

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireOpsAdmin(request);
  if (auth instanceof NextResponse) return auth;

  await dbReady;

  const accountRes = await db.execute({
    sql: `SELECT id, company_name FROM accounts WHERE id = ?`,
    args: [params.id],
  });

  if (!accountRes.rows[0]) {
    return NextResponse.json({ error: 'Account not found.' }, { status: 404 });
  }

  const sessionId = randomUUID();

  await db.execute({
    sql: `INSERT INTO impersonation_sessions (id, admin_user_id, account_id) VALUES (?, ?, ?)`,
    args: [sessionId, auth.userId, params.id],
  });

  await db.execute({
    sql: `INSERT INTO admin_audit_log (admin_user_id, account_id, action, new_value) VALUES (?, ?, 'impersonation_start', ?)`,
    args: [auth.userId, params.id, String(accountRes.rows[0].company_name)],
  });

  const response = NextResponse.json({ success: true, sessionId });
  response.cookies.set({
    name: 'ops_impersonation',
    value: sessionId,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 3600, // 1 hour
  });
  return response;
}
