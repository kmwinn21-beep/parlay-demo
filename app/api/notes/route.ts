import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { db, dbReady } from '@/lib/db';
import { getConfigIdByEmail, notifyCompanyAssignees, notifyForAttendee } from '@/lib/notifications';

export async function GET(request: NextRequest) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  try {
    await dbReady;
    const { searchParams } = new URL(request.url);
    const entityType = searchParams.get('entity_type');
    const entityId = searchParams.get('entity_id');
    const entityIds = searchParams.get('entity_ids'); // comma-separated list

    if (!entityType || (!entityId && !entityIds)) {
      return NextResponse.json({ error: 'entity_type and entity_id (or entity_ids) are required' }, { status: 400 });
    }

    let result;
    if (entityIds) {
      const ids = entityIds.split(',').map(id => id.trim()).filter(Boolean);
      // When fetching for multiple entities, join to get the company name for context
      const joinCompany = entityType === 'company';
      result = await db.execute({
        sql: joinCompany
          ? `SELECT en.id, en.entity_type, en.entity_id, en.content, en.created_at, en.conference_name, en.rep, en.attendee_name, en.company_name, co.name AS joined_company_name
                FROM entity_notes en
                LEFT JOIN companies co ON en.entity_id = co.id
                WHERE en.entity_type = ? AND en.entity_id IN (${ids.map(() => '?').join(',')})
                ORDER BY en.created_at DESC`
          : `SELECT id, entity_type, entity_id, content, created_at, conference_name, rep, attendee_name, company_name
                FROM entity_notes
                WHERE entity_type = ? AND entity_id IN (${ids.map(() => '?').join(',')})
                ORDER BY created_at DESC`,
        args: [entityType, ...ids],
      });
    } else {
      result = await db.execute({
        sql: `SELECT id, entity_type, entity_id, content, created_at, conference_name, rep, attendee_name, company_name
              FROM entity_notes
              WHERE entity_type = ? AND entity_id = ?
              ORDER BY created_at DESC`,
        args: [entityType, entityId!],
      });
    }

    return NextResponse.json(
      result.rows.map((r) => ({
        id: Number(r.id),
        entity_type: String(r.entity_type),
        entity_id: Number(r.entity_id),
        content: String(r.content),
        created_at: String(r.created_at),
        conference_name: r.conference_name != null ? String(r.conference_name) : null,
        rep: r.rep != null ? String(r.rep) : null,
        attendee_name: r.attendee_name != null ? String(r.attendee_name) : null,
        company_name: r.joined_company_name != null
          ? String(r.joined_company_name)
          : (r.company_name != null ? String(r.company_name) : null),
      }))
    );
  } catch (error) {
    console.error('GET /api/notes error:', error);
    return NextResponse.json({ error: 'Failed to fetch notes' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const user = authResult;
  try {
    await dbReady;
    const { entity_type, entity_id, content, conference_name, rep, attendee_name, company_name } = await request.json();

    if (!entity_type || !entity_id || !content?.trim()) {
      return NextResponse.json({ error: 'entity_type, entity_id, and content are required' }, { status: 400 });
    }

    const result = await db.execute({
      sql: `INSERT INTO entity_notes (entity_type, entity_id, content, conference_name, rep, attendee_name, company_name)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            RETURNING id, entity_type, entity_id, content, created_at, conference_name, rep, attendee_name, company_name`,
      args: [entity_type, entity_id, content.trim(), conference_name || null, rep || null, attendee_name || null, company_name || null],
    });

    const row = result.rows[0];
    const response = {
      id: Number(row.id),
      entity_type: String(row.entity_type),
      entity_id: Number(row.entity_id),
      content: String(row.content),
      created_at: String(row.created_at),
      conference_name: row.conference_name != null ? String(row.conference_name) : null,
      rep: row.rep != null ? String(row.rep) : null,
      attendee_name: row.attendee_name != null ? String(row.attendee_name) : null,
      company_name: row.company_name != null ? String(row.company_name) : null,
    };

    // Fire notifications (best-effort)
    const changedByConfigId = await getConfigIdByEmail(user.email);
    const snippet = content.trim().slice(0, 80);
    if (entity_type === 'company') {
      const nameStr = company_name || `Company #${entity_id}`;
      notifyCompanyAssignees({
        companyId: Number(entity_id),
        companyName: nameStr,
        message: `New note added: "${snippet}"`,
        changedByEmail: user.email,
        changedByConfigId,
      });
    } else if (entity_type === 'attendee') {
      const nameStr = attendee_name || `Attendee #${entity_id}`;
      notifyForAttendee({
        attendeeId: Number(entity_id),
        attendeeName: nameStr,
        message: `New note added: "${snippet}"`,
        changedByEmail: user.email,
        changedByConfigId,
      });
    }

    return NextResponse.json(response, { status: 201 });
  } catch (error) {
    console.error('POST /api/notes error:', error);
    return NextResponse.json({ error: 'Failed to create note' }, { status: 500 });
  }
}
