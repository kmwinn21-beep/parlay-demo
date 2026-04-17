import { NextResponse } from 'next/server';
import { db, dbReady } from '@/lib/db';

const DEFAULT = process.env.NEXT_PUBLIC_APP_NAME ?? 'Conference Hub';

export async function GET() {
  try {
    await dbReady;
    const row = await db.execute({ sql: "SELECT value FROM site_settings WHERE key = 'app_name'", args: [] });
    const name = row.rows[0] ? String(row.rows[0].value).trim() : '';
    return NextResponse.json({ name: name || DEFAULT });
  } catch {
    return NextResponse.json({ name: DEFAULT });
  }
}
