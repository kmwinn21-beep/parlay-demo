import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';

interface AddressComponent {
  long_name: string;
  short_name: string;
  types: string[];
}

function findComponent(components: AddressComponent[], type: string, useShort = false): string | null {
  const match = components.find(c => c.types.includes(type));
  if (!match) return null;
  return useShort ? match.short_name : match.long_name;
}

export async function GET(request: NextRequest) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;

  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'Location autocomplete is not configured.' }, { status: 501 });
  }

  const placeId = request.nextUrl.searchParams.get('place_id');
  const sessiontoken = request.nextUrl.searchParams.get('sessiontoken') || '';
  if (!placeId) return NextResponse.json({ error: 'place_id is required' }, { status: 400 });

  try {
    const detailsParams = new URLSearchParams({
      place_id: placeId,
      key: apiKey,
      sessiontoken,
      fields: 'formatted_address,geometry,address_component',
    });
    const detailsRes = await fetch(`https://maps.googleapis.com/maps/api/place/details/json?${detailsParams}`);
    const detailsData = await detailsRes.json();

    if (detailsData.status !== 'OK') {
      console.error('Place details error:', detailsData.status, detailsData.error_message);
      return NextResponse.json({ error: 'Failed to fetch place details' }, { status: 502 });
    }

    const result = detailsData.result;
    const lat: number | null = result.geometry?.location?.lat ?? null;
    const lng: number | null = result.geometry?.location?.lng ?? null;
    const components: AddressComponent[] = result.address_components ?? [];
    const city = findComponent(components, 'locality') || findComponent(components, 'postal_town') || findComponent(components, 'sublocality');
    const state = findComponent(components, 'administrative_area_level_1', true);
    const country = findComponent(components, 'country');

    // Time Zone API needs its own call — Place Details doesn't return a timezone.
    let timezone: string | null = null;
    if (lat != null && lng != null) {
      try {
        const tzParams = new URLSearchParams({
          location: `${lat},${lng}`,
          timestamp: String(Math.floor(Date.now() / 1000)),
          key: apiKey,
        });
        const tzRes = await fetch(`https://maps.googleapis.com/maps/api/timezone/json?${tzParams}`);
        const tzData = await tzRes.json();
        if (tzData.status === 'OK') timezone = tzData.timeZoneId;
      } catch {
        // non-fatal — location still resolves without a timezone
      }
    }

    return NextResponse.json({
      place_id: placeId,
      formatted_address: result.formatted_address as string,
      lat,
      lng,
      city,
      state,
      country,
      timezone,
    });
  } catch (error) {
    console.error('GET /api/places/details error:', error);
    return NextResponse.json({ error: 'Failed to fetch place details' }, { status: 500 });
  }
}
