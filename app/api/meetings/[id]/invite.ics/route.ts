import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getDb } from '@/lib/getDb';
import { buildIcs } from '@/lib/calendarInvite';

/**
 * The meeting as an .ics file. Unlike the Google/Outlook composer URLs, which
 * the OS hands to a browser, this is `text/calendar` — iOS opens the Add Event
 * sheet, Android the calendar chooser, desktop Outlook or Apple Calendar.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const user = authResult;
  const db = await getDb(user.accountId);

  const { id } = await params;
  const meetingId = Number(id);
  if (!Number.isFinite(meetingId)) {
    return NextResponse.json({ error: 'Invalid meeting id' }, { status: 400 });
  }

  try {
    const res = await db.execute({
      sql: `SELECT m.id, m.meeting_date, m.meeting_time, m.location, m.meeting_type,
                   m.additional_attendees,
                   a.first_name, a.last_name, a.email AS attendee_email,
                   co.name AS company_name,
                   c.name AS conference_name, c.location AS conference_location,
                   c.location_timezone
            FROM meetings m
            JOIN attendees a ON m.attendee_id = a.id
            LEFT JOIN companies co ON a.company_id = co.id
            JOIN conferences c ON m.conference_id = c.id
            WHERE m.id = ?`,
      args: [meetingId],
    });

    if (res.rows.length === 0) {
      return NextResponse.json({ error: 'Meeting not found' }, { status: 404 });
    }
    const r = res.rows[0];

    const dateYMD = r.meeting_date ? String(r.meeting_date) : '';
    const timeHM = r.meeting_time ? String(r.meeting_time) : '';
    if (!dateYMD || !timeHM) {
      return NextResponse.json({ error: 'Meeting has no date or time' }, { status: 400 });
    }

    // The organizer is whoever is asking — their calendar is the one this lands in.
    const meRes = await db.execute({
      sql: 'SELECT email, display_name, first_name FROM users WHERE id = ?',
      args: [user.id],
    }).catch(() => ({ rows: [] as Record<string, unknown>[] }));
    const me = (meRes as { rows: Record<string, unknown>[] }).rows[0];
    const organizerEmail = me?.email ? String(me.email) : (user.email ?? null);
    const organizerName = me?.display_name ? String(me.display_name) : null;
    const repFirst = me?.first_name ? String(me.first_name) : (organizerName?.split(' ')[0] ?? 'Rep');

    const attendeeName = `${String(r.first_name ?? '')} ${String(r.last_name ?? '')}`.trim();
    const attendeeFirst = String(r.first_name ?? '') || 'Attendee';
    const conferenceName = String(r.conference_name ?? 'Conference');

    // Same shape as the title the schedule modal puts on the vendor invites.
    const title = `${attendeeFirst} and ${repFirst}: ${conferenceName} Meeting`;
    const location = String(r.location ?? '') || String(r.meeting_type ?? '') || String(r.conference_location ?? '');

    const descriptionParts = [
      r.company_name ? `${attendeeName} — ${String(r.company_name)}` : attendeeName,
      `Conference: ${conferenceName}`,
      r.meeting_type ? `Type: ${String(r.meeting_type)}` : null,
      r.additional_attendees ? `Additional attendees: ${String(r.additional_attendees)}` : null,
    ].filter(Boolean) as string[];

    const attendeeEmail = r.attendee_email ? String(r.attendee_email) : null;
    // No invitee means there is nobody to send to — the file is a plain add.
    const method = attendeeEmail ? 'REQUEST' : 'PUBLISH';

    const ics = buildIcs({
      uid: `meeting-${meetingId}@parlay`,
      title,
      attendeeEmail,
      attendeeName: attendeeName || null,
      organizerEmail,
      organizerName,
      location,
      description: descriptionParts.join('\n'),
      dateYMD,
      timeHM,
      timezone: r.location_timezone ? String(r.location_timezone) : null,
    });

    return new NextResponse(ics, {
      headers: {
        // charset + method are what makes a calendar client treat this as an invite
        'Content-Type': `text/calendar; charset=utf-8; method=${method}`,
        'Content-Disposition': `attachment; filename="meeting-${meetingId}.ics"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    console.error('GET /api/meetings/[id]/invite.ics error:', error);
    return NextResponse.json({ error: 'Failed to build calendar invite' }, { status: 500 });
  }
}
