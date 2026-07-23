import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getDb } from '@/lib/getDb';

// Lets the Plan tab remove a conference it added but never committed —
// scoped strictly to uncommitted drafts (committed_to_program = 0) so this
// can't be used to delete a real, committed conference (that has its own
// deletion path from the Conference Details page). Mirrors that same
// route's cleanup of tables without ON DELETE CASCADE — a Plan-tab draft can
// already have real attendees/companies (the List Score column imports a
// prospect list as real attendees for scoring), so this can't just be a bare
// DELETE FROM conferences the way an always-empty draft would allow.
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const db = await getDb(authResult?.accountId);

  const { id } = await params;
  const conferenceId = parseInt(id, 10);
  if (isNaN(conferenceId)) return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });

  try {
    const confRes = await db.execute({ sql: `SELECT committed_to_program FROM conferences WHERE id = ?`, args: [conferenceId] });
    const row = confRes.rows[0] as Record<string, unknown> | undefined;
    if (!row) return NextResponse.json({ error: 'Conference not found' }, { status: 404 });
    if (Number(row.committed_to_program ?? 1) === 1) {
      return NextResponse.json({ error: 'Only uncommitted Plan-tab conferences can be deleted this way.' }, { status: 400 });
    }

    // Attendees that are ONLY linked to this conference (would become orphans)
    const orphanedAttendeesResult = await db.execute({
      sql: `SELECT a.id FROM attendees a
            JOIN conference_attendees ca ON a.id = ca.attendee_id
            WHERE ca.conference_id = ?
            AND (SELECT COUNT(*) FROM conference_attendees ca2 WHERE ca2.attendee_id = a.id) = 1`,
      args: [conferenceId],
    });
    const orphanedAttendeeIds = orphanedAttendeesResult.rows.map(r => Number(r.id));

    const allConferenceAttendeesResult = await db.execute({
      sql: `SELECT DISTINCT a.company_id FROM attendees a
            JOIN conference_attendees ca ON a.id = ca.attendee_id
            WHERE ca.conference_id = ? AND a.company_id IS NOT NULL`,
      args: [conferenceId],
    });
    const affectedCompanyIds = allConferenceAttendeesResult.rows.map(r => Number(r.company_id));

    await db.batch(
      [
        // NULL out follow_ups.meeting_id before deleting meetings (no CASCADE on that FK)
        { sql: 'UPDATE follow_ups SET meeting_id = NULL WHERE conference_id = ?', args: [conferenceId] },
        { sql: 'DELETE FROM conference_attendees WHERE conference_id = ?', args: [conferenceId] },
        { sql: 'DELETE FROM conference_attendee_details WHERE conference_id = ?', args: [conferenceId] },
        { sql: 'DELETE FROM meetings WHERE conference_id = ?', args: [conferenceId] },
        { sql: 'DELETE FROM entity_notes WHERE entity_type = ? AND entity_id = ?', args: ['conference', conferenceId] },
        // Tables without ON DELETE CASCADE that must be cleared before deleting the conference row
        { sql: 'DELETE FROM conference_saturation_snapshots WHERE conference_id = ?', args: [conferenceId] },
        { sql: 'DELETE FROM user_agenda_preferences WHERE conference_id = ?', args: [conferenceId] },
        { sql: 'DELETE FROM conference_snapshots WHERE conference_id = ?', args: [conferenceId] },
        { sql: 'DELETE FROM conferences WHERE id = ?', args: [conferenceId] },
      ],
      'write'
    );

    if (orphanedAttendeeIds.length > 0) {
      for (let i = 0; i < orphanedAttendeeIds.length; i += 100) {
        const chunk = orphanedAttendeeIds.slice(i, i + 100);
        const placeholders = chunk.map(() => '?').join(', ');
        await db.batch(
          [
            // contact_conference_history.attendee_id has no CASCADE
            { sql: `DELETE FROM contact_conference_history WHERE attendee_id IN (${placeholders})`, args: chunk },
            { sql: `DELETE FROM entity_notes WHERE entity_type = 'attendee' AND entity_id IN (${placeholders})`, args: chunk },
            { sql: `DELETE FROM attendees WHERE id IN (${placeholders})`, args: chunk },
          ],
          'write'
        );
      }
    }

    if (affectedCompanyIds.length > 0) {
      const placeholders = affectedCompanyIds.map(() => '?').join(', ');
      const orphanedCompaniesResult = await db.execute({
        sql: `SELECT c.id FROM companies c
              WHERE c.id IN (${placeholders})
              AND NOT EXISTS (
                SELECT 1 FROM attendees a
                JOIN conference_attendees ca ON a.id = ca.attendee_id
                WHERE a.company_id = c.id
              )`,
        args: affectedCompanyIds,
      });
      const orphanedCompanyIds = orphanedCompaniesResult.rows.map(r => Number(r.id));

      if (orphanedCompanyIds.length > 0) {
        const compPlaceholders = orphanedCompanyIds.map(() => '?').join(', ');
        await db.batch(
          [
            { sql: `UPDATE companies SET parent_company_id = NULL WHERE parent_company_id IN (${compPlaceholders})`, args: orphanedCompanyIds },
            { sql: `UPDATE attendees SET company_id = NULL WHERE company_id IN (${compPlaceholders})`, args: orphanedCompanyIds },
            { sql: `DELETE FROM entity_notes WHERE entity_type = 'company' AND entity_id IN (${compPlaceholders})`, args: orphanedCompanyIds },
            { sql: `DELETE FROM companies WHERE id IN (${compPlaceholders})`, args: orphanedCompanyIds },
          ],
          'write'
        );
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('DELETE /api/program-planner/conferences/[id] error:', error);
    return NextResponse.json({ error: 'Failed to delete conference' }, { status: 500 });
  }
}
