import { NextRequest, NextResponse } from 'next/server';
import { waitUntil } from '@vercel/functions';
import { requireAuth } from '@/lib/auth';
import { getDb } from '@/lib/getDb';
import { generateCompanyIntel } from '@/lib/intel/generateCompanyIntel';
import { intelProcessingState, stateKey, type ProcessingState } from '@/lib/intel/intelState';

export const maxDuration = 300;

const MAX_REFRESHES = 25;
const PARALLEL_SIZE = 5; // simultaneous web-search calls for priority companies
const PRIORITY_TIERS = new Set(['must_target', 'high_priority']);
const VALID_TIERS = new Set(['must_target', 'high_priority', 'worth_engaging', 'monitor']);

function tryParseJson<T>(val: string | null | undefined, fallback: T): T {
  if (!val) return fallback;
  try { return JSON.parse(val) as T; } catch { return fallback; }
}

function parseIdList(raw: unknown): number[] {
  if (!raw) return [];
  return String(raw).split(',').map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n) && n > 0);
}

// Map targeting tier keys to display labels used in intel cards
function tierKeyToLabel(key: string): string {
  switch (key) {
    case 'must_target':   return 'Must Target';
    case 'high_priority': return 'High Priority';
    case 'worth_engaging': return 'Worth Engaging';
    case 'monitor':       return 'Monitor';
    default:              return key;
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;

  const { id } = await params;
  const conferenceId = parseInt(id);
  if (isNaN(conferenceId)) return NextResponse.json({ error: 'Invalid conference ID' }, { status: 400 });

  try {
    const db = await getDb(authResult.accountId);

    // Check refresh count
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

    // Fetch all scored companies from the targeting API (same data as Target Recommendations tab)
    const origin = request.nextUrl.origin;
    const targetingRes = await fetch(
      `${origin}/api/conferences/${conferenceId}/targeting`,
      { headers: { cookie: request.headers.get('cookie') ?? '' } }
    );

    if (!targetingRes.ok) {
      return NextResponse.json({ error: 'Failed to load targeting data. Make sure the conference has attendees.' }, { status: 400 });
    }

    const targetingData = await targetingRes.json() as {
      companies?: Array<{
        company_id: number;
        company_name: string;
        wse: number | null;
        target_priority_tier_key: string;
      }>;
    };

    const allCompanies = (targetingData.companies ?? []).filter(c =>
      VALID_TIERS.has(c.target_priority_tier_key)
    );

    if (allCompanies.length === 0) {
      return NextResponse.json({ error: 'No scored companies found. Run Target Recommendations first to score companies.' }, { status: 400 });
    }

    // Fetch full company details (type, industry, assigned_user) from DB
    const scoredIds = allCompanies.map(c => c.company_id);
    const companyDetailRows = await db.execute({
      sql: `SELECT id, company_type, industry, assigned_user FROM companies WHERE id IN (${scoredIds.map(() => '?').join(',')})`,
      args: [...scoredIds],
    }).catch(() => ({ rows: [] as Record<string, unknown>[] }));
    const companyDetails = new Map(
      companyDetailRows.rows.map(r => [Number(r.id), r as Record<string, unknown>])
    );

    // Collect user IDs for rep name resolution
    const allUserIds = new Set<number>();
    for (const r of companyDetailRows.rows) {
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

    // Get attendees for all companies at this conference (targeting API may include them, but fetch fresh)
    const companyIds = allCompanies.map(c => c.company_id);
    const attendeeRows = await db.execute({
      sql: `SELECT a.id, a.first_name, a.last_name, a.title, a.seniority, a.company_id
            FROM attendees a
            JOIN conference_attendees ca ON ca.attendee_id = a.id AND ca.conference_id = ?
            WHERE a.company_id IN (${companyIds.map(() => '?').join(',')})`,
      args: [conferenceId, ...companyIds],
    }).catch(() => ({ rows: [] as Record<string, unknown>[] }));

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

    const allMapped = allCompanies.map(c => {
      const detail = companyDetails.get(c.company_id);
      return {
        company_id: c.company_id,
        company_name: c.company_name,
        company_type: detail ? (detail.company_type as string | null) : null,
        industry: detail ? (detail.industry as string | null) : null,
        wse: c.wse,
        tier: tierKeyToLabel(c.target_priority_tier_key),
        tierKey: c.target_priority_tier_key,
        repNames: detail ? parseIdList(detail.assigned_user).map(uid => userNameMap.get(uid) ?? String(uid)) : [],
      };
    });

    // Priority companies get auto-generated with web search; standard companies get instant stubs only
    const priorityCompanies = allMapped.filter(c => PRIORITY_TIERS.has(c.tierKey));
    const standardCompanies = allMapped.filter(c => !PRIORITY_TIERS.has(c.tierKey));

    const state: ProcessingState = {
      status: 'running',
      total: priorityCompanies.length,
      completed: 0,
      startedAt: Date.now(),
    };
    intelProcessingState.set(key, state);

    // Write stubs for all standard companies immediately (no Claude call — available for manual refresh)
    const STUB_SQL = `INSERT INTO conference_company_intel
      (conference_id, company_id, company_name, tier, summary, pain_point_signals, trigger_events, buying_signals, opening_angles, used_icp_fallback, generated_at)
    VALUES (?, ?, ?, ?, NULL, '[]', '[]', '[]', '[]', 0, datetime('now'))
    ON CONFLICT(conference_id, company_id) DO UPDATE SET
      company_name = excluded.company_name,
      tier = excluded.tier`;

    // Ensure table exists before writing stubs
    await db.execute({
      sql: `CREATE TABLE IF NOT EXISTS conference_company_intel (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        conference_id INTEGER NOT NULL REFERENCES conferences(id) ON DELETE CASCADE,
        company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        company_name TEXT NOT NULL,
        tier TEXT NOT NULL,
        summary TEXT,
        pain_point_signals TEXT,
        trigger_events TEXT,
        buying_signals TEXT,
        opening_angles TEXT,
        used_icp_fallback INTEGER DEFAULT 0,
        generated_at TEXT DEFAULT (datetime('now')),
        UNIQUE(conference_id, company_id)
      )`,
      args: [],
    }).catch(() => {});

    for (const company of standardCompanies) {
      await db.execute({ sql: STUB_SQL, args: [conferenceId, company.company_id, company.company_name, company.tier] }).catch(() => {});
    }

    // Increment refresh count and mark job as running (DB-persisted so all worker instances can read it)
    await db.execute({
      sql: `UPDATE conferences SET
        intel_refresh_count = COALESCE(intel_refresh_count, 0) + 1,
        intel_last_refresh_at = datetime('now'),
        intel_job_status = 'running',
        intel_job_completed = 0,
        intel_job_total = ?
      WHERE id = ?`,
      args: [priorityCompanies.length, conferenceId],
    }).catch(() => {});

    // Keep the Vercel function alive until background processing completes
    // Only processes priority companies (Must Target + High Priority) with web search
    waitUntil((async () => {
      try {
        await db.execute({
          sql: `CREATE INDEX IF NOT EXISTS idx_conf_company_intel_conf ON conference_company_intel(conference_id)`,
          args: [],
        }).catch(() => {});

        // Process priority companies in parallel batches with web search
        for (let i = 0; i < priorityCompanies.length; i += PARALLEL_SIZE) {
          const batch = priorityCompanies.slice(i, i + PARALLEL_SIZE);

          // Write 'Generating…' stubs for this batch
          for (const company of batch) {
            await db.execute({
              sql: `INSERT INTO conference_company_intel
                      (conference_id, company_id, company_name, tier, summary, pain_point_signals, trigger_events, buying_signals, opening_angles, used_icp_fallback, is_fallback, generated_at)
                    VALUES (?, ?, ?, ?, 'Generating…', '[]', '[]', '[]', '[]', 0, 0, datetime('now'))
                    ON CONFLICT(conference_id, company_id) DO UPDATE SET
                      company_name = excluded.company_name,
                      tier = excluded.tier,
                      summary = 'Generating…',
                      pain_point_signals = '[]',
                      trigger_events = '[]',
                      buying_signals = '[]',
                      opening_angles = '[]',
                      is_fallback = 0,
                      generated_at = excluded.generated_at`,
              args: [conferenceId, company.company_id, company.company_name, company.tier],
            }).catch(() => {});
          }

          // Run web-search Claude calls in parallel
          await Promise.all(batch.map(async (company) => {
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
                        (conference_id, company_id, company_name, tier, summary, pain_point_signals, trigger_events, buying_signals, opening_angles, used_icp_fallback, is_fallback, generated_at)
                      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
                      ON CONFLICT(conference_id, company_id) DO UPDATE SET
                        company_name = excluded.company_name,
                        tier = excluded.tier,
                        summary = excluded.summary,
                        pain_point_signals = excluded.pain_point_signals,
                        trigger_events = excluded.trigger_events,
                        buying_signals = excluded.buying_signals,
                        opening_angles = excluded.opening_angles,
                        used_icp_fallback = excluded.used_icp_fallback,
                        is_fallback = excluded.is_fallback,
                        generated_at = excluded.generated_at`,
                args: [
                  conferenceId, company.company_id, company.company_name, company.tier,
                  result.summary,
                  JSON.stringify(result.pain_point_signals),
                  JSON.stringify(result.trigger_events),
                  JSON.stringify(result.buying_signals),
                  JSON.stringify(result.opening_angles),
                  result.used_icp_fallback ? 1 : 0,
                  result.is_fallback ? 1 : 0,
                ],
              }).catch(() => {});
            } catch (err) {
              console.error('[intel/generate-all] background error for company', company.company_id, ':', err);
              await db.execute({
                sql: `UPDATE conference_company_intel SET summary = 'Error: generation failed', is_fallback = 1 WHERE conference_id = ? AND company_id = ?`,
                args: [conferenceId, company.company_id],
              }).catch(() => {});
            }
            state.completed++;
          }));

          // Write progress to DB after each batch so all worker instances see it
          await db.execute({
            sql: `UPDATE conferences SET intel_job_completed = ? WHERE id = ?`,
            args: [state.completed, conferenceId],
          }).catch(() => {});
        }

        state.status = 'done';
        await db.execute({
          sql: `UPDATE conferences SET intel_job_status = 'done', intel_job_completed = ? WHERE id = ?`,
          args: [state.completed, conferenceId],
        }).catch(() => {});
      } catch (err) {
        state.status = 'error';
        state.error = err instanceof Error ? err.message : 'Unknown error';
        await db.execute({
          sql: `UPDATE conferences SET intel_job_status = 'error' WHERE id = ?`,
          args: [conferenceId],
        }).catch(() => {});
      }
    })());

    return NextResponse.json({ ok: true, total: priorityCompanies.length, state });
  } catch (err) {
    console.error('[intel/generate-all]', err);
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Internal server error' }, { status: 500 });
  }
}
