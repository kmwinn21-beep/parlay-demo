import { NextRequest, NextResponse } from 'next/server';
import JSZip from 'jszip';
import { requireCapability } from '@/lib/requireCapability';
import { getDb } from '@/lib/getDb';
import {
  csvFile, meetingStartISO, notesString, outcomeLabel, touchpointsString,
  MEETINGS_HEADERS, PEOPLE_HEADERS,
} from '@/lib/hubspotExport';

/**
 * The conference's handoff to HubSpot — bridge spec v0.1 §4.
 *
 * Two files, once, when reps have finished assigning. Not the older
 * `crm-export` route beside it: that one produces five stock HubSpot import
 * files matched on EMAIL, for an account with no bridge. This one pairs on
 * HubSpot's record ids and is the half of an agreed contract, so its columns
 * are fixed by that spec rather than by what HubSpot's importer happens to
 * accept.
 *
 * Only people who did something: at least one touchpoint, meeting, note or
 * follow-up. A conference list is mostly people nobody spoke to, and sending
 * them would have HubSpot create a lead apiece.
 *
 * Nothing here guesses. A meeting with no outcome recorded, or one Parlay
 * cannot stamp with a real offset, is left out and COUNTED — the response
 * says what it dropped and why, because this export runs once and a silent
 * omission is discovered in HubSpot weeks later or not at all.
 */

interface Skipped { noOutcome: number; noStart: number }

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  /*
   * Gated on the capability, not just on a session.
   *
   * This hands out every contact, email, note and meeting for a conference in
   * one file. The older crm-export route beside it checks only for a session
   * and leans on the menu item being hidden — which governs the button, not
   * the URL. A new endpoint should not inherit that.
   */
  const authResult = await requireCapability(request, 'crm_export');
  if (authResult instanceof NextResponse) return authResult;
  const db = await getDb(authResult?.accountId);
  const conferenceId = Number(params.id);
  if (!Number.isFinite(conferenceId) || conferenceId <= 0) {
    return NextResponse.json({ error: 'Bad conference id' }, { status: 400 });
  }

  try {
    const confRes = await db.execute({
      sql: `SELECT id, name, start_date, end_date, event_code, location_timezone
            FROM conferences WHERE id = ?`,
      args: [conferenceId],
    });
    if (confRes.rows.length === 0) {
      return NextResponse.json({ error: 'Conference not found' }, { status: 404 });
    }
    const conf = confRes.rows[0];
    const conferenceName = String(conf.name ?? '');
    const eventCode = conf.event_code ? String(conf.event_code) : '';
    const timeZone = conf.location_timezone ? String(conf.location_timezone) : null;

    /* Rep ids to addresses.
       Assignments store config_options ids; a Teton email lives on the user
       row that option belongs to. Both hops here so a rep with no user
       account comes out blank rather than as a number HubSpot cannot own. */
    const repRes = await db.execute({
      sql: `SELECT co.id AS config_id, u.email
            FROM config_options co
            JOIN users u ON u.config_id = co.id
            WHERE co.category = 'user'`,
      args: [],
    }).catch(() => ({ rows: [] as Record<string, unknown>[] }));
    const emailByConfigId = new Map<string, string>();
    for (const r of repRes.rows) {
      if (r.config_id != null && r.email) emailByConfigId.set(String(r.config_id), String(r.email));
    }
    const repEmails = (stored: unknown): string[] => String(stored ?? '')
      .split(',').map(s => s.trim()).filter(Boolean)
      .map(id => emailByConfigId.get(id) ?? '')
      .filter(Boolean);

    // ── The people at this conference, with their company's pairing key ──
    const peopleRes = await db.execute({
      sql: `SELECT a.id, a.first_name, a.last_name, a.email, a.title, a.phone,
                   a.linkedin_url, a.hubspot_contact_id,
                   c.name AS company_name, c.hubspot_company_id
            FROM conference_attendees ca
            JOIN attendees a ON a.id = ca.attendee_id
            LEFT JOIN companies c ON c.id = a.company_id
            WHERE ca.conference_id = ?`,
      args: [conferenceId],
    });

    const [touchRes, noteRes, followRes, meetingRes] = await Promise.all([
      db.execute({
        sql: `SELECT t.attendee_id, t.created_at, co.value AS label
              FROM attendee_touchpoints t
              LEFT JOIN config_options co ON co.id = t.option_id
              WHERE t.conference_id = ?`,
        args: [conferenceId],
      }).catch(() => ({ rows: [] as Record<string, unknown>[] })),
      /* Notes on a person, for THIS conference.
         Matched on the id where there is one and on the name otherwise: a
         note written straight onto a conference carries conference_id, and
         one promoted from a floor note carries only the name. Dropping the
         name half would lose exactly the notes the floor produced. */
      db.execute({
        sql: `SELECT entity_id AS attendee_id, created_at, rep, content
              FROM entity_notes
              WHERE entity_type = 'attendee'
                AND (conference_id = ? OR (conference_id IS NULL AND conference_name = ?))`,
        args: [conferenceId, conferenceName],
      }).catch(() => ({ rows: [] as Record<string, unknown>[] })),
      db.execute({
        sql: `SELECT attendee_id, next_steps, assigned_rep, created_at
              FROM follow_ups WHERE conference_id = ?
              ORDER BY created_at ASC`,
        args: [conferenceId],
      }).catch(() => ({ rows: [] as Record<string, unknown>[] })),
      db.execute({
        sql: `SELECT m.id, m.attendee_id, m.additional_attendee_ids, m.meeting_date,
                     m.meeting_time, m.location, m.outcome, m.scheduled_by,
                     m.support_rep_ids, m.meeting_type,
                     co.action_key AS outcome_key
              FROM meetings m
              LEFT JOIN config_options co
                     ON co.category = 'action' AND co.value = m.outcome
              WHERE m.conference_id = ? AND m.superseded_by_id IS NULL`,
        args: [conferenceId],
      }).catch(() => ({ rows: [] as Record<string, unknown>[] })),
    ]);

    // ── Group by person ──
    const touchpointsBy = new Map<number, { date: unknown; label: unknown }[]>();
    for (const r of touchRes.rows) {
      const id = Number(r.attendee_id);
      touchpointsBy.set(id, [...(touchpointsBy.get(id) ?? []), { date: r.created_at, label: r.label }]);
    }
    const notesBy = new Map<number, { created_at: unknown; rep: unknown; content: unknown }[]>();
    for (const r of noteRes.rows) {
      const id = Number(r.attendee_id);
      notesBy.set(id, [...(notesBy.get(id) ?? []), { created_at: r.created_at, rep: r.rep, content: r.content }]);
    }
    /* One follow-up per person in the file, and it is the LATEST.
       A person can carry several; the column is "the next step in plain
       words", singular, and the most recent is the one a rep would act on. */
    const followBy = new Map<number, Record<string, unknown>>();
    for (const r of followRes.rows) followBy.set(Number(r.attendee_id), r);

    const meetingAttendees = new Map<number, Set<number>>();
    for (const m of meetingRes.rows) {
      const ids = new Set<number>();
      if (m.attendee_id != null) ids.add(Number(m.attendee_id));
      // A sit-down with three people from one operator is three rows in the
      // file, because HubSpot logs the meeting against each contact.
      for (const extra of String(m.additional_attendee_ids ?? '').split(',')) {
        const n = Number(extra.trim());
        if (Number.isFinite(n) && n > 0) ids.add(n);
      }
      meetingAttendees.set(Number(m.id), ids);
    }
    const hasMeeting = new Set<number>();
    for (const ids of Array.from(meetingAttendees.values())) for (const id of Array.from(ids)) hasMeeting.add(id);

    // ── people.csv ──
    const peopleRows: unknown[][] = [];
    const byId = new Map<number, Record<string, unknown>>();
    for (const p of peopleRes.rows) {
      const id = Number(p.id);
      byId.set(id, p);
      const touches = touchpointsBy.get(id) ?? [];
      const notes = notesBy.get(id) ?? [];
      const follow = followBy.get(id);
      // The filter from the spec: somebody who did nothing is not exported.
      if (touches.length === 0 && notes.length === 0 && !follow && !hasMeeting.has(id)) continue;

      peopleRows.push([
        id,
        p.hubspot_contact_id ?? '',
        p.hubspot_company_id ?? '',
        p.first_name ?? '', p.last_name ?? '', p.email ?? '', p.title ?? '',
        p.company_name ?? '', p.phone ?? '', p.linkedin_url ?? '',
        eventCode,
        touchpointsString(touches),
        notesString(notes),
        follow?.next_steps ?? '',
        repEmails(follow?.assigned_rep).join(';'),
      ]);
    }

    // ── meetings.csv ──
    const skipped: Skipped = { noOutcome: 0, noStart: 0 };
    const meetingRows: unknown[][] = [];
    for (const m of meetingRes.rows) {
      const outcome = outcomeLabel(m.outcome_key);
      if (!outcome) { skipped.noOutcome++; continue; }
      const start = meetingStartISO(m.meeting_date, m.meeting_time, timeZone);
      if (!start) { skipped.noStart++; continue; }

      const title = String(m.meeting_type ?? '').trim()
        ? `${conferenceName} — ${String(m.meeting_type).trim()}`
        : conferenceName;
      const support = repEmails(m.support_rep_ids).join(';');
      const owner = repEmails(m.scheduled_by)[0] ?? '';

      for (const attendeeId of Array.from(meetingAttendees.get(Number(m.id)) ?? [])) {
        const person = byId.get(attendeeId);
        // Somebody on a meeting who is not on this conference's list has no
        // row in people.csv to pair with, so the meeting row would dangle.
        if (!person) continue;
        meetingRows.push([
          m.id, attendeeId, person.hubspot_contact_id ?? '',
          title, start, m.location ?? '', outcome, owner, support, '',
        ]);
      }
    }

    const zip = new JSZip();
    zip.file('people.csv', csvFile([...PEOPLE_HEADERS], peopleRows));
    zip.file('meetings.csv', csvFile([...MEETINGS_HEADERS], meetingRows));
    const body = await zip.generateAsync({ type: 'nodebuffer' });

    const slug = conferenceName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    return new NextResponse(new Uint8Array(body), {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="parlay-hubspot-${slug || conferenceId}.zip"`,
        /* What was left out, on the response rather than in a log.
           This runs once; a meeting dropped for want of an outcome has to
           reach the person clicking the button, not a server log nobody
           reads until somebody asks why HubSpot is missing a meeting. */
        'X-Parlay-People': String(peopleRows.length),
        'X-Parlay-Meetings': String(meetingRows.length),
        'X-Parlay-Skipped-No-Outcome': String(skipped.noOutcome),
        'X-Parlay-Skipped-No-Start': String(skipped.noStart),
        'X-Parlay-Event-Code': eventCode,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    console.error('GET /api/conferences/[id]/hubspot-export error:', error);
    return NextResponse.json({ error: 'Failed to build the export' }, { status: 500 });
  }
}
