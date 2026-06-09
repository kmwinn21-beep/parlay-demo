import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getSessionUser, verifyToken, COOKIE_NAME } from '@/lib/auth';
import { db, dbReady } from '@/lib/db';
import { redirect } from 'next/navigation';

export interface OpsAdmin {
  userId: number;
  email: string;
}

// Emails listed in OPS_ADMIN_EMAILS (comma-separated) are always granted ops access
// regardless of the is_admin DB column — useful for bootstrapping without direct DB access.
function isEnvOpsAdmin(email: string): boolean {
  const envList = process.env.OPS_ADMIN_EMAILS ?? '';
  if (!envList.trim()) return false;
  return envList.split(',').map(e => e.trim().toLowerCase()).includes(email.toLowerCase());
}

// For API route handlers (has access to NextRequest)
export async function requireOpsAdmin(request: NextRequest): Promise<OpsAdmin | NextResponse> {
  const user = await getSessionUser(request);
  if (!user) {
    return NextResponse.redirect(new URL('/ops/login', request.url));
  }
  if (isEnvOpsAdmin(user.email)) {
    return { userId: user.id, email: user.email };
  }
  await dbReady;
  const row = await db.execute({
    sql: `SELECT is_admin FROM users WHERE id = ? AND active = 1`,
    args: [user.id],
  });
  if (!row.rows[0] || Number(row.rows[0].is_admin) !== 1) {
    return NextResponse.redirect(new URL('/ops/login', request.url));
  }
  return { userId: user.id, email: user.email };
}

// For server components / layouts (reads cookies() directly)
export async function getOpsAdmin(): Promise<OpsAdmin | null> {
  try {
    const cookieStore = cookies();
    const token = cookieStore.get(COOKIE_NAME)?.value;
    if (!token) return null;
    const user = await verifyToken(token);
    if (!user) return null;
    if (isEnvOpsAdmin(user.email)) {
      return { userId: user.id, email: user.email };
    }
    await dbReady;
    const row = await db.execute({
      sql: `SELECT is_admin FROM users WHERE id = ? AND active = 1`,
      args: [user.id],
    });
    if (!row.rows[0] || Number(row.rows[0].is_admin) !== 1) return null;
    return { userId: user.id, email: user.email };
  } catch {
    return null;
  }
}

// Use in server components: redirects to /ops/login if not ops admin
export async function requireOpsAdminPage(): Promise<OpsAdmin> {
  const admin = await getOpsAdmin();
  if (!admin) redirect('/ops/login');
  return admin;
}

