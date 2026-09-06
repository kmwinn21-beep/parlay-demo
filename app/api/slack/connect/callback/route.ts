import { NextRequest, NextResponse } from 'next/server';
import { requireAccountUser } from '@/lib/slack/guards';
import { verifySlackConnectState } from '@/lib/slack/state';
import { exchangeUserCode } from '@/lib/slack/oauth';
import { getWorkspace, saveUserLink } from '@/lib/slack/store';

export const dynamic = 'force-dynamic';

const SETTINGS = '/auth/account?section=slack';

function baseUrl(): string {
  return process.env.NEXT_PUBLIC_BASE_URL ?? 'http://localhost:3000';
}

function settingsError(reason: string): NextResponse {
  return NextResponse.redirect(`${baseUrl()}${SETTINGS}&error=${reason}`);
}

/**
 * GET /api/slack/connect/callback — finish linking one person's Slack account.
 *
 * The same four checks as the install callback, for the same reasons:
 *
 *   1. The state verifies — signed by this server, for the CONNECT audience,
 *      unexpired. An install state presented here fails on the audience.
 *   2. The caller has a session in an account.
 *   3. The session user IS the user named in the state.
 *   4. The account comes from the SESSION. The state's copy is only compared.
 *
 * And one more that only this flow needs:
 *
 *   5. The Slack user Slack just identified is in the SAME workspace the
 *      account has installed. Someone can perfectly well sign in with Slack
 *      from a different workspace — Slack will happily issue that token — and
 *      the resulting link would name a user our bot has no way to reach.
 *      Refusing it says so; storing it produces a person who looks connected
 *      and silently never receives anything.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);

  if (searchParams.get('error')) return settingsError('slack_denied');

  const code = searchParams.get('code');
  if (!code) return settingsError('slack_denied');

  // 1.
  const state = await verifySlackConnectState(searchParams.get('state'));
  if (!state) return settingsError('slack_invalid_state');

  // 2.
  const auth = await requireAccountUser(request);
  if ('refusal' in auth) {
    return settingsError(auth.refusal === 'unauthenticated' ? 'slack_unauthorized' : 'slack_no_account');
  }

  // 3. and 4.
  if (auth.user.id !== state.userId) return settingsError('slack_state_mismatch');
  if (auth.user.accountId !== state.accountId) return settingsError('slack_state_mismatch');

  const workspace = await getWorkspace(auth.user.accountId);
  if (!workspace) return settingsError('slack_no_workspace');

  const clientId = process.env.SLACK_CLIENT_ID;
  const clientSecret = process.env.SLACK_CLIENT_SECRET;
  if (!clientId || !clientSecret) return settingsError('slack_not_configured');

  const identity = await exchangeUserCode({ code, clientId, clientSecret, baseUrl: baseUrl() });
  if (!identity) return settingsError('slack_exchange_failed');

  // 5. The workspace the account installed is the only one a link may name.
  if (identity.teamId !== workspace.teamId) return settingsError('slack_wrong_workspace');

  try {
    await saveUserLink({
      accountId: auth.user.accountId,
      parlayUserId: auth.user.id,
      slackUserId: identity.slackUserId,
    });
  } catch (err) {
    console.error('[slack] failed to store user link:', err);
    return settingsError('slack_store_failed');
  }

  return NextResponse.redirect(`${baseUrl()}${SETTINGS}&connected=slack`);
}
