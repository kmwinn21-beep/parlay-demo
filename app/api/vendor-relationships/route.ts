import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getDb } from '@/lib/getDb';

/** Multi-selects arrive as arrays and are stored comma-separated, like services. */
function serializeList(value: unknown): string | null {
  if (!Array.isArray(value)) {
    const single = String(value ?? '').trim();
    return single || null;
  }
  const cleaned = value.map(v => String(v).trim()).filter(Boolean);
  return cleaned.length > 0 ? cleaned.join(',') : null;
}

function parseList(value: unknown): string[] {
  if (!value) return [];
  return String(value).split(',').map(v => v.trim()).filter(Boolean);
}

/**
 * True when the two companies are already nested one inside the other.
 *
 * That link belongs to Related Entities, which speaks for it on both records —
 * recording it here as well is what put the same company on the page twice.
 */
async function isParentOrChild(
  db: Awaited<ReturnType<typeof getDb>>,
  companyId: number,
  relatedId: number,
): Promise<boolean> {
  const res = await db.execute({
    sql: `SELECT 1 FROM companies
          WHERE (id = ? AND parent_company_id = ?)
             OR (id = ? AND parent_company_id = ?)
          LIMIT 1`,
    args: [companyId, relatedId, relatedId, companyId],
  }).catch(() => ({ rows: [] as Record<string, unknown>[] }));
  return res.rows.length > 0;
}

export async function GET(request: NextRequest) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const db = await getDb(authResult?.accountId);

  const companyId = new URL(request.url).searchParams.get('company_id');
  if (!companyId) return NextResponse.json({ error: 'company_id is required' }, { status: 400 });

  try {
    // Timestamps aliased rather than left to vr.*: companies carries
    // created_at and updated_at too, and which one a wildcard yields in a join
    // is the driver's business, not something worth depending on.
    //
    // A company that is this one's parent or child is excluded: that link is
    // what Related Entities is for, and listing it here too showed the same
    // company twice on the page. Legacy company_relationships rows carried
    // across into this table are the usual way a pair ends up in both.
    //
    // Filtered on read rather than deleted — the row may predate the
    // parent/child link, and un-nesting the companies should bring it back.
    const select = (stamps: string) => `
      SELECT vr.id, vr.company_id, vr.related_company_id, vr.rep_id,
             vr.relationship_status, vr.strength, vr.vendor_type, vr.notes,
             ${stamps},
             c.name AS related_company_name, c.company_type AS related_company_type
      FROM vendor_relationships vr
      LEFT JOIN companies c ON c.id = vr.related_company_id
      WHERE vr.company_id = ?
        AND NOT EXISTS (
          SELECT 1 FROM companies me
          WHERE me.id = vr.company_id AND me.parent_company_id = vr.related_company_id
        )
        AND NOT EXISTS (
          SELECT 1 FROM companies kid
          WHERE kid.id = vr.related_company_id AND kid.parent_company_id = vr.company_id
        )
      ORDER BY c.name`;

    // A tenant whose table predates one of these columns would otherwise fail
    // the whole query and show no relationships at all — losing the stamp is
    // the acceptable half of that trade.
    const res = await db.execute({
      sql: select('vr.created_at AS vr_created_at, vr.updated_at AS vr_updated_at'),
      args: [companyId],
    }).catch(() => db.execute({
      // Only updated_at is the newer of the two, so try created_at alone
      // before giving up on a stamp entirely.
      sql: select('vr.created_at AS vr_created_at, vr.created_at AS vr_updated_at'),
      args: [companyId],
    })).catch(() => db.execute({
      sql: select(`'' AS vr_created_at, '' AS vr_updated_at`),
      args: [companyId],
    }));

    return NextResponse.json(res.rows.map(r => ({
      id: Number(r.id),
      company_id: Number(r.company_id),
      related_company_id: Number(r.related_company_id),
      related_company_name: r.related_company_name ? String(r.related_company_name) : '',
      related_company_type: r.related_company_type ? String(r.related_company_type) : null,
      rep_id: r.rep_id != null ? Number(r.rep_id) : null,
      relationship_status: parseList(r.relationship_status),
      strength: r.strength ? String(r.strength) : null,
      vendor_type: parseList(r.vendor_type),
      notes: r.notes ? String(r.notes) : '',
      created_at: String(r.vr_created_at ?? ''),
      updated_at: String(r.vr_updated_at ?? r.vr_created_at ?? ''),
    })), { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('GET /api/vendor-relationships error:', error);
    return NextResponse.json({ error: 'Failed to load relationships' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const db = await getDb(authResult?.accountId);

  try {
    const body = await request.json();
    const { company_id, related_company_id, rep_id, relationship_status, strength, vendor_type, notes } = body;

    if (!company_id || !related_company_id) {
      return NextResponse.json({ error: 'company_id and related_company_id are required' }, { status: 400 });
    }
    if (Number(company_id) === Number(related_company_id)) {
      return NextResponse.json({ error: 'A company cannot be related to itself.' }, { status: 400 });
    }
    if (await isParentOrChild(db, Number(company_id), Number(related_company_id))) {
      return NextResponse.json(
        { error: 'These companies are already linked as parent and child, which shows under Related Entities.' },
        { status: 400 },
      );
    }
    const statuses = serializeList(relationship_status);
    if (!statuses) return NextResponse.json({ error: 'Relationship Status is required' }, { status: 400 });
    if (!String(notes ?? '').trim()) return NextResponse.json({ error: 'Notes / Context is required' }, { status: 400 });
    if (!rep_id) return NextResponse.json({ error: 'Rep is required' }, { status: 400 });

    const res = await db.execute({
      sql: `INSERT INTO vendor_relationships
              (company_id, related_company_id, rep_id, relationship_status, strength, vendor_type, notes)
            VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id`,
      args: [
        Number(company_id), Number(related_company_id), Number(rep_id),
        statuses, String(strength ?? '').trim() || null,
        serializeList(vendor_type), String(notes).trim(),
      ],
    });
    return NextResponse.json({ id: Number(res.rows[0].id) });
  } catch (error) {
    console.error('POST /api/vendor-relationships error:', error);
    return NextResponse.json({ error: 'Failed to save relationship' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const db = await getDb(authResult?.accountId);

  try {
    const body = await request.json();
    const { id, related_company_id, rep_id, relationship_status, strength, vendor_type, notes } = body;
    if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });

    const statuses = serializeList(relationship_status);
    if (!statuses) return NextResponse.json({ error: 'Relationship Status is required' }, { status: 400 });
    if (!String(notes ?? '').trim()) return NextResponse.json({ error: 'Notes / Context is required' }, { status: 400 });
    if (!rep_id) return NextResponse.json({ error: 'Rep is required' }, { status: 400 });

    await db.execute({
      sql: `UPDATE vendor_relationships
            SET related_company_id = ?, rep_id = ?, relationship_status = ?, strength = ?,
                vendor_type = ?, notes = ?, updated_at = datetime('now')
            WHERE id = ?`,
      args: [
        Number(related_company_id), Number(rep_id), statuses,
        String(strength ?? '').trim() || null, serializeList(vendor_type),
        String(notes).trim(), Number(id),
      ],
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('PUT /api/vendor-relationships error:', error);
    return NextResponse.json({ error: 'Failed to update relationship' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const db = await getDb(authResult?.accountId);

  const id = new URL(request.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });

  try {
    await db.execute({ sql: 'DELETE FROM vendor_relationships WHERE id = ?', args: [id] });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('DELETE /api/vendor-relationships error:', error);
    return NextResponse.json({ error: 'Failed to delete relationship' }, { status: 500 });
  }
}
