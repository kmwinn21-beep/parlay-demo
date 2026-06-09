import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getDb } from '@/lib/getDb';
import { resolvePlanState } from '@/lib/trialState';
import { hasCapability } from '@/lib/capabilities';
import { getSeriesYoYData } from '@/lib/get-series-yoy-data';
import { computeConferenceSnapshot } from '@/lib/compute-conference-snapshot';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: { seriesId: string } }
) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const db = await getDb(authResult?.accountId);

  const { planCapabilities } = await resolvePlanState(db);
  if (!hasCapability(planCapabilities, 'program_intelligence.yoy_series_analysis')) {
    return NextResponse.json({ error: 'Upgrade required' }, { status: 403 });
  }

  try {
    // All closed conferences for this series
    const closedRes = await db.execute({
      sql: `SELECT c.id, cs.snapshot_taken_at
            FROM conferences c
            LEFT JOIN conference_snapshots cs ON cs.conference_id = c.id
            WHERE c.series_id = ? AND c.stage_override = 'closed'
            ORDER BY c.start_date ASC`,
      args: [params.seriesId],
    });

    const now = Date.now();
    const STALE_MS = 24 * 60 * 60 * 1000;

    const toRefresh: number[] = [];
    let skipped = 0;

    for (const row of closedRes.rows) {
      const confId = Number(row.id);
      const takenAt = row.snapshot_taken_at ? String(row.snapshot_taken_at) : null;
      const isStale = takenAt == null || (now - new Date(takenAt).getTime()) > STALE_MS;
      if (isStale) {
        toRefresh.push(confId);
      } else {
        skipped++;
      }
    }

    let refreshed = 0;
    let failed = 0;
    const errors: { conferenceId: number; error: string }[] = [];

    for (const confId of toRefresh) {
      try {
        await computeConferenceSnapshot(confId, db);
        refreshed++;
      } catch (err) {
        failed++;
        errors.push({ conferenceId: confId, error: err instanceof Error ? err.message : String(err) });
        console.error(`[yoy/refresh] snapshot failed for conference ${confId}:`, err);
      }
    }

    const data = await getSeriesYoYData(params.seriesId, db);

    return NextResponse.json({ refreshed, skipped, failed, errors, data });
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('Series not found')) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    console.error('GET /api/conferences/series/[seriesId]/yoy/refresh error:', error);
    return NextResponse.json({ error: 'Failed to refresh snapshots' }, { status: 500 });
  }
}
