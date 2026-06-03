import { NextRequest, NextResponse } from 'next/server';
import { requireOpsAdmin } from '@/lib/opsAuth';
import { createClient } from '@libsql/client';
import { db, dbReady } from '@/lib/db';

export async function GET(
  request: NextRequest,
  { params }: { params: { accountId: string } }
) {
  const auth = await requireOpsAdmin(request);
  if (auth instanceof NextResponse) return auth;

  const { accountId } = params;

  await dbReady;
  const accountRow = await db.execute({
    sql: `SELECT turso_db_url, turso_auth_token FROM accounts WHERE id = ?`,
    args: [accountId],
  });
  if (!accountRow.rows[0]?.turso_db_url) {
    return NextResponse.json({ error: 'Account not found or no tenant DB' }, { status: 404 });
  }
  const client = createClient({
    url: String(accountRow.rows[0].turso_db_url),
    authToken: String(accountRow.rows[0].turso_auth_token),
  });

  try {
    const usersRes = await client.execute({
      sql: `SELECT id, first_name, last_name, email, role FROM users WHERE active = 1 ORDER BY first_name, last_name`,
      args: [],
    });

    const reps = usersRes.rows.map(r => ({
      id: Number(r.id),
      name: `${r.first_name ?? ''} ${r.last_name ?? ''}`.trim() || String(r.email),
      email: String(r.email),
      role: String(r.role),
    }));

    return NextResponse.json({ reps });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
