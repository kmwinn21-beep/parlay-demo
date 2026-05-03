import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { db, dbReady } from '@/lib/db';
import { getConfigIdByEmail, parseNotifIds, resolveUserIds, createNotifications } from '@/lib/notifications';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  try {
    await dbReady;
    const confResult = await db.execute({
      sql: `SELECT c.*, co.value AS conference_strategy_type_display_name, co.action_key AS conference_strategy_type_key
            FROM conferences c
            LEFT JOIN config_options co ON co.id = c.conference_strategy_type_id
            WHERE c.id = ?`,
      args: [params.id],
    });

    if (confResult.rows.length === 0) {
      return NextResponse.json({ error: 'Conference not found' }, { status: 404 });
    }

    const conference = confResult.rows[0];

    const attendeesResult = await db.execute({
      sql: `SELECT a.*, c.name as company_name, c.company_type, c.wse as company_wse,
                   COALESCE(conf_agg.conference_count, 0) as conference_count,
                   conf_agg.conference_names,
                   COALESCE(notes_agg.notes_count, 0) as entity_notes_count
            FROM attendees a
            JOIN conference_attendees ca ON a.id = ca.attendee_id
            LEFT JOIN companies c ON a.company_id = c.id
            LEFT JOIN (
              SELECT ca2.attendee_id,
                     COUNT(DISTINCT ca2.conference_id) as conference_count,
                     GROUP_CONCAT(DISTINCT c2.name) as conference_names
              FROM conference_attendees ca2
              JOIN conferences c2 ON ca2.conference_id = c2.id
              GROUP BY ca2.attendee_id
            ) conf_agg ON a.id = conf_agg.attendee_id
            LEFT JOIN (
              SELECT entity_id, COUNT(*) as notes_count
              FROM entity_notes
              WHERE entity_type = 'attendee'
              GROUP BY entity_id
            ) notes_agg ON a.id = notes_agg.entity_id
            WHERE ca.conference_id = ?
            ORDER BY a.last_name, a.first_name`,
      args: [params.id],
    });

    const attendees = attendeesResult.rows.map((r) => ({ ...r }));

    return NextResponse.json({ ...conference, attendees }, {
      headers: { 'Cache-Control': 'private, max-age=30, stale-while-revalidate=60' },
    });
  } catch (error) {
    console.error('GET /api/conferences/[id] error:', error);
    return NextResponse.json({ error: 'Failed to fetch conference' }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const user = authResult;
  try {
    await dbReady;
    const body = await request.json();
    const { name, start_date, end_date, location, notes, internal_attendees, conference_strategy_type_id } = body;

    const existingResult = await db.execute({
      sql: 'SELECT id, name, internal_attendees FROM conferences WHERE id = ?',
      args: [params.id],
    });
    if (existingResult.rows.length === 0) {
      return NextResponse.json({ error: 'Conference not found' }, { status: 404 });
    }
    const prevInternalAttendees = existingResult.rows[0].internal_attendees as string | null;

    const updatedResult = await db.execute({
      sql: 'UPDATE conferences SET name = ?, start_date = ?, end_date = ?, location = ?, notes = ?, internal_attendees = ?, conference_strategy_type_id = ?, updated_at = datetime(\'now\') WHERE id = ? RETURNING *',
      args: [name, start_date, end_date, location, notes || null, internal_attendees || null, conference_strategy_type_id ? Number(conference_strategy_type_id) : null, params.id],
    });

    // Notify newly added internal attendees (best-effort)
    if (internal_attendees) {
      const prevIds = new Set(parseNotifIds(prevInternalAttendees));
      const newIds = parseNotifIds(internal_attendees);
      const addedIds = newIds.filter(id => !prevIds.has(id));
      if (addedIds.length > 0) {
        const changedByConfigId = await getConfigIdByEmail(user.email);
        const userIds = await resolveUserIds(addedIds.join(','), changedByConfigId);
        createNotifications({
          userIds,
          type: 'conference',
          recordId: Number(params.id),
          recordName: name,
          message: `You've been added as an internal attendee to ${name}`,
          changedByEmail: user.email,
          changedByConfigId,
          entityType: 'conference',
          entityId: Number(params.id),
        });
      }
    }

    return NextResponse.json(updatedResult.rows[0]);
  } catch (error) {
    console.error('PUT /api/conferences/[id] error:', error);
    return NextResponse.json({ error: 'Failed to update conference' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  try {
    await dbReady;
    const existingResult = await db.execute({
      sql: 'SELECT id FROM conferences WHERE id = ?',
      args: [params.id],
    });
    if (existingResult.rows.length === 0) {
      return NextResponse.json({ error: 'Conference not found' }, { status: 404 });
    }

    // Find attendees that are ONLY linked to this conference (will become orphans)
    const orphanedAttendeesResult = await db.execute({
      sql: `SELECT a.id FROM attendees a
            JOIN conference_attendees ca ON a.id = ca.attendee_id
            WHERE ca.conference_id = ?
            AND (SELECT COUNT(*) FROM conference_attendees ca2 WHERE ca2.attendee_id = a.id) = 1`,
      args: [params.id],
    });
    const orphanedAttendeeIds = orphanedAttendeesResult.rows.map((r) => r.id as number);

    // Find all attendees linked to this conference (to check companies after)
    const allConferenceAttendeesResult = await db.execute({
      sql: `SELECT DISTINCT a.company_id FROM attendees a
            JOIN conference_attendees ca ON a.id = ca.attendee_id
            WHERE ca.conference_id = ? AND a.company_id IS NOT NULL`,
      args: [params.id],
    });
    const affectedCompanyIds = allConferenceAttendeesResult.rows.map((r) => r.company_id as number);

    // Delete the conference and its links
    await db.batch(
      [
        { sql: 'DELETE FROM conference_attendees WHERE conference_id = ?', args: [params.id] },
        { sql: 'DELETE FROM conference_attendee_details WHERE conference_id = ?', args: [params.id] },
        { sql: 'DELETE FROM meetings WHERE conference_id = ?', args: [params.id] },
        { sql: 'DELETE FROM entity_notes WHERE entity_type = ? AND entity_id = ?', args: ['conference', params.id] },
        { sql: 'DELETE FROM conferences WHERE id = ?', args: [params.id] },
      ],
      'write'
    );

    // Delete orphaned attendees and their entity_notes
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

    // Delete orphaned companies: companies that no longer have any attendees linked to a conference
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
      const orphanedCompanyIds = orphanedCompaniesResult.rows.map((r) => r.id as number);

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
    console.error('DELETE /api/conferences/[id] error:', error);
    return NextResponse.json({ error: 'Failed to delete conference' }, { status: 500 });
  }
}
