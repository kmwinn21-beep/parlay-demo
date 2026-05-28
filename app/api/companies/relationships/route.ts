import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/getDb';
import { getSessionUser } from '@/lib/auth';

/**
 * POST /api/companies/relationships
 * Body: { company_id_1: number, company_id_2: number }
 * Creates a bidirectional relationship between two companies.
 */
export async function POST(request: NextRequest) {
  try {
    const user = await getSessionUser(request);
    const db = await getDb(user?.accountId);
    const { company_id_1, company_id_2 } = await request.json();

    if (!company_id_1 || !company_id_2) {
      return NextResponse.json({ error: 'Both company IDs are required' }, { status: 400 });
    }
    if (company_id_1 === company_id_2) {
      return NextResponse.json({ error: 'Cannot relate a company to itself' }, { status: 400 });
    }

    // Normalize order so the unique index catches duplicates regardless of direction
    const [a, b] = company_id_1 < company_id_2
      ? [company_id_1, company_id_2]
      : [company_id_2, company_id_1];

    await db.execute({
      sql: 'INSERT OR IGNORE INTO company_relationships (company_id_1, company_id_2) VALUES (?, ?)',
      args: [a, b],
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('POST /api/companies/relationships error:', error);
    return NextResponse.json({ error: 'Failed to create relationship' }, { status: 500 });
  }
}

/**
 * PATCH /api/companies/relationships
 * Body: { company_id_1: number, company_id_2: number, notes: string | null }
 * Updates notes on an existing relationship.
 */
export async function PATCH(request: NextRequest) {
  try {
    const user = await getSessionUser(request);
    const db = await getDb(user?.accountId);
    const { company_id_1, company_id_2, note } = await request.json();

    if (!company_id_1 || !company_id_2) {
      return NextResponse.json({ error: 'Both company IDs are required' }, { status: 400 });
    }
    if (!note || !String(note).trim()) {
      return NextResponse.json({ error: 'Note text is required' }, { status: 400 });
    }

    const [a, b] = company_id_1 < company_id_2
      ? [company_id_1, company_id_2]
      : [company_id_2, company_id_1];

    const existing = await db.execute({
      sql: 'SELECT notes FROM company_relationships WHERE company_id_1 = ? AND company_id_2 = ?',
      args: [a, b],
    });
    let thread: { text: string; createdAt: string }[] = [];
    try { thread = JSON.parse(String(existing.rows[0]?.notes ?? '[]')); } catch { thread = []; }
    if (!Array.isArray(thread)) thread = [];
    thread.push({ text: String(note).trim(), createdAt: new Date().toISOString() });

    await db.execute({
      sql: 'UPDATE company_relationships SET notes = ? WHERE company_id_1 = ? AND company_id_2 = ?',
      args: [JSON.stringify(thread), a, b],
    });

    return NextResponse.json({ success: true, thread });
  } catch (error) {
    console.error('PATCH /api/companies/relationships error:', error);
    return NextResponse.json({ error: 'Failed to update relationship notes' }, { status: 500 });
  }
}

/**
 * DELETE /api/companies/relationships
 * Body: { company_id_1: number, company_id_2: number }
 * Removes the relationship between two companies.
 */
export async function DELETE(request: NextRequest) {
  try {
    const user = await getSessionUser(request);
    const db = await getDb(user?.accountId);
    const { company_id_1, company_id_2 } = await request.json();

    if (!company_id_1 || !company_id_2) {
      return NextResponse.json({ error: 'Both company IDs are required' }, { status: 400 });
    }

    const [a, b] = company_id_1 < company_id_2
      ? [company_id_1, company_id_2]
      : [company_id_2, company_id_1];

    await db.execute({
      sql: 'DELETE FROM company_relationships WHERE company_id_1 = ? AND company_id_2 = ?',
      args: [a, b],
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('DELETE /api/companies/relationships error:', error);
    return NextResponse.json({ error: 'Failed to remove relationship' }, { status: 500 });
  }
}
