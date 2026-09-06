/**
 * Talking to Slack's OAuth endpoints, and the scopes we ask for.
 *
 * Kept apart from the routes so the scope list has one home and the token
 * exchange can be exercised without standing up a route.
 */

import { decodeJwt } from 'jose';

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

/**
 * User scopes requested when one person links their own Slack account.
 *
 * Sign in with Slack, and nothing more. We need two facts — which Slack user
 * this is and which workspace they are in — and OpenID gives both without any
 * permission over their messages or their workspace. The bot token installed by
 * an administrator is what actually sends; a user link only says where to.
 */
export const USER_SCOPES = ['openid', 'profile', 'email'] as const;

const AUTHORIZE_URL = 'https://slack.com/oauth/v2/authorize';
const ACCESS_URL = 'https://slack.com/api/oauth.v2.access';
const OIDC_AUTHORIZE_URL = 'https://slack.com/openid/connect/authorize';
const OIDC_TOKEN_URL = 'https://slack.com/api/openid.connect.token';

/** Where Slack sends the user back. One definition, used by both ends. */
export function installRedirectUri(baseUrl: string): string {
  return `${baseUrl}/api/slack/oauth/callback`;
}

/** Ditto, for the user-connect flow. A separate URI, so a code is not portable between them. */
export function connectRedirectUri(baseUrl: string): string {
  return `${baseUrl}/api/slack/connect/callback`;
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

/** The consent URL for one user linking their own Slack account. */
export function buildConnectUrl(opts: { clientId: string; state: string; baseUrl: string }): string {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: opts.clientId,
    // OpenID Connect scopes are space-delimited, unlike the comma-delimited bot
    // scope list on the v2 authorize endpoint above. Different endpoint,
    // different convention; not a typo.
    scope: USER_SCOPES.join(' '),
    redirect_uri: connectRedirectUri(opts.baseUrl),
    state: opts.state,
  });
  return `${OIDC_AUTHORIZE_URL}?${params}`;
}

export interface SlackInstallResult {
  teamId: string;
  teamName: string | null;
  botToken: string;
  botUserId: string | null;
  /**
   * The Slack id of the administrator who clicked Allow.
   *
   * `oauth.v2.access` returns this in `authed_user.id` whether or not any user
   * scopes were requested, so it costs no scope and no second call. It lets the
   * install link the installer without sending them round the connect flow.
   * Null if Slack omits it, in which case they connect like everyone else.
   */
  authedUserId: string | null;
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

  const authedUser = payload.authed_user as { id?: unknown } | undefined;

  return {
    teamId,
    teamName: typeof team?.name === 'string' ? team.name : null,
    botToken,
    botUserId: typeof payload.bot_user_id === 'string' ? payload.bot_user_id : null,
    authedUserId: typeof authedUser?.id === 'string' && authedUser.id !== '' ? authedUser.id : null,
  };
}

export interface SlackUserIdentity {
  slackUserId: string;
  teamId: string;
}

/**
 * Exchange a Sign in with Slack code for the user's Slack id and workspace.
 *
 * ── Why the id_token's claims are read without verifying its signature ───────
 *
 * The token arrives in the body of a POST that this server made directly to
 * slack.com over TLS, authenticated with our client secret. OpenID Connect Core
 * §3.1.3.7 says an ID token obtained that way need not have its signature
 * checked, because the transport already establishes who sent it — there is no
 * third party between us and Slack to have substituted it. Verifying it would
 * mean fetching and caching Slack's JWKS, which is a second network dependency
 * and a second cache to expire wrongly, for no additional guarantee.
 *
 * The audience IS checked. That is not about the transport: it catches a token
 * minted for a different Slack app, which is the one substitution TLS says
 * nothing about.
 *
 * The caller must still check the returned `teamId` against the account's
 * installed workspace. This function reports who Slack says the user is; it has
 * no idea who the caller expected.
 */
export async function exchangeUserCode(opts: {
  code: string;
  clientId: string;
  clientSecret: string;
  baseUrl: string;
}): Promise<SlackUserIdentity | null> {
  let payload: Record<string, unknown>;
  try {
    const response = await fetch(OIDC_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code: opts.code,
        client_id: opts.clientId,
        client_secret: opts.clientSecret,
        redirect_uri: connectRedirectUri(opts.baseUrl),
      }),
    });
    payload = await response.json() as Record<string, unknown>;
  } catch {
    return null;
  }

  if (payload.ok !== true) return null;
  if (typeof payload.id_token !== 'string' || payload.id_token === '') return null;

  let claims: Record<string, unknown>;
  try {
    claims = decodeJwt(payload.id_token) as Record<string, unknown>;
  } catch {
    return null;
  }

  // Minted for this Slack app, and no other.
  const audience = claims.aud;
  const audiences = Array.isArray(audience) ? audience : [audience];
  if (!audiences.includes(opts.clientId)) return null;

  const slackUserId = claims.sub;
  const teamId = claims['https://slack.com/team_id'];
  if (typeof slackUserId !== 'string' || slackUserId === '') return null;
  if (typeof teamId !== 'string' || teamId === '') return null;

  return { slackUserId, teamId };
}
