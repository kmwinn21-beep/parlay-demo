import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getDb } from '@/lib/getDb';

// Runs the (unmodified) Calendar Intelligence scoring engine for a conference
// that may not have ended yet — used after a Plan-tab List Score upload has
// imported the file as real attendees for the conference. Persists the result
// onto conference_plans so the Plan tab can render it without re-scoring on
// every render (the drawer itself still re-fetches full detail on open).
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const db = await getDb(authResult?.accountId);

  const { id } = await params;
  const conferenceId = Number(id);
  if (!Number.isFinite(conferenceId) || conferenceId <= 0) {
    return NextResponse.json({ error: 'Invalid conference ID' }, { status: 400 });
  }

  const body = await request.json().catch(() => ({}));
  const planYear = Number(body?.planYear);
  if (!Number.isFinite(planYear)) {
    return NextResponse.json({ error: 'planYear is required' }, { status: 400 });
  }

  const scoreUrl = new URL(`/api/program-intelligence/calendar-intelligence/${conferenceId}?includeFuture=1`, request.url);
  const scoreRes = await fetch(scoreUrl, {
    headers: { cookie: request.headers.get('cookie') ?? '' },
    cache: 'no-store',
  });
  if (!scoreRes.ok) {
    const err = await scoreRes.json().catch(() => ({}));
    return NextResponse.json({ error: err.error ?? 'Scoring failed' }, { status: scoreRes.status });
  }
  const { conference } = await scoreRes.json();

  const listScore = conference?.calendarRecommendationScore != null ? Math.round(conference.calendarRecommendationScore) : null;
  const listScoreTier = conference?.recommendationTier ?? null;
  const listScoreConfidence = conference?.confidenceLevel ?? null;

  await db.execute({
    sql: `INSERT INTO conference_plans (conference_id, plan_year, list_score, list_score_tier, list_score_confidence, updated_at)
          VALUES (?, ?, ?, ?, ?, datetime('now'))
          ON CONFLICT(conference_id, plan_year) DO UPDATE SET
            list_score = excluded.list_score,
            list_score_tier = excluded.list_score_tier,
            list_score_confidence = excluded.list_score_confidence,
            updated_at = datetime('now')`,
    args: [conferenceId, planYear, listScore, listScoreTier, listScoreConfidence],
  });

  return NextResponse.json({ listScore, listScoreTier, listScoreConfidence });
}
