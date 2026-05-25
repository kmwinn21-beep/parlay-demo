import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getDb } from '@/lib/getDb';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const authResult = await requireAuth(request);
  if (authResult instanceof Response) return authResult;
  const db = await getDb(authResult.accountId);

  // Query 1: Per-conference attendee/company/ICP metrics
  const confMetrics = await db.execute(`
    SELECT
      c.id,
      c.name,
      c.start_date,
      COUNT(DISTINCT ca.attendee_id) as total_attendees,
      COUNT(DISTINCT a.company_id) as total_companies,
      COUNT(DISTINCT CASE WHEN co.icp = 'Yes' THEN a.company_id ELSE NULL END) as icp_companies
    FROM conferences c
    LEFT JOIN conference_attendees ca ON ca.conference_id = c.id
    LEFT JOIN attendees a ON a.id = ca.attendee_id AND a.company_id IS NOT NULL
    LEFT JOIN companies co ON co.id = a.company_id
    GROUP BY c.id, c.name, c.start_date
    ORDER BY c.start_date DESC
  `);

  // Query 2: Company overlap - companies appearing in multiple conferences
  const overlapRows = await db.execute(`
    SELECT
      co.id,
      co.name,
      co.icp,
      COUNT(DISTINCT ca.conference_id) as conf_count
    FROM companies co
    JOIN attendees a ON a.company_id = co.id
    JOIN conference_attendees ca ON ca.attendee_id = a.id
    GROUP BY co.id, co.name, co.icp
    HAVING conf_count > 1
    ORDER BY conf_count DESC
    LIMIT 25
  `);

  // Query 3: Portfolio seniority mix
  const seniorityRows = await db.execute(`
    SELECT
      COALESCE(a.seniority, 'Unknown') as seniority,
      COUNT(*) as count
    FROM conference_attendees ca
    JOIN attendees a ON a.id = ca.attendee_id
    GROUP BY a.seniority
    ORDER BY count DESC
  `);

  const conferences = confMetrics.rows.map(r => {
    const total = Number(r.total_companies ?? 0);
    const icp = Number(r.icp_companies ?? 0);
    return {
      id: Number(r.id),
      name: String(r.name),
      start_date: String(r.start_date),
      total_attendees: Number(r.total_attendees ?? 0),
      total_companies: total,
      icp_companies: icp,
      icp_density_pct: total > 0 ? Math.round(icp / total * 100) : 0,
    };
  });

  const avgIcpDensity = conferences.length
    ? Math.round(conferences.reduce((s, c) => s + c.icp_density_pct, 0) / conferences.length)
    : 0;

  return NextResponse.json({
    conferences,
    avgIcpDensity,
    totalConferences: conferences.length,
    companyOverlap: overlapRows.rows.map(r => ({
      id: Number(r.id),
      name: String(r.name),
      icp: String(r.icp ?? 'No'),
      conf_count: Number(r.conf_count),
    })),
    seniorityMix: seniorityRows.rows.map(r => ({
      seniority: String(r.seniority),
      count: Number(r.count),
    })),
  });
}
