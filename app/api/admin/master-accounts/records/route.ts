import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getDb } from '@/lib/getDb';

const PAGE_SIZE = 50;

// GET /api/admin/master-accounts/records?page=&search= — paginated, searchable
// view of the currently-active account list (rows belonging to any upload
// whose status is 'active' — a merge upload leaves prior uploads active, so
// this can span more than one upload_id).
export async function GET(request: NextRequest) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  if (authResult.role !== 'administrator') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const db = await getDb(authResult.accountId);

  try {
    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10) || 1);
    const search = (searchParams.get('search') ?? '').trim().toLowerCase();
    const offset = (page - 1) * PAGE_SIZE;

    const activeFilter = `upload_id IN (SELECT id FROM master_account_list_uploads WHERE status = 'active')`;
    const searchFilter = search ? `AND company_name_normalized LIKE '%' || ? || '%'` : '';
    const args: (string | number)[] = search ? [search] : [];

    const [countRes, rowsRes] = await Promise.all([
      db.execute({
        sql: `SELECT COUNT(*) AS cnt FROM master_account_list WHERE ${activeFilter} ${searchFilter}`,
        args,
      }),
      db.execute({
        sql: `SELECT id, company_name, website, domain, assigned_rep_id, assigned_rep_name, hq_state,
                     territory_id, territory_name, entity_structure, services, wse, crm_link
              FROM master_account_list
              WHERE ${activeFilter} ${searchFilter}
              ORDER BY company_name ASC
              LIMIT ? OFFSET ?`,
        args: [...args, PAGE_SIZE, offset],
      }),
    ]);

    const records = rowsRes.rows.map(r => ({
      id: Number(r.id),
      companyName: String(r.company_name),
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
    }));

    return NextResponse.json({ records, total: Number(countRes.rows[0]?.cnt ?? 0) });
  } catch (error) {
    console.error('GET /api/admin/master-accounts/records error:', error);
    return NextResponse.json({ error: 'Failed to fetch master account records' }, { status: 500 });
  }
}
