import { NextRequest, NextResponse } from 'next/server';
import { requireOpsAdmin } from '@/lib/opsAuth';
import { createClient } from '@libsql/client';
import { db, dbReady } from '@/lib/db';
import { generateDummyData, type GeneratorParams } from '@/lib/dummy-data/generate-attendees';
import { exportToXlsx } from '@/lib/dummy-data/export-xlsx';
import { companyPools } from '@/lib/dummy-data/company-pools';
import type { Vertical } from '@/lib/dummy-data/company-pools';

export async function POST(request: NextRequest) {
  const auth = await requireOpsAdmin(request);
  if (auth instanceof NextResponse) return auth;

  let body: GeneratorParams & { accountId: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { accountId, vertical, prospects, partners, vendors } = body;

  if (!accountId || typeof accountId !== 'string') {
    return NextResponse.json({ error: 'accountId is required' }, { status: 400 });
  }

  // Validate vertical
  if (!companyPools[vertical as Vertical]) {
    return NextResponse.json({ error: `Unknown vertical: ${vertical}` }, { status: 400 });
  }

  const MAX_COMPANIES = 2000;
  if (prospects.companyCount > MAX_COMPANIES || partners.companyCount > MAX_COMPANIES || vendors.companyCount > MAX_COMPANIES) {
    return NextResponse.json({ error: `Company count cannot exceed ${MAX_COMPANIES}.` }, { status: 422 });
  }

  // Open tenant DB if overlap is needed
  let tenantClient: ReturnType<typeof createClient> | undefined;
  if (body.overlap?.enabled && body.overlap.sourceConferenceIds.length > 0) {
    await dbReady;
    const accountRow = await db.execute({
      sql: `SELECT turso_db_url, turso_auth_token FROM accounts WHERE id = ?`,
      args: [accountId],
    });
    if (accountRow.rows[0]?.turso_db_url) {
      tenantClient = createClient({
        url: String(accountRow.rows[0].turso_db_url),
        authToken: String(accountRow.rows[0].turso_auth_token),
      });
    }
  }

  try {
    const result = await generateDummyData(body, tenantClient);
    const buffer = exportToXlsx(result.rows);
    const filename = `${(body.conferenceName || 'DummyData').replace(/\s+/g, '_')}_DummyData.xlsx`;

    return new Response(new Uint8Array(buffer), {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'X-Stats': JSON.stringify(result.stats),
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
