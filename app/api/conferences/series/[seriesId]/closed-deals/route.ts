import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getDb } from '@/lib/getDb';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ seriesId: string }> }
) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const db = await getDb(authResult?.accountId);

  const { seriesId } = await params;

  // Get series details and all conference names in the series
  const seriesRes = await db.execute({
    sql: `SELECT cs.display_name as series_name,
                 c.id, c.name, c.start_date, c.end_date
          FROM conference_series cs
          JOIN conferences c ON c.series_id = cs.id
          WHERE cs.id = ?
          ORDER BY c.start_date ASC`,
    args: [seriesId],
  });
  if (!seriesRes.rows[0]) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const seriesName = String(seriesRes.rows[0].series_name);
  const confNames = seriesRes.rows.map(r => String(r.name));
  const confStartDateByName = new Map<string, string>(
    seriesRes.rows.map(r => [String(r.name), String(r.start_date)])
  );
  const startDates = seriesRes.rows.map(r => String(r.start_date)).filter(Boolean);
  const endDates = seriesRes.rows.map(r => String(r.end_date)).filter(Boolean);
  const earliestStart = startDates.sort()[0] ?? null;
  const latestEnd = endDates.sort().reverse()[0] ?? null;

  // All deals + products
  const dealsRes = await db.execute({
    sql: `SELECT d.id, d.company_id, d.deal_name, d.close_date, d.amount, d.currency,
                 d.notes, d.opportunity_id, d.deal_type,
                 d.contact_signor, d.contact_signor_attendee_id,
                 d.contact_signor_title, d.contact_signor_function, d.contact_signor_seniority,
                 d.attributed_conference, d.attribution_type, d.attribution_pct, d.attributed_rep,
                 d.created_by_user_id, d.created_at, d.updated_at,
                 u.display_name as created_by_name,
                 co.name as company_name
          FROM closed_deals d
          LEFT JOIN users u ON u.id = d.created_by_user_id
          LEFT JOIN companies co ON co.id = d.company_id
          ORDER BY d.close_date DESC, d.created_at DESC`,
    args: [],
  });

  function parseAttrConfs(raw: unknown): string[] {
    try {
      const parsed = JSON.parse(String(raw ?? '[]'));
      return Array.isArray(parsed) ? parsed.map(String) : [];
    } catch { return []; }
  }

  const confNameSet = new Set(confNames);
  // Deduplicate deals (a deal may be attributed to multiple conferences in the series)
  const seenIds = new Set<number>();
  const matchingDeals = dealsRes.rows.filter(r => {
    const id = Number(r.id);
    if (seenIds.has(id)) return false;
    const attrConfs = parseAttrConfs(r.attributed_conference);
    if (attrConfs.some(c => confNameSet.has(c))) {
      seenIds.add(id);
      return true;
    }
    return false;
  });

  const dealIds = matchingDeals.map(r => Number(r.id));

  let productsMap: Record<number, { id: number; product_name: string; quantity: number | null; unit_price: number | null; sort_order: number }[]> = {};
  if (dealIds.length > 0) {
    const ph = dealIds.map(() => '?').join(',');
    const prodsRes = await db.execute({
      sql: `SELECT id, deal_id, product_name, quantity, unit_price, sort_order FROM closed_deal_products WHERE deal_id IN (${ph}) ORDER BY sort_order, id`,
      args: dealIds,
    });
    for (const row of prodsRes.rows) {
      const dealId = Number(row.deal_id);
      if (!productsMap[dealId]) productsMap[dealId] = [];
      productsMap[dealId].push({
        id: Number(row.id),
        product_name: String(row.product_name),
        quantity: row.quantity != null ? Number(row.quantity) : null,
        unit_price: row.unit_price != null ? Number(row.unit_price) : null,
        sort_order: Number(row.sort_order ?? 0),
      });
    }
  }

  const deals = matchingDeals.map(r => {
    const amount = r.amount != null ? Number(r.amount) : null;
    const attrType = r.attribution_type ? String(r.attribution_type) : null;
    const attrPct = r.attribution_pct != null ? Number(r.attribution_pct) : null;
    let attributedAmount = 0;
    if (amount != null && attrType && attrType.toLowerCase() !== 'none') {
      if (attrType.toLowerCase() === 'direct source') {
        attributedAmount = amount;
      } else {
        const attrConfs = parseAttrConfs(r.attributed_conference);
        // Count only confs within this series for attribution split
        const seriesAttrConfs = attrConfs.filter(c => confNameSet.has(c));
        const totalAttrConfs = attrConfs.length;
        const pct = attrPct ?? 50;
        attributedAmount = amount * (pct / 100) * (seriesAttrConfs.length / Math.max(totalAttrConfs, 1));
      }
    }
    return {
      id: Number(r.id),
      company_id: Number(r.company_id),
      company_name: r.company_name ? String(r.company_name) : null,
      deal_name: String(r.deal_name),
      close_date: String(r.close_date),
      amount,
      currency: String(r.currency ?? 'USD'),
      attributed_amount: attributedAmount,
      days_to_close: (() => {
        const attrConfs = parseAttrConfs(r.attributed_conference);
        const matchingStart = attrConfs
          .map(c => confStartDateByName.get(c))
          .filter((d): d is string => !!d)
          .sort()[0];
        if (!matchingStart) return null;
        const closeMs = new Date(String(r.close_date)).getTime();
        const startMs = new Date(matchingStart).getTime();
        if (isNaN(closeMs) || isNaN(startMs)) return null;
        return Math.round((closeMs - startMs) / 86400000);
      })(),
      notes: r.notes ? String(r.notes) : null,
      opportunity_id: r.opportunity_id ? String(r.opportunity_id) : null,
      deal_type: r.deal_type ? String(r.deal_type) : null,
      contact_signor: r.contact_signor ? String(r.contact_signor) : null,
      contact_signor_attendee_id: r.contact_signor_attendee_id != null ? Number(r.contact_signor_attendee_id) : null,
      contact_signor_title: r.contact_signor_title ? String(r.contact_signor_title) : null,
      attributed_conference: r.attributed_conference ? String(r.attributed_conference) : null,
      attribution_type: attrType,
      attribution_pct: attrPct,
      attributed_rep: r.attributed_rep ? String(r.attributed_rep) : null,
      created_by_name: r.created_by_name ? String(r.created_by_name) : null,
      products: productsMap[Number(r.id)] ?? [],
    };
  });

  const totalAmount = deals.reduce((s, d) => s + (d.amount ?? 0), 0);
  const totalAttributed = deals.reduce((s, d) => s + d.attributed_amount, 0);

  return NextResponse.json({
    series: { id: seriesId, name: seriesName, start_date: earliestStart, end_date: latestEnd },
    deals,
    summary: (() => {
      const daysArr = deals.map(d => d.days_to_close).filter((d): d is number => d != null && d >= 0);
      const avgDaysToClose = daysArr.length ? Math.round(daysArr.reduce((s, d) => s + d, 0) / daysArr.length) : null;
      return { total_amount: totalAmount, total_attributed: totalAttributed, avg_days_to_close: avgDaysToClose };
    })(),
  });
}
