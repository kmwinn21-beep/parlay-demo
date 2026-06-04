import { NextRequest, NextResponse } from 'next/server';
import { requireOpsAdmin } from '@/lib/opsAuth';
import { createClient } from '@libsql/client';
import { db, dbReady } from '@/lib/db';

export async function POST(request: NextRequest) {
  const auth = await requireOpsAdmin(request);
  if (auth instanceof NextResponse) return auth;

  let body: { accountId?: string; conferenceId?: number };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { accountId, conferenceId } = body;
  if (!accountId || typeof accountId !== 'string') {
    return NextResponse.json({ error: 'accountId is required' }, { status: 400 });
  }
  if (!conferenceId || typeof conferenceId !== 'number') {
    return NextResponse.json({ error: 'conferenceId must be a number' }, { status: 400 });
  }

  await dbReady;
  const accountRow = await db.execute({
    sql: `SELECT turso_db_url, turso_auth_token FROM accounts WHERE id = ?`,
    args: [accountId],
  });
  if (!accountRow.rows[0]?.turso_db_url) {
    return NextResponse.json({ error: 'Account not found or no tenant DB' }, { status: 404 });
  }
  const client = createClient({
    url: String(accountRow.rows[0].turso_db_url),
    authToken: String(accountRow.rows[0].turso_auth_token),
  });

  try {
    // follow_ups.meeting_id FK → meetings(id): delete follow_ups before meetings
    const fuRes = await client.execute({
      sql: `DELETE FROM follow_ups WHERE conference_id = ? AND source = 'simulated'`,
      args: [conferenceId],
    });
    const [meetingsRes, tpRes] = await Promise.all([
      client.execute({
        sql: `DELETE FROM meetings WHERE conference_id = ? AND source = 'simulated'`,
        args: [conferenceId],
      }),
      client.execute({
        sql: `DELETE FROM attendee_touchpoints WHERE conference_id = ? AND source = 'simulated'`,
        args: [conferenceId],
      }),
    ]);

    return NextResponse.json({
      deleted: {
        meetings: meetingsRes.rowsAffected,
        followUps: fuRes.rowsAffected,
        touchpoints: tpRes.rowsAffected,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
