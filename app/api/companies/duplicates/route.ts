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
    const [companiesResult, dismissedResult] = await Promise.all([
      db.execute({
        sql: `SELECT c.id, c.name, c.company_type, c.website,
                     COUNT(DISTINCT a.id) AS attendee_count,
                     COUNT(DISTINCT ca.conference_id) AS conference_count
                FROM companies c
                LEFT JOIN attendees a ON a.company_id = c.id
                LEFT JOIN conference_attendees ca ON ca.attendee_id = a.id
               GROUP BY c.id
               ORDER BY c.name`,
        args: [],
      }),
      db.execute({ sql: 'SELECT dismissal_key FROM company_duplicate_dismissals', args: [] })
        .catch(() => ({ rows: [] as Record<string, unknown>[] })),
    ]);

    const companies = companiesResult.rows.map((r) => ({
      id: Number(r.id),
      name: String(r.name ?? ''),
      company_type: r.company_type ? String(r.company_type) : null,
      website: r.website ? String(r.website) : null,
      attendee_count: Number(r.attendee_count ?? 0),
      conference_count: Number(r.conference_count ?? 0),
    }));
    const dismissed = new Set(dismissedResult.rows.map((r) => String(r.dismissal_key)));

    const groups = findDuplicateGroups(companies, dismissed);
    return NextResponse.json({
      groups,
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
