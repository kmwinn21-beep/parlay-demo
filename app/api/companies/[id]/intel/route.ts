import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getDb } from '@/lib/getDb';

function tryParseJson<T>(val: string | null | undefined, fallback: T): T {
  if (!val) return fallback;
  try { return JSON.parse(val) as T; } catch { return fallback; }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;

  const { id } = await params;
  const companyId = parseInt(id, 10);
  if (isNaN(companyId)) return NextResponse.json({ error: 'Invalid company ID' }, { status: 400 });

  try {
    const db = await getDb(authResult.accountId);

    const rows = await db.execute({
      sql: `SELECT cci.conference_id, c.name AS conference_name, cci.tier,
                   cci.summary, cci.pain_point_signals, cci.trigger_events,
                   cci.buying_signals, cci.opening_angles,
                   cci.used_icp_fallback, cci.is_fallback, cci.generated_at
            FROM conference_company_intel cci
            JOIN conferences c ON c.id = cci.conference_id
            WHERE cci.company_id = ?
              AND cci.summary IS NOT NULL
              AND cci.summary != 'Generating…'
              AND cci.summary NOT LIKE 'Error:%'
            ORDER BY cci.generated_at DESC`,
      args: [companyId],
    }).catch(() => ({ rows: [] as Record<string, unknown>[] }));

    const items = rows.rows.map(r => ({
      conference_id: Number(r.conference_id),
      conference_name: String(r.conference_name),
      tier: String(r.tier),
      summary: String(r.summary),
      pain_point_signals: tryParseJson<string[]>(r.pain_point_signals as string, []),
      trigger_events: tryParseJson<string[]>(r.trigger_events as string, []),
      buying_signals: tryParseJson<string[]>(r.buying_signals as string, []),
      opening_angles: tryParseJson<string[]>(r.opening_angles as string, []),
      used_icp_fallback: Boolean(r.used_icp_fallback),
      is_fallback: Boolean(r.is_fallback),
      generated_at: r.generated_at as string | null,
    }));

    return NextResponse.json({ items });
  } catch (err) {
    console.error('[GET /api/companies/[id]/intel]', err);
    return NextResponse.json({ error: 'Failed to fetch intel' }, { status: 500 });
  }
}
