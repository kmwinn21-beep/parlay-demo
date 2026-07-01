import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { getDb } from '@/lib/getDb';

const DEFAULT = 'Relationships Matter';

// Same pre-auth/authenticated dual-use pattern as /api/app-name.
export async function GET(request: NextRequest) {
  try {
    const user = await getSessionUser(request);
    const db = await getDb(user?.accountId);
    const row = await db.execute({ sql: "SELECT value FROM site_settings WHERE key = 'tagline'", args: [] });
    const tagline = row.rows[0] ? String(row.rows[0].value).trim() : '';
    return NextResponse.json({ tagline: tagline || DEFAULT });
  } catch {
    return NextResponse.json({ tagline: DEFAULT });
  }
}
