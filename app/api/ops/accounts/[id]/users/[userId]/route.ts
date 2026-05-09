import { NextRequest, NextResponse } from 'next/server';
import { requireOpsAdmin } from '@/lib/opsAuth';
import { db, dbReady } from '@/lib/db';
import { createTenantDb } from '@/lib/tenantDb';

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string; userId: string } }
) {
  const auth = await requireOpsAdmin(request);
  if (auth instanceof NextResponse) return auth;

  const body = await request.json() as { active: boolean };
  if (typeof body.active !== 'boolean') {
    return NextResponse.json({ error: 'active field required.' }, { status: 400 });
  }

  await dbReady;

  const accountRes = await db.execute({
    sql: `SELECT turso_db_url, turso_auth_token FROM accounts WHERE id = ?`,
    args: [params.id],
  });

  if (!accountRes.rows[0]) {
    return NextResponse.json({ error: 'Account not found.' }, { status: 404 });
  }

  const tursoDbUrl = String(accountRes.rows[0].turso_db_url ?? '');
  const tursoAuthToken = String(accountRes.rows[0].turso_auth_token ?? '');

  if (!tursoDbUrl || !tursoAuthToken) {
    return NextResponse.json({ error: 'Tenant DB not configured for this account.' }, { status: 422 });
  }

  const tenantDb = createTenantDb(tursoDbUrl, tursoAuthToken);
  await tenantDb.execute({
    sql: `UPDATE users SET active = ? WHERE id = ?`,
    args: [body.active ? 1 : 0, params.userId],
  });

  await db.execute({
    sql: `INSERT INTO admin_audit_log (admin_user_id, account_id, action, new_value) VALUES (?, ?, ?, ?)`,
    args: [auth.userId, params.id, body.active ? 'user_reactivate' : 'user_deactivate', params.userId],
  });

  return NextResponse.json({ success: true });
}
