import { NextRequest, NextResponse } from 'next/server';
import { db, dbReady } from '@/lib/db';

// DELETE /api/conferences/[id]/attendees
// Body: { attendee_ids: number[] }
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await dbReady;
    const body = await request.json();
    const { attendee_ids } = body as { attendee_ids: number[] };

    if (!Array.isArray(attendee_ids) || attendee_ids.length === 0) {
      return NextResponse.json({ error: 'attendee_ids required' }, { status: 400 });
    }

    const placeholders = attendee_ids.map(() => '?').join(', ');

    // Find which of these attendees are only linked to this conference (will become orphans)
    const orphanCheckResult = await db.execute({
      sql: `SELECT a.id, a.company_id FROM attendees a
            WHERE a.id IN (${placeholders})
            AND (SELECT COUNT(*) FROM conference_attendees ca WHERE ca.attendee_id = a.id) = 1`,
      args: attendee_ids,
    });
    const orphanedAttendeeIds = orphanCheckResult.rows.map((r) => r.id as number);
    const affectedCompanyIds = orphanCheckResult.rows
      .filter((r) => r.company_id != null)
      .map((r) => r.company_id as number);

    // Remove the conference link
    await db.execute({
      sql: `DELETE FROM conference_attendees WHERE conference_id = ? AND attendee_id IN (${placeholders})`,
      args: [params.id, ...attendee_ids],
    });

    // Delete orphaned attendees
    if (orphanedAttendeeIds.length > 0) {
      const orphanPlaceholders = orphanedAttendeeIds.map(() => '?').join(', ');
      await db.batch(
        [
          { sql: `DELETE FROM entity_notes WHERE entity_type = 'attendee' AND entity_id IN (${orphanPlaceholders})`, args: orphanedAttendeeIds },
          { sql: `DELETE FROM attendees WHERE id IN (${orphanPlaceholders})`, args: orphanedAttendeeIds },
        ],
        'write'
      );
    }

    // Delete orphaned companies (no attendees linked to any conference)
    if (affectedCompanyIds.length > 0) {
      const compPlaceholders = affectedCompanyIds.map(() => '?').join(', ');
      const orphanedCompaniesResult = await db.execute({
        sql: `SELECT c.id FROM companies c
              WHERE c.id IN (${compPlaceholders})
              AND NOT EXISTS (
                SELECT 1 FROM attendees a
                JOIN conference_attendees ca ON a.id = ca.attendee_id
                WHERE a.company_id = c.id
              )`,
        args: affectedCompanyIds,
      });
      const orphanedCompanyIds = orphanedCompaniesResult.rows.map((r) => r.id as number);

      if (orphanedCompanyIds.length > 0) {
        const ocPlaceholders = orphanedCompanyIds.map(() => '?').join(', ');
        await db.batch(
          [
            { sql: `UPDATE companies SET parent_company_id = NULL WHERE parent_company_id IN (${ocPlaceholders})`, args: orphanedCompanyIds },
            { sql: `UPDATE attendees SET company_id = NULL WHERE company_id IN (${ocPlaceholders})`, args: orphanedCompanyIds },
            { sql: `DELETE FROM entity_notes WHERE entity_type = 'company' AND entity_id IN (${ocPlaceholders})`, args: orphanedCompanyIds },
            { sql: `DELETE FROM companies WHERE id IN (${ocPlaceholders})`, args: orphanedCompanyIds },
          ],
          'write'
        );
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('DELETE /api/conferences/[id]/attendees error:', error);
    return NextResponse.json({ error: 'Failed to remove attendees' }, { status: 500 });
  }
}
