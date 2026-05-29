import Anthropic from '@anthropic-ai/sdk';

export interface CompanyIntelInput {
  companyName: string;
  companyType: string | null;
  industry: string | null;
  wse: number | null;
  tier: string;
  attendees: { first_name: string; last_name: string; title: string | null; seniority: string | null }[];
  repNames: string[];
  icpPainPoints: string[];
  icpTriggerEvents: string[];
  companyInfoName: string | null;
  companyInfoIndustries: string | null;
}

export interface CompanyIntelBatchInput {
  company_id: number;
  company_name: string;
  company_type: string | null;
  industry: string | null;
  wse: number | null;
  tier: string;
  attendees: { first_name: string; last_name: string; title: string | null; seniority: string | null }[];
  repNames: string[];
}

export interface CompanyIntelResult {
  summary: string;
  pain_point_signals: string[];
  trigger_events: string[];
  buying_signals: string[];
  opening_angles: string[];
  used_icp_fallback: boolean;
}

const client = new Anthropic();

const SYSTEM_PROMPT = `You are a senior sales intelligence analyst embedded in a conference relationship management platform. Your job is to analyze companies attending an upcoming conference and surface actionable intelligence for sales reps. Focus on how each company fits the ICP and what specific angles the reps should use. Be concise — reps have 60 seconds to read your output per company.`;

function buildSharedContext(
  icpPainPoints: string[],
  icpTriggerEvents: string[],
  companyInfoName: string | null,
  companyInfoIndustries: string | null,
  usedFallback: boolean,
): string {
  const painPoints = usedFallback && companyInfoIndustries
    ? [`Industry focus: ${companyInfoIndustries}`]
    : icpPainPoints;
  const triggerEvents = usedFallback && companyInfoIndustries
    ? [`Monitor changes in the ${companyInfoIndustries} space`]
    : icpTriggerEvents;

  return `${companyInfoName ? `Selling company: ${companyInfoName}\n` : ''}ICP Pain Points we solve:\n${painPoints.map(p => `- ${p}`).join('\n') || '- Not specified'}\n\nICP Trigger Events we watch for:\n${triggerEvents.map(t => `- ${t}`).join('\n') || '- Not specified'}`;
}

function fallbackResult(companyName: string, companyType: string | null, industry: string | null, usedIcpFallback: boolean): CompanyIntelResult {
  return {
    summary: `${companyName} is a ${companyType ?? 'company'} in the ${industry ?? 'unknown'} space.`,
    pain_point_signals: ['Insufficient data to identify specific signals.'],
    trigger_events: ['No specific trigger events identified.'],
    buying_signals: ['No specific buying signals identified.'],
    opening_angles: [`Ask about their current challenges in ${industry ?? 'their industry'}.`],
    used_icp_fallback: usedIcpFallback,
  };
}

// Single-company function — used by /intel/generate for per-card refresh
export async function generateCompanyIntel(input: CompanyIntelInput): Promise<CompanyIntelResult> {
  const usedIcpFallback = input.icpPainPoints.length === 0 || input.icpTriggerEvents.length === 0;
  const sharedCtx = buildSharedContext(input.icpPainPoints, input.icpTriggerEvents, input.companyInfoName, input.companyInfoIndustries, usedIcpFallback);

  const attendeeLines = input.attendees
    .map(a => `- ${a.first_name} ${a.last_name}${a.title ? `, ${a.title}` : ''}${a.seniority ? ` (${a.seniority})` : ''}`)
    .join('\n');

  const userPrompt = `${sharedCtx}

Using web search, research ${input.companyName} and return a JSON object with sales intelligence for a conference team:

Company: ${input.companyName}
Type: ${input.companyType ?? 'Unknown'}
Industry: ${input.industry ?? 'Unknown'}
Size (units/wse): ${input.wse ?? 'Unknown'}
Conference Tier: ${input.tier}
Reps Assigned: ${input.repNames.length > 0 ? input.repNames.join(', ') : 'None assigned'}

Attendees at this conference:
${attendeeLines || '- No attendees listed'}

Return ONLY valid JSON with exactly these fields:
{
  "summary": "2-3 sentence company overview focused on their current business situation and fit",
  "pain_point_signals": ["3-5 bullets: specific evidence this company has the pain points we solve"],
  "trigger_events": ["2-4 bullets: recent news, leadership changes, expansions, or regulatory changes relevant to us"],
  "buying_signals": ["2-4 bullets: specific signals indicating they may be in a buying position"],
  "opening_angles": ["2-3 bullets: specific conversation starters for reps meeting these attendees"]
}

If you cannot find specific information for a field, still include it with at least one bullet noting what is unknown or suggesting what to look for. Return ONLY valid JSON, no markdown.`;

  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 4096,
      tools: [{ type: 'web_search_20250305' as const, name: 'web_search' }],
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userPrompt }],
    });

    let rawText = '';
    for (const block of response.content) {
      if (block.type === 'text') rawText += block.text;
    }

    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error('[generateCompanyIntel] No JSON in response for', input.companyName, '| stop_reason:', response.stop_reason, '| rawText length:', rawText.length);
      return fallbackResult(input.companyName, input.companyType, input.industry, usedIcpFallback);
    }

    const parsed = JSON.parse(jsonMatch[0]) as {
      summary?: string;
      pain_point_signals?: string[];
      trigger_events?: string[];
      buying_signals?: string[];
      opening_angles?: string[];
    };

    return {
      summary: parsed.summary ?? '',
      pain_point_signals: parsed.pain_point_signals ?? [],
      trigger_events: parsed.trigger_events ?? [],
      buying_signals: parsed.buying_signals ?? [],
      opening_angles: parsed.opening_angles ?? [],
      used_icp_fallback: usedIcpFallback,
    };
  } catch (err) {
    console.error('[generateCompanyIntel] API error for', input.companyName, ':', err);
    return fallbackResult(input.companyName, input.companyType, input.industry, usedIcpFallback);
  }
}

// Batch function — used by /intel/generate-all for bulk generation
export async function generateCompanyIntelBatch(
  companies: CompanyIntelBatchInput[],
  shared: {
    icpPainPoints: string[];
    icpTriggerEvents: string[];
    companyInfoName: string | null;
    companyInfoIndustries: string | null;
  },
): Promise<Map<number, CompanyIntelResult>> {
  const usedIcpFallback = shared.icpPainPoints.length === 0 || shared.icpTriggerEvents.length === 0;
  const sharedCtx = buildSharedContext(shared.icpPainPoints, shared.icpTriggerEvents, shared.companyInfoName, shared.companyInfoIndustries, usedIcpFallback);

  const companyBlocks = companies.map(c => {
    const attendeeLines = c.attendees
      .map(a => `  - ${a.first_name} ${a.last_name}${a.title ? `, ${a.title}` : ''}${a.seniority ? ` (${a.seniority})` : ''}`)
      .join('\n');
    return `[company_id: ${c.company_id}]
Name: ${c.company_name}
Type: ${c.company_type ?? 'Unknown'} | Industry: ${c.industry ?? 'Unknown'} | Size: ${c.wse ?? 'Unknown'} units
Tier: ${c.tier} | Reps: ${c.repNames.length > 0 ? c.repNames.join(', ') : 'None'}
Attendees:
${attendeeLines || '  - None listed'}`;
  }).join('\n\n---\n\n');

  const userPrompt = `${sharedCtx}

Analyze the following ${companies.length} companies attending an upcoming conference. For each company, surface actionable sales intelligence based only on the data provided and your knowledge of similar companies.

${companyBlocks}

Return ONLY a valid JSON array — one entry per company, using the company_id to identify each:
[
  {
    "company_id": <number>,
    "summary": "2-3 sentence overview of their business situation and fit with our ICP",
    "pain_point_signals": ["2-4 bullets: specific reasons this company likely has the pain points we solve"],
    "trigger_events": ["1-3 bullets: business signals that make now a good time to engage"],
    "buying_signals": ["1-3 bullets: signals indicating they may be open to buying"],
    "opening_angles": ["1-2 bullets: specific conversation starters for reps meeting these attendees"]
  },
  ...
]`;

  const results = new Map<number, CompanyIntelResult>();

  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userPrompt }],
    });

    let rawText = '';
    for (const block of response.content) {
      if (block.type === 'text') rawText += block.text;
    }

    // Extract JSON array from response
    const jsonMatch = rawText.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      for (const c of companies) results.set(c.company_id, fallbackResult(c.company_name, c.company_type, c.industry, usedIcpFallback));
      return results;
    }

    const parsed = JSON.parse(jsonMatch[0]) as Array<{
      company_id?: number;
      summary?: string;
      pain_point_signals?: string[];
      trigger_events?: string[];
      buying_signals?: string[];
      opening_angles?: string[];
    }>;

    for (const item of parsed) {
      if (!item.company_id) continue;
      results.set(item.company_id, {
        summary: item.summary ?? '',
        pain_point_signals: item.pain_point_signals ?? [],
        trigger_events: item.trigger_events ?? [],
        buying_signals: item.buying_signals ?? [],
        opening_angles: item.opening_angles ?? [],
        used_icp_fallback: usedIcpFallback,
      });
    }
  } catch {
    // On total failure, fill with fallbacks
    for (const c of companies) {
      if (!results.has(c.company_id)) {
        results.set(c.company_id, fallbackResult(c.company_name, c.company_type, c.industry, usedIcpFallback));
      }
    }
  }

  // Fill any missing entries with fallbacks
  for (const c of companies) {
    if (!results.has(c.company_id)) {
      results.set(c.company_id, fallbackResult(c.company_name, c.company_type, c.industry, usedIcpFallback));
    }
  }

  return results;
}
