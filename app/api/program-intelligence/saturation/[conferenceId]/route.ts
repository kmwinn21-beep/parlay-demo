import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getDb } from '@/lib/getDb';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ conferenceId: string }> },
) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const accountId = authResult.accountId ?? '';
  const db = await getDb(accountId);
  const { conferenceId: confIdStr } = await params;
  const conferenceId = Number(confIdStr);

  const snapRow = await db.execute({
    sql: `SELECT s.*, c.name as conference_name, c.start_date, cs.display_name as series_name
          FROM conference_saturation_snapshots s
          JOIN conferences c ON c.id = s.conference_id
          JOIN conference_series cs ON cs.id = s.series_id
          WHERE s.conference_id = ? AND s.account_id = ?`,
    args: [conferenceId, accountId],
  });

  if (snapRow.rows.length === 0) {
    return NextResponse.json({ error: 'No saturation snapshot found' }, { status: 404 });
  }

  const snap = snapRow.rows[0];

  // Droppable contacts: registered at this conference with health_score >= 50
  const droppableRes = await db.execute({
    sql: `SELECT
            a.id as attendee_id,
            a.first_name, a.last_name, a.title,
            co.name as company_name,
            COALESCE(a.health_score, 0) as health_score,
            COALESCE(h.interaction_count, 1) as interaction_count,
            COALESCE(h.cumulative_meetings, 0) as cumulative_meetings,
            h.last_meeting_outcome
          FROM conference_attendees ca
          JOIN attendees a ON a.id = ca.attendee_id
          LEFT JOIN companies co ON co.id = a.company_id
          LEFT JOIN contact_conference_history h
            ON h.attendee_id = a.id AND h.series_id = ? AND h.account_id = ?
          WHERE ca.conference_id = ?
            AND COALESCE(a.health_score, 0) >= 50
          ORDER BY a.health_score DESC
          LIMIT 50`,
    args: [String(snap.series_id), accountId, conferenceId],
  });

  return NextResponse.json({
    conference_id: Number(snap.conference_id),
    conference_name: String(snap.conference_name),
    start_date: String(snap.start_date ?? ''),
    series_name: String(snap.series_name),
    series_id: String(snap.series_id),
    snapshot_date: String(snap.snapshot_date ?? ''),
    saturation_score: Number(snap.saturation_score),
    contacts_ever_touched: Number(snap.contacts_ever_touched),
    contacts_touched_this_conf: Number(snap.contacts_touched_this_conf),
    contacts_net_new: Number(snap.contacts_net_new),
    contacts_returning: Number(snap.contacts_returning),
    contacts_droppable: Number(snap.contacts_droppable),
    contacts_high_health: Number(snap.contacts_high_health),
    contacts_mid_health: Number(snap.contacts_mid_health),
    contacts_low_health: Number(snap.contacts_low_health),
    companies_ever_touched: Number(snap.companies_ever_touched),
    companies_net_new: Number(snap.companies_net_new),
    companies_returning: Number(snap.companies_returning),
    meetings_held: Number(snap.meetings_held),
    meetings_with_outcome: Number(snap.meetings_with_outcome),
    new_contact_rate: Number(snap.new_contact_rate),
    droppable_rate: Number(snap.droppable_rate),
    droppable_contacts: droppableRes.rows.map(r => ({
      attendee_id: Number(r.attendee_id),
      first_name: String(r.first_name ?? ''),
      last_name: String(r.last_name ?? ''),
      title: String(r.title ?? ''),
      company_name: String(r.company_name ?? ''),
      health_score: Number(r.health_score ?? 0),
      interaction_count: Number(r.interaction_count ?? 1),
      cumulative_meetings: Number(r.cumulative_meetings ?? 0),
      last_meeting_outcome: r.last_meeting_outcome ? String(r.last_meeting_outcome) : null,
    })),
  });
}
