import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getDb } from '@/lib/getDb';

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const db = await getDb(authResult.accountId);

  try {
    const conferenceId = Number(params.id);
    const userEmail = authResult.email;

    // Conference global agenda info
    const confRow = await db.execute({
      sql: `SELECT global_agenda_uploaded_at, global_agenda_uploaded_by_name FROM conferences WHERE id = ?`,
      args: [conferenceId],
    });
    const conf = confRow.rows[0];
    const globalUploadedAt = conf?.global_agenda_uploaded_at ? String(conf.global_agenda_uploaded_at) : null;
    const globalUploadedByName = conf?.global_agenda_uploaded_by_name ? String(conf.global_agenda_uploaded_by_name) : null;
    const globalExists = globalUploadedAt != null;

    // User preference row
    const prefRow = await db.execute({
      sql: `SELECT preference, pending_global_notification FROM user_agenda_preferences WHERE conference_id = ? AND user_email = ?`,
      args: [conferenceId, userEmail],
    });
    const pref = prefRow.rows[0];
    const preference: 'auto' | 'personal' | 'global' = pref ? (String(pref.preference) as 'auto' | 'personal' | 'global') : 'auto';
    const pendingNotification = pref ? Number(pref.pending_global_notification) === 1 : false;

    // Personal items existence check
    const personalCheck = await db.execute({
      sql: `SELECT COUNT(*) as cnt FROM conference_my_agenda_items WHERE conference_id = ? AND user_email = ? AND source_type = 'agenda' AND agenda_item_id IS NULL`,
      args: [conferenceId, userEmail],
    });
    const personalExists = Number(personalCheck.rows[0]?.cnt ?? 0) > 0;

    // Determine source
    let source: 'global' | 'personal' | 'none';
    if (preference === 'global') {
      source = globalExists ? 'global' : 'none';
    } else if (preference === 'personal') {
      source = personalExists ? 'personal' : 'none';
    } else {
      // auto
      if (globalExists) source = 'global';
      else if (personalExists) source = 'personal';
      else source = 'none';
    }

    return NextResponse.json({
      source, preference, pendingNotification,
      globalExists, globalUploadedAt, globalUploadedByName, personalExists,
    });
  } catch (error) {
    console.error('GET /api/conferences/[id]/agenda/status error:', error);
    return NextResponse.json({ error: 'Failed to fetch agenda status' }, { status: 500 });
  }
}
