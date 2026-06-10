import { NextRequest, NextResponse } from 'next/server';
import { db, dbReady } from '@/lib/db';

// Free/personal domains that should never trigger a company warning
const GENERIC_DOMAINS = new Set([
  'gmail.com', 'googlemail.com',
  'yahoo.com', 'yahoo.co.uk', 'ymail.com',
  'outlook.com', 'hotmail.com', 'live.com', 'msn.com',
  'icloud.com', 'me.com', 'mac.com',
  'protonmail.com', 'proton.me', 'pm.me',
  'aol.com', 'aol.co.uk',
]);

export async function GET(request: NextRequest) {
  const email = request.nextUrl.searchParams.get('email')?.trim().toLowerCase() ?? '';
  const atIdx = email.indexOf('@');
  if (atIdx === -1) {
    return NextResponse.json({ conflict: false });
  }

  const domain = email.slice(atIdx + 1);
  if (!domain || GENERIC_DOMAINS.has(domain)) {
    return NextResponse.json({ conflict: false });
  }

  await dbReady;
  const result = await db.execute({
    sql: `SELECT admin_first_name, admin_last_name FROM accounts WHERE admin_email LIKE ? LIMIT 1`,
    args: [`%@${domain}`],
  });

  if (result.rows.length === 0) {
    return NextResponse.json({ conflict: false });
  }

  return NextResponse.json({ conflict: true });
}
