import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';
import { db, dbReady } from '@/lib/db';
import { signToken, authCookieOptions, validatePassword } from '@/lib/auth';

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
      // Optional survey fields
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
      return NextResponse.json({ error: 'All fields are required.' }, { status: 400 });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json({ error: 'Invalid email address.' }, { status: 400 });
    }

    const pwCheck = validatePassword(password);
    if (!pwCheck.valid) {
      return NextResponse.json({ error: pwCheck.error }, { status: 400 });
    }

    // Reject if any users already exist (this DB is already claimed)
    const countRes = await db.execute({ sql: 'SELECT COUNT(*) as cnt FROM users', args: [] });
    if (Number(countRes.rows[0].cnt) > 0) {
      return NextResponse.json({ error: 'This account is already set up.' }, { status: 409 });
    }

    const password_hash = await bcrypt.hash(password, 12);

    const result = await db.execute({
      sql: `INSERT INTO users (email, password_hash, role, email_verified, active, first_name, last_name)
            VALUES (?, ?, 'administrator', 1, 1, ?, ?)
            RETURNING id`,
      args: [email, password_hash, firstName, lastName],
    });

    const userId = Number(result.rows[0].id);

    // Seed company name into site_settings branding
    await db.execute({
      sql: `INSERT OR REPLACE INTO site_settings (key, value) VALUES ('app_name', ?)`,
      args: [companyName],
    }).catch(() => {});

    // Set trial dates (14-day trial + 2-day grace)
    const now = new Date();
    const trialExpires = new Date(now);
    trialExpires.setDate(trialExpires.getDate() + 14);
    const graceEnds = new Date(now);
    graceEnds.setDate(graceEnds.getDate() + 16);

    const onboardingTrack = conferenceTimingAnswer === 'upcoming' ? 'track_a' : 'track_b';

    const trialSettings: Array<[string, string]> = [
      ['plan_id', 'trial'],
      ['trial_expires_at', trialExpires.toISOString()],
      ['grace_period_ends_at', graceEnds.toISOString()],
      ['onboarding_track', onboardingTrack],
      ['onboarding_completed', 'false'],
    ];

    await Promise.all(
      trialSettings.map(([key, value]) =>
        db.execute({
          sql: `INSERT OR REPLACE INTO site_settings (key, value) VALUES (?, ?)`,
          args: [key, value],
        }).catch(() => {})
      )
    );

    // Also store survey fields in site_settings
    const surveySettings: Array<[string, string]> = [
      ['signup_role', signupRole],
      ['signup_industry', signupIndustry],
      ['signup_team_size', signupTeamSize],
      ['signup_conferences_per_year', signupConferencesPerYear],
      ['signup_primary_goal', signupPrimaryGoal],
      ['signup_current_tool', signupCurrentTool],
    ];
    await Promise.all(
      surveySettings.filter(([, v]) => v).map(([key, value]) =>
        db.execute({ sql: `INSERT OR REPLACE INTO site_settings (key, value) VALUES (?, ?)`, args: [key, value] }).catch(() => {})
      )
    );

    // Register in central accounts table
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
    }).catch(() => {});

    const sessionUser = {
      id: userId,
      email,
      role: 'administrator' as const,
      emailVerified: true,
    };

    const token = await signToken(sessionUser);
    const redirectTo = conferenceTimingAnswer === 'upcoming' ? '/onboarding/track-a' : '/onboarding/track-b';

    const response = NextResponse.json({
      success: true,
      redirectTo,
      onboardingTrack,
    });
    response.cookies.set({ ...authCookieOptions(), value: token });
    return response;
  } catch (err) {
    console.error('Trial signup error:', err);
    return NextResponse.json({ error: 'Signup failed. Please try again.' }, { status: 500 });
  }
}
