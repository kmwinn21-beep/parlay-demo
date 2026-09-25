/**
 * The relationship map's data: who is on it, and what connects them.
 *
 * The map answers "who is connected to this company" for a whole conference at
 * once, which the company record could not do until relationships were read
 * from both ends. Every edge here depends on that: a vendor node showing none
 * of its operators is exactly the shape the one-directional read produced.
 */

/**
 * Which side of the market a company sits on.
 *
 * company_type is the field that exists for this, so it decides. It is often
 * blank though — it is inferred from the company's name on import and a badge
 * scan leaves it empty — so a company with no type is placed by where it sits
 * on its relationships instead: the related_company_id end is the one being
 * bought from.
 *
 * Only on relationships that describe a purchase, though. Not every link is
 * one: two operators can be Preferred Partners, and whichever of them happened
 * to log it puts the other on the related_company_id end without either one
 * selling anything. A fixture with exactly that shape filed a 1,240-unit
 * operator with people at the show as a vendor, so the fallback counts only
 * the statuses that invert — a status with a different word at each end has a
 * buyer and a seller, and a status that reads the same both ways does not.
 *
 * A company with neither a type nor a relationship is an operator. The map is
 * built around the operators a rep sells to, and an unplaceable company reads
 * better as one of those than as a vendor nobody has recorded selling to them.
 */
export const VENDOR_TYPES = ['Vendor', 'Partner', 'Competitor'];
export const OPERATOR_TYPES = ['Customer', 'Prospect', 'Former Customer'];

export type CompanyKind = 'operator' | 'vendor';

export function classifyCompany(
  companyType: string | null | undefined,
  /** True when this company is the related_company_id end of any relationship. */
  isSoldFrom: boolean,
): CompanyKind {
  const t = String(companyType ?? '').trim();
  if (VENDOR_TYPES.includes(t)) return 'vendor';
  if (OPERATOR_TYPES.includes(t)) return 'operator';
  return isSoldFrom ? 'vendor' : 'operator';
}

export interface GraphCompany {
  id: number;
  name: string;
  company_type: string | null;
  /** companies.wse, under whatever label the account calls units. */
  units: number | null;
}

/** One relationship, as stored — from the company that has the vendor. */
export interface GraphEdgeInput {
  id: number;
  /** The company_id end: the one that recorded having this relationship. */
  from: number;
  /** The related_company_id end: the one being bought from. */
  to: number;
  relationship_status: string[];
  strength: string | null;
  vendor_type: string[];
  stale: boolean;
  /**
   * The status describes a purchase, so `to` is selling to `from`.
   *
   * False for a link that reads the same from either end — a partnership says
   * nothing about who sells to whom, and treating it as a sale files the
   * wrong company as a vendor.
   */
  implies_vendor: boolean;
}

export interface GraphNode extends GraphCompany {
  kind: CompanyKind;
  /** People from this company at the conference. Zero reads as "not at this show". */
  attendeeCount: number;
  /** Edges touching this node, either end. */
  relationshipCount: number;
}

export interface Graph {
  nodes: GraphNode[];
  edges: GraphEdgeInput[];
}

/**
 * The graph for a set of companies and the relationships among them.
 *
 * Edges come in as stored, pointing from the company that recorded the
 * relationship to the one it buys from. They are not re-read per side here —
 * the map centres on one node at a time and inverts at that point, where it
 * knows which end the reader is looking from.
 *
 * A company appearing only as the far end of somebody else's relationship is
 * still a node: that is how a vendor gets onto a conference map at all, and
 * how the count under it ("11 operators here") has anything to count.
 */
export function buildGraph(
  companies: GraphCompany[],
  edges: GraphEdgeInput[],
  attendeeCounts: Map<number, number>,
): Graph {
  // Which companies are bought from, for classifying the ones with no type.
  // Only purchase relationships count — see classifyCompany.
  const soldFrom = new Set(edges.filter(e => e.implies_vendor).map(e => e.to));

  const degree = new Map<number, number>();
  for (const e of edges) {
    degree.set(e.from, (degree.get(e.from) ?? 0) + 1);
    degree.set(e.to, (degree.get(e.to) ?? 0) + 1);
  }

  const nodes = companies.map(c => ({
    ...c,
    kind: classifyCompany(c.company_type, soldFrom.has(c.id)),
    attendeeCount: attendeeCounts.get(c.id) ?? 0,
    relationshipCount: degree.get(c.id) ?? 0,
  }));

  // Alphabetical, because the picker beside the map is a list somebody reads
  // rather than a ranking. Ordering by degree would put the same handful of
  // vendors at the top of every account's map.
  nodes.sort((a, b) => a.name.localeCompare(b.name));
  return { nodes, edges };
}

/**
 * Drop nodes that nothing connects to and that are not at the conference.
 *
 * The "all accounts" scope would otherwise carry every company on the books,
 * most of them isolated dots. A company at the conference stays whether or not
 * it has a relationship — that it is here is the point.
 */
export function pruneIsolated(graph: Graph, atConference: Set<number>): Graph {
  const connected = new Set<number>();
  for (const e of graph.edges) { connected.add(e.from); connected.add(e.to); }
  return {
    nodes: graph.nodes.filter(n => connected.has(n.id) || atConference.has(n.id)),
    edges: graph.edges,
  };
}
