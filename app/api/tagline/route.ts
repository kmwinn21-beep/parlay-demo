import { NextResponse } from 'next/server';
import { db, dbReady } from '@/lib/db';

const DEFAULT = 'Relationships Matter';

export async function GET() {
  try {
    await dbReady;
    const row = await db.execute({ sql: "SELECT value FROM site_settings WHERE key = 'tagline'", args: [] });
    const tagline = row.rows[0] ? String(row.rows[0].value).trim() : '';
    return NextResponse.json({ tagline: tagline || DEFAULT });
  } catch {
    return NextResponse.json({ tagline: DEFAULT });
  }
}
