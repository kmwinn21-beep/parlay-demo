import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getDb } from '@/lib/getDb';

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;
  if (auth.role !== 'administrator') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const db = await getDb(auth.accountId);

  try {
  const confsRes = await db.execute({
    sql: `SELECT c.id, c.name, c.start_date, c.end_date, c.stage_override,
                 co.action_key AS strategy_key,
                 cs.snapshot_taken_at
          FROM conferences c
          LEFT JOIN config_options co ON co.id = c.conference_strategy_type_id
          LEFT JOIN conference_snapshots cs ON cs.conference_id = c.id
          ORDER BY c.start_date DESC`,
    args: [],
  });

  const conferences = await Promise.all(confsRes.rows.map(async (row) => {
    const confId = Number(row.id);
    const [attRes, icpRes, mRes, fRes, tRes] = await Promise.all([
      db.execute({ sql: `SELECT COUNT(*) as cnt FROM conference_attendees WHERE conference_id = ?`, args: [confId] }).catch(() => ({ rows: [{ cnt: 0 }] })),
      db.execute({ sql: `SELECT COUNT(DISTINCT a.id) as cnt FROM conference_attendees ca JOIN attendees a ON a.id = ca.attendee_id JOIN companies co ON co.id = a.company_id WHERE ca.conference_id = ? AND co.icp = 'Yes'`, args: [confId] }).catch(() => ({ rows: [{ cnt: 0 }] })),
      db.execute({ sql: `SELECT COUNT(*) as cnt FROM meetings WHERE conference_id = ? AND source = 'simulated'`, args: [confId] }).catch(() => ({ rows: [{ cnt: 0 }] })),
      db.execute({ sql: `SELECT COUNT(*) as cnt FROM follow_ups WHERE conference_id = ? AND source = 'simulated'`, args: [confId] }).catch(() => ({ rows: [{ cnt: 0 }] })),
      db.execute({ sql: `SELECT COUNT(*) as cnt FROM attendee_touchpoints WHERE conference_id = ? AND source = 'simulated'`, args: [confId] }).catch(() => ({ rows: [{ cnt: 0 }] })),
    ]);
    return {
      id: confId,
      name: String(row.name),
      status: row.stage_override ? String(row.stage_override) : null,
      strategy: row.strategy_key ? String(row.strategy_key) : null,
      totalCost: null,
      attendeeCount: Number(attRes.rows[0]?.cnt ?? 0),
      icpAttendeeCount: Number(icpRes.rows[0]?.cnt ?? 0),
      currentCes: null,
      hasSimulatedActivity: Number(mRes.rows[0]?.cnt ?? 0) > 0 || Number(fRes.rows[0]?.cnt ?? 0) > 0 || Number(tRes.rows[0]?.cnt ?? 0) > 0,
      hasSnapshot: row.snapshot_taken_at != null,
      snapshotTakenAt: row.snapshot_taken_at ? String(row.snapshot_taken_at) : null,
    };
  }));

  return NextResponse.json({ conferences });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
