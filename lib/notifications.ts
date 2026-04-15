/**
 * Notification helpers — best-effort, never throws.
 * Errors are swallowed so a notification failure never breaks a primary mutation.
 */
import { db } from './db';

export type NotifType = 'company' | 'attendee' | 'conference';

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

/** Insert notification rows — one per user. Errors are swallowed. */
export async function createNotifications(p: CreateNotificationsInput): Promise<void> {
  if (p.userIds.length === 0) return;
  try {
    for (const uid of p.userIds) {
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
