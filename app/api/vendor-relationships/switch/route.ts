import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getDb } from '@/lib/getDb';
import { makeIsCompetitor } from '@/lib/competitiveResolution';
import { SWITCH_ANSWERS, type SwitchAnswer } from '@/lib/vendorSwitch';
import { applySwitch, loadCompanies, loadSwitchContext } from '@/lib/vendorSwitchServer';

/**
 * Who replaced whom, as the rep says it.
 *
 * GET fills the "Replaced by" picker. POST records the answer and does what it
 * implies — see applySwitch.
 *
 * The answer is a fact somebody stated, so it is attributed to the session's
 * user and never to anything in the body. An author the client can name is not
 * attribution, and this record is the only thing standing behind a connector
 * the grid draws with no hedging.
 */

/** Enough of the book to choose from without shipping all of it. */
const OTHER_LIMIT = 40;

export async function GET(request: NextRequest) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const db = await getDb(authResult?.accountId);

  const params = new URL(request.url).searchParams;
  const accountId = Number(params.get('account_id') ?? 0);
  const exclude = Number(params.get('exclude') ?? 0);
  const q = String(params.get('q') ?? '').trim();

  try {
    const ctx = await loadSwitchContext(db);

    // Competitors first, in full: the list is short, it is what the rep is
    // almost always reaching for, and it is the set the competitive grid can
    // actually draw. Everything else is searched rather than dumped — "not
    // conference scoped" means the whole book, which on a real account is
    // thousands of rows nobody scrolls.
    const all = await db.execute({
      sql: `SELECT id, name, company_type FROM companies
            WHERE id != ? AND id != ?
              ${q ? 'AND name LIKE ?' : ''}
            ORDER BY name
            LIMIT 2000`,
      args: q ? [accountId, exclude, `%${q}%`] : [accountId, exclude],
    }).catch(() => ({ rows: [] as Record<string, unknown>[] }));

    const companies = new Map(all.rows.map(r => [Number(r.id), {
      id: Number(r.id),
      name: r.name ? String(r.name) : '',
      types: String(r.company_type ?? '').split(',').map(v => v.trim()).filter(Boolean)
        .map(p => ctx.typeById.get(p) ?? p),
    }]));
    const isCompetitor = makeIsCompetitor(companies, ctx.competitorTypes);

    const competitors: { id: number; name: string }[] = [];
    const others: { id: number; name: string }[] = [];
    for (const c of Array.from(companies.values())) {
      (isCompetitor(c.id) ? competitors : others).push({ id: c.id, name: c.name });
    }

    return NextResponse.json(
      { competitors, others: others.slice(0, OTHER_LIMIT), othersTruncated: others.length > OTHER_LIMIT },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    console.error('GET /api/vendor-relationships/switch error:', error);
    return NextResponse.json({ error: 'Failed to load companies' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const db = await getDb(authResult?.accountId);

  try {
    const body = await request.json();
    const answer = String(body.answer ?? '') as SwitchAnswer;
    if (!SWITCH_ANSWERS.includes(answer)) {
      return NextResponse.json({ error: 'Unknown answer' }, { status: 400 });
    }
    const accountId = Number(body.account_id ?? 0);
    const incumbentCompanyId = Number(body.incumbent_company_id ?? 0);
    if (!accountId || !incumbentCompanyId) {
      return NextResponse.json(
        { error: 'account_id and incumbent_company_id are required' }, { status: 400 },
      );
    }
    // Replacing with nobody is "none". Saying somebody replaced them without
    // saying who would record a connector with one end.
    const incomingCompanyId = Number(body.incoming_company_id ?? 0) || null;
    if (answer === 'replacing' && !incomingCompanyId) {
      return NextResponse.json(
        { error: 'Choose who replaced them, or record that nobody did.' }, { status: 400 },
      );
    }

    const ctx = await loadSwitchContext(db);
    const result = await applySwitch(db, authResult.id, {
      accountId,
      incumbentCompanyId,
      incumbentRelationshipId: Number(body.incumbent_relationship_id ?? 0) || null,
      incomingCompanyId,
      incomingRelationshipId: Number(body.incoming_relationship_id ?? 0) || null,
      answer,
      markCompetitor: body.mark_competitor === true,
      vendorType: Array.isArray(body.vendor_type)
        ? body.vendor_type.map((v: unknown) => String(v).trim()).filter(Boolean) : [],
      repId: Number(body.rep_id ?? 0) || null,
    }, ctx);

    // The names back, so the toast can say what happened rather than "Saved".
    const named = await loadCompanies(
      db, [incumbentCompanyId, incomingCompanyId ?? 0], ctx,
    );
    return NextResponse.json({
      ...result,
      incumbentName: named.get(incumbentCompanyId)?.name ?? '',
      incomingName: incomingCompanyId ? named.get(incomingCompanyId)?.name ?? '' : null,
    });
  } catch (error) {
    console.error('POST /api/vendor-relationships/switch error:', error);
    return NextResponse.json({ error: 'Failed to record the switch' }, { status: 500 });
  }
}
