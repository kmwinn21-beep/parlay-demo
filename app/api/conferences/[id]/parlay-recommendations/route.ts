import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { db, dbReady } from '@/lib/db';
import Anthropic from '@anthropic-ai/sdk';

export const maxDuration = 120;

export interface ParlayRec {
  company_name: string;
  company_id: number | null;
  relationship_status: 'New' | 'Warming' | 'Active' | 'Strong';
  why_target: string[];
  who_to_talk_to: { name: string; title: string; angle: string }[];
  suggested_opening_angle: string;
  priority: 'High' | 'Medium' | 'Watch';
  attendees: { id: number; first_name: string; last_name: string; title: string | null; seniority: string | null }[];
  rep_names: string[];
  health_score: number;
}

export interface ParlayWatchItem { company_name: string; reason: string; }

export interface ParlayRecsData {
  recommendations: ParlayRec[];
  watch_list: ParlayWatchItem[];
  exclusions: ParlayWatchItem[];
  generated_at: string;
  reload_count: number;
}

const SYSTEM_PROMPT = `You are a senior sales intelligence analyst embedded in a conference relationship management platform for the senior housing and care industry. Your job is to analyze attendee data from an upcoming conference, cross-reference it with the user's ICP profile and existing relationship history, and return a prioritized list of prospect targets with clear, scannable reasoning for each.

You will be given:
1. The user's ICP configuration — company criteria, buyer persona, pain points, trigger events, and engagement thresholds
2. A list of companies attending the conference with their attendees, titles, and seniority
3. Existing relationship data from the database — health scores, touchpoint history, meeting history, notes, and follow-up completion rates

For each recommended company, draw on your knowledge of the senior housing and care industry to surface trigger events or buying signals that are specifically relevant to the pain points and trigger events listed in the ICP configuration you are given. Focus your research on those exact signals — e.g. if the ICP lists "leadership change" as a trigger, look for recent leadership changes at that company. Every recommendation must include exactly one bullet dedicated to this — if no relevant signals are known, that bullet must say exactly: "No relevant trigger events, news or buying signals."

Your output must be direct, specific, and written for a sales rep who has 90 seconds to scan it before walking into a conference. Do not use filler language. Do not summarize what you were given. Just tell them who to talk to and why.`;

const MAX_RELOADS = 5;

function settingsKey(confId: number) {
  return `parlay_recs_${confId}`;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;

  const { id } = await params;
  const confId = parseInt(id, 10);
  if (isNaN(confId)) return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });

  await dbReady;

  const row = await db.execute({
    sql: 'SELECT value FROM site_settings WHERE key = ?',
    args: [settingsKey(confId)],
  });

  if (row.rows.length === 0) return NextResponse.json({ data: null });

  try {
    const data = JSON.parse(String(row.rows[0].value)) as ParlayRecsData;
    return NextResponse.json({ data });
  } catch {
    return NextResponse.json({ data: null });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'AI service not configured' }, { status: 503 });
  }

  const { id } = await params;
  const confId = parseInt(id, 10);
  if (isNaN(confId)) return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });

  await dbReady;

  // Check reload count
  const existingRow = await db.execute({
    sql: 'SELECT value FROM site_settings WHERE key = ?',
    args: [settingsKey(confId)],
  });
  let existingReloadCount = 0;
  if (existingRow.rows.length > 0) {
    try {
      const existing = JSON.parse(String(existingRow.rows[0].value)) as ParlayRecsData;
      existingReloadCount = existing.reload_count ?? 0;
    } catch { /* ignore */ }
  }
  if (existingReloadCount >= MAX_RELOADS) {
    return NextResponse.json({ error: 'Maximum regenerations reached' }, { status: 429 });
  }

  // Fetch all needed data in parallel
  const [
    confRow,
    settingsRow,
    attendeesRow,
    icpRulesRow,
    userOptsRow,
    relStatusOptsRow,
    internalRelsRow,
  ] = await Promise.all([
    db.execute({
      sql: 'SELECT id, name, start_date, location FROM conferences WHERE id = ?',
      args: [confId],
    }),
    db.execute({
      sql: "SELECT key, value FROM site_settings WHERE key LIKE 'icp_%'",
      args: [],
    }),
    db.execute({
      sql: `SELECT a.id, a.first_name, a.last_name, a.title, a.seniority,
                   c.id as company_id, c.name as company_name, c.company_type,
                   c.wse, c.services, c.icp, c.assigned_user
            FROM attendees a
            JOIN conference_attendees ca ON a.id = ca.attendee_id AND ca.conference_id = ?
            LEFT JOIN companies c ON a.company_id = c.id
            ORDER BY c.name, a.last_name, a.first_name`,
      args: [confId],
    }),
    db.execute({
      sql: `SELECT r.id, r.category, c.option_value, c.operator
            FROM icp_rules r
            JOIN icp_rule_conditions c ON c.rule_id = r.id`,
      args: [],
    }),
    db.execute({ sql: `SELECT id, value FROM config_options WHERE category = 'user'`, args: [] }),
    db.execute({ sql: `SELECT id, value FROM config_options WHERE category = 'rep_relationship_type'`, args: [] }),
    db.execute({
      sql: `SELECT ir.company_id, ir.rep_ids, ir.relationship_status, ir.description
            FROM internal_relationships ir`,
      args: [],
    }),
  ]);

  if (confRow.rows.length === 0) {
    return NextResponse.json({ error: 'Conference not found' }, { status: 404 });
  }

  const conference = confRow.rows[0];
  const attendees = attendeesRow.rows;

  // Build lookup maps
  const userNameMap = new Map<number, string>();
  for (const row of userOptsRow.rows) userNameMap.set(Number(row.id), String(row.value));

  const relStatusMap = new Map<number, string>();
  for (const row of relStatusOptsRow.rows) relStatusMap.set(Number(row.id), String(row.value));

  // Parse ICP settings
  const icpSettings: Record<string, string> = {};
  for (const row of settingsRow.rows) icpSettings[String(row.key)] = String(row.value);

  const tryParseJson = <T,>(v: string | undefined, fallback: T): T => {
    try { return v ? JSON.parse(v) as T : fallback; } catch { return fallback; }
  };

  // Group attendees by company
  const companyMap = new Map<number, {
    company_id: number;
    company_name: string;
    company_type: string | null;
    wse: number | null;
    services: string | null;
    icp: string | null;
    attendees: { id: number; first_name: string; last_name: string; title: string | null; seniority: string | null }[];
  }>();

  for (const a of attendees) {
    if (!a.company_id) continue;
    const cid = Number(a.company_id);
    if (!companyMap.has(cid)) {
      companyMap.set(cid, {
        company_id: cid,
        company_name: String(a.company_name ?? ''),
        company_type: a.company_type ? String(a.company_type) : null,
        wse: a.wse != null ? Number(a.wse) : null,
        services: a.services ? String(a.services) : null,
        icp: a.icp ? String(a.icp) : null,
        attendees: [],
      });
    }
    companyMap.get(cid)!.attendees.push({
      id: Number(a.id),
      first_name: String(a.first_name),
      last_name: String(a.last_name),
      title: a.title ? String(a.title) : null,
      seniority: a.seniority ? String(a.seniority) : null,
    });
  }

  const companyIds = Array.from(companyMap.keys());

  // Fetch per-company relationship data, health data, notes in parallel
  const [metricsRow, notesRow, lastConfRow] = await Promise.all([
    companyIds.length > 0
      ? db.execute({
          sql: `SELECT a.company_id,
                       COUNT(DISTINCT m.id) as meeting_count,
                       COUNT(DISTINCT tp.id) as touchpoint_count,
                       SUM(CASE WHEN f.completed = 0 THEN 1 ELSE 0 END) as open_followups
                FROM attendees a
                JOIN conference_attendees ca ON a.id = ca.attendee_id AND ca.conference_id = ?
                LEFT JOIN meetings m ON m.attendee_id = a.id
                LEFT JOIN attendee_touchpoints tp ON tp.attendee_id = a.id
                LEFT JOIN follow_ups f ON f.attendee_id = a.id
                WHERE a.company_id IN (${companyIds.map(() => '?').join(',')})
                GROUP BY a.company_id`,
          args: [confId, ...companyIds],
        })
      : Promise.resolve({ rows: [] }),
    companyIds.length > 0
      ? db.execute({
          sql: `SELECT entity_id as company_id, content, created_at
                FROM entity_notes
                WHERE entity_type = 'company' AND entity_id IN (${companyIds.map(() => '?').join(',')})
                ORDER BY created_at DESC`,
          args: companyIds,
        })
      : Promise.resolve({ rows: [] }),
    companyIds.length > 0
      ? db.execute({
          sql: `SELECT a.company_id, MAX(c.start_date) as last_conf_date, c.name as last_conf_name
                FROM conference_attendees ca2
                JOIN conferences c ON ca2.conference_id = c.id
                JOIN attendees a ON ca2.attendee_id = a.id
                WHERE ca2.conference_id != ? AND a.company_id IN (${companyIds.map(() => '?').join(',')})
                GROUP BY a.company_id
                ORDER BY last_conf_date DESC`,
          args: [confId, ...companyIds],
        })
      : Promise.resolve({ rows: [] }),
  ]);

  // Build per-company metrics
  const metricsMap = new Map<number, { meeting_count: number; touchpoint_count: number; open_followups: number }>();
  for (const row of metricsRow.rows) {
    metricsMap.set(Number(row.company_id), {
      meeting_count: Number(row.meeting_count ?? 0),
      touchpoint_count: Number(row.touchpoint_count ?? 0),
      open_followups: Number(row.open_followups ?? 0),
    });
  }

  // Latest note per company
  const latestNoteMap = new Map<number, string>();
  for (const row of notesRow.rows) {
    const cid = Number(row.company_id);
    if (!latestNoteMap.has(cid)) latestNoteMap.set(cid, String(row.content ?? '').slice(0, 200));
  }

  // Last conference per company
  const lastConfMap = new Map<number, string>();
  for (const row of lastConfRow.rows) {
    const cid = Number(row.company_id);
    if (!lastConfMap.has(cid)) lastConfMap.set(cid, String(row.last_conf_name ?? ''));
  }

  // Internal relationships: rep names + status
  const irByCompany = new Map<number, { rep_names: string[]; rel_status: string; description: string }>();
  for (const row of internalRelsRow.rows) {
    const cid = Number(row.company_id);
    if (!companyMap.has(cid)) continue;
    const repIds = String(row.rep_ids ?? '').split(',').map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n));
    const repNames = repIds.map(rid => userNameMap.get(rid) ?? '').filter(Boolean);
    const statusRaw = row.relationship_status;
    const statusNum = statusRaw ? parseInt(String(statusRaw), 10) : NaN;
    const statusLabel = !isNaN(statusNum) && relStatusMap.has(statusNum)
      ? relStatusMap.get(statusNum)!
      : statusRaw ? String(statusRaw) : '';
    if (!irByCompany.has(cid)) {
      irByCompany.set(cid, { rep_names: repNames, rel_status: statusLabel, description: String(row.description ?? '') });
    } else {
      const existing = irByCompany.get(cid)!;
      existing.rep_names.push(...repNames.filter(n => !existing.rep_names.includes(n)));
    }
  }

  // Build ICP rule summary for prompt
  const icpRulesByCategory = new Map<string, string[]>();
  for (const row of icpRulesRow.rows) {
    const cat = String(row.category);
    if (!icpRulesByCategory.has(cat)) icpRulesByCategory.set(cat, []);
    icpRulesByCategory.get(cat)!.push(String(row.option_value));
  }
  const icpCompanyTypes = icpRulesByCategory.get('company_type')?.join(', ') || 'Not specified';
  const icpServices = icpRulesByCategory.get('services')?.join(', ') || 'Not specified';

  // Build WSE range string
  const unitTypeOp = icpSettings['icp_unit_type_operator'] || '';
  const unitTypeV1 = icpSettings['icp_unit_type_value1'] || '';
  const unitTypeV2 = icpSettings['icp_unit_type_value2'] || '';
  const wseRange = unitTypeOp
    ? unitTypeOp === 'between' ? `${unitTypeV1}–${unitTypeV2}` : `${unitTypeOp} ${unitTypeV1}`
    : 'Not specified';

  // Only evaluate companies that meet the ICP criteria; sort by relationship health score
  const companiesSorted = Array.from(companyMap.values())
    .filter(c => c.icp === 'Yes')
    .sort((a, b) => {
      const aMetrics = metricsMap.get(a.company_id);
      const bMetrics = metricsMap.get(b.company_id);
      const aScore = Math.min(((aMetrics?.meeting_count ?? 0) * 25 + (aMetrics?.touchpoint_count ?? 0) * 10), 100);
      const bScore = Math.min(((bMetrics?.meeting_count ?? 0) * 25 + (bMetrics?.touchpoint_count ?? 0) * 10), 100);
      return bScore - aScore;
    });

  const companiesBlock = companiesSorted.map(company => {
    const metrics = metricsMap.get(company.company_id);
    const healthScore = Math.min(((metrics?.meeting_count ?? 0) * 25 + (metrics?.touchpoint_count ?? 0) * 10), 100);
    const ir = irByCompany.get(company.company_id);
    const latestNote = latestNoteMap.get(company.company_id) || 'None';
    const lastConf = lastConfMap.get(company.company_id) || 'None on record';
    const attendeeLines = company.attendees.map(a =>
      `- ${a.first_name} ${a.last_name}${a.title ? `, ${a.title}` : ''}${a.seniority ? ` (${a.seniority})` : ''}`
    ).join('\n');

    return `### ${company.company_name}
- Type: ${company.company_type ?? 'Unknown'}
- WSE: ${company.wse ?? 'Unknown'}
- Services: ${company.services ?? 'Unknown'}
- ICP: ${company.icp ?? 'Unknown'}
- Relationship health score: ${healthScore}
- Prior touchpoints: ${metrics?.touchpoint_count ?? 0}
- Last conference engaged: ${lastConf}
- Open follow-ups: ${metrics?.open_followups ?? 0}
- Rep notes: ${latestNote}
${ir ? `- Relationship status: ${ir.rel_status}\n- Relationship description: ${ir.description}` : ''}

**Attending contacts:**
${attendeeLines || 'No contacts listed'}`;
  }).join('\n\n');

  // Build ICP profile section
  const icpPainPoints = tryParseJson<string[]>(icpSettings['icp_pain_points'], []);
  const icpTriggerEvents = tryParseJson<string[]>(icpSettings['icp_trigger_events'], []);
  const icpTargetTitles = tryParseJson<string[]>(icpSettings['icp_target_titles'], []);
  const icpDecisionMakers = tryParseJson<string[]>(icpSettings['icp_decision_maker_titles'], []);
  const icpInfluencers = tryParseJson<string[]>(icpSettings['icp_influencer_titles'], []);
  const icpSeniorityPriority = tryParseJson<Record<string, string>>(icpSettings['icp_seniority_priority'], {});

  const seniorityPriorityText = Object.entries(icpSeniorityPriority)
    .map(([level, priority]) => `  - ${level}: ${priority}`)
    .join('\n') || '  Not configured';

  const confName = String(conference.name ?? '');
  const confDate = String(conference.start_date ?? 'TBD');
  const confLocation = String(conference.location ?? 'TBD');

  const userPrompt = `## Conference
Name: ${confName}
Date: ${confDate}
Location: ${confLocation}

---

## ICP Profile

**Company criteria:**
- Types: ${icpCompanyTypes}
- WSE range: ${wseRange}
- Services: ${icpServices}

**Ideal buyer persona:**
- Target titles: ${icpTargetTitles.join(', ') || 'Not specified'}
- Decision makers: ${icpDecisionMakers.join(', ') || 'Not specified'}
- Influencers: ${icpInfluencers.join(', ') || 'Not specified'}
- Seniority priority:
${seniorityPriorityText}

**Pain points we solve:**
${icpPainPoints.map(p => `- ${p}`).join('\n') || 'Not specified'}

**Trigger events we look for:**
${icpTriggerEvents.map(t => `- ${t}`).join('\n') || 'Not specified'}

**Ideal use case:**
${icpSettings['icp_use_case_description'] || 'Not specified'}

**What we are not a fit for:**
${icpSettings['icp_exclusion_description'] || 'Not specified'}

**Engagement thresholds:**
- Recommend active outreach at health score >= ${icpSettings['icp_pursuit_score'] ?? '50'}
- Consider warm relationship at health score >= ${icpSettings['icp_warm_score'] ?? '75'}
- Minimum prior touchpoints before active pursuit: ${icpSettings['icp_min_touchpoints'] ?? '1'}
- Include companies with no prior history: ${icpSettings['icp_include_new_companies'] ?? 'true'}

---

## Attending Companies & Contacts

${companiesBlock}

---

## Output Format

Return ONLY a valid JSON object (no markdown fences, no preamble, no explanation):
{
  "recommendations": [
    {
      "company_name": "string — exact match to the company name provided above",
      "relationship_status": "New | Warming | Active | Strong",
      "why_target": [
        "string — ICP fit or relationship reason (e.g. company type, size, services match)",
        "string — engagement opportunity based on attendee seniority, prior touchpoints, or open follow-ups",
        "string — trigger events or buying signals matching the ICP pain points and trigger events listed above: write a specific 1-sentence finding (e.g. 'Recently hired a new VP of Operations, a key trigger event for this ICP') OR exactly 'No relevant trigger events, news or buying signals'"
      ],
      "who_to_talk_to": [{ "name": "string", "title": "string", "angle": "string — one sentence on why this person and how to open" }],
      "suggested_opening_angle": "string — one to two sentences, specific and non-generic, say-out-loud-ready",
      "priority": "High | Medium | Watch"
    }
  ],
  "watch_list": [{ "company_name": "string", "reason": "string — one sentence" }],
  "exclusions": [{ "company_name": "string", "reason": "string — one sentence" }]
}

Maximum 25 entries in recommendations. Rank High first, then Medium, then Watch. Within each tier rank by relationship health score descending.`;

  try {
    const anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
      timeout: 120_000, // 2 min
    });
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 8096,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userPrompt }],
    });

    const raw = message.content[0].type === 'text' ? message.content[0].text.trim() : '{}';
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    const clean = jsonMatch ? jsonMatch[0] : '{}';

    const parsed = JSON.parse(clean) as {
      recommendations: { company_name: string; relationship_status: string; why_target: string[]; who_to_talk_to: { name: string; title: string; angle: string }[]; suggested_opening_angle: string; priority: string }[];
      watch_list: { company_name: string; reason: string }[];
      exclusions: { company_name: string; reason: string }[];
    };

    // Augment recommendations with attendee IDs and rep names from DB
    const nameToCompany = new Map<string, typeof companiesSorted[0]>();
    for (const c of companiesSorted) {
      nameToCompany.set(c.company_name.toLowerCase().trim(), c);
    }

    const recommendations: ParlayRec[] = (parsed.recommendations ?? []).map(rec => {
      const match = nameToCompany.get(rec.company_name.toLowerCase().trim());
      const ir = match ? irByCompany.get(match.company_id) : undefined;
      const metrics = match ? metricsMap.get(match.company_id) : undefined;
      const healthScore = metrics
        ? Math.min((metrics.meeting_count * 25 + metrics.touchpoint_count * 10), 100)
        : 0;

      return {
        company_name: rec.company_name,
        company_id: match?.company_id ?? null,
        relationship_status: (['New', 'Warming', 'Active', 'Strong'].includes(rec.relationship_status)
          ? rec.relationship_status
          : 'New') as ParlayRec['relationship_status'],
        why_target: Array.isArray(rec.why_target) ? rec.why_target : [],
        who_to_talk_to: Array.isArray(rec.who_to_talk_to) ? rec.who_to_talk_to : [],
        suggested_opening_angle: rec.suggested_opening_angle ?? '',
        priority: (['High', 'Medium', 'Watch'].includes(rec.priority) ? rec.priority : 'Watch') as ParlayRec['priority'],
        attendees: match?.attendees ?? [],
        rep_names: ir?.rep_names ?? [],
        health_score: healthScore,
      };
    });

    const data: ParlayRecsData = {
      recommendations,
      watch_list: Array.isArray(parsed.watch_list) ? parsed.watch_list : [],
      exclusions: Array.isArray(parsed.exclusions) ? parsed.exclusions : [],
      generated_at: new Date().toISOString(),
      reload_count: existingReloadCount + 1,
    };

    await db.execute({
      sql: 'INSERT OR REPLACE INTO site_settings (key, value) VALUES (?, ?)',
      args: [settingsKey(confId), JSON.stringify(data)],
    });

    return NextResponse.json({ data });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('POST /api/conferences/[id]/parlay-recommendations error:', msg);
    return NextResponse.json({ error: msg || 'Failed to generate recommendations' }, { status: 500 });
  }
}
