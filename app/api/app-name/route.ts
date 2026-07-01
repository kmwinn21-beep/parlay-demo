import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { getDb } from '@/lib/getDb';

const DEFAULT = process.env.NEXT_PUBLIC_APP_NAME ?? 'Conference Hub';

// Used on pre-auth pages (login/signup) as well as inside the authenticated
// app, so this can't require a session — unauthenticated requests fall back
// to the master DB's app_name (the generic marketing default), while a
// logged-in tenant user gets their own tenant DB's app_name.
export async function GET(request: NextRequest) {
  try {
    const user = await getSessionUser(request);
    const db = await getDb(user?.accountId);
    const row = await db.execute({ sql: "SELECT value FROM site_settings WHERE key = 'app_name'", args: [] });
    const name = row.rows[0] ? String(row.rows[0].value).trim() : '';
    return NextResponse.json({ name: name || DEFAULT });
  } catch {
    return NextResponse.json({ name: DEFAULT });
  }
}
