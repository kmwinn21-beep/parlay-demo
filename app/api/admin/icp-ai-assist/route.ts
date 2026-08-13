import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { requireAdmin } from '@/lib/auth';
import { getDb } from '@/lib/getDb';

// Built per-request so the account's own configuration can be interpolated in.
// The uploaded documents and scraped link text are NOT part of this string —
// they travel separately as the user message's content blocks, unchanged.
function buildAiPrompt(context: IcpAssistContext): string {
  const contextSections = joinContextSections(context);

  const degradationNote = contextSections
    ? ''
    : '\nNo account-specific context has been configured yet — proceed using only the uploaded material.\n';

  return `You are a Chief Marketing Officer analyzing your own company's product and
marketing materials to build an Ideal Customer Profile.

${contextSections}
${degradationNote}
If some but not all of the context above is present, that simply means this
account hasn't fully configured it yet — proceed with what's available, and
do not treat the absence of any single piece of context as evidence about
the vendor.

---

Review the provided information — which may include your website, product
pages, case studies, pitch decks, press releases, or other materials
describing what your product or service does — and infer two things about
the CUSTOMERS this product is built for:

---

**PAIN POINTS** (5–10 items)
Operational or strategic problems a customer likely has that this product or
service addresses. If vendor context is provided above, ground every pain
point in what that context says the product actually does — do not infer
problems unrelated to what the vendor sells. If no vendor context is
provided, infer this from the uploaded material's own descriptions of
features, outcomes, and use cases. Consider:
- Inefficiencies or manual processes the product replaces or automates
- Resource, staffing, or capacity constraints the product helps offset
- Technology or process gaps the product fills
- Cost, margin, or ROI pressures the product addresses
- Compliance, risk, or regulatory exposure the product reduces
- Customer acquisition, retention, or competitive pressures the product helps with
- Visibility, coordination, or decision-making gaps the product closes

Frame each pain point from the customer's perspective — the problem they
have before adopting this product — not a description of the product's
features.

---

**TRIGGER EVENTS** (5–10 items)
Signals in a prospect's business that would indicate they are ready to
evaluate a solution like this one. Base these on who the materials (and any
vendor context above) suggest this product is built for, and what
situations make the product newly relevant or urgent. Consider:
- Growth, expansion, or scaling milestones that create the problem this
  product solves
- New hires or leadership changes in roles connected to this product's use case
- Funding, restructuring, or budget changes that enable a purchase like this
- Process breakdowns or missed targets tied to the gap this product fills
- Competitive or market pressure that makes this product's value more urgent
- Compliance or regulatory changes that increase the need for this product

Frame each trigger event as something happening in a PROSPECT's environment
— not in the uploading company's own environment.

---

Be specific to what you can actually observe in the provided materials. Do
not fabricate details not visible in the information/documents provided. If
a pain point or trigger is inferred rather than explicitly stated, note it
as inferred.

Return ONLY valid JSON in this exact structure — no markdown, no explanation,
just JSON:
{
  "pain_points": [
    {"title": "Short 2-5 word title", "description": "One sentence describing the specific problem a customer likely has, based on what this product/service addresses."},
    ...
  ],
  "trigger_events": [
    {"title": "Short 2-5 word title", "description": "One sentence describing the signal in a prospect's business and why it indicates readiness to evaluate this product."},
    ...
  ]
}`;
}

const MONTHLY_LIMIT = 5;

// Deliberate token-budget cap. The uploaded documents already dominate the
// request, so the product catalog is capped rather than allowed to grow with
// the account's config. Products are taken in the same `sort_order, value`
// order that /api/config returns them in, so the cap keeps whatever the admin
// sorted to the top.
const MAX_CONTEXT_PRODUCTS = 20;

// Conservative character proxy for a few hundred tokens of assembled account
// context. Over this, the product catalog is trimmed (whole entries only) —
// see the context budget pass in buildIcpAssistContext.
const MAX_CONTEXT_CHARS = 2000;

// Analyzing a few PDFs through Claude routinely runs past the default function
// timeout; without this the platform kills the request and returns a non-JSON
// gateway error, which the client could only report as a generic failure.
export const maxDuration = 300;

// Kept in step with MAX_TOTAL_BYTES in components/IcpAiAssistModal.tsx. The
// platform rejects bodies over ~4.5 MB before this handler runs, so this is a
// backstop for direct callers rather than the primary guard.
const MAX_TOTAL_UPLOAD_BYTES = 4 * 1024 * 1024;

// ── Account context assembly ────────────────────────────────────────────────
// Each block is either ready-to-inject text or null. Nothing is ever emitted as
// a bare header with no body — a partially-configured account should read as
// "this wasn't set up" rather than "this is empty", since the model would
// otherwise treat an empty section as a statement about the vendor.
//
// Note this diverges from app/api/meetings/[id]/analyze/route.ts, which
// substitutes sentinel "No specific pain points configured…" strings instead of
// omitting. Omission is the better fit here: that route needs the model to keep
// hunting for signals regardless, whereas this one should simply say less when
// it knows less.
type IcpAssistContext = {
  vendorBlock: string | null;
  personaBlock: string | null;
  existingBlock: string | null;
};

/** Parse a site_settings value stored as a JSON array of plain strings. */
function parseStringArraySetting(val: string | undefined): string[] {
  if (!val) return [];
  try {
    const parsed = JSON.parse(val);
    if (Array.isArray(parsed)) return parsed.map(String).map(s => s.trim()).filter(Boolean);
  } catch { /* ignore */ }
  return [];
}

/** Parse a site_settings value stored as a JSON array of { title, description }. */
function parseTitleArraySetting(val: string | undefined): string[] {
  if (!val) return [];
  try {
    const parsed = JSON.parse(val) as Array<{ title?: string }>;
    if (Array.isArray(parsed)) return parsed.map(p => (p?.title ?? '').trim()).filter(Boolean);
  } catch { /* ignore */ }
  return [];
}

/**
 * Concatenate the present blocks exactly as buildAiPrompt does. Shared so the
 * budget check below measures the same string that actually reaches Claude.
 */
function joinContextSections(context: IcpAssistContext): string {
  return [context.vendorBlock, context.personaBlock, context.existingBlock]
    .filter(Boolean)
    .join('\n\n');
}

/** Case-insensitive de-duplication that preserves first-seen casing and order. */
function dedupeByTitle(titles: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of titles) {
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
  }
  return out;
}

async function buildIcpAssistContext(
  dbClient: Awaited<ReturnType<typeof getDb>>
): Promise<IcpAssistContext> {
  const settings: Record<string, string> = {};
  try {
    // Single batched read, matching the WHERE key IN (...) pattern used by the
    // meeting analysis route. The four icp_*_points / icp_*_events keys are the
    // same ones /api/icp-config reads — queried directly here rather than via an
    // HTTP round-trip to our own API.
    const rows = await dbClient.execute({
      sql: `SELECT key, value FROM site_settings WHERE key IN (
              'company_info_name', 'tagline',
              'icp_use_case_description', 'icp_exclusion_description',
              'icp_decision_maker_titles', 'icp_target_titles',
              'icp_pain_points', 'icp_ai_pain_points',
              'icp_trigger_events', 'icp_ai_trigger_events'
            )`,
      args: [],
    });
    for (const row of rows.rows) settings[String(row.key)] = String(row.value ?? '');
  } catch { /* ignore — an unconfigured account yields all-null blocks */ }

  // ── Vendor block ──
  const vendorLines: string[] = [];
  const companyName = (settings['company_info_name'] ?? '').trim();
  const tagline = (settings['tagline'] ?? '').trim();
  const useCase = (settings['icp_use_case_description'] ?? '').trim();
  const exclusions = (settings['icp_exclusion_description'] ?? '').trim();

  if (companyName) vendorLines.push(`Company: ${companyName}`);
  if (tagline) vendorLines.push(`Positioning: ${tagline}`);
  if (useCase) vendorLines.push(`Ideal customer and why they bought: ${useCase}`);
  if (exclusions) vendorLines.push(`Explicitly not a fit: ${exclusions}`);

  let productLines: string[] = [];
  try {
    const productRows = await dbClient.execute({
      sql: `SELECT value, description, metadata FROM config_options
            WHERE category = 'products' ORDER BY sort_order, value`,
      args: [],
    });
    productLines = productRows.rows
      .filter(r => {
        // `active` lives inside the metadata JSON, not a column, and absence
        // means active (parseMeta in ProductsSolutionsTab uses active !== false).
        try {
          const meta = r.metadata ? JSON.parse(String(r.metadata)) as { active?: boolean } : null;
          return meta?.active !== false;
        } catch { return true; }
      })
      .slice(0, MAX_CONTEXT_PRODUCTS)
      .map(r => {
        const name = String(r.value ?? '').trim();
        if (!name) return '';
        // No admin UI currently writes `description` for category='products'
        // (only for 'product_category'), so this falls back to the bare name
        // rather than dropping the product entirely — the name alone still
        // tells the model what is sold.
        const description = String(r.description ?? '').trim();
        return description ? `- ${name}: ${description}` : `- ${name}`;
      })
      .filter(Boolean);
  } catch { /* ignore — treat as no catalog */ }

  // Composed as a function rather than a value so the budget pass below can
  // rebuild the block with fewer products without re-querying.
  const composeVendorBlock = (products: string[]): string | null => {
    const lines = [...vendorLines];
    if (products.length > 0) {
      lines.push(`Products and services offered:\n${products.join('\n')}`);
    }
    return lines.length > 0
      ? `VENDOR CONTEXT — this is the company whose materials you are analyzing:\n${lines.join('\n')}`
      : null;
  };

  // ── Persona block ──
  const decisionMakerTitles = parseStringArraySetting(settings['icp_decision_maker_titles']);
  const targetTitles = parseStringArraySetting(settings['icp_target_titles']);
  const personaLines: string[] = [];
  if (decisionMakerTitles.length > 0) {
    personaLines.push(`Decision-maker titles: ${decisionMakerTitles.join(', ')}`);
  }
  if (targetTitles.length > 0) {
    personaLines.push(`Other target titles: ${targetTitles.join(', ')}`);
  }
  const personaBlock = personaLines.length > 0
    ? `BUYING COMMITTEE — the roles this product is sold to:\n${personaLines.join('\n')}`
    : null;

  // ── Existing context block ──
  // Manual and AI-sourced entries are merged the same way /api/icp-config merges
  // them; the two sources are not distinguishable once combined, so dedupe runs
  // across the whole list. Titles only — descriptions would bloat the block.
  const existingPainPoints = dedupeByTitle([
    ...parseStringArraySetting(settings['icp_pain_points']),
    ...parseTitleArraySetting(settings['icp_ai_pain_points']),
  ]);
  const existingTriggerEvents = dedupeByTitle([
    ...parseStringArraySetting(settings['icp_trigger_events']),
    ...parseTitleArraySetting(settings['icp_ai_trigger_events']),
  ]);

  const existingLines: string[] = [];
  if (existingPainPoints.length > 0) {
    existingLines.push(`Pain points already configured:\n${existingPainPoints.map(t => `- ${t}`).join('\n')}`);
  }
  if (existingTriggerEvents.length > 0) {
    existingLines.push(`Trigger events already configured:\n${existingTriggerEvents.map(t => `- ${t}`).join('\n')}`);
  }
  const existingBlock = existingLines.length > 0
    ? `ALREADY CONFIGURED — avoid restating these; surface what is missing:\n${existingLines.join('\n\n')}`
    : null;

  // ── Context budget ──
  // The uploaded documents already dominate the request, so keep the assembled
  // context modest. Only the product catalog is trimmed, and only whole entries
  // at a time — a half-truncated product description would read as a fact about
  // the product. The persona and existing-context blocks are short by
  // construction and are never trimmed.
  let includedProducts = productLines;
  let context: IcpAssistContext = {
    vendorBlock: composeVendorBlock(includedProducts),
    personaBlock,
    existingBlock,
  };

  if (joinContextSections(context).length > MAX_CONTEXT_CHARS && includedProducts.length > 0) {
    const originalCount = includedProducts.length;
    while (includedProducts.length > 0 && joinContextSections(context).length > MAX_CONTEXT_CHARS) {
      includedProducts = includedProducts.slice(0, -1);
      context = { ...context, vendorBlock: composeVendorBlock(includedProducts) };
    }
    console.warn(
      `ICP AI assist: assembled context exceeded ${MAX_CONTEXT_CHARS} chars — product catalog trimmed from ${originalCount} to ${includedProducts.length} entries.`
    );
  }

  const finalLength = joinContextSections(context).length;
  if (finalLength > MAX_CONTEXT_CHARS) {
    // Nothing left that is safe to trim; the remaining blocks are sent in full.
    console.warn(
      `ICP AI assist: context still ${finalLength} chars after dropping the product catalog (budget ${MAX_CONTEXT_CHARS}). Sending as-is.`
    );
  }

  return context;
}

async function getUsage(dbClient: Awaited<ReturnType<typeof getDb>>): Promise<{ count: number; month: string }> {
  const currentMonth = new Date().toISOString().slice(0, 7);
  try {
    const row = await dbClient.execute({
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

async function saveUsage(dbClient: Awaited<ReturnType<typeof getDb>>, usage: { count: number; month: string }) {
  await dbClient.execute({
    sql: `INSERT OR REPLACE INTO site_settings (key, value) VALUES ('icp_ai_usage', ?)`,
    args: [JSON.stringify(usage)],
  });
}

export async function GET(request: NextRequest) {
  const authResult = await requireAdmin(request);
  if (authResult instanceof NextResponse) return authResult;
  const db = await getDb(authResult?.accountId);
  const usage = await getUsage(db);
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

  const usage = await getUsage(db);
  if (usage.count >= MONTHLY_LIMIT) {
    return NextResponse.json(
      { error: `Monthly limit of ${MONTHLY_LIMIT} analyses reached. Resets on the 1st of each month.` },
      { status: 429 }
    );
  }

  // A truncated or oversized upload makes formData() throw. Catch it so the
  // client gets JSON it can read rather than an unparseable platform error.
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch (err) {
    console.error('ICP AI assist: failed to parse upload', err);
    return NextResponse.json(
      { error: 'Could not read the uploaded files. They may be too large — try fewer or smaller documents.' },
      { status: 413 }
    );
  }

  const links = (formData.getAll('links') as string[]).filter(l => l.trim());
  const files = (formData.getAll('files') as File[]).slice(0, 5);

  if (links.length === 0 && files.length === 0) {
    return NextResponse.json({ error: 'Please provide at least one link or document.' }, { status: 400 });
  }

  const totalUploadBytes = files.reduce((sum, f) => sum + (f.size ?? 0), 0);
  if (totalUploadBytes > MAX_TOTAL_UPLOAD_BYTES) {
    return NextResponse.json(
      { error: 'Your documents exceed the 4.0 MB upload limit. Remove a file or upload a smaller version.' },
      { status: 413 }
    );
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

  // Ground the prompt in whatever the account has configured. Any block the
  // account hasn't filled in comes back null and is omitted entirely.
  const assistContext = await buildIcpAssistContext(db);
  const systemPrompt = buildAiPrompt(assistContext);

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
      system: systemPrompt,
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
    // Surface the provider's reason (page-count limits, unreadable PDF, etc.)
    // instead of a blanket failure — these are usually user-fixable.
    const detail = err instanceof Error ? err.message : '';
    return NextResponse.json(
      { error: detail ? `AI analysis failed: ${detail}` : 'AI analysis failed. Please try again.' },
      { status: 500 }
    );
  }

  // Increment usage count
  usage.count += 1;
  await saveUsage(db, usage);

  return NextResponse.json({
    painPoints,
    triggerEvents,
    remaining: Math.max(0, MONTHLY_LIMIT - usage.count),
  });
}
