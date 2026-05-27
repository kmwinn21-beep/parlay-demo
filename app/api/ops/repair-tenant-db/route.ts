import { NextRequest, NextResponse } from 'next/server';
import { requireOpsAdmin } from '@/lib/opsAuth';
import { db, dbReady } from '@/lib/db';
import { migrations } from '@/lib/db-migrations';
import { createClient } from '@libsql/client';

export async function POST(request: NextRequest) {
  const auth = await requireOpsAdmin(request);
  if (auth instanceof NextResponse) return auth;

  const { accountId } = await request.json();
  if (!accountId) {
    return NextResponse.json({ error: 'accountId is required' }, { status: 400 });
  }

  await dbReady;

  const row = await db.execute({
    sql: `SELECT id, company_name, turso_db_url, turso_auth_token FROM accounts WHERE id = ?`,
    args: [accountId],
  });

  if (!row.rows[0]) {
    return NextResponse.json({ error: 'Account not found' }, { status: 404 });
  }

  const { turso_db_url, turso_auth_token, company_name } = row.rows[0];

  if (!turso_db_url) {
    return NextResponse.json({ error: 'Account has no tenant DB configured' }, { status: 400 });
  }

  const client = createClient({
    url: String(turso_db_url),
    authToken: String(turso_auth_token),
  });

  let applied = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const sql of migrations) {
    try {
      await client.execute({ sql, args: [] });
      applied++;
    } catch (err: unknown) {
      // Expected: "already exists", "duplicate column" — these are idempotent skips
      const msg = err instanceof Error ? err.message : String(err);
      if (
        msg.includes('already exists') ||
        msg.includes('duplicate column') ||
        msg.includes('no such column') // some ALTER TABLE checks fail gracefully
      ) {
        skipped++;
      } else {
        errors.push(`${msg.slice(0, 120)} [sql: ${sql.slice(0, 60)}...]`);
      }
    }
  }

  return NextResponse.json({
    ok: true,
    account: { id: accountId, companyName: String(company_name) },
    migrations: { total: migrations.length, applied, skipped, errors: errors.length },
    errors: errors.slice(0, 20),
  });
}
