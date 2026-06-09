import { NextRequest, NextResponse } from 'next/server';
import { waitUntil } from '@vercel/functions';
import { requireAuth } from '@/lib/auth';
import { getDb } from '@/lib/getDb';
import { generateCompanyIntel } from '@/lib/intel/generateCompanyIntel';
import { resolvePlanState } from '@/lib/trialState';
import { hasCapability } from '@/lib/capabilities';

export const maxDuration = 300;

function tryParseJson<T>(val: string | null | undefined, fallback: T): T {
  if (!val) return fallback;
  try { return JSON.parse(val) as T; } catch { return fallback; }
}

function parseIdList(raw: unknown): number[] {
  if (!raw) return [];
  return String(raw).split(',').map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n) && n > 0);
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const t0 = Date.now();
  console.log('[intel-timing] step: handler_start, elapsed: 0ms');

  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;

  const { id } = await params;
  const conferenceId = parseInt(id);
  if (isNaN(conferenceId)) return NextResponse.json({ error: 'Invalid conference ID' }, { status: 400 });

  try {
    const body = await request.json() as { company_id: number };
    const companyId = body.company_id;
    if (!companyId) return NextResponse.json({ error: 'company_id required' }, { status: 400 });

    const db = await getDb(authResult.accountId);

    const { planCapabilities } = await resolvePlanState(db);
    if (!hasCapability(planCapabilities, 'intelligence_core.company_intel')) {
      return NextResponse.json({ error: 'Upgrade required' }, { status: 403 });
    }

    // Run all independent queries in parallel — cuts sequential Turso round-trip overhead
    const [companyRow, tierRow, attendeeRows, icpRows, brandRows] = await Promise.all([
      db.execute({
        sql: 'SELECT id, name, company_type, industry, wse, assigned_user FROM companies WHERE id = ?',
        args: [companyId],
      }),
      db.execute({
        sql: `SELECT tier FROM conference_company_intel WHERE conference_id = ? AND company_id = ? LIMIT 1`,
        args: [conferenceId, companyId],
      }).catch(() => ({ rows: [] as Record<string, unknown>[] })),
      db.execute({
        sql: `SELECT a.id, a.first_name, a.last_name, a.title, a.seniority
              FROM attendees a
              JOIN conference_attendees ca ON ca.attendee_id = a.id AND ca.conference_id = ?
              WHERE a.company_id = ?
              ORDER BY a.seniority, a.last_name`,
        args: [conferenceId, companyId],
      }),
      db.execute({
        sql: `SELECT key, value FROM site_settings WHERE key LIKE 'icp_%'`,
        args: [],
      }),
      db.execute({
        sql: `SELECT key, value FROM site_settings WHERE key LIKE 'company_info_%'`,
        args: [],
      }),
    ]);

    if (companyRow.rows.length === 0) return NextResponse.json({ error: 'Company not found' }, { status: 404 });
    const company = companyRow.rows[0];
    const tier = tierRow.rows.length > 0 ? String(tierRow.rows[0].tier) : 'Monitor';

    const attendees = attendeeRows.rows.map(r => ({
      first_name: String(r.first_name),
      last_name: String(r.last_name),
      title: r.title as string | null,
      seniority: r.seniority as string | null,
    }));

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

    const brandSettings: Record<string, string> = {};
    for (const r of brandRows.rows) brandSettings[String(r.key)] = String(r.value);

    // Rep names depend on company.assigned_user — resolved after the parallel batch
    const userIds = parseIdList(company.assigned_user);
    const repNames: string[] = [];
    if (userIds.length > 0) {
      const userRows = await db.execute({
        sql: `SELECT config_id, display_name FROM users WHERE config_id IN (${userIds.map(() => '?').join(',')})`,
        args: [...userIds],
      }).catch(() => ({ rows: [] as Record<string, unknown>[] }));
      const nameMap = new Map(userRows.rows.map(r => [Number(r.config_id), String(r.display_name)]));
      repNames.push(...userIds.map(uid => nameMap.get(uid)).filter(Boolean) as string[]);
    }

    console.log(`[intel-timing] step: db_queries_complete, elapsed: ${Date.now() - t0}ms`);

    // Ensure table exists
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

    // Write 'Generating…' stub immediately so UI shows spinner
    await db.execute({
      sql: `INSERT INTO conference_company_intel
              (conference_id, company_id, company_name, tier, summary, pain_point_signals, trigger_events, buying_signals, opening_angles, used_icp_fallback, is_fallback, generated_at)
            VALUES (?, ?, ?, ?, 'Generating…', '[]', '[]', '[]', '[]', 0, 0, datetime('now'))
            ON CONFLICT(conference_id, company_id) DO UPDATE SET
              summary = 'Generating…',
              pain_point_signals = '[]',
              trigger_events = '[]',
              buying_signals = '[]',
              opening_angles = '[]',
              is_fallback = 0,
              generated_at = datetime('now')`,
      args: [conferenceId, companyId, String(company.name), tier],
    });

    console.log(`[intel-timing] step: stub_written, elapsed: ${Date.now() - t0}ms`);

    const input = {
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
    };

    // Run generation in background — returns immediately, keeps function alive via waitUntil
    waitUntil((async () => {
      console.log(`[intel-timing] step: anthropic_call_start, elapsed: ${Date.now() - t0}ms`);
      try {
        const result = await generateCompanyIntel(input);
        console.log(`[intel-timing] step: anthropic_call_complete, elapsed: ${Date.now() - t0}ms`);
        await db.execute({
          sql: `INSERT INTO conference_company_intel
                  (conference_id, company_id, company_name, tier, summary, pain_point_signals, trigger_events, buying_signals, opening_angles, used_icp_fallback, is_fallback, generated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
                ON CONFLICT(conference_id, company_id) DO UPDATE SET
                  summary = excluded.summary,
                  pain_point_signals = excluded.pain_point_signals,
                  trigger_events = excluded.trigger_events,
                  buying_signals = excluded.buying_signals,
                  opening_angles = excluded.opening_angles,
                  used_icp_fallback = excluded.used_icp_fallback,
                  is_fallback = excluded.is_fallback,
                  generated_at = excluded.generated_at`,
          args: [
            conferenceId, companyId, String(company.name), tier,
            result.summary,
            JSON.stringify(result.pain_point_signals),
            JSON.stringify(result.trigger_events),
            JSON.stringify(result.buying_signals),
            JSON.stringify(result.opening_angles),
            result.used_icp_fallback ? 1 : 0,
            result.is_fallback ? 1 : 0,
          ],
        });
        console.log(`[intel-timing] step: result_db_write_complete, elapsed: ${Date.now() - t0}ms`);
      } catch (err) {
        console.error(`[intel-timing] step: anthropic_call_error, elapsed: ${Date.now() - t0}ms`, err);
        await db.execute({
          sql: `UPDATE conference_company_intel SET summary = 'Error: generation failed', is_fallback = 1 WHERE conference_id = ? AND company_id = ?`,
          args: [conferenceId, companyId],
        }).catch(() => {});
      }
    })());

    console.log(`[intel-timing] step: http_response_sent, elapsed: ${Date.now() - t0}ms`);
    return NextResponse.json({ ok: true, company_id: companyId, status: 'generating' });
  } catch (err) {
    console.error('[intel/generate]', err);
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Internal server error' }, { status: 500 });
  }
}
