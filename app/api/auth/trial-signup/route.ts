import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';
import { db, dbReady } from '@/lib/db';
import { signToken, authCookieOptions, validatePassword } from '@/lib/auth';
import { provisionAccount } from '@/lib/provision';
import { createTenantDb } from '@/lib/tenantDb';
import { sendWelcomeEmail } from '@/lib/email';

const ALLOWED_ORIGINS = new Set(['https://useparlay.app', 'https://www.useparlay.app']);

// When Clerk is configured, users complete authentication through Clerk's hosted
// sign-up flow (SSO or email/password) — no password is collected here.
const CLERK_MODE = !!process.env.CLERK_SECRET_KEY;

function getCorsHeaders(request: NextRequest) {
  const origin = request.headers.get('origin') ?? '';
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGINS.has(origin) ? origin : 'https://useparlay.app',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Credentials': 'true',
  };
}

export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, { status: 204, headers: getCorsHeaders(request) });
}

export async function POST(request: NextRequest) {
  try {
    await dbReady;

    const body = await request.json() as {
      firstName?: string;
      lastName?: string;
      email?: string;
      password?: string;
      companyName?: string;
      conferenceTimingAnswer?: 'upcoming' | 'planning';
      signupRole?: string;
      signupIndustry?: string;
      signupTeamSize?: string;
      signupConferencesPerYear?: string;
      signupPrimaryGoal?: string;
      signupCurrentTool?: string;
    };

    const firstName = body.firstName?.trim() ?? '';
    const lastName = body.lastName?.trim() ?? '';
    const email = body.email?.trim().toLowerCase() ?? '';
    const password = body.password ?? '';
    const companyName = body.companyName?.trim() ?? '';
    const conferenceTimingAnswer = body.conferenceTimingAnswer ?? 'upcoming';
    const signupRole = body.signupRole?.trim() ?? '';
    const signupIndustry = body.signupIndustry?.trim() ?? '';
    const signupTeamSize = body.signupTeamSize?.trim() ?? '';
    const signupConferencesPerYear = body.signupConferencesPerYear?.trim() ?? '';
    const signupPrimaryGoal = body.signupPrimaryGoal?.trim() ?? '';
    const signupCurrentTool = body.signupCurrentTool?.trim() ?? '';

    // In Clerk mode, password is not collected — Clerk handles authentication.
    // In legacy mode, password is required for the JWT session.
    const requiredFields = CLERK_MODE
      ? !firstName || !lastName || !email || !companyName
      : !firstName || !lastName || !email || !password || !companyName;

    if (requiredFields) {
      return NextResponse.json({ error: 'All fields are required.' }, { status: 400, headers: getCorsHeaders(request) });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json({ error: 'Invalid email address.' }, { status: 400, headers: getCorsHeaders(request) });
    }

    if (!CLERK_MODE) {
      const pwCheck = validatePassword(password);
      if (!pwCheck.valid) {
        return NextResponse.json({ error: pwCheck.error }, { status: 400, headers: getCorsHeaders(request) });
      }
    }

    // Reject if email already has an account
    const existing = await db.execute({ sql: 'SELECT id FROM accounts WHERE admin_email = ?', args: [email] });
    if (existing.rows.length > 0) {
      return NextResponse.json({ error: 'An account with this email already exists.' }, { status: 409, headers: getCorsHeaders(request) });
    }

    // In Clerk mode, store a random unusable hash — the user will never log in
    // with a password through Parlay's backend; Clerk handles real authentication.
    const passwordHash = await bcrypt.hash(CLERK_MODE ? randomUUID() : password, 12);

    // Set trial dates (14-day trial + 2-day grace)
    const now = new Date();
    const trialExpires = new Date(now);
    trialExpires.setDate(trialExpires.getDate() + 14);
    const graceEnds = new Date(now);
    graceEnds.setDate(graceEnds.getDate() + 16);

    const onboardingTrack = conferenceTimingAnswer === 'upcoming' ? 'track_a' : 'track_b';

    // Register account in master DB first
    const accountId = randomUUID();
    await db.execute({
      sql: `INSERT OR IGNORE INTO accounts (
        id, company_name, admin_email, admin_first_name, admin_last_name,
        plan_id, trial_expires_at, grace_period_ends_at, onboarding_track,
        signup_role, signup_industry, signup_team_size,
        signup_conferences_per_year, signup_primary_goal, signup_current_tool
      ) VALUES (?, ?, ?, ?, ?, 'trial', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        accountId, companyName, email, firstName, lastName,
        trialExpires.toISOString(), graceEnds.toISOString(), onboardingTrack,
        signupRole || null, signupIndustry || null, signupTeamSize || null,
        signupConferencesPerYear || null, signupPrimaryGoal || null, signupCurrentTool || null,
      ],
    });

    // Provision tenant DB (create Turso DB, seed schema, insert user + site_settings)
    const { tursoDbUrl, tursoAuthToken } = await provisionAccount({
      accountId,
      companyName,
      email,
      firstName,
      lastName,
      passwordHash,
      trialExpiresAt: trialExpires.toISOString(),
      gracePeriodEndsAt: graceEnds.toISOString(),
      onboardingTrack,
      surveyFields: {
        signup_role: signupRole,
        signup_industry: signupIndustry,
        signup_team_size: signupTeamSize,
        signup_conferences_per_year: signupConferencesPerYear,
        signup_primary_goal: signupPrimaryGoal,
        signup_current_tool: signupCurrentTool,
      },
    });

    sendWelcomeEmail({ to: email, firstName, onboardingTrack }).catch(err => {
      console.error('[trial-signup] Welcome email failed:', err);
    });

    if (CLERK_MODE) {
      // Redirect to Clerk's sign-up page with email pre-filled.
      // The user completes authentication there (SSO or email/password).
      // The Clerk webhook (user.created) will sync account_id + parlay_user_id
      // into Clerk publicMetadata by matching on accounts.admin_email.
      const redirectTo = `https://work.useparlay.app/auth/signup?email=${encodeURIComponent(email)}&welcome=true`;
      return NextResponse.json({ success: true, redirectTo, onboardingTrack }, { headers: getCorsHeaders(request) });
    }

    // Legacy mode: create a JWT session immediately so the user lands logged in.
    const tenantClient = createTenantDb(tursoDbUrl, tursoAuthToken);
    const userRow = await tenantClient.execute({
      sql: 'SELECT id FROM users WHERE email = ?',
      args: [email],
    });
    const parlayUserId = Number(userRow.rows[0]?.id ?? 1);

    const sessionUser = {
      id: parlayUserId,
      email,
      role: 'administrator' as const,
      emailVerified: true,
      accountId,
    };

    const token = await signToken(sessionUser);
    const redirectTo = `https://work.useparlay.app/?welcome=true`;

    const response = NextResponse.json({ success: true, redirectTo, onboardingTrack }, { headers: getCorsHeaders(request) });
    response.cookies.set({ ...authCookieOptions(), value: token });
    return response;
  } catch (err) {
    console.error('Trial signup error:', err);
    return NextResponse.json({ error: 'Signup failed. Please try again.' }, { status: 500, headers: getCorsHeaders(request) });
  }
}
