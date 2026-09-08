/**
 * One note, several rows — the single definition of what makes them the same.
 *
 * ── The shape of the problem ─────────────────────────────────────────────────
 *
 * A note attached to a conference, a company and an attendee at once is three
 * POSTs to /api/notes and three `entity_notes` rows. app/api/notes/route.ts
 * says so in the comment on `skipExtraction`, which already works around it so
 * one note does not produce three sets of extracted suggestions.
 *
 * Nothing links the rows. No parent id, no group id, no shared token — the
 * client simply posts three times. So "the same note" has to be inferred, and
 * inferring it wrongly is expensive in both directions: the feed showed one
 * note three times, and deleting "all copies" of the wrong set destroys
 * somebody's writing.
 *
 * ── The rule ─────────────────────────────────────────────────────────────────
 *
 * Same text, same author, within COPY_WINDOW_SECONDS, on a DIFFERENT entity
 * type. The last condition carries the weight. Two separate notes with
 * identical text — "Great chat", logged on two attendees seconds apart — are
 * both `attendee` rows, and a copy set has at most one row per entity type
 * because that is how it is written.
 *
 * ── Conservative where it has to be ──────────────────────────────────────────
 *
 * `findNoteCopies` goes further than the feed does and DISCARDS any entity type
 * that matches more than once. If two company rows both look like copies of an
 * attendee note, there is no way to tell which one is, and the caller is about
 * to delete what it is told. The feed can afford to guess because guessing
 * wrong hides a card; delete cannot, because guessing wrong loses a note.
 *
 * ── Why it lives here ────────────────────────────────────────────────────────
 *
 * Two places need it — the feed, which collapses copies into one card, and the
 * delete flow, which offers to remove them together. If they disagreed about
 * what a copy is, the feed would show one card for a set the delete dialog
 * would not offer to delete, and neither surface would look wrong on its own.
 */

import type { Client } from '@libsql/client';

/**
 * How far apart two copies of one note can be written.
 *
 * The three POSTs are issued in parallel from one `Promise.all`, so in practice
 * they land in the same second or the next. Ten leaves room for a slow request
 * without reaching far enough to swallow a second, deliberate note.
 */
export const COPY_WINDOW_SECONDS = 10;

/**
 * How specific a record is, for choosing which copy to keep.
 *
 * The attendee copy names a person and links to them; the conference copy names
 * a show that is usually already on screen. Lower is better. Rendered as SQL so
 * the feed can order copies inside its union.
 */
export function specificityCase(alias: string): string {
  return `(CASE ${alias}.entity_type
             WHEN 'attendee' THEN 1 WHEN 'company' THEN 2 WHEN 'conference' THEN 3 ELSE 4 END)`;
}

/** Two timestamp expressions within the copy window of one another. */
export function withinCopyWindow(a: string, b: string): string {
  return `ABS(strftime('%s', ${a}) - strftime('%s', ${b})) <= ${COPY_WINDOW_SECONDS}`;
}

/** One other row that is the same note, written against a different record. */
export interface NoteCopy {
  id: number;
  /** 'attendee' | 'company' | 'conference', as stored. */
  entityType: string;
  entityId: number;
  /** The record's name, for the dialog. Falls back to the entity type. */
  label: string;
}

export interface NoteCopySet {
  /** False when the note id does not exist in this account. */
  found: boolean;
  /** The other rows that are the same note. Empty when there are none. */
  copies: NoteCopy[];
}

/**
 * The other rows that are the same note as `noteId`.
 *
 * Never throws: a caller that cannot answer this question should offer the
 * plain single delete, not fail.
 */
export async function findNoteCopies(client: Client, noteId: number): Promise<NoteCopySet> {
  const target = await client.execute({
    sql: `SELECT id, entity_type, content, author_user_id, rep, created_at
          FROM entity_notes WHERE id = ?`,
    args: [noteId],
  }).catch(() => ({ rows: [] as Record<string, unknown>[] }));

  const row = (target.rows as unknown as Record<string, unknown>[])[0];
  if (!row) return { found: false, copies: [] };

  const result = await client.execute({
    sql: `SELECT en.id, en.entity_type, en.entity_id,
                 COALESCE(
                   NULLIF(TRIM(COALESCE(a.first_name, '') || ' ' || COALESCE(a.last_name, '')), ''),
                   NULLIF(c.name, ''),
                   NULLIF(cf.name, ''),
                   ''
                 ) AS label
          FROM entity_notes en
          LEFT JOIN attendees a ON en.entity_type = 'attendee' AND a.id = en.entity_id
          LEFT JOIN companies c ON en.entity_type = 'company' AND c.id = en.entity_id
          LEFT JOIN conferences cf ON en.entity_type = 'conference' AND cf.id = en.entity_id
          WHERE en.id != ?
            AND en.entity_type != ?
            AND en.content = ?
            AND COALESCE(en.author_user_id, -1) = COALESCE(?, -1)
            AND COALESCE(TRIM(en.rep), '') = ?
            AND ${withinCopyWindow('en.created_at', '?')}`,
    args: [
      noteId,
      String(row.entity_type ?? ''),
      String(row.content ?? ''),
      row.author_user_id != null ? Number(row.author_user_id) : null,
      String(row.rep ?? '').trim(),
      String(row.created_at ?? ''),
    ],
  }).catch(() => ({ rows: [] as Record<string, unknown>[] }));

  const rows = result.rows as unknown as Record<string, unknown>[];

  // Ambiguity is resolved by refusing to resolve it: an entity type that
  // matched twice tells us a copy set and an unrelated note look alike, and
  // there is nothing in the data that says which is which.
  const countByType = new Map<string, number>();
  for (const r of rows) {
    const t = String(r.entity_type ?? '');
    countByType.set(t, (countByType.get(t) ?? 0) + 1);
  }

  const copies: NoteCopy[] = [];
  for (const r of rows) {
    const entityType = String(r.entity_type ?? '');
    if ((countByType.get(entityType) ?? 0) > 1) continue;
    const label = String(r.label ?? '').trim();
    copies.push({
      id: Number(r.id),
      entityType,
      entityId: Number(r.entity_id),
      label: label || entityType || 'another record',
    });
  }

  // Most specific first, so the dialog lists the person before the show.
  const rank = (t: string) => (t === 'attendee' ? 1 : t === 'company' ? 2 : t === 'conference' ? 3 : 4);
  copies.sort((a, b) => rank(a.entityType) - rank(b.entityType) || a.id - b.id);

  return { found: true, copies };
}
