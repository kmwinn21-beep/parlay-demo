import { NextRequest, NextResponse } from 'next/server';
import { requireOpsAdmin } from '@/lib/opsAuth';
import { createClient } from '@libsql/client';
import { db, dbReady } from '@/lib/db';

export async function GET(request: NextRequest) {
  const auth = await requireOpsAdmin(request);
  if (auth instanceof NextResponse) return auth;

  const { searchParams } = new URL(request.url);
  const accountId = searchParams.get('accountId');

  if (!accountId) {
    return NextResponse.json({ error: 'accountId is required' }, { status: 400 });
  }

  await dbReady;
  const accountRow = await db.execute({
    sql: `SELECT turso_db_url, turso_auth_token FROM accounts WHERE id = ?`,
    args: [accountId],
  });
  if (!accountRow.rows[0]?.turso_db_url) {
    return NextResponse.json({ error: 'Account not found or no tenant DB' }, { status: 404 });
  }

  const client = createClient({
    url: String(accountRow.rows[0].turso_db_url),
    authToken: String(accountRow.rows[0].turso_auth_token),
  });

  try {
    const res = await client.execute({
      sql: `SELECT
              c.id,
              c.name,
              COUNT(ca.attendee_id) AS attendee_count,
              SUM(CASE WHEN co.company_type = 'Prospect' THEN 1 ELSE 0 END) AS prospect_count,
              SUM(CASE WHEN co.company_type = 'Partner' THEN 1 ELSE 0 END) AS partner_count,
              SUM(CASE WHEN co.company_type = 'Vendor' THEN 1 ELSE 0 END) AS vendor_count
            FROM conferences c
            LEFT JOIN conference_attendees ca ON ca.conference_id = c.id
            LEFT JOIN attendees a ON a.id = ca.attendee_id
            LEFT JOIN companies co ON co.id = a.company_id
            GROUP BY c.id, c.name
            ORDER BY c.start_date DESC`,
      args: [],
    });

    return NextResponse.json(
      res.rows.map(r => ({
        id: Number(r.id),
        name: String(r.name ?? ''),
        attendeeCount: Number(r.attendee_count ?? 0),
        prospectCount: Number(r.prospect_count ?? 0),
        partnerCount: Number(r.partner_count ?? 0),
        vendorCount: Number(r.vendor_count ?? 0),
      })),
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
