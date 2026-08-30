import Anthropic from '@anthropic-ai/sdk';
import type { Client } from '@libsql/client';
import { SUGGESTION_TARGETS, dedupeKey, type SuggestionTarget } from './registry';

/** Small and fast — this runs on every qualifying note. */
const MODEL = 'claude-haiku-4-5-20251001';

export interface ExtractionContext {
  noteId: number | null;
  content: string;
  /** The company the note is about. Nothing is extracted without one. */
  companyId: number;
  companyName?: string | null;
  attendeeId?: number | null;
}

export interface ProposedSuggestion {
  target_key: string;
  entity_type: string;
  entity_id: number;
  payload: Record<string, unknown>;
  quote: string;
  confidence: 'high' | 'medium' | 'low';
}

/** Why a proposal was thrown away, for the dry-run report. */
export interface RejectedSuggestion {
  target_key: string;
  reason: string;
  raw: unknown;
}

export interface ExtractionResult {
  accepted: ProposedSuggestion[];
  rejected: RejectedSuggestion[];
}

/** Punctuation and spacing vary between a quote and its source; the words don't. */
function normalize(s: string): string {
  return s.toLowerCase().replace(/[‘’“”]/g, "'").replace(/\s+/g, ' ').trim();
}

async function optionValues(db: Client, category: string): Promise<string[]> {
  const res = await db.execute({
    sql: 'SELECT value FROM config_options WHERE category = ? ORDER BY sort_order, id',
    args: [category],
  }).catch(() => ({ rows: [] as Record<string, unknown>[] }));
  return res.rows.map(r => String(r.value ?? '').trim()).filter(Boolean);
}

/**
 * The prompt, assembled from the registry and the account's own option lists.
 *
 * Built rather than written out so it can't drift from what the registry says
 * a target accepts, and so the model is choosing from the values this account
 * actually uses rather than inventing its own vocabulary.
 */
export function buildPrompt(
  ctx: ExtractionContext,
  targets: SuggestionTarget[],
  options: Map<string, string[]>,
): string {
  const targetSpecs = targets.map(t => {
    const fields = t.fields.map(f => {
      const bits = [`"${f.key}"`];
      if (f.optionCategory) {
        const list = options.get(f.optionCategory) ?? [];
        bits.push(`— one of: ${list.map(v => JSON.stringify(v)).join(', ') || '(none configured)'}`);
        if (f.multi) bits.push('(an array; several allowed)');
      } else if (f.companyRef) {
        bits.push('— the other company\'s name, exactly as the note writes it');
      } else if (f.freeText) {
        bits.push('— free text');
      }
      if (f.required) bits.push('(required)');
      else bits.push('(null when the note does not say)');
      return `    - ${bits.join(' ')}`;
    }).join('\n');
    return `  "${t.key}" — ${t.prompt}\n${fields}`;
  }).join('\n\n');

  return `You are reading a CRM note about ${ctx.companyName ? `the company "${ctx.companyName}"` : 'a company'} and extracting only facts the note states outright.

NOTE
${ctx.content}

WHAT TO LOOK FOR
${targetSpecs}

Return a JSON object: { "suggestions": [ ... ] }. Each entry:
- "target_key": one of the keys above
- "payload": an object with that target's fields
- "quote": the exact words from the note that state this fact — verbatim, copied character for character, not paraphrased
- "confidence": "high", "medium" or "low"

RULES
- Every quote must appear in the note word for word. If you cannot quote it, do not propose it.
- Only use values from the lists given. If nothing in the list fits, use null.
- Leave a field null when the note does not state it. Never guess a value to fill a field.
- Do not propose a relationship just because a company is named. The note must say it is used, being evaluated, or has been dropped.
- Return {"suggestions": []} if the note states nothing worth recording. That is a normal answer, not a failure.`;
}

/**
 * Read a note and propose record updates.
 *
 * Everything the model returns is checked before it is kept: the quote has to
 * be in the note, enum values have to come from the list that was sent, and
 * required fields have to be filled. A proposal failing any of those is
 * dropped here rather than shown to somebody — an extraction that can't be
 * traced to words in the note is an invention, whatever it claims.
 */
export async function extractFromNote(db: Client, ctx: ExtractionContext): Promise<ExtractionResult> {
  const empty: ExtractionResult = { accepted: [], rejected: [] };
  if (!process.env.ANTHROPIC_API_KEY) return empty;
  if (!ctx.content.trim() || !ctx.companyId) return empty;

  const targets = SUGGESTION_TARGETS;
  const categories = new Set<string>();
  for (const t of targets) for (const f of t.fields) if (f.optionCategory) categories.add(f.optionCategory);
  const options = new Map<string, string[]>();
  for (const cat of Array.from(categories)) options.set(cat, await optionValues(db, cat));

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  let raw: string;
  try {
    const message = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 2048,
      messages: [{ role: 'user', content: buildPrompt(ctx, targets, options) }],
    });
    raw = message.content[0]?.type === 'text' ? message.content[0].text : '';
  } catch (err) {
    console.error('[suggestions] extraction call failed:', err);
    return empty;
  }

  let parsed: { suggestions?: unknown[] };
  try {
    // Models sometimes wrap JSON in prose or a fence; take the outermost object.
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    parsed = start >= 0 && end > start ? JSON.parse(raw.slice(start, end + 1)) : {};
  } catch {
    console.error('[suggestions] extraction returned unparseable JSON');
    return empty;
  }

  return validateProposals(parsed.suggestions ?? [], ctx, targets, options);
}

/**
 * Check what the model returned before any of it is kept.
 *
 * Separated from the call so it can be tested against hand-written responses,
 * including the ones that matter: an invented quote, a value outside the list,
 * a required field the model filled in with a guess. This is the part that
 * decides whether something invented reaches a person, so it is worth being
 * able to prove on its own.
 */
export function validateProposals(
  items: unknown[],
  ctx: ExtractionContext,
  targets: SuggestionTarget[],
  options: Map<string, string[]>,
): ExtractionResult {
  const haystack = normalize(ctx.content);
  const accepted: ProposedSuggestion[] = [];
  const rejected: RejectedSuggestion[] = [];
  const seen = new Set<string>();

  for (const item of items) {
    const row = item as Record<string, unknown>;
    const target = targets.find(t => t.key === String(row.target_key ?? ''));
    if (!target) { rejected.push({ target_key: String(row.target_key ?? '?'), reason: 'unknown target', raw: row }); continue; }

    const quote = String(row.quote ?? '').trim();
    if (!quote) { rejected.push({ target_key: target.key, reason: 'no quote', raw: row }); continue; }
    if (!haystack.includes(normalize(quote))) {
      rejected.push({ target_key: target.key, reason: 'quote not found in note', raw: row });
      continue;
    }

    const proposed = (row.payload ?? {}) as Record<string, unknown>;
    const payload: Record<string, unknown> = {};
    let bad: string | null = null;

    for (const field of target.fields) {
      const value = proposed[field.key];
      if (value == null || value === '' || (Array.isArray(value) && value.length === 0)) {
        if (field.required) { bad = `missing required field ${field.key}`; break; }
        payload[field.key] = field.multi ? [] : null;
        continue;
      }
      if (field.optionCategory) {
        const allowed = options.get(field.optionCategory) ?? [];
        const lower = new Map(allowed.map(v => [v.toLowerCase(), v]));
        const wanted = (Array.isArray(value) ? value : [value]).map(v => String(v).trim());
        // Case-corrected back to the stored spelling, so the value matches the
        // option rather than merely resembling it.
        const resolved = wanted.map(v => lower.get(v.toLowerCase())).filter((v): v is string => !!v);
        if (resolved.length === 0) {
          if (field.required) { bad = `no valid ${field.key}`; break; }
          payload[field.key] = field.multi ? [] : null;
          continue;
        }
        payload[field.key] = field.multi ? resolved : resolved[0];
        continue;
      }
      payload[field.key] = Array.isArray(value) ? value.map(v => String(v)) : String(value).trim();
    }
    if (bad) { rejected.push({ target_key: target.key, reason: bad, raw: row }); continue; }

    const entityId = target.entity === 'attendee' ? (ctx.attendeeId ?? 0) : ctx.companyId;
    if (!entityId) { rejected.push({ target_key: target.key, reason: 'no entity to attach to', raw: row }); continue; }

    // The model can name the same thing twice in one pass.
    const key = dedupeKey(target.key, target.entity, entityId, payload);
    if (seen.has(key)) { rejected.push({ target_key: target.key, reason: 'duplicate within response', raw: row }); continue; }
    seen.add(key);

    const confidence = ['high', 'medium', 'low'].includes(String(row.confidence))
      ? String(row.confidence) as 'high' | 'medium' | 'low'
      : 'medium';

    accepted.push({ target_key: target.key, entity_type: target.entity, entity_id: entityId, payload, quote, confidence });
  }

  return { accepted, rejected };
}

/**
 * Store proposals, skipping anything the record already has — a relationship
 * that exists is not news, and proposing it again is noise the reviewer has to
 * clear.
 */
export async function storeSuggestions(
  db: Client,
  noteId: number | null,
  suggestions: ProposedSuggestion[],
): Promise<number> {
  let created = 0;
  for (const s of suggestions) {
    if (await alreadyRecorded(db, s)) continue;
    const res = await db.execute({
      sql: `INSERT OR IGNORE INTO record_suggestions
              (source_note_id, target_key, entity_type, entity_id, payload, quote, confidence, dedupe_key)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        noteId,
        s.target_key,
        s.entity_type,
        s.entity_id,
        JSON.stringify(s.payload),
        s.quote,
        s.confidence,
        dedupeKey(s.target_key, s.entity_type, s.entity_id, s.payload),
      ],
    }).catch(() => null);
    if (res && Number(res.rowsAffected ?? 0) > 0) created += 1;
  }
  return created;
}

/** True when the record already holds what's being proposed. */
async function alreadyRecorded(db: Client, s: ProposedSuggestion): Promise<boolean> {
  if (s.target_key === 'vendor_relationship') {
    const name = String(s.payload.related_company_name ?? '').trim();
    if (!name) return false;
    const res = await db.execute({
      sql: `SELECT 1 FROM vendor_relationships vr
            JOIN companies c ON c.id = vr.related_company_id
            WHERE vr.company_id = ? AND LOWER(TRIM(c.name)) = LOWER(TRIM(?)) LIMIT 1`,
      args: [s.entity_id, name],
    }).catch(() => ({ rows: [] as Record<string, unknown>[] }));
    return res.rows.length > 0;
  }
  if (s.target_key === 'company_sub_types') {
    const name = String(s.payload.related_company_name ?? '').trim();
    if (!name) return false;
    const res = await db.execute({
      sql: 'SELECT sub_types FROM companies WHERE LOWER(TRIM(name)) = LOWER(TRIM(?)) LIMIT 1',
      args: [name],
    }).catch(() => ({ rows: [] as Record<string, unknown>[] }));
    if (res.rows.length === 0) return false;
    const existing = String(res.rows[0].sub_types ?? '').split(',').map(v => v.trim().toLowerCase()).filter(Boolean);
    const wanted = (s.payload.sub_types as string[] ?? []).map(v => v.toLowerCase());
    // Only skip when the company already carries every type being proposed.
    return wanted.length > 0 && wanted.every(v => existing.includes(v));
  }
  return false;
}
