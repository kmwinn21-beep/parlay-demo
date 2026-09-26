/**
 * The switch workflow's reads and writes.
 *
 * The rules are in lib/vendorSwitch.ts and stay there. This is the part that
 * needs a database: what the account's other relationships say, which company
 * types carry the competitor key, and the writes that follow an answer.
 *
 * Shared because the prompt fires from three places — the update form, the add
 * form and the edit form. Every time a rule in this codebase has lived in three
 * places the three have drifted, and here "drifted" would mean one entry path
 * silently recording no switches at all.
 */

import type { getDb } from '@/lib/getDb';
import {
  buildStatusIndex, makeIsCompetitor,
  type ResolutionCompany, type StatusIndex,
} from '@/lib/competitiveResolution';
import {
  arrivalEnds, arrivalEntry, departureEntry, endsOf, findIncumbents, isArrival, isDeparture,
  switchNote, SWITCH_ANSWERS, type SwitchAnswer, type SwitchRow,
} from '@/lib/vendorSwitch';

type Db = Awaited<ReturnType<typeof getDb>>;

const splitList = (raw: unknown): string[] =>
  !raw ? [] : String(raw).split(',').map(v => v.trim()).filter(Boolean);

/** A company the prompt names. */
export interface SwitchCompany { id: number; name: string }

/** What a save wants the rep to be asked, or nothing. */
export type SwitchPrompt =
  | {
      kind: 'arrival';
      relationshipId: number;
      accountId: number;
      accountName: string;
      incoming: SwitchCompany;
      /**
       * Whether the arriving company is already typed Competitor.
       *
       * Decides whether the prompt offers to mark it. Answered here because the
       * column stores either an option id or the value, and resolving that in
       * the browser would be a second place it is worked out.
       */
      incomingIsCompetitor: boolean;
      /** Every competitor already current here. Several is a real answer. */
      incumbents: (SwitchCompany & { relationshipId: number })[];
    }
  | {
      kind: 'departure';
      relationshipId: number;
      accountId: number;
      accountName: string;
      outgoing: SwitchCompany;
      /** Copied onto a relationship this workflow creates, as a default. */
      vendorType: string[];
    };

/** The config both halves of the workflow read. */
export interface SwitchContext {
  index: StatusIndex;
  competitorTypes: string[];
  /** company_type option id → value, since the column stores either. */
  typeById: Map<string, string>;
}

export async function loadSwitchContext(db: Db): Promise<SwitchContext> {
  const [statusRes, compTypeRes, typeOpts] = await Promise.all([
    db.execute({
      sql: `SELECT value, inverse_value, action_key FROM config_options
            WHERE category = 'other_relationship_status'`,
      args: [],
    }).catch(() => ({ rows: [] as Record<string, unknown>[] })),
    // The action_key, never the word: an account that renamed Competitor still
    // has competitors.
    db.execute({
      sql: `SELECT value FROM config_options
            WHERE category = 'company_type' AND action_key = 'competitor'`,
      args: [],
    }).catch(() => ({ rows: [] as Record<string, unknown>[] })),
    db.execute({
      sql: `SELECT id, value FROM config_options WHERE category = 'company_type'`,
      args: [],
    }).catch(() => ({ rows: [] as Record<string, unknown>[] })),
  ]);
  return {
    index: buildStatusIndex(statusRes.rows.map(r => ({
      value: String(r.value ?? ''),
      inverseValue: r.inverse_value ? String(r.inverse_value) : null,
      actionKey: r.action_key ? String(r.action_key) : null,
    }))),
    competitorTypes: compTypeRes.rows.map(r => String(r.value ?? '')).filter(Boolean),
    typeById: new Map(typeOpts.rows.map(r => [String(r.id), String(r.value)])),
  };
}

/** Companies by id, with their types resolved from ids or values. */
export async function loadCompanies(
  db: Db, ids: number[], ctx: SwitchContext,
): Promise<Map<number, ResolutionCompany>> {
  const unique = Array.from(new Set(ids.filter(Boolean)));
  const out = new Map<number, ResolutionCompany>();
  const CHUNK = 500;
  for (let i = 0; i < unique.length; i += CHUNK) {
    const slice = unique.slice(i, i + CHUNK);
    const res = await db.execute({
      sql: `SELECT id, name, company_type FROM companies
            WHERE id IN (${slice.map(() => '?').join(',')})`,
      args: slice,
    }).catch(() => ({ rows: [] as Record<string, unknown>[] }));
    for (const r of res.rows) {
      out.set(Number(r.id), {
        id: Number(r.id),
        name: r.name ? String(r.name) : '',
        types: splitList(r.company_type).map(p => ctx.typeById.get(p) ?? p),
      });
    }
  }
  return out;
}

/** Every stored row touching a company, both directions. */
async function rowsTouching(db: Db, companyId: number): Promise<SwitchRow[]> {
  const res = await db.execute({
    sql: `SELECT id, company_id, related_company_id, relationship_status
          FROM vendor_relationships
          WHERE company_id = ? OR related_company_id = ?`,
    args: [companyId, companyId],
  }).catch(() => ({ rows: [] as Record<string, unknown>[] }));
  return res.rows.map(r => ({
    id: Number(r.id),
    companyId: Number(r.company_id),
    relatedCompanyId: Number(r.related_company_id),
    statuses: splitList(r.relationship_status),
  }));
}

/**
 * What to ask after a save, or nothing.
 *
 * Both doors, one function, so the three entry points cannot disagree about
 * when a rep gets interrupted.
 *
 * Deliberately narrow. It asks only when the relationship that just moved is
 * an account's relationship with a COMPETITOR, and only on the two transitions
 * that mean something: becoming current while another competitor is current,
 * and going from current to former. Everything else saves silently.
 */
export async function detectSwitchPrompt(db: Db, {
  relationshipId, before, ctx,
}: {
  relationshipId: number;
  /** The statuses as stored BEFORE this save. Empty on a create. */
  before: string[];
  ctx: SwitchContext;
}): Promise<SwitchPrompt | null> {
  const res = await db.execute({
    sql: `SELECT id, company_id, related_company_id, relationship_status, vendor_type
          FROM vendor_relationships WHERE id = ?`,
    args: [relationshipId],
  }).catch(() => ({ rows: [] as Record<string, unknown>[] }));
  if (res.rows.length === 0) return null;
  const r = res.rows[0];
  const saved: SwitchRow = {
    id: Number(r.id),
    companyId: Number(r.company_id),
    relatedCompanyId: Number(r.related_company_id),
    statuses: splitList(r.relationship_status),
  };

  const arrival = isArrival(before, saved.statuses, ctx.index);
  const departure = isDeparture(before, saved.statuses, ctx.index);
  if (!arrival && !departure) return null;

  const companies = await loadCompanies(
    db, [saved.companyId, saved.relatedCompanyId], ctx,
  );
  const isCompetitor = makeIsCompetitor(companies, ctx.competitorTypes);

  if (departure) {
    // A departure needs the leaver to have BEEN a competitor — that is what
    // makes their leaving competitive news.
    const ends = endsOf(saved, ctx.index, isCompetitor);
    if (!ends) return null;
    return {
      kind: 'departure',
      relationshipId: saved.id,
      accountId: ends.accountId,
      accountName: companies.get(ends.accountId)?.name ?? '',
      outgoing: { id: ends.competitorId, name: companies.get(ends.competitorId)?.name ?? '' },
      vendorType: splitList(r.vendor_type),
    };
  }

  // An arrival does not. The company moving in may not be typed Competitor
  // yet, which is exactly what the prompt offers to fix — requiring it here
  // would skip the prompt in the case it was built for. What makes this
  // competitive news is the INCUMBENT, tested below.
  const ends = arrivalEnds(saved, ctx.index, isCompetitor);
  if (!ends) return null;
  const rows = await rowsTouching(db, ends.accountId);
  const far = Array.from(new Set(rows.flatMap(x => [x.companyId, x.relatedCompanyId])));
  const all = await loadCompanies(db, far, ctx);
  const isCompetitorAll = makeIsCompetitor(all, ctx.competitorTypes);
  const found = findIncumbents({
    accountId: ends.accountId,
    incomingCompanyId: ends.vendorId,
    rows,
    index: ctx.index,
    isCompetitor: isCompetitorAll,
    excludeRelationshipId: saved.id,
  });
  if (found.length === 0) return null;

  return {
    kind: 'arrival',
    relationshipId: saved.id,
    accountId: ends.accountId,
    accountName: companies.get(ends.accountId)?.name ?? '',
    incoming: { id: ends.vendorId, name: companies.get(ends.vendorId)?.name ?? '' },
    incomingIsCompetitor: isCompetitor(ends.vendorId),
    incumbents: found.map(i => ({
      relationshipId: i.relationshipId,
      id: i.competitorId,
      name: all.get(i.competitorId)?.name ?? '',
    })),
  };
}

export interface ApplySwitchInput {
  accountId: number;
  incumbentCompanyId: number;
  incumbentRelationshipId?: number | null;
  incomingCompanyId?: number | null;
  incomingRelationshipId?: number | null;
  answer: SwitchAnswer;
  /** Tick the box and the incoming company is typed Competitor as well. */
  markCompetitor?: boolean;
  /** Prefills a relationship this creates. The rep sees and can change it. */
  vendorType?: string[];
  /** Whose rep the created relationship belongs to. */
  repId?: number | null;
}

export interface ApplySwitchResult {
  switchId: number;
  /** Set when a relationship was created rather than found. */
  createdRelationshipId?: number;
  /** Set when the incoming company was typed Competitor by this call. */
  markedCompetitor?: boolean;
}

/**
 * Record the answer and do what it implies.
 *
 * The record is written whatever the answer: "keeping" and "unknown" are the
 * point of asking as much as "replacing" is. Only "replacing" moves any status.
 *
 * Every status this moves gets a thread entry naming what happened and who did
 * it. The rep did not open that card and will not remember touching it, so a
 * status that moved with no author is worse there than anywhere else.
 */
export async function applySwitch(
  db: Db, userId: number | null, input: ApplySwitchInput, ctx: SwitchContext,
): Promise<ApplySwitchResult> {
  if (!SWITCH_ANSWERS.includes(input.answer)) {
    throw new Error(`Unknown answer: ${input.answer}`);
  }

  const companies = await loadCompanies(db, [
    input.accountId, input.incumbentCompanyId, input.incomingCompanyId ?? 0,
  ], ctx);
  const incumbentName = companies.get(input.incumbentCompanyId)?.name ?? 'the previous vendor';
  const incomingName = input.incomingCompanyId
    ? companies.get(input.incomingCompanyId)?.name ?? '' : null;

  let incomingRelationshipId = input.incomingRelationshipId ?? null;
  let createdRelationshipId: number | undefined;
  let markedCompetitor: boolean | undefined;

  if (input.answer === 'replacing') {
    // The outgoing relationship, written from the side its row lives on.
    if (input.incumbentRelationshipId) {
      await setStatus(db, ctx, {
        relationshipId: input.incumbentRelationshipId,
        accountId: input.accountId,
        target: 'former',
        note: departureEntry(incomingName),
        userId,
      });
    }

    if (input.incomingCompanyId) {
      if (!incomingRelationshipId) {
        const existing = await findRelationship(db, input.accountId, input.incomingCompanyId);
        incomingRelationshipId = existing;
      }
      if (incomingRelationshipId) {
        await setStatus(db, ctx, {
          relationshipId: incomingRelationshipId,
          accountId: input.accountId,
          target: 'current',
          note: arrivalEntry(incumbentName),
          userId,
        });
      } else {
        // Nothing recorded this vendor yet. Created rather than left to the rep:
        // the switch they just described has two ends and only one of them
        // exists, and a grid missing the arrival would show a departure to
        // nowhere.
        createdRelationshipId = await createRelationship(db, ctx, {
          accountId: input.accountId,
          vendorCompanyId: input.incomingCompanyId,
          vendorType: input.vendorType ?? [],
          repId: input.repId ?? null,
          notes: switchNote(incumbentName, incomingName ?? '', new Date()),
        });
        incomingRelationshipId = createdRelationshipId ?? null;
      }

      if (input.markCompetitor) {
        markedCompetitor = await addCompetitorType(db, ctx, input.incomingCompanyId);
      }
    }
  }

  const inserted = await db.execute({
    sql: `INSERT INTO vendor_switches
            (account_company_id, incumbent_company_id, incumbent_relationship_id,
             incoming_company_id, incoming_relationship_id, answer, recorded_by_user_id)
          VALUES (?, ?, ?, ?, ?, ?, ?)
          RETURNING id`,
    args: [
      input.accountId, input.incumbentCompanyId, input.incumbentRelationshipId ?? null,
      input.incomingCompanyId ?? null, incomingRelationshipId, input.answer, userId,
    ],
  });

  return {
    switchId: Number(inserted.rows[0]?.id ?? 0),
    ...(createdRelationshipId ? { createdRelationshipId } : {}),
    ...(markedCompetitor ? { markedCompetitor } : {}),
  };
}

/** The account's relationship with a company, either way round, or null. */
async function findRelationship(
  db: Db, accountId: number, otherId: number,
): Promise<number | null> {
  const res = await db.execute({
    sql: `SELECT id FROM vendor_relationships
          WHERE (company_id = ? AND related_company_id = ?)
             OR (company_id = ? AND related_company_id = ?)
          ORDER BY id LIMIT 1`,
    args: [accountId, otherId, otherId, accountId],
  }).catch(() => ({ rows: [] as Record<string, unknown>[] }));
  return res.rows.length > 0 ? Number(res.rows[0].id) : null;
}

/**
 * Move a relationship's status to a class, in the wording its row uses.
 *
 * The row can live on either company's page, and the status is written from
 * that side. Writing "Former Vendor" onto a row stored on the competitor's page
 * would say the ACCOUNT is the former vendor — silently reversing which end the
 * grid believes is the vendor. So the value is chosen for the side the row is
 * on, through the same pairing every reader uses.
 */
async function setStatus(db: Db, ctx: SwitchContext, {
  relationshipId, accountId, target, note, userId,
}: {
  relationshipId: number;
  accountId: number;
  target: 'former' | 'current';
  note: string;
  userId: number | null;
}): Promise<void> {
  const res = await db.execute({
    sql: `SELECT id, company_id, related_company_id, relationship_status
          FROM vendor_relationships WHERE id = ?`,
    args: [relationshipId],
  }).catch(() => ({ rows: [] as Record<string, unknown>[] }));
  if (res.rows.length === 0) return;
  const r = res.rows[0];
  const before = splitList(r.relationship_status);
  // The account on the LOGGING end means the row is written from the account's
  // side, so it takes the vendor-naming half. On the far end it is written from
  // the vendor's side and takes the counterpart.
  const fromAccountSide = Number(r.company_id) === accountId;
  const value = statusValueFor(ctx, target, fromAccountSide);
  if (!value || before.join() === value) return;

  await db.execute({
    sql: `UPDATE vendor_relationships
          SET relationship_status = ?, updated_at = datetime('now'),
              status_changed_at = datetime('now')
          WHERE id = ?`,
    args: [value, relationshipId],
  });
  // The card has to say why. Somebody else owns this record and did not make
  // this change.
  await db.execute({
    sql: `INSERT INTO relationship_updates
            (relationship_id, body, status_before, status_after, marked_stale, author_user_id)
          VALUES (?, ?, ?, ?, 0, ?)`,
    args: [relationshipId, note, before.join(',') || null, value, userId],
    // Logged, not swallowed. The status has already moved and rolling it back
    // would be worse — but a card whose status changed with no entry saying
    // why is the exact thing this entry exists to prevent, so its loss must
    // not be silent.
  }).catch(err => console.error('vendor switch: thread entry failed', err));
}

/**
 * The configured status for a class, on one side of the pairing.
 *
 * Reads the index rather than hard-coding "Former Vendor": an account that
 * renamed its statuses still has them, and the class is what this workflow
 * actually means.
 */
function statusValueFor(
  ctx: SwitchContext, target: 'former' | 'current', fromAccountSide: boolean,
): string | null {
  for (const [value, cls] of Array.from(ctx.index.classOf.entries())) {
    if (cls !== target) continue;
    const end = ctx.index.vendorEndOf.get(value);
    // 'related' is the half that names the other company — which is what the
    // account's side of the row says. 'logging' is its counterpart.
    if (fromAccountSide ? end === 'related' : end === 'logging') {
      return ctx.index.original.get(value) ?? value;
    }
  }
  return null;
}

async function createRelationship(db: Db, ctx: SwitchContext, {
  accountId, vendorCompanyId, vendorType, repId, notes,
}: {
  accountId: number;
  vendorCompanyId: number;
  vendorType: string[];
  repId: number | null;
  notes: string;
}): Promise<number | undefined> {
  const value = statusValueFor(ctx, 'current', true);
  if (!value) return undefined;
  const res = await db.execute({
    sql: `INSERT INTO vendor_relationships
            (company_id, related_company_id, rep_id, relationship_status,
             strength, vendor_type, notes, status_changed_at)
          VALUES (?, ?, ?, ?, NULL, ?, ?, datetime('now'))
          RETURNING id`,
    // Strength deliberately blank: nobody has assessed it yet, and a guess
    // there is a claim about a relationship that started five minutes ago.
    args: [
      accountId, vendorCompanyId, repId, value,
      vendorType.filter(Boolean).join(',') || null, notes,
    ],
  }).catch(() => ({ rows: [] as Record<string, unknown>[] }));
  return res.rows.length > 0 ? Number(res.rows[0].id) : undefined;
}

/**
 * Add the competitor type to a company, keeping the types it already has.
 *
 * Appended, never replaced: a company can be a Vendor and a Competitor, and
 * overwriting the column would drop whatever else it was. Returns false when
 * it was already one, so the caller can tell a change from a no-op.
 */
async function addCompetitorType(
  db: Db, ctx: SwitchContext, companyId: number,
): Promise<boolean> {
  const target = ctx.competitorTypes[0];
  if (!target) return false;
  const res = await db.execute({
    sql: 'SELECT company_type FROM companies WHERE id = ?',
    args: [companyId],
  }).catch(() => ({ rows: [] as Record<string, unknown>[] }));
  if (res.rows.length === 0) return false;
  const raw = splitList(res.rows[0].company_type);
  const resolved = raw.map(p => ctx.typeById.get(p) ?? p);
  if (resolved.some(t => t.trim().toLowerCase() === target.trim().toLowerCase())) return false;
  await db.execute({
    sql: `UPDATE companies SET company_type = ? WHERE id = ?`,
    args: [[...raw, target].join(','), companyId],
  });
  return true;
}
