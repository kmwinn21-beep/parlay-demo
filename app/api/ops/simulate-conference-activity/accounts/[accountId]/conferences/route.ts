import { NextRequest, NextResponse } from 'next/server';
import { requireOpsAdmin } from '@/lib/opsAuth';
import { createClient } from '@libsql/client';
import { db, dbReady } from '@/lib/db';

export async function GET(
  request: NextRequest,
  { params }: { params: { accountId: string } }
) {
  const auth = await requireOpsAdmin(request);
  if (auth instanceof NextResponse) return auth;

  const { accountId } = params;

  await dbReady;
  const accountRow = await db.execute({
    sql: `SELECT turso_db_url, turso_auth_token, company_name FROM accounts WHERE id = ?`,
    args: [accountId],
  });
  if (!accountRow.rows[0]?.turso_db_url) {
    return NextResponse.json({ error: 'Account not found or no tenant DB' }, { status: 404 });
  }
  const companyName = String(accountRow.rows[0].company_name ?? '');
  const client = createClient({
    url: String(accountRow.rows[0].turso_db_url),
    authToken: String(accountRow.rows[0].turso_auth_token),
  });

  try {
    const confsRes = await client.execute({
      sql: `SELECT c.id, c.name, c.start_date, c.end_date, c.stage_override,
                   co.action_key AS strategy_key,
                   cb.return_on_cost,
                   cs.snapshot_taken_at
            FROM conferences c
            LEFT JOIN config_options co ON co.id = c.conference_strategy_type_id
            LEFT JOIN conference_budget cb ON cb.conference_id = c.id
            LEFT JOIN conference_snapshots cs ON cs.conference_id = c.id
            ORDER BY c.start_date DESC`,
      args: [],
    });

    const conferences = await Promise.all(confsRes.rows.map(async (row) => {
      const confId = Number(row.id);

      // Count attendees and ICP-matched attendees
      const [attRes, icpRes] = await Promise.all([
        client.execute({
          sql: `SELECT COUNT(*) as cnt FROM conference_attendees WHERE conference_id = ?`,
          args: [confId],
        }).catch(() => ({ rows: [{ cnt: 0 }] })),
        client.execute({
          sql: `SELECT COUNT(DISTINCT a.id) as cnt
                FROM conference_attendees ca
                JOIN attendees a ON a.id = ca.attendee_id
                JOIN companies co ON co.id = a.company_id
                WHERE ca.conference_id = ? AND co.icp = 'Yes'`,
          args: [confId],
        }).catch(() => ({ rows: [{ cnt: 0 }] })),
      ]);
      const attendeeCount = Number(attRes.rows[0]?.cnt ?? 0);
      const icpAttendeeCount = Number(icpRes.rows[0]?.cnt ?? 0);

      // Check for simulated activity
      const [mRes, fRes, tRes] = await Promise.all([
        client.execute({
          sql: `SELECT COUNT(*) as cnt FROM meetings WHERE conference_id = ? AND source = 'simulated'`,
          args: [confId],
        }).catch(() => ({ rows: [{ cnt: 0 }] })),
        client.execute({
          sql: `SELECT COUNT(*) as cnt FROM follow_ups WHERE conference_id = ? AND source = 'simulated'`,
          args: [confId],
        }).catch(() => ({ rows: [{ cnt: 0 }] })),
        client.execute({
          sql: `SELECT COUNT(*) as cnt FROM attendee_touchpoints WHERE conference_id = ? AND source = 'simulated'`,
          args: [confId],
        }).catch(() => ({ rows: [{ cnt: 0 }] })),
      ]);
      const hasSimulatedActivity =
        Number(mRes.rows[0]?.cnt ?? 0) > 0 ||
        Number(fRes.rows[0]?.cnt ?? 0) > 0 ||
        Number(tRes.rows[0]?.cnt ?? 0) > 0;

      return {
        id: confId,
        name: String(row.name),
        status: row.stage_override ? String(row.stage_override) : null,
        strategy: row.strategy_key ? String(row.strategy_key) : null,
        totalCost: null,
        attendeeCount,
        icpAttendeeCount,
        currentCes: null,
        hasSimulatedActivity,
        hasSnapshot: row.snapshot_taken_at != null,
        snapshotTakenAt: row.snapshot_taken_at ? String(row.snapshot_taken_at) : null,
      };
    }));

    return NextResponse.json({ conferences, companyName });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
