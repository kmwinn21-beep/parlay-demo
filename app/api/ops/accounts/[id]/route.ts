import { NextRequest, NextResponse } from 'next/server';
import { requireOpsAdmin } from '@/lib/opsAuth';
import { db, dbReady } from '@/lib/db';
import { createTenantDb } from '@/lib/tenantDb';
import { clerkClient } from '@clerk/nextjs/server';

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

  const [
    eventsRes,
    sessionsRes,
    featureUsageRes,
    dailySessionsRes,
    weeklyEventsRes,
  ] = await Promise.all([
    db.execute({
      sql: `SELECT event_type, COUNT(*) as count, MAX(created_at) as last_at
            FROM account_events
            WHERE account_id = ? AND created_at >= datetime('now', '-30 days')
            GROUP BY event_type
            ORDER BY count DESC`,
      args: [params.id],
    }).catch(() => ({ rows: [] })),
    db.execute({
      sql: `SELECT COUNT(*) as total,
                   COUNT(DISTINCT DATE(started_at)) as active_days,
                   MAX(started_at) as last_session
            FROM account_sessions
            WHERE account_id = ? AND started_at >= datetime('now', '-30 days')`,
      args: [params.id],
    }).catch(() => ({ rows: [] })),
    db.execute({
      sql: `SELECT feature_key, SUM(use_count) as total_uses, MAX(last_used_at) as last_used
            FROM account_feature_usage
            WHERE account_id = ?
            GROUP BY feature_key
            ORDER BY total_uses DESC`,
      args: [params.id],
    }).catch(() => ({ rows: [] })),
    db.execute({
      sql: `SELECT DATE(started_at) as day, COUNT(*) as logins
            FROM account_sessions
            WHERE account_id = ? AND started_at >= datetime('now', '-14 days')
            GROUP BY DATE(started_at)
            ORDER BY day ASC`,
      args: [params.id],
    }).catch(() => ({ rows: [] })),
    db.execute({
      sql: `SELECT
              SUM(CASE WHEN created_at >= datetime('now', '-7 days') THEN 1 ELSE 0 END) as this_week,
              SUM(CASE WHEN created_at < datetime('now', '-7 days') AND created_at >= datetime('now', '-14 days') THEN 1 ELSE 0 END) as last_week
            FROM account_events
            WHERE account_id = ?`,
      args: [params.id],
    }).catch(() => ({ rows: [] })),
  ]);

  let users: unknown[] = [];
  let timeline: Array<{ event: string; timestamp: string }> = [];
  let tenantMetrics = {
    conferences_count: 0,
    attendees_count: 0,
    meetings_count: 0,
    followups_completed: 0,
    companies_count: 0,
    first_conf_at: null as string | null,
    first_upload_at: null as string | null,
    first_invite_at: null as string | null,
    user_logins_total: 0,
  };
  let setupProgress = {
    account_created: true,
    conference_added: false,
    attendees_uploaded: false,
    icp_configured: false,
    team_invited: false,
    budget_saved: false,
  };

  const tursoDbUrl = String(account.turso_db_url ?? '');
  const tursoAuthToken = String(account.turso_auth_token ?? '');

  if (tursoDbUrl && tursoAuthToken) {
    try {
      const tenantDb = createTenantDb(tursoDbUrl, tursoAuthToken);

      const [
        usersRes,
        confsRes,
        attendeesRes,
        meetingsRes,
        followupsRes,
        companiesRes,
        importsRes,
        invitesRes,
        icpRes,
        budgetRes,
        loginSessionsRes,
      ] = await Promise.all([
        tenantDb.execute({
          sql: `SELECT id, first_name, last_name, email, role, last_seen_at, active,
                       (SELECT COUNT(*) FROM user_sessions us WHERE us.user_id = users.id) as login_count
                FROM users ORDER BY created_at ASC`,
          args: [],
        }).catch(() => ({ rows: [] })),
        tenantDb.execute({
          sql: `SELECT COUNT(*) as count, MIN(created_at) as first_conf FROM conferences`,
          args: [],
        }).catch(() => ({ rows: [] })),
        tenantDb.execute({
          sql: `SELECT COUNT(*) as count FROM conference_attendees`,
          args: [],
        }).catch(() => ({ rows: [] })),
        tenantDb.execute({
          sql: `SELECT COUNT(*) as count FROM meetings`,
          args: [],
        }).catch(() => ({ rows: [] })),
        tenantDb.execute({
          sql: `SELECT COUNT(*) as count FROM conference_attendee_details WHERE completed = 1`,
          args: [],
        }).catch(() => ({ rows: [] })),
        tenantDb.execute({
          sql: `SELECT COUNT(*) as count FROM companies`,
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
        tenantDb.execute({
          sql: `SELECT COUNT(*) as count FROM icp_rules LIMIT 1`,
          args: [],
        }).catch(() => ({ rows: [{ count: 0 }] })),
        tenantDb.execute({
          sql: `SELECT COUNT(*) as count FROM conference_budget LIMIT 1`,
          args: [],
        }).catch(() => ({ rows: [{ count: 0 }] })),
        tenantDb.execute({
          sql: `SELECT COUNT(*) as count FROM user_sessions WHERE created_at >= datetime('now', '-30 days')`,
          args: [],
        }).catch(() => ({ rows: [] })),
      ]);

      users = usersRes.rows;

      tenantMetrics = {
        conferences_count: Number(confsRes.rows[0]?.count ?? 0),
        attendees_count: Number(attendeesRes.rows[0]?.count ?? 0),
        meetings_count: Number(meetingsRes.rows[0]?.count ?? 0),
        followups_completed: Number(followupsRes.rows[0]?.count ?? 0),
        companies_count: Number(companiesRes.rows[0]?.count ?? 0),
        first_conf_at: confsRes.rows[0]?.first_conf ? String(confsRes.rows[0].first_conf) : null,
        first_upload_at: importsRes.rows[0]?.first_import ? String(importsRes.rows[0].first_import) : null,
        first_invite_at: invitesRes.rows[0]?.first_invite ? String(invitesRes.rows[0].first_invite) : null,
        user_logins_total: Number(loginSessionsRes.rows[0]?.count ?? 0),
      };

      setupProgress = {
        account_created: true,
        conference_added: tenantMetrics.conferences_count > 0,
        attendees_uploaded: tenantMetrics.attendees_count > 0,
        icp_configured: Number(icpRes.rows[0]?.count ?? 0) > 0,
        team_invited: (users as Array<{ invite_token?: unknown; invite_expires?: unknown }>).some(u => u.invite_token || u.invite_expires) || users.length > 1,
        budget_saved: Number(budgetRes.rows[0]?.count ?? 0) > 0,
      };

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
          ? new Date(new Date(String(account.trial_expires_at)).getTime() - 86400000).toISOString()
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
      // Tenant DB unavailable
    }
  } else {
    const events: Array<{ event: string; timestamp: string }> = [];
    if (account.created_at) events.push({ event: 'Account created', timestamp: String(account.created_at) });
    if (account.activated_plan_at && String(account.activated_plan_at)) {
      events.push({ event: 'Plan activated', timestamp: String(account.activated_plan_at) });
    }
    timeline = events;
  }

  const setupScore = Object.values(setupProgress).filter(Boolean).length / Object.keys(setupProgress).length;
  const sessionRow = sessionsRes.rows[0] as Record<string, unknown> | undefined;
  const activeDays = Number(sessionRow?.active_days ?? 0);
  const activityScore = Math.min(activeDays / 20, 1);
  const featureCount = featureUsageRes.rows.length;
  const featureScore = Math.min(featureCount / 5, 1);
  const weeklyRow = weeklyEventsRes.rows[0] as Record<string, unknown> | undefined;
  const thisWeek = Number(weeklyRow?.this_week ?? 0);
  const engagementScore = Math.min(thisWeek / 10, 1);

  const healthScore = Math.round(
    setupScore * 30 + activityScore * 30 + featureScore * 20 + engagementScore * 20
  );

  const dailySessionMap: Record<string, number> = {};
  for (const row of dailySessionsRes.rows) {
    const r = row as Record<string, unknown>;
    dailySessionMap[String(r.day)] = Number(r.logins);
  }
  const dailySessions: Array<{ day: string; logins: number }> = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    dailySessions.push({ day: key, logins: dailySessionMap[key] ?? 0 });
  }

  const { turso_auth_token: _tok, ...safeAccount } = account as Record<string, unknown>;
  void _tok;

  return NextResponse.json({
    account: safeAccount,
    users,
    timeline,
    healthScore,
    tenantMetrics,
    setupProgress,
    eventSummary: eventsRes.rows,
    featureUsage: featureUsageRes.rows,
    dailySessions,
    weekOverWeek: {
      thisWeek: Number(weeklyRow?.this_week ?? 0),
      lastWeek: Number(weeklyRow?.last_week ?? 0),
    },
    sessionSummary: {
      totalSessions: Number(sessionRow?.total ?? 0),
      activeDays: Number(sessionRow?.active_days ?? 0),
      lastSession: sessionRow?.last_session ? String(sessionRow.last_session) : null,
    },
  });
}

async function deleteTursoDatabase(dbName: string): Promise<void> {
  const org = process.env.TURSO_ORG;
  const token = process.env.TURSO_PLATFORM_TOKEN;
  if (!org || !token) return; // skip if not configured
  await fetch(`https://api.turso.tech/v1/organizations/${org}/databases/${dbName}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
}

function dbNameFromUrl(url: string): string | null {
  // libsql://parlay-acme.aws-us-west-2.turso.io → parlay-acme
  const match = url.match(/libsql:\/\/([^.]+)\./);
  return match?.[1] ?? null;
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const auth = await requireOpsAdmin(request);
  if (auth instanceof NextResponse) return auth;

  await dbReady;

  const accountRow = await db.execute({
    sql: `SELECT id, admin_email, turso_db_url, company_name FROM accounts WHERE id = ?`,
    args: [params.id],
  });

  if (!accountRow.rows[0]) {
    return NextResponse.json({ error: 'Account not found' }, { status: 404 });
  }

  const { admin_email, turso_db_url, company_name } = accountRow.rows[0];
  const results: Record<string, string> = {};

  // 1. Delete Turso tenant DB
  const dbUrl = turso_db_url ? String(turso_db_url) : null;
  if (dbUrl) {
    const dbName = dbNameFromUrl(dbUrl);
    if (dbName) {
      try {
        await deleteTursoDatabase(dbName);
        results.turso_db = `deleted (${dbName})`;
      } catch (e) {
        results.turso_db = `failed: ${String(e)}`;
      }
    }
  } else {
    results.turso_db = 'skipped (no tenant DB)';
  }

  // 2. Delete Clerk user if Clerk is configured
  if (process.env.CLERK_SECRET_KEY && admin_email) {
    try {
      const found = await clerkClient.users.getUserList({ emailAddress: [String(admin_email)] });
      const clerkUser = found.data?.[0] ?? found[0 as never] as typeof found.data[0] | undefined;
      if (clerkUser) {
        await clerkClient.users.deleteUser(clerkUser.id);
        results.clerk_user = `deleted (${clerkUser.id})`;
      } else {
        results.clerk_user = 'not found in Clerk';
      }
    } catch (e) {
      results.clerk_user = `failed: ${String(e)}`;
    }
  } else {
    results.clerk_user = 'skipped (Clerk not configured)';
  }

  // 3. Delete from master DB (cascading cleanup)
  await Promise.all([
    db.execute({ sql: `DELETE FROM account_events       WHERE account_id = ?`, args: [params.id] }).catch(() => {}),
    db.execute({ sql: `DELETE FROM account_sessions     WHERE account_id = ?`, args: [params.id] }).catch(() => {}),
    db.execute({ sql: `DELETE FROM account_feature_usage WHERE account_id = ?`, args: [params.id] }).catch(() => {}),
    db.execute({ sql: `DELETE FROM impersonation_sessions WHERE account_id = ?`, args: [params.id] }).catch(() => {}),
  ]);

  await db.execute({ sql: `DELETE FROM accounts WHERE id = ?`, args: [params.id] });
  results.master_db = 'deleted';

  return NextResponse.json({
    deleted: true,
    accountId: params.id,
    companyName: String(company_name ?? ''),
    email: String(admin_email ?? ''),
    results,
  });
}
