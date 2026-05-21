import { NextRequest, NextResponse } from 'next/server';
import { computeStrategyAssessment } from '@/lib/strategyAssessment';
import { classifySeniority } from '@/lib/parsers';
import crypto from 'crypto';

// ---------------------------------------------------------------------------
// CORS
// ---------------------------------------------------------------------------
const ALLOWED_ORIGINS = new Set([
  'https://useparlay.app',
  'https://www.useparlay.app',
  'http://localhost:3001',
]);

function corsHeaders(origin: string | null): Record<string, string> {
  const allowed = origin && ALLOWED_ORIGINS.has(origin) ? origin : 'https://useparlay.app';
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  };
}

export async function OPTIONS(req: NextRequest) {
  const origin = req.headers.get('origin');
  return new NextResponse(null, { status: 204, headers: corsHeaders(origin) });
}

// ---------------------------------------------------------------------------
// Rate limiting — 10 req/IP/hour (in-memory, resets on cold start)
// ---------------------------------------------------------------------------
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || entry.resetAt < now) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + 3_600_000 });
    return true;
  }
  if (entry.count >= 10) return false;
  entry.count++;
  return true;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface AttendeeInput {
  title?: string;
  company?: string;
  isProspect?: boolean;
  wse?: number | null;
}

interface IcpConfig {
  seniorityPriorities?: string[];
  functionPriorities?: string[];
  titleClassifications?: Record<string, string[]>;
}

interface RequestBody {
  attendees: AttendeeInput[];
  icpConfig: IcpConfig;
}

const DEFAULT_SENIOR_LABELS = new Set([
  'c-suite', 'vp/svp', 'director', 'ed', 'bod',
]);

// ---------------------------------------------------------------------------
// POST /api/public/score-audience
// ---------------------------------------------------------------------------
export async function POST(req: NextRequest) {
  const origin = req.headers.get('origin');
  const headers = corsHeaders(origin);

  // Rate limit
  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0].trim() ??
    req.headers.get('x-real-ip') ??
    '0.0.0.0';
  if (!checkRateLimit(ip)) {
    return NextResponse.json(
      { error: 'Rate limit exceeded. Try again later.' },
      { status: 429, headers },
    );
  }

  // Parse body
  let body: RequestBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400, headers });
  }

  const { attendees, icpConfig } = body;

  // Validate
  if (!attendees || !Array.isArray(attendees) || attendees.length === 0) {
    return NextResponse.json({ error: 'attendees is required and must be a non-empty array.' }, { status: 400, headers });
  }
  if (attendees.length > 10_000) {
    return NextResponse.json({ error: 'attendees exceeds the maximum of 10,000.' }, { status: 400, headers });
  }
  for (const a of attendees) {
    if (!a.title && !a.company) {
      return NextResponse.json({ error: 'Each attendee must include at least a title or company.' }, { status: 400, headers });
    }
  }
  if (!icpConfig || typeof icpConfig !== 'object') {
    return NextResponse.json({ error: 'icpConfig is required.' }, { status: 400, headers });
  }

  // Determine seniority priority set
  const seniorityPrioritySet = icpConfig.seniorityPriorities && icpConfig.seniorityPriorities.length > 0
    ? new Set(icpConfig.seniorityPriorities.map(s => s.toLowerCase()))
    : DEFAULT_SENIOR_LABELS;

  // Build ignore-title set from titleClassifications
  const ignoreTitles = new Set<string>(
    (icpConfig.titleClassifications?.ignore ?? []).map(t => t.toLowerCase()),
  );

  // Filter to prospects only
  const prospects = attendees.filter(a => a.isProspect !== false);

  // Aggregate seniority breakdown (all prospects)
  const seniorityCounts = new Map<string, number>();
  for (const a of prospects) {
    const label = classifySeniority(a.title);
    seniorityCounts.set(label, (seniorityCounts.get(label) ?? 0) + 1);
  }
  const seniorityBreakdown = Array.from(seniorityCounts.entries()).map(([label, count]) => ({ label, count }));

  // Group prospects by company
  const companiesByName = new Map<string, { attendees: AttendeeInput[]; wse: number | null }>();
  for (const a of prospects) {
    const key = (a.company ?? '').trim().toLowerCase() || '__unknown__';
    const existing = companiesByName.get(key);
    if (!existing) {
      companiesByName.set(key, { attendees: [a], wse: a.wse ?? null });
    } else {
      existing.attendees.push(a);
      if (a.wse != null && existing.wse == null) existing.wse = a.wse;
    }
  }

  const totalCompanies = companiesByName.size;
  const totalAttendees = prospects.length;

  // Classify each company as ICP: has at least one senior, non-ignored attendee
  const icpCompanies: { wse: number | null }[] = [];
  let qualifiedCompanies = 0;

  for (const co of Array.from(companiesByName.values())) {
    const isIcp = co.attendees.some((a: AttendeeInput) => {
      const seniority = classifySeniority(a.title).toLowerCase();
      const titleLower = (a.title ?? '').toLowerCase();
      const isIgnored = ignoreTitles.size > 0 && ignoreTitles.has(titleLower);
      return !isIgnored && seniorityPrioritySet.has(seniority);
    });
    if (isIcp) {
      icpCompanies.push({ wse: co.wse });
      qualifiedCompanies++;
    }
  }

  // Compute strategy assessment (zeroing out financial/relationship inputs)
  const assessment = await computeStrategyAssessment({
    totalAttendees,
    totalCompanies,
    icpCount: icpCompanies.length,
    clientCompanyCount: 0,
    seniorityBreakdown,
    internalRelationshipCount: 0,
    scheduledMeetingCount: 0,
    internalRepCount: 0,
    conferenceStrategyType: null,
    budgetTotal: 0,
    requiredPipeline: null,
    avgCostPerUnit: 100,
    avgAnnualDealSize: 25_000,
    icpCompanies,
  });

  // Tier proxy counts come back in assessment; re-derive from icpCompanies for response
  const mustTargetCount = assessment.mustTargetProxyCount;
  const highPriorityCount = assessment.highPriorityProxyCount;
  const worthEngagingCount = assessment.worthEngagingProxyCount;

  // Average buyer score across all prospect attendees
  const seniorCount = seniorityBreakdown
    .filter(s => DEFAULT_SENIOR_LABELS.has(s.label.toLowerCase()))
    .reduce((sum, s) => sum + s.count, 0);
  const avgBuyerScore = totalAttendees > 0
    ? Math.round(Math.min(seniorCount / totalAttendees / 0.55, 1) * 100)
    : 0;

  // Recommendation based on audienceFit (icpOpportunityScore)
  const audienceFitScore = assessment.icpOpportunityScore;
  const buyerAccessScore = assessment.buyerAccessScore;
  const combinedScore = Math.round(audienceFitScore * 0.6 + buyerAccessScore * 0.4);

  let recommendation: string;
  if (combinedScore >= 80) recommendation = 'attend_and_invest';
  else if (combinedScore >= 65) recommendation = 'attend_and_maintain';
  else if (combinedScore >= 45) recommendation = 'reconsider_format';
  else recommendation = 'skip';

  // Log (counts only, no PII)
  const hashedIp = crypto.createHash('sha256').update(ip).digest('hex').slice(0, 16);
  console.log(JSON.stringify({
    event: 'public_score_audience',
    ts: new Date().toISOString(),
    ip_hash: hashedIp,
    total_attendees: totalAttendees,
    total_companies: totalCompanies,
    icp_companies: icpCompanies.length,
    recommendation,
  }));

  return NextResponse.json(
    {
      audienceFitScore,
      buyerAccessScore,
      recommendation,
      totalAttendees,
      prospectCompanies: totalCompanies,
      qualifiedCompanies,
      mustTargetCount,
      highPriorityCount,
      worthEngagingCount,
      avgBuyerScore,
    },
    { status: 200, headers },
  );
}
