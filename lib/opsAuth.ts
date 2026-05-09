import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getSessionUser, verifyToken, COOKIE_NAME } from '@/lib/auth';
import { db, dbReady } from '@/lib/db';
import { redirect } from 'next/navigation';

export interface OpsAdmin {
  userId: number;
  email: string;
}

// For API route handlers (has access to NextRequest)
export async function requireOpsAdmin(request: NextRequest): Promise<OpsAdmin | NextResponse> {
  const user = await getSessionUser(request);
  if (!user) {
    return NextResponse.redirect(new URL('/auth/login', request.url));
  }
  await dbReady;
  const row = await db.execute({
    sql: `SELECT is_admin FROM users WHERE id = ? AND active = 1`,
    args: [user.id],
  });
  if (!row.rows[0] || Number(row.rows[0].is_admin) !== 1) {
    return NextResponse.redirect(new URL('/auth/login', request.url));
  }
  return { userId: user.id, email: user.email };
}

// For server components / layouts (reads cookies() directly)
export async function getOpsAdmin(): Promise<OpsAdmin | null> {
  try {
    await dbReady;
    const cookieStore = cookies();
    const token = cookieStore.get(COOKIE_NAME)?.value;
    if (!token) return null;
    const user = await verifyToken(token);
    if (!user) return null;
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

// Use in server components: redirects to /auth/login if not ops admin
export async function requireOpsAdminPage(): Promise<OpsAdmin> {
  const admin = await getOpsAdmin();
  if (!admin) redirect('/auth/login');
  return admin;
}
