import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { db, dbReady } from '@/lib/db';
import { signToken, authCookieOptions } from '@/lib/auth';
import { resolvePlanState } from '@/lib/trialState';
import { sendTrialReminderEmail } from '@/lib/email';
import { createTenantDb } from '@/lib/tenantDb';
import type { Client } from '@libsql/client';

export async function POST(request: NextRequest) {
  try {
    const { email: rawEmail, password } = await request.json();

    if (!rawEmail || !password) {
      return NextResponse.json({ error: 'Email and password are required.' }, { status: 400 });
    }

    const email = String(rawEmail).trim().toLowerCase();

    await dbReady;

    // Look up account by email to find tenant DB credentials
    const accountRow = await db.execute({
      sql: `SELECT id, turso_db_url, turso_auth_token FROM accounts WHERE admin_email = ?`,
      args: [email],
    });

    let tenantClient: Client | null = null;
    let accountId: string | undefined;

    if (accountRow.rows[0]?.turso_db_url) {
      accountId = String(accountRow.rows[0].id);
      tenantClient = createTenantDb(
        String(accountRow.rows[0].turso_db_url),
        String(accountRow.rows[0].turso_auth_token),
      );
    }

    // Query users from tenant DB (if found) or fall back to master DB (ops users)
    const userDb: Client = tenantClient ?? db;
    const result = await userDb.execute({
      sql: 'SELECT id, email, password_hash, role, email_verified, active, first_name FROM users WHERE email = ?',
      args: [email],
    });

    if (result.rows.length === 0) {
      await bcrypt.compare(password, '$2a$12$dummyhashtopreventtimingattacks00000000000000000000000');
      return NextResponse.json({ error: 'Invalid email or password.' }, { status: 401 });
    }

    const user = result.rows[0];
    const valid = await bcrypt.compare(password, String(user.password_hash));
    if (!valid) {
      return NextResponse.json({ error: 'Invalid email or password.' }, { status: 401 });
    }

    if (user.active === 0 || user.active === '0') {
      return NextResponse.json({ error: 'Your account has been deactivated. Please contact an administrator.' }, { status: 403 });
    }

    const sessionUser = {
      id: Number(user.id),
      email: String(user.email),
      role: String(user.role) as 'user' | 'administrator',
      emailVerified: Boolean(user.email_verified),
      accountId,
    };

    const token = await signToken(sessionUser);

    // Record login session and update last_seen_at (fire-and-forget)
    userDb.execute({
      sql: 'INSERT INTO user_sessions (user_id, ip_address, user_agent) VALUES (?, ?, ?)',
      args: [sessionUser.id, request.headers.get('x-forwarded-for') ?? null, request.headers.get('user-agent') ?? null],
    }).catch(() => {});
    userDb.execute({
      sql: `UPDATE users SET last_seen_at = datetime('now') WHERE id = ?`,
      args: [sessionUser.id],
    }).catch(() => {});

    // Fire-and-forget: send trial reminder emails if nearing expiry
    let redirectTo: string | undefined;
    resolvePlanState(tenantClient ?? undefined).then(async (planState) => {
      if (planState.trialState === 'active' && planState.daysRemaining != null && planState.daysRemaining <= 3) {
        const keyMap: Record<number, string> = { 3: 'trial_reminder_12_sent', 2: 'trial_reminder_13_sent', 1: 'trial_reminder_14_sent' };
        const sentKey = keyMap[planState.daysRemaining];
        if (sentKey) {
          const sentRes = await userDb.execute({
            sql: `SELECT value FROM site_settings WHERE key = ?`,
            args: [sentKey],
          }).catch(() => ({ rows: [] }));
          const alreadySent = String(sentRes.rows[0]?.value ?? 'false') === 'true';
          if (!alreadySent) {
            const upgradeUrl = `${process.env.NEXT_PUBLIC_BASE_URL ?? 'https://work.useparlay.app'}/?upgrade=true`;
            sendTrialReminderEmail(email, String(user.first_name ?? email.split('@')[0]), planState.daysRemaining, upgradeUrl).catch(() => {});
            userDb.execute({ sql: `INSERT OR REPLACE INTO site_settings (key, value) VALUES (?, 'true')`, args: [sentKey] }).catch(() => {});
          }
        }
      }
    }).catch(() => {});

    // Check if onboarding is pending
    const onboardingCheck = await userDb.execute({
      sql: `SELECT key, value FROM site_settings WHERE key IN ('onboarding_completed', 'onboarding_track')`,
      args: [],
    }).catch(() => ({ rows: [] }));
    const onboardingMap = Object.fromEntries(onboardingCheck.rows.map(r => [String(r.key), String(r.value ?? '')]));
    if (onboardingMap['onboarding_completed'] === 'false' && onboardingMap['onboarding_track']) {
      redirectTo = onboardingMap['onboarding_track'] === 'track_a' ? '/onboarding/track-a' : '/onboarding/track-b';
    }

    const response = NextResponse.json({ message: 'Logged in.', user: { email: sessionUser.email, role: sessionUser.role }, redirectTo });
    response.cookies.set({ ...authCookieOptions(), value: token });
    return response;
  } catch (err) {
    console.error('Login error:', err);
    return NextResponse.json({ error: 'Login failed.' }, { status: 500 });
  }
}
