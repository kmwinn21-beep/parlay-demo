import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getDb } from '@/lib/getDb';

// DELETE /api/admin/master-accounts/uploads/[id] — archives an upload
// (status = 'archived'). Rows in master_account_list are never deleted here;
// this only affects which uploads count as "active" for the records view.
export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  if (authResult.role !== 'administrator') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const db = await getDb(authResult.accountId);

  const uploadId = Number(params.id);
  if (!uploadId) return NextResponse.json({ error: 'Invalid upload id' }, { status: 400 });

  try {
    const existing = await db.execute({
      sql: `SELECT id FROM master_account_list_uploads WHERE id = ?`,
      args: [uploadId],
    });
    if (existing.rows.length === 0) {
      return NextResponse.json({ error: 'Upload not found' }, { status: 404 });
    }

    await db.execute({
      sql: `UPDATE master_account_list_uploads SET status = 'archived' WHERE id = ?`,
      args: [uploadId],
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('DELETE /api/admin/master-accounts/uploads/[id] error:', error);
    return NextResponse.json({ error: 'Failed to archive upload' }, { status: 500 });
  }
}
