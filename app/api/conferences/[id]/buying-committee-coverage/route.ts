import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getDb } from '@/lib/getDb';

interface BuyingCommittee {
  decision_maker: boolean;
  influencer: boolean;
  target_title: boolean;
}

function getBuyingCommittee(metadata: string | null): BuyingCommittee {
  try {
    const p = JSON.parse(metadata ?? '');
    return p.buying_committee ?? { decision_maker: true, influencer: true, target_title: true };
  } catch {
    return { decision_maker: true, influencer: true, target_title: true };
  }
}

function isActive(metadata: string | null): boolean {
  try {
    const p = JSON.parse(metadata ?? '');
    return p.active !== false;
  } catch {
    return true;
  }
}

const PRIORITY_ORDER: Record<string, number> = { high: 0, medium: 1, low: 2, partial: 3, gap: 4 };

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const db = await getDb(authResult.accountId ?? '');
  const { id } = await params;
  const conferenceId = Number(id);
  if (isNaN(conferenceId)) return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });

  const [totalRes, productsRes, signalsRes] = await Promise.all([
    db.execute({
      sql: `SELECT COUNT(*) as cnt FROM conference_attendees WHERE conference_id = ?`,
      args: [conferenceId],
    }),
    db.execute({
      sql: `SELECT id, value as name, metadata FROM config_options WHERE category = 'products'`,
      args: [],
    }),
    db.execute({
      sql: `SELECT attendee_id, product_name, buyer_role, function_match FROM attendee_product_signals WHERE conference_id = ?`,
      args: [conferenceId],
    }),
  ]);

  const total_attendees = Number(totalRes.rows[0]?.cnt ?? 0);

  const activeProducts = productsRes.rows.filter(r => isActive(r.metadata ? String(r.metadata) : null));

  // Global ICP/role counts (function_match required for a signal to count)
  const icpMatchedIds = new Set<number>();
  const dmIds = new Set<number>();
  const ttIds = new Set<number>();

  // Per-product role counts
  const countsByProduct = new Map<string, { dm: number; inf: number; tt: number }>();

  for (const row of signalsRes.rows) {
    if (!row.function_match) continue;
    const aid = Number(row.attendee_id);
    const pname = String(row.product_name ?? '');
    icpMatchedIds.add(aid);
    if (row.buyer_role === 'decision_maker') dmIds.add(aid);
    if (row.buyer_role === 'target_title') ttIds.add(aid);

    if (!countsByProduct.has(pname)) countsByProduct.set(pname, { dm: 0, inf: 0, tt: 0 });
    const c = countsByProduct.get(pname)!;
    if (row.buyer_role === 'decision_maker') c.dm++;
    else if (row.buyer_role === 'influencer') c.inf++;
    else if (row.buyer_role === 'target_title') c.tt++;
  }

  const products = activeProducts.map(p => {
    const meta = p.metadata ? String(p.metadata) : null;
    const bc = getBuyingCommittee(meta);
    const name = String(p.name ?? '');
    const c = countsByProduct.get(name) ?? { dm: 0, inf: 0, tt: 0 };

    const required = [
      'decision_maker',
      ...(bc.influencer ? ['influencer'] : []),
      ...(bc.target_title ? ['target_title'] : []),
    ];
    const present = required.filter(role =>
      (role === 'decision_maker' && c.dm > 0) ||
      (role === 'influencer' && c.inf > 0) ||
      (role === 'target_title' && c.tt > 0),
    ).length;
    const committee_presence = Math.round((present / required.length) * 100);

    const strength: 'high' | 'moderate' | 'low' | 'none' =
      c.tt >= 5 ? 'high' : c.tt >= 2 ? 'moderate' : c.tt === 1 ? 'low' : 'none';

    let floor_priority: 'high' | 'medium' | 'low' | 'partial' | 'gap';
    if (committee_presence === 100 && strength === 'high') floor_priority = 'high';
    else if (committee_presence === 100 && strength === 'moderate') floor_priority = 'medium';
    else if (committee_presence === 100 && strength === 'low') floor_priority = 'low';
    else if (committee_presence >= 50) floor_priority = 'partial';
    else floor_priority = 'gap';

    return {
      product_id: Number(p.id),
      product_name: name,
      buying_committee: bc,
      decision_maker_count: c.dm,
      influencer_count: c.inf,
      target_title_count: c.tt,
      committee_presence,
      strength,
      floor_priority,
    };
  }).sort((a, b) => {
    const po = (PRIORITY_ORDER[a.floor_priority] ?? 5) - (PRIORITY_ORDER[b.floor_priority] ?? 5);
    if (po !== 0) return po;
    return b.target_title_count - a.target_title_count;
  });

  return NextResponse.json({
    total_attendees,
    icp_matched: icpMatchedIds.size,
    decision_makers: dmIds.size,
    target_titles: ttIds.size,
    products,
  });
}
