import type { Client } from '@libsql/client';

interface ProductMeta {
  functions: Record<string, 'high' | 'med' | 'ignore'>;
  seniority: Record<string, 'decision_maker' | 'influencer' | 'target_title'>;
  industries: number[];
  keywords: string[];
  aliases: string;
  active: boolean;
}

function parseMeta(s: string | null | undefined): ProductMeta {
  try {
    const p = JSON.parse(s ?? '');
    return {
      functions: p.functions ?? {},
      seniority: p.seniority ?? {},
      industries: Array.isArray(p.industries) ? p.industries : [],
      keywords: Array.isArray(p.keywords) ? p.keywords : [],
      aliases: p.aliases ?? '',
      active: p.active !== false,
    };
  } catch {
    return { functions: {}, seniority: {}, industries: [], keywords: [], aliases: '', active: true };
  }
}

export async function computeAttendeeProductSignals(
  db: Client,
  conferenceId: number,
): Promise<{ upserted: number }> {
  // Fetch active products
  const productsRes = await db.execute({
    sql: `SELECT id, value, metadata FROM config_options WHERE category = 'product_category'`,
    args: [],
  });

  const products = productsRes.rows.map((r) => ({
    name: String(r.value ?? ''),
    meta: parseMeta(r.metadata as string | null),
  })).filter((p) => p.meta.active);

  if (products.length === 0) return { upserted: 0 };

  // Build industry name → config_option ID map
  const industryOptRes = await db.execute({
    sql: `SELECT id, value FROM config_options WHERE category = 'industries'`,
    args: [],
  });
  const industryNameToId = new Map<string, number>();
  for (const row of industryOptRes.rows) {
    if (row.value) industryNameToId.set(String(row.value).toLowerCase(), Number(row.id));
  }

  // Fetch ICP=yes attendees for this conference with company info
  const attendeesRes = await db.execute({
    sql: `SELECT a.id, a.seniority, a.function, a.title, c.industry, c.id as company_id
          FROM attendees a
          JOIN conference_attendees ca ON ca.attendee_id = a.id
          LEFT JOIN companies c ON c.id = a.company_id
          WHERE ca.conference_id = ? AND LOWER(COALESCE(c.icp, '')) = 'yes'`,
    args: [conferenceId],
  });

  const attendees = attendeesRes.rows.map((r) => ({
    id: Number(r.id),
    seniority: r.seniority ? String(r.seniority) : null,
    function: r.function ? String(r.function) : null,
    title: r.title ? String(r.title) : null,
    industry: r.industry ? String(r.industry) : null,
    companyId: r.company_id ? Number(r.company_id) : null,
  }));

  if (attendees.length === 0) return { upserted: 0 };

  // Compute signals and collect upsert statements
  const stmts: { sql: string; args: (string | number | null)[] }[] = [];

  for (const product of products) {
    const meta = product.meta;
    for (const a of attendees) {
      const buyerRole: string | null = a.seniority
        ? (meta.seniority[a.seniority] ?? null)
        : null;

      let functionMatch: string | null = null;
      if (a.function) {
        const level = meta.functions[a.function];
        if (level === 'high' || level === 'med') {
          functionMatch = JSON.stringify({ fn: a.function, level });
        }
      }

      // Industry match: look up company industry name → ID, check if in product.meta.industries
      let industryMatch = 0;
      if (a.industry && meta.industries.length > 0) {
        const industryId = industryNameToId.get(a.industry.toLowerCase());
        if (industryId != null && meta.industries.includes(industryId)) {
          industryMatch = 1;
        }
      }

      const titleLower = (a.title ?? '').toLowerCase();
      const keywordMatches = meta.keywords.filter(
        (kw) => kw && titleLower.includes(kw.toLowerCase()),
      );
      const keywordMatchesJson = keywordMatches.length > 0
        ? JSON.stringify(keywordMatches)
        : null;

      // Only store if at least one signal is present
      if (!buyerRole && !functionMatch && !industryMatch && !keywordMatchesJson) continue;

      stmts.push({
        sql: `INSERT INTO attendee_product_signals
                (attendee_id, conference_id, product_name, buyer_role, function_match, industry_match, keyword_matches, computed_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
              ON CONFLICT(attendee_id, conference_id, product_name) DO UPDATE SET
                buyer_role = excluded.buyer_role,
                function_match = excluded.function_match,
                industry_match = excluded.industry_match,
                keyword_matches = excluded.keyword_matches,
                computed_at = excluded.computed_at`,
        args: [a.id, conferenceId, product.name, buyerRole, functionMatch, industryMatch, keywordMatchesJson],
      });
    }
  }

  // Delete stale rows (signals for products/attendees no longer relevant)
  await db.execute({
    sql: `DELETE FROM attendee_product_signals WHERE conference_id = ?`,
    args: [conferenceId],
  });

  // Batch upsert
  if (stmts.length > 0) {
    for (let i = 0; i < stmts.length; i += 200) {
      await db.batch(stmts.slice(i, i + 200), 'write');
    }
  }

  return { upserted: stmts.length };
}
