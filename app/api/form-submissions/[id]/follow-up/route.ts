import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { db, dbReady } from '@/lib/db';

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const user = authResult;
  try {
    await dbReady;

    // Get submission info
    const subRow = await db.execute({
      sql: `SELECT fs.conference_id, fs.attendee_id, cf.name as form_name
            FROM form_submissions fs
            JOIN conference_forms cf ON fs.conference_form_id = cf.id
            WHERE fs.id = ?`,
      args: [params.id],
    });
    if (subRow.rows.length === 0) return NextResponse.json({ error: 'Submission not found' }, { status: 404 });
    const sub = subRow.rows[0];

    if (!sub.attendee_id) return NextResponse.json({ error: 'No attendee associated with this submission' }, { status: 400 });

    // Find "Form" next step option
    const nextStepRow = await db.execute({
      sql: `SELECT id, value FROM config_options WHERE category = 'next_steps' AND LOWER(value) = 'form' LIMIT 1`,
      args: [],
    });
    // Fallback to first next_steps option if 'Form' doesn't exist
    const fallbackRow = await db.execute({
      sql: `SELECT id, value FROM config_options WHERE category = 'next_steps' ORDER BY sort_order LIMIT 1`,
      args: [],
    });
    const nextStepOpt = nextStepRow.rows.length > 0 ? nextStepRow.rows[0] : fallbackRow.rows[0];
    const nextStepValue = nextStepOpt ? String(nextStepOpt.value) : 'Form';

    // Get rep config_id for assignment
    let assignedRep: string | null = null;
    try {
      const configRow = await db.execute({
        sql: `SELECT config_id FROM users WHERE email = ? AND config_id IS NOT NULL`,
        args: [user.email],
      });
      if (configRow.rows.length > 0) assignedRep = String(configRow.rows[0].config_id);
    } catch { /* non-fatal */ }

    await db.execute({
      sql: `INSERT INTO follow_ups (attendee_id, conference_id, next_steps, next_steps_notes, assigned_rep, completed)
            VALUES (?, ?, ?, ?, ?, 0)`,
      args: [
        sub.attendee_id,
        sub.conference_id,
        nextStepValue,
        `Follow up from form: ${sub.form_name}`,
        assignedRep,
      ],
    });

    return NextResponse.json({ success: true }, { status: 201 });
  } catch (error) {
    console.error('POST /api/form-submissions/[id]/follow-up error:', error);
    return NextResponse.json({ error: 'Failed to create follow-up' }, { status: 500 });
  }
}
