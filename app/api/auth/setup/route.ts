import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { db, dbReady } from '@/lib/db';
import { signToken, authCookieOptions, validatePassword } from '@/lib/auth';

async function hasUsers(): Promise<boolean> {
  const result = await db.execute({ sql: 'SELECT COUNT(*) as cnt FROM users', args: [] });
  return Number(result.rows[0].cnt) > 0;
}

export async function GET() {
  await dbReady;
  const setup = await hasUsers();
  return NextResponse.json({ needsSetup: !setup });
}

export async function POST(request: NextRequest) {
  await dbReady;

  // Re-check atomically — reject if any user already exists
  if (await hasUsers()) {
    return NextResponse.json({ error: 'Setup already complete.' }, { status: 403 });
  }

  const body = await request.json() as {
    firstName?: string;
    lastName?: string;
    email?: string;
    password?: string;
  };

  const firstName = body.firstName?.trim() ?? '';
  const lastName = body.lastName?.trim() ?? '';
  const email = body.email?.trim().toLowerCase() ?? '';
  const password = body.password ?? '';

  if (!firstName || !lastName || !email || !password) {
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

  const password_hash = await bcrypt.hash(password, 12);

  const result = await db.execute({
    sql: `INSERT INTO users (email, password_hash, role, email_verified, active, first_name, last_name)
          VALUES (?, ?, 'administrator', 1, 1, ?, ?)
          RETURNING id`,
    args: [email, password_hash, firstName, lastName],
  });

  const userId = Number(result.rows[0].id);

  const sessionUser = {
    id: userId,
    email,
    role: 'administrator' as const,
    emailVerified: true,
  };

  const token = await signToken(sessionUser);
  const response = NextResponse.json({ message: 'Admin account created.' });
  response.cookies.set({ ...authCookieOptions(), value: token });
  return response;
}
