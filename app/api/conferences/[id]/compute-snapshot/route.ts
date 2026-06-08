import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getDb } from '@/lib/getDb';
import { computeConferenceSnapshot } from '@/lib/compute-conference-snapshot';
import { computeConferenceStage } from '@/lib/conference-stage';

export const dynamic = 'force-dynamic';

const SNAPSHOT_TRACKED_FIELDS = [
  'ces_score', 'cost_efficiency_score', 'total_cost', 'pipeline_influenced',
  'pipeline_net_new', 'pipeline_continued_engagement', 'pipeline_per_1k',
  'cost_per_company_engaged', 'cost_per_meeting_held', 'icp_companies_total',
  'icp_companies_engaged', 'icp_engagement_rate', 'buying_committee_coverage_rate',
  'decision_makers_engaged', 'meeting_hold_rate', 'followup_scheduling_rate',
  'followup_completion_rate', 'avg_health_score_engaged', 'returning_attendee_rate',
  'companies_3plus_instances', 'strategy_name', 'sponsorship_level',
  'booth_present', 'booth_width', 'booth_length', 'booth_number', 'booth_hall',
  'budget_total', 'actual_total', 'budget_variance', 'budget_line_items',
  'required_pipeline_multiple', 'required_pipeline_amount', 'expected_return_amount',
  'cost_per_internal_attendee',
] as const;

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;

  if (authResult.role !== 'administrator') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const conferenceId = Number(params.id);
  if (!Number.isFinite(conferenceId)) {
    return NextResponse.json({ error: 'Invalid conference id' }, { status: 400 });
  }

  const db = await getDb(authResult.accountId);

  const confRes = await db.execute({
    sql: `SELECT id, start_date, end_date, stage_override, is_historical, post_conference_days FROM conferences WHERE id = ?`,
    args: [conferenceId],
  });
  if (confRes.rows.length === 0) {
    return NextResponse.json({ error: 'Conference not found' }, { status: 404 });
  }
  const conf = confRes.rows[0];
  let effectiveStage: string;
  try {
    effectiveStage = computeConferenceStage({
      start_date: String(conf.start_date ?? ''),
      end_date: String(conf.end_date ?? ''),
      stage_override: conf.stage_override != null ? String(conf.stage_override) : null,
      is_historical: conf.is_historical != null ? Number(conf.is_historical) : null,
      post_conference_days: conf.post_conference_days != null ? Number(conf.post_conference_days) : null,
    });
  } catch {
    effectiveStage = 'closed'; // historical conferences are considered closed
  }
  if (effectiveStage !== 'closed') {
    return NextResponse.json(
      { error: 'Snapshots can only be computed for closed conferences' },
      { status: 400 }
    );
  }

  try {
    await computeConferenceSnapshot(conferenceId, db);

    const snapRes = await db.execute({
      sql: `SELECT * FROM conference_snapshots WHERE conference_id = ? ORDER BY snapshot_taken_at DESC LIMIT 1`,
      args: [conferenceId],
    });
    const snapshot = snapRes.rows[0] ?? {};

    const nonNullCount = SNAPSHOT_TRACKED_FIELDS.filter(f => snapshot[f] != null).length;
    const completenessPercent = Math.round((nonNullCount / SNAPSHOT_TRACKED_FIELDS.length) * 100);

    return NextResponse.json({
      success: true,
      snapshot,
      completenessPercent,
      snapshotTakenAt: snapshot.snapshot_taken_at ? String(snapshot.snapshot_taken_at) : new Date().toISOString(),
    });
  } catch (err) {
    console.error('compute-snapshot error:', err);
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
