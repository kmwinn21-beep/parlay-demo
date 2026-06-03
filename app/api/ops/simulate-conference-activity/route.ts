import { NextRequest, NextResponse } from 'next/server';
import { requireOpsAdmin } from '@/lib/opsAuth';
import { simulateConferenceActivity, SimulationParams } from '@/lib/simulate-conference-activity';

export async function POST(request: NextRequest) {
  const auth = await requireOpsAdmin(request);
  if (auth instanceof NextResponse) return auth;

  let body: Partial<SimulationParams>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  // Validate fields
  const { accountId, conferenceId, targetScoreMin, targetScoreMax, repIds, attendeeCoverage, density, dryRun } = body;

  if (!accountId || typeof accountId !== 'string') {
    return NextResponse.json({ error: 'accountId is required' }, { status: 400 });
  }
  if (!conferenceId || typeof conferenceId !== 'number') {
    return NextResponse.json({ error: 'conferenceId must be a number' }, { status: 400 });
  }
  if (typeof targetScoreMin !== 'number' || targetScoreMin < 0 || targetScoreMin > 100) {
    return NextResponse.json({ error: 'targetScoreMin must be 0-100' }, { status: 400 });
  }
  if (typeof targetScoreMax !== 'number' || targetScoreMax < 0 || targetScoreMax > 100) {
    return NextResponse.json({ error: 'targetScoreMax must be 0-100' }, { status: 400 });
  }
  if (targetScoreMin > targetScoreMax) {
    return NextResponse.json({ error: 'targetScoreMin must be <= targetScoreMax' }, { status: 400 });
  }
  if (!Array.isArray(repIds) || repIds.some(id => typeof id !== 'number')) {
    return NextResponse.json({ error: 'repIds must be an array of numbers' }, { status: 400 });
  }
  if (typeof attendeeCoverage !== 'number' || attendeeCoverage < 0.1 || attendeeCoverage > 1.0) {
    return NextResponse.json({ error: 'attendeeCoverage must be between 0.1 and 1.0' }, { status: 400 });
  }
  if (!density || !['light', 'moderate', 'heavy'].includes(density)) {
    return NextResponse.json({ error: 'density must be light, moderate, or heavy' }, { status: 400 });
  }
  if (typeof dryRun !== 'boolean') {
    return NextResponse.json({ error: 'dryRun must be a boolean' }, { status: 400 });
  }

  try {
    const result = await simulateConferenceActivity({
      accountId,
      conferenceId,
      targetScoreMin,
      targetScoreMax,
      repIds,
      attendeeCoverage,
      density,
      dryRun,
    });
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
