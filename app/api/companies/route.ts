import { NextRequest, NextResponse } from 'next/server';
import { db, dbReady } from '@/lib/db';
import { classifyCompanyType } from '@/lib/parsers';

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

export async function GET() {
  try {
    await dbReady;
    const result = await db.execute({
      sql: `SELECT co.id, co.name, co.website, co.profit_type, co.company_type, co.notes, co.wse, co.services,
              COALESCE(co.status, 'Unknown') as status, COALESCE(co.icp, 'False') as icp, co.assigned_user, co.parent_company_id, co.entity_structure, co.created_at,
              COUNT(DISTINCT a.id) as attendee_count,
              COUNT(DISTINCT ca.conference_id) as conference_count,
              GROUP_CONCAT(DISTINCT conf.name) as conference_names,
              parent.name as parent_company_name,
              (SELECT GROUP_CONCAT(sub.info, '~~~') FROM (
                SELECT DISTINCT a2.first_name || ' ' || a2.last_name || '|' || COALESCE(a2.title, '') as info
                FROM attendees a2
                WHERE a2.company_id = co.id
              ) sub) as attendee_summary
            FROM companies co
            LEFT JOIN attendees a ON co.id = a.company_id
            LEFT JOIN conference_attendees ca ON a.id = ca.attendee_id
            LEFT JOIN conferences conf ON ca.conference_id = conf.id
            LEFT JOIN companies parent ON co.parent_company_id = parent.id
            GROUP BY co.id
            ORDER BY co.name`,
      args: [],
    });

    const companies = result.rows.map((r) => ({
      ...r,
      services: parseServices(r.services),
      icp: r.icp ? String(r.icp) : 'False',
    }));
    return NextResponse.json(companies);
  } catch (error) {
    console.error('GET /api/companies error:', error);
    return NextResponse.json({ error: 'Failed to fetch companies' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    await dbReady;
    const body = await request.json();
    const { name, website, profit_type, company_type, notes, assigned_user, entity_structure, wse, services, icp } = body;

    if (!name) {
      return NextResponse.json({ error: 'Company name is required' }, { status: 400 });
    }

    // Auto-detect company type if not explicitly provided
    const resolvedType = company_type || classifyCompanyType(name) || null;

    const result = await db.execute({
      sql: 'INSERT INTO companies (name, website, profit_type, company_type, notes, assigned_user, entity_structure, wse, services, icp) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING *',
      args: [name, website || null, profit_type || null, resolvedType, notes || null, assigned_user || null, entity_structure || null, wse != null && wse !== '' ? Number(wse) : null, serializeServices(services), icp === 'True' ? 'True' : 'False'],
    });

    return NextResponse.json({
      ...result.rows[0],
      services: parseServices(result.rows[0].services),
      icp: result.rows[0].icp ? String(result.rows[0].icp) : 'False',
    }, { status: 201 });
  } catch (error) {
    console.error('POST /api/companies error:', error);
    return NextResponse.json({ error: 'Failed to create company' }, { status: 500 });
  }
}
