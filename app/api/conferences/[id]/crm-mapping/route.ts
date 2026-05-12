import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getDb } from '@/lib/getDb';

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const db = await getDb(authResult?.accountId);

  const conferenceId = Number(params.id);
  if (isNaN(conferenceId)) return NextResponse.json({ error: 'Invalid conference ID' }, { status: 400 });

  const rows = await db.execute({
    sql: `SELECT provider, crm_campaign_name FROM conference_crm_mappings WHERE conference_id = ?`,
    args: [conferenceId],
  });

  const result: Record<string, string> = {};
  for (const row of rows.rows) {
    result[String(row.provider)] = String(row.crm_campaign_name);
  }

  return NextResponse.json({
    hubspot: result['hubspot'] ?? null,
    salesforce: result['salesforce'] ?? null,
  });
}

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const db = await getDb(authResult?.accountId);

  const conferenceId = Number(params.id);
  if (isNaN(conferenceId)) return NextResponse.json({ error: 'Invalid conference ID' }, { status: 400 });

  const body = await request.json() as { provider: string; campaignName: string };
  const { provider, campaignName } = body;

  if (!provider || !['hubspot', 'salesforce'].includes(provider)) {
    return NextResponse.json({ error: 'Invalid provider' }, { status: 400 });
  }
  if (!campaignName?.trim()) {
    return NextResponse.json({ error: 'Campaign name is required' }, { status: 400 });
  }

  await db.execute({
    sql: `INSERT OR REPLACE INTO conference_crm_mappings (conference_id, provider, crm_campaign_name, updated_at)
          VALUES (?, ?, ?, datetime('now'))`,
    args: [conferenceId, provider, campaignName.trim()],
  });

  return NextResponse.json({ ok: true });
}
