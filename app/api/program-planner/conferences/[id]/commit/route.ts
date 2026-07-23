import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getDb } from '@/lib/getDb';

type Row = Record<string, unknown>;

// libSQL args must be string | number | null (InValue) — source.* fields
// read off a generic `Row` are `unknown`, so this narrows them for the
// INSERT below without a giant string(x ?? '') / number(x ?? 0) per field.
function sqlValue(v: unknown): string | number | null {
  if (v == null) return null;
  if (typeof v === 'string' || typeof v === 'number') return v;
  return String(v);
}

// Committing a Plan-tab conference means two different things depending on
// what the row already was:
//
// - A brand-new conference (added via the Plan tab's minimal Add-to-Plan
//   flow, committed_to_program = 0): promote it in place — same conferences
//   row, just gains real dates and committed_to_program = 1.
//
// - An existing, already-committed conference the user is re-evaluating for
//   next year (e.g. they attended ModXPO in 2026 and are deciding whether to
//   go again in 2027): the 2026 conferences row must NOT be mutated — it's a
//   real past instance. Instead this creates a brand-new conferences row for
//   the new year (same series, same Strategy/Type/Sponsorship/Booth/Location
//   as configured in the Plan table), exactly as if the user had used the
//   main Add Conference form for "ModXPO 2027". The conference_plans row
//   that was tracking this decision gets re-pointed at the new conference id
//   so its decision/budget/reps/dates/etc. carry over untouched.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const db = await getDb(authResult?.accountId);

  const { id } = await params;
  const conferenceId = parseInt(id, 10);
  if (isNaN(conferenceId)) return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });

  const body = await request.json().catch(() => ({}));
  const planYear = Number(body?.planYear);
  if (!Number.isFinite(planYear)) {
    return NextResponse.json({ error: 'planYear is required' }, { status: 400 });
  }

  const [planRes, confRes] = await Promise.all([
    db.execute({
      sql: `SELECT planned_start_date, planned_end_date FROM conference_plans WHERE conference_id = ? AND plan_year = ?`,
      args: [conferenceId, planYear],
    }),
    db.execute({ sql: `SELECT * FROM conferences WHERE id = ?`, args: [conferenceId] }),
  ]);
  const plan = planRes.rows[0] as Row | undefined;
  const plannedStartDate = plan?.planned_start_date ? String(plan.planned_start_date) : null;
  const plannedEndDate = plan?.planned_end_date ? String(plan.planned_end_date) : null;

  if (!plannedStartDate) {
    return NextResponse.json({ error: 'Set conference dates before adding this conference to your program.' }, { status: 400 });
  }

  const source = confRes.rows[0] as Row | undefined;
  if (!source) return NextResponse.json({ error: 'Conference not found' }, { status: 404 });

  const alreadyCommitted = Number(source.committed_to_program ?? 1) === 1;

  if (!alreadyCommitted) {
    // Brand-new draft — promote this same row.
    await db.execute({
      sql: `UPDATE conferences SET start_date = ?, end_date = ?, committed_to_program = 1 WHERE id = ?`,
      args: [plannedStartDate, plannedEndDate ?? plannedStartDate, conferenceId],
    });
    return NextResponse.json({ success: true, conferenceId, startDate: plannedStartDate, endDate: plannedEndDate ?? plannedStartDate, newConferenceId: null });
  }

  // Re-evaluating an already-committed conference for a new year — spawn a
  // new conferences row for that year, copying the fields that map to the
  // Conference Details edit form (same rationale the original request gave
  // for "migrate all of the column values that map to form fields").
  let defaultPostConferenceDays = 10;
  try {
    const pcRow = await db.execute({ sql: `SELECT value FROM effectiveness_defaults WHERE key = 'default_post_conference_days'`, args: [] });
    if (pcRow.rows[0]) {
      const parsed = parseInt(String((pcRow.rows[0] as Row).value), 10);
      if (Number.isFinite(parsed) && parsed > 0) defaultPostConferenceDays = parsed;
    }
  } catch { /* use default */ }

  const newConfRes = await db.execute({
    sql: `INSERT INTO conferences
            (name, start_date, end_date, location,
             location_place_id, location_lat, location_lng, location_city, location_state, location_country, location_timezone,
             conference_strategy_type_id, is_historical, post_conference_days, series_id, season_id,
             industry_focus, conference_type, website, sponsorship_level,
             booth_present, booth_width, booth_length, booth_number, booth_hall,
             territory_scope, territory_ids, committed_to_program)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1) RETURNING id`,
    args: [
      String(source.name ?? ''), plannedStartDate, plannedEndDate ?? plannedStartDate, String(source.location ?? 'TBD'),
      sqlValue(source.location_place_id), sqlValue(source.location_lat), sqlValue(source.location_lng),
      sqlValue(source.location_city), sqlValue(source.location_state), sqlValue(source.location_country), sqlValue(source.location_timezone),
      sqlValue(source.conference_strategy_type_id), defaultPostConferenceDays, sqlValue(source.series_id), sqlValue(source.season_id),
      sqlValue(source.industry_focus), sqlValue(source.conference_type), sqlValue(source.website), sqlValue(source.sponsorship_level),
      sqlValue(source.booth_present) ?? 0, sqlValue(source.booth_width), sqlValue(source.booth_length), sqlValue(source.booth_number), sqlValue(source.booth_hall),
      sqlValue(source.territory_scope), sqlValue(source.territory_ids) ?? '[]',
    ],
  });
  const newConferenceId = Number((newConfRes.rows[0] as Row).id);

  // Re-point this plan-year's conference_plans row (decision, budget, reps,
  // planned dates, list score, notes) at the new conference instance.
  await db.execute({
    sql: `UPDATE conference_plans SET conference_id = ? WHERE conference_id = ? AND plan_year = ?`,
    args: [newConferenceId, conferenceId, planYear],
  });

  return NextResponse.json({ success: true, conferenceId, newConferenceId, startDate: plannedStartDate, endDate: plannedEndDate ?? plannedStartDate });
}
