import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getDb } from '@/lib/getDb';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const accountId = authResult.accountId ?? '';
  const db = await getDb(accountId);

  const snapshots = await db.execute({
    sql: `SELECT
            s.id, s.conference_id, s.series_id, s.season_id, s.snapshot_date,
            s.contacts_ever_touched, s.contacts_touched_this_conf,
            s.contacts_net_new, s.contacts_returning,
            s.companies_ever_touched, s.companies_net_new, s.companies_returning,
            s.meetings_held, s.meetings_with_outcome,
            s.contacts_high_health, s.contacts_mid_health, s.contacts_low_health,
            s.contacts_droppable, s.saturation_score,
            s.new_contact_rate, s.droppable_rate,
            c.name as conference_name, c.start_date,
            cs.display_name as series_name
          FROM conference_saturation_snapshots s
          JOIN conferences c ON c.id = s.conference_id
          JOIN conference_series cs ON cs.id = s.series_id
          WHERE s.account_id = ?
          ORDER BY cs.display_name, c.start_date DESC`,
    args: [accountId],
  });

  type SeriesGroup = {
    series_id: string;
    series_name: string;
    conferences: object[];
  };

  const seriesMap = new Map<string, SeriesGroup>();
  for (const r of snapshots.rows) {
    const sid = String(r.series_id);
    if (!seriesMap.has(sid)) {
      seriesMap.set(sid, { series_id: sid, series_name: String(r.series_name), conferences: [] });
    }
    seriesMap.get(sid)!.conferences.push({
      conference_id: Number(r.conference_id),
      conference_name: String(r.conference_name),
      start_date: String(r.start_date ?? ''),
      season_id: r.season_id ? String(r.season_id) : null,
      snapshot_date: String(r.snapshot_date ?? ''),
      saturation_score: Number(r.saturation_score),
      contacts_ever_touched: Number(r.contacts_ever_touched),
      contacts_touched_this_conf: Number(r.contacts_touched_this_conf),
      contacts_net_new: Number(r.contacts_net_new),
      contacts_returning: Number(r.contacts_returning),
      contacts_droppable: Number(r.contacts_droppable),
      contacts_high_health: Number(r.contacts_high_health),
      contacts_mid_health: Number(r.contacts_mid_health),
      contacts_low_health: Number(r.contacts_low_health),
      companies_ever_touched: Number(r.companies_ever_touched),
      companies_net_new: Number(r.companies_net_new),
      companies_returning: Number(r.companies_returning),
      meetings_held: Number(r.meetings_held),
      meetings_with_outcome: Number(r.meetings_with_outcome),
      new_contact_rate: Number(r.new_contact_rate),
      droppable_rate: Number(r.droppable_rate),
    });
  }

  const seriesGroups = Array.from(seriesMap.values());
  const allScores = snapshots.rows.map(r => Number(r.saturation_score));
  const avg_saturation_score = allScores.length
    ? Math.round(allScores.reduce((s, v) => s + v, 0) / allScores.length)
    : 0;
  const high_saturation_count = allScores.filter(s => s >= 61).length;

  return NextResponse.json({ seriesGroups, avg_saturation_score, high_saturation_count });
}
