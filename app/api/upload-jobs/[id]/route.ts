import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getDb } from '@/lib/getDb';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const db = await getDb(authResult?.accountId);

  const result = await db.execute({
    sql: `SELECT id, conference_id, conference_name, status, total_rows, processed_rows,
                 new_count, updated_count, skipped_count, error_message, created_at, completed_at
          FROM upload_jobs WHERE id = ? AND created_by_user_id = ?`,
    args: [params.id, authResult.id],
  });

  if (result.rows.length === 0) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 });
  }

  return NextResponse.json(result.rows[0]);
}
