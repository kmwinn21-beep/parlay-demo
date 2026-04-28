/**
 * Notification helpers — best-effort, never throws.
 * Errors are swallowed so a notification failure never breaks a primary mutation.
 */
import { db } from './db';
import { sendNotificationEmail } from './email';

const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME ?? 'Conference Hub';

export type NotifType = 'company' | 'attendee' | 'conference';

type NotifPrefKey = 'company_status_change' | 'follow_up_assigned' | 'note_tagged';

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
  configIdStr: string | null | undefined,
  excludeConfigId?: number | null,
): Promise<number[]> {
  const ids = parseNotifIds(configIdStr);
  if (ids.length === 0) return [];
  try {
    const ph = ids.map(() => '?').join(',');
    const rows = await db.execute({
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
export async function getConfigIdByEmail(email: string): Promise<number | null> {
  try {
    const r = await db.execute({
      sql: 'SELECT config_id FROM users WHERE email = ?',
      args: [email],
    });
    if (!r.rows.length || r.rows[0].config_id == null) return null;
    return Number(r.rows[0].config_id);
  } catch {
    return null;
  }
}

/** Insert notification rows — one per user. Respects notification_preferences opt-outs. Errors are swallowed. */
export async function createNotifications(p: CreateNotificationsInput): Promise<void> {
  if (p.userIds.length === 0) return;
  try {
    let eligibleIds = p.userIds;
    if (p.prefKey) {
      const ph = p.userIds.map(() => '?').join(',');
      const prefRows = await db.execute({
        sql: `SELECT user_id FROM notification_preferences WHERE user_id IN (${ph}) AND ${p.prefKey} = 0`,
        args: p.userIds,
      });
      const optedOut = new Set(prefRows.rows.map(r => Number(r.user_id)));
      eligibleIds = p.userIds.filter(id => !optedOut.has(id));
    }
    for (const uid of eligibleIds) {
      await db.execute({
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

    // Send email notifications (best-effort, non-blocking)
    try {
      const ph2 = eligibleIds.map(() => '?').join(',');
      const emailColCheck = p.prefKey ? `${p.prefKey}_email = 0` : `email_notifications = 0`;
      const emailOptOutRows = await db.execute({
        sql: `SELECT user_id FROM notification_preferences
              WHERE user_id IN (${ph2}) AND ${emailColCheck}`,
        args: eligibleIds,
      });
      const emailOptedOut = new Set(emailOptOutRows.rows.map(r => Number(r.user_id)));
      const emailIds = eligibleIds.filter(id => !emailOptedOut.has(id));

      if (emailIds.length > 0) {
        const ph3 = emailIds.map(() => '?').join(',');
        const userRows = await db.execute({
          sql: `SELECT id, email FROM users WHERE id IN (${ph3})`,
          args: emailIds,
        });
        const typeToPath: Record<string, string> = {
          attendee: '/attendees', company: '/companies', conference: '/conferences',
        };
        const BASE = process.env.NEXT_PUBLIC_BASE_URL ?? '';
        const path = typeToPath[p.entityType] ?? null;
        const link = path ? `${BASE}${path}/${p.entityId}` : null;
        const subject = `${APP_NAME} - ${p.recordName} Notification`;
        for (const row of userRows.rows) {
          await sendNotificationEmail(String(row.email), subject, p.message, link);
        }
      }
    } catch (err) {
      console.error('[notifications] email send error:', err);
    }
  } catch (err) {
    console.error('[notifications] insert error:', err);
  }
}

// ─── Convenience wrappers ────────────────────────────────────────────────────

/**
 * Notify all users assigned to a company (excluding the actor).
 */
export async function notifyCompanyAssignees(opts: {
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
    const r = await db.execute({
      sql: 'SELECT assigned_user FROM companies WHERE id = ?',
      args: [opts.companyId],
    });
    if (!r.rows.length) return;
    const userIds = await resolveUserIds(
      r.rows[0].assigned_user as string | null,
      opts.changedByConfigId,
    );
    await createNotifications({
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
export async function notifyConferenceInternalAttendees(opts: {
  conferenceId: number;
  conferenceName: string;
  message: string;
  changedByEmail: string;
  changedByConfigId: number | null;
}): Promise<void> {
  try {
    const r = await db.execute({
      sql: 'SELECT internal_attendees FROM conferences WHERE id = ?',
      args: [opts.conferenceId],
    });
    if (!r.rows.length) return;
    const userIds = await resolveUserIds(
      r.rows[0].internal_attendees as string | null,
      opts.changedByConfigId,
    );
    await createNotifications({
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
export async function notifyMentionedUsers(opts: {
  taggedConfigIds: number[];
  mentionerName: string;
  mentionerEmail: string;
  mentionerConfigId: number | null;
  entityName: string;
  entityType: string;
  entityId: number;
}): Promise<void> {
  if (opts.taggedConfigIds.length === 0) return;
  try {
    const userIds = await resolveUserIds(
      opts.taggedConfigIds.join(','),
      opts.mentionerConfigId,
    );
    const message = `${opts.mentionerName} mentioned you in a note related to ${opts.entityName}`;
    await createNotifications({
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

export async function notifyForAttendee(opts: {
  attendeeId: number;
  attendeeName: string;
  message: string;
  changedByEmail: string;
  changedByConfigId: number | null;
}): Promise<void> {
  try {
    const r = await db.execute({
      sql: `SELECT co.assigned_user FROM attendees a
            LEFT JOIN companies co ON a.company_id = co.id
            WHERE a.id = ?`,
      args: [opts.attendeeId],
    });
    if (!r.rows.length) return;
    const userIds = await resolveUserIds(
      r.rows[0].assigned_user as string | null,
      opts.changedByConfigId,
    );
    await createNotifications({
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
