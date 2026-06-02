import type { Client } from '@libsql/client';

export async function computeSaturationSnapshot(
  _accountId: string,
  conferenceId: number,
  db: Client,
): Promise<void> {
  const confRow = await db.execute({
    sql: `SELECT series_id FROM conferences WHERE id = ?`,
    args: [conferenceId],
  });
  const seriesId = confRow.rows[0]?.series_id as string | null;
  if (!seriesId) return;

  const attendeesRes = await db.execute({
    sql: `SELECT
            ca.attendee_id,
            a.company_id,
            COALESCE(a.health_score, 0) as health_score,
            (SELECT COUNT(*) FROM meetings m
             WHERE m.attendee_id = ca.attendee_id
               AND m.conference_id = ?
               AND m.outcome = 'Held') as meetings_held_count
          FROM conference_attendees ca
          JOIN attendees a ON a.id = ca.attendee_id
          WHERE ca.conference_id = ?`,
    args: [conferenceId, conferenceId],
  });

  const contactsTotal = attendeesRes.rows.length;

  if (contactsTotal === 0) {
    await db.execute({
      sql: `INSERT OR REPLACE INTO conference_saturation_snapshots
              (conference_id, series_id, saturation_score, contacts_total, contacts_net_new,
               contacts_returning, meetings_held, substitutable_count,
               health_green, health_amber, health_red,
               companies_total, companies_returning, computed_at)
            VALUES (?, ?, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, datetime('now'))`,
      args: [conferenceId, seriesId],
    });
    return;
  }

  const previouslySeenRes = await db.execute({
    sql: `SELECT DISTINCT attendee_id FROM contact_conference_history
          WHERE series_id = ? AND conference_id != ?`,
    args: [seriesId, conferenceId],
  });
  const previouslySeen = new Set(previouslySeenRes.rows.map(r => Number(r.attendee_id)));

  const previousCompaniesRes = await db.execute({
    sql: `SELECT DISTINCT a.company_id
          FROM contact_conference_history h
          JOIN attendees a ON a.id = h.attendee_id
          WHERE h.series_id = ? AND h.conference_id != ? AND a.company_id IS NOT NULL`,
    args: [seriesId, conferenceId],
  });
  const previousCompanies = new Set(previousCompaniesRes.rows.map(r => Number(r.company_id)));

  let contactsReturning = 0;
  let contactsNetNew = 0;
  let meetingsHeld = 0;
  let substitutableCount = 0;
  let healthGreen = 0;
  let healthAmber = 0;
  let healthRed = 0;
  const companiesAtConf = new Set<number>();

  for (const row of attendeesRes.rows) {
    const attendeeId = Number(row.attendee_id);
    const companyId = row.company_id != null ? Number(row.company_id) : null;
    const healthScore = Number(row.health_score ?? 0);
    const hasMeeting = Number(row.meetings_held_count ?? 0) > 0;

    if (hasMeeting) meetingsHeld++;

    if (healthScore >= 70) healthGreen++;
    else if (healthScore >= 40) healthAmber++;
    else healthRed++;

    if (previouslySeen.has(attendeeId)) {
      contactsReturning++;
      if (!hasMeeting) substitutableCount++;
    } else {
      contactsNetNew++;
    }

    if (companyId !== null) companiesAtConf.add(companyId);
  }

  const companiesTotal = companiesAtConf.size;
  let companiesReturning = 0;
  companiesAtConf.forEach(cid => {
    if (previousCompanies.has(cid)) companiesReturning++;
  });

  const newContactRateInverted = contactsTotal > 0 ? contactsReturning / contactsTotal : 0;
  const companySaturationRate = companiesTotal > 0 ? companiesReturning / companiesTotal : 0;
  const substitutableRate = contactsTotal > 0 ? substitutableCount / contactsTotal : 0;
  const rawScore = (newContactRateInverted * 0.40 + companySaturationRate * 0.35 + substitutableRate * 0.25) * 100;
  const saturationScore = Math.round(Math.min(100, Math.max(0, rawScore)));

  await db.execute({
    sql: `INSERT OR REPLACE INTO conference_saturation_snapshots
            (conference_id, series_id, saturation_score, contacts_total, contacts_net_new,
             contacts_returning, meetings_held, substitutable_count,
             health_green, health_amber, health_red,
             companies_total, companies_returning, computed_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
    args: [
      conferenceId, seriesId, saturationScore, contactsTotal, contactsNetNew,
      contactsReturning, meetingsHeld, substitutableCount,
      healthGreen, healthAmber, healthRed,
      companiesTotal, companiesReturning,
    ],
  });

  for (const row of attendeesRes.rows) {
    await db.execute({
      sql: `INSERT OR IGNORE INTO contact_conference_history (attendee_id, conference_id, series_id)
            VALUES (?, ?, ?)`,
      args: [Number(row.attendee_id), conferenceId, seriesId],
    });
  }
}
