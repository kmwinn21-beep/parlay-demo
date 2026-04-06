import { NextResponse } from 'next/server';
import { db, dbReady } from '@/lib/db';

// POST /api/cleanup - Remove orphaned attendees and companies not linked to any conference
export async function POST() {
  try {
    await dbReady;

    // Find attendees not linked to any conference
    const orphanedAttendeesResult = await db.execute({
      sql: `SELECT id, company_id FROM attendees a
            WHERE NOT EXISTS (
              SELECT 1 FROM conference_attendees ca WHERE ca.attendee_id = a.id
            )`,
      args: [],
    });
    const orphanedAttendeeIds = orphanedAttendeesResult.rows.map((r) => r.id as number);

    // Delete orphaned attendees in chunks
    if (orphanedAttendeeIds.length > 0) {
      const chunks = [];
      for (let i = 0; i < orphanedAttendeeIds.length; i += 100) {
        chunks.push(orphanedAttendeeIds.slice(i, i + 100));
      }
      for (const chunk of chunks) {
        const placeholders = chunk.map(() => '?').join(', ');
        await db.batch(
          [
            { sql: `DELETE FROM entity_notes WHERE entity_type = 'attendee' AND entity_id IN (${placeholders})`, args: chunk },
            { sql: `DELETE FROM attendees WHERE id IN (${placeholders})`, args: chunk },
          ],
          'write'
        );
      }
    }

    // Find companies not linked to any conference through attendees
    const orphanedCompaniesResult = await db.execute({
      sql: `SELECT id FROM companies c
            WHERE NOT EXISTS (
              SELECT 1 FROM attendees a
              JOIN conference_attendees ca ON a.id = ca.attendee_id
              WHERE a.company_id = c.id
            )`,
      args: [],
    });
    const orphanedCompanyIds = orphanedCompaniesResult.rows.map((r) => r.id as number);

    // Delete orphaned companies in chunks
    if (orphanedCompanyIds.length > 0) {
      const chunks = [];
      for (let i = 0; i < orphanedCompanyIds.length; i += 100) {
        chunks.push(orphanedCompanyIds.slice(i, i + 100));
      }
      for (const chunk of chunks) {
        const placeholders = chunk.map(() => '?').join(', ');
        await db.batch(
          [
            { sql: `UPDATE companies SET parent_company_id = NULL WHERE parent_company_id IN (${placeholders})`, args: chunk },
            { sql: `UPDATE attendees SET company_id = NULL WHERE company_id IN (${placeholders})`, args: chunk },
            { sql: `DELETE FROM entity_notes WHERE entity_type = 'company' AND entity_id IN (${placeholders})`, args: chunk },
            { sql: `DELETE FROM companies WHERE id IN (${placeholders})`, args: chunk },
          ],
          'write'
        );
      }
    }

    return NextResponse.json({
      success: true,
      deleted_attendees: orphanedAttendeeIds.length,
      deleted_companies: orphanedCompanyIds.length,
    });
  } catch (error) {
    console.error('POST /api/cleanup error:', error);
    return NextResponse.json({ error: 'Failed to cleanup orphaned records' }, { status: 500 });
  }
}
