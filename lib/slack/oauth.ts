/**
 * Talking to Slack's OAuth endpoints, and the scopes we ask for.
 *
 * Kept apart from the routes so the scope list has one home and the token
 * exchange can be exercised without standing up a route.
 */

/**
 * Bot scopes requested at install.
 *
 * Deliberately the minimum for sending: post to a channel the bot is in,
 * post to a public channel it is not in, read the channel list, and open a DM.
 *
 * No channel-creation scopes. They belong with per-conference channels, and
 * asking for a permission before the feature exists means every workspace
 * consents to something it cannot yet see the point of — and adding scopes
 * later forces reauthorization either way, so there is nothing saved by
 * front-loading them.
 */
export const BOT_SCOPES = [
  'chat:write',
  'chat:write.public',
  'channels:read',
  'im:write',
] as const;

const AUTHORIZE_URL = 'https://slack.com/oauth/v2/authorize';
const ACCESS_URL = 'https://slack.com/api/oauth.v2.access';

/** Where Slack sends the user back. One definition, used by both ends. */
export function installRedirectUri(baseUrl: string): string {
  return `${baseUrl}/api/slack/oauth/callback`;
}

/** The consent URL to redirect an installing admin to. */
export function buildInstallUrl(opts: { clientId: string; state: string; baseUrl: string }): string {
  const params = new URLSearchParams({
    client_id: opts.clientId,
    scope: BOT_SCOPES.join(','),
    redirect_uri: installRedirectUri(opts.baseUrl),
    state: opts.state,
  });
  return `${AUTHORIZE_URL}?${params}`;
}

export interface SlackInstallResult {
  teamId: string;
  teamName: string | null;
  botToken: string;
  botUserId: string | null;
}

/**
 * Exchange an authorization code for a bot token.
 *
 * Returns null on anything that is not a usable install — a transport failure,
 * Slack reporting `ok: false`, or a response missing the fields the install
 * needs. The caller turns that into a redirect with an error param; there is
 * nothing here a user could act on beyond "it did not work".
 */
export async function exchangeCodeForToken(opts: {
  code: string;
  clientId: string;
  clientSecret: string;
  baseUrl: string;
}): Promise<SlackInstallResult | null> {
  let payload: Record<string, unknown>;
  try {
    const response = await fetch(ACCESS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code: opts.code,
        client_id: opts.clientId,
        client_secret: opts.clientSecret,
        redirect_uri: installRedirectUri(opts.baseUrl),
      }),
    });
    payload = await response.json() as Record<string, unknown>;
  } catch {
    return null;
  }

  if (payload.ok !== true) return null;

  const team = payload.team as { id?: unknown; name?: unknown } | undefined;
  const teamId = team?.id;
  const botToken = payload.access_token;
  if (typeof teamId !== 'string' || teamId === '') return null;
  if (typeof botToken !== 'string' || botToken === '') return null;

  return {
    teamId,
    teamName: typeof team?.name === 'string' ? team.name : null,
    botToken,
    botUserId: typeof payload.bot_user_id === 'string' ? payload.bot_user_id : null,
  };
}
