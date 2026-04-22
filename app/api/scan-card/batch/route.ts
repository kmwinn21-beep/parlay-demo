import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import Anthropic from '@anthropic-ai/sdk';
import { type CardScanResult } from '../route';

export async function POST(request: NextRequest) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'Scan service not configured' }, { status: 503 });
  }

  try {
    const { image_base64, media_type } = await request.json();
    if (!image_base64) {
      return NextResponse.json({ error: 'image_base64 required' }, { status: 400 });
    }

    const validTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    const safeType = validTypes.includes(media_type) ? media_type : 'image/jpeg';

    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2048,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: safeType as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp',
              data: image_base64,
            },
          },
          {
            type: 'text',
            text: `This image may contain one or more business cards. Identify each separate business card visible and extract contact information from each one.
Return ONLY a valid JSON array — one object per card — with these exact fields (use null for any field not found):
[
  {
    "first_name": string | null,
    "last_name": string | null,
    "title": string | null,
    "company": string | null,
    "email": string | null,
    "phone": string | null,
    "extra_text": string | null
  }
]
"extra_text" should contain any other visible text that doesn't fit the above fields (address, tagline, website, etc.).
If only one card is visible, return an array with one element.
Return only the JSON array — no markdown fences, no explanation, no extra text.`,
          },
        ],
      }],
    });

    const raw = message.content[0].type === 'text' ? message.content[0].text.trim() : '[]';
    const jsonMatch = raw.match(/\[[\s\S]*\]/);
    const clean = jsonMatch ? jsonMatch[0] : '[]';
    const cards: CardScanResult[] = JSON.parse(clean);
    return NextResponse.json({ cards: Array.isArray(cards) ? cards : [cards] });
  } catch (error) {
    console.error('POST /api/scan-card/batch error:', error);
    return NextResponse.json({ error: 'Failed to scan cards' }, { status: 500 });
  }
}
