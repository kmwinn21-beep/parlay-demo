import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getDb } from '@/lib/getDb';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const db = await getDb(authResult.accountId);

  const [confsRes, decisionsRes, userDecisionsRes] = await Promise.all([
    db.execute({
      sql: `SELECT c.id, c.name, c.end_date,
                   COUNT(ca.attendee_id) AS attendee_count
            FROM conferences c
            LEFT JOIN conference_attendees ca ON ca.conference_id = c.id
            WHERE date(c.end_date) <= date('now')
            GROUP BY c.id
            ORDER BY date(c.end_date) DESC`,
      args: [],
    }),
    db.execute({
      sql: `SELECT conference_id, decision, updated_by, updated_at FROM conference_decisions`,
      args: [],
    }),
    db.execute({
      sql: `SELECT ucd.user_id, ucd.conference_id, ucd.decision, ucd.note, ucd.updated_at,
                   u.first_name, u.last_name, u.email, u.display_name
            FROM user_conference_decisions ucd
            JOIN users u ON u.id = ucd.user_id`,
      args: [],
    }),
  ]);

  type Row = Record<string, unknown>;

  const accountDecisionMap = new Map<number, string>();
  for (const row of decisionsRes.rows as Row[]) {
    accountDecisionMap.set(Number(row.conference_id), String(row.decision));
  }

  const userDecisionsByConf = new Map<number, Row[]>();
  for (const row of userDecisionsRes.rows as Row[]) {
    const cid = Number(row.conference_id);
    if (!userDecisionsByConf.has(cid)) userDecisionsByConf.set(cid, []);
    userDecisionsByConf.get(cid)!.push(row);
  }

  const conferences = (confsRes.rows as Row[]).map(r => {
    const conferenceId = Number(r.id);
    const accountDecision = accountDecisionMap.get(conferenceId) ?? null;
    const userDecisions = userDecisionsByConf.get(conferenceId) ?? [];
    const endDate = new Date(String(r.end_date));

    return {
      conferenceId,
      name: String(r.name ?? ''),
      year: endDate.getUTCFullYear(),
      attendeeCount: Number(r.attendee_count ?? 0),
      accountDecision,
      userDecisions: userDecisions.map(ud => ({
        userId: Number(ud.user_id),
        displayName: ud.display_name ? String(ud.display_name) : [ud.first_name, ud.last_name].filter(Boolean).join(' ') || String(ud.email),
        email: String(ud.email),
        decision: String(ud.decision),
        note: ud.note ? String(ud.note) : null,
        updatedAt: String(ud.updated_at ?? ''),
      })),
    };
  });

  return NextResponse.json({ conferences });
}
