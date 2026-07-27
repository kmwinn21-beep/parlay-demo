import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getDb } from '@/lib/getDb';

// GET /api/admin/master-accounts — upload history + active-list stats for the
// Admin → Master Accounts tab. Administrator-only (enforced below; the /admin
// route itself is also gated at the middleware level).
export async function GET(request: NextRequest) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  if (authResult.role !== 'administrator') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const db = await getDb(authResult.accountId);

  try {
    const uploadRows = await db.execute({
      sql: `SELECT malu.id, malu.uploaded_at, malu.file_name, malu.file_size, malu.row_count,
                   malu.status, malu.upload_mode, malu.column_mapping, malu.notes,
                   u.display_name AS uploader_display_name, u.email AS uploader_email
            FROM master_account_list_uploads malu
            LEFT JOIN users u ON u.id = malu.uploaded_by_user_id
            ORDER BY malu.uploaded_at DESC, malu.id DESC`,
      args: [],
    });

    const uploads = uploadRows.rows.map(r => ({
      id: Number(r.id),
      uploadedAt: String(r.uploaded_at),
      fileName: String(r.file_name),
      fileSize: r.file_size != null ? Number(r.file_size) : null,
      rowCount: r.row_count != null ? Number(r.row_count) : null,
      status: String(r.status) as 'active' | 'archived',
      uploadMode: String(r.upload_mode) as 'replace' | 'merge',
      uploadedByName: r.uploader_display_name ? String(r.uploader_display_name) : (r.uploader_email ? String(r.uploader_email) : null),
      columnMapping: (() => {
        try { return JSON.parse(String(r.column_mapping ?? '{}')) as Record<string, string>; }
        catch { return {}; }
      })(),
      notes: r.notes ? String(r.notes) : null,
    }));

    const activeUploadId = uploads.find(u => u.status === 'active')?.id ?? null;

    const countRes = await db.execute({
      sql: `SELECT COUNT(*) AS cnt FROM master_account_list
            WHERE upload_id IN (SELECT id FROM master_account_list_uploads WHERE status = 'active')`,
      args: [],
    });
    const totalActiveRecords = Number(countRes.rows[0]?.cnt ?? 0);

    return NextResponse.json({ uploads, activeUploadId, totalActiveRecords });
  } catch (error) {
    console.error('GET /api/admin/master-accounts error:', error);
    return NextResponse.json({ error: 'Failed to fetch master account uploads' }, { status: 500 });
  }
}
