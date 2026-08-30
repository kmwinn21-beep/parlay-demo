import { SUGGESTION_TARGETS, getTarget, type SuggestionField } from './registry';

/**
 * One company named in a note is one decision, however many targets it feeds.
 *
 * The extractor proposes per target, so a note that says "Yardi (hates it)" and
 * calls Yardi an EHR produces a relationship *and* a sub type — two cards for
 * one company, which reads as duplication even though the two write to
 * different places. Grouping them puts the company on screen once, with every
 * field it has, and one button that performs both writes.
 */

export interface GroupableSuggestion {
  id: number;
  target_key: string;
  payload: Record<string, unknown>;
  quote: string | null;
  confidence: string;
}

export interface SuggestionGroup {
  /** Stable across re-renders — the company, or the suggestion when there is none. */
  key: string;
  /** The company this is about, when the suggestions name one. */
  companyName: string | null;
  /** What accepting would do, e.g. "Vendor / Other Relationship · Sub Type(s)". */
  summary: string;
  members: GroupableSuggestion[];
  /** Every field across the members, in registry order, each appearing once. */
  fields: SuggestionField[];
  /** The words behind this, deduplicated — members often share one quote. */
  quotes: string[];
  /** The least confident member's, since the group is accepted as a whole. */
  confidence: string;
  /** Pre-filled values, merged across the members. */
  draft: Record<string, unknown>;
}

const RANK: Record<string, number> = { low: 0, medium: 1, high: 2 };

function companyOf(s: GroupableSuggestion): string | null {
  const target = getTarget(s.target_key);
  const field = target?.fields.find(f => f.companyRef);
  if (!field) return null;
  const v = String(s.payload[field.key] ?? '').trim();
  return v || null;
}

function isEmpty(v: unknown): boolean {
  return v == null || v === '' || (Array.isArray(v) && v.length === 0);
}

/** Group suggestions by the company they name, keeping registry order. */
export function groupSuggestions(rows: GroupableSuggestion[]): SuggestionGroup[] {
  const order = new Map(SUGGESTION_TARGETS.map((t, i) => [t.key, i]));
  const buckets = new Map<string, GroupableSuggestion[]>();

  for (const row of rows) {
    const company = companyOf(row);
    // Without a company there is nothing to group on, so it stands alone.
    const key = company ? `company:${company.trim().toLowerCase()}` : `suggestion:${row.id}`;
    const bucket = buckets.get(key);
    if (bucket) bucket.push(row);
    else buckets.set(key, [row]);
  }

  return Array.from(buckets.entries()).map(([key, members]) => {
    members.sort((a, b) => (order.get(a.target_key) ?? 99) - (order.get(b.target_key) ?? 99));

    const fields: SuggestionField[] = [];
    const seenField = new Set<string>();
    const draft: Record<string, unknown> = {};
    const labels: string[] = [];

    for (const m of members) {
      const target = getTarget(m.target_key);
      if (!target) continue;
      labels.push(target.label);
      for (const f of target.fields) {
        if (!seenField.has(f.key)) { seenField.add(f.key); fields.push(f); }
        // First member to state a value wins; a later empty one can't blank it.
        if (isEmpty(draft[f.key])) draft[f.key] = m.payload[f.key];
      }
    }

    // Both of these come from the same option list and answer the same
    // question — what kind of vendor this is. When the note said it once and
    // the model recorded it under the sub type, the relationship's own field
    // is left blank for no reason. This is copying a stated fact between two
    // fields, not inventing one.
    if (seenField.has('vendor_type') && seenField.has('sub_types')) {
      if (isEmpty(draft.vendor_type) && !isEmpty(draft.sub_types)) draft.vendor_type = draft.sub_types;
      else if (isEmpty(draft.sub_types) && !isEmpty(draft.vendor_type)) draft.sub_types = draft.vendor_type;
    }

    const quotes = Array.from(new Set(members.map(m => (m.quote ?? '').trim()).filter(Boolean)));
    const confidence = members
      .map(m => m.confidence)
      .sort((a, b) => (RANK[a] ?? 1) - (RANK[b] ?? 1))[0] ?? 'medium';

    return {
      key,
      companyName: companyOf(members[0]),
      summary: Array.from(new Set(labels)).join(' · '),
      members,
      fields,
      quotes,
      confidence,
      draft,
    };
  });
}

/** The part of a group's draft that belongs to one member's target. */
export function payloadFor(member: GroupableSuggestion, draft: Record<string, unknown>): Record<string, unknown> {
  const target = getTarget(member.target_key);
  if (!target) return {};
  const out: Record<string, unknown> = {};
  for (const f of target.fields) out[f.key] = draft[f.key];
  return out;
}
