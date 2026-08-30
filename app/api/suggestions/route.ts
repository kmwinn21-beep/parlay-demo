import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getDb } from '@/lib/getDb';
import { getTarget, dedupeKey, type SuggestionTarget } from '@/lib/suggestions/registry';
import { getConfigIdByEmail } from '@/lib/notifications';

export const dynamic = 'force-dynamic';

function serializeList(value: unknown): string | null {
  if (!Array.isArray(value)) {
    const single = String(value ?? '').trim();
    return single || null;
  }
  const cleaned = value.map(v => String(v).trim()).filter(Boolean);
  return cleaned.length > 0 ? cleaned.join(',') : null;
}

interface SuggestionRow {
  id: number;
  source_note_id: number | null;
  target_key: string;
  entity_type: string;
  entity_id: number;
  payload: Record<string, unknown>;
  quote: string | null;
  confidence: string;
  status: string;
  created_at: string | null;
}

/** Pending suggestions for one record. */
export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;
  const db = await getDb(auth?.accountId);
  try {
    const { searchParams } = new URL(request.url);
    const entityType = searchParams.get('entity_type');
    const entityId = searchParams.get('entity_id');
    const status = searchParams.get('status') ?? 'pending';
    if (!entityType || !entityId) {
      return NextResponse.json({ error: 'entity_type and entity_id are required' }, { status: 400 });
    }

    const result = await db.execute({
      sql: `SELECT id, source_note_id, target_key, entity_type, entity_id, payload,
                   quote, confidence, status, created_at
            FROM record_suggestions
            WHERE entity_type = ? AND entity_id = ? AND status = ?
            ORDER BY created_at DESC, id DESC`,
      args: [entityType, entityId, status],
    });

    const rows: SuggestionRow[] = result.rows.map(r => ({
      id: Number(r.id),
      source_note_id: r.source_note_id != null ? Number(r.source_note_id) : null,
      target_key: String(r.target_key),
      entity_type: String(r.entity_type),
      entity_id: Number(r.entity_id),
      payload: JSON.parse(String(r.payload ?? '{}')),
      quote: r.quote != null ? String(r.quote) : null,
      confidence: String(r.confidence ?? 'medium'),
      status: String(r.status),
      created_at: r.created_at != null ? String(r.created_at) : null,
    }));
    return NextResponse.json(rows);
  } catch (error) {
    console.error('GET /api/suggestions error:', error);
    return NextResponse.json({ error: 'Failed to load suggestions' }, { status: 500 });
  }
}

/**
 * Create suggestions. Used by the extractor rather than by anything a person
 * touches, and idempotent per (note, dedupe key) so re-extracting a note that
 * was edited and saved again doesn't stack duplicates of what was answered.
 */
export async function POST(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;
  const db = await getDb(auth?.accountId);
  try {
    const body = await request.json();
    const items = Array.isArray(body?.suggestions) ? body.suggestions : [];
    if (items.length === 0) return NextResponse.json({ created: 0 });

    let created = 0;
    for (const item of items) {
      const target = getTarget(String(item.target_key ?? ''));
      if (!target) continue;
      const entityType = String(item.entity_type ?? target.entity);
      const entityId = Number(item.entity_id);
      if (!entityId) continue;
      const payload = (item.payload ?? {}) as Record<string, unknown>;

      const res = await db.execute({
        sql: `INSERT OR IGNORE INTO record_suggestions
                (source_note_id, target_key, entity_type, entity_id, payload, quote, confidence, dedupe_key)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          item.source_note_id != null ? Number(item.source_note_id) : null,
          target.key,
          entityType,
          entityId,
          JSON.stringify(payload),
          item.quote != null ? String(item.quote) : null,
          ['high', 'medium', 'low'].includes(String(item.confidence)) ? String(item.confidence) : 'medium',
          dedupeKey(target.key, entityType, entityId, payload),
        ],
      });
      if (Number(res.rowsAffected ?? 0) > 0) created += 1;
    }
    return NextResponse.json({ created }, { status: 201 });
  } catch (error) {
    console.error('POST /api/suggestions error:', error);
    return NextResponse.json({ error: 'Failed to store suggestions' }, { status: 500 });
  }
}

/**
 * Accept or dismiss. Accepting performs the write the target declares, using
 * whatever payload comes back — so a value the reviewer corrected is what gets
 * written, not what was proposed.
 */
export async function PATCH(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;
  const user = auth;
  const db = await getDb(user?.accountId);
  try {
    const body = await request.json();
    const id = Number(body?.id);
    const action = String(body?.action ?? '');
    if (!id || !['accept', 'dismiss'].includes(action)) {
      return NextResponse.json({ error: 'id and action (accept|dismiss) are required' }, { status: 400 });
    }

    const found = await db.execute({
      sql: 'SELECT id, target_key, entity_type, entity_id, payload, status FROM record_suggestions WHERE id = ?',
      args: [id],
    });
    if (found.rows.length === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    const row = found.rows[0];
    if (String(row.status) !== 'pending') {
      return NextResponse.json({ error: 'Already reviewed' }, { status: 409 });
    }

    const target = getTarget(String(row.target_key));
    if (!target) return NextResponse.json({ error: 'Unknown target' }, { status: 400 });

    // The reviewer's version wins over what was proposed.
    const payload = (body.payload ?? JSON.parse(String(row.payload ?? '{}'))) as Record<string, unknown>;
    const entityId = Number(row.entity_id);

    if (action === 'accept') {
      const applied = await applyTarget(db, target, entityId, payload, user.email);
      if (!applied.ok) return NextResponse.json({ error: applied.error }, { status: 400 });
    }

    await db.execute({
      sql: `UPDATE record_suggestions
            SET status = ?, payload = ?, reviewed_by = ?, reviewed_at = datetime('now')
            WHERE id = ?`,
      args: [action === 'accept' ? 'accepted' : 'dismissed', JSON.stringify(payload), user.email, id],
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('PATCH /api/suggestions error:', error);
    return NextResponse.json({ error: 'Failed to update the suggestion' }, { status: 500 });
  }
}

type Db = Awaited<ReturnType<typeof getDb>>;

/** Performs the write a target declares. One place, so the registry stays the
 *  only thing that has to change when a target is added. */
async function applyTarget(
  db: Db,
  target: SuggestionTarget,
  entityId: number,
  payload: Record<string, unknown>,
  email: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (target.key === 'vendor_relationship') {
    const relatedId = await resolveCompany(db, payload);
    if (!relatedId) return { ok: false, error: 'Pick or name the related company.' };
    if (relatedId === entityId) return { ok: false, error: 'A company cannot be related to itself.' };
    const repId = await getConfigIdByEmail(email, db);
    await db.execute({
      sql: `INSERT INTO vendor_relationships
              (company_id, related_company_id, rep_id, relationship_status, strength, vendor_type, notes)
            VALUES (?, ?, ?, ?, ?, ?, ?)`,
      args: [
        entityId,
        relatedId,
        repId,
        serializeList(payload.relationship_status),
        // Not derivable from a note — left for a person to set.
        null,
        serializeList(payload.vendor_type),
        String(payload.notes ?? ''),
      ],
    });
    return { ok: true };
  }

  if (target.key === 'company_sub_types') {
    // Written to the company the suggestion names, which for this target is
    // the vendor rather than the record being read.
    const companyId = await resolveCompany(db, payload) ?? entityId;
    await db.execute({
      sql: 'UPDATE companies SET sub_types = ?, updated_at = datetime(\'now\') WHERE id = ?',
      args: [serializeList(payload.sub_types), companyId],
    });
    return { ok: true };
  }

  return { ok: false, error: `No write defined for ${target.key}` };
}

/** An id if one was chosen, else a name matched or created. */
async function resolveCompany(db: Db, payload: Record<string, unknown>): Promise<number | null> {
  const id = Number(payload.related_company_id ?? payload.company_id ?? 0);
  if (id) return id;
  const name = String(payload.related_company_name ?? payload.company_name ?? '').trim();
  if (!name) return null;
  const existing = await db.execute({
    sql: 'SELECT id FROM companies WHERE LOWER(TRIM(name)) = LOWER(TRIM(?)) LIMIT 1',
    args: [name],
  });
  if (existing.rows.length > 0) return Number(existing.rows[0].id);
  const created = await db.execute({
    sql: 'INSERT INTO companies (name) VALUES (?) RETURNING id',
    args: [name],
  });
  return Number(created.rows[0].id);
}
