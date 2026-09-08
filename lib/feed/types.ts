/**
 * What a feed item is, and how nine kinds collapse into five colours.
 *
 * Split from the query so the UI can import the vocabulary without importing a
 * module that talks to a database.
 */

/** The ten things the feed reports. */
export const FEED_KINDS = [
  'meeting_held',
  'meeting_scheduled',
  'touchpoint',
  'note',
  'note_pinned',
  'vendor_relationship',
  'attendee_added',
  'attendee_list_uploaded',
  'social_event_created',
  'rsvp',
] as const;

export type FeedKind = typeof FEED_KINDS[number];

/**
 * Five colours, not ten.
 *
 * The colour answers "what sort of thing is this" at a glance while scrolling;
 * nine would be a legend nobody reads. Pinning is deliberately absent — it is an
 * attribute of a note, drawn as an amber left rule on the card, not a kind of
 * event with a colour of its own.
 */
export type FeedColour = 'meetings' | 'touchpoints' | 'notes' | 'relationships' | 'people';

export const COLOUR_BY_KIND: Record<FeedKind, FeedColour> = {
  meeting_held: 'meetings',
  meeting_scheduled: 'meetings',
  touchpoint: 'touchpoints',
  note: 'notes',
  note_pinned: 'notes',
  vendor_relationship: 'relationships',
  attendee_added: 'people',
  attendee_list_uploaded: 'people',
  social_event_created: 'people',
  rsvp: 'people',
};

/** The chip row above the stream. `all` is not a filter, it is the absence of one. */
export type FeedFilter = 'all' | FeedColour;

export function matchesFilter(kind: FeedKind, filter: FeedFilter): boolean {
  return filter === 'all' || COLOUR_BY_KIND[kind] === filter;
}

/**
 * Whether a card shows note text in place of its subtitle and pill rows.
 *
 * Only the two note kinds. A note card that does not show its text is a card
 * saying a note exists.
 */
export function rendersBody(kind: FeedKind): boolean {
  return kind === 'note' || kind === 'note_pinned';
}

/**
 * Which conferences the stream is drawn from.
 *
 *   upcoming  conferences that have not started — the prep work
 *   active    conferences running right now
 *   all       every conference, but only the last 90 days
 *
 * `active` was called `in_progress`, after the conference stage it maps to. The
 * label is what people read on a three-way toggle and "In progress" was the
 * long one; the stage it filters by is still `in_progress`.
 */
export type FeedScope = 'upcoming' | 'active' | 'all';

/** Every scope, in the order the toggle shows them. */
export const FEED_SCOPES: ReadonlyArray<{ key: FeedScope; label: string }> = [
  { key: 'upcoming', label: 'Upcoming' },
  { key: 'active', label: 'Active' },
  { key: 'all', label: 'All' },
];

/** True for the scopes that filter to a set of conferences rather than a date. */
export function isConferenceScoped(scope: FeedScope): boolean {
  return scope === 'upcoming' || scope === 'active';
}

/** How far back `all` reaches. */
export const ALL_SCOPE_DAYS = 90;

export interface FeedItem {
  /** Stable within a page: the kind plus the source row's id. */
  id: string;
  kind: FeedKind;
  colour: FeedColour;
  /** ISO-ish `YYYY-MM-DD HH:MM:SS` in UTC, as SQLite stores it. */
  occurredAt: string;

  actor: { name: string; avatarSeed: string; system: boolean; unresolved: boolean };

  /**
   * The conference this belongs to, when it belongs to one.
   *
   * Null for a vendor relationship, which is a company fact rather than a
   * conference fact, and for a pinned note whose stored conference NAME matched
   * nothing. `name` without `id` renders an unlinked pill.
   */
  conference: { id: number | null; name: string } | null;

  /** Where the card links. Null when there is nothing to open. */
  href: string | null;

  /** The strong-weight thing the action happened to. */
  subject: string;
  /** Row 3, left half — a title, an event type, a response. */
  detail1: string | null;
  /** Row 3, right half — a company, a place, a time. */
  detail2: string | null;
  /** Row 4 — outcome, touchpoint type, vendor type, RSVP. */
  pills: string[];
  /** Note text, for the two kinds that render a body. */
  body: string | null;
  /** Draws the amber left rule. Only ever true on a note. */
  pinned: boolean;
}
