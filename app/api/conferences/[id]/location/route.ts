import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getDb } from '@/lib/getDb';

// Scoped, single-concern update — same rationale as .../[id]/strategy.
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const db = await getDb(authResult?.accountId);

  const { id } = await params;
  const confId = parseInt(id, 10);
  if (isNaN(confId)) return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });

  const body = await request.json();
  const location: string = String(body.location ?? '').trim();
  if (!location) return NextResponse.json({ error: 'location is required' }, { status: 400 });

  await db.execute({
    sql: `UPDATE conferences SET location = ?, location_place_id = ?, location_lat = ?, location_lng = ?,
                 location_city = ?, location_state = ?, location_country = ?, location_timezone = ?
          WHERE id = ?`,
    args: [
      location,
      body.locationPlaceId || null,
      body.locationLat != null ? Number(body.locationLat) : null,
      body.locationLng != null ? Number(body.locationLng) : null,
      body.locationCity || null,
      body.locationState || null,
      body.locationCountry || null,
      body.locationTimezone || null,
      confId,
    ],
  });

  return NextResponse.json({ success: true, conferenceId: confId, location });
}
