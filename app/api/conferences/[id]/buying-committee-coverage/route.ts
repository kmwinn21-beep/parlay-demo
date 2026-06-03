import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getDb } from '@/lib/getDb';

interface BuyingCommittee {
  decision_maker: boolean;
  influencer: boolean;
  target_title: boolean;
}

function getBuyingCommittee(metadata: string | null): BuyingCommittee {
  try {
    const p = JSON.parse(metadata ?? '');
    return p.buying_committee ?? { decision_maker: true, influencer: true, target_title: true };
  } catch {
    return { decision_maker: true, influencer: true, target_title: true };
  }
}

function isActive(metadata: string | null): boolean {
  try {
    const p = JSON.parse(metadata ?? '');
    return p.active !== false;
  } catch {
    return true;
  }
}

const PRIORITY_ORDER: Record<string, number> = { high: 0, medium: 1, low: 2, partial: 3, gap: 4 };

export interface AttendeeRef {
  attendeeId: number;
  firstName: string;
  lastName: string;
  title: string | null;
  isTargeted: boolean;
}

export interface CompanyCommittee {
  companyId: number | null;
  companyName: string;
  roles: {
    decision_maker: AttendeeRef[];
    influencer: AttendeeRef[];
    target_title: AttendeeRef[];
  };
}

interface SignalRow {
  attendeeId: number;
  productName: string;
  buyerRole: string | null;
  hasFunctionMatch: boolean;
  firstName: string;
  lastName: string;
  title: string | null;
  companyId: number | null;
  companyName: string;
}

function computeCompanyCommittees(
  signals: SignalRow[],
  bc: BuyingCommittee,
  targetedIds: Set<number>,
): { full: CompanyCommittee[]; partial: CompanyCommittee[] } {
  const companyMap = new Map<string, CompanyCommittee>();

  for (const sig of signals) {
    if (!sig.buyerRole) continue;
    const key = sig.companyId != null ? String(sig.companyId) : 'unknown';
    if (!companyMap.has(key)) {
      companyMap.set(key, {
        companyId: sig.companyId,
        companyName: sig.companyName || 'Unknown company',
        roles: { decision_maker: [], influencer: [], target_title: [] },
      });
    }
    const company = companyMap.get(key)!;
    const role = sig.buyerRole as 'decision_maker' | 'influencer' | 'target_title';
    if (role in company.roles) {
      const alreadyAdded = company.roles[role].some(a => a.attendeeId === sig.attendeeId);
      if (!alreadyAdded) {
        company.roles[role].push({
          attendeeId: sig.attendeeId,
          firstName: sig.firstName,
          lastName: sig.lastName,
          title: sig.title,
          isTargeted: targetedIds.has(sig.attendeeId),
        });
      }
    }
  }

  const required: ('decision_maker' | 'influencer' | 'target_title')[] = [
    'decision_maker',
    ...(bc.influencer ? ['influencer' as const] : []),
    ...(bc.target_title ? ['target_title' as const] : []),
  ];

  const full: CompanyCommittee[] = [];
  const partial: CompanyCommittee[] = [];

  for (const company of Array.from(companyMap.values())) {
    const presentRoles = required.filter(r => company.roles[r].length > 0);
    if (presentRoles.length === required.length) {
      full.push(company);
    } else if (presentRoles.length > 0) {
      partial.push(company);
    }
  }

  return { full, partial };
}

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const db = await getDb(authResult.accountId ?? '');
  const { id } = await params;
  const conferenceId = Number(id);
  if (isNaN(conferenceId)) return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });

  const [totalRes, productsRes, signalsRes, targetsRes] = await Promise.all([
    db.execute({
      sql: `SELECT COUNT(*) as cnt FROM conference_attendees WHERE conference_id = ?`,
      args: [conferenceId],
    }),
    db.execute({
      sql: `SELECT id, value as name, metadata FROM config_options WHERE category = 'products'`,
      args: [],
    }),
    db.execute({
      sql: `SELECT aps.attendee_id, aps.product_name, aps.buyer_role, aps.function_match,
                   a.first_name, a.last_name, a.title,
                   c.id as company_id, COALESCE(c.name, 'Unknown company') as company_name
            FROM attendee_product_signals aps
            JOIN attendees a ON a.id = aps.attendee_id
            LEFT JOIN companies c ON c.id = a.company_id
            WHERE aps.conference_id = ?`,
      args: [conferenceId],
    }),
    db.execute({
      sql: `SELECT attendee_id FROM conference_targets WHERE conference_id = ?`,
      args: [conferenceId],
    }),
  ]);

  const total_attendees = Number(totalRes.rows[0]?.cnt ?? 0);
  const activeProducts = productsRes.rows.filter(r => isActive(r.metadata ? String(r.metadata) : null));

  const targetedIds = new Set<number>(targetsRes.rows.map(r => Number(r.attendee_id)));

  // Parse signal rows
  const allSignals: SignalRow[] = signalsRes.rows.map(r => ({
    attendeeId: Number(r.attendee_id),
    productName: String(r.product_name ?? ''),
    buyerRole: r.buyer_role ? String(r.buyer_role) : null,
    hasFunctionMatch: r.function_match != null,
    firstName: String(r.first_name ?? ''),
    lastName: String(r.last_name ?? ''),
    title: r.title ? String(r.title) : null,
    companyId: r.company_id != null ? Number(r.company_id) : null,
    companyName: String(r.company_name ?? 'Unknown company'),
  }));

  // Global summary counts — require function_match so these reflect full ICP signal quality
  const icpMatchedIds = new Set<number>();
  const dmIds = new Set<number>();
  const ttIds = new Set<number>();
  for (const sig of allSignals) {
    if (!sig.hasFunctionMatch) continue;
    icpMatchedIds.add(sig.attendeeId);
    if (sig.buyerRole === 'decision_maker') dmIds.add(sig.attendeeId);
    if (sig.buyerRole === 'target_title') ttIds.add(sig.attendeeId);
  }

  // Group signals by product name
  const signalsByProduct = new Map<string, SignalRow[]>();
  for (const sig of allSignals) {
    if (!signalsByProduct.has(sig.productName)) signalsByProduct.set(sig.productName, []);
    signalsByProduct.get(sig.productName)!.push(sig);
  }

  const products = activeProducts.map(p => {
    const meta = p.metadata ? String(p.metadata) : null;
    const bc = getBuyingCommittee(meta);
    const name = String(p.name ?? '');
    const sigs = signalsByProduct.get(name) ?? [];

    // Per-product role counts (unique attendee IDs)
    const dmSet = new Set(sigs.filter(s => s.buyerRole === 'decision_maker').map(s => s.attendeeId));
    const infSet = new Set(sigs.filter(s => s.buyerRole === 'influencer').map(s => s.attendeeId));
    const ttSet = new Set(sigs.filter(s => s.buyerRole === 'target_title').map(s => s.attendeeId));

    const { full: fullCompanies, partial: partialCompanies } = computeCompanyCommittees(sigs, bc, targetedIds);

    const strength: 'high' | 'moderate' | 'low' | 'none' =
      ttSet.size >= 5 ? 'high' : ttSet.size >= 2 ? 'moderate' : ttSet.size === 1 ? 'low' : 'none';

    let floor_priority: 'high' | 'medium' | 'low' | 'partial' | 'gap';
    if (fullCompanies.length > 0 && strength === 'high') floor_priority = 'high';
    else if (fullCompanies.length > 0 && strength === 'moderate') floor_priority = 'medium';
    else if (fullCompanies.length > 0 && strength === 'low') floor_priority = 'low';
    else if (partialCompanies.length > 0) floor_priority = 'partial';
    else floor_priority = 'gap';

    return {
      product_id: Number(p.id),
      product_name: name,
      buying_committee: bc,
      decision_maker_count: dmSet.size,
      influencer_count: infSet.size,
      target_title_count: ttSet.size,
      full_committee_count: fullCompanies.length,
      partial_committee_count: partialCompanies.length,
      full_committee_companies: fullCompanies,
      partial_committee_companies: partialCompanies,
      strength,
      floor_priority,
    };
  }).sort((a, b) => {
    const po = (PRIORITY_ORDER[a.floor_priority] ?? 5) - (PRIORITY_ORDER[b.floor_priority] ?? 5);
    if (po !== 0) return po;
    return b.target_title_count - a.target_title_count;
  });

  return NextResponse.json({
    total_attendees,
    icp_matched: icpMatchedIds.size,
    decision_makers: dmIds.size,
    target_titles: ttIds.size,
    products,
  });
}
