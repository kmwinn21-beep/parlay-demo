import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { db, dbReady } from '@/lib/db';
import { signToken, authCookieOptions, validateEmail, validatePassword } from '@/lib/auth';
import { sendVerificationEmail } from '@/lib/email';

export async function POST(request: NextRequest) {
  try {
    const { email: rawEmail, password, name } = await request.json();

    const passwordCheck = validatePassword(password ?? '');
    if (!passwordCheck.valid) {
      return NextResponse.json({ error: passwordCheck.error }, { status: 400 });
    }

    const email = rawEmail.trim().toLowerCase();

    await dbReady;

    // Read allowed domain from DB (admin-configurable), fall back to env var
    let allowedDomain: string | null = process.env.ALLOWED_EMAIL_DOMAIN ?? null;
    try {
      const settingRow = await db.execute({ sql: "SELECT value FROM site_settings WHERE key = 'allowed_email_domain'", args: [] });
      if (settingRow.rows[0]) allowedDomain = String(settingRow.rows[0].value) || null;
    } catch { /* ignore — use env var fallback */ }

    const emailCheck = validateEmail(rawEmail ?? '', allowedDomain);
    if (!emailCheck.valid) {
      return NextResponse.json({ error: emailCheck.error }, { status: 400 });
    }

    // Check for existing account
    const existing = await db.execute({
      sql: 'SELECT id FROM users WHERE email = ?',
      args: [email],
    });
    if (existing.rows.length > 0) {
      return NextResponse.json(
        { error: 'An account with this email already exists.' },
        { status: 409 }
      );
    }

    // Hash password + generate verification token
    const password_hash = await bcrypt.hash(password, 12);
    const verification_token = crypto.randomUUID();

    // Create user (role defaults to 'user')
    const result = await db.execute({
      sql: `INSERT INTO users (email, password_hash, role, email_verified, verification_token)
            VALUES (?, ?, 'user', 0, ?)`,
      args: [email, password_hash, verification_token],
    });

    const userId = Number(result.lastInsertRowid);

    // Send verification email (non-blocking — failure doesn't prevent signup)
    let devLink: string | undefined;
    try {
      const emailResult = await sendVerificationEmail(email, verification_token);
      devLink = emailResult.devLink;
    } catch (err) {
      console.error('Failed to send verification email:', err);
    }

    // Issue session token so the user is logged in immediately
    const token = await signToken({
      id: userId,
      email,
      role: 'user',
      emailVerified: false,
    });

    const response = NextResponse.json(
      {
        message: 'Account created. Please verify your email.',
        ...(devLink ? { devVerifyLink: devLink } : {}),
      },
      { status: 201 }
    );
    response.cookies.set({ ...authCookieOptions(), value: token });
    return response;
  } catch (err) {
    console.error('Signup error:', err);
    return NextResponse.json({ error: 'Failed to create account.' }, { status: 500 });
  }
}
