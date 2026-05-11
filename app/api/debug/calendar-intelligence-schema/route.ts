import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { db, dbReady } from '@/lib/db';

export const dynamic = 'force-dynamic';

type QueryResult = {
  name: string;
  sql: string;
  ok: boolean;
  rowCount?: number;
  rows?: unknown[];
  error?: string;
};

async function runQuery(name: string, sql: string, args: unknown[] = []): Promise<QueryResult> {
  try {
    const result = await db.execute({ sql, args });
    return {
      name,
      sql,
      ok: true,
      rowCount: result.rows.length,
      rows: result.rows,
    };
  } catch (error) {
    return {
      name,
      sql,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function GET(request: NextRequest) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  await dbReady;

  const { searchParams } = new URL(request.url);
  const conferenceName = searchParams.get('name') ?? 'NIC Spring 2026';
  const conferenceIdParam = searchParams.get('conferenceId');

  let conferenceId: number | null = conferenceIdParam ? Number(conferenceIdParam) : null;

  const lookup = conferenceId == null
    ? await runQuery(
        'conference_lookup',
        `SELECT id, name, end_date, is_historical
         FROM conferences
         WHERE name LIKE ?
         ORDER BY end_date DESC
         LIMIT 1`,
        [`%${conferenceName}%`]
      )
    : null;

  if (conferenceId == null && lookup?.ok && lookup.rows && lookup.rows.length > 0) {
    const row = lookup.rows[0] as Record<string, unknown>;
    conferenceId = Number(row.id);
  }

  if (conferenceId == null || Number.isNaN(conferenceId)) {
    return NextResponse.json(
      {
        conferenceName,
        conferenceId: null,
        lookup,
        error: 'Conference not found. Provide ?conferenceId=<id> or a matching ?name=... value.',
      },
      { status: 404 }
    );
  }

  const diagnostics = await Promise.all([
    runQuery('conference_record', `SELECT * FROM conferences WHERE id = ?`, [conferenceId]),
    runQuery('conference_companies_count', `SELECT COUNT(*) AS total_companies FROM conference_companies WHERE conference_id = ?`, [conferenceId]),
    runQuery('company_scores_sample', `SELECT * FROM company_scores WHERE conference_id = ? LIMIT 3`, [conferenceId]),
    runQuery('company_scores_schema', `PRAGMA table_info(company_scores)`),
    runQuery('meetings_count', `SELECT COUNT(*) AS meetings_count FROM meetings WHERE conference_id = ?`, [conferenceId]),
    runQuery('meetings_schema', `PRAGMA table_info(meetings)`),
    runQuery('follow_ups_count', `SELECT COUNT(*) AS follow_ups_count FROM follow_ups WHERE conference_id = ?`, [conferenceId]),
    runQuery('conference_budgets_sample', `SELECT * FROM conference_budgets WHERE conference_id = ?`, [conferenceId]),
    runQuery('conference_spend_fields', `SELECT actual_spend, budgeted_spend, required_pipeline_amount FROM conferences WHERE id = ?`, [conferenceId]),
    runQuery('relationships_count', `SELECT COUNT(*) AS relationships_count FROM relationships WHERE conference_id = ?`, [conferenceId]),
    runQuery('follow_ups_schema', `PRAGMA table_info(follow_ups)`),
    runQuery('conferences_schema', `PRAGMA table_info(conferences)`),
  ]);

  return NextResponse.json({
    conferenceName,
    conferenceId,
    lookup,
    diagnostics,
    note: 'Temporary internal debugging endpoint for Calendar Intelligence schema/data verification.',
  });
}
