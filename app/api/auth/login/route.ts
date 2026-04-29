import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { db, dbReady } from '@/lib/db';
import { signToken, authCookieOptions } from '@/lib/auth';

export async function POST(request: NextRequest) {
  try {
    const { email: rawEmail, password } = await request.json();

    if (!rawEmail || !password) {
      return NextResponse.json({ error: 'Email and password are required.' }, { status: 400 });
    }

    const email = String(rawEmail).trim().toLowerCase();

    await dbReady;

    const result = await db.execute({
      sql: 'SELECT id, email, password_hash, role, email_verified, active FROM users WHERE email = ?',
      args: [email],
    });

    if (result.rows.length === 0) {
      // Perform dummy compare to prevent timing attacks
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
    };

    const token = await signToken(sessionUser);

    const response = NextResponse.json({ message: 'Logged in.', user: { email: sessionUser.email, role: sessionUser.role } });
    response.cookies.set({ ...authCookieOptions(), value: token });
    return response;
  } catch (err) {
    console.error('Login error:', err);
    return NextResponse.json({ error: 'Login failed.' }, { status: 500 });
  }
}
