import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getDb } from '@/lib/getDb';
import {
  resolveCompetitive, type RawRelationshipRow, type ResolutionCompany,
} from '@/lib/competitiveResolution';
import {
  deriveSignals, isCustomerType, SIGNAL_KEYS, type SignalKey,
} from '@/lib/competitiveSignals';

/**
 * Which competitive signals each company carries.
 *
 * The same answer the relationship map's grid shows, for surfaces that want the
 * badge without the grid. Computed through resolveCompetitive and
 * deriveSignals rather than beside them: the rules for which end of a
 * relationship is the competitor, and what counts as weighing alternatives, are
 * long and already written down once.
 *
 * Keyed by the ACCOUNT, which is the company a reader is looking at in a table.
 * A competitor's own cells belong to the accounts above them, so a competitor
 * carries a signal here only when somebody is weighing IT against another.
 *
 * Every relationship, never narrowed to one conference. A badge here answers
 * "what is going on with this company", which does not stop being true because
 * the other end of it did not come to this show — and a row that carries EA at
 * one conference and nothing at another, for the same company on the same day,
 * reads as the badge being unreliable rather than as a scope.
 *
 * That is the opposite of the map's grid, which IS about one show. The two
 * questions are different and now have different answers on purpose.
 */

function splitList(raw: unknown): string[] {
  if (!raw) return [];
  return String(raw).split(',').map(v => v.trim()).filter(Boolean);
}

export async function GET(request: NextRequest) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const db = await getDb(authResult?.accountId);

  try {
    const relRes = await db.execute({
      sql: `SELECT id, company_id, related_company_id, relationship_status, status_changed_at
            FROM vendor_relationships`,
      args: [],
    }).catch(() => db.execute({
      sql: `SELECT id, company_id, related_company_id, relationship_status,
                   NULL AS status_changed_at
            FROM vendor_relationships`,
      args: [],
    }).catch(() => ({ rows: [] as Record<string, unknown>[] })));

    const rows: RawRelationshipRow[] = relRes.rows.map(r => ({
      id: Number(r.id),
      companyId: Number(r.company_id),
      relatedCompanyId: Number(r.related_company_id),
      statuses: splitList(r.relationship_status),
      statusChangedAt: r.status_changed_at ? String(r.status_changed_at) : null,
    }));
    if (rows.length === 0) {
      return NextResponse.json({ signals: {} }, { headers: { 'Cache-Control': 'no-store' } });
    }

    const ids = Array.from(new Set(rows.flatMap(r => [r.companyId, r.relatedCompanyId])));
    const [typeOpts, statusRes, compTypeRes, internalRes] = await Promise.all([
      db.execute({
        sql: `SELECT id, value FROM config_options WHERE category = 'company_type'`,
        args: [],
      }).catch(() => ({ rows: [] as Record<string, unknown>[] })),
      db.execute({
        sql: `SELECT value, inverse_value, action_key FROM config_options
              WHERE category = 'other_relationship_status'`,
        args: [],
      }).catch(() => ({ rows: [] as Record<string, unknown>[] })),
      db.execute({
        sql: `SELECT value FROM config_options
              WHERE category = 'company_type' AND action_key = 'competitor'`,
        args: [],
      }).catch(() => ({ rows: [] as Record<string, unknown>[] })),
      db.execute({
        sql: `SELECT DISTINCT company_id FROM internal_relationships
              WHERE company_id IS NOT NULL`,
        args: [],
      }).catch(() => ({ rows: [] as Record<string, unknown>[] })),
    ]);
    const typeById = new Map(typeOpts.rows.map(r => [String(r.id), String(r.value)]));

    const companies = new Map<number, ResolutionCompany>();
    const CHUNK = 500;
    for (let i = 0; i < ids.length; i += CHUNK) {
      const slice = ids.slice(i, i + CHUNK);
      const res = await db.execute({
        sql: `SELECT id, name, company_type FROM companies
              WHERE id IN (${slice.map(() => '?').join(',')})`,
        args: slice,
      }).catch(() => ({ rows: [] as Record<string, unknown>[] }));
      for (const r of res.rows) {
        companies.set(Number(r.id), {
          id: Number(r.id),
          name: r.name ? String(r.name) : '',
          types: splitList(r.company_type).map(p => typeById.get(p) ?? p),
        });
      }
    }

    const resolved = resolveCompetitive({
      rows,
      statusConfig: statusRes.rows.map(r => ({
        value: String(r.value ?? ''),
        inverseValue: r.inverse_value ? String(r.inverse_value) : null,
        actionKey: r.action_key ? String(r.action_key) : null,
      })),
      companies,
      competitorTypes: compTypeRes.rows.map(r => String(r.value ?? '')).filter(Boolean),
    });

    // Recorded switches, which are never inferred. Only 'replacing' says a
    // vendor was displaced by another.
    const switchRes = await db.execute({
      sql: `SELECT account_company_id, incumbent_company_id, incoming_company_id
            FROM vendor_switches
            WHERE answer = 'replacing' AND incoming_company_id IS NOT NULL`,
      args: [],
    }).catch(() => ({ rows: [] as Record<string, unknown>[] }));

    /* Accounts of ours, for the At Risk signal.
       Read off the company records already loaded above rather than queried
       again: their types are resolved there, and a second read would be a
       second place for "what counts as a customer" to be decided. */
    const customerIds = Array.from(companies.values())
      .filter(c => isCustomerType(c.types))
      .map(c => c.id);

    const derived = deriveSignals({
      relationships: resolved.relationships,
      customerCompanyIds: customerIds,
      companiesWithInternal: internalRes.rows.map(r => Number(r.company_id)).filter(Boolean),
      switches: switchRes.rows.map(r => ({
        companyId: Number(r.account_company_id),
        fromCompetitorId: Number(r.incumbent_company_id),
        toCompetitorId: Number(r.incoming_company_id),
      })),
    });

    // One entry per company, with each signal once. A company with three
    // relationships all carrying Recent Change gets one RC badge, not three.
    const carriedBy = new Map<number, Set<SignalKey>>();
    for (const cell of derived.cells) {
      for (const k of SIGNAL_KEYS) {
        if (!cell.signals[k]) continue;
        const set = carriedBy.get(cell.companyId) ?? new Set<SignalKey>();
        set.add(k);
        carriedBy.set(cell.companyId, set);
      }
    }
    const signals: Record<number, SignalKey[]> = {};
    for (const [companyId, set] of Array.from(carriedBy.entries())) {
      // Back through the declared order, so the badges read the same way down
      // on every row rather than in whichever order the cells arrived.
      signals[companyId] = SIGNAL_KEYS.filter(k => set.has(k));
    }

    return NextResponse.json({ signals }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('GET /api/companies/signals error:', error);
    return NextResponse.json({ error: 'Failed to load signals' }, { status: 500 });
  }
}
