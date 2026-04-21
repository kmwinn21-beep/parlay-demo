import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { db, dbReady } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;
  if (!auth.is_admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  try {
    await dbReady;
    const ruleId = Number(params.id);
    const { category, conditions } = await request.json() as {
      category: string;
      conditions: { option_value: string; operator: 'AND' | 'OR' }[];
    };

    await db.execute({ sql: 'UPDATE icp_rules SET category = ? WHERE id = ?', args: [category, ruleId] });
    await db.execute({ sql: 'DELETE FROM icp_rule_conditions WHERE rule_id = ?', args: [ruleId] });

    for (const cond of (conditions ?? [])) {
      await db.execute({
        sql: 'INSERT INTO icp_rule_conditions (rule_id, option_value, operator) VALUES (?, ?, ?)',
        args: [ruleId, cond.option_value, cond.operator],
      });
    }

    return NextResponse.json({ id: ruleId, category, conditions: conditions ?? [] });
  } catch (e) {
    console.error('PUT /api/admin/icp-rules/[id] error:', e);
    return NextResponse.json({ error: 'Failed to update ICP rule' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;
  if (!auth.is_admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  try {
    await dbReady;
    const ruleId = Number(params.id);
    await db.execute({ sql: 'DELETE FROM icp_rules WHERE id = ?', args: [ruleId] });
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error('DELETE /api/admin/icp-rules/[id] error:', e);
    return NextResponse.json({ error: 'Failed to delete ICP rule' }, { status: 500 });
  }
}
