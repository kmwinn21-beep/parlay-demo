import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getDb } from '@/lib/getDb';
import { generateCompanyIntel } from '@/lib/intel/generateCompanyIntel';
import { intelProcessingState, stateKey, type ProcessingState } from '@/lib/intel/intelState';

export const maxDuration = 300;

const MAX_REFRESHES = 5;
const BATCH_SIZE = 5;

function tryParseJson<T>(val: string | null | undefined, fallback: T): T {
  if (!val) return fallback;
  try { return JSON.parse(val) as T; } catch { return fallback; }
}

function parseIdList(raw: unknown): number[] {
  if (!raw) return [];
  return String(raw).split(',').map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n) && n > 0);
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;

  const { id } = await params;
  const conferenceId = parseInt(id);
  if (isNaN(conferenceId)) return NextResponse.json({ error: 'Invalid conference ID' }, { status: 400 });

  try {
    const db = await getDb(authResult.accountId);

    // Check refresh count — catch in case column doesn't exist yet on this tenant DB
    const confRow = await db.execute({
      sql: 'SELECT intel_refresh_count FROM conferences WHERE id = ?',
      args: [conferenceId],
    }).catch(() => ({ rows: [] as Record<string, unknown>[] }));
    const refreshCount = confRow.rows.length > 0 ? Number(confRow.rows[0].intel_refresh_count ?? 0) : 0;
    if (refreshCount >= MAX_REFRESHES) {
      return NextResponse.json({ error: `Maximum of ${MAX_REFRESHES} bulk refreshes reached.` }, { status: 429 });
    }

    const key = stateKey(authResult.accountId ?? 'global', conferenceId);
    const existing = intelProcessingState.get(key);
    if (existing?.status === 'running') {
      return NextResponse.json({ error: 'Already running', state: existing }, { status: 409 });
    }

    // Get all target companies for this conference (from conference_targets)
    const targetCompanyRows = await db.execute({
      sql: `SELECT DISTINCT ca.company_id, c.name as company_name, c.company_type, c.industry, c.wse,
                  c.assigned_user, ct.tier
            FROM conference_targets ct
            JOIN attendees a ON a.id = ct.attendee_id
            JOIN conference_attendees ca ON ca.attendee_id = a.id AND ca.conference_id = ct.conference_id
            JOIN companies c ON c.id = ca.company_id
            WHERE ct.conference_id = ? AND ca.company_id IS NOT NULL
            ORDER BY ct.tier, c.name`,
      args: [conferenceId],
    });

    if (targetCompanyRows.rows.length === 0) {
      return NextResponse.json({ error: 'No target companies found. Add targets in the Target Recommendations tab first.' }, { status: 400 });
    }

    // Collect all user IDs from company assigned_user fields to resolve names
    const allUserIds = new Set<number>();
    for (const r of targetCompanyRows.rows) {
      for (const uid of parseIdList(r.assigned_user)) allUserIds.add(uid);
    }
    const userNameMap = new Map<number, string>();
    if (allUserIds.size > 0) {
      const uidArr = Array.from(allUserIds);
      const userRows = await db.execute({
        sql: `SELECT id, display_name FROM users WHERE id IN (${uidArr.map(() => '?').join(',')})`,
        args: uidArr,
      }).catch(() => ({ rows: [] as Record<string, unknown>[] }));
      for (const r of userRows.rows) userNameMap.set(Number(r.id), String(r.display_name));
    }

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

    // Get company info from brand settings
    const brandRows = await db.execute({
      sql: `SELECT key, value FROM site_settings WHERE key LIKE 'company_info_%'`,
      args: [],
    });
    const brandSettings: Record<string, string> = {};
    for (const r of brandRows.rows) brandSettings[String(r.key)] = String(r.value);

    // Get attendees for all these companies
    const companyIds = Array.from(new Set(targetCompanyRows.rows.map(r => Number(r.company_id))));
    const attendeeRows = await db.execute({
      sql: `SELECT a.id, a.first_name, a.last_name, a.title, a.seniority, ca.company_id
            FROM attendees a
            JOIN conference_attendees ca ON ca.attendee_id = a.id AND ca.conference_id = ?
            WHERE ca.company_id IN (${companyIds.map(() => '?').join(',')})`,
      args: [conferenceId, ...companyIds],
    });

    const attendeesByCompany = new Map<number, { first_name: string; last_name: string; title: string | null; seniority: string | null }[]>();
    for (const r of attendeeRows.rows) {
      const cid = Number(r.company_id);
      if (!attendeesByCompany.has(cid)) attendeesByCompany.set(cid, []);
      attendeesByCompany.get(cid)!.push({
        first_name: String(r.first_name),
        last_name: String(r.last_name),
        title: r.title as string | null,
        seniority: r.seniority as string | null,
      });
    }

    // Deduplicate by company_id (take first tier seen = highest priority due to ORDER BY)
    const seen = new Set<number>();
    const companies: Array<{
      company_id: number; company_name: string; company_type: string | null;
      industry: string | null; wse: number | null; tier: string; repNames: string[];
    }> = [];
    for (const r of targetCompanyRows.rows) {
      const cid = Number(r.company_id);
      if (!seen.has(cid)) {
        seen.add(cid);
        const repNames = parseIdList(r.assigned_user).map(uid => userNameMap.get(uid) ?? String(uid));
        companies.push({
          company_id: cid,
          company_name: String(r.company_name),
          company_type: r.company_type as string | null,
          industry: r.industry as string | null,
          wse: r.wse ? Number(r.wse) : null,
          tier: String(r.tier),
          repNames,
        });
      }
    }

    const state: ProcessingState = {
      status: 'running',
      total: companies.length,
      completed: 0,
      startedAt: Date.now(),
    };
    intelProcessingState.set(key, state);

    // Increment refresh count and update timestamp
    await db.execute({
      sql: `UPDATE conferences SET intel_refresh_count = COALESCE(intel_refresh_count, 0) + 1, intel_last_refresh_at = datetime('now') WHERE id = ?`,
      args: [conferenceId],
    }).catch(() => {});

    // Fire-and-forget background processing
    (async () => {
      try {
        for (let i = 0; i < companies.length; i += BATCH_SIZE) {
          const batch = companies.slice(i, i + BATCH_SIZE);
          await Promise.all(batch.map(async company => {
            try {
              const result = await generateCompanyIntel({
                companyName: company.company_name,
                companyType: company.company_type,
                industry: company.industry,
                wse: company.wse,
                tier: company.tier,
                attendees: attendeesByCompany.get(company.company_id) ?? [],
                repNames: company.repNames,
                icpPainPoints,
                icpTriggerEvents,
                companyInfoName: brandSettings['company_info_name'] || null,
                companyInfoIndustries: brandSettings['company_info_industries'] || null,
              });

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
                  conferenceId, company.company_id, company.company_name, company.tier,
                  result.summary,
                  JSON.stringify(result.pain_point_signals),
                  JSON.stringify(result.trigger_events),
                  JSON.stringify(result.buying_signals),
                  JSON.stringify(result.opening_angles),
                  result.used_icp_fallback ? 1 : 0,
                ],
              });
            } catch {
              // Don't fail the whole batch for one company
            }
            state.completed++;
          }));

          if (i + BATCH_SIZE < companies.length) {
            await new Promise(r => setTimeout(r, 500));
          }
        }
        state.status = 'done';
      } catch (err) {
        state.status = 'error';
        state.error = err instanceof Error ? err.message : 'Unknown error';
      }
    })();

    return NextResponse.json({ ok: true, total: companies.length, state });
  } catch (err) {
    console.error('[intel/generate-all]', err);
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Internal server error' }, { status: 500 });
  }
}
