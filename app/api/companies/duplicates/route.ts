import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getDb } from '@/lib/getDb';
import { findDuplicateGroups } from '@/lib/duplicateCompanies';

/**
 * Companies that look like the same company under a different spelling.
 *
 * Read-only. Nothing here merges anything — the groups are a proposal, and the
 * merge behind them shows what it would move before it moves it.
 *
 * The grouping is done in JavaScript rather than SQL because the key is
 * normalizeCompanyName, which is the same function the upload uses to decide
 * what NOT to create twice. Sharing it is the point: a scanner that grouped
 * records the upload would file apart would have its work undone by the next
 * import.
 */
export async function GET(request: NextRequest) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const db = await getDb(authResult?.accountId);

  try {
    const [companiesResult, emailsResult, structureResult, dismissedResult] = await Promise.all([
      db.execute({
        // parent_company_id and its name come along because a family is not a
        // duplicate: merging a parent into its own child destroys a hierarchy
        // the account built, and the merge has no undo.
        sql: `SELECT c.id, c.name, c.company_type, c.website,
                     c.parent_company_id, c.entity_structure,
                     p.name AS parent_company_name,
                     COUNT(DISTINCT a.id) AS attendee_count,
                     COUNT(DISTINCT ca.conference_id) AS conference_count,
                     (SELECT COUNT(*) FROM companies k WHERE k.parent_company_id = c.id) AS child_count
                FROM companies c
                LEFT JOIN companies p ON p.id = c.parent_company_id
                LEFT JOIN attendees a ON a.company_id = c.id
                LEFT JOIN conference_attendees ca ON ca.attendee_id = a.id
               GROUP BY c.id
               ORDER BY c.name`,
        args: [],
      }),
      // Attendee emails give the domain signal its reach: two records with
      // nothing in common by name are one company if the people at both use
      // the same work domain. Fetched as raw addresses because the domain
      // rules — free providers, social links — live in JavaScript.
      db.execute({
        sql: `SELECT company_id, email FROM attendees
               WHERE company_id IS NOT NULL AND email IS NOT NULL AND email <> ''`,
        args: [],
      }),
      // What this account calls a child. Position decides, as everywhere else:
      // the second Entity Structure option is the child one. Only used for
      // records carrying a designation with no parent link behind it.
      db.execute({
        sql: `SELECT value FROM config_options WHERE category = 'entity_structure' ORDER BY sort_order, id`,
        args: [],
      }).catch(() => ({ rows: [] as Record<string, unknown>[] })),
      db.execute({ sql: 'SELECT dismissal_key FROM company_duplicate_dismissals', args: [] })
        .catch(() => ({ rows: [] as Record<string, unknown>[] })),
    ]);

    const emailsByCompany = new Map<number, string[]>();
    for (const r of emailsResult.rows) {
      const id = Number(r.company_id);
      if (!emailsByCompany.has(id)) emailsByCompany.set(id, []);
      emailsByCompany.get(id)!.push(String(r.email));
    }

    const companies = companiesResult.rows.map((r) => ({
      id: Number(r.id),
      name: String(r.name ?? ''),
      company_type: r.company_type ? String(r.company_type) : null,
      website: r.website ? String(r.website) : null,
      attendee_count: Number(r.attendee_count ?? 0),
      conference_count: Number(r.conference_count ?? 0),
      attendee_emails: emailsByCompany.get(Number(r.id)) ?? [],
      parent_company_id: r.parent_company_id != null ? Number(r.parent_company_id) : null,
      parent_company_name: r.parent_company_name ? String(r.parent_company_name) : null,
      child_count: Number(r.child_count ?? 0),
      entity_structure: r.entity_structure ? String(r.entity_structure) : null,
    }));
    const childDesignation = structureResult.rows[1]
      ? String(structureResult.rows[1].value)
      : null;
    const dismissed = new Set(dismissedResult.rows.map((r) => String(r.dismissal_key)));

    const groups = findDuplicateGroups(companies, dismissed);
    return NextResponse.json({
      groups,
      /** What this account calls a child, so the panel can label one. */
      childDesignation,
      /** Records that would go away if every group were merged as suggested. */
      redundantRecords: groups.reduce((n, g) => n + g.members.length - 1, 0),
      scanned: companies.length,
    });
  } catch (error) {
    console.error('GET /api/companies/duplicates error:', error);
    return NextResponse.json({ error: 'Failed to scan for duplicates' }, { status: 500 });
  }
}

/** Remember that a group is not a duplicate, so it stops being offered. */
export async function POST(request: NextRequest) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const db = await getDb(authResult?.accountId);

  try {
    const { dismissal_key } = await request.json() as { dismissal_key?: string };
    if (!dismissal_key) {
      return NextResponse.json({ error: 'dismissal_key required' }, { status: 400 });
    }
    await db.execute({
      // The user id goes through a subselect rather than straight in. It is
      // attribution — who said these were not duplicates — and the column has a
      // foreign key, so a session whose user has no row in THIS database (an
      // ops admin, an account mid-provision) would otherwise turn a dismissal
      // into a 500. Resolving it to NULL loses the name and keeps the answer,
      // which is the right way round for a record nobody joins on.
      sql: `INSERT OR IGNORE INTO company_duplicate_dismissals (dismissal_key, dismissed_by_user_id)
            VALUES (?, (SELECT id FROM users WHERE id = ?))`,
      args: [dismissal_key, authResult.id],
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('POST /api/companies/duplicates error:', error);
    return NextResponse.json({ error: 'Failed to dismiss' }, { status: 500 });
  }
}
