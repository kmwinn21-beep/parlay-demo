/**
 * Who did the thing — one resolver for three incompatible vocabularies.
 *
 * ── Why this exists ──────────────────────────────────────────────────────────
 *
 * The tables the feed unions over do not agree on what "the actor" is:
 *
 *   meetings.scheduled_by        a COMMA-SEPARATED LIST of `config_options.id`
 *                                where category = 'user' — a meeting can be
 *                                booked by more than one rep — and, on older
 *                                rows, plain names instead of ids
 *   attendee_touchpoints.logged_by                            (same)
 *   vendor_relationships.rep_id                               (same)
 *   entity_notes.author_user_id  `users.id`, but NULL on older rows, which
 *                                carry the author's name in `rep` instead
 *   pinned_notes.pinned_by       free text — a display name, as typed
 *   social_events.entered_by     free text — a display name from a <select>
 *   conference_attendees.created_by   free text (new; see db-migrations)
 *   attendees (added)            nothing at all — a system actor
 *
 * Four shapes, one avatar. Resolving them at each call site would mean getting
 * the same thing right eight times, and the failure mode is silent: an id that
 * resolves to nothing renders a blank name, which looks like a styling bug
 * rather than a lookup that went to the wrong table.
 *
 * ── Batched on purpose ───────────────────────────────────────────────────────
 *
 * `resolveActors` takes every reference in a page of feed items and issues at
 * most two queries — one per id vocabulary — rather than one per card. A feed
 * page is 20-plus items and the alternative is 20-plus round trips to answer a
 * question with a dozen distinct answers.
 *
 * ── Never throws ─────────────────────────────────────────────────────────────
 *
 * An unresolvable actor is a card that still renders, with whatever the raw
 * value was and a neutral avatar. A feed that 500s because one rep profile was
 * deleted is worse than a feed with one grey initial in it.
 */

import type { Client } from '@libsql/client';

/** Which vocabulary an identifier belongs to. */
export type ActorSource =
  /** `config_options.id`, category 'user' — the rep-profile vocabulary. */
  | 'rep_config'
  /** `users.id` — the login vocabulary. */
  | 'user'
  /** A display name already, stored as typed. */
  | 'text'
  /** Nobody — an import, a backfill, a row with no actor column. */
  | 'system';

export interface ActorRef {
  source: ActorSource;
  /** The stored value. Null or empty resolves to the system actor. */
  id: string | number | null | undefined;
}

export interface ResolvedActor {
  /** What to print. Never empty — falls back to 'Parlay' for the system actor. */
  name: string;
  /**
   * What to hash for the avatar colour and initials.
   *
   * Separate from `name` so an unresolved id does not colour itself from a
   * number: two different missing reps would otherwise get two different
   * colours and read as two different people.
   */
  avatarSeed: string;
  /** True when there is no person behind this — render the neutral avatar. */
  system: boolean;
  /** True when the identifier could not be resolved and `name` is a fallback. */
  unresolved: boolean;
}

export const SYSTEM_ACTOR: ResolvedActor = {
  name: 'Parlay',
  avatarSeed: 'system',
  system: true,
  unresolved: false,
};

/** The parts of a possibly comma-separated identifier, trimmed and non-empty. */
function splitRefs(id: string | number | null | undefined): string[] {
  return String(id ?? '').split(',').map(s => s.trim()).filter(Boolean);
}

/** True for a value that looks like a row id rather than a name. */
function isNumericId(value: string): boolean {
  return value !== '' && !Number.isNaN(Number(value));
}

/**
 * One display string for a list of resolved parts.
 *
 * Two reps booked a meeting together; the card has room for one name. The first
 * plus a count says so without pretending the second does not exist.
 */
function joinNames(names: string[]): string {
  if (names.length === 0) return '';
  if (names.length === 1) return names[0];
  return `${names[0]} +${names.length - 1}`;
}

/** A stable key for one reference, so a Map can hold the answers. */
export function actorKey(ref: ActorRef): string {
  if (ref.source === 'system' || ref.id == null || String(ref.id).trim() === '') return 'system';
  return `${ref.source}:${String(ref.id).trim()}`;
}

/**
 * Resolve every reference in one batch.
 *
 * The returned map is keyed by `actorKey(ref)`, and always contains an entry for
 * every key asked about — an unresolved id maps to a fallback rather than being
 * absent, so callers never have to handle a miss.
 */
export async function resolveActors(
  client: Client,
  refs: ActorRef[],
): Promise<Map<string, ResolvedActor>> {
  const out = new Map<string, ResolvedActor>();
  out.set('system', SYSTEM_ACTOR);

  const repIds = new Set<string>();
  const userIds = new Set<string>();

  for (const ref of refs) {
    const key = actorKey(ref);
    if (key === 'system' || out.has(key)) continue;

    if (ref.source === 'text') {
      // Already a name. It resolves to itself, and seeds its own avatar, which
      // is what makes a free-text actor look like the same person as the same
      // name arriving through a different column.
      const name = String(ref.id).trim();
      out.set(key, { name, avatarSeed: name, system: false, unresolved: false });
      continue;
    }
    // `rep_config` values are a comma-separated LIST — a meeting can be booked
    // by several reps — and legacy rows hold plain names where newer ones hold
    // ids. Passing the raw string as one id was why every meeting in the feed
    // read "Unknown user" while the attendee page showed the right rep: the
    // page splits and resolves each part, and this did not.
    if (ref.source === 'rep_config') {
      for (const part of splitRefs(ref.id)) if (isNumericId(part)) repIds.add(part);
    }
    if (ref.source === 'user') userIds.add(String(ref.id).trim());
  }

  // Two queries at most, whatever the page size.
  const [repRows, userRows] = await Promise.all([
    repIds.size > 0
      ? client.execute({
          sql: `SELECT id, value FROM config_options
                WHERE category = 'user' AND id IN (${Array.from(repIds).map(() => '?').join(',')})`,
          args: Array.from(repIds),
        }).catch(() => ({ rows: [] as Record<string, unknown>[] }))
      : Promise.resolve({ rows: [] as Record<string, unknown>[] }),
    userIds.size > 0
      ? client.execute({
          sql: `SELECT id, COALESCE(display_name, email) AS name FROM users
                WHERE id IN (${Array.from(userIds).map(() => '?').join(',')})`,
          args: Array.from(userIds),
        }).catch(() => ({ rows: [] as Record<string, unknown>[] }))
      : Promise.resolve({ rows: [] as Record<string, unknown>[] }),
  ]);

  for (const row of repRows.rows) {
    const name = String((row as Record<string, unknown>).value ?? '').trim();
    if (!name) continue;
    out.set(`rep_config:${String((row as Record<string, unknown>).id)}`,
      { name, avatarSeed: name, system: false, unresolved: false });
  }
  for (const row of userRows.rows) {
    const name = String((row as Record<string, unknown>).name ?? '').trim();
    if (!name) continue;
    out.set(`user:${String((row as Record<string, unknown>).id)}`,
      { name, avatarSeed: name, system: false, unresolved: false });
  }

  // Resolve each rep reference from its parts. A numeric part that looked up
  // becomes a name; a non-numeric part IS a name already, on a row written
  // before ids were stored.
  for (const ref of refs) {
    if (ref.source !== 'rep_config') continue;
    const key = actorKey(ref);
    if (key === 'system' || out.has(key)) continue;

    // Deduplicated. The stored list can repeat an id — the same rep recorded
    // more than once on one meeting — and counting the repeats produced
    // "Parlay User +2" for a meeting one person logged.
    const names: string[] = [];
    const addName = (name: string) => { if (name && !names.includes(name)) names.push(name); };
    for (const part of splitRefs(ref.id)) {
      if (isNumericId(part)) {
        const found = out.get(`rep_config:${part}`);
        if (found) addName(found.name);
      } else {
        addName(part);
      }
    }
    if (names.length > 0) {
      const name = joinNames(names);
      // Seeded from the FIRST name, not the joined string, so "Kevin Winn" and
      // "Kevin Winn +1" get the same avatar — it is the same person leading.
      out.set(key, { name, avatarSeed: names[0], system: false, unresolved: false });
    }
  }

  // Anything still missing: a deleted rep profile, a removed user, an id that
  // was never valid. The card renders with a neutral avatar and says so rather
  // than showing a bare number or an empty space where a name should be.
  for (const ref of refs) {
    const key = actorKey(ref);
    if (out.has(key)) continue;
    out.set(key, {
      name: 'Unknown user',
      avatarSeed: 'unknown',
      system: false,
      unresolved: true,
    });
  }

  return out;
}

/** The resolved actor for one reference, with the system actor as the floor. */
export function actorFor(map: Map<string, ResolvedActor>, ref: ActorRef): ResolvedActor {
  return map.get(actorKey(ref)) ?? SYSTEM_ACTOR;
}
