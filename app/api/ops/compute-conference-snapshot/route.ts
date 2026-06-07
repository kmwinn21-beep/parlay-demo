import { NextRequest, NextResponse } from 'next/server';
import { requireOpsAdmin } from '@/lib/opsAuth';
import { db, dbReady } from '@/lib/db';
import { createClient } from '@libsql/client';
import { computeConferenceSnapshot } from '@/lib/compute-conference-snapshot';

export async function POST(request: NextRequest) {
  const auth = await requireOpsAdmin(request);
  if (auth instanceof NextResponse) return auth;

  const body = await request.json().catch(() => ({})) as { accountId?: string; conferenceId?: number };
  const { accountId, conferenceId } = body;

  if (!accountId) {
    return NextResponse.json({ error: 'accountId is required' }, { status: 400 });
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

  let processed = 0;
  let failed = 0;
  const errors: { conferenceId: number; error: string }[] = [];

  if (conferenceId) {
    try {
      await computeConferenceSnapshot(conferenceId, client);
      processed = 1;
    } catch (err) {
      failed = 1;
      errors.push({ conferenceId, error: err instanceof Error ? err.message : String(err) });
    }
  } else {
    const confsRes = await client.execute({
      sql: `SELECT id FROM conferences WHERE series_id IS NOT NULL ORDER BY start_date ASC`,
      args: [],
    });
    for (const row of confsRes.rows) {
      const confId = Number(row.id);
      try {
        await computeConferenceSnapshot(confId, client);
        processed++;
      } catch (err) {
        failed++;
        errors.push({ conferenceId: confId, error: err instanceof Error ? err.message : String(err) });
      }
    }
  }

  return NextResponse.json({ processed, failed, errors });
}
