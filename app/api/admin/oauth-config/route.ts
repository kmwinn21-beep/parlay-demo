import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { db, dbReady } from '@/lib/db';

const KEYS = [
  'oauth_google_client_id',
  'oauth_google_client_secret',
  'oauth_microsoft_client_id',
  'oauth_microsoft_client_secret',
  'oauth_microsoft_tenant_id',
] as const;

const SECRET_KEYS = new Set(['oauth_google_client_secret', 'oauth_microsoft_client_secret']);

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (auth instanceof NextResponse) return auth;

  await dbReady;
  const placeholders = KEYS.map(() => '?').join(',');
  const result = await db.execute({
    sql: `SELECT key, value FROM site_settings WHERE key IN (${placeholders})`,
    args: [...KEYS],
  });

  const stored: Record<string, string> = {};
  for (const row of result.rows) stored[String(row.key)] = String(row.value);

  // Return masked secrets — never expose the raw value
  const config: Record<string, string | boolean> = {};
  for (const key of KEYS) {
    const val = stored[key] ?? '';
    if (SECRET_KEYS.has(key)) {
      config[key] = val.length > 0; // boolean: true = "is set"
    } else {
      config[key] = val;
    }
  }

  return NextResponse.json(config);
}

export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (auth instanceof NextResponse) return auth;

  const body = await request.json() as Record<string, string>;

  await dbReady;
  for (const key of KEYS) {
    if (key in body) {
      const value = String(body[key] ?? '').trim();
      if (value === '') {
        // Empty string means "clear this key"
        await db.execute({ sql: 'DELETE FROM site_settings WHERE key = ?', args: [key] });
      } else {
        await db.execute({
          sql: 'INSERT OR REPLACE INTO site_settings (key, value) VALUES (?, ?)',
          args: [key, value],
        });
      }
    }
  }

  return NextResponse.json({ ok: true });
}
