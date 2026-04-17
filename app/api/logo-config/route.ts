import { NextResponse } from 'next/server';
import { db, dbReady } from '@/lib/db';

export async function GET() {
  try {
    await dbReady;
    const rows = await db.execute({
      sql: "SELECT key, value FROM site_settings WHERE key IN ('logo_white_url', 'logo_dark_url', 'favicon_url')",
      args: [],
    });
    const data: Record<string, string> = {};
    for (const row of rows.rows) data[String(row.key)] = String(row.value);
    return NextResponse.json({
      logoWhiteUrl: data['logo_white_url'] || '',
      logoDarkUrl: data['logo_dark_url'] || '',
      faviconUrl: data['favicon_url'] || '',
    });
  } catch {
    return NextResponse.json({ logoWhiteUrl: '', logoDarkUrl: '', faviconUrl: '' });
  }
}
