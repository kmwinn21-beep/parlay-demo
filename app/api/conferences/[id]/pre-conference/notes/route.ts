import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getDb } from '@/lib/getDb';
import { getConfigIdByEmail, notifyMentionedUsers, parseNotifIds } from '@/lib/notifications';
import { resolveUserDisplayName } from '@/lib/initials';
import type { Client } from '@libsql/client';

/**
 * The record a note is filed against, by name, for the mention message.
 * The names sent up with the note are the fallback — the record itself wins.
 */
async function resolveEntityName(
  db: Client,
  entityType: string,
  entityId: number,
  fallbacks: { attendee_name?: string; company_name?: string; conference_name?: string },
): Promise<string> {
  try {
    if (entityType === 'company') {
      const r = await db.execute({ sql: 'SELECT name FROM companies WHERE id = ?', args: [entityId] });
      if (r.rows.length) return String(r.rows[0].name);
      return fallbacks.company_name || `Company #${entityId}`;
    }
    if (entityType === 'attendee') {
      const r = await db.execute({ sql: 'SELECT first_name, last_name FROM attendees WHERE id = ?', args: [entityId] });
      if (r.rows.length) return `${r.rows[0].first_name} ${r.rows[0].last_name}`.trim();
      return fallbacks.attendee_name || `Attendee #${entityId}`;
    }
    if (entityType === 'conference') {
      const r = await db.execute({ sql: 'SELECT name FROM conferences WHERE id = ?', args: [entityId] });
      if (r.rows.length) return String(r.rows[0].name);
      return fallbacks.conference_name || `Conference #${entityId}`;
    }
  } catch { /* non-fatal — the message just gets a plainer name */ }
  return `${entityType} #${entityId}`;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const user = authResult;
  const db = await getDb(user?.accountId);

  const { id } = await params;
  const confId = parseInt(id, 10);
  if (isNaN(confId)) return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });


  const body = await request.json();
  const { entity_type, entity_id, content, conference_name, tagged_users, attendee_name, company_name } = body;

  if (!entity_type || !entity_id || !content?.trim()) {
    return NextResponse.json({ error: 'entity_type, entity_id, and content are required' }, { status: 400 });
  }

  const rep = typeof user === 'object' && user !== null && 'email' in user
    ? (user as { email: string }).email
    : String(user);

  const result = await db.execute({
    sql: `INSERT INTO entity_notes (entity_type, entity_id, content, rep, conference_name, tagged_users, attendee_name, company_name)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING *`,
    args: [
      entity_type,
      entity_id,
      content.trim(),
      rep,
      conference_name ?? null,
      tagged_users ?? null,
      attendee_name ?? null,
      company_name ?? null,
    ],
  });

  // This route has always stored tagged_users and never acted on it, so an
  // @mention here reached nobody. Same gate and message as every other note.
  const taggedConfigIds = parseNotifIds(tagged_users);
  if (taggedConfigIds.length > 0) {
    const [userRow, changedByConfigId, entityName] = await Promise.all([
      db.execute({ sql: 'SELECT display_name, first_name, last_name, email FROM users WHERE id = ?', args: [user.id] })
        .catch(() => ({ rows: [] as Record<string, unknown>[] })),
      getConfigIdByEmail(user.email, db),
      resolveEntityName(db, String(entity_type), Number(entity_id), { attendee_name, company_name, conference_name }),
    ]);
    notifyMentionedUsers({
      taggedConfigIds,
      mentionerName: userRow.rows.length > 0 ? resolveUserDisplayName(userRow.rows[0]) : user.email,
      mentionerEmail: user.email,
      mentionerConfigId: changedByConfigId,
      entityName,
      entityType: String(entity_type),
      entityId: Number(entity_id),
    });
  }

  return NextResponse.json(result.rows[0], { status: 201 });
}
