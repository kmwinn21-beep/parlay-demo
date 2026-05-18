import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getDb } from '@/lib/getDb';

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const user = authResult;
  const db = await getDb(user.accountId);
  const { id } = await params;
  const meetingId = Number(id);

  try {
    // Verify meeting exists and get context
    const meetingResult = await db.execute({
      sql: `SELECT m.id, m.attendee_id, m.conference_id FROM meetings m
            JOIN attendees a ON m.attendee_id = a.id
            WHERE m.id = ?`,
      args: [meetingId],
    });

    if (meetingResult.rows.length === 0) {
      return NextResponse.json({ error: 'Meeting not found' }, { status: 404 });
    }

    const meeting = meetingResult.rows[0];
    const body = await request.json();
    const { tasks } = body as {
      tasks: Array<{
        insight_id?: number;
        task_text: string;
        assigned_to?: number;
        due_date_offset_days?: number;
      }>;
    };

    if (!Array.isArray(tasks) || tasks.length === 0) {
      return NextResponse.json({ error: 'tasks array is required' }, { status: 400 });
    }

    // Look up a default next_steps option for follow_ups
    const nextStepsResult = await db.execute({
      sql: `SELECT value FROM config_options WHERE category = 'next_steps' AND action_key = 'post_mtg' LIMIT 1`,
      args: [],
    });
    const defaultNextSteps = nextStepsResult.rows.length > 0
      ? String(nextStepsResult.rows[0].value)
      : 'Follow Up';

    const created: Array<{
      id: number;
      meeting_id: number;
      insight_id: number | null;
      task_text: string;
      due_date: string | null;
      status: string;
    }> = [];

    for (const task of tasks) {
      const dueDate = task.due_date_offset_days != null
        ? new Date(Date.now() + task.due_date_offset_days * 86400000).toISOString().split('T')[0]
        : null;

      const taskResult = await db.execute({
        sql: `INSERT INTO meeting_tasks (meeting_id, insight_id, task_text, assigned_to, due_date, created_by)
              VALUES (?, ?, ?, ?, ?, ?)
              RETURNING id`,
        args: [
          meetingId,
          task.insight_id ?? null,
          task.task_text,
          task.assigned_to ?? null,
          dueDate,
          user.id ?? null,
        ],
      });

      const taskId = taskResult.rows[0] ? Number(taskResult.rows[0].id) : 0;

      created.push({
        id: taskId,
        meeting_id: meetingId,
        insight_id: task.insight_id ?? null,
        task_text: task.task_text,
        due_date: dueDate,
        status: 'pending',
      });

      // Also create a follow_up record
      await db.execute({
        sql: `INSERT INTO follow_ups (attendee_id, conference_id, next_steps, next_steps_notes, assigned_rep, completed)
              VALUES (?, ?, ?, ?, ?, 0)`,
        args: [
          Number(meeting.attendee_id),
          Number(meeting.conference_id),
          defaultNextSteps,
          task.task_text,
          task.assigned_to ? String(task.assigned_to) : null,
        ],
      });
    }

    return NextResponse.json({ tasks: created });
  } catch (error) {
    console.error('POST /api/meetings/[id]/tasks error:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
