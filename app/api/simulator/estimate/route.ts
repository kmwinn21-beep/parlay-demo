import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getDb } from '@/lib/getDb';
import { simulateConferenceActivity } from '@/lib/simulate-conference-activity';

export async function POST(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;
  if (auth.role !== 'administrator') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const { conferenceId, repIds, meetingsHeld, touchpoints, followUpCompletionPct, netNewMeetingsPct = 0, netNewTouchpointsPct = 0 } = body as {
    conferenceId: number; repIds: number[]; meetingsHeld: number; touchpoints: number; followUpCompletionPct: number;
    netNewMeetingsPct?: number; netNewTouchpointsPct?: number;
  };

  const db = await getDb(auth.accountId);

  try {
    const result = await simulateConferenceActivity({
      accountId: auth.accountId ?? '',
      client: db,
      conferenceId,
      repIds: repIds ?? [],
      meetingsHeld: Number(meetingsHeld),
      touchpoints: Number(touchpoints),
      followUpCompletionPct: Number(followUpCompletionPct),
      dryRun: true,
      netNewMeetingsPct: Number(netNewMeetingsPct),
      netNewTouchpointsPct: Number(netNewTouchpointsPct),
    });
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
