import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getDb } from '@/lib/getDb';
import { computeConferenceStage } from '@/lib/conference-stage';
import type { ConferenceStage } from '@/lib/conference-stage';

const VALID_STAGES: ConferenceStage[] = ['planning', 'in_progress', 'post_conference', 'closed'];
const VALID_ACTIONS = ['set_override', 'clear_override', 'extend_window', 'close_now', 'reopen'];

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const user = authResult;
  const db = await getDb(user?.accountId);

  if (user.role !== 'administrator') {
    return NextResponse.json({ error: 'Administrator access required.' }, { status: 403 });
  }

  try {
    const conferenceId = Number(params.id);
    const body = await request.json() as {
      action: string;
      stage?: string;
      days?: number;
      reason?: string;
    };
    const { action, stage, days, reason } = body;

    if (!VALID_ACTIONS.includes(action)) {
      return NextResponse.json({ error: 'Invalid action.' }, { status: 400 });
    }

    const confRow = await db.execute({
      sql: 'SELECT start_date, end_date, post_conference_days, stage_override, is_historical FROM conferences WHERE id = ?',
      args: [conferenceId],
    });
    if (confRow.rows.length === 0) {
      return NextResponse.json({ error: 'Conference not found.' }, { status: 404 });
    }
    const conf = confRow.rows[0];
    if (Number(conf.is_historical)) {
      return NextResponse.json({ error: 'Historical conferences cannot have stage overrides.' }, { status: 400 });
    }

    const currentStage = computeConferenceStage({
      start_date: String(conf.start_date),
      end_date: String(conf.end_date),
      post_conference_days: conf.post_conference_days != null ? Number(conf.post_conference_days) : null,
      stage_override: conf.stage_override != null ? String(conf.stage_override) : null,
    });

    let updates: string[] = [];
    let args: (string | number | null)[] = [];
    let toStage: string = currentStage;

    if (action === 'set_override') {
      if (!stage || !VALID_STAGES.includes(stage as ConferenceStage)) {
        return NextResponse.json({ error: 'Valid stage required for set_override.' }, { status: 400 });
      }
      toStage = stage;
      updates = ['stage_override = ?', 'stage_override_by = ?', 'stage_override_at = ?', 'stage_override_reason = ?'];
      args = [stage, user.email, Math.floor(Date.now() / 1000), reason ?? null];
    } else if (action === 'clear_override') {
      toStage = computeConferenceStage({
        start_date: String(conf.start_date),
        end_date: String(conf.end_date),
        post_conference_days: conf.post_conference_days != null ? Number(conf.post_conference_days) : null,
        stage_override: null,
      });
      updates = ['stage_override = NULL', 'stage_override_by = NULL', 'stage_override_at = NULL', 'stage_override_reason = NULL'];
    } else if (action === 'close_now') {
      toStage = 'closed';
      updates = ['stage_override = ?', 'stage_override_by = ?', 'stage_override_at = ?', 'stage_override_reason = ?'];
      args = ['closed', user.email, Math.floor(Date.now() / 1000), reason ?? null];
    } else if (action === 'reopen') {
      // Clear override so stage auto-computes
      const autoStage = computeConferenceStage({
        start_date: String(conf.start_date),
        end_date: String(conf.end_date),
        post_conference_days: conf.post_conference_days != null ? Number(conf.post_conference_days) : null,
        stage_override: null,
      });
      toStage = autoStage;
      updates = ['stage_override = NULL', 'stage_override_by = NULL', 'stage_override_at = NULL', 'stage_override_reason = NULL'];
    } else if (action === 'extend_window') {
      if (!days || !Number.isFinite(Number(days)) || Number(days) <= 0) {
        return NextResponse.json({ error: 'Positive days value required for extend_window.' }, { status: 400 });
      }
      const currentDays = conf.post_conference_days != null ? Number(conf.post_conference_days) : 10;
      const newDays = currentDays + Number(days);
      updates = ['post_conference_days = ?'];
      args = [newDays];
      const autoStage = computeConferenceStage({
        start_date: String(conf.start_date),
        end_date: String(conf.end_date),
        post_conference_days: newDays,
        stage_override: conf.stage_override != null ? String(conf.stage_override) : null,
      });
      toStage = autoStage;
    }

    if (updates.length > 0) {
      await db.execute({
        sql: `UPDATE conferences SET ${updates.join(', ')}, updated_at = datetime('now') WHERE id = ?`,
        args: [...args, conferenceId],
      });
    }

    // Write to audit log
    await db.execute({
      sql: `INSERT INTO conference_stage_log (conference_id, from_stage, to_stage, triggered_by, user_id, reason)
            VALUES (?, ?, ?, ?, ?, ?)`,
      args: [conferenceId, currentStage, toStage, action, user.id, reason ?? null],
    });

    return NextResponse.json({ success: true, stage: toStage });
  } catch (error) {
    console.error('PATCH /api/conferences/[id]/stage error:', error);
    return NextResponse.json({ error: 'Failed to update stage.' }, { status: 500 });
  }
}
