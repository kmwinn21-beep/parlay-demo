import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { db, dbReady } from '@/lib/db';
import Anthropic from '@anthropic-ai/sdk';

export const maxDuration = 90;

// Anthropic's PDF limit is 32 MB of raw data; base64 adds ~33% overhead.
// We guard at 20 MB of raw file so the encoded payload stays well under 32 MB.
const MAX_PDF_BYTES = 20 * 1024 * 1024;
// Images are sent as base64 too, but are typically small.
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

const MAX_CONTENT_CHARS = 200_000;

async function fetchUrlContent(rawUrl: string): Promise<string> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error('Invalid URL');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('URL must use http or https');
  }

  // Jina Reader is the primary approach — it handles JS-rendered pages, CSS-hidden
  // day tabs, and returns clean LLM-readable text without nav/footer noise.
  try {
    const jinaRes = await fetch(`https://r.jina.ai/${rawUrl}`, {
      signal: AbortSignal.timeout(25_000),
      headers: { Accept: 'text/plain', 'X-No-Cache': 'true' },
    });
    if (jinaRes.ok) {
      const jinaText = (await jinaRes.text()).trim();
      if (jinaText.length >= 500) {
        return jinaText.length > MAX_CONTENT_CHARS
          ? jinaText.slice(0, MAX_CONTENT_CHARS) + '\n[Content truncated]'
          : jinaText;
      }
    }
  } catch { /* fall through to direct fetch */ }

  // Direct fetch fallback — strip HTML to plain text
  let text = '';
  try {
    const res = await fetch(rawUrl, {
      signal: AbortSignal.timeout(12_000),
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; AgendaBot/1.0)',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });
    if (!res.ok) throw new Error(`Page returned ${res.status} ${res.statusText}`);
    const html = await res.text();

    text = html
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, '')
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/<nav\b[^>]*>[\s\S]*?<\/nav>/gi, '')
      .replace(/<header\b[^>]*>[\s\S]*?<\/header>/gi, '')
      .replace(/<footer\b[^>]*>[\s\S]*?<\/footer>/gi, '')
      .replace(/<aside\b[^>]*>[\s\S]*?<\/aside>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/[ \t]+/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  } catch (err) {
    if (err instanceof Error && err.message.startsWith('Page returned')) throw err;
    throw new Error('Failed to fetch page — it may be blocking automated requests');
  }

  if (!text) throw new Error('Could not extract any content from the page');

  if (text.length > MAX_CONTENT_CHARS) {
    text = text.slice(0, MAX_CONTENT_CHARS) + '\n[Content truncated]';
  }
  return text;
}

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
    const { image_base64, media_type, append, url } = await request.json() as {
      image_base64?: string;
      media_type?: string;
      append?: boolean;
      url?: string;
    };

    if (!image_base64 && !url) {
      return NextResponse.json({ error: 'image_base64 or url required' }, { status: 400 });
    }

    const sourceLabel = url ? 'URL' : 'file';

    type ContentBlock =
      | { type: 'text'; text: string }
      | { type: 'image'; source: { type: 'base64'; media_type: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp'; data: string } }
      | { type: 'document'; source: { type: 'base64'; media_type: 'application/pdf'; data: string } };

    let fileContentBlock: ContentBlock;
    let promptText: string;

    if (url) {
      let pageText: string;
      try {
        pageText = await fetchUrlContent(url);
      } catch (err) {
        return NextResponse.json(
          { error: err instanceof Error ? err.message : 'Failed to fetch URL' },
          { status: 422 },
        );
      }
      fileContentBlock = { type: 'text', text: pageText };
      promptText = `You are parsing a conference agenda from webpage content. Ignore navigation menus, headers, footers, ads, and any non-schedule content — focus only on schedule and session information. If the page has multiple days (even content from hidden tabs that may all be present in the HTML), extract all of them. Extract all sessions and return ONLY valid JSON — no prose, no markdown fences.

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
- Use null for fields you cannot determine, not empty string
- Return valid JSON only`;
    } else {
      const validImageTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
      const isPdf = media_type === 'application/pdf';
      const safeImageType = validImageTypes.includes(media_type ?? '') ? media_type! : 'image/jpeg';

      const approxBytes = Math.floor((image_base64 ?? '').length * 0.75);
      const limit = isPdf ? MAX_PDF_BYTES : MAX_IMAGE_BYTES;
      if (approxBytes > limit) {
        const limitMb = Math.round(limit / 1024 / 1024);
        return NextResponse.json(
          { error: `File is too large. ${isPdf ? 'PDF' : 'Image'} files must be under ${limitMb} MB.` },
          { status: 413 },
        );
      }

      fileContentBlock = isPdf
        ? ({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: image_base64! } })
        : ({ type: 'image', source: { type: 'base64', media_type: safeImageType as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp', data: image_base64! } });

      promptText = `You are parsing a conference agenda. Extract all sessions and return ONLY valid JSON — no prose, no markdown fences.

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
- Return valid JSON only`;
    }

    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 16000,
      messages: [{
        role: 'user',
        content: [
          fileContentBlock,
          { type: 'text', text: promptText },
        ],
      }],
    });

    // Surface truncation before attempting to parse — a cut-off JSON object will never parse
    if (message.stop_reason === 'max_tokens') {
      return NextResponse.json(
        { error: 'Agenda is too large to process at once. Try uploading a smaller section or fewer pages.' },
        { status: 422 },
      );
    }

    const rawText = message.content[0].type === 'text' ? message.content[0].text.trim() : '';
    let parsed: ParsedAgenda;
    try {
      // Extract the outermost JSON object — handles Claude adding prose or markdown around it
      const start = rawText.indexOf('{');
      const end = rawText.lastIndexOf('}');
      if (start === -1 || end === -1 || end <= start) throw new Error('no json object found');
      parsed = JSON.parse(rawText.slice(start, end + 1)) as ParsedAgenda;
    } catch {
      return NextResponse.json({ error: `Failed to parse agenda from ${sourceLabel}` }, { status: 422 });
    }

    const days = Array.isArray(parsed?.days) ? parsed.days : [];
    if (days.length === 0) {
      return NextResponse.json({ error: `No agenda items detected in ${sourceLabel}` }, { status: 422 });
    }

    if (!append) {
      await db.execute({
        sql: 'DELETE FROM conference_agenda_items WHERE conference_id = ?',
        args: [conferenceId],
      });
    }

    const insertStatements: { sql: string; args: (string | number | null)[] }[] = [];
    let sortOrder = 0;
    for (const day of days) {
      const dayLabel = String(day.day_label ?? 'Day 1').trim();
      const items = Array.isArray(day.items) ? day.items : [];
      for (const item of items) {
        const title = String(item.title ?? '').trim();
        if (!title) continue;
        insertStatements.push({
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
      }
    }

    if (insertStatements.length > 0) {
      await db.batch(insertStatements, 'write');
    }

    return NextResponse.json({ count: insertStatements.length });
  } catch (error) {
    console.error('POST /api/conferences/[id]/agenda error:', error);
    // Surface Anthropic API errors directly so the client can show something useful
    if (error instanceof Anthropic.APIError) {
      return NextResponse.json({ error: `AI error: ${error.message}` }, { status: error.status ?? 500 });
    }
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
