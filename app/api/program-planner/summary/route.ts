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

  // Closed/won: sum attributed amounts for deals referencing conferences in this year
  const confNames = new Set(confs.map(r => String(r.name)));
  let totalClosedWon = 0;
  if (confNames.size > 0) {
    const cwDealsRes = await db.execute({
      sql: `SELECT attributed_conference, amount, attribution_type, attribution_pct FROM closed_deals WHERE attribution_type IS NOT NULL AND LOWER(TRIM(attribution_type)) != 'none' AND amount IS NOT NULL`,
      args: [],
    });
    for (const r of cwDealsRes.rows) {
      let attrConfs: string[] = [];
      try {
        const parsed = JSON.parse(String(r.attributed_conference ?? '[]'));
        attrConfs = Array.isArray(parsed) ? parsed.map(String) : [];
      } catch { /* skip */ }
      const matchingConfs = attrConfs.filter(name => confNames.has(name));
      if (matchingConfs.length === 0) continue;
      const amount = Number(r.amount ?? 0);
      const attrType = String(r.attribution_type ?? '').toLowerCase().trim();
      for (const _confName of matchingConfs) {
        if (attrType === 'direct source') {
          totalClosedWon += amount;
        } else {
          const pct = Number(r.attribution_pct ?? 50);
          const perConfPct = pct / attrConfs.length;
          totalClosedWon += amount * (perConfPct / 100);
        }
      }
    }
  }

  const budgetUtilizationPercent = totalBudget > 0 ? Math.round((totalActualSpend / totalBudget) * 100) : 0;
  const avgCostPerConference = conferencesAttended > 0 ? totalActualSpend / conferencesAttended : 0;
  totalClosedWon = Math.round(totalClosedWon);
  const avgClosedWonPerConference = conferencesAttended > 0 ? Math.round(totalClosedWon / conferencesAttended) : 0;
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
