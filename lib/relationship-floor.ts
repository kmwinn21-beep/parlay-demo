import type { Client } from '@libsql/client';

const QUALIFYING_KEYS = ['strong', 'trusted', 'personal', 'family'];

export async function computeRelationshipFloor(
  attendeeId: number,
  _accountId: string,
  db: Client,
): Promise<number> {
  // Get qualifying config option values by action_key
  const qualifyingRes = await db.execute({
    sql: `SELECT id, value FROM config_options
          WHERE category = 'rep_relationship_type'
            AND action_key IN ('strong', 'trusted', 'personal', 'family')`,
    args: [],
  });

  if (qualifyingRes.rows.length === 0) {
    await db.execute({
      sql: `UPDATE attendees SET relationship_floor = 0 WHERE id = ?`,
      args: [attendeeId],
    });
    return 0;
  }

  const qualifyingValues = qualifyingRes.rows.map(r => String(r.value));
  const qualifyingIds = qualifyingRes.rows.map(r => String(r.id));

  // Find all internal_relationships rows where:
  // 1. contact_ids contains this attendee
  // 2. relationship_status matches a qualifying value or ID
  const allRelsRes = await db.execute({
    sql: `SELECT rep_ids, contact_ids, relationship_status FROM internal_relationships`,
    args: [],
  });

  const uniqueReps = new Set<string>();

  for (const row of allRelsRes.rows) {
    const contactIds = row.contact_ids
      ? String(row.contact_ids).split(',').map(s => s.trim()).filter(Boolean)
      : [];
    if (!contactIds.includes(String(attendeeId))) continue;

    const status = String(row.relationship_status ?? '').trim();
    const isQualifying =
      qualifyingValues.some(v => v.toLowerCase() === status.toLowerCase()) ||
      qualifyingIds.includes(status);

    if (!isQualifying) continue;

    const repIds = row.rep_ids
      ? String(row.rep_ids).split(',').map(s => s.trim()).filter(Boolean)
      : [];
    for (const rid of repIds) uniqueReps.add(rid);
  }

  const uniqueRepCount = uniqueReps.size;
  const floor = uniqueRepCount > 0 ? 20 + (uniqueRepCount - 1) * 7 : 0;

  await db.execute({
    sql: `UPDATE attendees SET relationship_floor = ? WHERE id = ?`,
    args: [floor, attendeeId],
  });

  return floor;
}

export async function computeRelationshipFloorBatch(
  attendeeIds: number[],
  _accountId: string,
  db: Client,
): Promise<Map<number, number>> {
  const result = new Map<number, number>();
  if (attendeeIds.length === 0) return result;

  const qualifyingRes = await db.execute({
    sql: `SELECT id, value FROM config_options
          WHERE category = 'rep_relationship_type'
            AND action_key IN (${QUALIFYING_KEYS.map(() => '?').join(',')})`,
    args: QUALIFYING_KEYS,
  });

  if (qualifyingRes.rows.length === 0) {
    for (const id of attendeeIds) result.set(id, 0);
    await db.execute({
      sql: `UPDATE attendees SET relationship_floor = 0 WHERE id IN (${attendeeIds.map(() => '?').join(',')})`,
      args: attendeeIds,
    });
    return result;
  }

  const qualifyingValues = qualifyingRes.rows.map(r => String(r.value));
  const qualifyingIds = qualifyingRes.rows.map(r => String(r.id));
  const attendeeIdSet = new Set(attendeeIds.map(String));

  const allRelsRes = await db.execute({
    sql: `SELECT rep_ids, contact_ids, relationship_status FROM internal_relationships`,
    args: [],
  });

  // attendeeId -> set of unique rep IDs with qualifying relationships
  const repsByAttendee = new Map<number, Set<string>>();
  for (const id of attendeeIds) repsByAttendee.set(id, new Set());

  for (const row of allRelsRes.rows) {
    const status = String(row.relationship_status ?? '').trim();
    const isQualifying =
      qualifyingValues.some(v => v.toLowerCase() === status.toLowerCase()) ||
      qualifyingIds.includes(status);
    if (!isQualifying) continue;

    const contactIds = row.contact_ids
      ? String(row.contact_ids).split(',').map(s => s.trim()).filter(Boolean)
      : [];
    const repIds = row.rep_ids
      ? String(row.rep_ids).split(',').map(s => s.trim()).filter(Boolean)
      : [];

    for (const cid of contactIds) {
      if (!attendeeIdSet.has(cid)) continue;
      const aid = Number(cid);
      const repSet = repsByAttendee.get(aid);
      if (!repSet) continue;
      for (const rid of repIds) repSet.add(rid);
    }
  }

  repsByAttendee.forEach((reps, aid) => {
    const floor = reps.size > 0 ? 20 + (reps.size - 1) * 7 : 0;
    result.set(aid, floor);
  });

  // Batch-write floors
  const writes: Promise<unknown>[] = [];
  result.forEach((floor, aid) => {
    writes.push(
      db.execute({ sql: `UPDATE attendees SET relationship_floor = ? WHERE id = ?`, args: [floor, aid] }),
    );
  });
  await Promise.all(writes);

  return result;
}
