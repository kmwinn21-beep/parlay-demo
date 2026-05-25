import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getDb } from '@/lib/getDb';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const authResult = await requireAuth(request);
  if (authResult instanceof Response) return authResult;
  const db = await getDb(authResult.accountId);
  const conferenceId = Number(params.id);
  if (isNaN(conferenceId)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  // Attendees with seniority + company ICP status for this conference
  const attendeeRows = await db.execute({
    sql: `
      SELECT
        a.id,
        a.first_name,
        a.last_name,
        a.title,
        COALESCE(a.seniority, 'Unknown') as seniority,
        co.name as company_name,
        co.icp as company_icp,
        a.company_id
      FROM conference_attendees ca
      JOIN attendees a ON a.id = ca.attendee_id
      LEFT JOIN companies co ON co.id = a.company_id
      WHERE ca.conference_id = ?
    `,
    args: [conferenceId],
  });

  // Meetings for this conference
  const meetingsRow = await db.execute({
    sql: `SELECT COUNT(*) as total FROM meetings WHERE conference_id = ?`,
    args: [conferenceId],
  });

  // Company cross-conference presence: company_type + conference names list
  const crossConfRows = await db.execute({
    sql: `
      SELECT
        co.id,
        co.name,
        co.icp,
        co.company_type,
        COUNT(DISTINCT ca2.conference_id) as total_confs,
        GROUP_CONCAT(DISTINCT c2.name) as conference_names
      FROM conference_attendees ca
      JOIN attendees a ON a.id = ca.attendee_id AND a.company_id IS NOT NULL
      JOIN companies co ON co.id = a.company_id
      JOIN attendees a2 ON a2.company_id = co.id
      JOIN conference_attendees ca2 ON ca2.attendee_id = a2.id
      JOIN conferences c2 ON c2.id = ca2.conference_id
      WHERE ca.conference_id = ?
      GROUP BY co.id, co.name, co.icp, co.company_type
      ORDER BY total_confs DESC, co.name ASC
    `,
    args: [conferenceId],
  });

  // Primary company type label
  const primaryTypeRows = await db.execute(`
    SELECT value FROM config_options
    WHERE category = 'company_type' AND is_primary = 1
    LIMIT 1
  `);
  const primaryCompanyType = primaryTypeRows.rows.length > 0
    ? String(primaryTypeRows.rows[0].value)
    : null;

  // Seniority breakdown for this conference
  const seniorityBreakdown: Record<string, number> = {};
  for (const r of attendeeRows.rows) {
    const s = String(r.seniority);
    seniorityBreakdown[s] = (seniorityBreakdown[s] ?? 0) + 1;
  }

  // Title keyword frequency
  const STOP_WORDS = new Set(['of', 'and', 'the', 'a', 'an', 'in', 'at', 'to', 'for', 'on', 'with', 'by', 'or', 'de', 'du', 'la', 'le', 'senior', 'junior', 'associate', 'assistant', 'executive', 'global', 'head', 'chief', 'principal']);
  const titleWords: Record<string, number> = {};
  for (const r of attendeeRows.rows) {
    if (!r.title) continue;
    const words = String(r.title).toLowerCase().replace(/[^a-z\s]/g, '').split(/\s+/).filter(w => w.length > 2 && !STOP_WORDS.has(w));
    for (const word of words) {
      titleWords[word] = (titleWords[word] ?? 0) + 1;
    }
  }
  const topTitleWords = Object.entries(titleWords)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([word, count]) => ({ word, count }));

  const totalAttendees = attendeeRows.rows.length;
  const uniqueCompanies = new Set(attendeeRows.rows.filter(r => r.company_id).map(r => Number(r.company_id)));
  const icpCompanies = new Set(attendeeRows.rows.filter(r => r.company_icp === 'Yes' && r.company_id).map(r => Number(r.company_id)));
  const meetingsTotal = Number((meetingsRow.rows[0] as { total?: unknown })?.total ?? 0);

  return NextResponse.json({
    totalAttendees,
    totalCompanies: uniqueCompanies.size,
    icpCompanies: icpCompanies.size,
    icpDensityPct: uniqueCompanies.size > 0 ? Math.round(icpCompanies.size / uniqueCompanies.size * 100) : 0,
    meetingsTotal,
    primaryCompanyType,
    seniorityBreakdown: Object.entries(seniorityBreakdown).sort((a, b) => b[1] - a[1]).map(([seniority, count]) => ({ seniority, count })),
    titleKeywords: topTitleWords,
    crossConfPresence: crossConfRows.rows.map(r => ({
      id: Number(r.id),
      name: String(r.name),
      icp: String(r.icp ?? 'No'),
      company_type: r.company_type ? String(r.company_type) : null,
      total_confs: Number(r.total_confs),
      conference_names: r.conference_names ? String(r.conference_names).split(',') : [],
    })),
  });
}
