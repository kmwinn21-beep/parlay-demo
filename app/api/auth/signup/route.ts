import { NextResponse } from 'next/server';

// Public self-registration is disabled. Accounts are created by administrators via invitations.
export async function POST() {
  return NextResponse.json(
    { error: 'Account registration is by invitation only. Contact an administrator.' },
    { status: 403 }
  );
}
