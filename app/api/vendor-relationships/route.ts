import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getDb } from '@/lib/getDb';
import { vendorRelsQuery, loadRelationshipThreads, loadInverseStatuses, presentRelationships } from '@/lib/relationshipThread';

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
    // The same query the pre-conference views run, so a relationship reads the
    // same on the company record as it does there. It was written out in both
    // places, which is how the other copy came to be missing the staleness
    // columns while its own comment claimed the two matched.
    const res = await vendorRelsQuery(db, [Number(companyId)]);

    const [threads, inverses] = await Promise.all([
      loadRelationshipThreads(db, res.rows.map(r => Number(r.id))),
      loadInverseStatuses(db),
    ]);

    return NextResponse.json(
      presentRelationships(res.rows, threads, inverses),
      { headers: { 'Cache-Control': 'no-store' } },
    );
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

    // Stamp status_changed_at only when the status value actually differs.
    //
    // This form writes updated_at on any field — a notes correction, a rep
    // reassignment — so updated_at cannot answer "when did the status change".
    // Reading the old value first is what keeps the two apart.
    const before = await db.execute({
      sql: 'SELECT relationship_status FROM vendor_relationships WHERE id = ?',
      args: [Number(id)],
    }).catch(() => ({ rows: [] as Record<string, unknown>[] }));
    const previous = before.rows[0]?.relationship_status
      ? String(before.rows[0].relationship_status) : null;
    const statusChanged = previous !== statuses;

    await db.execute({
      sql: `UPDATE vendor_relationships
            SET related_company_id = ?, rep_id = ?, relationship_status = ?, strength = ?,
                vendor_type = ?, notes = ?, updated_at = datetime('now')${
                  statusChanged ? ", status_changed_at = datetime('now')" : ''}
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
