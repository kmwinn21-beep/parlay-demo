import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getDb } from '@/lib/getDb';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;

  const conferenceId = parseInt(params.id, 10);
  if (isNaN(conferenceId)) {
    return NextResponse.json({ error: 'Invalid conference ID' }, { status: 400 });
  }

  const db = await getDb(authResult?.accountId);

  // Fetch all signals for this conference with attendee + company data
  const signalsRes = await db.execute({
    sql: `SELECT
            s.attendee_id,
            s.product_name,
            s.buyer_role,
            s.function_match,
            s.industry_match,
            s.keyword_matches,
            s.computed_at,
            a.first_name,
            a.last_name,
            a.title,
            a.seniority,
            a.function as attendee_function,
            c.id as company_id,
            c.name as company_name,
            c.wse as company_wse,
            c.assigned_user as assigned_user
          FROM attendee_product_signals s
          JOIN attendees a ON a.id = s.attendee_id
          LEFT JOIN companies c ON c.id = a.company_id
          WHERE s.conference_id = ?
          ORDER BY s.product_name, c.name, a.last_name, a.first_name`,
    args: [conferenceId],
  });

  if (signalsRes.rows.length === 0) {
    return NextResponse.json({ computedAt: null, columns: [] });
  }

  // Fetch product catalog for metadata (category, color)
  // Also fetch the system category label to use as fallback for products with no category_id
  const [productsRes, sysCatRes] = await Promise.all([
    db.execute({
      sql: `SELECT p.id, p.value as name, p.color, p.category_id, p.metadata,
                   cat.value as category_label, cat.color as category_color
            FROM config_options p
            LEFT JOIN config_options cat ON cat.id = p.category_id
            WHERE p.category = 'products'`,
      args: [],
    }),
    db.execute({
      sql: `SELECT value, color FROM config_options WHERE category = 'product_category' AND is_system = 1 LIMIT 1`,
      args: [],
    }),
  ]);
  const systemCategoryLabel = sysCatRes.rows.length > 0 ? String(sysCatRes.rows[0].value ?? 'General') : 'General';
  const systemCategoryColor = sysCatRes.rows.length > 0 && sysCatRes.rows[0].color ? String(sysCatRes.rows[0].color) : null;
  const productByName = new Map<string, {
    id: number;
    name: string;
    color: string | null;
    categoryId: number | null;
    categoryLabel: string;
    categoryColor: string | null;
    meta: string | null;
  }>();
  for (const r of productsRes.rows) {
    productByName.set(String(r.name ?? ''), {
      id: Number(r.id),
      name: String(r.name ?? ''),
      color: r.color ? String(r.color) : null,
      categoryId: r.category_id ? Number(r.category_id) : null,
      categoryLabel: r.category_label ? String(r.category_label) : systemCategoryLabel,
      categoryColor: r.category_color ? String(r.category_color) : systemCategoryColor,
      meta: r.metadata ? String(r.metadata) : null,
    });
  }

  // Resolve assigned user display names from config_options (category = 'user')
  const userOptRes = await db.execute({
    sql: `SELECT id, value FROM config_options WHERE category = 'user'`,
    args: [],
  });
  const userIdToName = new Map<number, string>();
  for (const r of userOptRes.rows) {
    userIdToName.set(Number(r.id), String(r.value ?? ''));
  }
  function resolveUserNames(assignedUser: string | null): string[] {
    if (!assignedUser) return [];
    return assignedUser
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) => {
        const id = parseInt(s, 10);
        return !isNaN(id) ? (userIdToName.get(id) ?? s) : s;
      });
  }

  // Group rows by product → company → attendees
  interface AttendeeEntry {
    id: number;
    firstName: string;
    lastName: string;
    title: string | null;
    seniority: string | null;
    function: string | null;
    buyerRole: string | null;
    functionMatch: { fn: string; level: 'high' | 'med' } | null;
    industryMatch: boolean;
    keywordMatches: string[];
  }
  interface CompanyEntry {
    companyId: number | null;
    companyName: string;
    companyWse: number | null;
    assignedUserNames: string[];
    attendees: AttendeeEntry[];
  }
  interface ColumnEntry {
    product: {
      id: number;
      name: string;
      color: string | null;
      categoryId: number | null;
      categoryLabel: string;
      categoryColor: string | null;
      meta: string | null;
    };
    companies: CompanyEntry[];
    totalAttendees: number;
    hasBuyerRole: boolean;
  }

  let computedAt: string | null = null;
  const columnMap = new Map<string, { product: typeof productByName extends Map<string, infer V> ? V : never; companyMap: Map<number | null, CompanyEntry> }>();

  for (const row of signalsRes.rows) {
    const productName = String(row.product_name ?? '');
    if (!columnMap.has(productName)) {
      const productInfo = productByName.get(productName) ?? {
        id: 0,
        name: productName,
        color: null,
        categoryId: null,
        categoryLabel: 'General',
        categoryColor: null,
        meta: null,
      };
      columnMap.set(productName, { product: productInfo, companyMap: new Map() });
    }
    const col = columnMap.get(productName)!;

    const companyId = row.company_id ? Number(row.company_id) : null;
    if (!col.companyMap.has(companyId)) {
      col.companyMap.set(companyId, {
        companyId,
        companyName: String(row.company_name ?? ''),
        companyWse: row.company_wse != null ? Number(row.company_wse) : null,
        assignedUserNames: resolveUserNames(row.assigned_user as string | null),
        attendees: [],
      });
    }
    const company = col.companyMap.get(companyId)!;

    let functionMatch: { fn: string; level: 'high' | 'med' } | null = null;
    try {
      const fm = JSON.parse(String(row.function_match ?? 'null'));
      if (fm && fm.fn) functionMatch = fm;
    } catch { /* ignore */ }

    let keywordMatches: string[] = [];
    try {
      const km = JSON.parse(String(row.keyword_matches ?? 'null'));
      if (Array.isArray(km)) keywordMatches = km;
    } catch { /* ignore */ }

    company.attendees.push({
      id: Number(row.attendee_id),
      firstName: String(row.first_name ?? ''),
      lastName: String(row.last_name ?? ''),
      title: row.title ? String(row.title) : null,
      seniority: row.seniority ? String(row.seniority) : null,
      function: row.attendee_function ? String(row.attendee_function) : null,
      buyerRole: row.buyer_role ? String(row.buyer_role) : null,
      functionMatch,
      industryMatch: Number(row.industry_match ?? 0) === 1,
      keywordMatches,
    });

    if (!computedAt || String(row.computed_at) > computedAt) {
      computedAt = String(row.computed_at);
    }
  }

  const columns: ColumnEntry[] = Array.from(columnMap.entries()).map(([, col]) => {
    const companies = Array.from(col.companyMap.values()).sort((a, b) =>
      a.companyName.localeCompare(b.companyName),
    );
    const totalAttendees = companies.reduce((sum, c) => sum + c.attendees.length, 0);
    const hasBuyerRole = companies.some((c) => c.attendees.some((a) => a.buyerRole !== null));
    return { product: col.product, companies, totalAttendees, hasBuyerRole };
  }).sort((a, b) => {
    const catCmp = a.product.categoryLabel.localeCompare(b.product.categoryLabel);
    return catCmp !== 0 ? catCmp : a.product.name.localeCompare(b.product.name);
  });

  return NextResponse.json({ computedAt, columns });
}
