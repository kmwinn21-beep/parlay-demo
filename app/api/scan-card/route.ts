import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export interface CardScanResult {
  first_name: string | null;
  last_name: string | null;
  title: string | null;
  company: string | null;
  email: string | null;
  phone: string | null;
  extra_text: string | null;
}

export async function POST(request: NextRequest) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;

  try {
    const { image_base64, media_type } = await request.json();
    if (!image_base64) {
      return NextResponse.json({ error: 'image_base64 required' }, { status: 400 });
    }

    const validTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    const safeType = validTypes.includes(media_type) ? media_type : 'image/jpeg';

    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 512,
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
            text: `Extract contact information from this business card or conference badge image.
Return ONLY a valid JSON object with these exact fields (use null for any not found):
{
  "first_name": string | null,
  "last_name": string | null,
  "title": string | null,
  "company": string | null,
  "email": string | null,
  "phone": string | null,
  "extra_text": string | null
}
"extra_text" should contain any other text visible that doesn't fit the above fields (e.g. address, tagline, website).
Return only the JSON object — no markdown fences, no explanation, no extra text.`,
          },
        ],
      }],
    });

    const raw = message.content[0].type === 'text' ? message.content[0].text.trim() : '{}';
    // Strip markdown code fences if the model wraps in them anyway
    const clean = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
    const data: CardScanResult = JSON.parse(clean);
    return NextResponse.json(data);
  } catch (error) {
    console.error('POST /api/scan-card error:', error);
    return NextResponse.json({ error: 'Failed to scan card' }, { status: 500 });
  }
}
