import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { db, dbReady } from '@/lib/db';
import { signToken, authCookieOptions, validateEmail, validatePassword } from '@/lib/auth';

async function getUserCount(): Promise<number> {
  const result = await db.execute({ sql: 'SELECT COUNT(*) as n FROM users', args: [] });
  return Number(result.rows[0].n);
}

export async function GET() {
  try {
    await dbReady;
    const count = await getUserCount();
    return NextResponse.json({ needed: count === 0 });
  } catch (err) {
    console.error('Setup check error:', err);
    return NextResponse.json({ error: 'Internal server error.' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { email: rawEmail, password } = await request.json();

    await dbReady;

    // Re-check inside the handler to prevent races
    const count = await getUserCount();
    if (count > 0) {
      return NextResponse.json({ error: 'Setup has already been completed.' }, { status: 403 });
    }

    const emailValidation = validateEmail(rawEmail, null);
    if (!emailValidation.valid) {
      return NextResponse.json({ error: emailValidation.error }, { status: 400 });
    }
    const passwordValidation = validatePassword(password);
    if (!passwordValidation.valid) {
      return NextResponse.json({ error: passwordValidation.error }, { status: 400 });
    }

    const email = String(rawEmail).trim().toLowerCase();
    const passwordHash = await bcrypt.hash(password, 12);

    const insertResult = await db.execute({
      sql: `INSERT INTO users (email, password_hash, role, email_verified) VALUES (?, ?, 'administrator', 1)`,
      args: [email, passwordHash],
    });

    const sessionUser = {
      id: Number(insertResult.lastInsertRowid),
      email,
      role: 'administrator' as const,
      emailVerified: true,
    };

    const token = await signToken(sessionUser);
    const response = NextResponse.json({ ok: true });
    response.cookies.set({ ...authCookieOptions(), value: token });
    return response;
  } catch (err) {
    console.error('Setup error:', err);
    return NextResponse.json({ error: 'Setup failed.' }, { status: 500 });
  }
}
