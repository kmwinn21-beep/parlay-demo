import { NextRequest, NextResponse } from 'next/server';
import { requireOpsAdmin } from '@/lib/opsAuth';
import { getDb } from '@/lib/getDb';
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

  const { accountId, vertical, prospects, partners, vendors, competitors } = body;

  if (!accountId || typeof accountId !== 'string') {
    return NextResponse.json({ error: 'accountId is required' }, { status: 400 });
  }

  // Validate vertical
  if (!companyPools[vertical as Vertical]) {
    return NextResponse.json({ error: `Unknown vertical: ${vertical}` }, { status: 400 });
  }

  const MAX_COMPANIES = 2000;
  const counts = [prospects.companyCount, partners.companyCount, vendors.companyCount];
  if (competitors?.companyCount) counts.push(competitors.companyCount);
  if (counts.some(c => c > MAX_COMPANIES)) {
    return NextResponse.json({ error: `Company count cannot exceed ${MAX_COMPANIES}.` }, { status: 422 });
  }

  // Open tenant DB if overlap is needed
  let tenantClient: Awaited<ReturnType<typeof getDb>> | undefined;
  if (body.overlap?.enabled && body.overlap.sourceConferenceIds?.length > 0) {
    tenantClient = await getDb(accountId);
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
