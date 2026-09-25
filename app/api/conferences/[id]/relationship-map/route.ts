import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getDb } from '@/lib/getDb';
import { vendorRelsQuery, loadInverseStatuses } from '@/lib/relationshipThread';
import { isInverted } from '@/lib/relationshipDirection';
import { buildGraph, pruneIsolated, type GraphCompany, type GraphEdgeInput } from '@/lib/relationshipGraph';

/**
 * The relationship map for one conference.
 *
 * Two scopes, which the map offers as a toggle:
 *
 *   conference  the companies with somebody at this show, plus one hop out to
 *               whoever they buy from. The hop is the point — a vendor nobody
 *               sent to the show is still the thing several operators here
 *               have in common, and leaving it out would draw a map with no
 *               middle.
 *   all         every company in the account that a relationship touches.
 *
 * Relationships are read through vendorRelsQuery, which returns each row from
 * both ends. Here only one of the two is kept: the map draws an undirected
 * line between two nodes and inverts the wording when the reader centres on
 * one of them, so keeping both halves would be drawing every edge twice.
 */

/** Ceiling on the "all accounts" scope, so one account cannot hang the page. */
const MAX_COMPANIES = 2000;

function splitList(raw: unknown): string[] {
  if (!raw) return [];
  return String(raw).split(',').map(v => v.trim()).filter(Boolean);
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const db = await getDb(authResult?.accountId);

  const conferenceId = Number((await params).id);
  if (!conferenceId) return NextResponse.json({ error: 'conference id is required' }, { status: 400 });

  const scope = new URL(request.url).searchParams.get('scope') === 'all' ? 'all' : 'conference';

  try {
    // Who is here, and how many of them. One query rather than a count per
    // company: a conference with three hundred companies would otherwise be
    // three hundred round trips to label the nodes.
    const hereRes = await db.execute({
      sql: `SELECT a.company_id AS company_id, COUNT(*) AS n
            FROM conference_attendees ca
            JOIN attendees a ON a.id = ca.attendee_id
            WHERE ca.conference_id = ? AND a.company_id IS NOT NULL
            GROUP BY a.company_id`,
      args: [conferenceId],
    });
    const attendeeCounts = new Map<number, number>();
    for (const r of hereRes.rows) attendeeCounts.set(Number(r.company_id), Number(r.n));
    const atConference = new Set(Array.from(attendeeCounts.keys()));

    // The seed set the relationships are looked up for.
    let seedIds: number[];
    if (scope === 'all') {
      const allRes = await db.execute({
        sql: `SELECT id FROM companies ORDER BY id LIMIT ?`,
        args: [MAX_COMPANIES],
      });
      seedIds = allRes.rows.map(r => Number(r.id));
    } else {
      seedIds = Array.from(atConference);
    }

    if (seedIds.length === 0) {
      return NextResponse.json({ scope, nodes: [], edges: [] }, { headers: { 'Cache-Control': 'no-store' } });
    }

    const [relRows, inverses] = await Promise.all([
      vendorRelsQuery(db, seedIds),
      // Used to tell a purchase from a partnership: a status with different
      // words at each end has a buyer and a seller, one that reads the same
      // both ways does not.
      loadInverseStatuses(db),
    ]);

    // One edge per stored row. vendorRelsQuery returns each row once per end it
    // was asked for, so a relationship between two conference companies arrives
    // twice — the same id, read from each side. Keyed on the row id, and always
    // recorded in the stored direction so the two halves agree on which end is
    // the vendor.
    const edgeById = new Map<number, GraphEdgeInput>();
    for (const r of relRows.rows) {
      const id = Number(r.id);
      if (edgeById.has(id)) continue;
      const subject = Number(r.subject_id);
      const other = Number(r.related_company_id);
      const outbound = String(r.direction) !== 'inbound';
      const statuses = splitList(r.relationship_status);
      edgeById.set(id, {
        id,
        from: outbound ? subject : other,
        to: outbound ? other : subject,
        relationship_status: statuses,
        strength: r.strength ? String(r.strength) : null,
        vendor_type: splitList(r.vendor_type),
        stale: Number(r.vr_stale ?? 0) === 1,
        implies_vendor: statuses.some(st => isInverted(st, inverses)),
      });
    }
    const edges = Array.from(edgeById.values());

    // The one hop out: companies reached only by being at the far end of a
    // relationship. Without these a conference map has operators and no
    // vendors between them.
    const nodeIds = new Set<number>(seedIds);
    for (const e of edges) { nodeIds.add(e.from); nodeIds.add(e.to); }

    const ids = Array.from(nodeIds);
    const companies: GraphCompany[] = [];
    // Chunked: SQLite has a bound-parameter ceiling and the all-accounts scope
    // plus its hop can pass it.
    const CHUNK = 500;
    for (let i = 0; i < ids.length; i += CHUNK) {
      const slice = ids.slice(i, i + CHUNK);
      const res = await db.execute({
        sql: `SELECT id, name, company_type, wse FROM companies
              WHERE id IN (${slice.map(() => '?').join(',')})`,
        args: slice,
      // wse arrived after companies did; losing the unit counts is better than
      // losing the map.
      }).catch(() => db.execute({
        sql: `SELECT id, name, company_type, NULL AS wse FROM companies
              WHERE id IN (${slice.map(() => '?').join(',')})`,
        args: slice,
      }));
      for (const r of res.rows) {
        companies.push({
          id: Number(r.id),
          name: r.name ? String(r.name) : '',
          company_type: r.company_type ? String(r.company_type) : null,
          units: r.wse != null ? Number(r.wse) : null,
        });
      }
    }

    const graph = pruneIsolated(buildGraph(companies, edges, attendeeCounts), atConference);

    return NextResponse.json(
      { scope, ...graph },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    console.error('GET /api/conferences/[id]/relationship-map error:', error);
    return NextResponse.json({ error: 'Failed to build relationship map' }, { status: 500 });
  }
}
