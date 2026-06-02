import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getDb } from '@/lib/getDb';
import { randomUUID } from 'crypto';

export async function GET(request: NextRequest) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const accountId = authResult.accountId ?? '';
  const db = await getDb(accountId);

  const seriesRes = await db.execute({
    sql: `SELECT id, display_name, series_key, created_at FROM conference_series WHERE account_id = ? ORDER BY display_name`,
    args: [accountId],
  });

  const seasonsRes = await db.execute({
    sql: `SELECT id, series_id, season_name, season_key FROM conference_seasons WHERE account_id = ? ORDER BY season_name`,
    args: [accountId],
  });

  const seasonsBySeries = new Map<string, { id: string; season_name: string; season_key: string }[]>();
  for (const row of seasonsRes.rows) {
    const sid = String(row.series_id);
    if (!seasonsBySeries.has(sid)) seasonsBySeries.set(sid, []);
    seasonsBySeries.get(sid)!.push({
      id: String(row.id),
      season_name: String(row.season_name),
      season_key: String(row.season_key),
    });
  }

  const result = seriesRes.rows.map((row) => ({
    id: String(row.id),
    display_name: String(row.display_name),
    series_key: String(row.series_key),
    seasons: seasonsBySeries.get(String(row.id)) ?? [],
  }));

  return NextResponse.json(result);
}

export async function POST(request: NextRequest) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const accountId = authResult.accountId ?? '';
  const db = await getDb(accountId);

  const body = await request.json() as { display_name?: string };
  const display_name = body.display_name?.trim();
  if (!display_name) {
    return NextResponse.json({ error: 'display_name is required' }, { status: 400 });
  }

  const series_key = display_name.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
  const id = randomUUID();

  await db.execute({
    sql: `INSERT INTO conference_series (id, account_id, display_name, series_key) VALUES (?, ?, ?, ?)`,
    args: [id, accountId, display_name, series_key],
  });

  return NextResponse.json({ id, display_name, series_key, seasons: [] }, { status: 201 });
}
