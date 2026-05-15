import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getDb } from '@/lib/getDb';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const db = await getDb(authResult.accountId);

  const conferenceId = Number(request.nextUrl.searchParams.get('conferenceId'));
  if (!conferenceId) return NextResponse.json({ error: 'conferenceId required' }, { status: 400 });

  const [accountRow, userRow, allUserRows] = await Promise.all([
    db.execute({ sql: `SELECT conference_id, decision, updated_by, updated_at FROM conference_decisions WHERE conference_id = ?`, args: [conferenceId] }),
    db.execute({ sql: `SELECT user_id, conference_id, decision, note, updated_at FROM user_conference_decisions WHERE user_id = ? AND conference_id = ?`, args: [authResult.id, conferenceId] }),
    db.execute({
      sql: `SELECT ucd.user_id, ucd.decision, ucd.note, ucd.updated_at,
                   u.first_name, u.last_name, u.email, u.display_name
            FROM user_conference_decisions ucd
            JOIN users u ON u.id = ucd.user_id
            WHERE ucd.conference_id = ?`,
      args: [conferenceId],
    }),
  ]);

  return NextResponse.json({
    account: accountRow.rows[0] ?? null,
    user: userRow.rows[0] ?? null,
    teamDecisions: allUserRows.rows,
  });
}

export async function PUT(request: NextRequest) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const db = await getDb(authResult.accountId);

  const body = await request.json() as { conferenceId: number; decision: string; level: 'account' | 'user'; note?: string };
  const { conferenceId, decision, level, note } = body;

  if (!conferenceId || !decision || !level) {
    return NextResponse.json({ error: 'conferenceId, decision, and level are required' }, { status: 400 });
  }

  if (level === 'account') {
    if (authResult.role !== 'administrator') {
      return NextResponse.json({ error: 'Administrator access required for account-level decisions' }, { status: 403 });
    }
    await db.execute({
      sql: `INSERT INTO conference_decisions (conference_id, decision, updated_by, updated_at)
            VALUES (?, ?, ?, datetime('now'))
            ON CONFLICT(conference_id) DO UPDATE SET decision = excluded.decision, updated_by = excluded.updated_by, updated_at = excluded.updated_at`,
      args: [conferenceId, decision, authResult.id],
    });
  } else {
    await db.execute({
      sql: `INSERT INTO user_conference_decisions (user_id, conference_id, decision, note, updated_at)
            VALUES (?, ?, ?, ?, datetime('now'))
            ON CONFLICT(user_id, conference_id) DO UPDATE SET decision = excluded.decision, note = excluded.note, updated_at = excluded.updated_at`,
      args: [authResult.id, conferenceId, decision, note ?? null],
    });
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: NextRequest) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const db = await getDb(authResult.accountId);

  const body = await request.json() as { conferenceId: number; level: 'account' | 'user' };
  const { conferenceId, level } = body;
  if (!conferenceId || !level) {
    return NextResponse.json({ error: 'conferenceId and level are required' }, { status: 400 });
  }

  if (level === 'account') {
    if (authResult.role !== 'administrator') {
      return NextResponse.json({ error: 'Administrator access required for account-level decisions' }, { status: 403 });
    }
    await db.execute({ sql: `DELETE FROM conference_decisions WHERE conference_id = ?`, args: [conferenceId] });
  } else {
    await db.execute({ sql: `DELETE FROM user_conference_decisions WHERE user_id = ? AND conference_id = ?`, args: [authResult.id, conferenceId] });
  }

  return NextResponse.json({ ok: true });
}
