import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getDb } from '@/lib/getDb';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const accountId = authResult.accountId ?? '';
  const db = await getDb(accountId);

  const snapshots = await db.execute(`
    SELECT
      s.conference_id,
      c.name as conference_name,
      c.start_date,
      c.series_id,
      cs.display_name as series_name,
      s.saturation_score,
      s.contacts_total,
      s.contacts_net_new,
      s.contacts_returning,
      s.meetings_held,
      s.substitutable_count,
      s.health_green,
      s.health_amber,
      s.health_red,
      s.companies_total,
      s.companies_returning,
      s.computed_at
    FROM conference_saturation_snapshots s
    JOIN conferences c ON c.id = s.conference_id
    JOIN conference_series cs ON cs.id = s.series_id
    ORDER BY cs.display_name, c.start_date DESC
  `);

  type SeriesEntry = {
    series_id: string;
    series_name: string;
    conferences: object[];
  };

  const seriesMap = new Map<string, SeriesEntry>();
  for (const r of snapshots.rows) {
    const sid = String(r.series_id);
    if (!seriesMap.has(sid)) {
      seriesMap.set(sid, {
        series_id: sid,
        series_name: String(r.series_name),
        conferences: [],
      });
    }
    seriesMap.get(sid)!.conferences.push({
      conference_id: Number(r.conference_id),
      conference_name: String(r.conference_name),
      start_date: String(r.start_date ?? ''),
      saturation_score: Number(r.saturation_score),
      contacts_total: Number(r.contacts_total),
      contacts_net_new: Number(r.contacts_net_new),
      contacts_returning: Number(r.contacts_returning),
      meetings_held: Number(r.meetings_held),
      substitutable_count: Number(r.substitutable_count),
      health_green: Number(r.health_green),
      health_amber: Number(r.health_amber),
      health_red: Number(r.health_red),
      companies_total: Number(r.companies_total),
      companies_returning: Number(r.companies_returning),
      computed_at: String(r.computed_at ?? ''),
    });
  }

  const series = Array.from(seriesMap.values());
  const allScores = snapshots.rows.map(r => Number(r.saturation_score));
  const avgSaturationScore = allScores.length
    ? Math.round(allScores.reduce((s, v) => s + v, 0) / allScores.length)
    : 0;
  const highSaturationAlerts = allScores.filter(s => s >= 65).length;

  return NextResponse.json({ series, avgSaturationScore, highSaturationAlerts });
}
