import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getDb } from '@/lib/getDb';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; userId: string }> }
) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const db = await getDb(authResult?.accountId);

  const { id, userId } = await params;
  const confId = parseInt(id, 10);
  const repUserId = parseInt(userId, 10);
  if (isNaN(confId) || isNaN(repUserId)) return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });

  const url = new URL(request.url);
  const year = parseInt(url.searchParams.get('year') ?? '', 10);
  if (isNaN(year)) return NextResponse.json({ error: 'year is required' }, { status: 400 });

  const body = await request.json();
  const flightStatus = body.flightStatus ?? 'not_started';
  const hotelStatus = body.hotelStatus ?? 'not_started';
  const hotelConfirmation = body.hotelConfirmation ?? null;
  const flightConfirmation = body.flightConfirmation ?? null;
  const notes = body.notes ?? null;

  try {
    await db.execute({
      sql: `INSERT INTO conference_plan_rep_travel
              (conference_id, plan_year, user_id, flight_status, hotel_status, hotel_confirmation, flight_confirmation, notes)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(conference_id, plan_year, user_id) DO UPDATE SET
              flight_status = COALESCE(?, flight_status),
              hotel_status = COALESCE(?, hotel_status),
              hotel_confirmation = COALESCE(?, hotel_confirmation),
              flight_confirmation = COALESCE(?, flight_confirmation),
              notes = COALESCE(?, notes)`,
      args: [
        confId, year, repUserId, flightStatus, hotelStatus, hotelConfirmation, flightConfirmation, notes,
        body.flightStatus ?? null, body.hotelStatus ?? null, body.hotelConfirmation ?? null, body.flightConfirmation ?? null, body.notes ?? null,
      ],
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('PATCH .../logistics/travel/[userId] error:', error);
    return NextResponse.json({ error: 'Failed to update travel status' }, { status: 500 });
  }
}
