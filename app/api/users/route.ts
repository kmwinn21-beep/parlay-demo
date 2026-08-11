import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getDb } from '@/lib/getDb';

export async function GET(request: NextRequest) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const db = await getDb(authResult?.accountId);

  // The full Types-tab rep roster (config_options 'user') — the same list
  // used everywhere else reps are assigned (rep pills, target/territory
  // assignment, etc). IDs here are config_options ids, not users.id; most
  // reps don't have a real login account, so outreach assignment (the main
  // consumer of this endpoint) no longer requires one — see
  // outreach_assignments in lib/db-migrations.ts.
  const result = await db.execute({
    sql: `SELECT id, value FROM config_options WHERE category = 'user' ORDER BY sort_order, value`,
    args: [],
  });

  return NextResponse.json(result.rows.map(r => ({
    id: Number(r.id),
    value: String(r.value),
  })));
}
