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

  // Fetch tracking data from master DB
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
    // Daily sessions last 14 days for chart
    db.execute({
      sql: `SELECT DATE(started_at) as day, COUNT(*) as logins
            FROM account_sessions
            WHERE account_id = ? AND started_at >= datetime('now', '-14 days')
            GROUP BY DATE(started_at)
            ORDER BY day ASC`,
      args: [params.id],
    }).catch(() => ({ rows: [] })),
    // Week-over-week event counts
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

  // Connect to tenant DB if credentials are stored
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

      // Build timeline
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

  // Compute health score (0–100)
  const setupScore = Object.values(setupProgress).filter(Boolean).length / Object.keys(setupProgress).length;
  const sessionRow = sessionsRes.rows[0] as Record<string, unknown> | undefined;
  const activeDays = Number(sessionRow?.active_days ?? 0);
  const activityScore = Math.min(activeDays / 20, 1); // 20 active days in 30 = full score
  const featureCount = featureUsageRes.rows.length;
  const featureScore = Math.min(featureCount / 5, 1); // 5+ features used = full score
  const weeklyRow = weeklyEventsRes.rows[0] as Record<string, unknown> | undefined;
  const thisWeek = Number(weeklyRow?.this_week ?? 0);
  const engagementScore = Math.min(thisWeek / 10, 1); // 10+ events this week = full score

  const healthScore = Math.round(
    (setupScore * 30 + activityScore * 30 + featureScore * 20 + engagementScore * 20) * 100
  ) / 100;

  // Build daily sessions map for last 14 days
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

  // Remove sensitive credentials from account response
  const { turso_auth_token: _tok, ...safeAccount } = account as Record<string, unknown>;
  void _tok;

  return NextResponse.json({
    account: safeAccount,
    users,
    timeline,
    healthScore: Math.round(healthScore * 100),
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
