import { NextRequest, NextResponse } from 'next/server';
import { db, dbReady } from '@/lib/db';

export async function GET() {
  try {
    await dbReady;
    const result = await db.execute({
      sql: `SELECT co.*, COUNT(DISTINCT a.id) as attendee_count
            FROM companies co
            LEFT JOIN attendees a ON co.id = a.company_id
            GROUP BY co.id
            ORDER BY co.name`,
      args: [],
    });

    const companies = result.rows.map((r) => ({ ...r }));
    return NextResponse.json(companies);
  } catch (error) {
    console.error('GET /api/companies error:', error);
    return NextResponse.json({ error: 'Failed to fetch companies' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    await dbReady;
    const body = await request.json();
    const { name, website, profit_type, company_type, notes } = body;

    if (!name) {
      return NextResponse.json({ error: 'Company name is required' }, { status: 400 });
    }

    const result = await db.execute({
      sql: 'INSERT INTO companies (name, website, profit_type, company_type, notes) VALUES (?, ?, ?, ?, ?) RETURNING *',
      args: [name, website || null, profit_type || null, company_type || null, notes || null],
    });

    return NextResponse.json(result.rows[0], { status: 201 });
  } catch (error) {
    console.error('POST /api/companies error:', error);
    return NextResponse.json({ error: 'Failed to create company' }, { status: 500 });
  }
}
