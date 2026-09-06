import { NextRequest, NextResponse } from 'next/server';
import { requireAccountUser } from '@/lib/slack/guards';
import { deleteUserLink } from '@/lib/slack/store';

export const dynamic = 'force-dynamic';

/**
 * Remove the caller's own Slack link, and nothing else.
 *
 * The sibling at /api/slack/disconnect is the administrative one: it removes
 * the workspace and every link under it. This removes exactly one row, chosen
 * by the session rather than by anything the caller sends — there is no user id
 * in the request to get wrong, and no way to spell one that unlinks somebody
 * else.
 *
 * The workspace is untouched. Unlinking yourself is not uninstalling Parlay.
 */
async function disconnect(request: NextRequest): Promise<NextResponse> {
  const auth = await requireAccountUser(request);
  if ('refusal' in auth) {
    return auth.refusal === 'unauthenticated'
      ? NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      : NextResponse.json({ error: 'No account' }, { status: 403 });
  }

  try {
    await deleteUserLink(auth.user.accountId, auth.user.id);
  } catch (err) {
    console.error('[slack] user disconnect failed:', err);
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
