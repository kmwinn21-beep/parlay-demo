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

export interface CompanyIntelResult {
  summary: string;
  pain_point_signals: string[];
  trigger_events: string[];
  buying_signals: string[];
  opening_angles: string[];
  used_icp_fallback: boolean;
}

const client = new Anthropic();

export async function generateCompanyIntel(input: CompanyIntelInput): Promise<CompanyIntelResult> {
  const usedIcpFallback = input.icpPainPoints.length === 0 || input.icpTriggerEvents.length === 0;

  const painPoints = usedIcpFallback && input.companyInfoIndustries
    ? [`Industry focus: ${input.companyInfoIndustries}`]
    : input.icpPainPoints;

  const triggerEvents = usedIcpFallback && input.companyInfoIndustries
    ? [`Monitor changes in the ${input.companyInfoIndustries} space`]
    : input.icpTriggerEvents;

  const attendeeLines = input.attendees
    .map(a => `- ${a.first_name} ${a.last_name}${a.title ? `, ${a.title}` : ''}${a.seniority ? ` (${a.seniority})` : ''}`)
    .join('\n');

  const systemPrompt = `You are a senior sales intelligence analyst. Your job is to research a company attending an upcoming conference and surface actionable intelligence for a sales team. Focus on specific, verifiable signals. Be concise and direct — sales reps have 60 seconds to read your output.`;

  const userPrompt = `Research this company for a conference sales team:

Company: ${input.companyName}
Type: ${input.companyType ?? 'Unknown'}
Industry: ${input.industry ?? 'Unknown'}
Size (units): ${input.wse ?? 'Unknown'}
Conference Tier: ${input.tier}
Reps Assigned: ${input.repNames.length > 0 ? input.repNames.join(', ') : 'None assigned'}

Attendees at this conference:
${attendeeLines || '- No attendees listed'}

ICP Pain Points we solve:
${painPoints.map(p => `- ${p}`).join('\n') || '- Not specified'}

ICP Trigger Events we watch for:
${triggerEvents.map(t => `- ${t}`).join('\n') || '- Not specified'}

Using web search, research ${input.companyName} and return a JSON object with exactly these fields:
{
  "summary": "2-3 sentence company overview focused on their current business situation and relevance to us",
  "pain_point_signals": ["3-5 bullet strings: specific evidence this company has the pain points we solve"],
  "trigger_events": ["2-4 bullet strings: recent news, leadership changes, expansions, or regulatory changes relevant to us"],
  "buying_signals": ["2-4 bullet strings: specific signals indicating they may be in a buying position"],
  "opening_angles": ["2-3 bullet strings: specific conversation starters for reps meeting these attendees"]
}

If you cannot find specific information for a field, still provide the field with at least one bullet noting what is unknown or suggesting what to look for. Return ONLY valid JSON, no markdown.`;

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    tools: [{ type: 'web_search_20250305' as const, name: 'web_search' }],
    messages: [
      { role: 'user', content: userPrompt },
    ],
    system: systemPrompt,
  });

  // Extract text from response
  let rawText = '';
  for (const block of response.content) {
    if (block.type === 'text') {
      rawText += block.text;
    }
  }

  // Parse JSON from response
  const jsonMatch = rawText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    return {
      summary: `${input.companyName} is a ${input.companyType ?? 'company'} in the ${input.industry ?? 'unknown'} space.`,
      pain_point_signals: ['Unable to retrieve specific signals at this time.'],
      trigger_events: ['No recent trigger events found.'],
      buying_signals: ['No specific buying signals identified.'],
      opening_angles: [`Ask about their current challenges in ${input.industry ?? 'their industry'}.`],
      used_icp_fallback: usedIcpFallback,
    };
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
}
