import { NextRequest, NextResponse } from 'next/server';
import { requireOpsAdmin } from '@/lib/opsAuth';
import { db, dbReady } from '@/lib/db';
import { createClient } from '@libsql/client';
import { clerkClient } from '@clerk/nextjs/server';

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const auth = await requireOpsAdmin(request);
  if (auth instanceof NextResponse) return auth;

  if (!process.env.CLERK_SECRET_KEY) {
    return NextResponse.json({ error: 'Clerk is not configured on this deployment' }, { status: 400 });
  }

  await dbReady;

  const accountRow = await db.execute({
    sql: `SELECT id, admin_email, turso_db_url, turso_auth_token FROM accounts WHERE id = ?`,
    args: [params.id],
  });

  if (!accountRow.rows[0]) {
    return NextResponse.json({ error: 'Account not found' }, { status: 404 });
  }

  const { admin_email, turso_db_url, turso_auth_token } = accountRow.rows[0];

  if (!turso_db_url || !turso_auth_token) {
    return NextResponse.json({ error: 'Tenant DB not provisioned for this account' }, { status: 400 });
  }

  // Get the real user ID and role from the tenant DB
  const tenantClient = createClient({
    url: String(turso_db_url),
    authToken: String(turso_auth_token),
  });

  const userRow = await tenantClient.execute({
    sql: `SELECT id, email, role FROM users WHERE email = ? LIMIT 1`,
    args: [String(admin_email)],
  });

  if (!userRow.rows[0]) {
    return NextResponse.json({ error: 'Admin user not found in tenant DB' }, { status: 404 });
  }

  const parlayUserId = Number(userRow.rows[0].id);
  const email = String(userRow.rows[0].email);
  const role = String(userRow.rows[0].role ?? 'administrator');
  const accountId = String(params.id);

  // Check if this email already has a Clerk account
  const existingUsers = await clerkClient.users.getUserList({ emailAddress: [email] });
  const existing = existingUsers.data?.[0] ?? existingUsers[0 as never] as typeof existingUsers.data[0] | undefined;

  let clerkUserId: string;

  if (existing) {
    // Update metadata on the existing Clerk user
    await clerkClient.users.updateUserMetadata(existing.id, {
      publicMetadata: { account_id: accountId, parlay_user_id: parlayUserId, role },
    });
    clerkUserId = existing.id;
  } else {
    // No Clerk account yet — can't create with a password we don't have.
    // Return instructions for the user to sign up via /auth/signup.
    return NextResponse.json({
      error: 'No Clerk account found for this email. Have the user sign up at /auth/signup with their existing email — the webhook will sync automatically.',
      email,
    }, { status: 404 });
  }

  // Write clerk_id back to the tenant DB user row
  await tenantClient.execute({
    sql: `UPDATE users SET clerk_id = ? WHERE email = ?`,
    args: [clerkUserId, email],
  });

  return NextResponse.json({
    success: true,
    clerkUserId,
    parlayUserId,
    accountId,
    role,
    email,
  });
}
