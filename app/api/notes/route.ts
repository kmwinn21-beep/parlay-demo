import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { db, dbReady } from '@/lib/db';
import {
  getConfigIdByEmail,
  notifyCompanyAssignees,
  notifyForAttendee,
  notifyConferenceInternalAttendees,
  notifyMentionedUsers,
} from '@/lib/notifications';

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
      const joinCompany = entityType === 'company';
      result = await db.execute({
        sql: joinCompany
          ? `SELECT en.id, en.entity_type, en.entity_id, en.content, en.created_at, en.conference_name, en.rep, en.attendee_name, en.company_name, en.tagged_users, co.name AS joined_company_name
                FROM entity_notes en
                LEFT JOIN companies co ON en.entity_id = co.id
                WHERE en.entity_type = ? AND en.entity_id IN (${ids.map(() => '?').join(',')})
                ORDER BY en.created_at DESC`
          : `SELECT id, entity_type, entity_id, content, created_at, conference_name, rep, attendee_name, company_name, tagged_users
                FROM entity_notes
                WHERE entity_type = ? AND entity_id IN (${ids.map(() => '?').join(',')})
                ORDER BY created_at DESC`,
        args: [entityType, ...ids],
      });
    } else {
      result = await db.execute({
        sql: `SELECT id, entity_type, entity_id, content, created_at, conference_name, rep, attendee_name, company_name, tagged_users
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
        tagged_users: r.tagged_users != null ? String(r.tagged_users) : null,
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
    const {
      entity_type, entity_id, content, conference_name, rep,
      attendee_name, company_name, skip_notification, tagged_users,
    } = await request.json();

    if (!entity_type || !entity_id || !content?.trim()) {
      return NextResponse.json({ error: 'entity_type, entity_id, and content are required' }, { status: 400 });
    }

    // Resolve rep server-side if not provided by client (e.g. user has no displayName set)
    let resolvedRep = rep || null;
    if (!resolvedRep) {
      try {
        const configId = await getConfigIdByEmail(user.email);
        if (configId) {
          const nameRow = await db.execute({
            sql: 'SELECT value FROM config_options WHERE id = ?',
            args: [configId],
          });
          if (nameRow.rows.length > 0 && nameRow.rows[0].value) {
            resolvedRep = String(nameRow.rows[0].value);
          }
        }
      } catch { /* non-fatal */ }
    }

    const result = await db.execute({
      sql: `INSERT INTO entity_notes (entity_type, entity_id, content, conference_name, rep, attendee_name, company_name, tagged_users)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            RETURNING id, entity_type, entity_id, content, created_at, conference_name, rep, attendee_name, company_name, tagged_users`,
      args: [
        entity_type, entity_id, content.trim(),
        conference_name || null, resolvedRep,
        attendee_name || null, company_name || null,
        tagged_users || null,
      ],
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
      tagged_users: row.tagged_users != null ? String(row.tagged_users) : null,
    };

    // Fire standard notifications (best-effort) — skipped on cross-posts to avoid duplicates
    if (!skip_notification) {
      const changedByConfigId = await getConfigIdByEmail(user.email);
      const snippet = content.trim().slice(0, 80);
      if (entity_type === 'attendee') {
        const attRow = await db.execute({
          sql: 'SELECT first_name, last_name FROM attendees WHERE id = ?',
          args: [entity_id],
        });
        const nameStr = attRow.rows.length > 0
          ? `${attRow.rows[0].first_name} ${attRow.rows[0].last_name}`.trim()
          : `Attendee #${entity_id}`;
        notifyForAttendee({
          attendeeId: Number(entity_id),
          attendeeName: nameStr,
          message: `New note added: "${snippet}"`,
          changedByEmail: user.email,
          changedByConfigId,
        });
      } else if (entity_type === 'company') {
        const coRow = await db.execute({
          sql: 'SELECT name FROM companies WHERE id = ?',
          args: [entity_id],
        });
        const nameStr = coRow.rows.length > 0 ? String(coRow.rows[0].name) : `Company #${entity_id}`;
        notifyCompanyAssignees({
          companyId: Number(entity_id),
          companyName: nameStr,
          message: `New note added: "${snippet}"`,
          changedByEmail: user.email,
          changedByConfigId,
        });
      } else if (entity_type === 'conference') {
        const confRow = await db.execute({
          sql: 'SELECT name FROM conferences WHERE id = ?',
          args: [entity_id],
        });
        const nameStr = confRow.rows.length > 0 ? String(confRow.rows[0].name) : `Conference #${entity_id}`;
        notifyConferenceInternalAttendees({
          conferenceId: Number(entity_id),
          conferenceName: nameStr,
          message: `New note added: "${snippet}"`,
          changedByEmail: user.email,
          changedByConfigId,
        });
      }
    }

    // Fire @mention notifications — always, regardless of skip_notification
    if (tagged_users) {
      const taggedConfigIds = String(tagged_users)
        .split(',')
        .map(s => parseInt(s.trim(), 10))
        .filter(n => !isNaN(n) && n > 0);

      if (taggedConfigIds.length > 0) {
        const changedByConfigId = await getConfigIdByEmail(user.email);
        // Resolve entity name for the notification message
        let entityName = '';
        try {
          if (entity_type === 'company') {
            const r = await db.execute({ sql: 'SELECT name FROM companies WHERE id = ?', args: [entity_id] });
            entityName = r.rows.length > 0 ? String(r.rows[0].name) : company_name || `Company #${entity_id}`;
          } else if (entity_type === 'attendee') {
            const r = await db.execute({ sql: 'SELECT first_name, last_name FROM attendees WHERE id = ?', args: [entity_id] });
            entityName = r.rows.length > 0
              ? `${r.rows[0].first_name} ${r.rows[0].last_name}`.trim()
              : attendee_name || `Attendee #${entity_id}`;
          } else if (entity_type === 'conference') {
            const r = await db.execute({ sql: 'SELECT name FROM conferences WHERE id = ?', args: [entity_id] });
            entityName = r.rows.length > 0 ? String(r.rows[0].name) : conference_name || `Conference #${entity_id}`;
          }
        } catch { /* non-fatal */ }

        // Resolve mentioner display name from config_options using the already-looked-up configId
        let mentionerName = user.email;
        if (changedByConfigId) {
          try {
            const nameRow = await db.execute({
              sql: 'SELECT value FROM config_options WHERE id = ?',
              args: [changedByConfigId],
            });
            if (nameRow.rows.length > 0 && nameRow.rows[0].value) {
              mentionerName = String(nameRow.rows[0].value);
            }
          } catch { /* non-fatal */ }
        }

        notifyMentionedUsers({
          taggedConfigIds,
          mentionerName,
          mentionerEmail: user.email,
          mentionerConfigId: changedByConfigId,
          entityName,
          entityType: entity_type,
          entityId: Number(entity_id),
        });
      }
    }

    return NextResponse.json(response, { status: 201 });
  } catch (error) {
    console.error('POST /api/notes error:', error);
    return NextResponse.json({ error: 'Failed to create note' }, { status: 500 });
  }
}
