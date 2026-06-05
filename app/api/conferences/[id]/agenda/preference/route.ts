import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getDb } from '@/lib/getDb';

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const db = await getDb(authResult.accountId);

  try {
    const conferenceId = Number(params.id);
    const userEmail = authResult.email;
    const { preference } = await request.json() as { preference: 'personal' | 'global' };

    if (preference !== 'personal' && preference !== 'global') {
      return NextResponse.json({ error: 'preference must be personal or global' }, { status: 400 });
    }

    await db.execute({
      sql: `INSERT INTO user_agenda_preferences (user_email, conference_id, preference, pending_global_notification, updated_at)
            VALUES (?, ?, ?, 0, datetime('now'))
            ON CONFLICT(user_email, conference_id) DO UPDATE SET
              preference = excluded.preference,
              pending_global_notification = 0,
              updated_at = datetime('now')`,
      args: [userEmail, conferenceId, preference],
    });

    // Return updated status
    const confRow = await db.execute({
      sql: `SELECT global_agenda_uploaded_at, global_agenda_uploaded_by_name FROM conferences WHERE id = ?`,
      args: [conferenceId],
    });
    const conf = confRow.rows[0];
    const globalUploadedAt = conf?.global_agenda_uploaded_at ? String(conf.global_agenda_uploaded_at) : null;
    const globalUploadedByName = conf?.global_agenda_uploaded_by_name ? String(conf.global_agenda_uploaded_by_name) : null;
    const globalExists = globalUploadedAt != null;

    const personalCheck = await db.execute({
      sql: `SELECT COUNT(*) as cnt FROM conference_my_agenda_items WHERE conference_id = ? AND user_email = ? AND source_type = 'agenda' AND agenda_item_id IS NULL`,
      args: [conferenceId, userEmail],
    });
    const personalExists = Number(personalCheck.rows[0]?.cnt ?? 0) > 0;

    let source: 'global' | 'personal' | 'none';
    if (preference === 'global') source = globalExists ? 'global' : 'none';
    else source = personalExists ? 'personal' : 'none';

    return NextResponse.json({
      source, preference, pendingNotification: false,
      globalExists, globalUploadedAt, globalUploadedByName, personalExists,
    });
  } catch (error) {
    console.error('POST /api/conferences/[id]/agenda/preference error:', error);
    return NextResponse.json({ error: 'Failed to update preference' }, { status: 500 });
  }
}
