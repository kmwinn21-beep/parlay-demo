import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getDb } from '@/lib/getDb';

// GET /api/companies/[id]/closed-deals
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const db = await getDb(authResult?.accountId);

  const { id } = await params;
  const companyId = parseInt(id, 10);
  if (isNaN(companyId)) return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });

  const dealsRes = await db.execute({
    sql: `SELECT d.id, d.company_id, d.deal_name, d.close_date, d.amount, d.currency,
                 d.notes, d.opportunity_id, d.deal_type,
                 d.contact_signor, d.contact_signor_attendee_id, d.contact_signor_title,
                 d.contact_signor_function, d.contact_signor_seniority,
                 d.attributed_conference, d.attribution_type, d.attributed_rep,
                 d.created_by_user_id, d.created_at, d.updated_at,
                 u.display_name as created_by_name
          FROM closed_deals d
          LEFT JOIN users u ON u.id = d.created_by_user_id
          WHERE d.company_id = ?
          ORDER BY d.close_date DESC, d.created_at DESC`,
    args: [companyId],
  });

  const dealIds = dealsRes.rows.map(r => Number(r.id));

  let productsMap: Record<number, { id: number; product_name: string; quantity: number | null; unit_price: number | null; sort_order: number }[]> = {};
  if (dealIds.length > 0) {
    const placeholders = dealIds.map(() => '?').join(',');
    const prodsRes = await db.execute({
      sql: `SELECT id, deal_id, product_name, quantity, unit_price, sort_order
            FROM closed_deal_products
            WHERE deal_id IN (${placeholders})
            ORDER BY sort_order, id`,
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

  const deals = dealsRes.rows.map(r => ({
    id: Number(r.id),
    company_id: Number(r.company_id),
    deal_name: String(r.deal_name),
    close_date: String(r.close_date),
    amount: r.amount != null ? Number(r.amount) : null,
    currency: String(r.currency ?? 'USD'),
    notes: r.notes ? String(r.notes) : null,
    opportunity_id: r.opportunity_id ? String(r.opportunity_id) : null,
    deal_type: r.deal_type ? String(r.deal_type) : null,
    contact_signor: r.contact_signor ? String(r.contact_signor) : null,
    contact_signor_attendee_id: r.contact_signor_attendee_id != null ? Number(r.contact_signor_attendee_id) : null,
    contact_signor_title: r.contact_signor_title ? String(r.contact_signor_title) : null,
    contact_signor_function: r.contact_signor_function ? String(r.contact_signor_function) : null,
    contact_signor_seniority: r.contact_signor_seniority ? String(r.contact_signor_seniority) : null,
    attributed_conference: r.attributed_conference ? String(r.attributed_conference) : null,
    attribution_type: r.attribution_type ? String(r.attribution_type) : null,
    attributed_rep: r.attributed_rep ? String(r.attributed_rep) : null,
    created_by_user_id: r.created_by_user_id != null ? Number(r.created_by_user_id) : null,
    created_by_name: r.created_by_name ? String(r.created_by_name) : null,
    created_at: String(r.created_at),
    updated_at: String(r.updated_at),
    products: productsMap[Number(r.id)] ?? [],
  }));

  return NextResponse.json({ deals });
}

// POST /api/companies/[id]/closed-deals
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const db = await getDb(authResult?.accountId);

  const { id } = await params;
  const companyId = parseInt(id, 10);
  if (isNaN(companyId)) return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });

  const body = await request.json();
  const {
    deal_name, close_date, amount, currency, notes, products,
    opportunity_id, deal_type,
    contact_signor, contact_signor_attendee_id, contact_signor_title, contact_signor_function, contact_signor_seniority,
    attributed_conference, attribution_type, attributed_rep,
  } = body;

  if (!deal_name?.trim()) return NextResponse.json({ error: 'deal_name is required' }, { status: 400 });
  if (!close_date?.trim()) return NextResponse.json({ error: 'close_date is required' }, { status: 400 });

  const result = await db.execute({
    sql: `INSERT INTO closed_deals (
            company_id, deal_name, close_date, amount, currency, notes,
            opportunity_id, deal_type,
            contact_signor, contact_signor_attendee_id, contact_signor_title, contact_signor_function, contact_signor_seniority,
            attributed_conference, attribution_type, attributed_rep,
            created_by_user_id, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
    args: [
      companyId,
      deal_name.trim(),
      close_date.trim(),
      amount != null ? Number(amount) : null,
      currency?.trim() || 'USD',
      notes?.trim() || null,
      opportunity_id?.trim() || null,
      deal_type?.trim() || null,
      contact_signor?.trim() || null,
      contact_signor_attendee_id != null ? Number(contact_signor_attendee_id) : null,
      contact_signor_title?.trim() || null,
      contact_signor_function?.trim() || null,
      contact_signor_seniority?.trim() || null,
      attributed_conference || null,
      attribution_type?.trim() || null,
      attributed_rep?.trim() || null,
      authResult.id,
    ],
  });

  const dealId = Number(result.lastInsertRowid);

  const insertedProducts: { id: number; product_name: string; quantity: number | null; unit_price: number | null; sort_order: number }[] = [];
  if (Array.isArray(products)) {
    for (let i = 0; i < products.length; i++) {
      const p = products[i];
      if (!p.product_name?.trim()) continue;
      const pr = await db.execute({
        sql: `INSERT INTO closed_deal_products (deal_id, product_name, quantity, unit_price, sort_order)
              VALUES (?, ?, ?, ?, ?)`,
        args: [
          dealId,
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
    id: dealId,
    company_id: companyId,
    deal_name: deal_name.trim(),
    close_date: close_date.trim(),
    amount: amount != null ? Number(amount) : null,
    currency: currency?.trim() || 'USD',
    notes: notes?.trim() || null,
    opportunity_id: opportunity_id?.trim() || null,
    deal_type: deal_type?.trim() || null,
    contact_signor: contact_signor?.trim() || null,
    contact_signor_attendee_id: contact_signor_attendee_id != null ? Number(contact_signor_attendee_id) : null,
    contact_signor_title: contact_signor_title?.trim() || null,
    contact_signor_function: contact_signor_function?.trim() || null,
    contact_signor_seniority: contact_signor_seniority?.trim() || null,
    attributed_conference: attributed_conference || null,
    attribution_type: attribution_type?.trim() || null,
    attributed_rep: attributed_rep?.trim() || null,
    created_by_user_id: authResult.id,
    created_by_name: null,
    created_at: new Date().toISOString().replace('T', ' ').slice(0, 19),
    updated_at: new Date().toISOString().replace('T', ' ').slice(0, 19),
    products: insertedProducts,
  };

  return NextResponse.json({ deal }, { status: 201 });
}
