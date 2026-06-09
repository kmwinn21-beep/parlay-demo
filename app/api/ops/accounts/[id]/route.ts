import { NextRequest, NextResponse } from 'next/server';
import { requireOpsAdmin } from '@/lib/opsAuth';
import { db, dbReady } from '@/lib/db';
import { clerkClient } from '@clerk/nextjs/server';

async function deleteTursoDatabase(dbName: string): Promise<void> {
  const org = process.env.TURSO_ORG;
  const token = process.env.TURSO_PLATFORM_TOKEN;
  if (!org || !token) return; // skip if not configured
  await fetch(`https://api.turso.tech/v1/organizations/${org}/databases/${dbName}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
}

function dbNameFromUrl(url: string): string | null {
  // libsql://parlay-acme.aws-us-west-2.turso.io → parlay-acme
  const match = url.match(/libsql:\/\/([^.]+)\./);
  return match?.[1] ?? null;
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const auth = await requireOpsAdmin(request);
  if (auth instanceof NextResponse) return auth;

  await dbReady;

  const accountRow = await db.execute({
    sql: `SELECT id, admin_email, turso_db_url, company_name FROM accounts WHERE id = ?`,
    args: [params.id],
  });

  if (!accountRow.rows[0]) {
    return NextResponse.json({ error: 'Account not found' }, { status: 404 });
  }

  const { admin_email, turso_db_url, company_name } = accountRow.rows[0];
  const results: Record<string, string> = {};

  // 1. Delete Turso tenant DB
  const dbUrl = turso_db_url ? String(turso_db_url) : null;
  if (dbUrl) {
    const dbName = dbNameFromUrl(dbUrl);
    if (dbName) {
      try {
        await deleteTursoDatabase(dbName);
        results.turso_db = `deleted (${dbName})`;
      } catch (e) {
        results.turso_db = `failed: ${String(e)}`;
      }
    }
  } else {
    results.turso_db = 'skipped (no tenant DB)';
  }

  // 2. Delete Clerk user if Clerk is configured
  if (process.env.CLERK_SECRET_KEY && admin_email) {
    try {
      const found = await clerkClient.users.getUserList({ emailAddress: [String(admin_email)] });
      const clerkUser = found.data?.[0] ?? found[0 as never] as typeof found.data[0] | undefined;
      if (clerkUser) {
        await clerkClient.users.deleteUser(clerkUser.id);
        results.clerk_user = `deleted (${clerkUser.id})`;
      } else {
        results.clerk_user = 'not found in Clerk';
      }
    } catch (e) {
      results.clerk_user = `failed: ${String(e)}`;
    }
  } else {
    results.clerk_user = 'skipped (Clerk not configured)';
  }

  // 3. Delete from master DB (cascading cleanup)
  await Promise.all([
    db.execute({ sql: `DELETE FROM account_events       WHERE account_id = ?`, args: [params.id] }).catch(() => {}),
    db.execute({ sql: `DELETE FROM account_sessions     WHERE account_id = ?`, args: [params.id] }).catch(() => {}),
    db.execute({ sql: `DELETE FROM account_feature_usage WHERE account_id = ?`, args: [params.id] }).catch(() => {}),
    db.execute({ sql: `DELETE FROM impersonation_sessions WHERE account_id = ?`, args: [params.id] }).catch(() => {}),
  ]);

  await db.execute({ sql: `DELETE FROM accounts WHERE id = ?`, args: [params.id] });
  results.master_db = 'deleted';

  return NextResponse.json({
    deleted: true,
    accountId: params.id,
    companyName: String(company_name ?? ''),
    email: String(admin_email ?? ''),
    results,
  });
}
