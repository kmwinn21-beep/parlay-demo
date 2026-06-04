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

  // Validate pool sizes
  const pool = companyPools[vertical as Vertical];
  if (!pool) {
    return NextResponse.json({ error: `Unknown vertical: ${vertical}` }, { status: 400 });
  }
  const maxProspects = pool.prospects.length;
  const maxPartners = pool.partners.length;
  const maxVendors = pool.vendors.length;

  if (prospects.companyCount > maxProspects) {
    return NextResponse.json({
      error: `Prospect count ${prospects.companyCount} exceeds pool size of ${maxProspects} for vertical "${vertical}".`,
      maxAvailable: { prospects: maxProspects, partners: maxPartners, vendors: maxVendors },
    }, { status: 422 });
  }
  if (partners.companyCount > maxPartners) {
    return NextResponse.json({
      error: `Partner count ${partners.companyCount} exceeds pool size of ${maxPartners} for vertical "${vertical}".`,
      maxAvailable: { prospects: maxProspects, partners: maxPartners, vendors: maxVendors },
    }, { status: 422 });
  }
  if (vendors.companyCount > maxVendors) {
    return NextResponse.json({
      error: `Vendor count ${vendors.companyCount} exceeds pool size of ${maxVendors} for vertical "${vertical}".`,
      maxAvailable: { prospects: maxProspects, partners: maxPartners, vendors: maxVendors },
    }, { status: 422 });
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
