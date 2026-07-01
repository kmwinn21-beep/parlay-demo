import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { getDb } from '@/lib/getDb';

// Never cache — logo config must always reflect the latest DB values
export const dynamic = 'force-dynamic';

// Same pre-auth/authenticated dual-use pattern as /api/app-name.
export async function GET(request: NextRequest) {
  try {
    const user = await getSessionUser(request);
    const db = await getDb(user?.accountId);
    const rows = await db.execute({
      sql: "SELECT key, value FROM site_settings WHERE key IN ('logo_white_url', 'logo_dark_url', 'favicon_url', 'logo_sidebar_url')",
      args: [],
    });
    const data: Record<string, string> = {};
    for (const row of rows.rows) data[String(row.key)] = String(row.value);
    return NextResponse.json({
      logoWhiteUrl: data['logo_white_url'] || '',
      logoDarkUrl: data['logo_dark_url'] || '',
      faviconUrl: data['favicon_url'] || '',
      logoSidebarUrl: data['logo_sidebar_url'] || '',
    }, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch {
    return NextResponse.json(
      { logoWhiteUrl: '', logoDarkUrl: '', faviconUrl: '', logoSidebarUrl: '' },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
