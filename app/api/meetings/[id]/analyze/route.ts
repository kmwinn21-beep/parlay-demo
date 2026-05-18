import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getDb } from '@/lib/getDb';
import Anthropic from '@anthropic-ai/sdk';

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

    // Verify meeting exists
    const meetingResult = await db.execute({
      sql: `SELECT m.id, m.attendee_id, m.conference_id,
               a.first_name, a.last_name, a.title,
               co.name AS company_name, co.icp AS company_tier,
               c.name AS conference_name
            FROM meetings m
            JOIN attendees a ON m.attendee_id = a.id
            LEFT JOIN companies co ON a.company_id = co.id
            JOIN conferences c ON m.conference_id = c.id
            WHERE m.id = ?`,
      args: [meetingId],
    });

    if (meetingResult.rows.length === 0) {
      return NextResponse.json({ error: 'Meeting not found' }, { status: 404 });
    }

    const mtg = meetingResult.rows[0];

    interface WhisperSegment {
      text: string;
      start: number;
      end: number;
    }
    let segments: WhisperSegment[] = [];
    let transcriptForAnalysis: string;

    if (audio_url) {
      // Fetch audio from URL
      const audioResponse = await fetch(audio_url);
      if (!audioResponse.ok) {
        return NextResponse.json({ error: 'Failed to fetch audio file' }, { status: 400 });
      }

      const audioBuffer = await audioResponse.arrayBuffer();
      const audioBlob = new Blob([audioBuffer], { type: 'audio/webm' });

      const urlPath = new URL(audio_url).pathname;
      const ext = urlPath.split('.').pop() || 'webm';
      const filename = `audio.${ext}`;

      const whisperForm = new FormData();
      whisperForm.append('file', new File([audioBlob], filename));
      whisperForm.append('model', 'whisper-1');
      whisperForm.append('response_format', 'verbose_json');

      const whisperResponse = await fetch('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
        body: whisperForm,
      });

      if (!whisperResponse.ok) {
        const errText = await whisperResponse.text();
        console.error('Whisper API error:', errText);
        return NextResponse.json({ error: 'Transcription failed' }, { status: 502 });
      }

      const whisperData = await whisperResponse.json();
      segments = (whisperData.segments ?? []).map((s: WhisperSegment) => ({
        text: s.text,
        start: s.start,
        end: s.end,
      }));
      transcriptForAnalysis = segments.length > 0
        ? segments.map((s) => `[${Math.floor(s.start)}s] ${s.text.trim()}`).join('\n')
        : (whisperData.text ?? '');
    } else {
      // Text transcript provided directly — build pseudo-segments for storage
      const lines = (transcript_text ?? '').split('\n').map(l => l.trim()).filter(Boolean);
      segments = lines.map((line, i) => ({ text: line, start: i * 5, end: (i + 1) * 5 }));
      transcriptForAnalysis = transcript_text ?? '';
    }

    // Fetch ICP settings
    const icpSettings = await db.execute({
      sql: `SELECT key, value FROM site_settings WHERE key IN ('icp_pain_points', 'icp_ai_pain_points')`,
      args: [],
    });

    let painPoints: string[] = [];
    let triggers: string[] = [];

    for (const row of icpSettings.rows) {
      const key = String(row.key);
      const val = String(row.value ?? '');
      try {
        if (key === 'icp_pain_points') {
          const parsed = JSON.parse(val);
          if (Array.isArray(parsed)) painPoints = parsed.map(String);
        } else if (key === 'icp_ai_pain_points') {
          const parsed = JSON.parse(val);
          if (Array.isArray(parsed)) {
            triggers = parsed.map((p: { title?: string; description?: string }) =>
              p.title ? `${p.title}: ${p.description ?? ''}` : String(p)
            );
          }
        }
      } catch {
        // ignore parse errors
      }
    }

    // Build Claude prompt
    const prompt = `You are an expert meeting analyst for a B2B sales team in the senior housing and care industry.

Analyze this meeting transcript and extract structured insights.

Meeting context:
- Attendee: ${mtg.first_name} ${mtg.last_name}, ${mtg.title ?? 'Unknown Title'} at ${mtg.company_name ?? 'Unknown Company'}
- Company tier: ${mtg.company_tier ?? 'Unknown'}
- Conference: ${mtg.conference_name}

ICP Pain points configured: ${painPoints.join(', ') || 'None configured'}
ICP Trigger events/buying signals: ${triggers.join(', ') || 'None configured'}

Transcript:
${transcriptForAnalysis}

Return ONLY valid JSON with no preamble or explanation:
{
  "next_steps": [{ "task_text": "...", "timestamp_seconds": 0, "suggested_owner": "...", "suggested_due_date_offset_days": 7 }],
  "buying_signals": [{ "label": "...", "quote": "...", "timestamp_seconds": 0, "confidence": "high|medium|low", "icp_match_label": "..." }],
  "pain_points": [{ "label": "...", "quote": "...", "timestamp_seconds": 0, "confidence": "high|medium|low", "icp_match_label": "..." }],
  "summary": "2-4 sentence plain language summary of the meeting"
}`;

    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2048,
      messages: [{ role: 'user', content: prompt }],
    });

    const responseText = message.content[0].type === 'text' ? message.content[0].text : '';

    let analysis: {
      next_steps?: Array<{ task_text: string; timestamp_seconds?: number; suggested_owner?: string; suggested_due_date_offset_days?: number }>;
      buying_signals?: Array<{ label: string; quote?: string; timestamp_seconds?: number; confidence?: string; icp_match_label?: string }>;
      pain_points?: Array<{ label: string; quote?: string; timestamp_seconds?: number; confidence?: string; icp_match_label?: string }>;
      summary?: string;
    } = {};

    try {
      // Extract JSON from response (it might be wrapped in markdown)
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        analysis = JSON.parse(jsonMatch[0]);
      }
    } catch {
      console.error('Failed to parse Claude response:', responseText);
    }

    // Delete existing insights for this meeting
    await db.execute({
      sql: `DELETE FROM meeting_insights WHERE meeting_id = ?`,
      args: [meetingId],
    });

    const insertedInsights: Array<{ id: number; insight_type: string; content: string; quote: string | null; timestamp_seconds: number | null; confidence: string; confirmed: boolean }> = [];

    // Insert buying signals
    for (const signal of analysis.buying_signals ?? []) {
      const result = await db.execute({
        sql: `INSERT INTO meeting_insights (meeting_id, conference_id, attendee_id, insight_type, content, quote, timestamp_seconds, confidence)
              VALUES (?, ?, ?, 'buying_signal', ?, ?, ?, ?)
              RETURNING id`,
        args: [
          meetingId,
          Number(mtg.conference_id),
          Number(mtg.attendee_id),
          signal.label,
          signal.quote ?? null,
          signal.timestamp_seconds ?? null,
          signal.confidence ?? 'medium',
        ],
      });
      if (result.rows[0]) {
        insertedInsights.push({
          id: Number(result.rows[0].id),
          insight_type: 'buying_signal',
          content: signal.label,
          quote: signal.quote ?? null,
          timestamp_seconds: signal.timestamp_seconds ?? null,
          confidence: signal.confidence ?? 'medium',
          confirmed: false,
        });
      }
    }

    // Insert pain points
    for (const pp of analysis.pain_points ?? []) {
      const result = await db.execute({
        sql: `INSERT INTO meeting_insights (meeting_id, conference_id, attendee_id, insight_type, content, quote, timestamp_seconds, confidence)
              VALUES (?, ?, ?, 'pain_point', ?, ?, ?, ?)
              RETURNING id`,
        args: [
          meetingId,
          Number(mtg.conference_id),
          Number(mtg.attendee_id),
          pp.label,
          pp.quote ?? null,
          pp.timestamp_seconds ?? null,
          pp.confidence ?? 'medium',
        ],
      });
      if (result.rows[0]) {
        insertedInsights.push({
          id: Number(result.rows[0].id),
          insight_type: 'pain_point',
          content: pp.label,
          quote: pp.quote ?? null,
          timestamp_seconds: pp.timestamp_seconds ?? null,
          confidence: pp.confidence ?? 'medium',
          confirmed: false,
        });
      }
    }

    // Insert next steps as insights
    for (const step of analysis.next_steps ?? []) {
      const result = await db.execute({
        sql: `INSERT INTO meeting_insights (meeting_id, conference_id, attendee_id, insight_type, content, timestamp_seconds, confidence)
              VALUES (?, ?, ?, 'next_step', ?, ?, 'medium')
              RETURNING id`,
        args: [
          meetingId,
          Number(mtg.conference_id),
          Number(mtg.attendee_id),
          step.task_text,
          step.timestamp_seconds ?? null,
        ],
      });
      if (result.rows[0]) {
        insertedInsights.push({
          id: Number(result.rows[0].id),
          insight_type: 'next_step',
          content: step.task_text,
          quote: null,
          timestamp_seconds: step.timestamp_seconds ?? null,
          confidence: 'medium',
          confirmed: false,
        });
      }
    }

    // Update meeting_notes with transcript and summary
    const transcriptJson = JSON.stringify(segments);
    const summary = analysis.summary ?? '';

    const existingNotes = await db.execute({
      sql: `SELECT id FROM meeting_notes WHERE meeting_id = ?`,
      args: [meetingId],
    });

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
