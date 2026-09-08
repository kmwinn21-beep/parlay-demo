import { NextRequest, NextResponse } from 'next/server';
import { requireAccountUser } from '@/lib/slack/guards';
import { getBotToken, getUserLink, getWorkspace, markWorkspaceRevoked } from '@/lib/slack/store';
import { isInstallationGone, postDirectMessage } from '@/lib/slack/send';
import { slackApiErrorMessage } from '@/lib/slack/errorMessages';

export const dynamic = 'force-dynamic';

const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME ?? 'Parlay';

/**
 * POST /api/slack/test — send the caller a Slack DM, and say what happened.
 *
 * ── Why this exists ──────────────────────────────────────────────────────────
 *
 * Every notification path in this app excludes the person who triggered it, so
 * there is no way to prove Slack delivery works by acting on your own account —
 * testing it otherwise needs a second person. This is the one place that will
 * message you because you asked it to.
 *
 * ── What it does and does not prove ──────────────────────────────────────────
 *
 * It walks the whole Slack half: the workspace row, the bot token and its
 * decryption, your link, `conversations.open` and `chat.postMessage`. It calls
 * `postDirectMessage`, the same function the notification path calls, rather
 * than an imitation of it — a diagnostic that takes a different route than the
 * thing it diagnoses is worse than none.
 *
 * It does NOT go through lib/notifications.ts, so it says nothing about your
 * per-event Slack toggles. That is the point of the split: if this succeeds and
 * a real notification still does not arrive, the problem is the preference gate
 * and not Slack.
 *
 * ── It only ever messages the caller ─────────────────────────────────────────
 *
 * There is no user parameter. The recipient is resolved from the session, so
 * there is nothing to substitute in order to make this message somebody else.
 * Any authenticated member may use it: it is their own link, their own DM.
 *
 * ── It reports Slack's raw error ─────────────────────────────────────────────
 *
 * Unusually for this codebase, the response carries Slack's own error code
 * alongside a sentence. Whoever pressed this button is diagnosing something, and
 * `missing_scope` is the half a search engine understands. It is the caller's
 * own account and it is not a credential.
 */
export async function POST(request: NextRequest) {
  const auth = await requireAccountUser(request);
  if ('refusal' in auth) {
    return auth.refusal === 'unauthenticated'
      ? NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      : NextResponse.json({ error: 'No account' }, { status: 403 });
  }
  const { accountId, id: userId, email } = auth.user;

  // Each of these is a distinct thing to go and fix, so each says which.
  const workspace = await getWorkspace(accountId);
  if (!workspace) {
    return NextResponse.json({
      error: `No Slack workspace is connected for this account. An administrator connects one in Admin Settings.`,
    }, { status: 400 });
  }
  if (workspace.revokedAt) {
    return NextResponse.json({
      error: `Slack reports that ${workspace.teamName ?? 'this workspace'} no longer has ${APP_NAME} installed. Reconnect it in Admin Settings.`,
    }, { status: 400 });
  }

  const link = await getUserLink(accountId, userId);
  if (!link) {
    return NextResponse.json({
      error: `Your Slack account is not linked. Connect it from the Slack section on My Account.`,
    }, { status: 400 });
  }

  let token: string | null;
  try {
    token = await getBotToken(accountId);
  } catch (err) {
    // getBotToken throws rather than returning null when the stored value will
    // not decrypt, and this is the one screen where that distinction can be
    // reported instead of guessed at.
    console.error(`[slack] test message: bot token for account ${accountId} could not be decrypted:`, err);
    return NextResponse.json({
      error: `The stored Slack token could not be decrypted. ENCRYPTION_KEY has probably changed on this deployment. Reconnecting the workspace in Admin Settings stores a fresh token.`,
    }, { status: 500 });
  }
  if (!token) {
    return NextResponse.json({ error: `No Slack token is stored for this account.` }, { status: 400 });
  }

  const text =
    `:white_check_mark: Test message from ${APP_NAME}.\n` +
    `If you can read this, Slack delivery is working for ${email}.\n` +
    `This does not check your per-event notification toggles — those live on My Account.`;

  let result;
  try {
    result = await postDirectMessage(token, link.slackUserId, text);
  } catch (err) {
    const reason = err instanceof Error && err.name === 'TimeoutError'
      ? 'Slack did not respond within 5 seconds.'
      : 'Could not reach Slack.';
    console.error(`[slack] test message to account ${accountId} user ${userId} failed:`, err);
    return NextResponse.json({ error: `${reason} Try again.` }, { status: 502 });
  }

  if (!result.ok) {
    // The same signal the notification path acts on, so the button leaves the
    // account in the same state a real failed delivery would — otherwise a
    // revoked workspace would keep reading as connected until a notification
    // happened to fire.
    if (isInstallationGone(result.error)) await markWorkspaceRevoked(accountId);
    console.error(`[slack] test message to account ${accountId} user ${userId}: Slack says '${result.error}'`);
    return NextResponse.json({
      error: slackApiErrorMessage(result.error),
      slackError: result.error.split(':')[0],
    }, { status: 502 });
  }

  return NextResponse.json({
    ok: true,
    slackUserId: link.slackUserId,
    teamName: workspace.teamName,
  });
}
