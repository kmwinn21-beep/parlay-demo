import { NextRequest, NextResponse } from 'next/server';
import { requireOpsAdmin } from '@/lib/opsAuth';
import { simulateConferenceActivity } from '@/lib/simulate-conference-activity';

export async function POST(request: NextRequest) {
  const auth = await requireOpsAdmin(request);
  if (auth instanceof NextResponse) return auth;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { accountId, conferenceId, repIds, meetingsHeld, touchpoints, followUpCompletionPct } = body;

  if (!accountId || typeof accountId !== 'string') {
    return NextResponse.json({ error: 'accountId is required' }, { status: 400 });
  }
  if (!conferenceId || typeof conferenceId !== 'number') {
    return NextResponse.json({ error: 'conferenceId must be a number' }, { status: 400 });
  }
  if (!Array.isArray(repIds) || repIds.some((id: unknown) => typeof id !== 'number')) {
    return NextResponse.json({ error: 'repIds must be an array of numbers' }, { status: 400 });
  }
  if (typeof meetingsHeld !== 'number' || meetingsHeld < 0) {
    return NextResponse.json({ error: 'meetingsHeld must be a non-negative number' }, { status: 400 });
  }
  if (typeof touchpoints !== 'number' || touchpoints < 0) {
    return NextResponse.json({ error: 'touchpoints must be a non-negative number' }, { status: 400 });
  }
  if (typeof followUpCompletionPct !== 'number' || followUpCompletionPct < 0 || followUpCompletionPct > 100) {
    return NextResponse.json({ error: 'followUpCompletionPct must be 0-100' }, { status: 400 });
  }

  try {
    const result = await simulateConferenceActivity({
      accountId,
      conferenceId,
      repIds: repIds as number[],
      meetingsHeld,
      touchpoints,
      followUpCompletionPct,
      dryRun: true,
    });
    return NextResponse.json({ plan: result.plan, cesEstimate: result.cesEstimate, warning: result.warning });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
