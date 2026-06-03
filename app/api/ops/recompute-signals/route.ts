import { NextRequest, NextResponse } from 'next/server';
import { requireOpsAdmin } from '@/lib/opsAuth';
import { db, dbReady } from '@/lib/db';
import { createClient } from '@libsql/client';
import { computeAttendeeProductSignals } from '@/lib/computeAttendeeProductSignals';

export async function POST(request: NextRequest) {
  const auth = await requireOpsAdmin(request);
  if (auth instanceof NextResponse) return auth;

  const { accountId } = await request.json();
  if (!accountId) {
    return NextResponse.json({ error: 'accountId is required' }, { status: 400 });
  }

  await dbReady;

  const row = await db.execute({
    sql: `SELECT turso_db_url, turso_auth_token, company_name FROM accounts WHERE id = ?`,
    args: [accountId],
  });

  if (!row.rows[0]) {
    return NextResponse.json({ error: 'Account not found' }, { status: 404 });
  }

  const { turso_db_url, turso_auth_token, company_name } = row.rows[0];
  if (!turso_db_url) {
    return NextResponse.json({ error: 'Account has no tenant DB configured' }, { status: 400 });
  }

  const client = createClient({
    url: String(turso_db_url),
    authToken: String(turso_auth_token),
  });

  const confs = await client.execute(`SELECT id FROM conferences ORDER BY start_date ASC`);

  let totalUpserted = 0;
  const results: { conferenceId: number; upserted: number }[] = [];

  for (const confRow of confs.rows) {
    const conferenceId = Number(confRow.id);
    const { upserted } = await computeAttendeeProductSignals(client, conferenceId);
    totalUpserted += upserted;
    results.push({ conferenceId, upserted });
  }

  return NextResponse.json({
    ok: true,
    account: { id: accountId, companyName: String(company_name) },
    conferencesProcessed: confs.rows.length,
    totalUpserted,
    results,
  });
}
