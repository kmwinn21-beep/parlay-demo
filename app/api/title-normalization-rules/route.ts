import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { db, dbReady } from '@/lib/db';
import { BUYER_ROLE_OPTIONS, type BuyerRoleKey, type TitleMatchConfidence } from '@/lib/titleNormalization';
import { applyRuleToExactTitle, ensureTitleNormalizationSchema, getRuleForTitle, resolveAttendeeTitleMetadata, upsertTitleNormalizationRule } from '@/lib/titleNormalizationRules';

function isBuyerRole(value: unknown): value is BuyerRoleKey {
  return BUYER_ROLE_OPTIONS.some(option => option.key === value);
}

function isConfidence(value: unknown): value is TitleMatchConfidence {
  return value === 'high' || value === 'medium' || value === 'low';
}

async function configOptionExists(id: number, category: string): Promise<boolean> {
  const result = await db.execute({ sql: 'SELECT id FROM config_options WHERE id = ? AND category = ? LIMIT 1', args: [id, category] });
  return result.rows.length > 0;
}

export async function GET(request: NextRequest) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  try {
    await dbReady;
    await ensureTitleNormalizationSchema();
    const { searchParams } = new URL(request.url);
    const rawTitle = searchParams.get('raw_title');
    const organizationId = searchParams.get('organization_id') ? Number(searchParams.get('organization_id')) : null;

    if (rawTitle) {
      const [rule, metadata] = await Promise.all([
        getRuleForTitle(rawTitle, organizationId),
        resolveAttendeeTitleMetadata(rawTitle, organizationId),
      ]);
      return NextResponse.json({ rule, metadata }, { headers: { 'Cache-Control': 'no-store' } });
    }

    const result = await db.execute({
      sql: 'SELECT * FROM title_normalization_rules WHERE COALESCE(organization_id, 0) = COALESCE(?, 0) ORDER BY updated_at DESC, raw_title',
      args: [organizationId],
    });
    return NextResponse.json(result.rows, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('GET /api/title-normalization-rules error:', error);
    return NextResponse.json({ error: 'Failed to fetch title normalization rules' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  try {
    await dbReady;
    const body = await request.json();
    const rawTitle = typeof body.raw_title === 'string' ? body.raw_title.trim() : '';
    const normalizedTitle = typeof body.normalized_title === 'string' ? body.normalized_title.trim() : '';
    const functionId = Number(body.function_id);
    const seniorityId = Number(body.seniority_id);
    const buyerRole = body.buyer_role;
    const confidence = isConfidence(body.confidence) ? body.confidence : 'high';
    const organizationId = body.organization_id == null || body.organization_id === '' ? null : Number(body.organization_id);

    if (!rawTitle || !normalizedTitle) return NextResponse.json({ error: 'raw_title and normalized_title are required' }, { status: 400 });
    if (!Number.isFinite(functionId) || !(await configOptionExists(functionId, 'function'))) return NextResponse.json({ error: 'function_id must reference a function config option' }, { status: 400 });
    if (!Number.isFinite(seniorityId) || !(await configOptionExists(seniorityId, 'seniority'))) return NextResponse.json({ error: 'seniority_id must reference a seniority config option' }, { status: 400 });
    if (!isBuyerRole(buyerRole)) return NextResponse.json({ error: 'buyer_role must be decision_maker, influencer, target_title, or ignore' }, { status: 400 });
    if (organizationId != null && !Number.isFinite(organizationId)) return NextResponse.json({ error: 'organization_id must be numeric when provided' }, { status: 400 });

    const rule = await upsertTitleNormalizationRule({
      organization_id: organizationId,
      raw_title: rawTitle,
      normalized_title: normalizedTitle,
      function_id: functionId,
      seniority_id: seniorityId,
      buyer_role: buyerRole,
      confidence,
      notes: typeof body.notes === 'string' ? body.notes : null,
      user_id: authResult.id,
    });

    const affected = body.apply_all_exact === false ? { attendeeCount: 0, companyCount: 0 } : await applyRuleToExactTitle(rule);
    const metadata = await resolveAttendeeTitleMetadata(rawTitle, organizationId);
    return NextResponse.json({ rule, metadata, affected });
  } catch (error) {
    console.error('POST /api/title-normalization-rules error:', error);
    return NextResponse.json({ error: 'Failed to save title normalization rule' }, { status: 500 });
  }
}
