import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { getDb } from '@/lib/getDb';

export const dynamic = 'force-dynamic';

function normalizeDomain(raw: string): string {
  let d = raw.trim().toLowerCase();
  d = d.replace(/^https?:\/\//i, '').replace(/^www\./i, '');
  d = d.replace(/[/?#].*$/, '');
  const parts = d.split('.');
  if (parts.length > 2) d = parts.slice(-2).join('.');
  return d;
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;
  const db = await getDb(auth.accountId);
  const id = Number(params.id);

  const body = await req.json() as { company_name?: string; website?: string; competitor_type?: string };
  const name = body.company_name?.trim();
  const website = body.website?.trim() ? normalizeDomain(body.website.trim()) : '';
  const type = body.competitor_type?.trim() || 'Unknown';

  if (!name || !website) return NextResponse.json({ error: 'company_name and website are required' }, { status: 400 });

  const existing = await db.execute({
    sql: 'SELECT id FROM competitor_settings WHERE website = ? AND id != ?',
    args: [website, id],
  });
  if ((existing.rows as Record<string, unknown>[]).length > 0) {
    return NextResponse.json({ error: 'A competitor with this domain already exists' }, { status: 409 });
  }

  await db.execute({
    sql: `UPDATE competitor_settings SET company_name = ?, website = ?, competitor_type = ?, updated_at = datetime('now') WHERE id = ?`,
    args: [name, website, type, id],
  });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;
  const db = await getDb(auth.accountId);
  await db.execute({ sql: 'DELETE FROM competitor_settings WHERE id = ?', args: [Number(params.id)] });
  return NextResponse.json({ ok: true });
}
