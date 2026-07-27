import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/getDb';
import { getSessionUser } from '@/lib/auth';
import { computeConferenceSnapshot } from '@/lib/compute-conference-snapshot';

export const dynamic = 'force-dynamic';

// Lightweight companion to /effectiveness for the By Stage board's four score
// pills (CES/AMS/CEF/SES) — those don't change once a conference has closed,
// so this reads the precomputed conference_snapshots row instead of re-running
// the full effectiveness computation (dozens of queries) on every board load.
// Same session-only gating as /effectiveness (no capability check) since this
// is a read of the same underlying numbers, just cached.
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const user = await getSessionUser(request);
  const db = await getDb(user?.accountId);

  const conferenceId = Number(params.id);
  if (!Number.isFinite(conferenceId)) {
    return NextResponse.json({ error: 'Invalid conference id' }, { status: 400 });
  }

  const select = () => db.execute({
    sql: `SELECT ces_score, marketing_audience_signal_score, cost_efficiency_score, sales_effectiveness_score
          FROM conference_snapshots WHERE conference_id = ?`,
    args: [conferenceId],
  });

  try {
    let res = await select();
    if (res.rows.length === 0) {
      // No snapshot yet (conference hasn't been explicitly closed, or was
      // closed before snapshotting existed) — compute and cache it once so
      // every subsequent board load for this conference is instant.
      await computeConferenceSnapshot(conferenceId, db);
      res = await select();
    }
    if (res.rows.length === 0) {
      return NextResponse.json({ error: 'No data for this conference' }, { status: 404 });
    }
    const row = res.rows[0];
    return NextResponse.json({
      ces_score: row.ces_score != null ? Number(row.ces_score) : null,
      ams_score: row.marketing_audience_signal_score != null ? Number(row.marketing_audience_signal_score) : null,
      cef_score: row.cost_efficiency_score != null ? Number(row.cost_efficiency_score) : null,
      ses_score: row.sales_effectiveness_score != null ? Number(row.sales_effectiveness_score) : null,
    });
  } catch (error) {
    console.error(`GET /api/conferences/${conferenceId}/effectiveness-scores error:`, error);
    return NextResponse.json({ error: 'Failed to load effectiveness scores' }, { status: 500 });
  }
}
