/**
 * What an extractor is allowed to propose.
 *
 * Every target declares the record it writes to, the shape of that write, and
 * where its allowed values come from. The prompt is assembled from this list,
 * so it stays a specific checklist rather than "find anything useful" — and
 * adding a target later is an entry here rather than a new feature.
 *
 * Deliberately small to begin with. The architecture carries more; the accept
 * rate on these two is what decides whether to add any.
 */

/** Which record a suggestion hangs off. */
export type SuggestionEntity = 'company' | 'attendee';

/**
 * How accepting a suggestion writes.
 * - `create_child` inserts a row in a related table.
 * - `set_field` overwrites a column on the entity itself.
 */
export type SuggestionWrite = 'create_child' | 'set_field';

export interface SuggestionField {
  key: string;
  label: string;
  /**
   * A config_options category the value must come from. The live list is sent
   * to the model and the answer is checked against it, so "that value doesn't
   * exist" becomes rare rather than routine.
   */
  optionCategory?: string;
  /** Several values allowed, stored comma-separated as elsewhere in the app. */
  multi?: boolean;
  /** Free text — never enum-checked, always shown for editing. */
  freeText?: boolean;
  /**
   * Pre-filled with the words this was read from and where they came from,
   * rather than with anything the model wrote. A relationship recorded from a
   * note should carry the sentence that justified it, so a reader a year later
   * can weigh it without hunting for the note.
   */
  provenance?: boolean;
  /** Names a company by name, resolved to an id (or created) on accept. */
  companyRef?: boolean;
  /** Left null when the note doesn't say. Extractors must not guess these. */
  required?: boolean;
  /**
   * Required, but a reviewer can supply it — so failing to resolve it does not
   * throw the suggestion away.
   *
   * Without this, one unmapped word destroys an otherwise correct extraction:
   * a note saying "considering New Lesley" that comes back with a status of
   * "Considering" fails the enum check, and because the field is required the
   * whole proposal is dropped — company, quote and all — with nothing shown to
   * anyone. The reviewer has the dropdown open in front of them; a card with a
   * blank status is worth far more than silence.
   *
   * Only for fields that are not what the suggestion is *about*. A sub type
   * suggestion with no sub type has nothing to say, so that one stays fatal.
   */
  reviewerCanFill?: boolean;
  /**
   * How the language of a note maps onto this field's options, as
   * `{ option: [phrases] }`. Only entries whose option exists in the account's
   * live list are sent, so a hint can never name a value the model isn't
   * allowed to use.
   */
  optionHints?: Record<string, string[]>;
}

export interface SuggestionTarget {
  key: string;
  /** Shown as the heading on the review card. */
  label: string;
  entity: SuggestionEntity;
  write: SuggestionWrite;
  /** The table a `create_child` target inserts into. */
  table?: string;
  /** The column a `set_field` target writes. */
  column?: string;
  fields: SuggestionField[];
  /** One line, handed to the model, describing what to look for. */
  prompt: string;
}

export const SUGGESTION_TARGETS: SuggestionTarget[] = [
  {
    key: 'vendor_relationship',
    label: 'Vendor / Other Relationship',
    entity: 'company',
    write: 'create_child',
    table: 'vendor_relationships',
    fields: [
      { key: 'related_company_name', label: 'Company', companyRef: true, required: true },
      {
        key: 'relationship_status',
        label: 'Relationship Status',
        optionCategory: 'other_relationship_status',
        multi: true,
        required: true,
        reviewerCanFill: true,
        // Conference shorthand, not the option names. Nobody writes
        // "Evaluating" in a note; they write "considering" or "looking at".
        optionHints: {
          Evaluating: ['considering', 'looking at', 'evaluating', 'demoing', 'in conversations with', 'exploring'],
          'Current Vendor': ['uses', 'using', 'on', 'live on', 'renewing', 'up for renewal', 'across portfolio'],
          'Active Pilot': ['piloting', 'trialling', 'trialing', 'running a POC', 'testing'],
          'Former Vendor': ['left', 'leaving', 'ripping out', 'sunsetting', 'transitioning off', 'replaced', 'dropped'],
        },
      },
      { key: 'vendor_type', label: 'Vendor Type', optionCategory: 'vendor_type', multi: true },
      { key: 'notes', label: 'Notes / Context', freeText: true, provenance: true },
    ],
    prompt:
      'Another company named as a vendor, partner, or system this company uses, '
      + 'is evaluating, or has stopped using. Name the other company exactly as the '
      + 'note writes it. Notes are written in shorthand, so the phrasing to look for '
      + 'includes: considering, looking at, evaluating, demoing, in conversations with, '
      + 'piloting, using, on, live on, renewing, up for renewal, switching to, going with, '
      + 'leaving, ripping out, sunsetting, transitioning off, replaced. Do not infer a '
      + 'relationship from a company merely being mentioned in passing — but any of the '
      + 'above counts as the note saying so.',
  },
  {
    key: 'company_sub_types',
    label: 'Sub Type(s)',
    entity: 'company',
    write: 'set_field',
    column: 'sub_types',
    fields: [
      // Which company this describes. Without it the write would fall back to
      // the record being read, and set the operator's sub types to its
      // vendor's — the wrong company entirely.
      { key: 'related_company_name', label: 'Company', companyRef: true, required: true },
      { key: 'sub_types', label: 'Sub Type(s)', optionCategory: 'vendor_type', multi: true, required: true },
    ],
    prompt:
      'What kind of vendor a company named in the note is — only when the note '
      + 'says so, e.g. calling it an EHR, a consultant, or a reseller. Not what the '
      + 'company being written about is; what a vendor it names is.',
  },
];

export function getTarget(key: string): SuggestionTarget | undefined {
  return SUGGESTION_TARGETS.find(t => t.key === key);
}

/**
 * Identifies the same proposal across re-extractions of one note, so editing
 * and re-saving a note doesn't stack duplicates of something already answered.
 *
 * Deliberately scoped to the note rather than to the record: a dismissal means
 * "not from this note", and a later note is free to raise the same fact again —
 * which is what you want when the thing being described keeps changing.
 */
export function dedupeKey(targetKey: string, entityType: string, entityId: number, payload: Record<string, unknown>): string {
  const t = getTarget(targetKey);
  // The identifying field is the first required one — the company being named,
  // or the value being set. Everything else can differ without it being a
  // different proposal.
  const idField = t?.fields.find(f => f.required)?.key;
  const raw = idField ? payload[idField] : JSON.stringify(payload);
  const ident = Array.isArray(raw) ? raw.join(',') : String(raw ?? '');
  return `${targetKey}:${entityType}:${entityId}:${ident.trim().toLowerCase()}`;
}
