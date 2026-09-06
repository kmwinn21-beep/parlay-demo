import { NextRequest, NextResponse } from 'next/server';
import { requireAccountUser } from '@/lib/slack/guards';
import { signSlackConnectState } from '@/lib/slack/state';
import { buildConnectUrl } from '@/lib/slack/oauth';
import { getWorkspace } from '@/lib/slack/store';

export const dynamic = 'force-dynamic';

const SETTINGS = '/auth/account?section=slack';

function baseUrl(): string {
  return process.env.NEXT_PUBLIC_BASE_URL ?? 'http://localhost:3000';
}

function settingsError(reason: string): NextResponse {
  return NextResponse.redirect(`${baseUrl()}${SETTINGS}&error=${reason}`);
}

/**
 * GET /api/slack/connect — start linking one person's own Slack account.
 *
 * Any authenticated member of an account. Linking yourself is not an
 * administrative act, so unlike the install flow there is no role check — see
 * lib/slack/guards.ts.
 *
 * The state carries the `slack-user-connect` audience, which the install
 * callback does not accept. Without that separation, a member could take the
 * connect state they are entitled to and present it where a workspace gets
 * installed.
 */
export async function GET(request: NextRequest) {
  const auth = await requireAccountUser(request);
  if ('refusal' in auth) {
    return settingsError(auth.refusal === 'unauthenticated' ? 'slack_unauthorized' : 'slack_no_account');
  }

  // Refuse at the start rather than at the callback. Without a workspace there
  // is no bot to DM this person, so a link would be a row that reads as
  // connected and delivers nothing — and finding that out only after a round
  // trip through Slack's consent screen tells the user nothing about the actual
  // problem, which is that their administrator has not installed Parlay yet.
  const workspace = await getWorkspace(auth.user.accountId);
  if (!workspace) return settingsError('slack_no_workspace');

  const clientId = process.env.SLACK_CLIENT_ID;
  if (!clientId) return settingsError('slack_not_configured');

  const state = await signSlackConnectState({ accountId: auth.user.accountId, userId: auth.user.id });

  return NextResponse.redirect(buildConnectUrl({ clientId, state, baseUrl: baseUrl() }));
}
