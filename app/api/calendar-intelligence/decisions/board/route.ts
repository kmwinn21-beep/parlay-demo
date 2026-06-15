import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getDb } from '@/lib/getDb';

export const dynamic = 'force-dynamic';

type UserOpinion = {
  userId: number;
  displayName: string;
  email: string;
  note: string | null;
  updatedAt: string;
};

const DECISION_KEYS = ['confirmed', 'attend_but_reduce', 'watching', 'passed', 'pending_approval'] as const;
type DecisionKey = typeof DECISION_KEYS[number];

function emptyOpinions(): Record<DecisionKey, UserOpinion[]> {
  return { confirmed: [], attend_but_reduce: [], watching: [], passed: [], pending_approval: [] };
}

type Row = Record<string, unknown>;

export async function GET(request: NextRequest) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const db = await getDb(authResult.accountId);

  const conferenceIdParam = request.nextUrl.searchParams.get('conferenceId');
  const filterConferenceId = conferenceIdParam ? Number(conferenceIdParam) : null;

  const [confsRes, userDecisionsRes, noteCountsRes] = await Promise.all([
    filterConferenceId
      ? db.execute({
          // Filtered view: any conference (no end_date restriction — supports active/upcoming too)
          sql: `SELECT c.id, c.name, c.end_date, COUNT(ca.attendee_id) AS attendee_count
                FROM conferences c
                LEFT JOIN conference_attendees ca ON ca.conference_id = c.id
                WHERE c.id = ?
                GROUP BY c.id`,
          args: [filterConferenceId],
        })
      : db.execute({
          // Default view: historical conferences only, sorted by name ascending
          sql: `SELECT c.id, c.name, c.end_date, COUNT(ca.attendee_id) AS attendee_count
                FROM conferences c
                LEFT JOIN conference_attendees ca ON ca.conference_id = c.id
                WHERE date(c.end_date) <= date('now')
                GROUP BY c.id
                ORDER BY c.name ASC`,
          args: [],
        }),
    filterConferenceId
      ? db.execute({
          sql: `SELECT ucd.user_id, ucd.conference_id, ucd.decision, ucd.note, ucd.updated_at,
                       u.display_name, u.first_name, u.last_name, u.email
                FROM user_conference_decisions ucd
                JOIN users u ON u.id = ucd.user_id
                WHERE ucd.conference_id = ?`,
          args: [filterConferenceId],
        })
      : db.execute({
          sql: `SELECT ucd.user_id, ucd.conference_id, ucd.decision, ucd.note, ucd.updated_at,
                       u.display_name, u.first_name, u.last_name, u.email
                FROM user_conference_decisions ucd
                JOIN users u ON u.id = ucd.user_id`,
          args: [],
        }),
    filterConferenceId
      ? db.execute({
          sql: `SELECT conference_id, COUNT(*) as note_count FROM calendar_notes WHERE conference_id = ? GROUP BY conference_id`,
          args: [filterConferenceId],
        })
      : db.execute({
          sql: `SELECT conference_id, COUNT(*) as note_count FROM calendar_notes GROUP BY conference_id`,
          args: [],
        }),
  ]);

  // Group opinions by conference, then by decision value
  const opinionsByConf = new Map<number, Record<DecisionKey, UserOpinion[]>>();
  for (const row of userDecisionsRes.rows as Row[]) {
    const cid = Number(row.conference_id);
    if (!opinionsByConf.has(cid)) opinionsByConf.set(cid, emptyOpinions());
    const dec = String(row.decision) as DecisionKey;
    const groups = opinionsByConf.get(cid)!;
    const opinion: UserOpinion = {
      userId: Number(row.user_id),
      displayName: row.display_name
        ? String(row.display_name)
        : [row.first_name, row.last_name].filter(Boolean).join(' ') || String(row.email),
      email: String(row.email),
      note: row.note ? String(row.note) : null,
      updatedAt: String(row.updated_at ?? ''),
    };
    // Push into the matching bucket (or ignore unknown decision values gracefully)
    if (Object.prototype.hasOwnProperty.call(groups, dec)) {
      groups[dec].push(opinion);
    } else {
      // Unknown decision value — add it anyway under a cast so nothing is silently lost
      (groups as Record<string, UserOpinion[]>)[dec] = [...((groups as Record<string, UserOpinion[]>)[dec] ?? []), opinion];
    }
  }

  const noteCountMap = new Map<number, number>();
  for (const row of noteCountsRes.rows as Row[]) {
    noteCountMap.set(Number(row.conference_id), Number(row.note_count));
  }

  const conferences = (confsRes.rows as Row[])
    .filter(r => {
      if (filterConferenceId) return true; // always return the requested conference
      // Default view: only conferences with at least one user opinion
      return opinionsByConf.has(Number(r.id));
    })
    .map(r => {
      const cid = Number(r.id);
      const endDate = new Date(String(r.end_date));
      return {
        conferenceId: cid,
        name: String(r.name ?? ''),
        year: endDate.getUTCFullYear(),
        attendeeCount: Number(r.attendee_count ?? 0),
        opinionsByDecision: opinionsByConf.get(cid) ?? emptyOpinions(),
        noteCount: noteCountMap.get(cid) ?? 0,
      };
    });

  return NextResponse.json({ conferences });
}
