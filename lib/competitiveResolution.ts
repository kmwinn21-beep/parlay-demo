/**
 * Which end of a stored relationship is the competitor, and which is the account.
 *
 * The one place this is decided. vendor_relationships is directional but not in
 * the way the column names suggest: company_id is whoever's page somebody was on
 * when they logged the row, and the status is written from THAT side. So
 * "Current Vendor" on Abshire → Abbott means Abbott is the vendor, while
 * "Customer" on Abbott → Abshire means Abshire is the customer and Abbott is the
 * vendor — the same fact, the same pair, opposite columns.
 *
 * Both shapes are storable: since relationship statuses gained counterparts, the
 * dropdown offers both halves and the row is stored as written. Keying the grid
 * on related_company_id would therefore put a competitor in the account row on
 * every relationship somebody happened to log from the other side.
 *
 * The rule:
 *
 *   The vendor end is the end the STATUS points at, after normalising through
 *   the counterpart pairing. Never the end that happens to hold company_id.
 *
 *   A relationship is in this view when both hold:
 *     a) its status resolves to a class — current / evaluating / former — read
 *        from the account's side, and
 *     b) the vendor end is typed Competitor, matched on the company_type
 *        action_key rather than the words, and tolerant of a company carrying
 *        several types.
 *
 *   Neither end a competitor means the relationship is not in this view at all.
 *   That is the partnership landscape, which is a different question.
 *
 * Fails closed. A status nobody classified keeps its pair and its direction and
 * arrives with statusClass null, so it is counted as unclassified rather than
 * guessed at or silently dropped — see deriveSignals.
 */

import type { SignalRelationship, StatusClass } from '@/lib/competitiveSignals';

/** A stored row, as the table holds it. One row, not one row per end. */
export interface RawRelationshipRow {
  id: number;
  /** Whoever's page it was logged on. The status is written from this side. */
  companyId: number;
  relatedCompanyId: number;
  /** As written. Never rewritten before it gets here. */
  statuses: string[];
  statusChangedAt?: string | null;
}

/** A configured relationship status, with its counterpart and its class. */
export interface StatusConfigRow {
  value: string;
  inverseValue?: string | null;
  actionKey?: string | null;
}

export interface ResolutionCompany {
  id: number;
  name: string;
  /** Resolved company_type values, already split from the stored list. */
  types: string[];
}

export interface CompetitorColumnData {
  id: number;
  name: string;
  accountCount: number;
}

export interface ResolutionResult {
  /**
   * companyId is the ACCOUNT and competitorId the COMPETITOR, both normalised.
   * Fed straight to deriveSignals, which is why it is that type and not a
   * near-copy of it.
   */
  relationships: SignalRelationship[];
  competitors: CompetitorColumnData[];
  /** Rows where neither end is typed Competitor. Not this view's business. */
  notCompetitive: number;
  /** Rows folded into a pair already seen from the other side. */
  duplicates: number;
}

const lower = (s: string) => s.trim().toLowerCase();

const CLASSES: StatusClass[] = ['current', 'evaluating', 'former'];

function asClass(raw: string | null | undefined): StatusClass | null {
  const key = lower(String(raw ?? ''));
  return (CLASSES as string[]).includes(key) ? (key as StatusClass) : null;
}

/**
 * What a status says about direction, and what class it carries.
 *
 * Built from both halves of every configured pairing. A status is
 * vendor-naming when it is a configured `value` with a different counterpart —
 * that half describes the OTHER company, which is how an outbound row is read
 * everywhere else. The counterpart half describes the logging company, so it
 * points the other way.
 *
 * A symmetric status — its own counterpart, or no counterpart at all — points
 * nowhere, and company_type has to decide.
 */
export interface StatusIndex {
  /** lowered status → the class on its config row, for either half. */
  classOf: Map<string, StatusClass | null>;
  /** lowered status → which end of the stored row it names as the vendor. */
  vendorEndOf: Map<string, 'related' | 'logging'>;
}

export function buildStatusIndex(rows: StatusConfigRow[]): StatusIndex {
  const classOf = new Map<string, StatusClass | null>();
  const vendorEndOf = new Map<string, 'related' | 'logging'>();

  for (const r of rows) {
    const v = String(r.value ?? '').trim();
    if (!v) continue;
    const inv = String(r.inverseValue ?? '').trim();
    const cls = asClass(r.actionKey);

    // A configured value wins over the same word arriving as somebody else's
    // counterpart, the same way buildCounterpartMap resolves it.
    classOf.set(lower(v), cls);
    if (inv && !classOf.has(lower(inv))) classOf.set(lower(inv), cls);

    if (inv && inv !== v) {
      vendorEndOf.set(lower(v), 'related');
      if (!vendorEndOf.has(lower(inv))) vendorEndOf.set(lower(inv), 'logging');
    }
  }
  return { classOf, vendorEndOf };
}

/**
 * The class a row's statuses resolve to, or null.
 *
 * First status that carries one. A row with several is rare, and the stored
 * order is the order somebody picked them in, so first wins rather than an
 * invented precedence. Exported because the switch workflow asks the same
 * question at save time and two answers to it would be two answers.
 */
export function classOfStatuses(statuses: string[], index: StatusIndex): StatusClass | null {
  for (const s of statuses) {
    const cls = index.classOf.get(lower(s));
    if (cls) return cls;
  }
  return null;
}

/**
 * Which end of a stored row the statuses name as the vendor, or null.
 *
 * Null means the words point nowhere — a symmetric status, or one nobody
 * configured — and the caller falls back to company_type. Exported for the
 * same reason as classOfStatuses.
 */
export function vendorEndOfStatuses(
  statuses: string[], index: StatusIndex,
): 'related' | 'logging' | null {
  for (const s of statuses) {
    const end = index.vendorEndOf.get(lower(s));
    if (end) return end;
  }
  return null;
}

/** True when any of a company's types carries the competitor action_key. */
export function makeIsCompetitor(
  companies: Map<number, ResolutionCompany>, competitorTypes: Iterable<string>,
): (id: number) => boolean {
  const set = new Set(Array.from(competitorTypes, lower));
  return (id: number) => (companies.get(id)?.types ?? []).some(t => set.has(lower(t)));
}

/**
 * Normalise stored rows into account → competitor relationships.
 *
 * competitorTypeKeys is the set of company_type values whose action_key marks
 * them a competitor. Resolved by the caller from config_options, because the
 * column stores either an option id or the value itself depending on when the
 * row was written and that is already handled once upstream.
 */
export function resolveCompetitive({
  rows, statusConfig, companies, competitorTypes,
}: {
  rows: RawRelationshipRow[];
  statusConfig: StatusConfigRow[];
  companies: Map<number, ResolutionCompany>;
  /** company_type VALUES that carry the competitor action_key. */
  competitorTypes: Iterable<string>;
}): ResolutionResult {
  const index = buildStatusIndex(statusConfig);
  const isCompetitor = makeIsCompetitor(companies, competitorTypes);

  // Best row per normalised pair, so a relationship logged from both sides is
  // one entry. Keyed account:competitor, which is the pair as the grid reads it
  // — collapsePairs keys on the stored ends instead, because a card belongs to
  // the page it is on and a cell does not.
  const best = new Map<string, SignalRelationship>();
  let notCompetitive = 0;
  let duplicates = 0;

  for (const row of rows) {
    const end = vendorEndOfStatuses(row.statuses, index);
    const statusClass = classOfStatuses(row.statuses, index);

    let competitorId: number;
    let accountId: number;
    if (end === 'related') {
      competitorId = row.relatedCompanyId; accountId = row.companyId;
    } else if (end === 'logging') {
      competitorId = row.companyId; accountId = row.relatedCompanyId;
    } else {
      // Symmetric, or a status nobody classified: the words point nowhere, so
      // the types decide. When both ends are competitors the row is read as
      // written — a competitor buying from another competitor is real intel and
      // the logging side is the one that recorded it.
      if (isCompetitor(row.relatedCompanyId)) {
        competitorId = row.relatedCompanyId; accountId = row.companyId;
      } else if (isCompetitor(row.companyId)) {
        competitorId = row.companyId; accountId = row.relatedCompanyId;
      } else {
        notCompetitive++;
        continue;
      }
    }

    // Never flipped to make it fit. When the status names an end that is not a
    // competitor, this relationship is not account-to-competitor however the
    // other end is typed, and quietly swapping them would invent a purchase in
    // the opposite direction.
    if (!isCompetitor(competitorId)) { notCompetitive++; continue; }

    const resolved: SignalRelationship = {
      id: row.id,
      companyId: accountId,
      competitorId,
      statusClass,
      statusChangedAt: row.statusChangedAt ?? null,
    };

    const key = `${accountId}:${competitorId}`;
    const held = best.get(key);
    if (!held) { best.set(key, resolved); continue; }
    duplicates++;
    if (preferRow(resolved, held)) best.set(key, resolved);
  }

  const relationships = Array.from(best.values());

  // Accounts counted off the CLASSIFIED relationships, so a column's number
  // cannot exceed the cells under it. An unclassified row takes part in no
  // signal and gets no cell; counting it here would promise a card that the
  // grid then does not draw.
  const accountsByCompetitor = new Map<number, Set<number>>();
  for (const r of relationships) {
    if (r.statusClass === null) continue;
    const set = accountsByCompetitor.get(r.competitorId) ?? new Set<number>();
    set.add(r.companyId);
    accountsByCompetitor.set(r.competitorId, set);
  }
  const competitors: CompetitorColumnData[] = Array.from(accountsByCompetitor.entries())
    .map(([id, accounts]) => ({
      id,
      name: companies.get(id)?.name ?? '',
      accountCount: accounts.size,
    }))
    // Widest column first, so the competitor most of the book touches leads.
    // Name breaks the tie rather than insertion order, which would reshuffle
    // the grid between two reads of the same data.
    .sort((a, b) => b.accountCount - a.accountCount || a.name.localeCompare(b.name));

  return { relationships, competitors, notCompetitive, duplicates };
}

/**
 * Which of two rows for the same pair to keep.
 *
 * The later change date wins, then the higher id. The date leads because the
 * Recent Change row sorts on it: losing a real change date to a null moves a
 * card out of the order it belongs in, which is a worse outcome than keeping
 * the older of two rows that agree.
 *
 * A null date becomes the empty string, which sorts below every real stamp, so
 * "a known date beats none" needs no branch of its own. The stamps are
 * SQLite's own `datetime('now')` — fixed-width UTC — so comparing them as text
 * orders them the same way parsing them would.
 */
function preferRow(candidate: SignalRelationship, held: SignalRelationship): boolean {
  const a = String(candidate.statusChangedAt ?? '');
  const b = String(held.statusChangedAt ?? '');
  if (a !== b) return a > b;
  return candidate.id > held.id;
}
