import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getDb } from '@/lib/getDb';

export async function GET(request: NextRequest) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const db = await getDb(authResult?.accountId);

  const url = new URL(request.url);
  const year = parseInt(url.searchParams.get('year') ?? String(new Date().getFullYear() - 1), 10);
  const startDate = `${year}-01-01`;
  const endDate = `${year}-12-31`;

  // Conferences in this year
  const confsRes = await db.execute({
    sql: `SELECT c.id, c.name, c.internal_attendees FROM conferences c WHERE c.start_date >= ? AND c.start_date <= ?`,
    args: [startDate, endDate],
  });
  const confs = confsRes.rows;
  const confIds = confs.map(r => Number(r.id));
  const conferencesAttended = confIds.length;

  // Spend from snapshots
  let totalActualSpend = 0;
  let totalBudget = 0;
  let cesSum = 0;
  let cesCount = 0;

  if (confIds.length > 0) {
    const ph = confIds.map(() => '?').join(',');
    const snapRes = await db.execute({
      sql: `SELECT actual_total, budget_total, ces_score FROM conference_snapshots WHERE conference_id IN (${ph})`,
      args: confIds,
    });
    for (const r of snapRes.rows) {
      if (r.actual_total != null) totalActualSpend += Number(r.actual_total);
      if (r.budget_total != null) totalBudget += Number(r.budget_total);
      if (r.ces_score != null) { cesSum += Number(r.ces_score); cesCount++; }
    }
  }

  // Closed/won: deals with attribution where close_date in this year
  const cwRes = await db.execute({
    sql: `SELECT COALESCE(SUM(amount), 0) as total FROM closed_deals WHERE close_date >= ? AND close_date <= ? AND attribution_type IS NOT NULL AND LOWER(TRIM(attribution_type)) != 'none'`,
    args: [startDate, endDate],
  });
  const totalClosedWon = Number(cwRes.rows[0]?.total ?? 0);

  const budgetUtilizationPercent = totalBudget > 0 ? Math.round((totalActualSpend / totalBudget) * 100) : 0;
  const avgCostPerConference = conferencesAttended > 0 ? totalActualSpend / conferencesAttended : 0;
  const avgClosedWonPerConference = conferencesAttended > 0 ? totalClosedWon / conferencesAttended : 0;
  const avgCES = cesCount > 0 ? Math.round((cesSum / cesCount) * 10) / 10 : null;

  return NextResponse.json({
    year,
    conferencesAttended,
    totalActualSpend,
    totalBudget,
    budgetUtilizationPercent,
    avgCostPerConference,
    totalClosedWon,
    avgClosedWonPerConference,
    avgCES,
    conferencesScored: cesCount,
  });
}
