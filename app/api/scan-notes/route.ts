import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import Anthropic from '@anthropic-ai/sdk';

export async function POST(request: NextRequest) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'Scan service not configured' }, { status: 503 });
  }

  try {
    const { image_base64, media_type } = await request.json() as { image_base64: string; media_type: string };
    if (!image_base64) return NextResponse.json({ error: 'image_base64 required' }, { status: 400 });

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
            text: 'This image contains handwritten or printed notes. Transcribe the text exactly as written, preserving line breaks and structure. Return only the transcribed text — no commentary, no explanation.',
          },
        ],
      }],
    });

    const text = message.content[0].type === 'text' ? message.content[0].text.trim() : '';
    return NextResponse.json({ text });
  } catch (error) {
    console.error('POST /api/scan-notes error:', error);
    return NextResponse.json({ error: 'Failed to scan notes' }, { status: 500 });
  }
}
