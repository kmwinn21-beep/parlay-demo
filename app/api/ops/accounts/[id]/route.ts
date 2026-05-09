import { NextRequest, NextResponse } from 'next/server';
import { requireOpsAdmin } from '@/lib/opsAuth';
import { db, dbReady } from '@/lib/db';
import { createTenantDb } from '@/lib/tenantDb';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireOpsAdmin(request);
  if (auth instanceof NextResponse) return auth;

  await dbReady;

  const accountRes = await db.execute({
    sql: `SELECT * FROM accounts WHERE id = ?`,
    args: [params.id],
  });

  if (!accountRes.rows[0]) {
    return NextResponse.json({ error: 'Account not found.' }, { status: 404 });
  }

  const account = accountRes.rows[0];
  let users: unknown[] = [];
  let timeline: Array<{ event: string; timestamp: string }> = [];

  // Connect to tenant DB if credentials are stored
  const tursoDbUrl = String(account.turso_db_url ?? '');
  const tursoAuthToken = String(account.turso_auth_token ?? '');

  if (tursoDbUrl && tursoAuthToken) {
    try {
      const tenantDb = createTenantDb(tursoDbUrl, tursoAuthToken);

      const [usersRes, confsRes, importsRes, invitesRes] = await Promise.all([
        tenantDb.execute({
          sql: `SELECT id, first_name, last_name, email, role, last_seen_at, active FROM users ORDER BY created_at ASC`,
          args: [],
        }).catch(() => ({ rows: [] })),
        tenantDb.execute({
          sql: `SELECT MIN(created_at) as first_conf FROM conferences`,
          args: [],
        }).catch(() => ({ rows: [] })),
        tenantDb.execute({
          sql: `SELECT MIN(created_at) as first_import FROM conference_attendees`,
          args: [],
        }).catch(() => ({ rows: [] })),
        tenantDb.execute({
          sql: `SELECT MIN(created_at) as first_invite FROM users WHERE invite_token IS NOT NULL OR invite_expires IS NOT NULL`,
          args: [],
        }).catch(() => ({ rows: [] })),
      ]);

      users = usersRes.rows;

      // Build timeline from account record + tenant data
      const events: Array<{ event: string; timestamp: string }> = [];

      const addEvent = (event: string, ts: unknown) => {
        if (ts && String(ts)) events.push({ event, timestamp: String(ts) });
      };

      addEvent('Account created', account.created_at);
      addEvent('First conference created', confsRes.rows[0]?.first_conf);
      addEvent('First attendee list uploaded', importsRes.rows[0]?.first_import);
      addEvent('Team member invited', invitesRes.rows[0]?.first_invite);

      if (String(account.trial_reminder_12_sent ?? '') === 'true') {
        addEvent('Trial reminder sent (day 12)', account.trial_expires_at
          ? new Date(new Date(String(account.trial_expires_at)).getTime() - 2 * 86400000).toISOString()
          : '');
      }
      if (String(account.trial_reminder_13_sent ?? '') === 'true') {
        addEvent('Trial reminder sent (day 13)', account.trial_expires_at
          ? new Date(new Date(String(account.trial_expires_at)).getTime() - 1 * 86400000).toISOString()
          : '');
      }
      if (String(account.trial_reminder_14_sent ?? '') === 'true') {
        addEvent('Trial reminder sent (day 14)', account.trial_expires_at);
      }
      if (account.activated_plan_at && String(account.activated_plan_at)) {
        addEvent('Plan activated', account.activated_plan_at);
      }
      const trialExpiry = account.trial_expires_at ? String(account.trial_expires_at) : '';
      if (trialExpiry && new Date(trialExpiry) < new Date()) {
        addEvent('Trial expired', trialExpiry);
      }

      timeline = events
        .filter(e => e.timestamp)
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    } catch {
      // Tenant DB unavailable — return what we have
    }
  } else {
    // Build minimal timeline from account record alone
    const events: Array<{ event: string; timestamp: string }> = [];
    if (account.created_at) events.push({ event: 'Account created', timestamp: String(account.created_at) });
    if (account.activated_plan_at && String(account.activated_plan_at)) {
      events.push({ event: 'Plan activated', timestamp: String(account.activated_plan_at) });
    }
    timeline = events;
  }

  // Remove sensitive credentials from account response
  const { turso_auth_token: _tok, ...safeAccount } = account as Record<string, unknown>;
  void _tok;

  return NextResponse.json({ account: safeAccount, users, timeline });
}
