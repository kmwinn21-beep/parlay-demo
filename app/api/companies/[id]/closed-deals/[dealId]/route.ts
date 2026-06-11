import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getDb } from '@/lib/getDb';

// PUT /api/companies/[id]/closed-deals/[dealId]
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; dealId: string }> }
) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const db = await getDb(authResult?.accountId);

  const { id, dealId } = await params;
  const companyId = parseInt(id, 10);
  const dealIdNum = parseInt(dealId, 10);
  if (isNaN(companyId) || isNaN(dealIdNum)) {
    return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });
  }

  const existing = await db.execute({
    sql: `SELECT id FROM closed_deals WHERE id = ? AND company_id = ?`,
    args: [dealIdNum, companyId],
  });
  if (!existing.rows[0]) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const body = await request.json();
  const { deal_name, close_date, amount, currency, notes, products,
          opportunity_id, deal_type, contact_signor, attributed_conference, attribution_type, attributed_rep } = body;

  if (!deal_name?.trim()) return NextResponse.json({ error: 'deal_name is required' }, { status: 400 });
  if (!close_date?.trim()) return NextResponse.json({ error: 'close_date is required' }, { status: 400 });

  await db.execute({
    sql: `UPDATE closed_deals
          SET deal_name = ?, close_date = ?, amount = ?, currency = ?, notes = ?,
              opportunity_id = ?, deal_type = ?, contact_signor = ?,
              attributed_conference = ?, attribution_type = ?, attributed_rep = ?,
              updated_at = datetime('now')
          WHERE id = ? AND company_id = ?`,
    args: [
      deal_name.trim(),
      close_date.trim(),
      amount != null ? Number(amount) : null,
      currency?.trim() || 'USD',
      notes?.trim() || null,
      opportunity_id?.trim() || null,
      deal_type?.trim() || null,
      contact_signor?.trim() || null,
      attributed_conference?.trim() || null,
      attribution_type?.trim() || null,
      attributed_rep?.trim() || null,
      dealIdNum,
      companyId,
    ],
  });

  // Replace all products
  await db.execute({
    sql: `DELETE FROM closed_deal_products WHERE deal_id = ?`,
    args: [dealIdNum],
  });

  const insertedProducts: { id: number; product_name: string; quantity: number | null; unit_price: number | null; sort_order: number }[] = [];
  if (Array.isArray(products)) {
    for (let i = 0; i < products.length; i++) {
      const p = products[i];
      if (!p.product_name?.trim()) continue;
      const pr = await db.execute({
        sql: `INSERT INTO closed_deal_products (deal_id, product_name, quantity, unit_price, sort_order)
              VALUES (?, ?, ?, ?, ?)`,
        args: [
          dealIdNum,
          p.product_name.trim(),
          p.quantity != null ? Number(p.quantity) : null,
          p.unit_price != null ? Number(p.unit_price) : null,
          p.sort_order != null ? Number(p.sort_order) : i,
        ],
      });
      insertedProducts.push({
        id: Number(pr.lastInsertRowid),
        product_name: p.product_name.trim(),
        quantity: p.quantity != null ? Number(p.quantity) : null,
        unit_price: p.unit_price != null ? Number(p.unit_price) : null,
        sort_order: p.sort_order != null ? Number(p.sort_order) : i,
      });
    }
  }

  const deal = {
    id: dealIdNum,
    company_id: companyId,
    deal_name: deal_name.trim(),
    close_date: close_date.trim(),
    amount: amount != null ? Number(amount) : null,
    currency: currency?.trim() || 'USD',
    notes: notes?.trim() || null,
    opportunity_id: opportunity_id?.trim() || null,
    deal_type: deal_type?.trim() || null,
    contact_signor: contact_signor?.trim() || null,
    attributed_conference: attributed_conference?.trim() || null,
    attribution_type: attribution_type?.trim() || null,
    attributed_rep: attributed_rep?.trim() || null,
    updated_at: new Date().toISOString().replace('T', ' ').slice(0, 19),
    products: insertedProducts,
  };

  return NextResponse.json({ deal });
}

// DELETE /api/companies/[id]/closed-deals/[dealId]
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; dealId: string }> }
) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const db = await getDb(authResult?.accountId);

  const { id, dealId } = await params;
  const companyId = parseInt(id, 10);
  const dealIdNum = parseInt(dealId, 10);
  if (isNaN(companyId) || isNaN(dealIdNum)) {
    return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });
  }

  const existing = await db.execute({
    sql: `SELECT id FROM closed_deals WHERE id = ? AND company_id = ?`,
    args: [dealIdNum, companyId],
  });
  if (!existing.rows[0]) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  await db.execute({
    sql: `DELETE FROM closed_deals WHERE id = ? AND company_id = ?`,
    args: [dealIdNum, companyId],
  });

  return NextResponse.json({ success: true });
}
