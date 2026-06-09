import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getDb } from '@/lib/getDb';
import { normalizeTitleKey } from '@/lib/titleNormalization';
import { resolveAttendeeTitleMetadataBatch } from '@/lib/titleNormalizationRules';

export async function GET(request: NextRequest) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;

  const { searchParams } = new URL(request.url);
  const idsParam = searchParams.get('ids');
  if (!idsParam) return NextResponse.json({});

  const ids = idsParam.split(',').map(Number).filter(id => Number.isFinite(id) && id > 0);
  if (ids.length === 0) return NextResponse.json({});
  if (ids.length > 500) return NextResponse.json({ error: 'Too many IDs' }, { status: 400 });

  const db = await getDb(authResult?.accountId);

  try {
  const placeholders = ids.map(() => '?').join(',');
  const result = await db.execute({
    sql: `SELECT id, title FROM attendees WHERE id IN (${placeholders})`,
    args: ids,
  });

  // Group by normalized title key to resolve each unique title only once
  const titlesByKey = new Map<string, string>();
  const attendeeToKey = new Map<number, string>();

  for (const row of result.rows) {
    const attendeeId = Number(row.id);
    const title = String(row.title ?? '').trim();
    if (!title) continue;
    const key = normalizeTitleKey(title);
    if (!key) continue;
    if (!titlesByKey.has(key)) titlesByKey.set(key, title);
    attendeeToKey.set(attendeeId, key);
  }

  // Resolve all unique titles in a single batch — schema + config fetched once
  const uniqueTitles = Array.from(titlesByKey.values());
  const metaResults = await resolveAttendeeTitleMetadataBatch(
    db,
    uniqueTitles.map(rawTitle => ({ rawTitle, organizationId: null })),
  );

  const metaByKey = new Map<string, (typeof metaResults)[number]>();
  uniqueTitles.forEach((title, i) => {
    const key = normalizeTitleKey(title);
    if (key) metaByKey.set(key, metaResults[i]);
  });

  // Map attendee IDs to their metadata
  const output: Record<string, (typeof metaResults)[number]> = {};
  for (const [attendeeId, key] of Array.from(attendeeToKey.entries())) {
    const meta = metaByKey.get(key);
    if (meta) output[String(attendeeId)] = meta;
  }

  return NextResponse.json(output);
  } catch (err) {
    console.error('[title-metadata] error:', err);
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
