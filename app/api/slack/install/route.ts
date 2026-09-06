import { NextRequest, NextResponse } from 'next/server';
import { requireRealAdmin } from '@/lib/slack/guards';
import { signSlackState } from '@/lib/slack/state';
import { buildInstallUrl } from '@/lib/slack/oauth';

export const dynamic = 'force-dynamic';

const SETTINGS = '/admin?tab=slack';

function baseUrl(): string {
  return process.env.NEXT_PUBLIC_BASE_URL ?? 'http://localhost:3000';
}

/** Back to settings with a reason, never a raw 500 — the pattern the Google routes used. */
function settingsError(reason: string): NextResponse {
  return NextResponse.redirect(`${baseUrl()}${SETTINGS}&error=${reason}`);
}

/**
 * GET /api/slack/install — start a workspace install.
 *
 * Administrator only, and the real role rather than the demo-elevated one: this
 * redirects to Slack and ends in a stored credential, which middleware cannot
 * fake. See lib/slack/adminGuard.ts.
 */
export async function GET(request: NextRequest) {
  const auth = await requireRealAdmin(request);
  if ('refusal' in auth) {
    return settingsError(auth.refusal === 'unauthenticated' ? 'slack_unauthorized' : 'slack_forbidden');
  }

  const clientId = process.env.SLACK_CLIENT_ID;
  if (!clientId) return settingsError('slack_not_configured');

  // Signed, ten-minute, audience-scoped. It says who started this flow so the
  // callback can require that the same person finished it — it is never the
  // source of the account the install lands in. See lib/slack/state.ts.
  const state = await signSlackState({ accountId: auth.user.accountId, userId: auth.user.id });

  return NextResponse.redirect(buildInstallUrl({ clientId, state, baseUrl: baseUrl() }));
}
