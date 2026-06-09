import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getDb } from '@/lib/getDb';
import { resolvePlanState } from '@/lib/trialState';
import { hasCapability } from '@/lib/capabilities';
import { getSeriesYoYData } from '@/lib/get-series-yoy-data';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: { seriesId: string } }
) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const db = await getDb(authResult?.accountId);

  const { planCapabilities } = await resolvePlanState(db);
  if (!hasCapability(planCapabilities, 'program_intelligence.yoy_series_analysis')) {
    return NextResponse.json({ error: 'Upgrade required' }, { status: 403 });
  }

  try {
    const data = await getSeriesYoYData(params.seriesId, db);
    return NextResponse.json(data);
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('Series not found')) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    console.error('GET /api/conferences/series/[seriesId]/yoy error:', error);
    return NextResponse.json({ error: 'Failed to fetch YoY data' }, { status: 500 });
  }
}
