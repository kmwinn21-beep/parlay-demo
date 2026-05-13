import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';
import { db, dbReady } from '@/lib/db';
import { signToken, authCookieOptions, validatePassword } from '@/lib/auth';
import { provisionAccount } from '@/lib/provision';

const ALLOWED_ORIGINS = new Set(['https://useparlay.app', 'https://www.useparlay.app']);

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

    if (!firstName || !lastName || !email || !password || !companyName) {
      return NextResponse.json({ error: 'All fields are required.' }, { status: 400, headers: getCorsHeaders(request) });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json({ error: 'Invalid email address.' }, { status: 400, headers: getCorsHeaders(request) });
    }

    const pwCheck = validatePassword(password);
    if (!pwCheck.valid) {
      return NextResponse.json({ error: pwCheck.error }, { status: 400, headers: getCorsHeaders(request) });
    }

    // Reject if email already has an account
    const existing = await db.execute({ sql: 'SELECT id FROM accounts WHERE admin_email = ?', args: [email] });
    if (existing.rows.length > 0) {
      return NextResponse.json({ error: 'An account with this email already exists.' }, { status: 409, headers: getCorsHeaders(request) });
    }

    const passwordHash = await bcrypt.hash(password, 12);

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
    const { slug } = await provisionAccount({
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

    // We don't know the userId in the tenant DB yet — query it
    // (provisioning inserted the user; get the id for the JWT)
    // For now sign with id=0; the me route will re-fetch the real user from tenant DB
    const sessionUser = {
      id: 0,
      email,
      role: 'administrator' as const,
      emailVerified: true,
      accountId,
    };

    const token = await signToken(sessionUser);
    const redirectTo = `https://work.useparlay.app/?welcome=true`;

    const response = NextResponse.json({
      success: true,
      redirectTo,
      onboardingTrack,
    }, { headers: getCorsHeaders(request) });
    response.cookies.set({ ...authCookieOptions(), value: token });
    return response;
  } catch (err) {
    console.error('Trial signup error:', err);
    return NextResponse.json({ error: 'Signup failed. Please try again.' }, { status: 500, headers: getCorsHeaders(request) });
  }
}
