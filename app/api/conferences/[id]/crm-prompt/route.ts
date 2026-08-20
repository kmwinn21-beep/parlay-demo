import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getDb } from '@/lib/getDb';
import { formatMeetingTime, isBoothHours } from '@/lib/meetingTime';
import { loadAdditionalAttendees } from '@/lib/additionalAttendees';
import type { CrmPromptContact, CrmPromptMeeting, CrmPromptNote, CrmPromptTask } from '@/lib/crmPrompt';

export const dynamic = 'force-dynamic';

function csvContains(col: string): string {
  return `',' || COALESCE(${col}, '') || ',' LIKE '%,' || ? || ',%'`;
}

/** Pacific, so a stamp reads as the rep's own clock rather than the server's. */
const STAMP_ZONE = 'America/Los_Angeles';

/**
 * 'Sep 23, 2026' — a stored calendar date, rendered as that exact date.
 *
 * Deliberately not shifted into any zone: a meeting on the 23rd is on the 23rd
 * wherever it is read, and converting midnight would land it on the 22nd.
 */
function formatDay(ymd: string): string {
  const d = new Date(`${ymd.slice(0, 10)}T00:00:00Z`);
  if (isNaN(d.getTime())) return ymd;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}

/**
 * 'Aug 14, 2026 3:12 PM' — leads each note line.
 *
 * Stored stamps are UTC, so they are read as UTC and written out in Pacific.
 * Left to the server's own zone they came out hours ahead of when the note was
 * actually written.
 */
function formatStamp(ts: string): string {
  const iso = ts.includes('T') ? ts : ts.replace(' ', 'T');
  const d = new Date(iso.endsWith('Z') || iso.includes('+') ? iso : `${iso}Z`);
  if (isNaN(d.getTime())) return ts;
  const date = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: STAMP_ZONE });
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: STAMP_ZONE });
  return `${date} ${time}`;
}

/** Three business days after the conference ends; weekends don't count. */
function addBusinessDays(ymd: string, days: number): string {
  const d = new Date(`${ymd.slice(0, 10)}T00:00:00Z`);
  if (isNaN(d.getTime())) return ymd;
  let added = 0;
  while (added < days) {
    d.setUTCDate(d.getUTCDate() + 1);
    const day = d.getUTCDay();
    if (day !== 0 && day !== 6) added++;
  }
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}

/** 'https://www.acme.com/about?x=1' → 'acme.com'. */
function rootDomain(website: string | null): string | null {
  if (!website) return null;
  const trimmed = website.trim();
  if (!trimmed) return null;
  const host = trimmed
    .replace(/^[a-z]+:\/\//i, '')
    .split(/[/?#]/)[0]
    .replace(/^www\./i, '')
    .trim()
    .toLowerCase();
  return host || null;
}

/**
 * A meeting still sitting at Scheduled never happened by the time the field
 * report is being written up, so it goes over as Cancelled — as does one with
 * no outcome recorded at all.
 *
 * Outcomes are account-configurable: the same "Held" can carry a different
 * action_key from one account to the next, and older rows carry none. So this
 * reads the outcome's own text as well as its key, and anything it cannot
 * classify passes through exactly as written rather than being dropped. No
 * meeting the rep ran is ever silently missing from the batch.
 */
function toStatus(outcome: string, actionKey: string | null): string {
  const normalized = outcome.trim().toLowerCase();
  if (!normalized) return 'Cancelled';
  if (actionKey === 'meeting_scheduled' || normalized === 'scheduled') return 'Cancelled';
  return outcome.trim();
}

/** 'Post-Mtg', 'post mtg', 'postmtg' — all the same thing. */
function isPostMeetingSource(value: string, actionKey: string | null): boolean {
  if (actionKey === 'post_mtg') return true;
  return value.toLowerCase().replace(/[^a-z]/g, '') === 'postmtg';
}

function contact(name: string, email: unknown, title: unknown): CrmPromptContact {
  return {
    name,
    email: email != null && String(email).trim() ? String(email).trim() : null,
    title: title != null && String(title).trim() ? String(title).trim() : null,
  };
}

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const user = authResult;
  const db = await getDb(user.accountId);
  const conferenceId = Number(params.id);

  const empty = (conferenceName = '', conferenceEndDate = '') => NextResponse.json({
    conferenceName, conferenceEndDate, taskDueDate: '', meetings: [], tasks: [], notes: [],
  });

  try {
    const confRes = await db.execute({
      sql: 'SELECT id, name, start_date, end_date FROM conferences WHERE id = ?',
      args: [conferenceId],
    });
    if (confRes.rows.length === 0) {
      return NextResponse.json({ error: 'Conference not found' }, { status: 404 });
    }
    const conf = confRes.rows[0];
    const conferenceName = String(conf.name ?? '');
    const endDate = conf.end_date ? String(conf.end_date) : '';
    const conferenceEndDate = endDate ? formatDay(endDate) : '';
    const taskDueDate = endDate ? addBusinessDays(endDate, 3) : '';

    // The report belongs to whoever is looking at it, so the batch is their
    // work — the same scoping the debrief uses.
    const userRes = await db.execute({ sql: 'SELECT config_id FROM users WHERE id = ?', args: [user.id] });
    const configId = userRes.rows[0]?.config_id != null ? Number(userRes.rows[0].config_id) : null;
    if (configId == null) return empty(conferenceName, conferenceEndDate);
    const repKey = String(configId);

    // ── Rep name lookup, shared by every section ────────────────────────────
    const repNames = new Map<string, string>();
    const loadRepNames = async (csv: unknown[]) => {
      const ids = Array.from(new Set(
        csv.flatMap(v => String(v ?? '').split(',').map(s => s.trim()).filter(Boolean)),
      )).filter(id => !repNames.has(id));
      if (ids.length === 0) return;
      const res = await db.execute({
        sql: `SELECT id, value FROM config_options WHERE id IN (${ids.map(() => '?').join(',')})`,
        args: ids,
      });
      res.rows.forEach(r => repNames.set(String(r.id), String(r.value ?? '')));
    };
    const resolveReps = (csv: unknown): string | null => {
      const names = String(csv ?? '').split(',').map(s => s.trim()).filter(Boolean)
        .map(id => repNames.get(id) ?? '').filter(Boolean);
      return names.length > 0 ? names.join(', ') : null;
    };

    // ── Meetings ────────────────────────────────────────────────────────────
    const meetingRes = await db.execute({
      sql: `SELECT m.id, m.meeting_date, m.meeting_time, m.outcome, m.additional_attendee_ids,
                   a.id AS attendee_id, a.first_name, a.last_name, a.email, a.title,
                   co.id AS company_id, co.name AS company_name, co.website, co.assigned_user,
                   -- Subquery rather than a join: duplicate action rows with
                   -- the same value would otherwise repeat the meeting.
                   (SELECT co2.action_key FROM config_options co2
                     WHERE co2.category = 'action' AND co2.value = m.outcome
                     ORDER BY co2.id LIMIT 1) AS action_key
              FROM meetings m
              JOIN attendees a ON m.attendee_id = a.id
              LEFT JOIN companies co ON a.company_id = co.id
             WHERE m.conference_id = ? AND ${csvContains('m.scheduled_by')}
             ORDER BY m.meeting_date, m.meeting_time`,
      args: [conferenceId, repKey],
    });

    const extras = await loadAdditionalAttendees(
      db,
      meetingRes.rows.map(r => ({ id: Number(r.id), additional_attendee_ids: r.additional_attendee_ids })),
    );

    // ── Follow-ups still to be actioned, minus the post-meeting ones ────────
    const followRes = await db.execute({
      sql: `SELECT fu.id, fu.next_steps, fu.follow_up_action, fu.assigned_rep, fu.meeting_id,
                   a.id AS attendee_id, a.first_name, a.last_name, a.email, a.title,
                   co.id AS company_id, co.name AS company_name, co.website, co.assigned_user,
                   -- The action stores its full name; the short one is what a
                   -- task is titled with.
                   (SELECT fa.description FROM config_options fa
                     WHERE fa.category = 'follow_up_actions' AND fa.value = fu.follow_up_action
                     ORDER BY fa.id LIMIT 1) AS action_short_name,
                   (SELECT ns.value FROM config_options ns
                     WHERE ns.category = 'next_steps'
                       AND (ns.id = CAST(fu.next_steps AS INTEGER) OR ns.value = fu.next_steps)
                     ORDER BY ns.id LIMIT 1) AS source_value,
                   (SELECT ns2.action_key FROM config_options ns2
                     WHERE ns2.category = 'next_steps'
                       AND (ns2.id = CAST(fu.next_steps AS INTEGER) OR ns2.value = fu.next_steps)
                     ORDER BY ns2.id LIMIT 1) AS source_key
              FROM follow_ups fu
              JOIN attendees a ON fu.attendee_id = a.id
              LEFT JOIN companies co ON a.company_id = co.id
             WHERE fu.conference_id = ? AND ${csvContains('fu.assigned_rep')}
             ORDER BY fu.created_at, fu.id`,
      args: [conferenceId, repKey],
    });

    // ── Notes: everything on these companies and attendees at this conference
    const companyIds = Array.from(new Set([
      ...meetingRes.rows.map(r => (r.company_id != null ? Number(r.company_id) : null)),
      ...followRes.rows.map(r => (r.company_id != null ? Number(r.company_id) : null)),
    ].filter((v): v is number => v != null)));

    const attendeeIds = Array.from(new Set([
      ...meetingRes.rows.map(r => Number(r.attendee_id)),
      ...followRes.rows.map(r => Number(r.attendee_id)),
    ]));

    const notesFor = async (entityType: 'attendee' | 'company', ids: number[]) => {
      const byEntity = new Map<number, string[]>();
      if (ids.length === 0) return byEntity;
      const res = await db.execute({
        sql: `SELECT entity_id, content, created_at
                FROM entity_notes
               WHERE entity_type = ?
                 AND entity_id IN (${ids.map(() => '?').join(',')})
                 AND conference_name = ?
               ORDER BY created_at`,
        args: [entityType, ...ids, conferenceName],
      });
      for (const r of res.rows) {
        const key = Number(r.entity_id);
        const line = `${formatStamp(String(r.created_at ?? ''))} - ${String(r.content ?? '').trim()}`;
        byEntity.set(key, [...(byEntity.get(key) ?? []), line]);
      }
      return byEntity;
    };
    const attendeeNotes = await notesFor('attendee', attendeeIds);
    const companyNotes = await notesFor('company', companyIds);

    await loadRepNames([
      ...meetingRes.rows.map(r => r.assigned_user),
      ...followRes.rows.map(r => r.assigned_user),
    ]);

    const meetings: CrmPromptMeeting[] = meetingRes.rows.map(r => {
      const attendeeName = `${String(r.first_name ?? '')} ${String(r.last_name ?? '')}`.trim();
      const time = r.meeting_time != null ? String(r.meeting_time) : '';
      const guests = extras.get(Number(r.id)) ?? [];
      return {
        attendeeName,
        contacts: [
          contact(attendeeName, r.email, r.title),
          ...guests.map(g => contact(`${g.first_name} ${g.last_name}`.trim(), g.email, g.title)),
        ],
        companyName: r.company_name != null ? String(r.company_name) : null,
        companyDomain: rootDomain(r.website != null ? String(r.website) : null),
        status: toStatus(r.outcome != null ? String(r.outcome) : '', r.action_key != null ? String(r.action_key) : null),
        date: r.meeting_date != null ? formatDay(String(r.meeting_date)) : '',
        startTime: isBoothHours(time) ? '12:00 PM' : formatMeetingTime(time),
        notes: (attendeeNotes.get(Number(r.attendee_id)) ?? []).join('\n\n'),
        assignedRep: resolveReps(r.assigned_user),
      };
    });

    const tasks: CrmPromptTask[] = followRes.rows
      .filter(r => !isPostMeetingSource(
        String(r.source_value ?? r.next_steps ?? ''),
        r.source_key != null ? String(r.source_key) : null,
      ))
      .map(r => {
        const attendeeName = `${String(r.first_name ?? '')} ${String(r.last_name ?? '')}`.trim();
        const source = String(r.source_value ?? r.next_steps ?? '').trim();
        const guests = r.meeting_id != null ? (extras.get(Number(r.meeting_id)) ?? []) : [];
        // Short name where the action has one, the full name otherwise. Never
        // the Source — that is where the follow-up came from, not what to do.
        const actionFull = String(r.follow_up_action ?? '').trim();
        const actionShort = String(r.action_short_name ?? '').trim();
        return {
          action: actionShort || actionFull,
          source,
          attendeeName,
          contacts: [
            contact(attendeeName, r.email, r.title),
            ...guests.map(g => contact(`${g.first_name} ${g.last_name}`.trim(), g.email, g.title)),
          ],
          companyName: r.company_name != null ? String(r.company_name) : null,
          companyDomain: rootDomain(r.website != null ? String(r.website) : null),
          assignedRep: resolveReps(r.assigned_user),
          notes: (attendeeNotes.get(Number(r.attendee_id)) ?? []).join('\n'),
        };
      });

    // One note block per company that has anything written against it here.
    const companyRows = companyIds.length > 0
      ? await db.execute({
          sql: `SELECT id, name, website FROM companies WHERE id IN (${companyIds.map(() => '?').join(',')}) ORDER BY name`,
          args: companyIds,
        })
      : { rows: [] as Record<string, unknown>[] };

    // Everyone from that company who was at this conference, notes or not.
    const rosterByCompany = new Map<number, CrmPromptContact[]>();
    if (companyIds.length > 0) {
      const rosterRes = await db.execute({
        sql: `SELECT a.company_id, a.first_name, a.last_name, a.email, a.title
                FROM attendees a
                JOIN conference_attendees ca ON ca.attendee_id = a.id AND ca.conference_id = ?
               WHERE a.company_id IN (${companyIds.map(() => '?').join(',')})
               ORDER BY a.last_name, a.first_name`,
        args: [conferenceId, ...companyIds],
      });
      for (const r of rosterRes.rows) {
        const key = Number(r.company_id);
        const name = `${String(r.first_name ?? '')} ${String(r.last_name ?? '')}`.trim();
        rosterByCompany.set(key, [...(rosterByCompany.get(key) ?? []), contact(name, r.email, r.title)]);
      }
    }

    const notes: CrmPromptNote[] = companyRows.rows
      .map(r => {
        const id = Number(r.id);
        return {
          companyName: r.name != null ? String(r.name) : null,
          companyDomain: rootDomain(r.website != null ? String(r.website) : null),
          contacts: rosterByCompany.get(id) ?? [],
          notes: (companyNotes.get(id) ?? []).join('\n\n'),
        };
      })
      .filter(n => n.notes.length > 0);

    return NextResponse.json({ conferenceName, conferenceEndDate, taskDueDate, meetings, tasks, notes });
  } catch (error) {
    console.error('GET /api/conferences/[id]/crm-prompt error:', error);
    return NextResponse.json({ error: 'Failed to build the CRM prompt' }, { status: 500 });
  }
}
