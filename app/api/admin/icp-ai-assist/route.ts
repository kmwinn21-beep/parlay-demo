import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { requireAdmin } from '@/lib/auth';
import { getDb } from '@/lib/getDb';

const AI_PROMPT = `You are a Chief Marketing Officer analyzing a company's public-facing presence to identify sales intelligence.

Review the provided information — which may include a company website, marketing materials, case studies, press releases, social media, etc — and return two structured lists:

---

**PAIN POINTS** (5–10 items)
Operational or strategic problems this company likely experiences based on visible signals. Consider:
- Inefficiencies in how they operate or scale
- Resource, staffing, or capacity constraints
- Technology or process gaps
- Cost pressures or margin challenges
- Compliance, risk, or regulatory exposure
- Customer acquisition, retention, or competitive positioning struggles
- Leadership bandwidth or organizational complexity

---

**TRIGGER EVENTS** (5–10 items)
Signals visible in this content that suggest the company may be actively ready to buy or evaluate a new solution. Look for:
- Leadership or ownership transitions
- Rapid growth, expansion, or new locations
- Recent funding, acquisition, or restructuring activity
- High hiring volume or hard-to-fill roles
- Rebranding or strategic pivots
- Compliance or regulatory language
- Financial stress or efficiency-focused messaging

---

Be specific to what you can actually observe. Do not fabricate details not visible in the information/documents provided. If a signal is inferred, note it as inferred.

Return ONLY valid JSON in this exact structure — no markdown, no explanation, just JSON:
{
  "pain_points": [
    {"title": "Short 2-5 word title", "description": "One sentence describing the specific problem this company likely faces, based on what you observed."},
    ...
  ],
  "trigger_events": [
    {"title": "Short 2-5 word title", "description": "One sentence describing the signal observed and why it indicates buying readiness."},
    ...
  ]
}`;

const MONTHLY_LIMIT = 5;

async function getUsage(): Promise<{ count: number; month: string }> {
  const currentMonth = new Date().toISOString().slice(0, 7);
  try {
    const row = await db.execute({
      sql: `SELECT value FROM site_settings WHERE key = 'icp_ai_usage'`,
      args: [],
    });
    if (row.rows[0]?.value) {
      const stored = JSON.parse(String(row.rows[0].value)) as { count: number; month: string };
      if (stored.month === currentMonth) return stored;
    }
  } catch { /* ignore */ }
  return { count: 0, month: currentMonth };
}

async function saveUsage(usage: { count: number; month: string }) {
  await db.execute({
    sql: `INSERT OR REPLACE INTO site_settings (key, value) VALUES ('icp_ai_usage', ?)`,
    args: [JSON.stringify(usage)],
  });
}

export async function GET(request: NextRequest) {
  const authResult = await requireAdmin(request);
  if (authResult instanceof NextResponse) return authResult;
  const db = await getDb(authResult?.accountId);
  const usage = await getUsage();
  return NextResponse.json({
    count: usage.count,
    limit: MONTHLY_LIMIT,
    remaining: Math.max(0, MONTHLY_LIMIT - usage.count),
  });
}

export async function POST(request: NextRequest) {
  const authResult = await requireAdmin(request);
  if (authResult instanceof NextResponse) return authResult;
  const db = await getDb(authResult?.accountId);

  const usage = await getUsage();
  if (usage.count >= MONTHLY_LIMIT) {
    return NextResponse.json(
      { error: `Monthly limit of ${MONTHLY_LIMIT} analyses reached. Resets on the 1st of each month.` },
      { status: 429 }
    );
  }

  const formData = await request.formData();
  const links = (formData.getAll('links') as string[]).filter(l => l.trim());
  const files = (formData.getAll('files') as File[]).slice(0, 5);

  if (links.length === 0 && files.length === 0) {
    return NextResponse.json({ error: 'Please provide at least one link or document.' }, { status: 400 });
  }

  // Build user message content
  const contentParts: Anthropic.MessageParam['content'] = [];
  let textContent = 'Here is the information to analyze:\n\n';

  // Fetch URL content server-side
  for (const link of links) {
    try {
      const res = await fetch(link, {
        signal: AbortSignal.timeout(10000),
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ParlayBot/1.0)' },
      });
      const html = await res.text();
      const text = html
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 12000);
      textContent += `=== Website: ${link} ===\n${text}\n\n`;
    } catch {
      textContent += `=== Website: ${link} (failed to load) ===\n\n`;
    }
  }

  contentParts.push({ type: 'text', text: textContent });

  // Add uploaded documents
  for (const file of files) {
    try {
      const buffer = await file.arrayBuffer();
      const base64 = Buffer.from(buffer).toString('base64');
      const mimeType = file.type || 'application/pdf';

      if (mimeType.startsWith('image/')) {
        const validImageTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'] as const;
        const imageType = validImageTypes.find(t => t === mimeType) ?? 'image/jpeg';
        contentParts.push({
          type: 'image',
          source: { type: 'base64', media_type: imageType, data: base64 },
        });
      } else {
        // PDF or other document
        contentParts.push({
          type: 'document',
          source: { type: 'base64', media_type: 'application/pdf', data: base64 },
        } as Anthropic.DocumentBlockParam);
      }
    } catch { /* skip failed files */ }
  }

  // Call Claude
  const anthropic = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
    timeout: 120_000,
  });

  let painPoints: { title: string; description: string }[] = [];
  let triggerEvents: { title: string; description: string }[] = [];

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 4096,
      system: AI_PROMPT,
      messages: [{ role: 'user', content: contentParts }],
    });

    const raw = response.content[0]?.type === 'text' ? response.content[0].text : '';
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]) as {
        pain_points: { title: string; description: string }[];
        trigger_events: { title: string; description: string }[];
      };
      painPoints = (parsed.pain_points ?? []).slice(0, 10);
      triggerEvents = (parsed.trigger_events ?? []).slice(0, 10);
    }
  } catch (err) {
    console.error('Claude AI assist failed:', err);
    return NextResponse.json({ error: 'AI analysis failed. Please try again.' }, { status: 500 });
  }

  // Increment usage count
  usage.count += 1;
  await saveUsage(usage);

  return NextResponse.json({
    painPoints,
    triggerEvents,
    remaining: Math.max(0, MONTHLY_LIMIT - usage.count),
  });
}
