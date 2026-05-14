import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, requireAdmin } from '@/lib/auth';
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

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  const db = await getDb(auth.accountId);
  try {
    const res = await db.execute({
      sql: 'SELECT id, company_name, website, competitor_type, created_at FROM competitor_settings ORDER BY company_name',
      args: [],
    });
    return NextResponse.json(res.rows);
  } catch {
    return NextResponse.json([]);
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;
  const db = await getDb(auth.accountId);

  const body = await req.json() as { company_name?: string; website?: string; competitor_type?: string };
  const name = body.company_name?.trim();
  const website = body.website?.trim() ? normalizeDomain(body.website.trim()) : '';
  const type = body.competitor_type?.trim() || 'Unknown';

  if (!name || !website) return NextResponse.json({ error: 'company_name and website are required' }, { status: 400 });

  const existing = await db.execute({
    sql: 'SELECT id FROM competitor_settings WHERE website = ?',
    args: [website],
  });
  if ((existing.rows as Record<string, unknown>[]).length > 0) {
    return NextResponse.json({ error: 'A competitor with this domain already exists' }, { status: 409 });
  }

  const result = await db.execute({
    sql: 'INSERT INTO competitor_settings (company_name, website, competitor_type) VALUES (?, ?, ?) RETURNING id, company_name, website, competitor_type, created_at',
    args: [name, website, type],
  });
  return NextResponse.json(result.rows[0], { status: 201 });
}
