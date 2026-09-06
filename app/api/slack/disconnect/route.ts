import { NextRequest, NextResponse } from 'next/server';
import { requireRealAdmin } from '@/lib/slack/adminGuard';
import { deleteWorkspace } from '@/lib/slack/store';

export const dynamic = 'force-dynamic';

/**
 * Remove an account's Slack workspace and every user link under it.
 *
 * Administrator only, on the real role: disconnecting revokes an integration
 * for everyone in the account, which is not something a demo-elevated session
 * should be able to do to a real one.
 *
 * The links go with the workspace — `deleteWorkspace` does both. A link
 * pointing at a workspace the account can no longer reach reads as connected
 * and delivers nothing, which is worse than no link.
 *
 * Answers JSON rather than redirecting: this is called from the settings screen
 * by fetch, unlike the install flow which is a browser navigation.
 */
async function disconnect(request: NextRequest): Promise<NextResponse> {
  const auth = await requireRealAdmin(request);
  if ('refusal' in auth) {
    return auth.refusal === 'unauthenticated'
      ? NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      : NextResponse.json({ error: 'Forbidden: administrator access required' }, { status: 403 });
  }

  try {
    await deleteWorkspace(auth.user.accountId);
  } catch (err) {
    console.error('[slack] disconnect failed:', err);
    return NextResponse.json({ error: 'Failed to disconnect Slack.' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

export async function POST(request: NextRequest) {
  return disconnect(request);
}

export async function DELETE(request: NextRequest) {
  return disconnect(request);
}
