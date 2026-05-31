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
  is_fallback: boolean;
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

function parseIdList(raw: unknown): number[] {
  if (!raw) return [];
  return String(raw).split(',').map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n) && n > 0);
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;

  const { id } = await params;
  const conferenceId = parseInt(id);
  if (isNaN(conferenceId)) return NextResponse.json({ error: 'Invalid conference ID' }, { status: 400 });

  try {
    const db = await getDb(authResult.accountId);

    // Lightweight poll path — single query when polling for one company's status
    const pollCompanyId = request.nextUrl.searchParams.get('company_id');
    if (pollCompanyId) {
      const cid = parseInt(pollCompanyId, 10);
      if (isNaN(cid)) return NextResponse.json({ error: 'Invalid company_id' }, { status: 400 });
      const row = await db.execute({
        sql: `SELECT summary, is_fallback, generated_at FROM conference_company_intel WHERE conference_id = ? AND company_id = ? LIMIT 1`,
        args: [conferenceId, cid],
      }).catch(() => ({ rows: [] as Record<string, unknown>[] }));
      if (row.rows.length === 0) return NextResponse.json({ summary: null, is_fallback: 0, generated_at: null });
      const r = row.rows[0];
      return NextResponse.json({ summary: r.summary ?? null, is_fallback: r.is_fallback ?? 0, generated_at: r.generated_at ?? null });
    }

    // Get conference refresh counts — catch in case column doesn't exist yet
    const confRow = await db.execute({
      sql: 'SELECT intel_refresh_count, intel_last_refresh_at FROM conferences WHERE id = ?',
      args: [conferenceId],
    }).catch(() => ({ rows: [] as Record<string, unknown>[] }));

    const refreshCount = confRow.rows.length > 0 ? Number(confRow.rows[0].intel_refresh_count ?? 0) : 0;
    const lastRefreshAt = confRow.rows.length > 0 ? (confRow.rows[0].intel_last_refresh_at as string | null) : null;

    // Get all stored intel for this conference
    const intelRows = await db.execute({
      sql: `SELECT company_id, company_name, tier, summary, pain_point_signals, trigger_events,
                   buying_signals, opening_angles, used_icp_fallback, is_fallback, generated_at
            FROM conference_company_intel WHERE conference_id = ? ORDER BY tier, company_name`,
      args: [conferenceId],
    }).catch(() => ({ rows: [] as Record<string, unknown>[] }));

    if (intelRows.rows.length === 0) {
      return NextResponse.json({ intel: [], refresh_count: refreshCount, last_refresh_at: lastRefreshAt } as IntelData);
    }

    const companyIds = intelRows.rows.map(r => Number(r.company_id));

    // Get company assigned_user to resolve rep names
    const companyRows = await db.execute({
      sql: `SELECT id, assigned_user FROM companies WHERE id IN (${companyIds.map(() => '?').join(',')})`,
      args: [...companyIds],
    }).catch(() => ({ rows: [] as Record<string, unknown>[] }));

    // Collect all user IDs
    const allUserIds = new Set<number>();
    const assignedByCompany = new Map<number, number[]>();
    for (const r of companyRows.rows) {
      const uids = parseIdList(r.assigned_user);
      assignedByCompany.set(Number(r.id), uids);
      uids.forEach(uid => allUserIds.add(uid));
    }

    const userNameMap = new Map<number, string>();
    if (allUserIds.size > 0) {
      const uidArr = Array.from(allUserIds);
      const userRows = await db.execute({
        sql: `SELECT config_id, display_name FROM users WHERE config_id IN (${uidArr.map(() => '?').join(',')})`,
        args: uidArr,
      }).catch(() => ({ rows: [] as Record<string, unknown>[] }));
      for (const r of userRows.rows) userNameMap.set(Number(r.config_id), String(r.display_name));
    }

    // Get attendees for these companies at this conference
    const attendeeRows = await db.execute({
      sql: `SELECT a.id, a.first_name, a.last_name, a.title, a.seniority, a.company_id
            FROM attendees a
            JOIN conference_attendees ca ON ca.attendee_id = a.id AND ca.conference_id = ?
            WHERE a.company_id IN (${companyIds.map(() => '?').join(',')})
            ORDER BY a.last_name`,
      args: [conferenceId, ...companyIds],
    }).catch(() => ({ rows: [] as Record<string, unknown>[] }));

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

    const intel: CompanyIntelRow[] = intelRows.rows.map(r => {
      const cid = Number(r.company_id);
      const uids = assignedByCompany.get(cid) ?? [];
      return {
        company_id: cid,
        company_name: String(r.company_name),
        tier: String(r.tier),
        summary: r.summary as string | null,
        pain_point_signals: tryParseJson<string[]>(r.pain_point_signals as string | null, []),
        trigger_events: tryParseJson<string[]>(r.trigger_events as string | null, []),
        buying_signals: tryParseJson<string[]>(r.buying_signals as string | null, []),
        opening_angles: tryParseJson<string[]>(r.opening_angles as string | null, []),
        used_icp_fallback: Boolean(r.used_icp_fallback),
        is_fallback: Boolean(r.is_fallback),
        generated_at: r.generated_at as string | null,
        attendees: attendeesByCompany.get(cid) ?? [],
        rep_names: uids.map(uid => userNameMap.get(uid)).filter(Boolean) as string[],
      };
    });

    return NextResponse.json({ intel, refresh_count: refreshCount, last_refresh_at: lastRefreshAt } as IntelData);
  } catch (err) {
    console.error('[intel GET]', err);
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Internal server error' }, { status: 500 });
  }
}
