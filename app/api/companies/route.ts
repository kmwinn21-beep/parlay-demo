import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { db, dbReady } from '@/lib/db';
import { classifyCompanyType } from '@/lib/parsers';
import { getConfigOptionValues } from '@/lib/db';

function parseServices(value: unknown): string[] {
  if (!value) return [];
  return String(value)
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
}

function serializeServices(services: unknown): string | null {
  if (!Array.isArray(services)) return null;
  const cleaned = services.map((v) => String(v).trim()).filter(Boolean);
  return cleaned.length > 0 ? cleaned.join(',') : null;
}

export async function GET(request: NextRequest) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  try {
    await dbReady;

    // ?minimal=1 — lightweight query returning only id+name (for dropdowns/selects)
    // optional: &has_relationships=1 — restrict to companies that have at least one internal relationship
    if (request.nextUrl.searchParams.get('minimal') === '1') {
      const hasRelationships = request.nextUrl.searchParams.get('has_relationships') === '1';
      const result = await db.execute({
        sql: hasRelationships
          ? `SELECT DISTINCT co.id, co.name
             FROM companies co
             INNER JOIN internal_relationships ir ON co.id = ir.company_id
             ORDER BY co.name`
          : 'SELECT id, name FROM companies ORDER BY name',
        args: [],
      });
      return NextResponse.json(result.rows.map(r => ({ id: r.id, name: r.name })), {
        headers: { 'Cache-Control': 'private, max-age=60, stale-while-revalidate=120' },
      });
    }

    const result = await db.execute({
      sql: `SELECT co.id, co.name, co.website, co.profit_type, co.company_type, co.notes, co.wse, co.services,
              co.status, co.icp, co.assigned_user, co.parent_company_id, co.entity_structure, co.created_at,
              COALESCE(att_agg.attendee_count, 0) as attendee_count,
              COALESCE(conf_agg.conference_count, 0) as conference_count,
              conf_agg.conference_names,
              parent.name as parent_company_name,
              att_summary.attendee_summary,
              COALESCE(pn.pinned_count, 0) as pinned_notes_count
            FROM companies co
            LEFT JOIN (
              SELECT company_id, COUNT(*) as attendee_count
              FROM attendees
              GROUP BY company_id
            ) att_agg ON co.id = att_agg.company_id
            LEFT JOIN (
              SELECT a2.company_id,
                     COUNT(DISTINCT ca.conference_id) as conference_count,
                     GROUP_CONCAT(DISTINCT conf.name) as conference_names
              FROM attendees a2
              JOIN conference_attendees ca ON a2.id = ca.attendee_id
              JOIN conferences conf ON ca.conference_id = conf.id
              GROUP BY a2.company_id
            ) conf_agg ON co.id = conf_agg.company_id
            LEFT JOIN companies parent ON co.parent_company_id = parent.id
            LEFT JOIN (
              SELECT company_id,
                     GROUP_CONCAT(first_name || ' ' || last_name || '|' || COALESCE(title, ''), '~~~') as attendee_summary
              FROM (SELECT DISTINCT company_id, first_name, last_name, title FROM attendees)
              GROUP BY company_id
            ) att_summary ON co.id = att_summary.company_id
            LEFT JOIN (
              SELECT entity_id, COUNT(*) as pinned_count
              FROM pinned_notes
              WHERE entity_type = 'company'
              GROUP BY entity_id
            ) pn ON co.id = pn.entity_id
            ORDER BY co.name`,
      args: [],
    });

    const companies = result.rows.map((r) => ({
      ...r,
      services: parseServices(r.services),
      icp: r.icp ? String(r.icp) : null,
    }));
    return NextResponse.json(companies, {
      headers: { 'Cache-Control': 'private, max-age=30, stale-while-revalidate=60' },
    });
  } catch (error) {
    console.error('GET /api/companies error:', error);
    return NextResponse.json({ error: 'Failed to fetch companies' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  try {
    await dbReady;
    const body = await request.json();
    const { name, website, profit_type, company_type, notes, assigned_user, entity_structure, wse, services, icp } = body;

    if (!name) {
      return NextResponse.json({ error: 'Company name is required' }, { status: 400 });
    }

    // Auto-detect company type if not explicitly provided; validate against live admin options
    const companyTypeOptions = await getConfigOptionValues('company_type');
    const resolvedType = company_type || classifyCompanyType(name, companyTypeOptions) || null;

    const result = await db.execute({
      sql: 'INSERT INTO companies (name, website, profit_type, company_type, notes, assigned_user, entity_structure, wse, services, icp, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL) RETURNING *',
      args: [name, website || null, profit_type || null, resolvedType, notes || null, assigned_user || null, entity_structure || null, wse != null && wse !== '' ? Number(wse) : null, serializeServices(services), icp || null],
    });

    return NextResponse.json({
      ...result.rows[0],
      services: parseServices(result.rows[0].services),
      icp: result.rows[0].icp ? String(result.rows[0].icp) : null,
    }, { status: 201 });
  } catch (error) {
    console.error('POST /api/companies error:', error);
    return NextResponse.json({ error: 'Failed to create company' }, { status: 500 });
  }
}
