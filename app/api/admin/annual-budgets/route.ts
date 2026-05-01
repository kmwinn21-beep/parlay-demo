import { NextRequest, NextResponse } from 'next/server';
import { db, dbReady } from '@/lib/db';
import { requireAdmin } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(_request: NextRequest) {
  try {
    await dbReady;
    const result = await db.execute({
      sql: 'SELECT id, year, amount FROM annual_budgets ORDER BY year DESC',
      args: [],
    });
    return NextResponse.json(result.rows);
  } catch (error) {
    console.error('GET /api/admin/annual-budgets error:', error);
    return NextResponse.json([]);
  }
}

export async function POST(request: NextRequest) {
  const authResult = await requireAdmin(request);
  if (authResult instanceof NextResponse) return authResult;
  try {
    await dbReady;
    const body = await request.json();
    const { year, amount } = body as { year: number; amount: number };
    if (!year || year < 1000 || year > 9999) {
      return NextResponse.json({ error: 'Year must be a 4-digit number' }, { status: 400 });
    }
    if (!amount || amount <= 0) {
      return NextResponse.json({ error: 'Amount must be a positive number' }, { status: 400 });
    }
    const result = await db.execute({
      sql: 'INSERT INTO annual_budgets (year, amount) VALUES (?, ?) RETURNING id, year, amount',
      args: [year, amount],
    });
    return NextResponse.json(result.rows[0]);
  } catch (error: unknown) {
    const msg = String(error);
    if (msg.includes('UNIQUE') || msg.includes('unique')) {
      return NextResponse.json({ error: 'A budget for that year already exists' }, { status: 409 });
    }
    console.error('POST /api/admin/annual-budgets error:', error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
