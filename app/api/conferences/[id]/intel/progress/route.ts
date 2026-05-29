import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { intelProcessingState, stateKey } from '@/lib/intel/intelState';

export const maxDuration = 30;

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;

  const { id } = await params;
  const conferenceId = parseInt(id);
  if (isNaN(conferenceId)) return NextResponse.json({ status: 'idle' });

  const key = stateKey(authResult.accountId ?? 'global', conferenceId);
  const state = intelProcessingState.get(key);
  if (!state) return NextResponse.json({ status: 'idle' });
  return NextResponse.json(state);
}
