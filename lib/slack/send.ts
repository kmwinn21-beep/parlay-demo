/**
 * Delivering a notification as a Slack direct message.
 *
 * ── This is the additive channel, and it behaves like one ────────────────────
 *
 * `sendSlackNotification` never throws. Not "usually doesn't" — the whole body
 * is inside a try/catch and every per-recipient call has its own. The in-app row
 * and the email are the channels people already depend on, and they were only
 * just repaired (TENANT_DB_AUDIT.md); a Slack outage, a revoked token or a
 * malformed response must not take them with it.
 *
 * It is also called LAST, after the notification rows are inserted and the email
 * has gone. That ordering is deliberate belt-and-braces: even if something here
 * escaped the catch, the other two channels have already happened.
 *
 * ── But it does not swallow quietly ──────────────────────────────────────────
 *
 * Every layer of the old notification path swallowed its errors, which is how a
 * bug that wrote nothing at all survived for months. So each failure below logs
 * the account, the user and what Slack actually said. A silent catch here would
 * repeat the exact mistake this integration was built in the shadow of.
 *
 * ── The payload ─────────────────────────────────────────────────────────────
 *
 * Plain text and a link. No Block Kit. Every one of the 61 call sites already
 * hands the dispatcher a pre-rendered string and an entity to link to, and
 * widening that contract to structured blocks means touching all of them. The
 * plain version ships first.
 */

import type { Client } from '@libsql/client';
import { getBotToken, markWorkspaceRevoked } from '@/lib/slack/store';
import { slackRecipientsFor } from '@/lib/slack/preferences';

const OPEN_URL = 'https://slack.com/api/conversations.open';
const POST_URL = 'https://slack.com/api/chat.postMessage';

/**
 * How long we will wait on Slack before giving up on one call.
 *
 * This runs inside a request that has already done its real work, so the
 * user is waiting on it. Slack being slow must cost a few seconds, not the
 * request.
 */
const TIMEOUT_MS = 5_000;

/**
 * Slack errors that mean the installation itself is gone.
 *
 * `account_inactive` is the workspace being deactivated; `token_revoked` is an
 * administrator uninstalling Parlay from inside Slack. There is no webhook for
 * either — a failed send is the first we hear of it — so this is where the
 * workspace gets marked.
 */
const INSTALLATION_GONE = new Set(['account_inactive', 'token_revoked', 'invalid_auth']);

/** Slack errors that mean this one recipient is unreachable, not the workspace. */
const RECIPIENT_GONE = new Set(['user_not_found', 'user_disabled', 'cannot_dm_bot']);

interface SlackApiResult {
  ok: boolean;
  error?: string;
  /** Seconds Slack asked us to wait, from the Retry-After header on a 429. */
  retryAfter?: number;
  channel?: string;
}

async function callSlack(url: string, token: string, body: unknown): Promise<SlackApiResult> {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  // Rate limiting is an HTTP status, not an `ok: false` body, so it has to be
  // read before the JSON.
  if (response.status === 429) {
    const header = response.headers.get('retry-after');
    return { ok: false, error: 'ratelimited', retryAfter: header ? Number(header) : undefined };
  }

  const payload = await response.json() as { ok?: boolean; error?: string; channel?: { id?: string } };
  return {
    ok: payload.ok === true,
    error: typeof payload.error === 'string' ? payload.error : undefined,
    channel: typeof payload.channel?.id === 'string' ? payload.channel.id : undefined,
  };
}

export interface SlackNotificationInput {
  /** The tenant client the notification was written to. Used to read preferences. */
  client: Client;
  accountId: string;
  /** One of SLACK_EVENTS. An unknown value resolves to no recipients. */
  event: string;
  /** Candidate recipients, before preferences and links are applied. */
  userIds: number[];
  /** The same pre-rendered string the in-app row and the email carry. */
  message: string;
  /** Where to read more, or null for entity types with no page. */
  link: string | null;
}

/**
 * Deliver a notification to whichever of `userIds` have asked for this event in
 * Slack and have an account linked.
 *
 * Returns the number of direct messages actually delivered, which is 0 in every
 * ordinary case — nobody opted in, no workspace, no link. Callers ignore it;
 * it exists so tests can tell "sent nothing" apart from "threw and was caught".
 */
export async function sendSlackNotification(input: SlackNotificationInput): Promise<number> {
  try {
    if (input.userIds.length === 0) return 0;

    const recipients = await slackRecipientsFor(
      input.client, input.accountId, input.event, input.userIds,
    );
    if (recipients.length === 0) return 0;

    // Throws by design when the stored value will not decrypt — a rotated or
    // missing ENCRYPTION_KEY, or a modified row. Louder than null, which would
    // read as "not connected" and send an administrator down the reinstall path
    // when the truth is that the key changed. Here that loudness is a log line,
    // because a notification path must not throw at its caller.
    let token: string | null;
    try {
      token = await getBotToken(input.accountId);
    } catch (err) {
      console.error(
        `[slack] bot token for account ${input.accountId} could not be decrypted — ` +
        `no Slack delivery for this notification. Check ENCRYPTION_KEY:`, err,
      );
      return 0;
    }

    // No workspace installed. Not an error: most accounts are in this state,
    // and the preference query above would normally have returned nobody
    // anyway. Silent on purpose — this is the common path, not a failure.
    if (!token) return 0;

    let delivered = 0;
    for (const recipient of recipients) {
      const sent = await deliverOne(token, input, recipient.parlayUserId, recipient.slackUserId);
      if (sent === 'installation-gone') {
        // Every remaining recipient would fail identically. Stop, and mark the
        // workspace once rather than logging the same thing per person.
        await markWorkspaceRevoked(input.accountId);
        break;
      }
      if (sent === 'ok') delivered++;
    }
    return delivered;
  } catch (err) {
    // The outer net. Nothing above should reach here, and if something does it
    // still must not reach the caller — but it gets logged rather than lost.
    console.error(`[slack] unexpected failure delivering notification for account ${input.accountId}:`, err);
    return 0;
  }
}

export type PostResult = { ok: true } | { ok: false; error: string };

/**
 * Open a DM with one Slack user and post to it.
 *
 * Extracted from the notification path so the "send a test message" button can
 * exercise EXACTLY the same two calls — open, then post — rather than a
 * simplified imitation of them. A diagnostic that takes a different route than
 * the thing it is diagnosing is worse than none.
 *
 * Returns Slack's raw error string rather than logging it, because the caller
 * decides what to do with it: the notification path classifies and logs, the
 * test route shows it to the person who pressed the button.
 *
 * Throws only on transport failure or timeout.
 */
export async function postDirectMessage(
  token: string,
  slackUserId: string,
  text: string,
): Promise<PostResult> {
  // A DM channel has to be opened before it can be posted to. Idempotent —
  // Slack returns the existing channel for a pair that already has one — so
  // there is nothing to cache.
  const opened = await callSlack(OPEN_URL, token, { users: slackUserId });
  if (!opened.ok || !opened.channel) {
    return { ok: false, error: describe(opened) };
  }

  const posted = await callSlack(POST_URL, token, {
    channel: opened.channel,
    text,
    // The notification text is already the whole message; a preview card for
    // the link underneath it is noise in a DM.
    unfurl_links: false,
    unfurl_media: false,
  });
  if (!posted.ok) return { ok: false, error: describe(posted) };

  return { ok: true };
}

/** Slack's error string, with the rate-limit wait folded in where there is one. */
function describe(result: SlackApiResult): string {
  const error = result.error ?? 'unknown_error';
  if (error === 'ratelimited' && result.retryAfter) return `ratelimited:${result.retryAfter}`;
  return error;
}

/** True when this Slack error means the installation itself is gone. */
export function isInstallationGone(error: string): boolean {
  return INSTALLATION_GONE.has(error.split(':')[0]);
}

type DeliveryOutcome = 'ok' | 'failed' | 'installation-gone';

/** One DM. Never throws; the outcome tells the caller whether to keep going. */
async function deliverOne(
  token: string,
  input: SlackNotificationInput,
  parlayUserId: number,
  slackUserId: string,
): Promise<DeliveryOutcome> {
  const who = `account ${input.accountId} user ${parlayUserId} (slack ${slackUserId})`;
  try {
    const text = input.link ? `${input.message}\n${input.link}` : input.message;
    const result = await postDirectMessage(token, slackUserId, text);
    if (result.ok) return 'ok';
    return report(result.error, `[slack] could not deliver to ${who}`);
  } catch (err) {
    // A transport failure or the 5s timeout. Named separately from an `ok:
    // false` because the fix is different: this one is us or the network.
    const reason = err instanceof Error && err.name === 'TimeoutError'
      ? `timed out after ${TIMEOUT_MS}ms`
      : String(err);
    console.error(`[slack] delivery to ${who} failed: ${reason}`);
    return 'failed';
  }
}

/** Log one Slack `ok: false` at the detail its cause deserves, and classify it. */
function report(raw: string, context: string): DeliveryOutcome {
  const [error, retryAfter] = raw.split(':');

  if (INSTALLATION_GONE.has(error)) {
    console.error(
      `${context}: Slack says '${error}' — the installation is gone, most likely ` +
      `uninstalled from the Slack side. Marking the workspace revoked; no further ` +
      `Slack delivery for this account until it is reconnected.`,
    );
    return 'installation-gone';
  }

  if (RECIPIENT_GONE.has(error)) {
    // Their link is now dead, but it is NOT deleted here. `user_not_found` is
    // also what a transient Slack blip can look like, and unlinking on one bad
    // response would cost a real person a reconnect they did not ask for. The
    // log names them so a pattern is visible.
    console.error(
      `${context}: Slack says '${error}' — this person is no longer reachable in ` +
      `the workspace. Their link is left in place; the rest of the account is unaffected.`,
    );
    return 'failed';
  }

  if (error === 'ratelimited') {
    // Not retried inline. This runs inside a request that has already done its
    // real work, and sleeping through Slack's window would hold the response
    // open for a channel that is explicitly additive. The notification row and
    // the email have already landed; the DM is what is lost.
    console.error(
      `${context}: rate limited by Slack` +
      (retryAfter ? `, retry after ${retryAfter}s` : '') +
      `. Not retried — the in-app and email notifications were already delivered.`,
    );
    return 'failed';
  }

  console.error(`${context}: Slack says '${error}'.`);
  return 'failed';
}
