import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getDb } from '@/lib/getDb';
import { formatMeetingTime, isBoothHours } from '@/lib/meetingTime';
import type { CrmPromptMeeting } from '@/lib/crmPrompt';

export const dynamic = 'force-dynamic';

function csvContains(col: string): string {
  return `',' || COALESCE(${col}, '') || ',' LIKE '%,' || ? || ',%'`;
}

/** 'Sep 23, 2026' — unambiguous to a person and to a parser. */
function formatDay(ymd: string): string {
  const d = new Date(`${ymd.slice(0, 10)}T00:00:00`);
  if (isNaN(d.getTime())) return ymd;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/** 'Aug 14, 2026 3:12 PM' — leads each note line. */
function formatStamp(ts: string): string {
  const iso = ts.includes('T') ? ts : ts.replace(' ', 'T');
  const d = new Date(iso.endsWith('Z') || iso.includes('+') ? iso : `${iso}Z`);
  if (isNaN(d.getTime())) return ts;
  return `${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} ${d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}`;
}

/** Three business days after the conference ends; weekends don't count. */
function addBusinessDays(ymd: string, days: number): string {
  const d = new Date(`${ymd.slice(0, 10)}T00:00:00`);
  if (isNaN(d.getTime())) return ymd;
  let added = 0;
  while (added < days) {
    d.setDate(d.getDate() + 1);
    const day = d.getDay();
    if (day !== 0 && day !== 6) added++;
  }
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
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
 * A meeting the rep can log: everything the CRM batch needs about it, for the
 * conference in the URL and the rep making the request.
 *
 * A meeting still sitting at Scheduled never happened by the time the field
 * report is being written up, so it goes over as Cancelled — as do meetings
 * with no outcome recorded at all, rather than being dropped silently.
 */
const REPORTABLE_KEYS = new Set(['held', 'cancelled', 'rescheduled', 'no_show', 'meeting_scheduled']);
const CANCELLED_KEYS = new Set(['meeting_scheduled']);

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const user = authResult;
  const db = await getDb(user.accountId);
  const conferenceId = Number(params.id);

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

    // The report belongs to whoever is looking at it, so the batch is their
    // meetings — the same scoping the debrief uses.
    const userRes = await db.execute({
      sql: 'SELECT config_id FROM users WHERE id = ?',
      args: [user.id],
    });
    const configId = userRes.rows[0]?.config_id != null ? Number(userRes.rows[0].config_id) : null;
    if (configId == null) {
      return NextResponse.json({ conferenceName, taskDueDate: '', meetings: [] });
    }

    const meetingRes = await db.execute({
      sql: `SELECT m.id, m.meeting_date, m.meeting_time, m.outcome,
                   a.id AS attendee_id, a.first_name, a.last_name, a.email, a.title,
                   co.id AS company_id, co.name AS company_name, co.website, co.assigned_user,
                   act.action_key
              FROM meetings m
              JOIN attendees a ON m.attendee_id = a.id
              LEFT JOIN companies co ON a.company_id = co.id
              LEFT JOIN config_options act
                ON act.category = 'action' AND act.value = m.outcome
             WHERE m.conference_id = ? AND ${csvContains('m.scheduled_by')}
             ORDER BY m.meeting_date, m.meeting_time`,
      args: [conferenceId, String(configId)],
    });

    // Rep names for the company owners referenced above.
    const repIds = Array.from(new Set(
      meetingRes.rows.flatMap(r => String(r.assigned_user ?? '').split(',').map(s => s.trim()).filter(Boolean)),
    ));
    const repNames = new Map<string, string>();
    if (repIds.length > 0) {
      const namesRes = await db.execute({
        sql: `SELECT id, value FROM config_options WHERE id IN (${repIds.map(() => '?').join(',')})`,
        args: repIds,
      });
      namesRes.rows.forEach(r => repNames.set(String(r.id), String(r.value ?? '')));
    }

    // Every note on these attendees written against this conference.
    const attendeeIds = Array.from(new Set(meetingRes.rows.map(r => Number(r.attendee_id))));
    const notesByAttendee = new Map<number, string[]>();
    if (attendeeIds.length > 0) {
      const notesRes = await db.execute({
        sql: `SELECT entity_id, content, created_at
                FROM entity_notes
               WHERE entity_type = 'attendee'
                 AND entity_id IN (${attendeeIds.map(() => '?').join(',')})
                 AND conference_name = ?
               ORDER BY created_at`,
        args: [...attendeeIds, conferenceName],
      });
      for (const r of notesRes.rows) {
        const key = Number(r.entity_id);
        const line = `${formatStamp(String(r.created_at ?? ''))} - ${String(r.content ?? '').trim()}`;
        notesByAttendee.set(key, [...(notesByAttendee.get(key) ?? []), line]);
      }
    }

    const meetings: CrmPromptMeeting[] = meetingRes.rows
      .filter(r => {
        const key = r.action_key != null ? String(r.action_key) : null;
        // No outcome recorded reads the same as never dispositioned.
        return key == null ? true : REPORTABLE_KEYS.has(key);
      })
      .map(r => {
        const key = r.action_key != null ? String(r.action_key) : null;
        const outcome = r.outcome != null ? String(r.outcome) : '';
        const status = key == null || CANCELLED_KEYS.has(key) ? 'Cancelled' : outcome;
        const time = r.meeting_time != null ? String(r.meeting_time) : '';
        const assigned = String(r.assigned_user ?? '')
          .split(',').map(s => s.trim()).filter(Boolean)
          .map(id => repNames.get(id) ?? '')
          .filter(Boolean)
          .join(', ');
        return {
          meetingId: Number(r.id),
          attendeeName: `${String(r.first_name ?? '')} ${String(r.last_name ?? '')}`.trim(),
          attendeeEmail: r.email != null ? String(r.email) : null,
          attendeeTitle: r.title != null ? String(r.title) : null,
          companyName: r.company_name != null ? String(r.company_name) : null,
          companyDomain: rootDomain(r.website != null ? String(r.website) : null),
          status,
          date: r.meeting_date != null ? formatDay(String(r.meeting_date)) : '',
          startTime: isBoothHours(time) ? '12:00 PM' : formatMeetingTime(time),
          notes: (notesByAttendee.get(Number(r.attendee_id)) ?? []).join('\n\n'),
          assignedRep: assigned || null,
        };
      });

    return NextResponse.json({
      conferenceName,
      taskDueDate: conf.end_date ? addBusinessDays(String(conf.end_date), 3) : '',
      meetings,
    });
  } catch (error) {
    console.error('GET /api/conferences/[id]/crm-prompt error:', error);
    return NextResponse.json({ error: 'Failed to build the CRM prompt' }, { status: 500 });
  }
}
