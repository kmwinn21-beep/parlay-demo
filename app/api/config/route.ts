import { NextRequest, NextResponse } from 'next/server';
import { db, dbReady } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    await dbReady;
    const { searchParams } = new URL(request.url);
    const category = searchParams.get('category');

    if (!category) {
      return NextResponse.json({ error: 'category is required' }, { status: 400 });
    }

    const result = await db.execute({
      sql: 'SELECT id, category, value, sort_order FROM config_options WHERE category = ? ORDER BY sort_order, value',
      args: [category],
    });

    return NextResponse.json(result.rows.map(r => ({
      id: Number(r.id),
      category: String(r.category),
      value: String(r.value),
      sort_order: Number(r.sort_order ?? 0),
    })));
  } catch (error) {
    console.error('GET /api/config error:', error);
    return NextResponse.json({ error: 'Failed to fetch config options' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    await dbReady;
    const body = await request.json();
    const { category, value, sort_order } = body;

    if (!category || !value) {
      return NextResponse.json({ error: 'category and value are required' }, { status: 400 });
    }

    const result = await db.execute({
      sql: 'INSERT INTO config_options (category, value, sort_order) VALUES (?, ?, ?) RETURNING *',
      args: [category, value, sort_order ?? 0],
    });

    return NextResponse.json(result.rows[0], { status: 201 });
  } catch (error) {
    console.error('POST /api/config error:', error);
    return NextResponse.json({ error: 'Failed to create config option' }, { status: 500 });
  }
}
