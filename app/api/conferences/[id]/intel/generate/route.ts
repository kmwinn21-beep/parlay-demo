import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getDb } from '@/lib/getDb';
import { generateCompanyIntel } from '@/lib/intel/generateCompanyIntel';

export const maxDuration = 120;

function tryParseJson<T>(val: string | null | undefined, fallback: T): T {
  if (!val) return fallback;
  try { return JSON.parse(val) as T; } catch { return fallback; }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;

  const { id } = await params;
  const conferenceId = parseInt(id);
  if (isNaN(conferenceId)) return NextResponse.json({ error: 'Invalid conference ID' }, { status: 400 });

  const body = await request.json() as { company_id: number };
  const companyId = body.company_id;
  if (!companyId) return NextResponse.json({ error: 'company_id required' }, { status: 400 });

  const db = await getDb(authResult.accountId);

  // Get company info
  const companyRow = await db.execute({
    sql: 'SELECT id, name, company_type, industry, wse FROM companies WHERE id = ?',
    args: [companyId],
  });
  if (companyRow.rows.length === 0) return NextResponse.json({ error: 'Company not found' }, { status: 404 });
  const company = companyRow.rows[0];

  // Get tier for this company at this conference (from conference_targets)
  const tierRow = await db.execute({
    sql: `SELECT tier FROM conference_targets ct
          JOIN attendees a ON a.id = ct.attendee_id
          JOIN conference_attendees ca ON ca.attendee_id = a.id AND ca.conference_id = ct.conference_id
          WHERE ct.conference_id = ? AND ca.company_id = ?
          LIMIT 1`,
    args: [conferenceId, companyId],
  });
  const tier = tierRow.rows.length > 0 ? String(tierRow.rows[0].tier) : 'Monitor';

  // Get attendees
  const attendeeRows = await db.execute({
    sql: `SELECT a.id, a.first_name, a.last_name, a.title, a.seniority
          FROM attendees a
          JOIN conference_attendees ca ON ca.attendee_id = a.id
          WHERE ca.conference_id = ? AND ca.company_id = ?
          ORDER BY a.seniority, a.last_name`,
    args: [conferenceId, companyId],
  });
  const attendees = attendeeRows.rows.map(r => ({
    first_name: String(r.first_name),
    last_name: String(r.last_name),
    title: r.title as string | null,
    seniority: r.seniority as string | null,
  }));

  // Get rep names
  const repRows = await db.execute({
    sql: `SELECT u.display_name FROM company_assignments ca JOIN users u ON u.id = ca.user_id WHERE ca.company_id = ?`,
    args: [companyId],
  });
  const repNames = repRows.rows.map(r => String(r.display_name));

  // Get ICP settings
  const icpRows = await db.execute({
    sql: `SELECT key, value FROM site_settings WHERE key LIKE 'icp_%'`,
    args: [],
  });
  const icpSettings: Record<string, string> = {};
  for (const r of icpRows.rows) icpSettings[String(r.key)] = String(r.value);

  const icpPainPoints = [
    ...tryParseJson<string[]>(icpSettings['icp_pain_points'], []),
    ...tryParseJson<{ title: string; description: string }[]>(icpSettings['icp_ai_pain_points'], []).map(p => p.title),
  ];
  const icpTriggerEvents = [
    ...tryParseJson<string[]>(icpSettings['icp_trigger_events'], []),
    ...tryParseJson<{ title: string; description: string }[]>(icpSettings['icp_ai_trigger_events'], []).map(t => t.title),
  ];

  // Get company info from brand settings (fallback)
  const brandRows = await db.execute({
    sql: `SELECT key, value FROM site_settings WHERE key LIKE 'company_info_%'`,
    args: [],
  });
  const brandSettings: Record<string, string> = {};
  for (const r of brandRows.rows) brandSettings[String(r.key)] = String(r.value);

  const result = await generateCompanyIntel({
    companyName: String(company.name),
    companyType: company.company_type as string | null,
    industry: company.industry as string | null,
    wse: company.wse ? Number(company.wse) : null,
    tier,
    attendees,
    repNames,
    icpPainPoints,
    icpTriggerEvents,
    companyInfoName: brandSettings['company_info_name'] || null,
    companyInfoIndustries: brandSettings['company_info_industries'] || null,
  });

  // Upsert into conference_company_intel
  await db.execute({
    sql: `INSERT INTO conference_company_intel
            (conference_id, company_id, company_name, tier, summary, pain_point_signals, trigger_events, buying_signals, opening_angles, used_icp_fallback, generated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
          ON CONFLICT(conference_id, company_id) DO UPDATE SET
            company_name = excluded.company_name,
            tier = excluded.tier,
            summary = excluded.summary,
            pain_point_signals = excluded.pain_point_signals,
            trigger_events = excluded.trigger_events,
            buying_signals = excluded.buying_signals,
            opening_angles = excluded.opening_angles,
            used_icp_fallback = excluded.used_icp_fallback,
            generated_at = excluded.generated_at`,
    args: [
      conferenceId, companyId, String(company.name), tier,
      result.summary,
      JSON.stringify(result.pain_point_signals),
      JSON.stringify(result.trigger_events),
      JSON.stringify(result.buying_signals),
      JSON.stringify(result.opening_angles),
      result.used_icp_fallback ? 1 : 0,
    ],
  });

  return NextResponse.json({ ok: true, company_id: companyId });
}
