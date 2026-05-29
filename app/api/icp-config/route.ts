import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getDb } from '@/lib/getDb';

function tryParseStringArray(val: string | null | undefined): string[] {
  if (!val) return [];
  try {
    const parsed = JSON.parse(val);
    if (Array.isArray(parsed)) return parsed.map(String).filter(Boolean);
  } catch { /* ignore */ }
  return [];
}

function tryParseObjectArray(val: string | null | undefined): string[] {
  if (!val) return [];
  try {
    const parsed = JSON.parse(val) as Array<{ title?: string }>;
    if (Array.isArray(parsed)) return parsed.map(p => p.title ?? '').filter(Boolean);
  } catch { /* ignore */ }
  return [];
}

export async function GET(request: NextRequest) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;

  const db = await getDb(authResult?.accountId);

  const rows = await db.execute({
    sql: `SELECT key, value FROM site_settings WHERE key IN ('icp_pain_points','icp_ai_pain_points','icp_trigger_events','icp_ai_trigger_events')`,
    args: [],
  }).catch(() => ({ rows: [] as Record<string, unknown>[] }));

  const settings: Record<string, string> = {};
  for (const r of rows.rows) settings[String(r.key)] = String(r.value ?? '');

  const painPoints = [
    ...tryParseStringArray(settings['icp_pain_points']),
    ...tryParseObjectArray(settings['icp_ai_pain_points']),
  ];

  const triggerEvents = [
    ...tryParseStringArray(settings['icp_trigger_events']),
    ...tryParseObjectArray(settings['icp_ai_trigger_events']),
  ];

  return NextResponse.json({ painPoints, triggerEvents });
}
