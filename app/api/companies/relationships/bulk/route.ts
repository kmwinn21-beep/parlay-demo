import { NextRequest, NextResponse } from 'next/server';
import { db, dbReady } from '@/lib/db';

/**
 * POST /api/companies/relationships/bulk
 * Body: { company_ids: number[] }
 * Creates bidirectional relationships between all pairs of the given companies.
 */
export async function POST(request: NextRequest) {
  try {
    await dbReady;
    const { company_ids } = await request.json();

    if (!Array.isArray(company_ids) || company_ids.length < 2) {
      return NextResponse.json({ error: 'At least two company IDs are required' }, { status: 400 });
    }

    // Generate all unique pairs and insert
    const pairs: [number, number][] = [];
    for (let i = 0; i < company_ids.length; i++) {
      for (let j = i + 1; j < company_ids.length; j++) {
        const [a, b] = company_ids[i] < company_ids[j]
          ? [company_ids[i], company_ids[j]]
          : [company_ids[j], company_ids[i]];
        pairs.push([a, b]);
      }
    }

    await Promise.all(
      pairs.map(([a, b]) =>
        db.execute({
          sql: 'INSERT OR IGNORE INTO company_relationships (company_id_1, company_id_2) VALUES (?, ?)',
          args: [a, b],
        })
      )
    );

    return NextResponse.json({ success: true, relationships_created: pairs.length });
  } catch (error) {
    console.error('POST /api/companies/relationships/bulk error:', error);
    return NextResponse.json({ error: 'Failed to create relationships' }, { status: 500 });
  }
}
