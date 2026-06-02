import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getDb } from '@/lib/getDb';
import { randomUUID } from 'crypto';

export async function POST(
  request: NextRequest,
  { params }: { params: { seriesId: string } },
) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const accountId = authResult.accountId ?? '';
  const db = await getDb(accountId);

  const seriesRow = await db.execute({
    sql: `SELECT id FROM conference_series WHERE id = ? AND account_id = ?`,
    args: [params.seriesId, accountId],
  });
  if (seriesRow.rows.length === 0) {
    return NextResponse.json({ error: 'Series not found' }, { status: 404 });
  }

  const body = await request.json() as { season_name?: string };
  const season_name = body.season_name?.trim();
  if (!season_name) {
    return NextResponse.json({ error: 'season_name is required' }, { status: 400 });
  }

  const season_key = season_name.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
  const id = randomUUID();

  await db.execute({
    sql: `INSERT INTO conference_seasons (id, series_id, account_id, season_name, season_key) VALUES (?, ?, ?, ?, ?)`,
    args: [id, params.seriesId, accountId, season_name, season_key],
  });

  return NextResponse.json({ id, series_id: params.seriesId, season_name, season_key }, { status: 201 });
}
