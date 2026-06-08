import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getDb } from '@/lib/getDb';

export async function POST(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;
  if (auth.role !== 'administrator') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  let body: { conferenceId: number };
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const { conferenceId } = body;
  if (!conferenceId) return NextResponse.json({ error: 'conferenceId required' }, { status: 400 });

  const db = await getDb(auth.accountId);

  const [mRes, fRes, tRes] = await Promise.all([
    db.execute({ sql: `DELETE FROM meetings WHERE conference_id = ? AND source = 'simulated'`, args: [conferenceId] }),
    db.execute({ sql: `DELETE FROM follow_ups WHERE conference_id = ? AND source = 'simulated'`, args: [conferenceId] }),
    db.execute({ sql: `DELETE FROM attendee_touchpoints WHERE conference_id = ? AND source = 'simulated'`, args: [conferenceId] }),
  ]);

  // Also clean up orphaned meeting notes
  await db.execute({
    sql: `DELETE FROM meeting_notes WHERE meeting_id NOT IN (SELECT id FROM meetings)`,
    args: [],
  }).catch(() => {});

  return NextResponse.json({
    deleted: {
      meetings: Number(mRes.rowsAffected ?? 0),
      followUps: Number(fRes.rowsAffected ?? 0),
      touchpoints: Number(tRes.rowsAffected ?? 0),
    },
  });
}
