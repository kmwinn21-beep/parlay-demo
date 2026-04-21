import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, requireAdmin } from '@/lib/auth';
import { db, dbReady } from '@/lib/db';
import { getIcpConfig } from '@/lib/icpRules';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;
  try {
    const config = await getIcpConfig();
    return NextResponse.json(config);
  } catch (e) {
    console.error('GET /api/admin/icp-rules error:', e);
    return NextResponse.json({ error: 'Failed to load ICP rules' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (auth instanceof NextResponse) return auth;

  try {
    await dbReady;
    const { category, conditions } = await request.json() as {
      category: string;
      conditions: { option_value: string; operator: 'AND' | 'OR' }[];
    };

    if (!category) return NextResponse.json({ error: 'category is required' }, { status: 400 });

    const countResult = await db.execute({ sql: 'SELECT COUNT(*) as cnt FROM icp_rules', args: [] });
    const sort_order = Number(countResult.rows[0].cnt);

    const ruleResult = await db.execute({
      sql: 'INSERT INTO icp_rules (category, sort_order) VALUES (?, ?) RETURNING id',
      args: [category, sort_order],
    });
    const ruleId = Number(ruleResult.rows[0].id);

    for (const cond of (conditions ?? [])) {
      await db.execute({
        sql: 'INSERT INTO icp_rule_conditions (rule_id, option_value, operator) VALUES (?, ?, ?)',
        args: [ruleId, cond.option_value, cond.operator],
      });
    }

    return NextResponse.json({ id: ruleId, category, sort_order, conditions: conditions ?? [] });
  } catch (e) {
    console.error('POST /api/admin/icp-rules error:', e);
    return NextResponse.json({ error: 'Failed to create ICP rule' }, { status: 500 });
  }
}
