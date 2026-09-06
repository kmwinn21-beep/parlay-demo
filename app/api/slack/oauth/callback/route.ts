import { NextRequest, NextResponse } from 'next/server';
import { requireRealAdmin } from '@/lib/slack/adminGuard';
import { verifySlackState } from '@/lib/slack/state';
import { exchangeCodeForToken } from '@/lib/slack/oauth';
import { saveWorkspace } from '@/lib/slack/store';

export const dynamic = 'force-dynamic';

const SETTINGS = '/admin?tab=slack';

function baseUrl(): string {
  return process.env.NEXT_PUBLIC_BASE_URL ?? 'http://localhost:3000';
}

function settingsError(reason: string): NextResponse {
  return NextResponse.redirect(`${baseUrl()}${SETTINGS}&error=${reason}`);
}

/**
 * GET /api/slack/oauth/callback — finish a workspace install.
 *
 * Four checks, in this order, and the order is the point:
 *
 *   1. The state verifies — signed by this server, our audience, unexpired.
 *      An unsigned or forged state is the whole of the vulnerability this flow
 *      was written to avoid.
 *   2. The caller has a session, and is really an administrator.
 *   3. The session user IS the user named in the state. The state says who
 *      started the flow; the session says who finished it. A code obtained by
 *      one person must not install under another.
 *   4. The account comes from the SESSION, never from the state. Even a
 *      genuinely signed state naming another account installs nothing there —
 *      the state's account is only compared, and a mismatch is refused.
 *
 * Deleted predecessors got 1, 2 and 4 wrong at once: an unsigned state, no
 * authentication at all, and `getDb(accountIdFromState)`. See TENANT_DB_AUDIT.md.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);

  // Slack reports a declined consent screen here rather than by not calling back.
  if (searchParams.get('error')) return settingsError('slack_denied');

  const code = searchParams.get('code');
  if (!code) return settingsError('slack_denied');

  // 1. The state must be one we signed, for this purpose, recently.
  const state = await verifySlackState(searchParams.get('state'));
  if (!state) return settingsError('slack_invalid_state');

  // 2. Whoever is finishing this must be an administrator in their own right.
  const auth = await requireRealAdmin(request);
  if ('refusal' in auth) {
    return settingsError(auth.refusal === 'unauthenticated' ? 'slack_unauthorized' : 'slack_forbidden');
  }

  // 3. and 4. The session is the authority on both who and where. The state is
  // only allowed to agree with it.
  if (auth.user.id !== state.userId) return settingsError('slack_state_mismatch');
  if (auth.user.accountId !== state.accountId) return settingsError('slack_state_mismatch');

  const clientId = process.env.SLACK_CLIENT_ID;
  const clientSecret = process.env.SLACK_CLIENT_SECRET;
  if (!clientId || !clientSecret) return settingsError('slack_not_configured');

  const result = await exchangeCodeForToken({ code, clientId, clientSecret, baseUrl: baseUrl() });
  if (!result) return settingsError('slack_exchange_failed');

  try {
    // accountId from the session — see the header. saveWorkspace encrypts the
    // token itself, so there is no path here that stores it in plain text.
    await saveWorkspace({
      accountId: auth.user.accountId,
      teamId: result.teamId,
      teamName: result.teamName,
      botToken: result.botToken,
      botUserId: result.botUserId,
      installedByUserId: auth.user.id,
    });
  } catch (err) {
    // Most likely a missing or malformed ENCRYPTION_KEY, which must fail the
    // install rather than store the token unencrypted.
    console.error('[slack] install failed to store workspace:', err);
    return settingsError('slack_store_failed');
  }

  return NextResponse.redirect(`${baseUrl()}${SETTINGS}&connected=slack`);
}
