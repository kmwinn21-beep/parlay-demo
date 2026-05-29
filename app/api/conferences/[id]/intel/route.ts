import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getDb } from '@/lib/getDb';

export const maxDuration = 30;

export interface CompanyIntelRow {
  company_id: number;
  company_name: string;
  tier: string;
  summary: string | null;
  pain_point_signals: string[];
  trigger_events: string[];
  buying_signals: string[];
  opening_angles: string[];
  used_icp_fallback: boolean;
  generated_at: string | null;
  attendees: { id: number; first_name: string; last_name: string; title: string | null; seniority: string | null }[];
  rep_names: string[];
}

export interface IntelData {
  intel: CompanyIntelRow[];
  refresh_count: number;
  last_refresh_at: string | null;
}

function tryParseJson<T>(val: string | null | undefined, fallback: T): T {
  if (!val) return fallback;
  try { return JSON.parse(val) as T; } catch { return fallback; }
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;

  const { id } = await params;
  const conferenceId = parseInt(id);
  if (isNaN(conferenceId)) return NextResponse.json({ error: 'Invalid conference ID' }, { status: 400 });

  const db = await getDb(authResult.accountId);

  // Get conference refresh counts
  const confRow = await db.execute({
    sql: 'SELECT intel_refresh_count, intel_last_refresh_at FROM conferences WHERE id = ?',
    args: [conferenceId],
  }).catch(() => ({ rows: [] }));

  const refreshCount = confRow.rows.length > 0 ? Number(confRow.rows[0].intel_refresh_count ?? 0) : 0;
  const lastRefreshAt = confRow.rows.length > 0 ? (confRow.rows[0].intel_last_refresh_at as string | null) : null;

  // Get all stored intel for this conference
  const intelRows = await db.execute({
    sql: `SELECT company_id, company_name, tier, summary, pain_point_signals, trigger_events,
                 buying_signals, opening_angles, used_icp_fallback, generated_at
          FROM conference_company_intel WHERE conference_id = ? ORDER BY tier, company_name`,
    args: [conferenceId],
  }).catch(() => ({ rows: [] }));

  if (intelRows.rows.length === 0) {
    return NextResponse.json({ intel: [], refresh_count: refreshCount, last_refresh_at: lastRefreshAt } as IntelData);
  }

  const companyIds = intelRows.rows.map(r => Number(r.company_id));

  // Get attendees for these companies at this conference
  const attendeeRows = await db.execute({
    sql: `SELECT a.id, a.first_name, a.last_name, a.title, a.seniority, ca.company_id
          FROM attendees a
          JOIN conference_attendees ca ON ca.attendee_id = a.id AND ca.conference_id = ?
          WHERE ca.company_id IN (${companyIds.map(() => '?').join(',')})
          ORDER BY a.seniority, a.last_name`,
    args: [conferenceId, ...companyIds],
  }).catch(() => ({ rows: [] }));

  // Get rep assignments
  const repRows = await db.execute({
    sql: `SELECT ca.company_id, u.display_name
          FROM company_assignments ca
          JOIN users u ON u.id = ca.user_id
          WHERE ca.company_id IN (${companyIds.map(() => '?').join(',')})`,
    args: [...companyIds],
  }).catch(() => ({ rows: [] }));

  const attendeesByCompany = new Map<number, { id: number; first_name: string; last_name: string; title: string | null; seniority: string | null }[]>();
  for (const r of attendeeRows.rows) {
    const cid = Number(r.company_id);
    if (!attendeesByCompany.has(cid)) attendeesByCompany.set(cid, []);
    attendeesByCompany.get(cid)!.push({
      id: Number(r.id),
      first_name: String(r.first_name),
      last_name: String(r.last_name),
      title: r.title as string | null,
      seniority: r.seniority as string | null,
    });
  }

  const repsByCompany = new Map<number, string[]>();
  for (const r of repRows.rows) {
    const cid = Number(r.company_id);
    if (!repsByCompany.has(cid)) repsByCompany.set(cid, []);
    repsByCompany.get(cid)!.push(String(r.display_name));
  }

  const intel: CompanyIntelRow[] = intelRows.rows.map(r => ({
    company_id: Number(r.company_id),
    company_name: String(r.company_name),
    tier: String(r.tier),
    summary: r.summary as string | null,
    pain_point_signals: tryParseJson<string[]>(r.pain_point_signals as string | null, []),
    trigger_events: tryParseJson<string[]>(r.trigger_events as string | null, []),
    buying_signals: tryParseJson<string[]>(r.buying_signals as string | null, []),
    opening_angles: tryParseJson<string[]>(r.opening_angles as string | null, []),
    used_icp_fallback: Boolean(r.used_icp_fallback),
    generated_at: r.generated_at as string | null,
    attendees: attendeesByCompany.get(Number(r.company_id)) ?? [],
    rep_names: repsByCompany.get(Number(r.company_id)) ?? [],
  }));

  return NextResponse.json({ intel, refresh_count: refreshCount, last_refresh_at: lastRefreshAt } as IntelData);
}
