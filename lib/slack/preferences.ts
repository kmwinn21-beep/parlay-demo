/**
 * Who wants a given notification as a Slack direct message.
 *
 * ── The one rule this file exists to enforce ─────────────────────────────────
 *
 *   NO ROW MEANS NO SLACK MESSAGE.
 *
 * No `notification_preferences` row is written when a user is created. For the
 * three oldest events — company status changes, follow-up assignment and note
 * mentions — the in-app and email readers treat a missing row as "receives",
 * and for those channels that is right: a bell icon costs nothing, and the email
 * goes to an address the user gave us when they signed up.
 *
 * It is not right for Slack. Someone who links their Slack account has told us
 * where they are, not that they want to be interrupted there. If Slack inherited
 * the opt-out default, linking would immediately start delivering direct
 * messages for events nobody agreed to, and the feature would be switched off in
 * its first week.
 *
 * So the query below is an INCLUSION LIST. It selects the users whose row says
 * `= 1`, rather than selecting everyone and removing those who said no. A user
 * with no row is not in the result. A user with a row of zeroes is not in the
 * result. A user whose row predates the Slack columns is not in the result — the
 * columns are `NOT NULL DEFAULT 0`, so the migration backfills silence.
 *
 * ── Two databases, deliberately ──────────────────────────────────────────────
 *
 * A Slack recipient must satisfy two conditions that live in different places:
 *
 *   notification_preferences   TENANT   — did they ask for this event?
 *   slack_user_links           MASTER   — is there a Slack account to send to?
 *
 * Both are required, so this takes a tenant `client` (per TENANT_DB_AUDIT.md's
 * rule — required, never defaulted to the singleton) and reads the links through
 * lib/slack/store.ts, which owns the master side.
 *
 * ── What this does NOT do ────────────────────────────────────────────────────
 *
 * It does not send. It answers "who, and at which Slack id" and stops there.
 * lib/notifications.ts does not call it yet.
 */

import type { Client } from '@libsql/client';
import { listUserLinks } from '@/lib/slack/store';

/**
 * The events a user can choose to receive in Slack.
 *
 * One entry per event, not per column: the in-app column is the key itself, the
 * email column is `${key}_email` and the Slack column is `${key}_slack`.
 */
export const SLACK_EVENTS = [
  'company_status_change',
  'follow_up_assigned',
  'note_tagged',
  'note_comment_received',
  'note_comment_thread',
  'note_reaction_received',
  'note_lets_talk',
  'comment_reaction_received',
] as const;

export type SlackEvent = typeof SLACK_EVENTS[number];

/** The three events whose in-app and email columns default to on. Slack's does not. */
export const OPT_OUT_EVENTS: readonly SlackEvent[] = [
  'company_status_change',
  'follow_up_assigned',
  'note_tagged',
];

export const slackColumn = (event: SlackEvent): string => `${event}_slack`;

function isSlackEvent(value: string): value is SlackEvent {
  return (SLACK_EVENTS as readonly string[]).includes(value);
}

export interface SlackRecipient {
  parlayUserId: number;
  slackUserId: string;
}

/**
 * Of `userIds`, the ones who have asked for `event` in Slack AND have a Slack
 * account linked in this account.
 *
 * Returns an empty array rather than throwing when nobody qualifies, which is
 * the common case and not an error. Order follows `userIds`.
 *
 * `client` is the TENANT client and is required. `accountId` scopes the master
 * side. Both must describe the same account; the caller derives both from the
 * authenticated session.
 */
export async function slackRecipientsFor(
  client: Client,
  accountId: string,
  event: string,
  userIds: number[],
): Promise<SlackRecipient[]> {
  if (!isSlackEvent(event)) {
    // An unknown event name must not fall through to "send to everyone". A
    // typo'd key is silence, and the log says why.
    console.error(`[slack] unknown notification event '${event}' — no Slack recipients`);
    return [];
  }

  const seen = new Set<number>();
  const unique = userIds.filter(id => {
    if (!Number.isInteger(id) || id <= 0 || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
  if (unique.length === 0) return [];

  const placeholders = unique.map(() => '?').join(', ');
  // An inclusion list. `= 1` — not `!= 0`, not `IS NOT 0` — so a NULL, a zero
  // and an absent row all fail it identically. See this module's header.
  const opted = await client.execute({
    sql: `SELECT user_id FROM notification_preferences
          WHERE user_id IN (${placeholders}) AND ${slackColumn(event)} = 1`,
    args: unique,
  });

  const wants = new Set(opted.rows.map(row => Number(row.user_id)));
  if (wants.size === 0) return [];

  // Master side. A preference without a link is somebody who asked for Slack
  // before connecting, or who has since disconnected; either way there is
  // nowhere to deliver, so they are not a recipient.
  const links = await listUserLinks(accountId);
  const linked = new Map(links.map(link => [link.parlayUserId, link.slackUserId]));

  return unique
    .filter(id => wants.has(id) && linked.has(id))
    .map(id => ({ parlayUserId: id, slackUserId: linked.get(id)! }));
}
