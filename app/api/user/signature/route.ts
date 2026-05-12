import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { getDb } from '@/lib/getDb';

export async function GET(request: NextRequest) {
  const user = await getSessionUser(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const db = await getDb(user?.accountId);

  const result = await db.execute({
    sql: 'SELECT signature_html FROM users WHERE id = ?',
    args: [user.id],
  });

  const signature = result.rows.length ? (result.rows[0].signature_html as string | null) : null;
  return NextResponse.json({ signature: signature ?? '' });
}

export async function PATCH(request: NextRequest) {
  const user = await getSessionUser(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const db = await getDb(user?.accountId);

  const { signature_html } = await request.json() as { signature_html: string };

  await db.execute({
    sql: 'UPDATE users SET signature_html = ? WHERE id = ?',
    args: [signature_html ?? '', user.id],
  });

  return NextResponse.json({ message: 'Signature saved.' });
}
