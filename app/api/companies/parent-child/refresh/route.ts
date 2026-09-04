import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getDb } from '@/lib/getDb';

/**
 * Bring every child company back in line with its parent.
 *
 * Type and rep are inherited when a parent/child link is made, but they drift:
 * a child gets re-typed by hand, a parent is reassigned, a company is imported
 * under a parent that already existed. This re-applies the rule across the
 * whole account in one go.
 *
 * Only non-empty parent values travel. A parent with no rep does not strip the
 * reps off its children — that would lose information the parent never had.
 *
 * Run top-down over generations rather than in a single UPDATE, so a value
 * reaches a grandchild in the same run: the child has to match before the
 * grandchild can match the child.
 */

/** Depth guard: a cycle in parent_company_id would otherwise never settle. */
const MAX_GENERATIONS = 12;

interface Row {
  id: number;
  parent_company_id: number | null;
  company_type: string | null;
  assigned_user: string | null;
}

function norm(v: string | null): string {
  return String(v ?? '').trim();
}

export async function POST(request: NextRequest) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const db = await getDb(authResult?.accountId);

  try {
    const res = await db.execute({
      sql: 'SELECT id, parent_company_id, company_type, assigned_user FROM companies',
      args: [],
    });
    const rows: Row[] = res.rows.map(r => ({
      id: Number(r.id),
      parent_company_id: r.parent_company_id != null ? Number(r.parent_company_id) : null,
      company_type: r.company_type != null ? String(r.company_type) : null,
      assigned_user: r.assigned_user != null ? String(r.assigned_user) : null,
    }));

    const byId = new Map<number, Row>(rows.map(r => [r.id, r]));
    const childrenOf = new Map<number, Row[]>();
    for (const r of rows) {
      if (r.parent_company_id == null || !byId.has(r.parent_company_id)) continue;
      const list = childrenOf.get(r.parent_company_id) ?? [];
      list.push(r);
      childrenOf.set(r.parent_company_id, list);
    }

    // Start from the companies that have no parent of their own.
    let generation = rows.filter(r => r.parent_company_id == null || !byId.has(r.parent_company_id));
    const updates: { id: number; company_type: string | null; assigned_user: string | null }[] = [];
    const seen = new Set<number>();

    for (let depth = 0; depth < MAX_GENERATIONS && generation.length > 0; depth++) {
      const next: Row[] = [];
      for (const parent of generation) {
        if (seen.has(parent.id)) continue;
        seen.add(parent.id);
        for (const child of childrenOf.get(parent.id) ?? []) {
          const wantType = norm(parent.company_type) !== '' ? parent.company_type : child.company_type;
          const wantRep = norm(parent.assigned_user) !== '' ? parent.assigned_user : child.assigned_user;
          if (norm(wantType) !== norm(child.company_type) || norm(wantRep) !== norm(child.assigned_user)) {
            updates.push({ id: child.id, company_type: wantType, assigned_user: wantRep });
            // Carry the corrected values down, so this child's own children are
            // measured against what it is about to become.
            child.company_type = wantType;
            child.assigned_user = wantRep;
          }
          next.push(child);
        }
      }
      generation = next;
    }

    for (const u of updates) {
      await db.execute({
        sql: `UPDATE companies SET company_type = ?, assigned_user = ?, updated_at = datetime('now') WHERE id = ?`,
        args: [u.company_type, u.assigned_user, u.id],
      });
    }

    return NextResponse.json({ success: true, updated: updates.length });
  } catch (error) {
    console.error('POST /api/companies/parent-child/refresh error:', error);
    return NextResponse.json({ error: 'Failed to refresh parent/child fields' }, { status: 500 });
  }
}
