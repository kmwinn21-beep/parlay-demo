import type { Client } from '@libsql/client';

export async function computeSaturationSnapshot(
  accountId: string,
  conferenceId: number,
  db: Client,
): Promise<void> {
  const confRow = await db.execute({
    sql: `SELECT series_id, season_id, start_date, total_registered, total_addressable FROM conferences WHERE id = ?`,
    args: [conferenceId],
  });
  const conf = confRow.rows[0];
  const seriesId = conf?.series_id as string | null;
  if (!seriesId) return;

  const seasonId = conf?.season_id as string | null;
  const snapshotDate = new Date().toISOString().slice(0, 10);

  const attendeesRes = await db.execute({
    sql: `SELECT
            ca.attendee_id,
            a.company_id,
            COALESCE(a.health_score, 0) as health_score,
            (SELECT COUNT(*) FROM meetings m
             WHERE m.attendee_id = ca.attendee_id AND m.conference_id = ?
               AND m.outcome = 'Held') as meetings_held_count,
            (SELECT outcome FROM meetings m2
             WHERE m2.attendee_id = ca.attendee_id AND m2.conference_id = ?
               AND m2.outcome IS NOT NULL
             ORDER BY m2.meeting_date DESC LIMIT 1) as last_outcome
          FROM conference_attendees ca
          JOIN attendees a ON a.id = ca.attendee_id
          WHERE ca.conference_id = ?`,
    args: [conferenceId, conferenceId, conferenceId],
  });

  const contactsTouchedThisConf = attendeesRes.rows.length;

  // Read existing history BEFORE updating (to determine net-new vs returning)
  const prevSeenRes = await db.execute({
    sql: `SELECT attendee_id FROM contact_conference_history WHERE series_id = ? AND account_id = ?`,
    args: [seriesId, accountId],
  });
  const prevSeen = new Set(prevSeenRes.rows.map(r => String(r.attendee_id)));

  const prevCompaniesRes = await db.execute({
    sql: `SELECT DISTINCT a.company_id
          FROM contact_conference_history h
          JOIN attendees a ON a.id = h.attendee_id
          WHERE h.series_id = ? AND h.account_id = ? AND a.company_id IS NOT NULL`,
    args: [seriesId, accountId],
  });
  const prevCompanies = new Set(prevCompaniesRes.rows.map(r => String(r.company_id)));

  let contactsNetNew = 0;
  let contactsReturning = 0;
  let meetingsHeld = 0;
  let meetingsWithOutcome = 0;
  let contactsHighHealth = 0;
  let contactsMidHealth = 0;
  let contactsLowHealth = 0;
  let contactsDroppable = 0;
  const companiesAtConf = new Set<string>();

  for (const row of attendeesRes.rows) {
    const attendeeId = String(row.attendee_id);
    const companyId = row.company_id != null ? String(row.company_id) : null;
    const healthScore = Number(row.health_score ?? 0);
    const hasMeeting = Number(row.meetings_held_count ?? 0) > 0;

    if (hasMeeting) {
      meetingsHeld++;
      if (row.last_outcome) meetingsWithOutcome++;
    }

    if (healthScore >= 70) contactsHighHealth++;
    else if (healthScore >= 40) contactsMidHealth++;
    else contactsLowHealth++;

    if (healthScore >= 50) contactsDroppable++;

    if (prevSeen.has(attendeeId)) contactsReturning++;
    else contactsNetNew++;

    if (companyId !== null) companiesAtConf.add(companyId);
  }

  let companiesNetNew = 0;
  let companiesReturning = 0;
  companiesAtConf.forEach(cid => {
    if (prevCompanies.has(cid)) companiesReturning++;
    else companiesNetNew++;
  });

  const newContactRateInverted = contactsTouchedThisConf > 0
    ? 1 - (contactsNetNew / contactsTouchedThisConf)
    : 0;
  const droppableRate = contactsTouchedThisConf > 0
    ? contactsDroppable / contactsTouchedThisConf
    : 0;
  const saturationScore = Math.round(
    Math.min(100, Math.max(0, (newContactRateInverted * 0.55 + droppableRate * 0.45) * 100)),
  );

  // Update history (upsert per attendee — idempotent on same conferenceId)
  for (const row of attendeesRes.rows) {
    const attendeeId = Number(row.attendee_id);
    const lastOutcome = row.last_outcome ? String(row.last_outcome) : null;
    const meetingCount = Number(row.meetings_held_count ?? 0);
    const id = `${accountId}:${attendeeId}:${seriesId}`;

    await db.execute({
      sql: `INSERT INTO contact_conference_history
              (id, account_id, attendee_id, series_id, first_interaction_conference_id,
               interaction_count, last_interaction_conference_id, last_meeting_outcome,
               cumulative_meetings, updated_at)
            VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, datetime('now'))
            ON CONFLICT(account_id, attendee_id, series_id) DO UPDATE SET
              interaction_count = interaction_count + (CASE WHEN last_interaction_conference_id = ? THEN 0 ELSE 1 END),
              last_interaction_conference_id = ?,
              last_meeting_outcome = COALESCE(?, last_meeting_outcome),
              cumulative_meetings = cumulative_meetings + (CASE WHEN last_interaction_conference_id = ? THEN 0 ELSE ? END),
              updated_at = datetime('now')`,
      args: [
        id, accountId, attendeeId, seriesId, conferenceId,
        conferenceId, lastOutcome, meetingCount,
        conferenceId, conferenceId, lastOutcome, conferenceId, meetingCount,
      ],
    });
  }

  const everTouchedRes = await db.execute({
    sql: `SELECT COUNT(*) as cnt FROM contact_conference_history WHERE series_id = ? AND account_id = ?`,
    args: [seriesId, accountId],
  });
  const contactsEverTouched = Number(everTouchedRes.rows[0]?.cnt ?? 0);

  const snapshotId = `${accountId}:${conferenceId}`;

  await db.execute({
    sql: `INSERT OR REPLACE INTO conference_saturation_snapshots
            (id, account_id, conference_id, series_id, season_id, snapshot_date,
             total_registered, total_addressable,
             contacts_ever_touched, contacts_touched_this_conf, contacts_net_new, contacts_returning,
             companies_ever_touched, companies_net_new, companies_returning,
             meetings_held, meetings_with_outcome,
             contacts_high_health, contacts_mid_health, contacts_low_health, contacts_droppable,
             saturation_score, new_contact_rate, droppable_rate,
             created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
    args: [
      snapshotId, accountId, conferenceId, seriesId, seasonId, snapshotDate,
      conf?.total_registered ?? null, conf?.total_addressable ?? null,
      contactsEverTouched, contactsTouchedThisConf, contactsNetNew, contactsReturning,
      prevCompanies.size + companiesNetNew, companiesNetNew, companiesReturning,
      meetingsHeld, meetingsWithOutcome,
      contactsHighHealth, contactsMidHealth, contactsLowHealth, contactsDroppable,
      saturationScore, newContactRateInverted, droppableRate,
    ],
  });
}
