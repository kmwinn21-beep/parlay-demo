import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getDb } from '@/lib/getDb';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: { conferenceId: string } },
) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const accountId = authResult.accountId ?? '';
  const db = await getDb(accountId);
  const conferenceId = Number(params.conferenceId);

  const snapRow = await db.execute({
    sql: `SELECT s.*, c.name as conference_name, c.start_date, cs.display_name as series_name
          FROM conference_saturation_snapshots s
          JOIN conferences c ON c.id = s.conference_id
          JOIN conference_series cs ON cs.id = s.series_id
          WHERE s.conference_id = ?`,
    args: [conferenceId],
  });

  if (snapRow.rows.length === 0) {
    return NextResponse.json({ error: 'No saturation snapshot found' }, { status: 404 });
  }

  const snap = snapRow.rows[0];

  // Substitutable contacts: returning attendees with no meeting held at this conference
  const substitutableRes = await db.execute({
    sql: `SELECT
            a.id as attendee_id,
            a.name,
            a.title,
            co.name as company_name,
            COALESCE(a.health_score, 0) as health_score,
            (SELECT COUNT(*) FROM contact_conference_history h2
             WHERE h2.attendee_id = a.id AND h2.series_id = ?) as times_seen
          FROM conference_attendees ca
          JOIN attendees a ON a.id = ca.attendee_id
          LEFT JOIN companies co ON co.id = a.company_id
          WHERE ca.conference_id = ?
            AND a.id IN (
              SELECT DISTINCT attendee_id FROM contact_conference_history
              WHERE series_id = ? AND conference_id != ?
            )
            AND NOT EXISTS (
              SELECT 1 FROM meetings m
              WHERE m.attendee_id = a.id AND m.conference_id = ? AND m.outcome = 'Held'
            )
          ORDER BY a.health_score DESC
          LIMIT 50`,
    args: [
      String(snap.series_id),
      conferenceId,
      String(snap.series_id),
      conferenceId,
      conferenceId,
    ],
  });

  return NextResponse.json({
    conference_id: Number(snap.conference_id),
    conference_name: String(snap.conference_name),
    start_date: String(snap.start_date ?? ''),
    series_name: String(snap.series_name),
    series_id: String(snap.series_id),
    saturation_score: Number(snap.saturation_score),
    contacts_total: Number(snap.contacts_total),
    contacts_net_new: Number(snap.contacts_net_new),
    contacts_returning: Number(snap.contacts_returning),
    meetings_held: Number(snap.meetings_held),
    substitutable_count: Number(snap.substitutable_count),
    health_green: Number(snap.health_green),
    health_amber: Number(snap.health_amber),
    health_red: Number(snap.health_red),
    companies_total: Number(snap.companies_total),
    companies_returning: Number(snap.companies_returning),
    computed_at: String(snap.computed_at ?? ''),
    substitutable_contacts: substitutableRes.rows.map(r => ({
      attendee_id: Number(r.attendee_id),
      name: String(r.name ?? ''),
      title: String(r.title ?? ''),
      company_name: String(r.company_name ?? ''),
      health_score: Number(r.health_score ?? 0),
      times_seen: Number(r.times_seen ?? 1),
    })),
  });
}
