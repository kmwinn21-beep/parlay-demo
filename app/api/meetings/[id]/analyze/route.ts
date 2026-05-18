import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getDb } from '@/lib/getDb';
import Anthropic from '@anthropic-ai/sdk';

const TIER_LABELS: Record<string, string> = {
  '1': 'Must Target',
  '2': 'High Priority',
  '3': 'Worth Engaging',
  'unassigned': 'Monitor',
};

const TIER_DESCRIPTIONS: Record<string, string> = {
  '1': 'Top priority prospect that closely matches ICP',
  '2': 'Strong fit, pursue actively',
  '3': 'Moderate fit, worthwhile to connect',
  'unassigned': 'Worth watching but not yet prioritized',
};

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const user = authResult;
  const db = await getDb(user.accountId);
  const { id } = await params;
  const meetingId = Number(id);

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'Analysis service not configured' }, { status: 503 });
  }

  try {
    const body = await request.json();
    const { audio_url, transcript_text } = body as { audio_url?: string | null; transcript_text?: string | null };

    if (!audio_url && !transcript_text) {
      return NextResponse.json({ error: 'audio_url or transcript_text is required' }, { status: 400 });
    }

    if (audio_url && !process.env.OPENAI_API_KEY) {
      return NextResponse.json({ error: 'Transcription service not configured' }, { status: 503 });
    }

    // Fetch meeting + context
    const meetingResult = await db.execute({
      sql: `SELECT m.id, m.attendee_id, m.conference_id, m.meeting_date, m.scheduled_by,
               a.first_name, a.last_name, a.title AS attendee_title,
               co.name AS company_name, co.icp AS company_icp,
               c.name AS conference_name,
               cad.tier AS tier, cad.relationship_status AS relationship_status
            FROM meetings m
            JOIN attendees a ON m.attendee_id = a.id
            LEFT JOIN companies co ON a.company_id = co.id
            JOIN conferences c ON m.conference_id = c.id
            LEFT JOIN conference_attendee_details cad ON m.attendee_id = cad.attendee_id AND m.conference_id = cad.conference_id
            WHERE m.id = ?`,
      args: [meetingId],
    });

    if (meetingResult.rows.length === 0) {
      return NextResponse.json({ error: 'Meeting not found' }, { status: 404 });
    }

    const mtg = meetingResult.rows[0];

    // Look up rep name from scheduled_by (first ID)
    let repName = 'Unknown Rep';
    let repTitle = '';
    if (mtg.scheduled_by) {
      const firstId = String(mtg.scheduled_by).split(',')[0].trim();
      if (firstId && !isNaN(Number(firstId))) {
        const repResult = await db.execute({
          sql: `SELECT first_name, last_name, title FROM users WHERE id = ?`,
          args: [Number(firstId)],
        });
        if (repResult.rows[0]) {
          repName = `${repResult.rows[0].first_name ?? ''} ${repResult.rows[0].last_name ?? ''}`.trim();
          repTitle = repResult.rows[0].title ? String(repResult.rows[0].title) : '';
        }
      }
    }

    interface WhisperSegment { text: string; start: number; end: number; }
    let segments: WhisperSegment[] = [];
    let transcriptForAnalysis: string;

    if (audio_url) {
      const audioResponse = await fetch(audio_url);
      if (!audioResponse.ok) {
        return NextResponse.json({ error: 'Failed to fetch audio file' }, { status: 400 });
      }
      const audioBuffer = await audioResponse.arrayBuffer();
      const audioBlob = new Blob([audioBuffer], { type: 'audio/webm' });
      const urlPath = new URL(audio_url).pathname;
      const ext = urlPath.split('.').pop() || 'webm';

      const whisperForm = new FormData();
      whisperForm.append('file', new File([audioBlob], `audio.${ext}`));
      whisperForm.append('model', 'whisper-1');
      whisperForm.append('response_format', 'verbose_json');

      const whisperResponse = await fetch('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
        body: whisperForm,
      });

      if (!whisperResponse.ok) {
        console.error('Whisper API error:', await whisperResponse.text());
        return NextResponse.json({ error: 'Transcription failed' }, { status: 502 });
      }

      const whisperData = await whisperResponse.json();
      segments = (whisperData.segments ?? []).map((s: WhisperSegment) => ({
        text: s.text, start: s.start, end: s.end,
      }));
      transcriptForAnalysis = segments.length > 0
        ? segments.map(s => `[${Math.floor(s.start)}s] ${s.text.trim()}`).join('\n')
        : (whisperData.text ?? '');
    } else {
      const lines = (transcript_text ?? '').split('\n').map(l => l.trim()).filter(Boolean);
      segments = lines.map((line, i) => ({ text: line, start: i * 5, end: (i + 1) * 5 }));
      transcriptForAnalysis = transcript_text ?? '';
    }

    // Fetch ICP settings
    const icpSettings = await db.execute({
      sql: `SELECT key, value FROM site_settings WHERE key IN ('icp_pain_points', 'icp_ai_pain_points')`,
      args: [],
    });

    let painPointsList = 'No specific pain points configured. Surface any explicitly stated business problems, operational challenges, cost pressures, or staffing issues.';
    let buyingSignalsList = 'No specific buying signals configured. Surface any signals of budget authority, timeline urgency, active vendor evaluation, executive sponsorship, or stated intent to purchase.';

    for (const row of icpSettings.rows) {
      const key = String(row.key);
      const val = String(row.value ?? '');
      try {
        if (key === 'icp_pain_points') {
          const parsed = JSON.parse(val);
          if (Array.isArray(parsed) && parsed.length > 0) {
            painPointsList = parsed.map(String).map(p => `- ${p}`).join('\n');
          }
        } else if (key === 'icp_ai_pain_points') {
          const parsed = JSON.parse(val) as Array<{ title?: string; description?: string }>;
          if (Array.isArray(parsed) && parsed.length > 0) {
            buyingSignalsList = parsed.map(p => p.title ? `- ${p.title}: ${p.description ?? ''}` : `- ${String(p)}`).join('\n');
          }
        }
      } catch { /* ignore */ }
    }

    const tier = mtg.tier ? String(mtg.tier) : 'unassigned';
    const tierLabel = TIER_LABELS[tier] ?? 'Monitor';
    const tierDesc = TIER_DESCRIPTIONS[tier] ?? 'Worth watching but not yet prioritized';
    const relationshipStatus = mtg.relationship_status ? String(mtg.relationship_status) : 'No prior relationship';
    const meetingDateStr = mtg.meeting_date
      ? new Date(`${mtg.meeting_date}T00:00:00`).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
      : 'Unknown date';

    const systemPrompt = `You are a revenue intelligence assistant embedded in a B2B conference management platform. Your job is to analyze meeting transcripts from sales conversations that took place at industry conferences and extract structured intelligence that helps sales reps follow up effectively.

You have deep knowledge of B2B sales dynamics, buying signals, objection patterns, and stakeholder behavior. You are precise, objective, and commercially focused. You do not editorialize or add filler. Every insight you surface must be grounded in something explicitly said in the transcript — do not infer or fabricate.

You always respond with valid JSON only. No preamble, no explanation, no markdown formatting, no code fences. Your entire response must be parseable by JSON.parse().`;

    const userPrompt = `Analyze the following sales meeting transcript from a conference conversation. Extract structured intelligence based on the context provided.

MEETING CONTEXT
Conference: ${mtg.conference_name}
Date: ${meetingDateStr}
Internal rep: ${repName}${repTitle ? `, ${repTitle}` : ''}
External attendee: ${mtg.first_name} ${mtg.last_name}, ${mtg.attendee_title ?? 'Unknown Title'}, ${mtg.company_name ?? 'Unknown Company'}
Company tier: ${tierLabel} (${tierDesc})
Relationship status: ${relationshipStatus}

ICP BUYING SIGNALS TO WATCH FOR
These are the buying signals configured for this account's ideal customer profile. Flag any moment in the transcript where the prospect says something that matches or strongly relates to one of these signals.
${buyingSignalsList}

ICP PAIN POINTS TO WATCH FOR
These are the pain points configured for this account's ideal customer profile. Flag any moment where the prospect explicitly mentions or implies one of these pain points.
${painPointsList}

TRANSCRIPT
${transcriptForAnalysis}

INSTRUCTIONS
Analyze the transcript and return a JSON object with exactly these four keys:

"next_steps": Array of action items explicitly committed to or clearly implied during the conversation. Each object must include:
- "task_text": Clear, specific, actionable description of the task (start with a verb)
- "timestamp_seconds": Integer — the point in the recording where this commitment was made or discussed
- "suggested_owner": "rep" or "prospect" — who is responsible for this action
- "suggested_due_date_offset_days": Integer — suggested days from today to complete this (use 3 for immediate, 7 for this week, 14 for two weeks)
- "confidence": "high", "medium", or "low" — how clearly this was committed to vs implied

"buying_signals": Array of moments where the prospect said something indicating genuine buying intent, authority, urgency, or fit. Each object must include:
- "label": Short label for the signal type (e.g. "Budget authority confirmed", "Active evaluation in progress", "Timeline pressure", "Executive sponsor identified")
- "quote": The verbatim quote from the transcript that triggered this signal — use the exact words spoken, not a paraphrase
- "timestamp_seconds": Integer — position in the recording where this was said
- "confidence": "high", "medium", or "low"
- "icp_match_label": The label of the matching ICP buying signal if one matches, or null if this is a novel signal not in the configured list

"pain_points": Array of moments where the prospect explicitly mentioned or clearly implied a business problem, challenge, or frustration. Each object must include:
- "label": Short label for the pain point (e.g. "Frontline staff turnover", "Workers comp visibility", "Recruiting cost overrun")
- "quote": The verbatim quote from the transcript — exact words, not a paraphrase
- "timestamp_seconds": Integer — position in the recording where this was said
- "confidence": "high", "medium", or "low"
- "icp_match_label": The label of the matching ICP pain point if one matches, or null if novel

"summary": A single string of 2-4 sentences. Summarize who was in the meeting, the key themes discussed, the strongest signal or pain point surfaced, and the most important next step. Write in past tense. Be specific — include names, numbers, and concrete details where they appear in the transcript. Do not use filler phrases like "overall" or "in conclusion".

RULES
- Every quote must be verbatim from the transcript. Do not paraphrase.
- Every timestamp_seconds must be a positive integer corresponding to a real moment in the transcript.
- If no buying signals are detected, return an empty array for buying_signals.
- If no pain points are detected, return an empty array for pain_points.
- If no next steps are detected, return an empty array for next_steps.
- Do not include insights with low confidence unless they are clearly grounded in something said.
- Do not fabricate, infer beyond what was said, or add context not present in the transcript.
- Return valid JSON only. No markdown, no code fences, no explanation text.`;

    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const callClaude = () => anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 4096,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    });

    let analysis: {
      next_steps?: Array<{ task_text: string; timestamp_seconds?: number; suggested_owner?: string; suggested_due_date_offset_days?: number; confidence?: string }>;
      buying_signals?: Array<{ label: string; quote?: string; timestamp_seconds?: number; confidence?: string; icp_match_label?: string }>;
      pain_points?: Array<{ label: string; quote?: string; timestamp_seconds?: number; confidence?: string; icp_match_label?: string }>;
      summary?: string;
    } = {};

    const parseResponse = (text: string) => {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) return JSON.parse(jsonMatch[0]);
      throw new Error('No JSON object found in response');
    };

    const message = await callClaude();
    const responseText = message.content[0].type === 'text' ? message.content[0].text : '';

    try {
      analysis = parseResponse(responseText);
    } catch {
      console.error('First parse attempt failed, retrying. Raw response:', responseText);
      // Retry with explicit JSON instruction appended
      const retryMessage = await anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 4096,
        system: systemPrompt,
        messages: [
          { role: 'user', content: userPrompt },
          { role: 'assistant', content: responseText },
          { role: 'user', content: 'Your previous response was not valid JSON. Return only the JSON object with no other text.' },
        ],
      });
      const retryText = retryMessage.content[0].type === 'text' ? retryMessage.content[0].text : '';
      try {
        analysis = parseResponse(retryText);
      } catch {
        console.error('Retry also failed. Raw retry response:', retryText);
        return NextResponse.json({ error: 'Analysis returned invalid data. Please try again.' }, { status: 502 });
      }
    }

    // Delete existing insights for this meeting
    await db.execute({ sql: `DELETE FROM meeting_insights WHERE meeting_id = ?`, args: [meetingId] });

    const insertedInsights: Array<{ id: number; insight_type: string; content: string; quote: string | null; timestamp_seconds: number | null; confidence: string; confirmed: boolean }> = [];

    for (const signal of analysis.buying_signals ?? []) {
      const result = await db.execute({
        sql: `INSERT INTO meeting_insights (meeting_id, conference_id, attendee_id, insight_type, content, quote, timestamp_seconds, confidence)
              VALUES (?, ?, ?, 'buying_signal', ?, ?, ?, ?) RETURNING id`,
        args: [meetingId, Number(mtg.conference_id), Number(mtg.attendee_id), signal.label, signal.quote ?? null, signal.timestamp_seconds ?? null, signal.confidence ?? 'medium'],
      });
      if (result.rows[0]) {
        insertedInsights.push({ id: Number(result.rows[0].id), insight_type: 'buying_signal', content: signal.label, quote: signal.quote ?? null, timestamp_seconds: signal.timestamp_seconds ?? null, confidence: signal.confidence ?? 'medium', confirmed: false });
      }
    }

    for (const pp of analysis.pain_points ?? []) {
      const result = await db.execute({
        sql: `INSERT INTO meeting_insights (meeting_id, conference_id, attendee_id, insight_type, content, quote, timestamp_seconds, confidence)
              VALUES (?, ?, ?, 'pain_point', ?, ?, ?, ?) RETURNING id`,
        args: [meetingId, Number(mtg.conference_id), Number(mtg.attendee_id), pp.label, pp.quote ?? null, pp.timestamp_seconds ?? null, pp.confidence ?? 'medium'],
      });
      if (result.rows[0]) {
        insertedInsights.push({ id: Number(result.rows[0].id), insight_type: 'pain_point', content: pp.label, quote: pp.quote ?? null, timestamp_seconds: pp.timestamp_seconds ?? null, confidence: pp.confidence ?? 'medium', confirmed: false });
      }
    }

    for (const step of analysis.next_steps ?? []) {
      const result = await db.execute({
        sql: `INSERT INTO meeting_insights (meeting_id, conference_id, attendee_id, insight_type, content, timestamp_seconds, confidence)
              VALUES (?, ?, ?, 'next_step', ?, ?, ?) RETURNING id`,
        args: [meetingId, Number(mtg.conference_id), Number(mtg.attendee_id), step.task_text, step.timestamp_seconds ?? null, step.confidence ?? 'medium'],
      });
      if (result.rows[0]) {
        insertedInsights.push({ id: Number(result.rows[0].id), insight_type: 'next_step', content: step.task_text, quote: null, timestamp_seconds: step.timestamp_seconds ?? null, confidence: step.confidence ?? 'medium', confirmed: false });
      }
    }

    const transcriptJson = JSON.stringify(segments);
    const summary = analysis.summary ?? '';

    const existingNotes = await db.execute({ sql: `SELECT id FROM meeting_notes WHERE meeting_id = ?`, args: [meetingId] });
    if (existingNotes.rows.length > 0) {
      await db.execute({
        sql: `UPDATE meeting_notes SET transcript = ?, summary = ?, updated_at = datetime('now') WHERE meeting_id = ?`,
        args: [transcriptJson, summary, meetingId],
      });
    } else {
      await db.execute({
        sql: `INSERT INTO meeting_notes (meeting_id, transcript, summary, audio_file_path, created_by) VALUES (?, ?, ?, ?, ?)`,
        args: [meetingId, transcriptJson, summary, audio_url ?? null, user.id ?? null],
      });
    }

    return NextResponse.json({
      insights: insertedInsights,
      transcript: segments,
      summary,
      next_steps: analysis.next_steps ?? [],
    });
  } catch (error) {
    console.error('POST /api/meetings/[id]/analyze error:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
