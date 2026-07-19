import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getDb } from '@/lib/getDb';
import { getInitials, resolveUserDisplayName } from '@/lib/initials';

export async function GET(request: NextRequest) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const db = await getDb(authResult?.accountId);

  const url = new URL(request.url);
  const year = parseInt(url.searchParams.get('year') ?? String(new Date().getFullYear() - 1), 10);
  const startDate = `${year}-01-01`;
  const endDate = `${year}-12-31`;

  // Conferences for this year with series info
  const confsRes = await db.execute({
    sql: `SELECT c.id, c.name, c.start_date, c.end_date, c.series_id, c.internal_attendees, c.stage_override,
                 cs.display_name as series_name, co.value as strategy_type_name
          FROM conferences c
          LEFT JOIN conference_series cs ON cs.id = c.series_id
          LEFT JOIN config_options co ON co.id = c.conference_strategy_type_id
          WHERE c.start_date >= ? AND c.start_date <= ?
          ORDER BY c.start_date ASC`,
    args: [startDate, endDate],
  });

  const confIds = confsRes.rows.map(r => Number(r.id));
  if (confIds.length === 0) {
    return NextResponse.json({ conferences: [], series: [], standalone: [] });
  }

  const ph = confIds.map(() => '?').join(',');

  // Snapshots
  const snapRes = await db.execute({
    sql: `SELECT conference_id, ces_score, actual_total, budget_total, pipeline_influenced, budget_line_items FROM conference_snapshots WHERE conference_id IN (${ph})`,
    args: confIds,
  });

  type ParsedLineItem = { label: string; budgeted: number | null; actual: number | null };
  function parseBudgetLineItems(raw: unknown): ParsedLineItem[] | null {
    if (!raw) return null;
    try {
      const parsed = JSON.parse(String(raw));
      if (!Array.isArray(parsed) || parsed.length === 0) return null;
      const parseDollar = (v: unknown) => {
        const n = Number(String(v ?? '').replace(/[^0-9.-]/g, ''));
        return isNaN(n) ? null : n;
      };
      return (parsed as unknown[])
        .filter(item => item && typeof item === 'object')
        .map(item => {
          const obj = item as Record<string, unknown>;
          return {
            label: String(obj['label'] ?? obj['name'] ?? obj['category'] ?? 'Item'),
            budgeted: parseDollar(obj['budget']),
            actual: parseDollar(obj['actual']),
          };
        });
    } catch { return null; }
  }

  const snapMap = new Map<number, {
    ces_score: number | null; actual_total: number | null; budget_total: number | null;
    pipeline_influenced: number | null; budgetLineItems: ParsedLineItem[] | null;
  }>();
  for (const r of snapRes.rows) {
    snapMap.set(Number(r.conference_id), {
      ces_score: r.ces_score != null ? Number(r.ces_score) : null,
      actual_total: r.actual_total != null ? Number(r.actual_total) : null,
      budget_total: r.budget_total != null ? Number(r.budget_total) : null,
      pipeline_influenced: r.pipeline_influenced != null ? Number(r.pipeline_influenced) : null,
      budgetLineItems: parseBudgetLineItems(r.budget_line_items),
    });
  }

  // conference_plans for this year
  const plansRes = await db.execute({
    sql: `SELECT conference_id, decision, planned_budget, assigned_rep_ids, notes FROM conference_plans WHERE conference_id IN (${ph}) AND plan_year = ?`,
    args: [...confIds, year],
  });
  const planMap = new Map<number, { decision: string | null; planned_budget: number | null; assignedRepIds: number[]; notes: string | null }>();
  for (const r of plansRes.rows) {
    let assignedRepIds: number[] = [];
    try {
      const parsed = JSON.parse(String(r.assigned_rep_ids ?? '[]'));
      if (Array.isArray(parsed)) assignedRepIds = parsed.map(Number).filter(n => !isNaN(n));
    } catch { /* ignore */ }
    planMap.set(Number(r.conference_id), {
      decision: r.decision ? String(r.decision) : null,
      planned_budget: r.planned_budget != null ? Number(r.planned_budget) : null,
      assignedRepIds,
      notes: r.notes ? String(r.notes) : null,
    });
  }

  // Resolve assigned rep user details for every rep referenced across all plans
  const allRepIds = Array.from(new Set(Array.from(planMap.values()).flatMap(p => p.assignedRepIds)));
  const repMap = new Map<number, { userId: number; displayName: string; initials: string }>();
  if (allRepIds.length > 0) {
    const repPh = allRepIds.map(() => '?').join(',');
    const repsRes = await db.execute({
      sql: `SELECT id, display_name, first_name, last_name, email FROM users WHERE id IN (${repPh})`,
      args: allRepIds,
    });
    for (const r of repsRes.rows) {
      const displayName = resolveUserDisplayName(r);
      repMap.set(Number(r.id), { userId: Number(r.id), displayName, initials: getInitials(displayName) });
    }
  }

  // closed/won per conference — apply proper attribution math
  const cwRes = await db.execute({
    sql: `SELECT cd.attributed_conference, cd.amount, cd.attribution_type, cd.attribution_pct FROM closed_deals cd WHERE cd.attribution_type IS NOT NULL AND LOWER(TRIM(cd.attribution_type)) != 'none' AND cd.amount IS NOT NULL`,
    args: [],
  });

  function parseAttrConfs(raw: unknown): string[] {
    try {
      const parsed = JSON.parse(String(raw ?? '[]'));
      return Array.isArray(parsed) ? parsed.map(String) : [];
    } catch { return []; }
  }

  // Build per-conference closed/won using attributed amount (not full deal amount)
  const cwByConfId = new Map<number, number>();
  for (const conf of confsRes.rows) {
    const confName = String(conf.name);
    let total = 0;
    for (const r of cwRes.rows) {
      const attrConfs = parseAttrConfs(r.attributed_conference);
      if (!attrConfs.includes(confName)) continue;
      const amount = Number(r.amount ?? 0);
      const attrType = String(r.attribution_type ?? '').toLowerCase().trim();
      if (attrType === 'direct source') {
        total += amount;
      } else {
        const pct = Number(r.attribution_pct ?? 50);
        total += amount * (pct / 100);
      }
    }
    if (total > 0) cwByConfId.set(Number(conf.id), total);
  }

  // Build conference objects
  const conferences = confsRes.rows.map(conf => {
    const confId = Number(conf.id);
    const snap = snapMap.get(confId);
    const plan = planMap.get(confId);
    // headcount from internal_attendees JSON array length
    let headcount: number | null = null;
    try {
      const arr = JSON.parse(String(conf.internal_attendees ?? '[]'));
      if (Array.isArray(arr)) headcount = arr.length || null;
    } catch { /* ignore */ }

    return {
      conferenceId: confId,
      name: String(conf.name),
      startDate: String(conf.start_date),
      endDate: String(conf.end_date),
      seriesId: conf.series_id ? String(conf.series_id) : null,
      seriesName: conf.series_name ? String(conf.series_name) : null,
      ces: snap?.ces_score ?? null,
      actualSpend: snap?.actual_total ?? null,
      budgetTotal: snap?.budget_total ?? null,
      pipelineInfluenced: snap?.pipeline_influenced ?? null,
      budgetLineItems: snap?.budgetLineItems ?? null,
      closedWon: cwByConfId.has(confId) ? Math.round(cwByConfId.get(confId)!) : null,
      headcount,
      decision: plan?.decision ?? null,
      plannedBudget: plan?.planned_budget ?? null,
      stageOverride: conf.stage_override ? String(conf.stage_override) : null,
      assignedReps: (plan?.assignedRepIds ?? []).map(id => repMap.get(id)).filter((r): r is { userId: number; displayName: string; initials: string } => r != null),
      strategyTypeName: conf.strategy_type_name ? String(conf.strategy_type_name) : null,
      planNotes: plan?.notes ?? null,
    };
  });

  // Group by series
  const seriesMap = new Map<string, { seriesId: string; seriesName: string; conferences: typeof conferences }>();
  const standalone: typeof conferences = [];

  for (const conf of conferences) {
    if (conf.seriesId) {
      if (!seriesMap.has(conf.seriesId)) {
        seriesMap.set(conf.seriesId, { seriesId: conf.seriesId, seriesName: conf.seriesName ?? conf.seriesId, conferences: [] });
      }
      seriesMap.get(conf.seriesId)!.conferences.push(conf);
    } else {
      standalone.push(conf);
    }
  }

  const series = Array.from(seriesMap.values()).map(s => ({
    seriesId: s.seriesId,
    seriesName: s.seriesName,
    conferenceCount: s.conferences.length,
    totalActualSpend: s.conferences.reduce((sum, c) => sum + (c.actualSpend ?? 0), 0),
    totalPipeline: s.conferences.reduce((sum, c) => sum + (c.pipelineInfluenced ?? 0), 0),
    totalClosedWon: s.conferences.reduce((sum, c) => sum + (c.closedWon ?? 0), 0),
    avgCES: (() => {
      const scored = s.conferences.filter(c => c.ces != null);
      return scored.length > 0 ? Math.round((scored.reduce((sum, c) => sum + c.ces!, 0) / scored.length) * 10) / 10 : null;
    })(),
    conferences: s.conferences,
  }));

  return NextResponse.json({ conferences, series, standalone });
}
