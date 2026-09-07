/**
 * Notification helpers — best-effort, never throws.
 * Errors are swallowed so a notification failure never breaks a primary mutation.
 *
 * Every function here takes the database client to work against as its first
 * argument, and this module deliberately does not import the `db` singleton
 * from ./db. Accounts each have their own database: a tenant's users, their
 * preferences and the records a notification is about all live there, and none
 * of them exist in master. Reaching for the singleton meant reading a database
 * the recipient was not in — no preferences row, no resolved recipients,
 * nothing written — and because this path swallows its errors, nothing said so.
 *
 * The client is required rather than defaulted for the same reason. A default
 * is a decision made by whoever forgets to pass one, and it silently picks the
 * wrong database for every tenant user. Not importing the singleton at all is
 * what makes that unavailable rather than merely discouraged.
 *
 * See tests/notification-tenant-db.mjs, which stands up both databases.
 */
import type { Client } from '@libsql/client';
import { sendNotificationEmail } from './email';
import { sendSlackNotification } from './slack/send';
import { accountIdForClient } from './getDb';

const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME ?? 'Conference Hub';

// 'meeting' is written by the AI meeting-analysis notification. It is listed
// here because that is what the column actually holds, rather than leaving
// the one site that uses it outside the type.
export type NotifType = 'company' | 'attendee' | 'conference' | 'meeting';

type NotifPrefKey = 'company_status_change' | 'follow_up_assigned' | 'note_tagged';

/**
 * The note-engagement preferences, which are off until a user turns them on.
 *
 * Both keys are interpolated straight into SQL, so they are spelled out here
 * rather than taken as free strings. The email column is derived from the
 * in-app one, which is the naming convention the table already follows and
 * stops the pair from drifting apart.
 */
type OptInPrefKey =
  | 'note_comment_received'
  | 'note_comment_thread'
  | 'note_reaction_received'
  | 'note_lets_talk'
  | 'comment_reaction_received';

type OptInEmailPrefKey = `${OptInPrefKey}_email`;

interface CreateNotificationsInput {
  userIds: number[];
  type: NotifType;
  recordId: number;
  recordName: string;
  message: string;
  changedByEmail: string;
  changedByConfigId?: number | null;
  entityType: string;   // 'company' | 'attendee' | 'conference'
  entityId: number;
  prefKey?: NotifPrefKey;
  /**
   * Skip the generic notification email. For callers that send their own,
   * better one — an input request with decision links, a debrief with stats —
   * so the reader doesn't get both.
   */
  skipEmail?: boolean;
}

/** Entity types that open one record, keyed by the route that shows it. */
const RECORD_PATHS: Record<string, string> = {
  attendee: '/attendees', company: '/companies', conference: '/conferences',
};

/**
 * Entity types with no single record to open, which land on a list instead —
 * a batch reassignment spans attendees and conferences, so there is nothing
 * more specific to point at.
 */
const LIST_PATHS: Record<string, string> = {
  follow_up: '/follow-ups',
};

/** The email's "View Details" target, or null when the type has no page. */
function entityLink(base: string, entityType: string, entityId: number): string | null {
  const record = RECORD_PATHS[entityType];
  if (record) return `${base}${record}/${entityId}`;
  const list = LIST_PATHS[entityType];
  return list ? `${base}${list}` : null;
}

/** Parse a comma-separated numeric ID string into an array of positive integers. */
export function parseNotifIds(str: string | null | undefined): number[] {
  if (!str) return [];
  return str.split(',').map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n) && n > 0);
}

/**
 * Resolve a comma-separated config_option ID string to the user IDs
 * (users.id) whose config_id matches, excluding the given actor config ID.
 */
export async function resolveUserIds(
  client: Client,
  configIdStr: string | null | undefined,
  excludeConfigId?: number | null,
): Promise<number[]> {
  const ids = parseNotifIds(configIdStr);
  if (ids.length === 0) return [];
  try {
    const ph = ids.map(() => '?').join(',');
    const rows = await client.execute({
      sql: `SELECT id, config_id FROM users WHERE config_id IN (${ph})`,
      args: ids,
    });
    return rows.rows
      .filter(r => excludeConfigId == null || Number(r.config_id) !== excludeConfigId)
      .map(r => Number(r.id));
  } catch {
    return [];
  }
}

/**
 * Get the config_id for a user identified by email.
 * Returns null if the user is not found or has no config_id set.
 */
export async function getConfigIdByEmail(client: Client, email: string): Promise<number | null> {
  try {
    const r = await client.execute({
      sql: 'SELECT config_id FROM users WHERE email = ?',
      args: [email],
    });
    if (!r.rows.length || r.rows[0].config_id == null) return null;
    return Number(r.rows[0].config_id);
  } catch {
    return null;
  }
}

/**
 * Deliver the same notification to Slack, for whoever asked for it there.
 *
 * Called last, after the notification rows and the email, and wrapped in its own
 * catch on top of the one inside `sendSlackNotification`. Slack is additive: the
 * two channels people already rely on have landed by the time this runs, and
 * nothing it does can undo them.
 *
 * The account comes from the client itself (lib/getDb.ts). A Slack link lives in
 * MASTER, keyed on (account_id, parlay_user_id), so delivery needs an account id
 * that `CreateNotificationsInput` does not carry — and adding one would mean
 * editing 61 call sites to pass a value every one of them already implies.
 *
 * A client with no account is master, or one built by hand in a test. Neither
 * has Slack recipients, so this returns without a log: it is the ordinary case,
 * not a failure.
 */
async function deliverToSlack(
  client: Client,
  event: string,
  userIds: number[],
  message: string,
  entityType: string,
  entityId: number,
): Promise<void> {
  try {
    if (userIds.length === 0) return;
    const accountId = accountIdForClient(client);
    if (!accountId) return;
    const BASE = process.env.NEXT_PUBLIC_BASE_URL ?? '';
    await sendSlackNotification({
      client, accountId, event, userIds, message,
      link: entityLink(BASE, entityType, entityId),
    });
  } catch (err) {
    // sendSlackNotification does not throw. This is the second net, so that a
    // future change inside it cannot reach the mutation that triggered the
    // notification.
    console.error('[notifications] slack delivery error:', err);
  }
}

/** Insert notification rows — one per user. Respects notification_preferences opt-outs. Errors are swallowed. */
export async function createNotifications(client: Client, p: CreateNotificationsInput): Promise<void> {
  if (p.userIds.length === 0) return;
  try {
    let eligibleIds = p.userIds;
    if (p.prefKey) {
      const ph = p.userIds.map(() => '?').join(',');
      const prefRows = await client.execute({
        sql: `SELECT user_id FROM notification_preferences WHERE user_id IN (${ph}) AND ${p.prefKey} = 0`,
        args: p.userIds,
      });
      const optedOut = new Set(prefRows.rows.map(r => Number(r.user_id)));
      eligibleIds = p.userIds.filter(id => !optedOut.has(id));
    }
    for (const uid of eligibleIds) {
      await client.execute({
        sql: `INSERT INTO notifications
              (user_id, type, record_id, record_name, message,
               changed_by_config_id, changed_by_email, entity_type, entity_id, is_read)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
        args: [
          uid, p.type, p.recordId, p.recordName, p.message,
          p.changedByConfigId ?? null, p.changedByEmail,
          p.entityType, p.entityId,
        ],
      });
    }

    if (p.skipEmail) return;

    // Send email notifications (best-effort, non-blocking)
    try {
      const ph2 = eligibleIds.map(() => '?').join(',');
      const emailColCheck = p.prefKey ? `${p.prefKey}_email = 0` : `email_notifications = 0`;
      const emailOptOutRows = await client.execute({
        sql: `SELECT user_id FROM notification_preferences
              WHERE user_id IN (${ph2}) AND ${emailColCheck}`,
        args: eligibleIds,
      });
      const emailOptedOut = new Set(emailOptOutRows.rows.map(r => Number(r.user_id)));
      const emailIds = eligibleIds.filter(id => !emailOptedOut.has(id));

      if (emailIds.length > 0) {
        const ph3 = emailIds.map(() => '?').join(',');
        const userRows = await client.execute({
          sql: `SELECT id, email FROM users WHERE id IN (${ph3})`,
          args: emailIds,
        });
        const BASE = process.env.NEXT_PUBLIC_BASE_URL ?? '';
        const link = entityLink(BASE, p.entityType, p.entityId);
        const subject = `${APP_NAME} - ${p.recordName} Notification`;
        for (const row of userRows.rows) {
          await sendNotificationEmail(String(row.email), subject, p.message, link);
        }
      }
    } catch (err) {
      console.error('[notifications] email send error:', err);
    }

    // Last, and only for events that have a Slack column. `prefKey` is absent
    // for a handful of callers that pass no preference at all; those have no
    // Slack toggle either, so there is nothing a user could have opted into.
    if (p.prefKey) {
      await deliverToSlack(client, p.prefKey, eligibleIds, p.message, p.entityType, p.entityId);
    }
  } catch (err) {
    console.error('[notifications] insert error:', err);
  }
}

// ─── Convenience wrappers ────────────────────────────────────────────────────

/**
 * Notify all users assigned to a company (excluding the actor).
 */
export async function notifyCompanyAssignees(client: Client, opts: {
  companyId: number;
  companyName: string;
  message: string;
  changedByEmail: string;
  changedByConfigId: number | null;
  type?: NotifType;
  entityType?: string;
  entityId?: number;
}): Promise<void> {
  try {
    const r = await client.execute({
      sql: 'SELECT assigned_user FROM companies WHERE id = ?',
      args: [opts.companyId],
    });
    if (!r.rows.length) return;
    const userIds = await resolveUserIds(
      client,
      r.rows[0].assigned_user as string | null,
      opts.changedByConfigId,
    );
    await createNotifications(client, {
      userIds,
      type: opts.type ?? 'company',
      recordId: opts.companyId,
      recordName: opts.companyName,
      message: opts.message,
      changedByEmail: opts.changedByEmail,
      changedByConfigId: opts.changedByConfigId,
      entityType: opts.entityType ?? 'company',
      entityId: opts.entityId ?? opts.companyId,
      prefKey: 'company_status_change',
    });
  } catch (err) {
    console.error('[notifications] notifyCompanyAssignees error:', err);
  }
}

/**
 * Notify users listed as internal attendees on a conference (excluding the actor).
 * The notification links to the conference record.
 */
export async function notifyConferenceInternalAttendees(client: Client, opts: {
  conferenceId: number;
  conferenceName: string;
  message: string;
  changedByEmail: string;
  changedByConfigId: number | null;
}): Promise<void> {
  try {
    const r = await client.execute({
      sql: 'SELECT internal_attendees FROM conferences WHERE id = ?',
      args: [opts.conferenceId],
    });
    if (!r.rows.length) return;
    const userIds = await resolveUserIds(
      client,
      r.rows[0].internal_attendees as string | null,
      opts.changedByConfigId,
    );
    await createNotifications(client, {
      userIds,
      type: 'conference',
      recordId: opts.conferenceId,
      recordName: opts.conferenceName,
      message: opts.message,
      changedByEmail: opts.changedByEmail,
      changedByConfigId: opts.changedByConfigId,
      entityType: 'conference',
      entityId: opts.conferenceId,
    });
  } catch (err) {
    console.error('[notifications] notifyConferenceInternalAttendees error:', err);
  }
}
/**
 * Notify users who were @mentioned in a note.
 */
export async function notifyMentionedUsers(client: Client, opts: {
  taggedConfigIds: number[];
  mentionerName: string;
  mentionerEmail: string;
  mentionerConfigId: number | null;
  entityName: string;
  entityType: string;
  entityId: number;
  /** What the mention was written in. Defaults to a note. */
  surface?: 'note' | 'comment';
}): Promise<void> {
  if (opts.taggedConfigIds.length === 0) return;
  try {
    const userIds = await resolveUserIds(
      client,
      opts.taggedConfigIds.join(','),
      opts.mentionerConfigId,
    );
    const message = `${opts.mentionerName} mentioned you in a ${opts.surface ?? 'note'} related to ${opts.entityName}`;
    await createNotifications(client, {
      userIds,
      type: opts.entityType as NotifType,
      recordId: opts.entityId,
      recordName: opts.entityName,
      message,
      changedByEmail: opts.mentionerEmail,
      changedByConfigId: opts.mentionerConfigId,
      entityType: opts.entityType,
      entityId: opts.entityId,
      prefKey: 'note_tagged',
    });
  } catch (err) {
    console.error('[notifications] notifyMentionedUsers error:', err);
  }
}

// ─── Opt-in notification engine (default OFF — user must explicitly enable) ──

interface CreateOptInNotificationsInput {
  userIds: number[];
  prefKey: OptInPrefKey;
  emailPrefKey: OptInEmailPrefKey;
  type: NotifType;
  recordId: number;
  recordName: string;
  message: string;
  changedByEmail: string;
  changedByConfigId?: number | null;
  entityType: string;
  entityId: number;
}

async function createOptInNotifications(client: Client, p: CreateOptInNotificationsInput): Promise<void> {
  if (p.userIds.length === 0) return;
  try {
    const ph = p.userIds.map(() => '?').join(',');
    const optInRows = await client.execute({
      sql: `SELECT user_id FROM notification_preferences WHERE user_id IN (${ph}) AND ${p.prefKey} = 1`,
      args: p.userIds,
    });
    const eligibleIds = optInRows.rows.map(r => Number(r.user_id));
    if (eligibleIds.length === 0) return;

    for (const uid of eligibleIds) {
      await client.execute({
        sql: `INSERT INTO notifications
              (user_id, type, record_id, record_name, message,
               changed_by_config_id, changed_by_email, entity_type, entity_id, is_read)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
        args: [
          uid, p.type, p.recordId, p.recordName, p.message,
          p.changedByConfigId ?? null, p.changedByEmail,
          p.entityType, p.entityId,
        ],
      });
    }

    try {
      const ph2 = eligibleIds.map(() => '?').join(',');
      const emailOptInRows = await client.execute({
        sql: `SELECT user_id FROM notification_preferences WHERE user_id IN (${ph2}) AND ${p.emailPrefKey} = 1`,
        args: eligibleIds,
      });
      const emailIds = emailOptInRows.rows.map(r => Number(r.user_id));
      if (emailIds.length > 0) {
        const ph3 = emailIds.map(() => '?').join(',');
        const userRows = await client.execute({
          sql: `SELECT id, email FROM users WHERE id IN (${ph3})`,
          args: emailIds,
        });
        const BASE = process.env.NEXT_PUBLIC_BASE_URL ?? '';
        const link = entityLink(BASE, p.entityType, p.entityId);
        const subject = `${APP_NAME} - ${p.recordName} Notification`;
        for (const row of userRows.rows) {
          await sendNotificationEmail(String(row.email), subject, p.message, link);
        }
      }
    } catch (err) {
      console.error('[notifications] opt-in email error:', err);
    }

    await deliverToSlack(client, p.prefKey, eligibleIds, p.message, p.entityType, p.entityId);
  } catch (err) {
    console.error('[notifications] createOptInNotifications error:', err);
  }
}

export async function notifyNoteComment(client: Client, opts: {
  noteId: number;
  noteAuthorUserId: number | null;
  commenterUserId: number;
  commenterName: string;
  commenterEmail: string;
  commenterConfigId: number | null;
  previousCommenterUserIds: number[];
  recordName: string;
  entityType: string;
  entityId: number;
}): Promise<void> {
  const base = {
    type: opts.entityType as NotifType,
    recordId: opts.noteId,
    recordName: opts.recordName,
    changedByEmail: opts.commenterEmail,
    changedByConfigId: opts.commenterConfigId,
    entityType: opts.entityType,
    entityId: opts.entityId,
  };
  if (opts.noteAuthorUserId && opts.noteAuthorUserId !== opts.commenterUserId) {
    createOptInNotifications(client, {
      ...base,
      userIds: [opts.noteAuthorUserId],
      prefKey: 'note_comment_received',
      emailPrefKey: 'note_comment_received_email',
      message: `${opts.commenterName} commented on your note about ${opts.recordName}`,
    });
  }
  const threadIds = opts.previousCommenterUserIds.filter(
    id => id !== opts.commenterUserId && id !== opts.noteAuthorUserId,
  );
  if (threadIds.length > 0) {
    createOptInNotifications(client, {
      ...base,
      userIds: threadIds,
      prefKey: 'note_comment_thread',
      emailPrefKey: 'note_comment_thread_email',
      message: `${opts.commenterName} added a comment to a note thread you're following (${opts.recordName})`,
    });
  }
}

export async function notifyNoteReaction(client: Client, opts: {
  noteId: number;
  noteAuthorUserId: number | null;
  reactorUserId: number;
  reactorName: string;
  reactorEmail: string;
  reactorConfigId: number | null;
  reactionType: 'like' | 'dislike';
  recordName: string;
  entityType: string;
  entityId: number;
}): Promise<void> {
  if (!opts.noteAuthorUserId || opts.noteAuthorUserId === opts.reactorUserId) return;
  const emoji = opts.reactionType === 'like' ? '👍' : '👎';
  createOptInNotifications(client, {
    userIds: [opts.noteAuthorUserId],
    prefKey: 'note_reaction_received',
    emailPrefKey: 'note_reaction_received_email',
    type: opts.entityType as NotifType,
    recordId: opts.noteId,
    recordName: opts.recordName,
    message: `${opts.reactorName} reacted ${emoji} to your note about ${opts.recordName}`,
    changedByEmail: opts.reactorEmail,
    changedByConfigId: opts.reactorConfigId,
    entityType: opts.entityType,
    entityId: opts.entityId,
  });
}

export async function notifyNoteLetsTalk(client: Client, opts: {
  noteId: number;
  triggerUserId: number;
  triggerName: string;
  triggerEmail: string;
  triggerConfigId: number | null;
  recipientUserIds: number[];
  recordName: string;
  entityType: string;
  entityId: number;
}): Promise<void> {
  const recipients = opts.recipientUserIds.filter(id => id !== opts.triggerUserId);
  if (recipients.length === 0) return;
  createOptInNotifications(client, {
    userIds: recipients,
    prefKey: 'note_lets_talk',
    emailPrefKey: 'note_lets_talk_email',
    type: opts.entityType as NotifType,
    recordId: opts.noteId,
    recordName: opts.recordName,
    message: `${opts.triggerName} wants to talk about a note on ${opts.recordName}. Commenting has been closed.`,
    changedByEmail: opts.triggerEmail,
    changedByConfigId: opts.triggerConfigId,
    entityType: opts.entityType,
    entityId: opts.entityId,
  });
}

export async function notifyCommentReaction(client: Client, opts: {
  commentAuthorUserId: number;
  reactorUserId: number;
  reactorName: string;
  reactorEmail: string;
  reactorConfigId: number | null;
  reactionType: 'like' | 'dislike';
  recordName: string;
  entityType: string;
  entityId: number;
  noteId: number;
}): Promise<void> {
  if (opts.commentAuthorUserId === opts.reactorUserId) return;
  const emoji = opts.reactionType === 'like' ? '👍' : '👎';
  createOptInNotifications(client, {
    userIds: [opts.commentAuthorUserId],
    prefKey: 'comment_reaction_received',
    emailPrefKey: 'comment_reaction_received_email',
    type: opts.entityType as NotifType,
    recordId: opts.noteId,
    recordName: opts.recordName,
    message: `${opts.reactorName} reacted ${emoji} to your comment on a note about ${opts.recordName}`,
    changedByEmail: opts.reactorEmail,
    changedByConfigId: opts.reactorConfigId,
    entityType: opts.entityType,
    entityId: opts.entityId,
  });
}

export async function notifyForAttendee(client: Client, opts: {
  attendeeId: number;
  attendeeName: string;
  message: string;
  changedByEmail: string;
  changedByConfigId: number | null;
}): Promise<void> {
  try {
    const r = await client.execute({
      sql: `SELECT co.assigned_user FROM attendees a
            LEFT JOIN companies co ON a.company_id = co.id
            WHERE a.id = ?`,
      args: [opts.attendeeId],
    });
    if (!r.rows.length) return;
    const userIds = await resolveUserIds(
      client,
      r.rows[0].assigned_user as string | null,
      opts.changedByConfigId,
    );
    await createNotifications(client, {
      userIds,
      type: 'attendee',
      recordId: opts.attendeeId,
      recordName: opts.attendeeName,
      message: opts.message,
      changedByEmail: opts.changedByEmail,
      changedByConfigId: opts.changedByConfigId,
      entityType: 'attendee',
      entityId: opts.attendeeId,
    });
  } catch (err) {
    console.error('[notifications] notifyForAttendee error:', err);
  }
}
