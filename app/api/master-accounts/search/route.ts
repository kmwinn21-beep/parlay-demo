import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getDb } from '@/lib/getDb';

const RESULT_LIMIT = 15;

// GET /api/master-accounts/search?q= — lightweight typeahead search over the
// active master account list, for the Edit Company form's "Match Master
// Account" field. Deliberately NOT under /api/admin — any authenticated user
// editing a company can use this, unlike the admin-only Master Accounts tab
// routes it mirrors the row shape of (app/api/admin/master-accounts/records/route.ts).
export async function GET(request: NextRequest) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const db = await getDb(authResult.accountId);

  try {
    const { searchParams } = new URL(request.url);
    const q = (searchParams.get('q') ?? '').trim().toLowerCase();
    if (q.length < 2) return NextResponse.json({ records: [] });

    const rowsRes = await db.execute({
      sql: `SELECT id, company_name, company_name_normalized, website, domain, assigned_rep_id, assigned_rep_name, hq_state,
                   territory_id, territory_name, entity_structure, services, wse, crm_link, company_type, profit_type
            FROM master_account_list
            WHERE upload_id IN (SELECT id FROM master_account_list_uploads WHERE status = 'active')
              AND company_name_normalized LIKE '%' || ? || '%'
            ORDER BY company_name ASC
            LIMIT ?`,
      args: [q, RESULT_LIMIT],
    });

    const records = rowsRes.rows.map(r => ({
      id: Number(r.id),
      companyName: String(r.company_name),
      companyNameNormalized: String(r.company_name_normalized ?? ''),
      website: r.website ? String(r.website) : null,
      domain: r.domain ? String(r.domain) : null,
      assignedRepId: r.assigned_rep_id != null ? Number(r.assigned_rep_id) : null,
      assignedRepName: r.assigned_rep_name ? String(r.assigned_rep_name) : null,
      hqState: r.hq_state ? String(r.hq_state) : null,
      territoryId: r.territory_id != null ? Number(r.territory_id) : null,
      territoryName: r.territory_name ? String(r.territory_name) : null,
      entityStructure: r.entity_structure ? String(r.entity_structure) : null,
      services: r.services ? String(r.services) : null,
      wse: r.wse != null ? Number(r.wse) : null,
      crmLink: r.crm_link ? String(r.crm_link) : null,
      companyType: r.company_type ? String(r.company_type) : null,
      profitType: r.profit_type ? String(r.profit_type) : null,
    }));

    return NextResponse.json({ records });
  } catch (error) {
    console.error('GET /api/master-accounts/search error:', error);
    return NextResponse.json({ error: 'Failed to search master accounts' }, { status: 500 });
  }
}
