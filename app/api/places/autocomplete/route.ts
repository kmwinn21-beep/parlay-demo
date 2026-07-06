import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';

export async function GET(request: NextRequest) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;

  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'Location autocomplete is not configured.', predictions: [] }, { status: 501 });
  }

  const input = request.nextUrl.searchParams.get('input')?.trim();
  const sessiontoken = request.nextUrl.searchParams.get('sessiontoken') || '';
  if (!input) return NextResponse.json({ predictions: [] });

  try {
    const params = new URLSearchParams({ input, key: apiKey, sessiontoken });
    const res = await fetch(`https://maps.googleapis.com/maps/api/place/autocomplete/json?${params}`);
    const data = await res.json();

    if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
      console.error('Places autocomplete error:', data.status, data.error_message);
      return NextResponse.json({ predictions: [] });
    }

    const predictions = ((data.predictions ?? []) as Array<{ place_id: string; description: string }>).map(p => ({
      place_id: p.place_id,
      description: p.description,
    }));
    return NextResponse.json({ predictions });
  } catch (error) {
    console.error('GET /api/places/autocomplete error:', error);
    return NextResponse.json({ predictions: [] });
  }
}
