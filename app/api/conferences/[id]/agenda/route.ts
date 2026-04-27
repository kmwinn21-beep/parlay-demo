import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { db, dbReady } from '@/lib/db';
import Anthropic from '@anthropic-ai/sdk';

interface AgendaItem {
  id: number;
  start_time: string | null;
  end_time: string | null;
  session_type: string | null;
  title: string;
  description: string | null;
  location: string | null;
}

interface AgendaDay {
  day_label: string;
  items: AgendaItem[];
}

interface ParsedItem {
  start_time?: string | null;
  end_time?: string | null;
  session_type?: string | null;
  title?: string;
  description?: string | null;
  location?: string | null;
}

interface ParsedDay {
  day_label?: string;
  items?: ParsedItem[];
}

interface ParsedAgenda {
  days?: ParsedDay[];
}

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;

  try {
    await dbReady;
    const conferenceId = Number(params.id);
    const result = await db.execute({
      sql: `SELECT id, day_label, start_time, end_time, session_type, title, description, location
            FROM conference_agenda_items
            WHERE conference_id = ?
            ORDER BY sort_order ASC`,
      args: [conferenceId],
    });

    const dayMap = new Map<string, AgendaItem[]>();
    for (const row of result.rows) {
      const label = String(row.day_label);
      if (!dayMap.has(label)) dayMap.set(label, []);
      dayMap.get(label)!.push({
        id: Number(row.id),
        start_time: row.start_time ? String(row.start_time) : null,
        end_time: row.end_time ? String(row.end_time) : null,
        session_type: row.session_type ? String(row.session_type) : null,
        title: String(row.title),
        description: row.description ? String(row.description) : null,
        location: row.location ? String(row.location) : null,
      });
    }

    const days: AgendaDay[] = Array.from(dayMap.entries()).map(([day_label, items]) => ({ day_label, items }));
    return NextResponse.json({ days });
  } catch (error) {
    console.error('GET /api/conferences/[id]/agenda error:', error);
    return NextResponse.json({ error: 'Failed to fetch agenda' }, { status: 500 });
  }
}

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'Scan service not configured' }, { status: 503 });
  }

  try {
    await dbReady;
    const conferenceId = Number(params.id);
    const { image_base64, media_type, append } = await request.json() as {
      image_base64: string;
      media_type: string;
      append?: boolean;
    };

    if (!image_base64) return NextResponse.json({ error: 'image_base64 required' }, { status: 400 });

    const validImageTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    const isPdf = media_type === 'application/pdf';
    const safeImageType = validImageTypes.includes(media_type) ? media_type : 'image/jpeg';

    const fileContentBlock = isPdf
      ? ({
          type: 'document' as const,
          source: { type: 'base64' as const, media_type: 'application/pdf' as const, data: image_base64 },
        })
      : ({
          type: 'image' as const,
          source: { type: 'base64' as const, media_type: safeImageType as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp', data: image_base64 },
        });

    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 4096,
      messages: [{
        role: 'user',
        content: [
          fileContentBlock,
          {
            type: 'text',
            text: `You are parsing a conference agenda. Extract all sessions and return ONLY valid JSON — no prose, no markdown fences.

Schema:
{
  "days": [
    {
      "day_label": "string (e.g. 'Monday, April 14' or 'Day 1')",
      "items": [
        {
          "start_time": "string or null",
          "end_time": "string or null",
          "session_type": "string or null (e.g. 'Keynote', 'Workshop', 'Break', 'Panel')",
          "title": "string",
          "description": "string or null",
          "location": "string or null"
        }
      ]
    }
  ]
}

Rules:
- Preserve original time formats (e.g. '9:00 AM', '14:30')
- If no explicit day labels exist, use 'Day 1', 'Day 2', etc.
- If the entire agenda is one day, wrap it in a single day object
- Omit fields you cannot determine (use null, not empty string)
- Return valid JSON only`,
          },
        ],
      }],
    });

    const rawText = message.content[0].type === 'text' ? message.content[0].text.trim() : '';
    let parsed: ParsedAgenda;
    try {
      // Strip markdown code fences if Claude wrapped output anyway
      const cleaned = rawText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
      parsed = JSON.parse(cleaned) as ParsedAgenda;
    } catch {
      return NextResponse.json({ error: 'Failed to parse agenda from file' }, { status: 422 });
    }

    const days = Array.isArray(parsed?.days) ? parsed.days : [];
    if (days.length === 0) {
      return NextResponse.json({ error: 'No agenda items detected in file' }, { status: 422 });
    }

    if (!append) {
      await db.execute({
        sql: 'DELETE FROM conference_agenda_items WHERE conference_id = ?',
        args: [conferenceId],
      });
    }

    let sortOrder = 0;
    let count = 0;
    for (const day of days) {
      const dayLabel = String(day.day_label ?? 'Day 1').trim();
      const items = Array.isArray(day.items) ? day.items : [];
      for (const item of items) {
        const title = String(item.title ?? '').trim();
        if (!title) continue;
        await db.execute({
          sql: `INSERT INTO conference_agenda_items
                  (conference_id, day_label, start_time, end_time, session_type, title, description, location, sort_order)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          args: [
            conferenceId,
            dayLabel,
            item.start_time ?? null,
            item.end_time ?? null,
            item.session_type ?? null,
            title,
            item.description ?? null,
            item.location ?? null,
            sortOrder++,
          ],
        });
        count++;
      }
    }

    return NextResponse.json({ count });
  } catch (error) {
    console.error('POST /api/conferences/[id]/agenda error:', error);
    return NextResponse.json({ error: 'Failed to scan agenda' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;

  try {
    await dbReady;
    await db.execute({
      sql: 'DELETE FROM conference_agenda_items WHERE conference_id = ?',
      args: [Number(params.id)],
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('DELETE /api/conferences/[id]/agenda error:', error);
    return NextResponse.json({ error: 'Failed to clear agenda' }, { status: 500 });
  }
}
