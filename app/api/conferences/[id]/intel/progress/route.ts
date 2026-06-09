import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getDb } from '@/lib/getDb';
import { resolvePlanState } from '@/lib/trialState';
import { hasCapability } from '@/lib/capabilities';
import { intelProcessingState, stateKey } from '@/lib/intel/intelState';

export const maxDuration = 30;

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;

  const { id } = await params;
  const conferenceId = parseInt(id);
  if (isNaN(conferenceId)) return NextResponse.json({ status: 'idle' });

  // Fast path: same worker instance has in-memory state
  const key = stateKey(authResult.accountId ?? 'global', conferenceId);
  const memState = intelProcessingState.get(key);
  if (memState) return NextResponse.json(memState);

  // Cross-instance fallback: read DB-persisted progress
  try {
    const db = await getDb(authResult.accountId);
    const { planCapabilities } = await resolvePlanState(db);
    if (!hasCapability(planCapabilities, 'intelligence_core.company_intel')) {
      return NextResponse.json({ error: 'Upgrade required' }, { status: 403 });
    }
    const row = await db.execute({
      sql: `SELECT intel_job_status, intel_job_completed, intel_job_total FROM conferences WHERE id = ?`,
      args: [conferenceId],
    }).catch(() => ({ rows: [] as Record<string, unknown>[] }));

    if (row.rows.length === 0) return NextResponse.json({ status: 'idle' });
    const r = row.rows[0];
    const status = r.intel_job_status as string | null;
    if (!status || status === 'idle') return NextResponse.json({ status: 'idle' });

    return NextResponse.json({
      status,
      completed: Number(r.intel_job_completed ?? 0),
      total: Number(r.intel_job_total ?? 0),
    });
  } catch {
    return NextResponse.json({ status: 'idle' });
  }
}
