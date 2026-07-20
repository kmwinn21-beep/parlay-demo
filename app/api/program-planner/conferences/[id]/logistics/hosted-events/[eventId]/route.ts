import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getDb } from '@/lib/getDb';

const FIELD_MAP: Record<string, { column: string; boolean?: boolean; number?: boolean }> = {
  eventType: { column: 'event_type' },
  venueName: { column: 'venue_name' },
  eventDate: { column: 'event_date' },
  eventTime: { column: 'event_time' },
  guestCap: { column: 'guest_cap', number: true },
  cateringConfirmed: { column: 'catering_confirmed', boolean: true },
  invitationsSentDate: { column: 'invitations_sent_date' },
  rsvpDeadline: { column: 'rsvp_deadline' },
  notes: { column: 'notes' },
};

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; eventId: string }> }
) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const db = await getDb(authResult?.accountId);

  const { eventId } = await params;
  const id = parseInt(eventId, 10);
  if (isNaN(id)) return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });

  const body = await request.json();
  const entries = Object.entries(body).filter(([key]) => key in FIELD_MAP);
  if (entries.length === 0) return NextResponse.json({ error: 'No valid fields provided' }, { status: 400 });

  const setClauses: string[] = [];
  const args: (string | number | null)[] = [];
  for (const [key, value] of entries) {
    const { column, boolean, number } = FIELD_MAP[key];
    setClauses.push(`${column} = ?`);
    args.push(boolean ? (value ? 1 : 0) : number ? (value != null ? Number(value as string | number) : null) : ((value ?? null) as string | number | null));
  }

  try {
    await db.execute({
      sql: `UPDATE conference_plan_hosted_events SET ${setClauses.join(', ')} WHERE id = ?`,
      args: [...args, id],
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('PATCH .../logistics/hosted-events/[eventId] error:', error);
    return NextResponse.json({ error: 'Failed to update hosted event' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; eventId: string }> }
) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const db = await getDb(authResult?.accountId);

  const { eventId } = await params;
  const id = parseInt(eventId, 10);
  if (isNaN(id)) return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });

  try {
    await db.execute({ sql: `DELETE FROM conference_plan_hosted_events WHERE id = ?`, args: [id] });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('DELETE .../logistics/hosted-events/[eventId] error:', error);
    return NextResponse.json({ error: 'Failed to delete hosted event' }, { status: 500 });
  }
}
