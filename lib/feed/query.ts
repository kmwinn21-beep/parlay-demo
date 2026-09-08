/**
 * The conference activity feed — one query, nine kinds, two scopes.
 *
 * ── Why a UNION and not an activity table ────────────────────────────────────
 *
 * There is no audit log. `account_events` lives in master and records product
 * analytics, not domain records. So the stream is assembled from the tables the
 * app already writes, which means every branch below is reading a table whose
 * shape was decided for some other purpose.
 *
 * Three of them could not answer "when" or "who" at all until this feature
 * added the columns — see the feed block in lib/db-migrations.ts.
 *
 * ── Scope ────────────────────────────────────────────────────────────────────
 *
 * `active` filters to conferences whose COMPUTED stage is in_progress, and
 * `upcoming` to those still in planning. Computed, not
 * `start_date <= today AND end_date >= today`: `stage_override` can force a
 * stage, and inlining the dates would silently ignore it. Historical
 * conferences are excluded before the call because computeConferenceStage
 * throws on them.
 *
 * Neither is windowed by date. Prep for a show six months out is exactly what
 * `upcoming` is for, and a long conference can run past any window.
 *
 * `all` reaches back 90 days across every conference.
 *
 * ── One rule, applied uniformly ──────────────────────────────────────────────
 *
 * An item belongs to the scope its CONFERENCE's stage belongs to. Planning goes
 * to `upcoming`, in_progress to `active`, and everything — including the two
 * stages neither names, and anything with no conference at all — to `all`.
 *
 * Every branch below therefore filters on `conference_id IN (…)` when scoped.
 * A branch that reached a conference scope some other way was the one that
 * leaked, so there are no other ways.
 *
 * ── Never throws ─────────────────────────────────────────────────────────────
 *
 * A feed is furniture. Every branch is individually catchable and a failure
 * returns fewer items rather than an error page — one malformed row in
 * pinned_notes should not take the dashboard down.
 */

import type { Client } from '@libsql/client';
import { computeConferenceStage } from '@/lib/conference-stage';
import { resolveActors, actorFor, type ActorRef } from '@/lib/feed/actors';
import {
  ALL_SCOPE_DAYS, COLOUR_BY_KIND, isConferenceScoped,
  type FeedItem, type FeedKind, type FeedScope,
} from '@/lib/feed/types';

export interface FeedOptions {
  scope: FeedScope;
  /** Injected so tests can pin "now" rather than racing the clock. */
  nowMs?: number;
  /** How many items to return. */
  limit?: number;
  /** Paging: only items strictly older than this timestamp. */
  before?: string | null;
}

export interface FeedResult {
  items: FeedItem[];
  /**
   * Conferences whose computed stage is in_progress.
   *
   * Reported whatever scope was asked for, because it is what decides whether
   * the client polls: something is happening live only when a show is running,
   * regardless of which view is on screen.
   */
  activeConferenceIds: number[];
  /** Conferences still in planning — the empty state for `upcoming` needs it. */
  upcomingConferenceIds: number[];
  /** True when there is at least one more item older than the last returned. */
  hasMore: boolean;
}

interface ConferenceRow {
  id: number;
  name: string;
}

/** SQLite's `datetime('now')` format, which every table here stores. */
function sqlTimestamp(ms: number): string {
  return new Date(ms).toISOString().slice(0, 19).replace('T', ' ');
}

/**
 * The conferences at a given lifecycle stage right now.
 *
 * Exported because the empty states need to distinguish "nothing happened at
 * the show" from "there is no show", and those read very differently.
 */
export async function conferencesAtStage(
  client: Client,
  nowMs: number,
  wanted: 'in_progress' | 'planning',
): Promise<ConferenceRow[]> {
  const rows = await client.execute({
    sql: `SELECT id, name, start_date, end_date, post_conference_days, stage_override, is_historical
          FROM conferences
          WHERE COALESCE(is_historical, 0) = 0`,
    args: [],
  }).catch(() => ({ rows: [] as Record<string, unknown>[] }));

  const out: ConferenceRow[] = [];
  for (const r of rows.rows as unknown as Record<string, unknown>[]) {
    try {
      const stage = computeConferenceStage({
        start_date: String(r.start_date ?? ''),
        end_date: String(r.end_date ?? ''),
        post_conference_days: r.post_conference_days != null ? Number(r.post_conference_days) : null,
        stage_override: r.stage_override != null ? String(r.stage_override) : null,
        is_historical: 0,
      }, nowMs);
      if (stage === wanted) out.push({ id: Number(r.id), name: String(r.name ?? '') });
    } catch {
      // computeConferenceStage throws on a historical conference. The WHERE
      // above already excludes them; this is the belt for a row whose flag is
      // some truthy value the SQL comparison did not catch.
    }
  }
  return out;
}

/** The conferences running right now. Kept as a name because it reads better. */
export function inProgressConferences(client: Client, nowMs: number): Promise<ConferenceRow[]> {
  return conferencesAtStage(client, nowMs, 'in_progress');
}

/**
 * One branch of the union.
 *
 * Every branch projects the SAME column list, in the same order, because that
 * is what UNION ALL requires and what lets the wrapper sort and page across all
 * of them at once. Columns a branch has nothing for are literal NULLs.
 */
interface Branch {
  kind: FeedKind;
  sql: string;
  args: (string | number)[];
}

const PROJECTION = `
  kind, occurred_at, actor_source, actor_id, conference_id, conference_name,
  subject, detail1, detail2, pill1, pill2, body, entity_kind, entity_id, pinned`;

function buildBranches(opts: {
  scope: FeedScope;
  conferenceIds: number[];
  since: string;
  before: string | null;
}): Branch[] {
  const { scope, conferenceIds, since, before } = opts;
  const inConf = conferenceIds.length > 0 ? conferenceIds.map(() => '?').join(',') : 'NULL';
  // Both conference-bound scopes filter the same way; only the id list differs.
  const scoped = scope !== 'all';

  /** The time window, applied per branch so each one uses its own index. */
  const window = (col: string) => {
    const parts = [`${col} IS NOT NULL`, `${col} >= ?`];
    if (before) parts.push(`${col} < ?`);
    return parts.join(' AND ');
  };
  const windowArgs = (): string[] => (before ? [since, before] : [since]);

  const branches: Branch[] = [];

  // ── Meetings ───────────────────────────────────────────────────────────────
  // Two kinds from one table. `outcome_set_at` is when somebody recorded what
  // happened; `created_at` is when the slot was booked. They are different
  // events on different days and the feed shows both.
  branches.push({
    kind: 'meeting_held',
    sql: `SELECT 'meeting_held' AS kind, m.outcome_set_at AS occurred_at,
                 'rep_config' AS actor_source, m.scheduled_by AS actor_id,
                 m.conference_id AS conference_id, NULL AS conference_name,
                 (a.first_name || ' ' || a.last_name) AS subject,
                 a.title AS detail1, co.name AS detail2,
                 m.outcome AS pill1, co.company_type AS pill2,
                 NULL AS body, 'attendee' AS entity_kind, m.attendee_id AS entity_id, 0 AS pinned
          FROM meetings m
          JOIN attendees a ON a.id = m.attendee_id
          LEFT JOIN companies co ON co.id = a.company_id
          WHERE ${window('m.outcome_set_at')}
            AND m.outcome IS NOT NULL AND TRIM(m.outcome) != ''
            ${scoped ? `AND m.conference_id IN (${inConf})` : ''}`,
    args: [...windowArgs(), ...(scoped ? conferenceIds : [])],
  });

  branches.push({
    kind: 'meeting_scheduled',
    sql: `SELECT 'meeting_scheduled' AS kind, m.created_at AS occurred_at,
                 'rep_config' AS actor_source, m.scheduled_by AS actor_id,
                 m.conference_id AS conference_id, NULL AS conference_name,
                 (a.first_name || ' ' || a.last_name) AS subject,
                 m.meeting_date AS detail1, m.meeting_time AS detail2,
                 m.location AS pill1, co.company_type AS pill2,
                 NULL AS body, 'attendee' AS entity_kind, m.attendee_id AS entity_id, 0 AS pinned
          FROM meetings m
          JOIN attendees a ON a.id = m.attendee_id
          LEFT JOIN companies co ON co.id = a.company_id
          WHERE ${window('m.created_at')}
            AND m.superseded_by_id IS NULL
            ${scoped ? `AND m.conference_id IN (${inConf})` : ''}`,
    args: [...windowArgs(), ...(scoped ? conferenceIds : [])],
  });

  // ── Touchpoints ────────────────────────────────────────────────────────────
  branches.push({
    kind: 'touchpoint',
    sql: `SELECT 'touchpoint' AS kind, tp.created_at AS occurred_at,
                 'rep_config' AS actor_source, tp.logged_by AS actor_id,
                 tp.conference_id AS conference_id, NULL AS conference_name,
                 (a.first_name || ' ' || a.last_name) AS subject,
                 a.title AS detail1, co.name AS detail2,
                 opt.value AS pill1, co.company_type AS pill2,
                 NULL AS body, 'attendee' AS entity_kind, tp.attendee_id AS entity_id, 0 AS pinned
          FROM attendee_touchpoints tp
          JOIN attendees a ON a.id = tp.attendee_id
          LEFT JOIN companies co ON co.id = a.company_id
          LEFT JOIN config_options opt ON opt.id = tp.option_id
          WHERE ${window('tp.created_at')}
            ${scoped ? `AND tp.conference_id IN (${inConf})` : ''}`,
    args: [...windowArgs(), ...(scoped ? conferenceIds : [])],
  });

  // ── Notes ──────────────────────────────────────────────────────────────────
  // author_user_id is a `users.id`, unlike every branch above it.
  // `attendee_name` and `company_name` are denormalised copies written at the
  // time, and plenty of rows have neither — those were rendering as "Note on a
  // record", a card that links somewhere but will not say where. The joins
  // resolve the actual record the note hangs off, by its own entity_type.
  //
  // The actor has the same shape of problem. `author_user_id` is only set on
  // notes written since it was added; older rows carry the author's name in
  // `rep`. Falling straight through to the system actor made those cards read
  // "Parlay" — the system actor's own name — for notes a person wrote.
  branches.push({
    kind: 'note',
    sql: `SELECT 'note' AS kind, en.created_at AS occurred_at,
                 CASE WHEN en.author_user_id IS NOT NULL THEN 'user'
                      WHEN COALESCE(TRIM(en.rep), '') != '' THEN 'text'
                      ELSE 'system' END AS actor_source,
                 COALESCE(CAST(en.author_user_id AS TEXT), en.rep) AS actor_id,
                 en.conference_id AS conference_id, en.conference_name AS conference_name,
                 COALESCE(
                   NULLIF(en.attendee_name, ''),
                   NULLIF(en.company_name, ''),
                   NULLIF(TRIM(COALESCE(na.first_name, '') || ' ' || COALESCE(na.last_name, '')), ''),
                   NULLIF(nc.name, ''),
                   NULLIF(ncf.name, ''),
                   'a record'
                 ) AS subject,
                 NULL AS detail1, nco.name AS detail2,
                 en.note_type AS pill1, NULL AS pill2,
                 en.content AS body, en.entity_type AS entity_kind, en.entity_id AS entity_id, 0 AS pinned
          FROM entity_notes en
          LEFT JOIN attendees na ON en.entity_type = 'attendee' AND na.id = en.entity_id
          LEFT JOIN companies nco ON nco.id = na.company_id
          LEFT JOIN companies nc ON en.entity_type = 'company' AND nc.id = en.entity_id
          LEFT JOIN conferences ncf ON en.entity_type = 'conference' AND ncf.id = en.entity_id
          WHERE ${window('en.created_at')}
            ${scoped ? `AND en.conference_id IN (${inConf})` : ''}`,
    args: [...windowArgs(), ...(scoped ? conferenceIds : [])],
  });

  // ── Pinned notes ───────────────────────────────────────────────────────────
  // pinned_notes stores conference_name as free text with no id. It is carried
  // through as a name and matched against the conference list afterwards; an
  // unmatched name renders an unlinked pill rather than no pill.
  //
  // Under in_progress the match happens in TS, so this branch is not filtered
  // here — a name-based IN clause against a list of names would break on the
  // first renamed conference.
  branches.push({
    kind: 'note_pinned',
    sql: `SELECT 'note_pinned' AS kind, pn.created_at AS occurred_at,
                 CASE WHEN COALESCE(TRIM(pn.pinned_by), '') != '' THEN 'text'
                      ELSE 'system' END AS actor_source,
                 pn.pinned_by AS actor_id,
                 NULL AS conference_id, pn.conference_name AS conference_name,
                 COALESCE(NULLIF(pn.attendee_name, ''), 'a record') AS subject,
                 NULL AS detail1, NULL AS detail2,
                 NULL AS pill1, NULL AS pill2,
                 en.content AS body, pn.entity_type AS entity_kind, pn.entity_id AS entity_id, 1 AS pinned
          FROM pinned_notes pn
          LEFT JOIN entity_notes en ON en.id = pn.note_id
          WHERE ${window('pn.created_at')}`,
    args: windowArgs(),
  });

  // ── Vendor relationships ───────────────────────────────────────────────────
  //
  // ALL ONLY. A vendor relationship is a company fact with no conference column,
  // so under the rule every other branch follows — an item belongs to the scope
  // its conference's stage belongs to — it belongs to neither conference scope.
  //
  // An earlier version reached it into the active scope through "either company
  // has an attendee at a running conference". That was the one branch not
  // filtered on conference_id, and it was the leak: relationships logged against
  // no conference at all surfaced under Active. One rule applied uniformly is
  // worth more here than one clever exception.
  if (!scoped) {
    branches.push({
      kind: 'vendor_relationship',
      sql: `SELECT 'vendor_relationship' AS kind, vr.created_at AS occurred_at,
                   'rep_config' AS actor_source, CAST(vr.rep_id AS TEXT) AS actor_id,
                   NULL AS conference_id, NULL AS conference_name,
                   rc.name AS subject,
                   vr.vendor_type AS detail1, c.name AS detail2,
                   vr.relationship_status AS pill1, rc.company_type AS pill2,
                   NULL AS body, 'company' AS entity_kind, vr.company_id AS entity_id, 0 AS pinned
            FROM vendor_relationships vr
            JOIN companies c ON c.id = vr.company_id
            JOIN companies rc ON rc.id = vr.related_company_id
            WHERE ${window('vr.created_at')}`,
      args: [...windowArgs()],
    });
  }

  // ── People ─────────────────────────────────────────────────────────────────
  // Added to a conference, not created in the database: the same person joining
  // a second show is a second event, which is what a conference feed wants.
  branches.push({
    kind: 'attendee_added',
    sql: `SELECT 'attendee_added' AS kind, ca.created_at AS occurred_at,
                 CASE WHEN ca.created_by IS NULL OR TRIM(ca.created_by) = ''
                      THEN 'system' ELSE 'text' END AS actor_source,
                 ca.created_by AS actor_id,
                 ca.conference_id AS conference_id, NULL AS conference_name,
                 (a.first_name || ' ' || a.last_name) AS subject,
                 a.title AS detail1, co.name AS detail2,
                 a.seniority AS pill1, co.company_type AS pill2,
                 NULL AS body, 'attendee' AS entity_kind, ca.attendee_id AS entity_id, 0 AS pinned
          FROM conference_attendees ca
          JOIN attendees a ON a.id = ca.attendee_id
          LEFT JOIN companies co ON co.id = a.company_id
          WHERE ${window('ca.created_at')}
            ${scoped ? `AND ca.conference_id IN (${inConf})` : ''}`,
    args: [...windowArgs(), ...(scoped ? conferenceIds : [])],
  });

  branches.push({
    kind: 'social_event_created',
    sql: `SELECT 'social_event_created' AS kind, se.created_at AS occurred_at,
                 CASE WHEN COALESCE(TRIM(se.entered_by), '') != '' THEN 'text'
                      ELSE 'system' END AS actor_source,
                 se.entered_by AS actor_id,
                 se.conference_id AS conference_id, NULL AS conference_name,
                 COALESCE(NULLIF(se.event_name, ''), NULLIF(se.event_type, ''), 'Social event') AS subject,
                 se.event_type AS detail1,
                 COALESCE(NULLIF(se.venue_name, ''), se.location) AS detail2,
                 se.event_date AS pill1, se.host AS pill2,
                 NULL AS body, 'social_event' AS entity_kind, se.id AS entity_id, 0 AS pinned
          FROM social_events se
          WHERE ${window('se.created_at')}
            ${scoped ? `AND se.conference_id IN (${inConf})` : ''}`,
    args: [...windowArgs(), ...(scoped ? conferenceIds : [])],
  });

  // Only yes and no. A maybe is not news, and 'attended' is a different fact
  // recorded after the event rather than a response to an invitation.
  branches.push({
    kind: 'rsvp',
    sql: `SELECT 'rsvp' AS kind, r.rsvp_set_at AS occurred_at,
                 CASE WHEN r.rsvp_by IS NULL OR TRIM(r.rsvp_by) = ''
                      THEN 'system' ELSE 'text' END AS actor_source,
                 r.rsvp_by AS actor_id,
                 se.conference_id AS conference_id, NULL AS conference_name,
                 (a.first_name || ' ' || a.last_name) AS subject,
                 COALESCE(NULLIF(se.event_name, ''), se.event_type) AS detail1,
                 co.name AS detail2,
                 r.rsvp_status AS pill1, co.company_type AS pill2,
                 NULL AS body, 'social_event' AS entity_kind, r.social_event_id AS entity_id, 0 AS pinned
          FROM social_event_rsvps r
          JOIN social_events se ON se.id = r.social_event_id
          JOIN attendees a ON a.id = r.attendee_id
          LEFT JOIN companies co ON co.id = a.company_id
          WHERE ${window('r.rsvp_set_at')}
            AND (r.rsvp_status LIKE '%yes%' OR r.rsvp_status LIKE '%no%')
            ${scoped ? `AND se.conference_id IN (${inConf})` : ''}`,
    args: [...windowArgs(), ...(scoped ? conferenceIds : [])],
  });

  return branches;
}

/** Where a card of this kind should link, or null when there is nowhere. */
function hrefFor(entityKind: string | null, entityId: number | null): string | null {
  if (entityId == null) return null;
  switch (entityKind) {
    case 'attendee': return `/attendees/${entityId}`;
    case 'company': return `/companies/${entityId}`;
    case 'conference': return `/conferences/${entityId}`;
    case 'social_event': return `/conferences/${entityId}`;
    default: return null;
  }
}

/**
 * The one response an RSVP card should show.
 *
 * `rsvp_status` holds a comma-separated multi-select, so 'maybe,no' and
 * 'maybe,yes' are both real. A yes is the strongest signal and a no is the next
 * — a maybe alongside either is noise, and the raw string printed as a pill read
 * as a state nobody chose.
 */
function rsvpDecision(status: string | null): string | null {
  const parts = String(status ?? '').toLowerCase().split(',').map(s => s.trim());
  if (parts.includes('yes')) return 'Yes';
  if (parts.includes('no')) return 'No';
  return null;
}

/** Drop empties and duplicates without reordering — pills read left to right. */
function pillsFrom(...values: Array<string | null>): string[] {
  const out: string[] = [];
  for (const v of values) {
    const t = (v ?? '').trim();
    if (t && !out.includes(t)) out.push(t);
  }
  return out;
}

/**
 * A page of the feed.
 *
 * Returns `limit` items at most, newest first. `hasMore` is derived by asking
 * for one more than requested and discarding it, which is cheaper than a second
 * COUNT over a nine-branch union.
 */
export async function fetchFeed(client: Client, opts: FeedOptions): Promise<FeedResult> {
  const nowMs = opts.nowMs ?? Date.now();
  const limit = Math.max(1, Math.min(opts.limit ?? 25, 200));
  const before = opts.before ?? null;

  // Both lists are resolved whatever the scope: `active` decides polling and
  // `upcoming` decides its own empty state, and one extra pass over a few dozen
  // conference rows is cheaper than a second round trip to find out.
  const [active, upcoming] = await Promise.all([
    conferencesAtStage(client, nowMs, 'in_progress'),
    conferencesAtStage(client, nowMs, 'planning'),
  ]);
  const activeConferenceIds = active.map(c => c.id);
  const upcomingConferenceIds = upcoming.map(c => c.id);

  const scopeIds = opts.scope === 'active' ? activeConferenceIds
    : opts.scope === 'upcoming' ? upcomingConferenceIds
    : [];

  // No conference at this stage, so the scope has nothing to show. Returned
  // rather than queried: `conference_id IN (NULL)` matches nothing anyway, and
  // the empty states need to know the difference between these two cases.
  if (isConferenceScoped(opts.scope) && scopeIds.length === 0) {
    return { items: [], activeConferenceIds, upcomingConferenceIds, hasMore: false };
  }

  // The conference scopes reach as far back as their conferences do — prep for
  // a show six months out belongs to it. Only `all` is windowed, and that
  // floor is applied per branch so each one uses its index.
  const since = opts.scope === 'all'
    ? sqlTimestamp(nowMs - ALL_SCOPE_DAYS * 86_400_000)
    : '0000-01-01 00:00:00';

  const branches = buildBranches({
    scope: opts.scope,
    conferenceIds: scopeIds,
    since,
    before,
  });

  const sql = `SELECT ${PROJECTION} FROM (
      ${branches.map(b => b.sql).join('\n      UNION ALL\n      ')}
    ) ORDER BY occurred_at DESC LIMIT ?`;
  const args = [...branches.flatMap(b => b.args), limit + 1];

  const result = await client.execute({ sql, args }).catch(err => {
    console.error('[feed] union query failed:', err);
    return { rows: [] as Record<string, unknown>[] };
  });

  const rows = result.rows as unknown as Record<string, unknown>[];
  const hasMore = rows.length > limit;
  const page = rows.slice(0, limit);

  // Conference names, for the pill. Two sources: an id from most branches, and
  // a free-text name from pinned_notes which is matched back to an id where it
  // can be.
  const nameById = await conferenceNames(client, page);

  const refs: ActorRef[] = page.map(r => ({
    source: String(r.actor_source ?? 'system') as ActorRef['source'],
    id: r.actor_id as string | null,
  }));
  const actors = await resolveActors(client, refs);

  const items: FeedItem[] = page.map((r, i) => {
    const kind = String(r.kind) as FeedKind;
    const confId = r.conference_id != null ? Number(r.conference_id) : null;
    const rawName = r.conference_name != null ? String(r.conference_name).trim() : '';

    // An id wins; a name is matched to an id where one exists; a name that
    // matches nothing still renders, unlinked.
    let conference: FeedItem['conference'] = null;
    if (confId != null && nameById.has(confId)) {
      conference = { id: confId, name: nameById.get(confId)! };
    } else if (rawName) {
      const matched = Array.from(nameById.entries()).find(([, n]) => n.toLowerCase() === rawName.toLowerCase());
      conference = matched ? { id: matched[0], name: matched[1] } : { id: null, name: rawName };
    }

    const entityKind = r.entity_kind != null ? String(r.entity_kind) : null;
    const entityId = r.entity_id != null ? Number(r.entity_id) : null;

    return {
      id: `${kind}:${entityId ?? i}:${String(r.occurred_at)}`,
      kind,
      colour: COLOUR_BY_KIND[kind],
      occurredAt: String(r.occurred_at),
      actor: actors.get(`${r.actor_source}:${String(r.actor_id ?? '').trim()}`) ?? actorFor(actors, refs[i]),
      conference,
      href: hrefFor(entityKind, entityId),
      subject: String(r.subject ?? '').trim() || 'a record',
      detail1: r.detail1 != null && String(r.detail1).trim() !== '' ? String(r.detail1) : null,
      detail2: r.detail2 != null && String(r.detail2).trim() !== '' ? String(r.detail2) : null,
      pills: kind === 'rsvp'
        // rsvp_status is a comma-separated multi-select — 'maybe,no' is a real
        // stored value. The feed reports the decision, so a yes or a no wins
        // over a maybe rather than the raw string being printed.
        ? pillsFrom(rsvpDecision(r.pill1 as string | null), r.pill2 as string | null)
        : pillsFrom(r.pill1 as string | null, r.pill2 as string | null),
      body: r.body != null && String(r.body).trim() !== '' ? String(r.body) : null,
      pinned: Number(r.pinned ?? 0) === 1,
    };
  });

  // A pinned note whose conference name matched nothing is still in the page
  // under in_progress, because the branch could not be filtered in SQL. Drop it
  // here, where the names have been resolved to ids.
  const filtered = isConferenceScoped(opts.scope)
    ? items.filter(it => it.kind !== 'note_pinned'
        || (it.conference?.id != null && scopeIds.includes(it.conference.id)))
    : items;

  return { items: filtered, activeConferenceIds, upcomingConferenceIds, hasMore };
}

/** Names for every conference referenced by a page, by id. */
async function conferenceNames(
  client: Client,
  rows: Record<string, unknown>[],
): Promise<Map<number, string>> {
  const ids = new Set<number>();
  for (const r of rows) if (r.conference_id != null) ids.add(Number(r.conference_id));

  // pinned_notes carries a name and no id, so the whole list is needed to match
  // one back. Cheap — an account has tens of conferences, not thousands.
  const anyByName = rows.some(r => r.conference_name != null && String(r.conference_name).trim() !== '');
  const result = await client.execute(
    anyByName || ids.size === 0
      ? { sql: `SELECT id, name FROM conferences`, args: [] }
      : { sql: `SELECT id, name FROM conferences WHERE id IN (${Array.from(ids).map(() => '?').join(',')})`, args: Array.from(ids) },
  ).catch(() => ({ rows: [] as Record<string, unknown>[] }));

  const map = new Map<number, string>();
  for (const r of result.rows as unknown as Record<string, unknown>[]) {
    map.set(Number(r.id), String(r.name ?? ''));
  }
  return map;
}
