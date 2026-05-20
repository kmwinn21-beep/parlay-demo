import { NextRequest, NextResponse } from 'next/server';
import { db, dbReady } from '@/lib/db';
import { createClient } from '@libsql/client';
import { sendDebriefEmail } from '@/lib/email';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME ?? 'Conference Hub';

function csvContains(col: string): string {
  return `',' || COALESCE(${col}, '') || ',' LIKE '%,' || ? || ',%'`;
}

async function processAccount(
  tenantDb: ReturnType<typeof createClient>,
  accountId: string,
  todayUtc: string,
): Promise<number> {
  let sent = 0;

  // Find conferences whose end_date = today
  let confRows: Record<string, unknown>[];
  try {
    const r = await tenantDb.execute({
      sql: `SELECT id, name, internal_attendees FROM conferences WHERE DATE(end_date) = ?`,
      args: [todayUtc],
    });
    confRows = r.rows as Record<string, unknown>[];
  } catch {
    return 0;
  }
  if (!confRows.length) return 0;

  // Ensure debrief_notifications_sent table exists
  try {
    await tenantDb.execute({
      sql: `CREATE TABLE IF NOT EXISTS debrief_notifications_sent (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        conference_id INTEGER NOT NULL REFERENCES conferences(id) ON DELETE CASCADE,
        sent_at TEXT DEFAULT (datetime('now')),
        UNIQUE(user_id, conference_id)
      )`,
      args: [],
    });
  } catch { /* already exists */ }

  for (const conf of confRows) {
    const conferenceId = Number(conf.id);
    const conferenceName = String(conf.name);
    const internalNames = (conf.internal_attendees as string | null)
      ?.split(',').map(s => s.trim()).filter(Boolean) ?? [];
    if (!internalNames.length) continue;

    // Look up users who are internal attendees (join users + config_options by value)
    let userRows: Record<string, unknown>[];
    try {
      const ph = internalNames.map(() => '?').join(',');
      const r = await tenantDb.execute({
        sql: `SELECT u.id, u.email, u.config_id, co.value as rep_name
              FROM users u
              JOIN config_options co ON co.id = u.config_id
              WHERE co.value IN (${ph})`,
        args: internalNames,
      });
      userRows = r.rows as Record<string, unknown>[];
    } catch {
      continue;
    }
    if (!userRows.length) continue;

    for (const user of userRows) {
      const userId = Number(user.id);
      const userEmail = String(user.email ?? '');
      const repName = String(user.rep_name ?? '');
      const configId = user.config_id != null ? Number(user.config_id) : null;
      if (!userEmail || configId == null) continue;

      // Idempotency check
      try {
        await tenantDb.execute({
          sql: `INSERT INTO debrief_notifications_sent (user_id, conference_id) VALUES (?, ?)`,
          args: [userId, conferenceId],
        });
      } catch {
        // UNIQUE violation — already sent
        continue;
      }

      const cidStr = String(configId);

      // Gather stats for this rep
      let meetingsHeld = 0;
      let touchpoints = 0;
      let followUpsDue = 0;
      let sesScore: number | null = null;

      try {
        const [mRes, fuRes, tpRes] = await Promise.all([
          tenantDb.execute({
            sql: `SELECT m.id, cop.action_key
                  FROM meetings m
                  LEFT JOIN config_options cop ON cop.category = 'action' AND cop.value = m.outcome
                  WHERE m.conference_id = ? AND ${csvContains('m.scheduled_by')}`,
            args: [conferenceId, cidStr],
          }),
          tenantDb.execute({
            sql: `SELECT fu.id, fu.completed, a.company_id
                  FROM follow_ups fu
                  JOIN attendees a ON fu.attendee_id = a.id
                  WHERE fu.conference_id = ? AND ${csvContains('fu.assigned_rep')}`,
            args: [conferenceId, cidStr],
          }),
          tenantDb.execute({
            sql: `SELECT at.attendee_id, COUNT(*) as cnt
                  FROM attendee_touchpoints at
                  JOIN attendees a ON at.attendee_id = a.id
                  JOIN meetings m ON m.attendee_id = a.id AND m.conference_id = at.conference_id
                  WHERE at.conference_id = ? AND ${csvContains('m.scheduled_by')}
                  GROUP BY at.attendee_id`,
            args: [conferenceId, cidStr],
          }),
        ]);

        const mRows = mRes.rows as Record<string, unknown>[];
        const fuRows = fuRes.rows as Record<string, unknown>[];

        meetingsHeld = mRows.filter(m => String(m.action_key) === 'meeting_held').length;
        followUpsDue = fuRows.filter(fu => !fu.completed).length;
        touchpoints = (tpRes.rows as Record<string, unknown>[]).reduce((s, r) => s + Number(r.cnt), 0);

        if (mRows.length > 0) {
          const holdRate = Math.round((meetingsHeld / mRows.length) * 100);
          const heldCompanyIds = new Set(
            mRows.filter(m => String(m.action_key) === 'meeting_held').map(m => Number(m.company_id ?? -1))
          );
          const fuCompanyIds = new Set(fuRows.map(fu => Number(fu.company_id ?? -1)));
          const fuAttachRate = heldCompanyIds.size > 0
            ? Math.round((Array.from(heldCompanyIds).filter(id => fuCompanyIds.has(id)).length / heldCompanyIds.size) * 100)
            : null;
          sesScore = fuAttachRate != null
            ? Math.round(holdRate * 0.5 + fuAttachRate * 0.5)
            : holdRate;
        }
      } catch {
        // Stats unavailable — send without stats
      }

      const firstName = repName.split(' ')[0] || repName;

      // In-app notification
      try {
        await tenantDb.execute({
          sql: `INSERT INTO notifications
                (user_id, type, record_id, record_name, message,
                 changed_by_config_id, changed_by_email, entity_type, entity_id, is_read)
                VALUES (?, 'conference', ?, ?, ?, NULL, 'system', 'conference', ?, 0)`,
          args: [
            userId, conferenceId, conferenceName,
            `Your post-conference debrief for ${conferenceName} is ready. ${meetingsHeld} meetings held · ${followUpsDue} follow-up${followUpsDue !== 1 ? 's' : ''} due.`,
            conferenceId,
          ],
        });
      } catch { /* non-blocking */ }

      // Email
      try {
        await sendDebriefEmail({
          email: userEmail,
          firstName,
          conferenceName,
          conferenceId,
          meetingsHeld,
          touchpoints,
          followUpsDue,
          sesScore,
        });
      } catch { /* non-blocking */ }

      sent++;
    }
  }

  return sent;
}

export async function GET(request: NextRequest) {
  // Verify Vercel cron secret
  const authHeader = request.headers.get('authorization');
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  await dbReady;

  const now = new Date();
  const todayUtc = now.toISOString().slice(0, 10); // YYYY-MM-DD

  let totalSent = 0;

  // Process master DB (single-tenant / ops users)
  const masterClient = db as ReturnType<typeof createClient>;
  try {
    totalSent += await processAccount(masterClient, 'master', todayUtc);
  } catch { /* */ }

  // Process all tenant accounts
  try {
    const accounts = await db.execute({
      sql: 'SELECT id, turso_db_url, turso_auth_token FROM accounts WHERE turso_db_url IS NOT NULL',
      args: [],
    });

    for (const account of accounts.rows) {
      try {
        const tenantClient = createClient({
          url: String(account.turso_db_url),
          authToken: String(account.turso_auth_token),
        });
        totalSent += await processAccount(tenantClient, String(account.id), todayUtc);
      } catch { /* skip unreachable tenants */ }
    }
  } catch { /* */ }

  console.log(`[debrief-cron] ${APP_NAME} — sent ${totalSent} debrief notification(s) for ${todayUtc}`);
  return NextResponse.json({ ok: true, date: todayUtc, sent: totalSent });
}
